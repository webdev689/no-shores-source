//! A foe's senses: it sees a player across open ground within its range, not through a block, and hunts where it last
//! saw its target for a while after losing sight of it before it lets it go.

mod common;

use common::{ARCHER, Room, SWORDSMAN, still};
use core::f64::consts::PI;
use foes::Rank::Major;
use movement::Block;

const PLAYER: u32 = 1;

#[test]
fn a_foe_sees_a_player_across_open_ground_within_its_range() {
    let mut room = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -10.0, PI);
    room.step(&mut still(0.0));
    assert_eq!(room.brain(10).target(), Some(PLAYER));
    let mut far = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -20.0, PI);
    far.run(30, &mut still(0.0));
    assert_eq!(far.brain(10).target(), None, "20 m off, out of its range");
    let mut shooter = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, ARCHER, Major, 0.0, -30.0, PI);
    shooter.step(&mut still(0.0));
    assert_eq!(shooter.brain(10).target(), Some(PLAYER), "a shooter sees farther");
}

#[test]
fn a_foe_notices_only_what_lies_ahead_of_it_as_dfos_do() {
    let mut behind = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -10.0, 0.0);
    behind.step(&mut still(0.0));
    assert_eq!(behind.brain(10).target(), None, "the player stands behind it, facing away");
    let mut beside = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -10.0, PI / 2.0);
    beside.step(&mut still(0.0));
    assert_eq!(beside.brain(10).target(), Some(PLAYER), "a quarter turn off is still within its sight");
}

#[test]
fn a_foe_does_not_see_through_a_block() {
    let mut room = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -10.0, PI);
    room.blocks.push(Block { min_x: -3.0, min_y: -5.5, max_x: 3.0, max_y: -4.5, top: 3.0 });
    room.run(60, &mut still(0.0));
    assert_eq!(room.brain(10).target(), None);
    assert!(room.fighter(10).body.y < -9.9, "and stays where it stands");
}

#[test]
fn a_foe_hunts_where_it_last_saw_its_target_for_a_while_then_lets_it_go() {
    let mut room = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -10.0, PI);
    room.blocks.push(Block { min_x: 10.0, min_y: -15.0, max_x: 12.0, max_y: 5.0, top: 4.0 });
    room.run(30, &mut still(0.0));
    room.set(PLAYER, |player| player.body.x = 20.0);
    room.run(200, &mut still(0.0));
    assert_eq!(room.brain(10).target(), Some(PLAYER), "still hunting");
    let foe = room.fighter(10).body;
    assert!(foe.x.abs() < 1.0 && foe.y.abs() < 1.0, "where it last saw the player: {foe:?}");
    room.run(150, &mut still(0.0));
    assert_eq!(room.brain(10).target(), None, "five seconds unseen, it lets go");
}
