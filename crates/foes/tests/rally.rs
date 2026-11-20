//! A garrison foe does as its group asks. Broken by its leader's fall, for the break's time a skirmisher runs, a
//! shooter holds its fire and falls back, and a fighter hand to hand huddles on a farther ring, its guard up; raging,
//! it goes in over the turns' cap, never backs off and answers no blow. Its group defending its ground, it fights only
//! a target near its place, or one that struck it; falling back with its group, it runs to its new place, its target
//! kept, and fights from there. A leader its followers screen waits behind them, right behind a shield-bearer of them,
//! and goes in once they are gone. Broken with cover near, any foe falls back behind it.

mod common;

use combat::Verdict;
use combat::sight::{bearing, clear_line, off};
use common::{Room, still, watching};
use core::f64::consts::PI;
use foes::Rank::{Elite, Major};
use foes::brain::Plan;
use foes::tuning::{BREAK, DEFEND, FALLEN_BACK, RANK_GAP, RING_GAP};
use foes::{Brain, Director, Mood, Orders, Seen};
use movement::Block;

const PLAYER: u32 = 1;
const RUNNER: u8 = 1;
const COLLECTOR: u8 = 2;
const CROSSBOWMAN: u8 = 3;
const ENFORCER: u8 = 4;
const REEVE: u8 = 6;

fn brain_mut(room: &mut Room, id: u32) -> &mut Brain {
    room.brains.iter_mut().find(|(other, _)| *other == id).map(|(_, brain)| brain).expect("a foe of the room")
}

fn break_ticks() -> u64 {
    u64::from(combat::ticks(BREAK))
}

/// A foe of the type numbered `number` alert to a still player, `distance` m north of it, settled for half a second.
fn facing_off(number: u8, distance: f64, seed: u64) -> Room {
    let mut room = Room::new(seed).player(PLAYER, 0.0, 0.0, 0.0).foe(10, number, Major, 0.0, -distance, PI);
    room = room.alert(10, PLAYER);
    room.run(30, &mut still(0.0));
    room
}

fn swings_between(room: &Room, id: u32, from: u64, to: u64) -> usize {
    room.swings(id).iter().filter(|tick| (from..to).contains(*tick)).count()
}

#[test]
fn a_skirmisher_broken_by_its_leaders_fall_runs_for_the_break_then_fights_again() {
    let mut room = facing_off(RUNNER, 3.0, 4);
    let broke = room.tick;
    brain_mut(&mut room, 10).breaks(broke, false);
    assert_eq!(room.brain(10).mood(broke), Mood::Broken);
    room.run(break_ticks() - 10, &mut still(0.0));
    assert!(room.distance(10, PLAYER) > 8.0, "it ran: {:.1} m off", room.distance(10, PLAYER));
    assert_eq!(swings_between(&room, 10, broke, room.tick), 0, "and struck nothing");
    room.run(10, &mut still(0.0));
    assert_eq!(room.brain(10).mood(room.tick), Mood::Steady, "the break is over");
    // It ran about as far as a coward does, so it takes as long to come back.
    let over = room.tick;
    room.run(1200, &mut still(0.0));
    assert!(swings_between(&room, 10, over, room.tick) > 0, "and it fights again");
}

#[test]
fn a_shield_bearer_broken_huddles_on_a_farther_ring_its_guard_up_and_takes_no_turn() {
    let mut room = facing_off(COLLECTOR, 2.0, 7);
    let broke = room.tick;
    brain_mut(&mut room, 10).breaks(broke, false);
    room.run(break_ticks() - 30, &mut still(0.0));
    let reach = combat::strike::reach_of(&room.fighter(10));
    assert!(room.distance(10, PLAYER) > reach + RING_GAP, "out past its ring: {:.1} m", room.distance(10, PLAYER));
    assert_eq!(room.brain(10).plan(), Plan::Backoff);
    assert_eq!(swings_between(&room, 10, broke, room.tick), 0);
    let guarded =
        room.foe_intents(10).iter().filter(|(tick, intent)| *tick > broke + 120 && intent.combat.guard).count();
    assert!(guarded > 60, "its guard up as it huddles: {guarded} ticks");
}

