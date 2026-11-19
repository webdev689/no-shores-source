//! Foes climb as players do, by the links their room's navmesh bakes: up onto a block's top no step reaches, after a
//! player standing there; over a wall on the way to a place when that is shorter than round it, and round it when
//! not; and, set down short of a climb, they find their way up again.

use super::*;
use combat::{CombatInput, Intent};
use movement::{Body, Controls, Mode};

const SWORDSMAN: u8 = 14;

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
        let block = Block { min_x: -3.0, min_y: -14.0, max_x: 3.0, max_y: -9.0, top };
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
    let wall = Block { min_x: -long / 2.0, min_y: -1.0, max_x: long / 2.0, max_y: 1.0, top: 2.3 };
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
    let block = Block { min_x: -3.0, min_y: -14.0, max_x: 3.0, max_y: -9.0, top: 3.5 };
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
