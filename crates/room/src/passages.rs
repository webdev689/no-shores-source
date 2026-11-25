//! A passage zone as a room: its ground laid as the `passage` crate lays it (under ground the Forge's dungeon, above
//! ground the hollow's heights), its section and spawn at the sites' arrival, its blocks (the hollow's dressing and
//! every piece's solids), its navmesh, and its foes: bands of the Grey Tithe on the sites' posts at the zone's levels
//! (`passage::levels`), Elites among them by depth, a vault's Miniboss in its end room as a dungeon's Reeve stands.
//! Its deal is run each tick (`passage_deal.rs`), its asks answered in turn (`passage_asks.rs`), and the week's two
//! modifiers and the zone's currents weigh its fight through the runs' hooks (`run.rs`). A patrol zone with passages
//! keeps its mouths here too: the doors of its runs, where a dive begins.

use crate::garrison::{Group, draws_of, index, node_seed, ring_bounds};
use crate::run::Run;
use crate::{Floor, PlayerId, Room};
use ::foes::Rank::{self, Elite, Major, Miniboss, Minor};
use ::foes::roster::{COLLECTOR, CROSSBOWMAN, ENFORCER, MARKSMAN, REEVE, RUNNER};
use combat::fighter::FighterId;
use gear::activities::Modifier;
use gear::dive::Route;
use movement::Block;
use naval::random::Mulberry32;
use passage::{Current, Deal, Laid, Mission, Piece, PieceKind, Plan, Sites};
use reach::Section;
use std::collections::{BTreeMap, BTreeSet};

/// The bands' foes, as a patrol's: Minors and Majors of the Tithe's walkers, collectors and crossbowmen.
const BANDS: [(u8, Rank); 6] = [
    (RUNNER, Minor),
    (RUNNER, Major),
    (COLLECTOR, Minor),
    (COLLECTOR, Major),
    (CROSSBOWMAN, Minor),
    (CROSSBOWMAN, Major),
];
/// An Elite standing in a band, by turns.
const ELITES: [u8; 2] = [ENFORCER, MARKSMAN];
/// The most foes a zone stands at once, its bands and its waves together, so one player does its deal in about three
/// minutes (`deal_measure_tests`) and a lamp comes about every fifteen.
pub(crate) const ZONE_FOES_MOST: usize = 9;
/// The stream a zone's bands are drawn on, apart from its waves'.
const BAND_STREAM: u64 = 0x7061_7373;

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
}

