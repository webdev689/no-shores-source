//! Foes climb as players do, by the links their room's navmesh bakes: up onto a block's top no step reaches, after a
//! player standing there; over a wall on the way to a place when that is shorter than round it, and round it when
//! not; and, set down short of a climb, they find their way up again.

use super::*;
use combat::{CombatInput, Intent};
use movement::{Body, Controls, Mode, TUNING};

const SWORDSMAN: u8 = 14;
const BRUTE: u8 = 15;

/// A pirate swordsman put straight into the room at (x, y), facing `facing`.
fn put(room: &mut Room, x: f64, y: f64, facing: f64) -> FighterId {
    let (fighter, brain) =
        ::foes::spawn(::foes::foe_type(SWORDSMAN).expect("a type"), ::foes::Rank::Major, x, y, facing);
    let id = room.next_id();
    room.foes.insert(id, Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
    id
}

/// A player standing still, seeing the room as it stands.
fn still(room: &Room, sequence: u32) -> Input {
    let arms = combat::arms_of("sword_iron", "", true).code();
    let intent = Intent { controls: Controls::default(), combat: CombatInput::default() };
    Input { sequence, intent, arms, seen: room.clock(), ..Input::default() }
}

/// A player standing still with nothing in their hands, swinging every half second.
fn swinging(room: &Room, sequence: u32) -> Input {
    let attack = sequence.is_multiple_of(30).then_some(combat::Stroke::Down);
    let intent = Intent { controls: Controls::default(), combat: CombatInput { attack, ..CombatInput::default() } };
    Input { sequence, intent, seen: room.clock(), ..Input::default() }
}

/// Sends a foe toward a place, as an ally's shout of it would.
fn sent(room: &mut Room, foe: FighterId, place: [f64; 3]) {
    let found = room.foes.get_mut(&foe).expect("the foe");
    let from = [found.fighter.body.x, found.fighter.body.y, found.fighter.body.z];
    ::foes::notice(&mut found.brain, foe, &::foes::Seen::Shouted { from, at: place }, 0);
}

#[test]
fn a_foe_chasing_a_player_onto_a_top_no_step_reaches_climbs_after_them_and_strikes() {
    // A crate to mantle onto, a ledge to catch on a jump, and a wall to climb, each with the player on top and the
    // foe off one corner of the block, so it never walks square into a side unless it means to.
    for top in [1.1, 2.3, 3.5] {
        let block = Block { min_x: -3.0, min_y: -14.0, max_x: 3.0, max_y: -9.0, top, bottom: 0.0 };
        let mut room = Room::new(vec![block], (0.0, 0.0));
        let player = room.join().expect("a room with space");
        let feet = [0.6, -11.3, top];
        room.players.get_mut(&player).unwrap().fighter.body = Body { z: top, ..movement::standing(feet[0], feet[1]) };
        let foe = put(&mut room, -4.3, -2.6, 0.4);
        sent(&mut room, foe, feet);
        let (mut on_top, mut struck) = (false, false);
        for sequence in 1..=60 * 20 {
            room.input(player, still(&room, sequence)).unwrap();
            room.tick();
            struck |= room.take_events().iter().any(|event| event.striker == foe && event.defender == player);
            let whole = room.players[&player].fighter.health_max;
            room.players.get_mut(&player).unwrap().fighter.health = whole;
            let body = room.foes[&foe].fighter.body;
            on_top |= body.mode == Mode::Ground && (body.z - top).abs() < 1e-9;
        }
        assert!(on_top && struck, "{top} m: on top {on_top}, struck {struck}, at {:?}", room.foes[&foe].fighter.body);
    }
}

/// How high a foe sent from south of a wall 2.3 m tall and 2 m thick, `long` metres from end to end, to a place
/// north of it climbed, and whether it reached the place.
fn sent_past_a_wall(long: f64) -> (f64, bool) {
    let wall = Block { min_x: -long / 2.0, min_y: -1.0, max_x: long / 2.0, max_y: 1.0, top: 2.3, bottom: 0.0 };
    let mut room = Room::new(vec![wall], (0.0, 25.0));
    let place = [0.3, -6.0, 0.0];
    let foe = put(&mut room, -0.4, 6.0, 0.0);
    sent(&mut room, foe, place);
    let (mut highest, mut reached) = (0.0_f64, false);
    for _ in 0..60 * 20 {
        room.tick();
        let body = room.foes[&foe].fighter.body;
        highest = highest.max(body.z);
        reached |= combat::sight::apart([body.x, body.y], [place[0], place[1]]) < 1.4;
    }
    (highest, reached)
}

#[test]
fn a_foe_sent_to_a_place_goes_over_a_wall_when_that_is_shorter_and_round_it_when_not() {
    let (highest, reached) = sent_past_a_wall(30.0);
    assert!(reached && highest > 2.0, "over a long wall: reached {reached}, as high as {highest} m");
    let (highest, reached) = sent_past_a_wall(2.0);
    assert!(reached && highest < 0.5, "round a short one: reached {reached}, as high as {highest} m");
}

#[test]
fn a_foe_set_down_short_of_its_climb_finds_its_way_up_again() {
    let block = Block { min_x: -3.0, min_y: -14.0, max_x: 3.0, max_y: -9.0, top: 3.5, bottom: 0.0 };
    let mut room = Room::new(vec![block], (0.0, 0.0));
    let place = [0.6, -11.3, 3.5];
    let foe = put(&mut room, -4.3, -2.6, 0.4);
    sent(&mut room, foe, place);
    let (mut climbs, mut was_climbing, mut on_top) = (0, false, false);
    for _ in 0..60 * 20 {
        room.tick();
        let found = room.foes.get_mut(&foe).unwrap();
        let climbing = found.fighter.body.mode == Mode::Climb;
        if climbing && !was_climbing {
            climbs += 1;
            if climbs == 1 {
                // Knocked off the wall a metre and a half up: it falls back to the ground beside it.
                let body = found.fighter.body;
                found.fighter.body = Body { z: body.z + 1.5, mode: Mode::Air, ..body };
            }
        }
        was_climbing = climbing;
        let body = found.fighter.body;
        on_top |= body.mode == Mode::Ground && (body.z - 3.5).abs() < 1e-9;
    }
    assert!(climbs >= 2 && on_top, "it climbed {climbs} times, and stood on top: {on_top}");
}

/// A room round a ledge 2.3 m up, with a player standing on it near its southern edge, and a foe of a type put at
/// `foe_at`, facing `facing`.
fn by_a_ledge(number: u8, foe_at: [f64; 3], facing: f64) -> (Room, PlayerId, FighterId) {
    let ledge = Block { min_x: 0.0, min_y: -3.0, max_x: 6.0, max_y: -1.0, top: 2.3, bottom: 0.0 };
    let mut room = Room::new(vec![ledge], (3.0, 10.0));
    let player = room.join().expect("a room with space");
    room.players.get_mut(&player).unwrap().fighter.body = Body { z: 2.3, ..movement::standing(2.95, -1.28) };
    let (mut fighter, brain) =
        ::foes::spawn(::foes::foe_type(number).expect("a type"), ::foes::Rank::Major, foe_at[0], foe_at[1], facing);
    fighter.body.z = foe_at[2];
    let foe = room.next_id();
    room.foes.insert(foe, Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
    (room, player, foe)
}

#[test]
fn a_foe_beneath_a_player_at_a_ledge_s_edge_goes_up_rather_than_swing_at_them_from_below() {
    // Across, the player stands within a sword's reach of the foot of the ledge; up, out of any blow's.
    let (mut room, player, foe) = by_a_ledge(SWORDSMAN, [2.95, 3.7, 0.0], 0.0);
    let up = (1..=60 * 4).find(|&sequence| {
        room.input(player, swinging(&room, sequence)).unwrap();
        room.tick();
        let body = room.foes[&foe].fighter.body;
        body.mode == Mode::Ground && body.z == 2.3
    });
    assert!(up.is_some(), "still beneath it after 4 s: {:?}", room.foes[&foe].fighter.body);
}

#[test]
fn a_foe_in_the_air_by_a_lip_in_reach_catches_it_and_goes_up_whatever_it_thinks() {
    // Just off the ground by the ledge's southern face, rising, as on a jump for the lip; with no one about, its
    // thinking asks nothing of it.
    let ledge = Block { min_x: 0.0, min_y: -3.0, max_x: 6.0, max_y: -1.0, top: 2.3, bottom: 0.0 };
    let mut room = Room::new(vec![ledge], (3.0, 10.0));
    let foe = put(&mut room, 2.95, -0.6, 0.0);
    let found = room.foes.get_mut(&foe).unwrap();
    found.fighter.body = Body { mode: Mode::Air, vz: TUNING.jump, z: 0.05, facing: 0.0, ..found.fighter.body };
    let mut modes = Vec::new();
    for _ in 0..60 * 2 {
        room.tick();
        let mode = room.foes[&foe].fighter.body.mode;
        if modes.last() != Some(&mode) {
            modes.push(mode);
        }
    }
    assert!(modes.starts_with(&[Mode::Air, Mode::Hang, Mode::Mantle]), "it caught the lip: {modes:?}");
    assert_eq!(room.foes[&foe].fighter.body.z, 2.3);
}

#[test]
fn a_foe_fighting_on_a_ledge_holds_at_its_edge_as_it_steps_back_from_its_blows() {
    // A brute, which never dodges, at the ledge's northern edge, the player just south of it.
    let (mut room, player, foe) = by_a_ledge(BRUTE, [2.95, -2.5, 2.3], core::f64::consts::PI);
    let (mut lowest, mut struck) = (2.3_f64, false);
    for sequence in 1..=60 * 10 {
        room.input(player, still(&room, sequence)).unwrap();
        room.tick();
        struck |= room.take_events().iter().any(|event| event.striker == foe && event.defender == player);
        let whole = room.players[&player].fighter.health_max;
        room.players.get_mut(&player).unwrap().fighter.health = whole;
        lowest = lowest.min(room.foes[&foe].fighter.body.z);
    }
    assert!(struck && lowest == 2.3, "struck {struck}, and stood as low as {lowest} m");
}

#[test]
fn foes_crowding_a_player_at_the_foot_of_a_tall_wall_never_take_hold_of_it() {
    // Six foes come at a player walking back and forth along a 4 m wall; those waiting their turn stand by its face.
    let wall = Block { min_x: -20.0, min_y: -1.0, max_x: 20.0, max_y: 1.0, top: 4.0, bottom: 0.0 };
    let types = [::foes::roster::COLLECTOR, ::foes::roster::RUNNER, ::foes::roster::ENFORCER];
    let (mut grabs, mut blows) = (0, 0);
    for run in 0..4_u32 {
        let mut room = Room::new(vec![wall], (0.0, 1.6));
        room.world_seed ^= u64::from(run).wrapping_mul(0x9e37_79b9_7f4a_7c15);
        let player = room.join().expect("a room with space");
        let foes: Vec<FighterId> = (0..6_u32)
            .map(|index| {
                let turn = core::f64::consts::PI * (0.15 + 0.14 * f64::from(index)) + f64::from(run) * 0.05;
                let at = [9.0 * libm::cos(turn), 1.6 + 9.0 * libm::sin(turn), 0.0];
                let found = ::foes::foe_type(types[index as usize % 3]).expect("a type");
                room.stand_foe(found, ::foes::Rank::Major, at, combat::sight::bearing([at[0], at[1]], [0.0, 1.6]), None)
            })
            .collect();
        let mut climbing = vec![false; foes.len()];
        for sequence in 1..=60 * 30 {
            let east = (sequence / 300) % 2 == 0;
            let yaw = if east { core::f64::consts::FRAC_PI_2 } else { -core::f64::consts::FRAC_PI_2 };
            let intent =
                Intent { controls: Controls { forward: 0.4, yaw, ..Controls::default() }, ..Intent::default() };
            room.input(player, Input { sequence, intent, seen: room.clock(), ..Input::default() }).unwrap();
            room.tick();
            blows += room.take_events().iter().filter(|event| foes.contains(&event.striker)).count();
            let whole = room.players[&player].fighter.health_max;
            room.players.get_mut(&player).unwrap().fighter.health = whole;
            for (was, foe) in climbing.iter_mut().zip(&foes) {
                let now = room.foes.get(foe).is_some_and(|found| found.fighter.body.mode == Mode::Climb);
                grabs += u32::from(now && !*was);
                *was = now;
            }
        }
    }
    assert_eq!(grabs, 0, "foes took hold of the wall {grabs} times");
    // And they fight on: four runs of 30 s land over a hundred blows.
    assert!(blows >= 100, "foes struck {blows} times");
}
