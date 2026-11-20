//! Melee foes in numbers keep apart: a foe going in slips round an ally rather than through it, a waiting foe inside
//! its ring steps back out onto it, a crowded ring evens out, and past a ring's room the waiting stand on a ring
//! farther out. A shield-bearer waiting on its ring keeps its guard up while its target walks about, and foes hunting
//! and searching one place stand behind the first there rather than shove it.

mod common;

use combat::sight::apart;
use common::{ARCHER, BRUTE, Room, SKIRMISHER, SWORDSMAN, still};
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
    // Six stood 5 degrees apart on the ring, 0.3 m from each other; the turns pass among them as they spread, so the
    // gap is taken over the last two seconds of each of a few fights.
    let mut spread = 0.0;
    for seed in 1..=8 {
        let (mut room, ids) = ringed(cold(seed), RING, &[170.0, 175.0, 180.0, 185.0, 190.0, 195.0]);
        room.run(480, &mut still(0.0));
        for _ in 0..120 {
            room.step(&mut still(0.0));
            let at = |id: &u32| [room.fighter(*id).body.x, room.fighter(*id).body.y];
            let waiting: Vec<u32> = ids.iter().copied().filter(|id| waiting(&room, *id)).collect();
            let pairs = waiting
                .iter()
                .flat_map(|id| waiting.iter().filter(move |other| *other != id).map(move |other| (id, other)));
            let nearest = pairs.map(|(id, other)| apart(at(id), at(other))).fold(f64::MAX, f64::min);
            spread += nearest.min(TAU * RING) / (8.0 * 120.0);
        }
    }
    assert!(spread >= 0.8 * RING_ROOM, "the waiting stand well apart: {spread} m from the nearest, on average");
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

#[test]
fn a_shield_bearer_waiting_on_its_ring_keeps_its_guard_up_while_its_target_walks_about() {
    let degrees: Vec<f64> = (0..8).map(|index| f64::from(index) * 45.0).collect();
    let (mut room, ids) = ringed(Room::new(4).player(PLAYER, 0.0, 0.0, 0.0), 6.0, &degrees);
    // The player strolls round a wide circle, as one sizing up a crowd does.
    let mut strolling = |room: &Room, _me: u32| {
        let mut intent = common::standing_still(room.tick as f64 * 0.004);
        intent.controls.forward = 0.3;
        intent
    };
    // A guard let fall and raised again within three ticks, by a foe waiting its turn.
    let (mut flickers, mut dropped) = (0, std::collections::BTreeMap::new());
    for _ in 0..1800 {
        let tick = room.tick;
        room.step(&mut strolling);
        for (_, id, intent) in room.intents.iter().filter(|(at, id, _)| *at == tick && ids.contains(id)) {
            if !waiting(&room, *id) {
                continue;
            }
            if !intent.combat.guard {
                dropped.entry(*id).or_insert(tick);
            } else if let Some(at) = dropped.remove(id) {
                flickers += usize::from(tick <= at + 3);
            }
        }
    }
    assert!(flickers <= 2, "the waiting shields stay up, not dropped and raised tick by tick: {flickers}");
}

#[test]
fn foes_hunting_and_searching_one_place_stand_behind_the_first_there_rather_than_shove_it() {
    // Four foes fight the player, who steps behind a wall out of their sight: each runs to where it last saw them.
    let wall = movement::Block { min_x: -10.0, min_y: 2.0, max_x: 10.0, max_y: 3.0, top: 3.0, bottom: 0.0 };
    let room = Room::new(12).course(vec![wall]).player(PLAYER, 0.0, 0.0, 0.0);
    let (mut room, ids) = ringed(room, 5.0, &[-60.0, -20.0, 20.0, 60.0]);
    room.run(30, &mut still(0.0));
    room.set(PLAYER, |player| player.body = movement::standing(0.0, 8.0));
    // Each foe's turns about of more than 150 degrees between ticks it moved, through its hunt and its search.
    let mut last: std::collections::BTreeMap<u32, ([f64; 2], Option<f64>)> = std::collections::BTreeMap::new();
    let mut reversals = 0;
    for _ in 0..600 {
        room.step(&mut still(0.0));
        for id in &ids {
            let body = room.fighter(*id).body;
            let (before, walked) = last.get(id).copied().unwrap_or(([body.x, body.y], None));
            let step = [body.x - before[0], body.y - before[1]];
            let way = (libm::hypot(step[0], step[1]) > 0.004).then(|| libm::atan2(step[0], -step[1]));
            if let (Some(now), Some(then)) = (way, walked) {
                reversals += usize::from(combat::sight::off(now, then) > 150.0_f64.to_radians());
            }
            last.insert(*id, ([body.x, body.y], way.or(walked)));
        }
    }
    assert!(reversals <= 20, "they stand, not jostle at the place: {reversals} turns about");
}

