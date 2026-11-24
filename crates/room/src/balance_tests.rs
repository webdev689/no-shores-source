//! The balance measured on foot: one kind of foe at each rank it takes, so a rank's own step is seen apart from its
//! kind's.
//! Run by hand, in release, to print the tables:
//! `cargo test -p room --release measure_ranks -- --ignored --nocapture`.

use super::*;
use combat::arms::Stroke;
use combat::{CombatInput, Intent};
use movement::Controls;
use std::collections::BTreeMap;

const SWORD: u32 = 2;
const LONGEST_TICKS: u32 = 60 * 600;

fn stand(room: &mut Room, foe_type: &'static ::foes::FoeType, rank: ::foes::Rank, level: u8) -> FighterId {
    let id = room.next_id();
    let (mut fighter, brain) = ::foes::spawn(foe_type, rank, 0.0, -1.5, core::f64::consts::PI);
    fighter.health *= gear::power::foe_health_times(level);
    fighter.health_max = fighter.health;
    room.foes.insert(id, Foe { fighter, brain, caller: None, level, struck_by: BTreeMap::new(), shield: None });
    id
}

fn asking(sequence: u32, room: &Room, combat: CombatInput) -> Input {
    let controls = Controls { yaw: 0.0, ..Controls::default() };
    Input { sequence, intent: Intent { controls, combat }, arms: SWORD, seen: room.clock(), ..Input::default() }
}

/// A level 1 player with the starting sword, swinging every half second and never guarding, held whole: the blows
/// landed and the ticks to fell the foe.
fn felling(foe_type: &'static ::foes::FoeType, rank: ::foes::Rank) -> (usize, u32) {
    let mut arena = Room::new(Vec::new(), (0.0, 0.0));
    let player = arena.join().expect("a room with space");
    let foe = stand(&mut arena, foe_type, rank, 1);
    let (mut landed, mut ticks) = (0, 0_u32);
    while ticks < LONGEST_TICKS {
        let (me, them) = (*arena.fighter(player).expect("in"), arena.fighter(foe).copied());
        let Some(them) = them.filter(|found| !found.dead()) else { break };
        arena.set_fighter(player, combat::fighter::Fighter { health: me.health_max, ..me });
        let attack = ticks.is_multiple_of(30).then_some(Stroke::Down);
        let mut input = asking(ticks + 1, &arena, CombatInput { attack, ..CombatInput::default() });
        input.intent.controls.yaw = combat::sight::bearing([me.body.x, me.body.y], [them.body.x, them.body.y]);
        let near = libm::hypot(me.body.x - them.body.x, me.body.y - them.body.y);
        input.intent.controls.forward = if near > 1.6 { 1.0 } else { 0.0 };
        arena.input(player, input).unwrap();
        arena.tick();
        ticks += 1;
        let hits = arena.take_events();
        landed += hits.iter().filter(|hit| hit.kind == EventKind::Hit && hit.striker == player).count();
    }
    (landed, ticks)
}

/// The ticks a foe takes to fell a level 1 player who stands still.
fn felled_by(foe_type: &'static ::foes::FoeType, rank: ::foes::Rank) -> u32 {
    let mut arena = Room::new(Vec::new(), (0.0, 0.0));
    let player = arena.join().expect("a room with space");
    stand(&mut arena, foe_type, rank, 1);
    let mut ticks = 0_u32;
    while ticks < LONGEST_TICKS && !arena.fighter(player).expect("in").dead() {
        arena.input(player, asking(ticks + 1, &arena, CombatInput::default())).unwrap();
        arena.tick();
        ticks += 1;
    }
    ticks
}

#[test]
#[ignore = "a measurement, printed by hand in release"]
fn measure_ranks() {
    let seconds = |ticks: u32| f64::from(ticks) / 60.0;
    for (name, number) in [("Collector", 2), ("Hookman", 8), ("Enforcer", 4), ("Reeve", 6)] {
        let foe_type = ::foes::foe_type(number).expect("a type");
        eprintln!("\n{name}\n| Rank | Felled in | Fells the player in |");
        for &rank in foe_type.ranks {
            let (landed, ticks) = felling(foe_type, rank);
            let felled = felled_by(foe_type, rank);
            eprintln!("| {rank:?} | {landed} blows, {:.1} s | {:.1} s |", seconds(ticks), seconds(felled));
        }
    }
}