#[test]
fn a_shooter_broken_in_the_open_holds_its_fire_and_steps_back_to_its_place_facing_its_target() {
    // Posted 8 m behind where it stands: broken, it steps back there by its routes, facing the player, and no farther.
    let mut room = facing_off(CROSSBOWMAN, 10.0, 2);
    brain_mut(&mut room, 10).posted_at([0.0, -18.0, 0.0], PI);
    let broke = room.tick;
    brain_mut(&mut room, 10).breaks(broke, false);
    room.run(break_ticks() - 10, &mut still(0.0));
    assert!(room.shots.is_empty(), "no shot loosed while broken");
    let distance = room.distance(10, PLAYER);
    assert!((17.0..19.0).contains(&distance), "at its place, 18 m off: {distance:.1} m");
    let aim = room.fighter(10).aim;
    assert!(combat::sight::off(aim, room.toward(10, PLAYER)) < 0.1, "still facing its target");
    // With no place to go back to, it holds where it stands.
    let mut room = facing_off(CROSSBOWMAN, 10.0, 2);
    let broke = room.tick;
    brain_mut(&mut room, 10).breaks(broke, false);
    room.run(break_ticks() - 10, &mut still(0.0));
    assert!(room.shots.is_empty());
    assert!((room.distance(10, PLAYER) - 10.0).abs() < 1.0, "held: {:.1} m", room.distance(10, PLAYER));
}

#[test]
fn a_raging_foe_goes_in_over_the_turns_cap_never_backs_off_and_answers_no_blow() {
    // At rest one foe fights a target hand to hand at a time.
    let mut room = Room::new(5).player(PLAYER, 0.0, 0.0, 0.0);
    room.director = Director { heat: 0.1 };
    room = room.foe(10, COLLECTOR, Major, 0.0, -3.0, PI).foe(11, COLLECTOR, Major, 3.0, 0.0, -PI / 2.0);
    room = room.alert(10, PLAYER).alert(11, PLAYER);
    room.run(120, &mut watching(10));
    let holder = [10, 11].into_iter().find(|id| room.board.holds(PLAYER, *id, false)).expect("one holds the turn");
    let other = if holder == 10 { 11 } else { 10 };
    let raged = room.tick;
    brain_mut(&mut room, other).breaks(raged, true);
    assert_eq!(room.brain(other).mood(raged), Mood::Raging);
    // Once its beat after a blow is over, it takes a turn though the other holds the one the cap allows.
    let mut both = 0;
    for _ in 0..180 {
        room.step(&mut watching(other));
        both += usize::from(room.board.holds(PLAYER, other, false) && room.board.holds(PLAYER, holder, false));
    }
    assert!(both > 0, "raging, it takes a turn past the cap");
    // Swung at again and again, it neither answers nor backs off, however much it loses: made whole enough to live
    // through a quarter of a minute of blows, as many swings as a steady one answers half of.
    room.set(other, |fighter| (fighter.health, fighter.health_max) = (2000.0, 2000.0));
    let mut swing = |room: &Room, _: u32| {
        let mut intent = combat::Intent::default();
        intent.combat.attack = room.tick.is_multiple_of(50).then_some(combat::Stroke::Down);
        intent.controls.yaw = room.toward(PLAYER, other);
        intent
    };
    room.run(900, &mut swing);
    assert!(room.swings(PLAYER).iter().filter(|tick| **tick > raged).count() >= 12, "a long barrage");
    assert!(!room.fighter(other).dead(), "it lives through the barrage");
    let intents = room.foe_intents(other);
    let answered =
        intents.iter().filter(|(tick, intent)| *tick > raged && (intent.combat.guard || intent.combat.dodge));
    assert_eq!(answered.count(), 0, "a raging foe answers no blow");
    assert_ne!(room.brain(other).plan(), Plan::Backoff);
    // Left be, it keeps striking, its blows a beat from the other's.
    let calm = room.tick;
    room.run(600, &mut watching(other));
    assert!(swings_between(&room, other, calm, room.tick) >= 2, "and it keeps striking");
}

