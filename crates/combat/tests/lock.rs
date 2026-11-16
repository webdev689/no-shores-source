//! The soft lock: it takes the foe nearest the look in range and sight, holds it while it lives, stays near and in
//! sight and the look does not stay turned away, and keeps a target in the arc when a new swing begins.

mod common;

use combat::lock::{choose, hold, take};
use combat::tuning::{LOCK_AWAY_TICKS, LOCK_UNSEEN_TICKS};
use common::{foe_at, player_at};
use core::f64::consts::PI;
use movement::Block;

#[test]
fn it_takes_the_foe_nearest_the_look_in_range_and_sight_and_never_a_friend_or_the_dead() {
    let me = player_at(0.0, 0.0);
    let mut dead = foe_at(0.0, -2.0, PI);
    dead.action = combat::Action::Dead { elapsed: 0 };
    let fighters = vec![
        (1, me),
        (2, dead),
        (3, foe_at(3.0, -4.0, PI)),
        (4, foe_at(0.5, -6.0, PI)),
        (5, foe_at(0.0, -12.0, PI)),
        (6, foe_at(-8.0, 2.0, 0.0)),
        (7, player_at(0.0, -1.0)),
    ];
    assert_eq!(choose(1, &me, 0.0, &fighters, &[]), Some(4), "nearer the look outweighs nearer by distance");
    assert_eq!(choose(1, &me, 0.65, &fighters, &[]), Some(3));
    assert_eq!(choose(1, &me, PI, &fighters, &[]), None, "nothing within the arc behind");
    let wall = [Block { min_x: -1.0, min_y: -5.5, max_x: 1.0, max_y: -5.0, top: 3.0 }];
    assert_eq!(choose(1, &me, 0.0, &fighters, &wall), Some(3), "not through a wall");
}

#[test]
fn it_lets_go_when_the_foe_dies_walks_away_is_lost_or_the_look_stays_turned_away() {
    let mut me = player_at(0.0, 0.0);
    me.target = Some(2);
    let near = vec![(2, foe_at(0.0, -4.0, PI))];
    assert_eq!(hold(&me, 0.0, &near, &[]).target, Some(2));
    assert_eq!(hold(&me, 0.0, &[(2, foe_at(0.0, -15.0, PI))], &[]).target, Some(2), "held to 15 m");
    assert_eq!(hold(&me, 0.0, &[(2, foe_at(0.0, -15.5, PI))], &[]).target, None, "past 15 m");
    let mut dead = foe_at(0.0, -4.0, PI);
    dead.action = combat::Action::Dead { elapsed: 0 };
    assert_eq!(hold(&me, 0.0, &[(2, dead)], &[]).target, None);
    let turned = (0..=LOCK_AWAY_TICKS).fold(me, |held, _| hold(&held, PI, &near, &[]));
    assert_eq!(turned.target, None, "turned away for half a second");
    let glance = (0..LOCK_AWAY_TICKS).fold(me, |held, _| hold(&held, PI, &near, &[]));
    assert_eq!(hold(&glance, 0.0, &near, &[]).target, Some(2), "a glance away keeps it");
    let wall = [Block { min_x: -1.0, min_y: -2.5, max_x: 1.0, max_y: -2.0, top: 3.0 }];
    let lost = (0..=LOCK_UNSEEN_TICKS).fold(me, |held, _| hold(&held, 0.0, &near, &wall));
    assert_eq!(lost.target, None, "out of sight for a second");
}

#[test]
fn a_new_swing_keeps_a_target_in_the_arc_and_takes_another_when_the_look_has_moved_on() {
    let mut me = player_at(0.0, 0.0);
    me.target = Some(2);
    let fighters = vec![(2, foe_at(0.0, -4.0, PI)), (3, foe_at(4.0, 0.0, -PI / 2.0))];
    assert_eq!(take(1, &me, 0.3, &fighters, &[]).target, Some(2));
    assert_eq!(take(1, &me, PI / 2.0, &fighters, &[]).target, Some(3));
    let alone = player_at(0.0, 0.0);
    assert_eq!(take(1, &alone, PI, &fighters, &[]).target, None);
}

#[test]
fn a_swing_takes_the_foe_looked_at_over_one_off_to_the_side_but_keeps_a_near_tie() {
    let mut me = player_at(0.0, 0.0);
    me.target = Some(2);
    // 2 is 60 degrees east of the look north; 3 is straight ahead: the swing takes 3.
    let fighters = [(2, foe_at(3.464, -2.0, PI)), (3, foe_at(0.0, -4.0, PI))];
    assert_eq!(take(1, &me, 0.0, &fighters, &[]).target, Some(3));
    // 2 is ten degrees off and a little nearer than 3 is: no better by enough, the lock keeps 2.
    let close = [(2, foe_at(0.6, -3.4, PI)), (3, foe_at(0.0, -4.0, PI))];
    assert_eq!(take(1, &me, 0.0, &close, &[]).target, Some(2));
}

#[test]
fn a_sweep_does_not_move_the_lock_and_a_parry_turns_it_on_the_parried() {
    use combat::judge::{answered, suffer, swing_blow};
    use combat::{Stroke, Verdict};
    let mut me = player_at(0.0, 0.0);
    me.target = Some(2);
    let swept = answered(&me, 3, &Verdict::Hit { damage: 1.0, poise: 1.0 });
    assert_eq!(swept.target, Some(2), "the lock stays on the one it held");
    assert_eq!(answered(&player_at(0.0, 0.0), 3, &Verdict::Hit { damage: 1.0, poise: 1.0 }).target, Some(3));
    let attack = combat::fighter::Attack {
        stroke: Stroke::Down,
        elapsed: 24,
        strike: 24,
        end: 60,
        swing: combat::fighter::Swing::Plain,
        left_hand: false,
    };
    let blow = swing_blow(4, &foe_at(0.0, -1.5, PI), &attack, 1);
    assert_eq!(suffer(&me, &blow, &Verdict::Parried).target, Some(4), "the riposte goes at the one parried");
}

#[test]
fn the_guard_faces_the_lock_only_while_the_look_is_toward_it() {
    use combat::{CombatInput, Intent, Surroundings, step_fighter};
    let guard = |yaw: f64| Intent {
        controls: movement::Controls { yaw, ..movement::Controls::default() },
        combat: CombatInput { guard: true, ..CombatInput::default() },
    };
    let east = Some([3.0, 0.0, 1.1]);
    let step = |fighter: &combat::Fighter, yaw: f64| {
        step_fighter(fighter, &guard(yaw), &Surroundings { blocks: &[], terrain: &movement::Flat, target_at: east }).0
    };
    // Looking north-east, within the lock's arc of the foe due east: the guard turns to it.
    let toward = (0..10).fold(player_at(0.0, 0.0), |fighter, _| step(&fighter, PI / 4.0));
    assert!((toward.aim - PI / 2.0).abs() < 1e-9, "{}", toward.aim);
    // Looking west, turned from it to face another: the guard follows the look.
    let away = (0..20).fold(player_at(0.0, 0.0), |fighter, _| step(&fighter, -PI / 2.0));
    assert!((away.aim + PI / 2.0).abs() < 1e-9, "{}", away.aim);
}