/// A passage zone's room's own: its web's island, week and route, the zone, its levels, sites and pieces, the deal's
/// round, the players its lamp is lit for, the holds under way, and those counted as having gathered its vein.
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
    pub lit: BTreeSet<PlayerId>,
    pub holds: BTreeMap<PlayerId, Hold>,
    /// The tick each player came into the zone, which a Gauntlet's time runs from.
    pub arrived: BTreeMap<PlayerId, u64>,
    pub veined: BTreeSet<PlayerId>,
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
        room.foes_most = ZONE_FOES_MOST;
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
            lit: BTreeSet::new(),
            holds: BTreeMap::new(),
            arrived: BTreeMap::new(),
            veined: BTreeSet::new(),
        })));
        if let (Deal::Vault, Laid::Under(dungeon)) = (zone.deal, &plan.ground) {
            // shortcut: Crowded and Veteran weigh the passages' own bands, not a vault's dungeon garrison; extend the
            // dungeon's garrison stand if a vault should take them.
            room.stand_dungeon_garrison(dungeon, Some(levels), (REEVE, Miniboss));
            room.cache = None;
        } else {
            room.stand_bands(levels);
        }
        let guards: Vec<usize> = (0..room.garrison.len()).collect();
        room.harden(&guards);
        if let Some(zone) = room.zone_mut() {
            zone.round.guards = guards;
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

    /// The bands on the sites' posts, as many as the room's most foes allow: a lamp's guard as the design gives it
    /// (an Elite band at the first lamp, a Miniboss and an Elite band at the second and third, a Miniboss and two Elite
    /// bands at the fourth); any other zone's a band of Minors and Majors on each post, from depth 6 one band in three
    /// led by an Elite and from depth 11 every band; none for a deal whose foes come in waves alone.
    fn stand_bands(&mut self, levels: (u8, u8)) {
        let Some(zone) = self.zone() else { return };
        let (deal, depth, posts) = (zone.zone.deal, zone.zone.depth, zone.sites.posts.clone());
        let lamp = passage::lamp_number(depth);
        let mut draws = draws_of(self.world_seed ^ BAND_STREAM);
        let mut groups: Vec<Group> = match (deal, lamp) {
            (Deal::Lamp, Some(1)) => vec![self.band(&mut draws, depth, Some(true))],
            (Deal::Lamp, Some(number)) => {
                let boss = Group { members: vec![(REEVE, Miniboss)], leads: false, farthest: true };
                let elites = if number >= 4 { 2 } else { 1 };
                core::iter::once(boss).chain((0..elites).map(|_| self.band(&mut draws, depth, Some(true)))).collect()
            }
            (Deal::Mission(Mission::Kindle | Mission::Hold | Mission::Ambush), _) => Vec::new(),
            _ => (0..posts.len()).map(|nth| self.band(&mut draws, depth, (nth % 3 == 0).then_some(false))).collect(),
        };
        if deal == Deal::Mission(Mission::Hunt) {
            // The marked band walks a round of the spots; the rest hold their posts.
            if let Some(first) = groups.first_mut() {
                first.farthest = false;
                if let Some(leader) = first.members.first_mut() {
                    *leader = (ELITES[0], Elite);
                }
            }
        }
        let section = self.section.clone().map(|section| Section { spawns: Vec::new(), ..section });
        let Some(section) = section else { return };
        let spots: Vec<(f64, f64)> =
            self.zone().map(|zone| zone.sites.spots.iter().map(|at| (at[0], at[1])).collect()).unwrap_or_default();
        let mut beats = draws_of(self.world_seed ^ BAND_STREAM ^ 1);
        let mut standing = 0;
        let near_lamp = self.zone().and_then(|zone| zone.sites.lamp);
        for (nth, group) in groups.iter().enumerate() {
            let at = match (nth, near_lamp) {
                (0, Some(lamp)) if deal == Deal::Lamp => lamp,
                _ => posts.get(nth).copied().unwrap_or(posts.first().copied().unwrap_or_default()),
            };
            if standing + group.members.len() > self.foes_most {
                break;
            }
            let lattice: &[(f64, f64)] = if group.farthest { &[] } else { &spots };
            let at = if nth == 0 && deal == Deal::Lamp { [at[0] + 4.5, at[1]] } else { at };
            if let Some(post) = self.post_at(group, (at[0], at[1]), (&section, lattice), (&mut draws, &mut beats)) {
                standing += post.members.len();
                self.garrison.push(post);
            }
        }
        self.gird_and_stand(Some(levels));
    }

    /// A band of the Tithe at a depth: two to four of the patrol's, one or two more where Crowded runs, Veteran's share
    /// of its Minors standing as Majors, and led by an Elite where `elite` says (an Elite band, led and its rest
    /// Elites too, for Some(true)), or as its depth makes it (from 6 one band in three, from 11 every band).
    fn band(&self, draws: &mut Mulberry32, depth: u8, elite: Option<bool>) -> Group {
        let size = 2 + index(draws, 3) + self.crowding(depth);
        let veteran = self.current(Current::Veteran).map_or(0.0, |strength| passage::zone::VETERAN * strength);
        let mut members: Vec<(u8, Rank)> = (0..size)
            .map(|_| {
                let (number, rank) = BANDS[index(draws, BANDS.len())];
                let raised = rank == Minor && draws.draw() < veteran;
                (number, if raised { Major } else { rank })
            })
            .collect();
        let led = match elite {
            Some(true) => true,
            Some(false) => depth >= 6,
            None => depth >= 11,
        };
        if led {
            let elite_type = ELITES[index(draws, ELITES.len())];
            members[0] = (elite_type, Elite);
            if elite == Some(true) {
                members.truncate(3);
                for member in members.iter_mut().skip(1) {
                    member.1 = Elite;
                }
            }
        }
        Group { members, leads: false, farthest: true }
    }

    /// How many more foes Crowded stands in each band: one, two past depth 14.
    fn crowding(&self, depth: u8) -> usize {
        match self.current(Current::Crowded) {
            Some(_) if depth > 14 => 2,
            Some(_) => 1,
            None => 0,
        }
    }

    /// Hardened's share more health on every foe standing at these garrison posts, as they stand.
    pub(crate) fn harden(&mut self, posts: &[usize]) {
        let Some(strength) = self.current(Current::Hardened) else { return };
        let standing: Vec<FighterId> =
            posts.iter().filter_map(|&post| self.garrison.get(post)).flat_map(|post| post.standing.clone()).collect();
        for id in standing {
            if let Some(foe) = self.foes.get_mut(&id) {
                foe.grow(1.0 + passage::zone::HARDENED * strength);
            }
        }
    }

    /// A foe stood for the deal outside its bands (a wave's, a target's), at the zone's levels and the currents' weight.
    pub(crate) fn stand_deal_foe(
        &mut self,
        (number, rank): (u8, Rank),
        at: [f64; 2],
        facing: f64,
        nth: u32,
    ) -> Option<FighterId> {
        let levels = self.zone()?.levels;
        let ground = [at[0], at[1], self.floor.height_at(at[0], at[1])];
        let place = self.mesh_at(ground).nearest_point(ground).unwrap_or(ground);
        let id = self.stand_foe(::foes::foe_type(number)?, rank, place, facing, None);
        let (level, shield) =
            crate::garrison::gird_of(self.world_seed ^ BAND_STREAM ^ 2, nth, Some(levels), self.shield_chance());
        self.gird(id, self.at_seas(level), shield);
        if let Some(strength) = self.current(Current::Hardened)
            && let Some(foe) = self.foes.get_mut(&id)
        {
            foe.grow(1.0 + passage::zone::HARDENED * strength);
        }
        self.foes.get_mut(&id)?.brain.posted_at(place, facing);
        Some(id)
    }
}

use movement::Terrain;

#[path = "passage_asks.rs"]
mod passage_asks;
#[path = "passage_deal.rs"]
mod passage_deal;
pub use passage_asks::{PassageAsk, PassageSeen};

#[cfg(test)]
#[path = "passage_reach_tests.rs"]
mod passage_reach_tests;
#[cfg(test)]
#[path = "passages_tests.rs"]
mod passages_tests;
