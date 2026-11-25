//! A passage zone as a room: its ground laid as the `passage` crate lays it (under ground the Forge's dungeon, above
//! ground the hollow's heights), its section and spawn at the sites' arrival, its blocks (the hollow's dressing and
//! every piece's solids), its navmesh, and its foes: bands of the Grey Tithe on the sites' posts at the zone's levels
//! (`passage::levels`), the depth's roster and Elites among them (`passage_foes.rs`), a vault's Miniboss in its end
//! room as a dungeon's Reeve stands.
//! Its deal is run each tick (`passage_deal.rs`), its asks answered in turn (`passage_asks.rs`), and the week's two
//! modifiers and the zone's currents weigh its fight through the runs' hooks (`run.rs`). A patrol zone with passages
//! keeps its mouths here too: the doors of its runs, where a dive begins.

use crate::garrison::{node_seed, ring_bounds};
use crate::run::Run;
use crate::{Floor, PlayerId, Room};
use combat::fighter::FighterId;
use gear::activities::Modifier;
use gear::dive::Route;
use movement::Block;
use passage::{Current, Deal, Laid, Piece, PieceKind, Plan, Sites};
use reach::Section;
use std::collections::{BTreeMap, BTreeSet};

/// The streams a zone's bands and its waves are drawn on, apart.
const BAND_STREAM: u64 = 0x7061_7373;
const WAVE_STREAM: u64 = 0x7761_7665;

/// A hold of E under way at a piece: its target (a dead lamp's number, or the lamp), the tick it began, where the
/// body stood and its health then.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Hold {
    pub target: Held,
    pub since: u64,
    pub at: [f64; 2],
    pub health: f64,
}

/// What a hold is at.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Held {
    Kindle(u8),
    Reliquary,
    Lamp,
}

/// Where a deal stands in its round: when it began and was done, its guards' posts, and its mission's progress (the
/// dead lamps lit; the targets standing, a hunt's marked band's, a reckoning's collectors, a sever's tally posts; the
/// collectors found; the ticks the ring was held; the waves called and those standing; whether the far mouth was
/// reached, and whether late), and who took part.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Round {
    pub number: u32,
    pub began: Option<u64>,
    pub done_at: Option<u64>,
    pub guards: Vec<usize>,
    pub lit: Vec<bool>,
    pub targets: Vec<FighterId>,
    pub found: Vec<bool>,
    pub held: u64,
    pub waves: u8,
    pub wave_foes: Vec<FighterId>,
    pub reached: bool,
    pub late: bool,
    /// The players who took part: struck down one of its foes, lit a dead lamp, held the ring or reached the far
    /// mouth. Only they are paid its cache.
    pub took_part: BTreeSet<PlayerId>,
    /// A Gauntlet's runners who stood at the arrival in this round, whose reaching the far mouth counts.
    pub set_out: BTreeSet<PlayerId>,
    /// Whether a reliquary was opened, and a vein's nodes gathered, by their numbers.
    pub opened: bool,
    pub gathered: BTreeSet<u8>,
}

/// A passage zone's room's own: its web's island, week and route, the zone, its levels, sites and pieces, the deal's
/// round, the holds under way, and those counted as having gathered its vein.
#[derive(Debug)]
pub(crate) struct Zone {
    pub island: &'static str,
    pub week: u64,
    pub route: Route,
    pub zone: passage::Zone,
    pub levels: (u8, u8),
    pub sites: Sites,
    pub pieces: Vec<Piece>,
    pub round: Round,
    pub holds: BTreeMap<PlayerId, Hold>,
    /// The tick each player came into the zone, which a Gauntlet's time runs from.
    pub arrived: BTreeMap<PlayerId, u64>,
    pub veined: BTreeSet<PlayerId>,
    /// The bands the zone's most foes held back, each its foes, whether it holds its post, and its post, stood in turn
    /// once there is room.
    pub held: Vec<(Vec<(u8, ::foes::Rank)>, bool, [f64; 2])>,
    /// The most players seen in the zone at once, whom its Minibosses and Bosses stand toughened for.
    pub most_seen: usize,
}

/// How far before a mouth's door a player home from a lamp stands, metres.
const BEFORE_MOUTH_M: f64 = 2.0;

