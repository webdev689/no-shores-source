//! The pace of play on foot measured for the band (`gear::band`): a level 1 player with the starting sword, held
//! whole, walking to the nearest foe standing and swinging every half second, clears a patrol zone's garrison, a
//! patrol's dungeon and an Elite Dungeon (its seals broken), but their Minibosses and Bosses, every foe set to the
//! player's level. A dungeon is walked as a passage zone under ground is (`passage::Walk`), the garrison's open ground
//! by the navmesh; a passage zone's deal is played to done in `deal_measure_tests`, by the same player. What it prints
//! is what `gear::band`'s times name. Run by hand, in release:
//! `cargo test -p room --release measure_the_pace -- --ignored --nocapture`.

use super::*;
use crate::RunOf;
use combat::arms::Stroke;
use combat::{CombatInput, Intent};
use gear::Difficulty;
use movement::Controls;
use std::collections::BTreeSet;

const SWORD: u32 = 2;
/// The longest one clear is let run: half an hour.
const LONGEST_TICKS: u32 = 60 * 1_800;
/// How near the player comes before swinging, inside a blow's 1.1 m so a foe that stands still is struck, metres;
/// and how often the way is found again, ticks.
pub(super) const REACH_M: f64 = 1.0;
const REPATH_TICKS: u32 = 15;
const ON_FOOT_TICKS: u32 = 15;
/// How near a way's next point a body comes before it makes for the one after, metres: a walk's square, or a
/// navmesh's corner, which may stand a few tenths of a metre past the last round a wall's end.
const AHEAD_M: f64 = 0.3;
/// How near its target a body makes straight for it while no solid or wall stands between, metres: a navmesh's way its
/// last 3 m, a walk's within a blow; round every corner till then.
const STRAIGHT_ON_MESH_M: f64 = 3.0;
const STRAIGHT_M: f64 = 2.0;
/// How far forward a body leans while it swings within reach, a share of a step, and how near its foe it stops
/// leaning (m): bodies pass through each other, and one that crept onto a foe standing still would lunge past it with
/// each swing and turn its blow after it, behind.
const FACE_FORWARD: f64 = 0.05;
const NO_NEARER_M: f64 = 0.6;
/// The player's health each tick, times its most: struck as hale, as at its most, and never felled by one tick's
/// blows however many land together, so it is held whole.
const HELD_HEALTH: f64 = 10.0;
/// A foe neither neared nor harmed in 20 s is out of the scripted player's reach (behind a wall it cannot path round,
/// on a ledge above, or in rock); it is given up, and its 20 s are not counted.
const GIVE_UP_TICKS: u32 = 60 * 20;

/// Every foe at level 1, its health and its shield as a level 1 foe's, its hurt counted afresh as a foe raised to its
/// level's is, so the player's blows land whole and the pace is the fight's.
pub(super) fn level_one(room: &mut Room) {
    for foe in room.foes.values_mut() {
        if foe.level > 1 {
            let times = gear::power::foe_health_times(1) / gear::power::foe_health_times(foe.level);
            foe.grow(times);
            if let Some(shield) = foe.shield.as_mut() {
                shield.left *= times;
                shield.most *= times;
            }
        }
        foe.level = 1;
    }
}

/// The scripted player in a room: their id, the way they walk and the ticks played.
pub(super) struct Walker {
    pub player: PlayerId,
    /// A passage zone's ground as a body walks it (`passage::Walk`), whose ways it takes; elsewhere the navmesh's.
    walk: Option<passage::Walk>,
    way: Vec<[f64; 2]>,
    pub ticks: u32,
}

impl Walker {
    pub(super) fn into(room: &mut Room, walk: Option<passage::Walk>) -> Self {
        Walker { player: room.join().expect("a room with space"), walk, way: Vec::new(), ticks: 0 }
    }

    /// One tick played: held whole, walking toward `there` until within `stop` of it, swinging every half second
    /// at it within a metre past `stop` when `swing`. In a passage zone the way is the walk's, square by square, found
    /// again each quarter second or as it runs out; elsewhere the navmesh's, corner by corner.
    pub(super) fn step(&mut self, room: &mut Room, there: [f64; 3], stop: f64, swing: bool) {
        self.steer(room, there, stop, swing);
        room.tick();
    }

