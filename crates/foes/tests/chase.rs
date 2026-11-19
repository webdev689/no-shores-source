//! The chase: a foe in its turn runs after a target walking away from it, closes in by as far as the target walks
//! while its blow comes round, but no nearer than bodies touch, keeps pace there, and strikes it.

mod common;

use combat::fighter::Action;
use combat::tuning::BODY_RADIUS;
use combat::{Intent, Verdict};
use common::{Room, SKIRMISHER, SWORDSMAN, swinging};
use core::f64::consts::PI;
use foes::Rank::Major;
use movement::Controls;

const PLAYER: u32 = 1;

/// A player walking south at a full walk, looking the way it walks.
fn walking_away(_room: &Room, _me: u32) -> Intent {
    Intent { controls: Controls { forward: 1.0, yaw: PI, ..Controls::default() }, ..Intent::default() }
}

#[test]
fn a_foe_in_its_turn_runs_after_a_target_walking_away_and_strikes_it() {
    for seed in 1..=4 {
        let room = Room::new(seed).player(PLAYER, 0.0, 0.0, PI).foe(10, SWORDSMAN, Major, 0.0, -4.0, PI);
        let mut room = room.alert(10, PLAYER);
        let (mut swung, mut ran) = (0, false);
        for _ in 0..600 {
            let was = swinging(&room.fighter(10));
            room.step(&mut walking_away);
            swung += usize::from(!was && swinging(&room.fighter(10)));
            ran |= room.foe_intents(10).last().is_some_and(|(_, intent)| intent.controls.run);
        }
        let landed = room
            .verdicts
            .iter()
            .any(|(_, by, on, verdict)| *by == 10 && *on == PLAYER && matches!(verdict, Verdict::Hit { .. }));
        assert!(ran && swung >= 1, "seed {seed}: it ran after the player and swung {swung} times in 10 s");
        assert!(landed, "seed {seed}: and its blow landed");
    }
}

#[test]
fn a_chaser_closes_no_nearer_than_bodies_touch_and_keeps_pace_rather_than_stop_and_start() {
    // A dagger's short reach and quick blow lead it in closest.
    for seed in 1..=4 {
        let room = Room::new(seed).player(PLAYER, 0.0, 0.0, PI).foe(10, SKIRMISHER, Major, 0.0, -4.0, PI);
        let mut room = room.alert(10, PLAYER);
        let (mut nearest, mut stops, mut was_moving) = (f64::MAX, 0, false);
        for _ in 0..600 {
            room.step(&mut walking_away);
            let foe = room.fighter(10);
            nearest = nearest.min(room.distance(PLAYER, 10));
            let moving = libm::hypot(foe.body.vx, foe.body.vy) > 0.5;
            let chasing = matches!(foe.action, Action::Idle) && room.distance(PLAYER, 10) < 2.0;
            stops += usize::from(chasing && was_moving && !moving);
            was_moving = moving;
        }
        assert!(
            nearest >= 2.0 * BODY_RADIUS - 0.01,
            "seed {seed}: it closed to {nearest:.2} m, inside the player ({stops} stops)"
        );
        assert!(stops <= 10, "seed {seed}: it stopped {stops} times in 10 s at the player's heels");
    }
}