#[test]
fn a_rage_ends_with_its_fight() {
    let mut room = facing_off(ENFORCER, 3.0, 1);
    let tick = room.tick;
    brain_mut(&mut room, 10).breaks(tick, true);
    // The player gone, its search ends and its rage with it.
    room.immortal = false;
    room.set(PLAYER, |fighter| fighter.health = 0.0);
    room.run(1200, &mut still(0.0));
    assert_eq!(room.brain(10).mood(room.tick), Mood::Steady);
}

#[test]
fn a_leader_its_followers_screen_waits_behind_them_and_goes_in_at_once_when_they_are_gone() {
    let mut room = Room::new(9).player(PLAYER, 0.0, 0.0, 0.0).foe(10, REEVE, Elite, 0.0, -8.0, PI).alert(10, PLAYER);
    brain_mut(&mut room, 10).order(Orders { screened: true, ..Orders::default() });
    room.run(600, &mut still(0.0));
    assert!(room.swings(10).is_empty(), "screened, it struck nothing");
    let reach = combat::strike::reach_of(&room.fighter(10));
    let distance = room.distance(10, PLAYER);
    assert!(distance > reach + RING_GAP + RANK_GAP - 1.0, "it waits a ring farther out: {distance:.1} m");
    brain_mut(&mut room, 10).order(Orders { push: true, ..Orders::default() });
    let pushed = room.tick;
    room.run(240, &mut still(0.0));
    let first = room.swings(10).first().copied().or_else(|| room.orders(10).first().map(|(tick, _)| *tick));
    assert!(first.is_some_and(|tick| tick < pushed + 240), "its screen gone, it goes in: {first:?}");
}

#[test]
fn a_foe_defending_its_ground_fights_only_near_its_place_or_one_that_struck_it() {
    // The player 16 m from its place, out of its range: it keeps to its place, however long.
    let mut room = Room::new(6).player(PLAYER, 0.0, 4.0, 0.0).foe(10, COLLECTOR, Major, 0.0, -12.0, PI);
    let place = [0.0, -12.0, 0.0];
    brain_mut(&mut room, 10).posted_at(place, PI);
    brain_mut(&mut room, 10).order(Orders { defend: true, ..Orders::default() });
    room = room.alert(10, PLAYER);
    room.run(900, &mut still(0.0));
    let body = room.fighter(10).body;
    let from_place = combat::sight::apart([body.x, body.y], [place[0], place[1]]);
    assert!(from_place < 1.0, "it keeps to its place: {from_place:.1} m off");
    assert!(room.swings(10).is_empty());
    assert_eq!(room.brain(10).fights(), Some(PLAYER), "its target kept");
    // Struck by another than the one it fights, it keeps its ground; struck by its target, it goes after it.
    room.tell(10, Seen::Struck { by: 77, verdict: Verdict::Hit { damage: 1.0, poise: 0.0 } });
    room.run(120, &mut still(0.0));
    assert!(
        room.distance(10, PLAYER) > 15.0,
        "another's blow draws it off nothing: {:.1} m",
        room.distance(10, PLAYER)
    );
    room.tell(10, Seen::Struck { by: PLAYER, verdict: Verdict::Hit { damage: 1.0, poise: 0.0 } });
    room.run(120, &mut still(0.0));
    assert!(room.distance(10, PLAYER) < 16.0 - 3.0, "struck, it came on: {:.1} m", room.distance(10, PLAYER));
}

#[test]
fn a_foe_defending_its_ground_comes_for_a_target_near_it_once_its_patience_runs_out() {
    // The player 12 m from its place: within its range, past its ground.
    let mut room = Room::new(6).player(PLAYER, 0.0, 0.0, 0.0).foe(10, COLLECTOR, Major, 0.0, -12.0, PI);
    brain_mut(&mut room, 10).posted_at([0.0, -12.0, 0.0], PI);
    brain_mut(&mut room, 10).order(Orders { defend: true, ..Orders::default() });
    room = room.alert(10, PLAYER);
    let patience = u64::from(combat::ticks(foes::tuning::PATIENCE));
    room.run(patience - 60, &mut still(0.0));
    assert!(room.distance(10, PLAYER) > 11.0, "it holds its ground a while");
    room.run(600, &mut still(0.0));
    assert!(!room.swings(10).is_empty(), "then comes for the player and fights");
    // Within its ground, it fights at once.
    room.set(PLAYER, |fighter| (fighter.body.x, fighter.body.y) = (0.0, -12.0 + DEFEND - 3.0));
    let near = room.tick;
    room.run(300, &mut still(0.0));
    assert!(swings_between(&room, 10, near, room.tick) > 0, "within its ground, it fights");
}

