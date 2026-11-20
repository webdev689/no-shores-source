//! A fighter that strikes a foe draws it from the one it fights, unless that one stands in its reach.

mod common;

use combat::{Intent, Stroke};
use common::{Room, SWORDSMAN, standing_still};
use core::f64::consts::PI;
use foes::Rank::Major;

const ONE: u32 = 1;
const TWO: u32 = 2;
const FOE: u32 = 10;

/// A player that walks up to the foe and stands within `near` of it facing it, swinging each 30 ticks if `swings`.
fn closing(near: f64, swings: bool) -> impl Fn(&Room) -> Intent {
    move |room| {
        let me = if swings { TWO } else { ONE };
        let mut intent = standing_still(room.toward(me, FOE));
        intent.controls.forward = if room.distance(me, FOE) > near { 1.0 } else { 0.0 };
        if swings && room.tick % 30 == 0 {
            intent.combat.attack = Some(Stroke::Down);
        }
        intent
    }
}

/// A swordsman alert to player one, `off` m south of it and facing it, and player two 1.5 m behind the swordsman,
/// striking it from behind; player one stands still, or with `pressing` keeps the swordsman in its reach. Whom the
/// swordsman fights, tick by tick, for `ticks`.
fn struck_from_behind(off: f64, pressing: bool, ticks: u64) -> Vec<Option<u32>> {
    let room = Room::new(3).player(ONE, 0.0, 0.0, PI).player(TWO, 0.0, off + 1.5, 0.0);
    let mut room = room.foe(FOE, SWORDSMAN, Major, 0.0, off, 0.0).alert(FOE, ONE);
    let (one, two) = (closing(1.0, false), closing(1.3, true));
    let mut script = |room: &Room, me: u32| {
        if me == TWO {
            two(room)
        } else if pressing {
            one(room)
        } else {
            standing_still(PI)
        }
    };
    (0..ticks)
        .map(|_| {
            room.step(&mut script);
            room.brain(FOE).fights()
        })
        .collect()
}

#[test]
fn a_player_who_strikes_a_foe_draws_it_from_the_one_it_fights() {
    let fought = struck_from_behind(7.0, false, 240);
    assert_eq!(fought[0], Some(ONE), "it goes for the one it was woken to");
    assert_eq!(fought.last(), Some(&Some(TWO)), "struck from behind, it turns on its striker");
}

#[test]
fn a_foe_in_reach_of_the_one_it_fights_is_not_drawn_away() {
    let fought = struck_from_behind(1.5, true, 300);
    assert!(fought.iter().all(|whom| *whom == Some(ONE)), "it fought on with the one in its reach: {fought:?}");
}