/// What the room keeps of the passages: a passage zone's, or a patrol zone's mouths (its island and its runs' doors,
/// in the island's mouths' order).
#[derive(Debug)]
pub(crate) enum Passage {
    Zone(Box<Zone>),
    Mouths { island: &'static str, doors: Vec<[f64; 2]>, fronts: Vec<[f64; 2]> },
}

/// The island's continent's id as the world keeps it, for the feats a room counts.
fn island_named(island: &str) -> Option<&'static str> {
    gear::activities::ISLAND_PLACES.iter().find(|place| place.continent == island).map(|place| place.continent)
}

/// A piece's solids as blocks a body runs into, standing on its floor.
fn piece_blocks(plan: &Plan) -> Vec<Block> {
    let floor = |solid: &[f64; 5]| plan.floor_at([(solid[0] + solid[2]) / 2.0, (solid[1] + solid[3]) / 2.0]);
    let solids = plan.piece_solids();
    let block = |solid: &[f64; 5]| Block {
        min_x: solid[0],
        min_y: solid[1],
        max_x: solid[2],
        max_y: solid[3],
        top: solid[4],
        bottom: floor(solid) - 0.5,
    };
    solids.iter().map(block).collect()
}

/// A zone's ground as its room stands bodies on it, and a page predicts them on it: under ground the Forge's dungeon
/// floor (its walls and jambs its own) and the pieces' solids; above ground the hollow's heights, its dressing's
/// blocks and the pieces' solids; and its section's ring. None where the dungeon's floor cannot be made.
#[must_use]
pub fn passage_ground(plan: &Plan) -> Option<(Floor, Vec<Block>, Vec<[f64; 2]>)> {
    let (floor, mut blocks, ring) = match &plan.ground {
        Laid::Under(dungeon) => {
            let (width, depth) = (dungeon.columns as f64 * dungeon::CELL_M, dungeon.rows as f64 * dungeon::CELL_M);
            (Floor::of_dungeon(dungeon)?, Vec::new(), vec![[0.0, 0.0], [width, 0.0], [width, depth], [0.0, depth]])
        }
        Laid::Open(hollow) => {
            (Floor::Island(Box::new(hollow.ground.clone())), hollow.blocks.clone(), hollow.ring.clone())
        }
    };
    blocks.extend(piece_blocks(plan));
    Some((floor, blocks, ring))
}

impl Room {
    /// A passage zone's room from its plan: its island's band of foe levels (raised by depth, `passage::levels`), the
    /// week's two modifiers on its passages, and its route. None where its ground cannot be made or its island is no
    /// world's.
    #[must_use]
    pub fn passage(
        plan: &Plan,
        band: (u8, u8),
        modifiers: [Modifier; 2],
        (island, week, route): (&str, u64, Route),
    ) -> Option<Self> {
        let island = island_named(island)?;
        let sites = &plan.sites;
        let (floor, blocks, ring) = passage_ground(plan)?;
        let section = Section { ring, spawns: vec![sites.arrive], falls_kill: false };
        let arrive = (sites.arrive[0], sites.arrive[1]);
        let mut room = if matches!(plan.ground, Laid::Under(_)) {
            Self::node(floor, blocks, section)
        } else {
            let nav = navmesh::NavMesh::bake_on(&blocks, &floor, ring_bounds(&section.ring), &navmesh::AGENT);
            Self::on(floor, blocks, vec![arrive], Some(section), nav)
        };
        let zone = &plan.zone;
        room.facing = sites.facing;
        room.place = Some(gear::gate::Place::Passage);
        room.world_seed = node_seed(&format!("passage:{island}:{week}:{}", zone.number)) ^ zone.seed;
        room.run = Some(Run { modifiers: modifiers.to_vec(), ..Run::default() });
        room.source = if matches!(plan.ground, Laid::Under(_)) { gear::Source::Dungeon } else { gear::Source::World };
        room.island = Some(island);
        let levels = passage::levels(band, zone.depth);
        room.passage = Some(Passage::Zone(Box::new(Zone {
            island,
            week,
            route,
            zone: zone.clone(),
            levels,
            sites: sites.clone(),
            pieces: plan.pieces.clone(),
            round: Round::default(),
            holds: BTreeMap::new(),
            arrived: BTreeMap::new(),
            veined: BTreeSet::new(),
            held: Vec::new(),
            most_seen: 1,
        })));
        room.foes_most = room.zone_foes_most();
        if let (Deal::Vault, Laid::Under(dungeon)) = (zone.deal, &plan.ground) {
            // shortcut: Crowded and Veteran weigh the passages' own bands, not a vault's dungeon garrison; extend the
            // dungeon's garrison stand if a vault should take them.
            room.stand_dungeon_garrison(dungeon, Some(levels), passage_foes::vault_miniboss(zone.depth));
            room.cache = None;
            let guards: Vec<usize> = (0..room.garrison.len()).collect();
            room.harden(&guards);
            if let Some(zone) = room.zone_mut() {
                zone.round.guards = guards;
            }
        } else {
            room.stand_bands(levels);
        }
        room.lay_deal();
        if zone.deal == Deal::Vein {
            let resources = &gear::catalogue::catalogue().resources;
            let found = resources.iter().position(|resource| resource.continent == island);
            let resource = found.and_then(|at| u8::try_from(at).ok()).unwrap_or(0);
            let nodes = plan.pieces.iter().filter(|piece| matches!(piece.kind, PieceKind::Node(_)));
            room.resource_nodes =
                nodes.map(|piece| crate::ResourceNode { x: piece.at[0], y: piece.at[1], resource }).collect();
        }
        Some(room)
    }

