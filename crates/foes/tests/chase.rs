//! The chase: a foe in its turn runs after a target walking away from it, closes in by as far as the target walks
//! while its blow comes round, and strikes it.

mod common;

use combat::{Intent, Verdict};
use common::{Room, SWORDSMAN, swinging};
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
