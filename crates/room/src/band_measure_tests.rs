//! The pace of play on foot measured for the band (`gear::band`): a level 1 player with the starting sword, held
//! whole, walking the navmesh to the nearest foe standing and swinging every half second, clears a patrol zone's
//! garrison, a patrol's dungeon and an Elite Dungeon (its seals broken), every foe set to the player's level; a passage
//! zone's deal is played to done in `deal_measure_tests`. What it prints is what `gear::band`'s times name. Run by
//! hand, in release:
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
/// How near the player comes before swinging, metres, and how often the way is found again, ticks.
const REACH_M: f64 = 1.6;
const REPATH_TICKS: u32 = 15;
const ON_FOOT_TICKS: u32 = 60;
/// How far forward a body leans while it swings within reach, a share of a step.
const FACE_FORWARD: f64 = 0.05;
/// A foe neither neared nor harmed in 20 s is out of the scripted player's reach (behind a wall it cannot path round,
/// on a ledge above, or in rock); it is given up, and its 20 s are not counted.
const GIVE_UP_TICKS: u32 = 60 * 20;

/// Every foe at level 1, its health as a level 1 foe's, so the player's blows land whole and the pace is the fight's.
pub(super) fn level_one(room: &mut Room) {
    for foe in room.foes.values_mut() {
        let times = gear::power::foe_health_times(1) / gear::power::foe_health_times(foe.level.max(1));
        foe.fighter.health *= times;
        foe.fighter.health_max *= times;
        foe.level = 1;
    }
}

/// The scripted player in a room: their id, the way they walk and the ticks played.
pub(super) struct Walker {
    pub player: PlayerId,
    way: Vec<[f64; 3]>,
    pub ticks: u32,
}

impl Walker {
    pub(super) fn into(room: &mut Room) -> Self {
        Walker { player: room.join().expect("a room with space"), way: Vec::new(), ticks: 0 }
    }

    /// One tick played: held whole, walking toward `there` until within `stop` of it, swinging every half second
    /// at it within a metre past `stop` when `swing`. The way is found on the navmesh, or in a passage zone on foot each second,
    /// as its navmesh is coarser than a body under ground.
    pub(super) fn step(&mut self, room: &mut Room, there: [f64; 3], stop: f64, swing: bool) {
        let me = *room.fighter(self.player).expect("in");
        let apart = libm::hypot(there[0] - me.body.x, there[1] - me.body.y);
        let from = [me.body.x, me.body.y, me.body.z];
        if room.zone().is_some() {
            if self.ticks % ON_FOOT_TICKS == 0 {
                let way = crate::passages::passage_reach_tests::on_foot(room, [from[0], from[1]], [there[0], there[1]]);
                self.way = way.unwrap_or_default();
            }
        } else if self.ticks % REPATH_TICKS == 0 {
            self.way = room.mesh_at(there).find_path(from, there).unwrap_or_default();
        }
        while self.way.first().is_some_and(|point| libm::hypot(point[0] - me.body.x, point[1] - me.body.y) < 1.0) {
            self.way.remove(0);
        }
        let toward = self.way.first().copied().filter(|_| apart > 3.0).unwrap_or(there);
        room.set_fighter(self.player, combat::fighter::Fighter { health: me.health_max, ..me });
        let attack = (swing && self.ticks % 30 == 0 && apart < stop + 1.0).then_some(Stroke::Down);
        let yaw = combat::sight::bearing([me.body.x, me.body.y], [toward[0], toward[1]]);
        // A body turns only as it moves (`movement::step`): within reach a swing leans in a little, to face its foe.
        let forward = if apart > stop {
            1.0
        } else if swing {
            FACE_FORWARD
        } else {
            0.0
        };
        let controls = Controls { yaw, forward, ..Controls::default() };
        let input = Input {
            sequence: self.ticks + 1,
            intent: Intent { controls, combat: CombatInput { attack, ..CombatInput::default() } },
            arms: SWORD,
            seen: room.clock(),
            ..Input::default()
        };
        room.input(self.player, input).expect("in order");
        room.tick();
        self.ticks += 1;
    }
}

fn clear_all(room: &mut Room) -> (usize, usize, f64) {
    level_one(room);
    let mut walker = Walker::into(room);
    let (mut felled, mut given_up) = (BTreeSet::new(), BTreeSet::new());
    let mut stalled = 0;
    // The foe walked to, the nearest it has been, its least health, and the tick either last fell.
    let mut chased: Option<(FighterId, f64, f64, u32)> = None;
    while walker.ticks < LONGEST_TICKS {
        level_one(room);
        let ticks = walker.ticks;
        let me = *room.fighter(walker.player).expect("in");
        let near = |foe: &Foe| libm::hypot(foe.fighter.body.x - me.body.x, foe.fighter.body.y - me.body.y);
        let alive = room.foes.iter().filter(|(id, foe)| !foe.fighter.dead() && !given_up.contains(*id));
        let Some((&id, target)) = alive.min_by(|one, two| near(one.1).total_cmp(&near(two.1))) else { break };
        let (there, apart) = ([target.fighter.body.x, target.fighter.body.y, target.fighter.body.z], near(target));
        let health = target.fighter.health;
        match chased {
            Some((was, best, least, _)) if was == id && (apart + 0.3 < best || health + 0.01 < least) => {
                chased = Some((id, apart.min(best), health.min(least), ticks));
            }
            Some((was, .., since)) if was == id && ticks - since > GIVE_UP_TICKS => {
                given_up.insert(id);
                stalled += GIVE_UP_TICKS;
                chased = None;
                continue;
            }
            Some((was, ..)) if was == id => {}
            _ => chased = Some((id, apart, health, ticks)),
        }
        walker.step(room, there, REACH_M, true);
        felled.extend(room.foes.iter().filter(|(_, foe)| foe.fighter.dead()).map(|(id, _)| *id));
    }
    (felled.len(), given_up.len(), f64::from(walker.ticks.saturating_sub(stalled)) / 60.0)
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
        row(&format!("Patrol garrison ({id})"), clear_all(&mut room));
    }
    for patrol in ["saltgrass-downs", "thunderhoof-grasslands", "whitewind-tundra"] {
        for number in 0..dungeon::PER_PATROL {
            let Some(mut room) = Room::dungeon(patrol, number, Some((1, 1))) else { continue };
            row(&format!("Patrol dungeon ({patrol} {number})"), clear_all(&mut room));
        }
    }
    for elite in gear::activities::elite_dungeons().take(6) {
        let of = RunOf::Elite { place: elite.id.to_owned() };
        let Some(mut room) = Room::dungeon_run(&of, Difficulty::Normal, 29_919_420) else { continue };
        crate::encounters::encounters_tests::unseal(&mut room);
        row(&format!("Elite Dungeon ({})", elite.id), clear_all(&mut room));
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