    /// The input of one tick, as `step` plays it, left for the room's next tick: a company's walkers each steer, then
    /// the room ticks once.
    pub(super) fn steer(&mut self, room: &mut Room, there: [f64; 3], stop: f64, swing: bool) {
        let me = *room.fighter(self.player).expect("in");
        let apart = libm::hypot(there[0] - me.body.x, there[1] - me.body.y);
        let from = [me.body.x, me.body.y, me.body.z];
        if let Some(walk) = &self.walk {
            if self.ticks.is_multiple_of(ON_FOOT_TICKS) || self.way.is_empty() {
                let mut ways = walk.ways([from[0], from[1]], &[[there[0], there[1]]]);
                self.way = ways.pop().unwrap_or_default();
            }
        } else if self.ticks.is_multiple_of(REPATH_TICKS) {
            let way = room.mesh_at(there).find_path(from, there).unwrap_or_default();
            self.way = way.into_iter().map(|point| [point[0], point[1]]).collect();
        }
        while self.way.first().is_some_and(|point| libm::hypot(point[0] - me.body.x, point[1] - me.body.y) < AHEAD_M) {
            self.way.remove(0);
        }
        let chest = |at: [f64; 3]| [at[0], at[1], at[2] + combat::tuning::CHEST];
        let open = combat::sight::clear_line(&room.blocks, &room.floor, chest(from), chest(there));
        let straight = open && apart <= if self.walk.is_none() { STRAIGHT_ON_MESH_M } else { STRAIGHT_M };
        let toward = self.way.first().copied().filter(|_| !straight).unwrap_or([there[0], there[1]]);
        room.set_fighter(self.player, combat::fighter::Fighter { health: me.health_max * HELD_HEALTH, ..me });
        let attack = (swing && self.ticks.is_multiple_of(30) && apart < stop + 1.0).then_some(Stroke::Down);
        let yaw = combat::sight::bearing([me.body.x, me.body.y], [toward[0], toward[1]]);
        // A body turns only as it moves (`movement::step`): within reach a swing leans in a little, to face its foe.
        let forward = if apart > stop {
            1.0
        } else if swing && apart > NO_NEARER_M {
            FACE_FORWARD
        } else {
            0.0
        };
        // Running, as a player crosses a zone and chases a collector who runs.
        let controls = Controls { yaw, forward, run: true, ..Controls::default() };
        let input = Input {
            sequence: self.ticks + 1,
            intent: Intent { controls, combat: CombatInput { attack, ..CombatInput::default() } },
            arms: SWORD,
            seen: room.clock(),
            ..Input::default()
        };
        room.input(self.player, input).expect("in order");
        self.ticks += 1;
    }
}

/// Clears the foes a room stands as the player comes, nearest first, by `walk` where it is given (a dungeon's), else
/// by the navmesh: the foes felled, those given up and the seconds counted. A group that stands again is not cleared
/// again, and a Miniboss or a Boss is left, as the band times its fight by `measure_blows`.
fn clear_all(room: &mut Room, walk: Option<passage::Walk>) -> (usize, usize, f64) {
    level_one(room);
    let mut walker = Walker::into(room, walk);
    let great = |foe: &Foe| matches!(foe.brain.rank, ::foes::Rank::Miniboss | ::foes::Rank::Boss);
    let standing: BTreeSet<FighterId> = room.foes.iter().filter(|(_, foe)| !great(foe)).map(|(id, _)| *id).collect();
    let (mut felled, mut given_up) = (BTreeSet::new(), BTreeSet::new());
    let mut stalled = 0;
    // The foe walked to, the nearest it has been, its least health, and the tick either last fell.
    let mut chased: Option<(FighterId, f64, f64, u32)> = None;
    while walker.ticks < LONGEST_TICKS {
        level_one(room);
        let ticks = walker.ticks;
        let me = *room.fighter(walker.player).expect("in");
        let near = |foe: &Foe| libm::hypot(foe.fighter.body.x - me.body.x, foe.fighter.body.y - me.body.y);
        let alive = room
            .foes
            .iter()
            .filter(|(id, foe)| standing.contains(*id) && !foe.fighter.dead() && !given_up.contains(*id));
        let Some((&id, target)) = alive.min_by(|one, two| near(one.1).total_cmp(&near(two.1))) else { break };
        let (there, apart) = ([target.fighter.body.x, target.fighter.body.y, target.fighter.body.z], near(target));
        // Harm to its shield counts, which its health stands behind.
        let health = target.fighter.health + target.shield.map_or(0.0, |shield| shield.left);
        match chased {
            Some((was, best, least, _)) if was == id && (apart + 0.3 < best || health + 0.01 < least) => {
                chased = Some((id, apart.min(best), health.min(least), ticks));
            }
            Some((was, .., since)) if was == id && ticks - since > GIVE_UP_TICKS => {
                eprintln!("  given up: {:?} {apart:.1} m off, {:.1} m up", target.brain.rank, there[2] - me.body.z);
                given_up.insert(id);
                stalled += GIVE_UP_TICKS;
                chased = None;
                continue;
            }
            Some((was, ..)) if was == id => {}
            _ => chased = Some((id, apart, health, ticks)),
        }
        walker.step(room, there, REACH_M, true);
        let dead = room.foes.iter().filter(|(id, foe)| standing.contains(*id) && foe.fighter.dead());
        felled.extend(dead.map(|(id, _)| *id));
    }
    (felled.len(), given_up.len(), f64::from(walker.ticks.saturating_sub(stalled)) / 60.0)
}

/// A dungeon's ground as a body walks it, round its rock, its solids and the room's blocks, as a passage zone's under
/// ground is walked.
fn dungeon_walk(laid: &dungeon::Dungeon, room: &Room) -> passage::Walk {
    let blocks: Vec<[f64; 5]> =
        room.blocks.iter().map(|block| [block.min_x, block.min_y, block.max_x, block.max_y, block.top]).collect();
    passage::Walk::under(laid, &blocks)
}

