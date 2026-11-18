//! The same room from the same seed plays the same fight: every foe asks the same of its fighter, tick by tick, and is
//! stirred, wakes and searches the same, to the bit; from another seed the fight goes otherwise.

mod common;

use combat::{Intent, Stroke};
use common::{ARCHER, BRUTE, Room, SKIRMISHER, SWORDSMAN, standing_still};
use core::f64::consts::{FRAC_PI_2, PI};
use foes::Rank::Major;
use movement::{Block, Controls};

const PLAYER: u32 = 1;

/// A player that turns to the nearest foe and swings at it every second.
fn fighting_back(room: &Room, me: u32) -> Intent {
    let nearest = [10, 11, 12]
        .into_iter()
        .min_by(|first, second| room.distance(me, *first).total_cmp(&room.distance(me, *second)));
    let mut intent = standing_still(nearest.map_or(0.0, |foe| room.toward(me, foe)));
    if room.tick.is_multiple_of(60) {
        intent.combat.attack = Some(Stroke::DownRight);
    }
    intent
}

fn fight(seed: u64) -> Vec<(u64, u32, Intent)> {
    let mut room = Room::new(seed)
        .player(PLAYER, 0.0, 0.0, 0.0)
        .foe(10, SWORDSMAN, Major, -2.0, -6.0, PI)
        .foe(11, SKIRMISHER, Major, 3.0, -5.0, PI)
        .foe(12, BRUTE, Major, 0.0, 7.0, 0.0);
    room.run(600, &mut fighting_back);
    room.intents
}

#[test]
fn the_same_seed_plays_the_same_fight_and_another_seed_another() {
    let first = fight(42);
    assert_eq!(first, fight(42));
    assert_ne!(first, fight(43));
    assert!(first.iter().any(|(_, _, intent)| intent.combat.attack.is_some()), "a fight, not a standoff");
}

/// A player who runs east past three foes, two facing away, swinging now and then, and ends behind a wall: every foe's
/// awareness, to the bit, tick by tick, and every shout.
fn stirred(seed: u64) -> (Vec<u64>, Vec<(u64, u32)>) {
    let mut room = Room::new(seed)
        .player(PLAYER, -12.0, 0.0, FRAC_PI_2)
        .foe(10, SWORDSMAN, Major, 0.0, -6.0, 0.0)
        .foe(11, SKIRMISHER, Major, 4.0, -9.0, 0.0)
        .foe(12, ARCHER, Major, -4.0, 9.0, PI);
    room.blocks.push(Block { min_x: 14.0, min_y: -20.0, max_x: 15.0, max_y: 20.0, top: 3.0 });
    let mut running_past = |room: &Room, _: u32| {
        let forward = if room.tick < 240 { 1.0 } else { 0.0 };
        let controls = Controls { forward, yaw: FRAC_PI_2, run: true, ..Controls::default() };
        let mut intent = Intent { controls, ..Intent::default() };
        intent.combat.attack = room.tick.is_multiple_of(70).then_some(Stroke::Down);
        intent
    };
    let mut levels = Vec::new();
    for _ in 0..900 {
        room.step(&mut running_past);
        levels.extend([10, 11, 12].map(|id| room.brain(id).awareness().to_bits()));
    }
    (levels, room.shouts)
}

#[test]
fn the_same_seed_stirs_wakes_and_searches_the_same_to_the_bit() {
    let first = stirred(42);
    assert_eq!(first, stirred(42));
    assert!(!first.1.is_empty(), "someone turned alert and shouted: {:?}", first.1);
}