#[test]
fn a_screened_leader_waits_in_no_line_so_its_follower_goes_in_at_once() {
    let mut room = Room::new(3).player(PLAYER, 0.0, 0.0, 0.0);
    room.director = Director { heat: 0.1 };
    // The leader waits from the first; its follower, coming from 18 m off, joins later.
    room = room.foe(10, REEVE, Elite, -3.0, -5.0, PI).foe(11, COLLECTOR, Major, 0.0, -18.0, PI);
    room = room.alert(10, PLAYER).alert(11, PLAYER);
    brain_mut(&mut room, 10).order(Orders { screened: true, behind: Some(11), ..Orders::default() });
    let mut took = false;
    for _ in 0..240 {
        room.step(&mut still(0.0));
        took |= room.board.holds(PLAYER, 11, false);
    }
    assert!(took, "its follower takes the turn well inside a foe's patience");
    room.run(600, &mut still(0.0));
    assert!(room.swings(10).is_empty() && !room.swings(11).is_empty());
}

#[test]
fn a_foe_falling_back_with_its_group_runs_to_its_new_place_its_target_kept_then_fights_from_there() {
    let mut room = Room::new(8).player(PLAYER, 0.0, 0.0, 0.0).foe(10, COLLECTOR, Major, 0.0, -3.0, PI);
    brain_mut(&mut room, 10).posted_at([0.0, -3.0, 0.0], PI);
    room = room.alert(10, PLAYER);
    room.run(120, &mut still(0.0));
    let new_place = [0.0, -18.0, 0.0];
    brain_mut(&mut room, 10).keep_to(new_place, PI, false);
    brain_mut(&mut room, 10).fall_back();
    let fell = room.tick;
    let mut arrived = None;
    for _ in 0..600 {
        room.step(&mut still(0.0));
        let body = room.fighter(10).body;
        if arrived.is_none() && combat::sight::apart([body.x, body.y], [new_place[0], new_place[1]]) <= FALLEN_BACK {
            arrived = Some(room.tick);
        }
        assert_eq!(room.brain(10).fights(), Some(PLAYER), "its target kept");
    }
    let arrived = arrived.expect("it reached its new place");
    assert!(arrived < fell + 360, "at a run: {} ticks", arrived - fell);
    assert_eq!(swings_between(&room, 10, fell, arrived), 0, "striking nothing on the way");
    assert!(swings_between(&room, 10, arrived, room.tick) > 0, "and fights from there");
}

#[test]
fn a_foe_broken_with_cover_near_falls_back_behind_it_its_guard_up() {
    // A wall 4 m long and higher than a head, 8 m north of the player, a step east of the line to the foe.
    let wall = Block { min_x: 0.5, min_y: -8.5, max_x: 4.5, max_y: -8.0, top: 2.5, bottom: 0.0 };
    let room = Room::new(3).course(vec![wall]).player(PLAYER, 0.0, 0.0, 0.0);
    let mut room = room.foe(10, COLLECTOR, Major, 0.0, -3.0, PI).alert(10, PLAYER);
    room.run(30, &mut still(0.0));
    let broke = room.tick;
    brain_mut(&mut room, 10).breaks(broke, false);
    room.run(240, &mut still(0.0));
    let (foe, player) = (room.fighter(10), room.fighter(PLAYER));
    assert!(
        !clear_line(&room.blocks, player.chest(), foe.chest()),
        "the wall between them: {:?}",
        (foe.body.x, foe.body.y)
    );
    assert!(room.distance(10, PLAYER) > 8.0, "fallen back past it");
    let guarded =
        room.foe_intents(10).iter().filter(|(tick, intent)| *tick > broke + 180 && intent.combat.guard).count();
    assert!(guarded > 30, "its guard up behind it: {guarded} ticks");
    assert_eq!(swings_between(&room, 10, broke, room.tick), 0);
}

