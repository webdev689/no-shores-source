//! Melee foes in numbers keep apart: a foe going in slips round an ally rather than through it, a waiting foe inside
//! its ring steps back out onto it, a crowded ring evens out, and past a ring's room the waiting stand on a ring
//! farther out.

mod common;

use combat::sight::apart;
use common::{Room, SWORDSMAN, still};
use core::f64::consts::{PI, TAU};
use foes::Director;
use foes::Rank::Major;
use foes::brain::Plan;
use foes::tuning::{RANK_GAP, RING_GAP, RING_ROOM};

const PLAYER: u32 = 1;
const RING: f64 = 1.8 + RING_GAP;

/// A room held cold, so one foe at a time fights the player hand to hand.
fn cold(seed: u64) -> Room {
    let mut room = Room::new(seed).player(PLAYER, 0.0, 0.0, 0.0);
    room.director = Director { heat: 0.1 };
    room
}

/// Swordsmen alert to the player, each `distance` from it at a bearing in degrees, numbered from 10.
fn ringed(mut room: Room, distance: f64, degrees: &[f64]) -> (Room, Vec<u32>) {
    let mut ids = Vec::new();
    for (index, degree) in degrees.iter().enumerate() {
        let turn = degree.to_radians();
        let id = 10 + u32::try_from(index).expect("a few foes");
        let (x, y) = (distance * libm::sin(turn), -distance * libm::cos(turn));
        room = room.foe(id, SWORDSMAN, Major, x, y, turn + PI).alert(id, PLAYER);
        ids.push(id);
    }
    (room, ids)
}

fn waiting(room: &Room, id: u32) -> bool {
    room.brain(id).plan() == Plan::Wait
}

#[test]
fn a_foe_going_in_behind_an_ally_slips_round_it_rather_than_through_it() {
    let room = Room::new(6).player(PLAYER, 0.0, 0.0, 0.0);
    let (room, _) = ringed(room, 4.5, &[0.0]);
    let mut room = room.foe(11, SWORDSMAN, Major, 0.0, -8.0, PI).alert(11, PLAYER);
    let mut closest = f64::MAX;
    for _ in 0..240 {
        room.step(&mut still(0.0));
        let (first, second) = (room.fighter(10).body, room.fighter(11).body);
        closest = closest.min(apart([first.x, first.y], [second.x, second.y]));
    }
    assert!(closest >= 0.7, "never within a body's width of each other: {closest}");
    assert!(!room.swings(11).is_empty() || !room.orders(11).is_empty(), "and the one behind still goes in");
}

#[test]
fn a_waiting_foe_inside_its_ring_steps_back_out_onto_it() {
    let (mut room, _) = ringed(cold(7), 2.0, &[180.0, 90.0]);
    room.run(90, &mut still(0.0));
    let (holder, waiter) = if waiting(&room, 11) { (10, 11) } else { (11, 10) };
    assert!(!waiting(&room, holder) && room.swings(waiter).is_empty(), "one fights, the other waits its turn");
    let distance = room.distance(PLAYER, waiter);
    assert!((distance - RING).abs() < 0.3, "on its ring, not inside it: {distance}");
}

#[test]
fn foes_bunched_on_their_ring_spread_round_it() {
    let (mut room, ids) = ringed(cold(8), RING, &[170.0, 175.0, 180.0, 185.0, 190.0, 195.0]);
    room.run(300, &mut still(0.0));
    let at = |id: &u32| [room.fighter(*id).body.x, room.fighter(*id).body.y];
    let waiting: Vec<u32> = ids.into_iter().filter(|id| waiting(&room, *id)).collect();
    let pairs =
        waiting.iter().flat_map(|id| waiting.iter().filter(move |other| *other != id).map(move |other| (id, other)));
    let nearest = pairs.map(|(id, other)| apart(at(id), at(other))).fold(f64::MAX, f64::min);
    assert!(waiting.len() >= 3 && nearest >= 0.8 * RING_ROOM, "{} waiting stand well apart: {nearest}", waiting.len());
}

#[test]
fn past_a_ring_s_room_the_waiting_stand_on_a_ring_farther_out() {
    let degrees: Vec<f64> = (0..12).map(|index| f64::from(index) * 30.0).collect();
    let (mut room, ids) = ringed(cold(9), 6.0, &degrees);
    room.run(60, &mut still(0.0));
    let (mut first, mut farther) = (0, 0);
    for _ in 0..300 {
        room.step(&mut still(0.0));
        // Standing on a ring: waiting there, all but still, not walking out or in through it.
        let standing = |id: &&u32| libm::hypot(room.fighter(**id).body.vx, room.fighter(**id).body.vy) < 0.5;
        let on = |ring: f64| {
            let near = |id: &&u32| (room.distance(PLAYER, **id) - ring).abs() < 0.3;
            ids.iter().filter(|id| waiting(&room, **id)).filter(standing).filter(near).count()
        };
        (first, farther) = (first.max(on(RING)), farther.max(on(RING + RANK_GAP)));
    }
    let room_on_first = (TAU * RING / RING_ROOM) as usize;
    assert!(first <= room_on_first, "no more on the first ring than it has room for: {first}");
    assert!(farther >= 2, "the rest a ring farther out: {farther}");
}
