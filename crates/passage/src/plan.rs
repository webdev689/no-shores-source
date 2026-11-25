//! A zone laid whole, as its room and every page stand it: its ground (the Forge's dungeon under ground, or a hollow
//! above it), its sites, and the passages' own pieces standing in it (the mouth behind, the onward mouths, the lamp,
//! and what its deal stands: dead lamps, tally posts, a reliquary, a vein's nodes, a Hold's ring), each with the
//! solids a body runs into.

use crate::hollow::{self, Hollow};
use crate::sites::Sites;
use crate::web::Web;
use crate::zone::{Deal, Ground as Drawn, Mission, Zone};
use dungeon::Dungeon;

/// How a zone's ground is laid.
#[derive(Clone, Debug)]
pub enum Ground {
    Under(Box<Dungeon>),
    Open(Box<Hollow>),
}

/// One of the passages' own pieces.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    WayIn,
    /// An onward mouth, by its place among the zone's.
    Mouth(u8),
    Lamp,
    /// A dead lamp of a Kindle, a tally post of a Sever, a node of a vein, by its number.
    Kindle(u8),
    Post(u8),
    Node(u8),
    Reliquary,
    /// A Hold's ring, `RING_M` round its middle, drawn on the floor and standing in no one's way.
    Ring,
}

/// How far round its middle a Hold's ring is held from (m).
pub const RING_M: f64 = 6.0;

impl Kind {
    /// The piece's name in the passages' pack and kit (tools/dungeon, content/islands/kits.json); a vein's node
    /// is the island's resource node, drawn as anywhere.
    #[must_use]
    pub fn module(self) -> &'static str {
        match self {
            Kind::WayIn => "passage.way-in",
            Kind::Mouth(_) => "passage.mouth.shut",
            Kind::Lamp => "passage.lamp",
            Kind::Kindle(_) => "passage.kindle",
            Kind::Post(_) => "passage.tally-post",
            Kind::Node(_) => "resource",
            Kind::Reliquary => "passage.reliquary",
            Kind::Ring => "passage.ring",
        }
    }

    /// What a body runs into round its middle, each (west, north, east, south, top) from its foot, its front to the
    /// north: the pieces' sizes, as the passages' Blender pieces are built to.
    #[must_use]
    pub fn solids(self) -> Vec<[f64; 5]> {
        let disc = |x: f64, y: f64, radius: f64, top: f64| [x - radius, y - radius, x + radius, y + radius, top];
        match self {
            Kind::Lamp => {
                let mut solids = vec![[-0.8, -0.8, 0.8, 0.8, 1.4]];
                solids.extend((0..5).map(|stone| {
                    let turn = core::f64::consts::TAU * f64::from(stone) / 5.0;
                    disc(3.5 * libm::sin(turn), -3.5 * libm::cos(turn), 0.5, 2.2)
                }));
                solids
            }
            // A shut mouth fills its opening; the way in is always shut.
            Kind::WayIn | Kind::Mouth(_) => vec![[-1.2, -0.4, 1.2, 0.4, 3.0]],
            Kind::Kindle(_) => vec![disc(0.0, 0.0, 0.25, 2.4)],
            Kind::Post(_) => vec![disc(0.0, 0.0, 0.35, 1.8)],
            Kind::Node(_) | Kind::Ring => Vec::new(),
            Kind::Reliquary => vec![[-0.7, -0.45, 0.7, 0.45, 0.9]],
        }
    }
}

/// A piece standing in a zone: its kind, its middle at its foot (x, y, z) and the way its front faces.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Piece {
    pub kind: Kind,
    pub at: [f64; 3],
    pub facing: f64,
}

/// How many times a zone is laid before the laying a body walks most of stands, though it cannot walk it all.
const WALK_TRIES: usize = 8;
/// How many of a deal's things stand in a zone.
pub const KINDLES: usize = 3;
pub const POSTS: usize = 3;
pub const NODES: usize = 6;
/// A Reckoning's collectors, each on a spot of its own (`room::passage_deal`).
pub const COLLECTORS: usize = 3;