#[test]
fn a_screened_leader_stands_right_behind_its_shield_bearer_not_the_middle_of_its_line() {
    // A Collector and an Enforcer hold the line, the Runner flanks; their Reeve waits, screened, behind the Collector.
    let mut room = Room::new(4).player(PLAYER, 0.0, 0.0, PI);
    room.director = Director { heat: 0.1 };
    room = room.foe(10, REEVE, Elite, 0.0, 8.0, 0.0).foe(11, COLLECTOR, Major, 4.0, -2.0, PI);
    room = room.foe(12, RUNNER, Major, -3.0, -3.0, PI).foe(13, ENFORCER, Major, -4.0, -2.0, PI);
    room = room.alert(10, PLAYER).alert(11, PLAYER).alert(12, PLAYER).alert(13, PLAYER);
    brain_mut(&mut room, 10).order(Orders { screened: true, behind: Some(11), ..Orders::default() });
    let mut apart = Vec::new();
    for tick in 0..1200 {
        room.step(&mut still(PI));
        if tick >= 600 {
            let at = |body: movement::Body| bearing([0.0, 0.0], [body.x, body.y]);
            apart.push(off(at(room.fighter(10).body), at(room.fighter(11).body)));
        }
    }
    // Behind the middle of its line it would stand about 45 degrees round from the Collector; behind it, it trails it
    // a little as the Collector goes in and out.
    let mean = apart.iter().sum::<f64>() / apart.len() as f64;
    assert!(mean < 0.3, "behind its shield-bearer, a mean {:.0} degrees round from it", mean.to_degrees());
    assert!(room.distance(10, PLAYER) > room.distance(11, PLAYER) + 1.0, "and farther out");
    assert!(room.swings(10).is_empty(), "screened, it strikes nothing");
}

#[test]
fn a_foe_winding_up_as_its_group_falls_back_finishes_its_blow_then_falls_back() {
    let mut room = Room::new(2).player(PLAYER, 0.0, 0.0, 0.0).foe(10, ENFORCER, Elite, 0.0, -3.0, PI);
    brain_mut(&mut room, 10).posted_at([0.0, -3.0, 0.0], PI);
    room = room.alert(10, PLAYER);
    // Until its first telegraphed blow is under way.
    for _ in 0..1800 {
        room.step(&mut still(0.0));
        if matches!(room.fighter(10).action, combat::fighter::Action::Telegraph(_)) {
            break;
        }
    }
    assert!(matches!(room.fighter(10).action, combat::fighter::Action::Telegraph(_)), "a wind-up under way");
    let new_place = [0.0, -20.0, 0.0];
    brain_mut(&mut room, 10).keep_to(new_place, PI, false);
    brain_mut(&mut room, 10).fall_back();
    let reached = (0..600).any(|_| {
        room.step(&mut still(0.0));
        let body = room.fighter(10).body;
        combat::sight::apart([body.x, body.y], [new_place[0], new_place[1]]) <= FALLEN_BACK
    });
    assert!(reached, "its blow done, it fell back all the same");
}

#[test]
fn a_foe_broken_out_of_its_range_neither_closes_on_nor_hunts_its_target() {
    let mut room = facing_off(COLLECTOR, 3.0, 5);
    // Its target walks off past its range; broken, it does not follow.
    room.set(PLAYER, |fighter| fighter.body.y = 20.0);
    let broke = room.tick;
    brain_mut(&mut room, 10).breaks(broke, false);
    let far = room.distance(10, PLAYER);
    room.run(break_ticks() - 30, &mut still(0.0));
    assert!(
        room.distance(10, PLAYER) >= far - 0.5,
        "it closed in while broken: {:.1} m of {far:.1}",
        room.distance(10, PLAYER)
    );
}

#[test]
fn a_raging_foe_holds_no_ground_its_group_gives() {
    let mut room = facing_off(ENFORCER, 3.0, 3);
    brain_mut(&mut room, 10).posted_at([0.0, -3.0, 0.0], PI);
    let tick = room.tick;
    brain_mut(&mut room, 10).breaks(tick, true);
    brain_mut(&mut room, 10).keep_to([0.0, -20.0, 0.0], PI, false);
    brain_mut(&mut room, 10).fall_back();
    assert!(!room.brain(10).falling_back(), "raging, it falls back with no one");
}