fn row(name: &str, (felled, given_up, seconds): (usize, usize, f64)) {
    let each = if felled > 0 { seconds / felled as f64 } else { 0.0 };
    eprintln!("| {name} | {felled} | {given_up} | {seconds:.0} | {each:.1} |");
}

#[test]
#[ignore = "a measurement, printed by hand in release"]
fn measure_the_pace() {
    eprintln!("| Clear | Foes felled | Given up | Seconds | Seconds a foe |");
    for id in ["saltgrass-downs", "gullwing-vale", "driftwood-moors"] {
        let ring = vec![[-300.0, -300.0], [300.0, -300.0], [300.0, 300.0], [-300.0, 300.0]];
        let section = Section { ring, spawns: vec![[0.0, 180.0]], falls_kill: false };
        let mut room = Room::garrisoned(Floor::Flat, Vec::new(), section, NodeKind::Patrol, (id, Some((1, 1))));
        room.start_patrol(id, 0, &[]);
        row(&format!("Patrol garrison ({id})"), clear_all(&mut room, None));
    }
    for patrol in ["saltgrass-downs", "highwater-fells", "whitewind-tundra"] {
        assert!(gear::activities::island_of(patrol).is_some(), "{patrol} is a patrol zone that stands");
        for number in 0..dungeon::PER_PATROL {
            let Some(mut room) = Room::dungeon(patrol, number, Some((1, 1))) else { continue };
            let (seed, style) = dungeon::of_patrol(patrol, number);
            let laid = dungeon::Dungeon::forge(seed, style);
            // A walk under ground maps one storey: a deeper dungeon is left out of the measure.
            if laid.storeys > 1 {
                continue;
            }
            let walk = dungeon_walk(&laid, &room);
            row(&format!("Patrol dungeon ({patrol} {number})"), clear_all(&mut room, Some(walk)));
        }
    }
    for elite in gear::activities::elite_dungeons().take(6) {
        let of = RunOf::Elite { place: elite.id.to_owned() };
        let Some(mut room) = Room::dungeon_run(&of, Difficulty::Normal, 29_919_420) else { continue };
        crate::encounters::encounters_tests::unseal(&mut room);
        let (seed, style) = crate::elite_laid(elite.id).expect("its dungeon");
        let laid = dungeon::Dungeon::forge_within(seed, style, dungeon::ELITE_BLOCKS);
        if laid.storeys > 1 {
            continue;
        }
        let walk = dungeon_walk(&laid, &room);
        row(&format!("Elite Dungeon ({})", elite.id), clear_all(&mut room, Some(walk)));
    }
}

#[test]
fn the_bands_tables_are_the_rooms_and_the_passages_own() {
    use gear::band;
    assert_eq!(band::SEA_RANKS, crate::sighting::RANKS_BY_BAND, "the sea's ranks by band");
    for (rank, pieces) in crate::sighting::RANKS_AT_SEA.into_iter().zip(band::SEA_PIECES) {
        assert_eq!(crate::flotsam::pieces_of(rank) as f64, pieces, "{rank:?}'s pieces");
    }
    for depth in 1..=passage::DEPTHS {
        assert_eq!(band::passage_levels(band::PASSAGE_BAND, depth), passage::levels(band::PASSAGE_BAND, depth));
    }
    assert_eq!(band::DEPTHS, passage::DEPTHS);
    assert_eq!(passage::BAND_SPREAD_M, crate::garrison::SPREAD, "a band's spread round its post");
    assert_eq!(
        passage::island("continent-1").and_then(|_| gear::world::island_levels("continent-1")),
        Some(band::PASSAGE_BAND)
    );
    assert_eq!(band::STAND_AGAIN_SECONDS, (crate::garrison::STAND_AGAIN / 60) as f64);
    assert_eq!(band::RUN_M_A_SECOND, movement::TUNING.run);
    assert_eq!(band::GATHER_SECONDS, (crate::asks::GATHER_TICKS / 60) as f64);
    assert_eq!(band::EVENTS_AN_HOUR, (60 / crate::public::PERIOD_MINUTES) as f64);
    let ranks = crate::sighting::RANKS_AT_SEA;
    assert_eq!(ranks.map(crate::flotsam::foe_of), band::SEA_FOES, "the foe each rank at sea pays as");
}

#[test]
fn the_bands_passage_rosters_are_the_rooms() {
    let pays = |number: u8| {
        let role = ::foes::roster::foe_type(number).expect("a foe type").role;
        crate::power::worth_of(role as u8).expect("paid")
    };
    for depth in 1..=passage::DEPTHS {
        let (members, elites) = crate::passages::passage_foes::roster_of(depth);
        let members: Vec<_> = members.iter().map(|&(number, rank)| (pays(number), rank as u8)).collect();
        let elites: Vec<_> = elites.iter().map(|&number| pays(number)).collect();
        let (band_members, band_elites) = gear::band::passage_roster(depth);
        assert_eq!((members.as_slice(), elites.as_slice()), (band_members, band_elites), "depth {depth}");
    }
}