/// How many spots a zone's deal needs: its things, and at least four for a hunt's round and a reckoning's runs.
pub(crate) fn spots_wanted(deal: Deal) -> usize {
    let things = match deal {
        Deal::Mission(Mission::Kindle) => KINDLES,
        Deal::Mission(Mission::Sever) => POSTS,
        Deal::Vein => NODES,
        _ => 1,
    };
    things.max(4)
}

/// A zone laid whole.
#[derive(Clone, Debug)]
pub struct Plan {
    pub zone: Zone,
    pub ground: Ground,
    pub sites: Sites,
    pub pieces: Vec<Piece>,
}

impl Plan {
    /// A zone of a web laid whole, or none for a number past its zones or a style the Forge does not know.
    #[must_use]
    pub fn of(web: &Web, number: u16) -> Option<Self> {
        let zone = web.zone_of(number)?.clone();
        let onward = zone.onward.len();
        let laid = |ground: Ground, sites: Sites| {
            let mut plan = Plan { zone: zone.clone(), ground, sites, pieces: Vec::new() };
            plan.pieces = plan.stand_pieces();
            plan
        };
        // Laid again, up to WALK_TRIES times, until a body walks to everything it asks; else the laying that misses
        // fewest, the first of those.
        let layings: Box<dyn Iterator<Item = Plan>> = match &zone.ground {
            Drawn::Under { style } => Box::new(
                crate::under::layings(&zone, style, onward)?
                    .map(|(dungeon, sites)| laid(Ground::Under(Box::new(dungeon)), sites)),
            ),
            Drawn::Open { form } => Box::new(
                hollow::layings(&zone, *form, &web.island.climate, onward)
                    .map(|(hollow, sites)| laid(Ground::Open(Box::new(hollow)), sites)),
            ),
        };
        let mut best: Option<(usize, Plan)> = None;
        for plan in layings.take(WALK_TRIES) {
            let missed = plan.unwalked();
            if missed == 0 {
                return Some(plan);
            }
            if best.as_ref().is_none_or(|(fewest, _)| missed < *fewest) {
                best = Some((missed, plan));
            }
        }
        best.map(|(_, plan)| plan)
    }

    /// How many of the things a body must walk to (`wanted`) it cannot from the arrival (`walk.rs`), and one more for a
    /// zone with no post for its foes.
    pub(crate) fn unwalked(&self) -> usize {
        usize::from(self.sites.posts.is_empty()) + self.walk().missed(self.sites.arrive, &self.wanted())
    }

    /// What a body must walk to within its reach: every onward mouth, the lamp and every spot within use, every post
    /// and a Reckoning's collectors' spots, where foes stand, within a blow.
    #[must_use]
    pub fn wanted(&self) -> Vec<([f64; 2], f64)> {
        let sites = &self.sites;
        let (far, blow) = (crate::walk::USE_M, crate::walk::BLOW_M);
        let collectors = if self.zone.deal == Deal::Mission(Mission::Reckoning) { COLLECTORS } else { 0 };
        let mouths = sites.onward.iter().map(|door| (door.at, far));
        let spots = sites.lamp.iter().map(|&at| (at, far));
        let spots = spots
            .chain(sites.spots.iter().enumerate().map(|(nth, &at)| (at, if nth < collectors { blow } else { far })));
        mouths.chain(spots).chain(sites.posts.iter().map(|&at| (at, blow))).collect()
    }