#[test]
fn foes_stirred_by_one_noise_stand_behind_the_first_near_it_rather_than_shove_it() {
    // Ten foes in two rings round a place, the player far behind them, hear a noise there that stirs them short of
    // alert: four 1.6 m off, six 2.8 m off behind them.
    let mut room = Room::new(5).player(PLAYER, 0.0, 40.0, 0.0);
    let ids: Vec<u32> = (10..20).collect();
    for (index, id) in ids.iter().enumerate() {
        let (count, distance, nth) = if index < 4 { (4.0, 1.6, index) } else { (6.0, 2.8, index - 4) };
        let turn = f64::from(u8::try_from(nth).expect("a few")) * TAU / count + 0.3;
        room = room.foe(*id, SWORDSMAN, Major, distance * libm::sin(turn), -distance * libm::cos(turn), turn + PI);
    }
    let noise = foes::Noise { at: [0.0, 0.0, 0.0], side: combat::fighter::Side::Players, loudness: 0.5, reach: 10.0 };
    room.hear(noise);
    let mut was: std::collections::BTreeMap<u32, [f64; 2]> = std::collections::BTreeMap::new();
    let mut reversals = 0;
    for _ in 0..600 {
        room.step(&mut still(0.0));
        for id in &ids {
            assert!(room.brain(*id).alertness() != foes::Alertness::Alert, "stirred, not alert");
            let body = room.fighter(*id).body;
            let (now, then) = ([body.vx, body.vy], was.get(id).copied().unwrap_or_default());
            let (speed, was_speed) = (libm::hypot(now[0], now[1]), libm::hypot(then[0], then[1]));
            reversals += usize::from(speed > 0.3 && was_speed > 0.3 && now[0] * then[0] + now[1] * then[1] < 0.0);
            was.insert(*id, now);
        }
    }
    assert!(reversals <= 10, "they stand, not jostle near the place: {reversals} turns about");
}

/// Eight foes of four kinds come at a still player from before it, its fight at rest, over four half-minutes: how
/// often a foe's move turns about from one tick to the next, a foe-second, and how often a waiting foe on the move
/// stops dead, a waiting foe-second.
fn turns_and_stops() -> (f64, f64) {
    let kinds = [SKIRMISHER, SWORDSMAN, SWORDSMAN, BRUTE, SKIRMISHER, SWORDSMAN, BRUTE, ARCHER];
    let (mut turns, mut stops, mut alive, mut waited) = (0, 0, 0, 0);
    for seed in 1..=4 {
        let mut room = Room::new(seed).player(PLAYER, 0.0, 0.0, 0.0);
        for (index, kind) in kinds.into_iter().enumerate() {
            let turn = (f64::from(u8::try_from(index).expect("eight")) - 3.5) * 0.35;
            let id = 10 + u32::try_from(index).expect("eight");
            room =
                room.foe(id, kind, Major, 6.0 * libm::sin(turn), -6.0 * libm::cos(turn), turn + PI).alert(id, PLAYER);
        }
        let mut was: Vec<[f64; 2]> = vec![[0.0; 2]; kinds.len()];
        for _ in 0..1800 {
            room.step(&mut still(0.0));
            for (index, before) in was.iter_mut().enumerate() {
                let id = 10 + u32::try_from(index).expect("eight");
                let body = room.fighter(id).body;
                let (now, then) = ([body.vx, body.vy], *before);
                let (speed, was_speed) = (libm::hypot(now[0], now[1]), libm::hypot(then[0], then[1]));
                let back = now[0] * then[0] + now[1] * then[1] < -0.5 * speed * was_speed;
                turns += usize::from(speed > 0.3 && was_speed > 0.3 && back);
                stops += usize::from(waiting(&room, id) && was_speed > 0.3 && speed < 0.05);
                waited += usize::from(waiting(&room, id));
                alive += 1;
                *before = now;
            }
        }
    }
    let per_second = |count: usize, ticks: usize| count as f64 * 60.0 / ticks.max(1) as f64;
    (per_second(turns, alive), per_second(stops, waited))
}

#[test]
fn foes_in_a_crowd_neither_turn_about_tick_by_tick_nor_circle_by_stops_and_starts() {
    let (turns, stops) = turns_and_stops();
    assert!(turns < 0.2, "a foe's move turns about {turns:.2} times a second");
    assert!(stops < 0.2, "a waiting foe stops dead {stops:.2} times a second");
}