    /// A patrol zone's mouths into its island's passages: the doors of its runs, in the island's mouths' order, each
    /// with the point its run's end arena lies toward, where a player home from a lamp stands before it.
    pub fn open_mouths(&mut self, island: &str, mouths: Vec<([f64; 2], [f64; 2])>) -> bool {
        let Some(island) = island_named(island) else { return false };
        let front = |(door, toward): ([f64; 2], [f64; 2])| {
            let (east, south) = (toward[0] - door[0], toward[1] - door[1]);
            let length = libm::hypot(east, south);
            if length < 1e-6 {
                return door;
            }
            [door[0] + east / length * BEFORE_MOUTH_M, door[1] + south / length * BEFORE_MOUTH_M]
        };
        let fronts = mouths.iter().copied().map(front).collect();
        let doors = mouths.into_iter().map(|(door, _)| door).collect();
        self.passage = Some(Passage::Mouths { island, doors, fronts });
        true
    }

    /// Stands a player come home from a lamp of `island`'s passages before the mouth numbered `mouth`, facing away
    /// from its door, where this room holds that island's mouths.
    pub(crate) fn stand_before_mouth(&mut self, player: PlayerId, island: &str, mouth: u8) {
        let Some(Passage::Mouths { island: here, doors, fronts }) = self.passage.as_ref() else { return };
        let (Some(&door), Some(&[x, y])) = (doors.get(usize::from(mouth)), fronts.get(usize::from(mouth))) else {
            return;
        };
        if *here != island {
            return;
        }
        let facing = libm::atan2(x - door[0], -(y - door[1]));
        let body = movement::Body { facing, ..crate::standing_on(&self.floor, &self.blocks, x, y) };
        if let Some(found) = self.players.get_mut(&player) {
            found.fighter.body = body;
        }
    }

    /// The passage zone's own, when this room is one.
    pub(crate) fn zone(&self) -> Option<&Zone> {
        match self.passage.as_ref() {
            Some(Passage::Zone(zone)) => Some(zone),
            _ => None,
        }
    }

    pub(crate) fn zone_mut(&mut self) -> Option<&mut Zone> {
        match self.passage.as_mut() {
            Some(Passage::Zone(zone)) => Some(zone),
            _ => None,
        }
    }

    /// The zone's currents' strength, if it runs `current`.
    pub(crate) fn current(&self, current: Current) -> Option<f64> {
        let zone = self.zone()?;
        zone.zone.currents.contains(&current).then(|| passage::strength(zone.zone.depth))
    }

    /// Whether the zone is dark, as Gloom makes it while its deal is not done.
    pub(crate) fn gloomy(&self) -> bool {
        self.current(Current::Gloom).is_some() && self.zone().is_some_and(|zone| zone.round.done_at.is_none())
    }
}

#[path = "passage_asks.rs"]
mod passage_asks;
#[path = "passage_deal.rs"]
mod passage_deal;
#[path = "passage_foes.rs"]
mod passage_foes;
#[path = "passage_holds.rs"]
mod passage_holds;
pub use passage_asks::{PassageAsk, PassageSeen};

#[cfg(test)]
#[path = "passage_play_tests.rs"]
mod passage_play_tests;
#[cfg(test)]
#[path = "passage_reach_tests.rs"]
mod passage_reach_tests;
#[cfg(test)]
#[path = "passages_tests.rs"]
mod passages_tests;