    /// The zone's ground as a body walks it, round every piece's solids.
    #[must_use]
    pub fn walk(&self) -> crate::walk::Walk {
        let solids = self.piece_solids();
        match &self.ground {
            Ground::Under(dungeon) => crate::walk::Walk::under(dungeon, &solids),
            Ground::Open(hollow) => {
                let pieces = solids.iter().map(|&[min_x, min_y, max_x, max_y, top]| movement::Block {
                    min_x,
                    min_y,
                    max_x,
                    max_y,
                    top,
                    bottom: self.floor_at([(min_x + max_x) / 2.0, (min_y + max_y) / 2.0]) - 0.5,
                });
                let blocks: Vec<movement::Block> = hollow.blocks.iter().copied().chain(pieces).collect();
                crate::walk::Walk::open(&hollow.ground, &blocks, &hollow.ring)
            }
        }
    }

    /// The height of the floor at a point.
    #[must_use]
    pub fn floor_at(&self, at: [f64; 2]) -> f64 {
        match &self.ground {
            Ground::Under(_) => dungeon::FLOOR_M,
            Ground::Open(hollow) => hollow::floor_at(hollow, at),
        }
    }

    /// The pieces: the way in and the onward mouths where the sites put them, the lamp at its middle facing the way
    /// in, and the deal's things on the spots, the farthest from the way in first.
    fn stand_pieces(&self) -> Vec<Piece> {
        let sites = &self.sites;
        let on_floor =
            |kind: Kind, at: [f64; 2], facing: f64| Piece { kind, at: [at[0], at[1], self.floor_at(at)], facing };
        let mut pieces = vec![on_floor(Kind::WayIn, sites.way_in.at, sites.way_in.facing)];
        for (number, door) in sites.onward.iter().enumerate() {
            pieces.push(on_floor(Kind::Mouth(u8::try_from(number).unwrap_or(u8::MAX)), door.at, door.facing));
        }
        if let Some(lamp) = sites.lamp {
            let facing = libm::atan2(sites.arrive[0] - lamp[0], -(sites.arrive[1] - lamp[1]));
            pieces.push(on_floor(Kind::Lamp, lamp, facing));
        }
        let mut spots = sites.spots.iter().copied();
        let mut take = |count: usize, kind: fn(u8) -> Kind, pieces: &mut Vec<Piece>| {
            for (number, at) in spots.by_ref().take(count).enumerate() {
                pieces.push(on_floor(kind(u8::try_from(number).unwrap_or(u8::MAX)), at, 0.0));
            }
        };
        match self.zone.deal {
            Deal::Mission(Mission::Kindle) => take(KINDLES, Kind::Kindle, &mut pieces),
            Deal::Mission(Mission::Sever) => take(POSTS, Kind::Post, &mut pieces),
            Deal::Vein => take(NODES, Kind::Node, &mut pieces),
            Deal::Reliquary => take(1, |_| Kind::Reliquary, &mut pieces),
            Deal::Mission(Mission::Hold) => take(1, |_| Kind::Ring, &mut pieces),
            _ => {}
        }
        pieces
    }

    /// Every piece's solids in the zone's frame, turned with it, each (west, north, east, south, top).
    #[must_use]
    pub fn piece_solids(&self) -> Vec<[f64; 5]> {
        let mut solids = Vec::new();
        for piece in &self.pieces {
            let (sine, cosine) = (libm::sin(piece.facing), libm::cos(piece.facing));
            for [west, north, east, south, top] in piece.kind.solids() {
                // A box turned is held as the square round its turned corners.
                let corners = [[west, north], [east, north], [east, south], [west, south]]
                    .map(|[x, y]| [piece.at[0] + x * cosine - y * sine, piece.at[1] + x * sine + y * cosine]);
                let fold = |pick: fn(f64, f64) -> f64, axis: usize, start: f64| {
                    corners.iter().map(|corner| corner[axis]).fold(start, pick)
                };
                solids.push([
                    fold(f64::min, 0, f64::MAX),
                    fold(f64::min, 1, f64::MAX),
                    fold(f64::max, 0, f64::MIN),
                    fold(f64::max, 1, f64::MIN),
                    piece.at[2] + top,
                ]);
            }
        }
        solids
    }
}
