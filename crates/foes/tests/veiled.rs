//! A Veiled player is no foe's target: one in plain sight is never noticed, a foe fighting one lets it go and swings at
//! it no more, and a wind-up already under way when the veil falls still lands.

mod common;

use combat::fighter::Action;
use combat::{Happening, Status, give};
use common::{BRUTE, Room, SWORDSMAN, still};
use core::f64::consts::PI;
use foes::Alertness::Idle;
use foes::Rank::Major;

const PLAYER: u32 = 1;
/// Longer than any test runs, so the veil holds throughout.
const VEIL: u32 = 5000;

fn veil(room: &mut Room, id: u32) {
    room.set(id, |fighter| *fighter = give(fighter, Status::Veiled, VEIL, None).expect("the veil takes"));
}

#[test]
fn a_veiled_player_in_plain_sight_is_never_noticed() {
    let mut room = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -6.0, PI);
    veil(&mut room, PLAYER);
    room.run(300, &mut still(0.0));
    assert_eq!((room.brain(10).target(), room.brain(10).alertness()), (None, Idle));
}

#[test]
fn a_foe_fighting_a_player_lets_them_go_once_veiled_and_swings_at_them_no_more() {
    let mut room =
        Room::new(3).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -2.0, PI).alert(10, PLAYER);
    room.run(240, &mut still(0.0));
    assert_eq!(room.brain(10).target(), Some(PLAYER), "it fights them first");
    veil(&mut room, PLAYER);
    let veiled_at = room.tick;
    room.step(&mut still(0.0));
    assert_eq!(room.brain(10).target(), None, "let go at once");
    room.run(300, &mut still(0.0));
    let swung = room.swings(10);
    assert!(swung.iter().all(|tick| *tick <= veiled_at), "no swing begun after the veil: {swung:?}");
    assert!(room.orders(10).iter().all(|(tick, _)| *tick <= veiled_at), "and no wind-up");
}

#[test]
fn a_wind_up_under_way_as_the_veil_falls_still_lands() {
    let mut room = Room::new(21).player(PLAYER, 0.0, 0.0, 0.0).foe(10, BRUTE, Major, 0.0, -4.0, PI);
    let winding = |room: &Room| matches!(room.fighter(10).action, Action::Telegraph(_));
    for _ in 0..3600 {
        if winding(&room) {
            break;
        }
        room.step(&mut still(0.0));
    }
    assert!(winding(&room), "the brute winds up a blow");
    veil(&mut room, PLAYER);
    let veiled_at = room.tick;
    room.run(240, &mut still(0.0));
    let landed = room
        .happenings
        .iter()
        .any(|(tick, by, happening)| *by == 10 && *tick >= veiled_at && matches!(happening, Happening::Landed(_)));
    assert!(landed, "the blow wound up lands");
    assert!(room.orders(10).iter().all(|(tick, _)| *tick < veiled_at), "and none follows it");
}
