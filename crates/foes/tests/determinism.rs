//! The same room from the same seed plays the same fight: every foe asks the same of its fighter, tick by tick; from
//! another seed the fight goes otherwise.

mod common;

use combat::{Intent, Stroke};
use common::{Room, standing_still};
use core::f64::consts::PI;
use foes::Kind;

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
        .foe(10, Kind::Swordsman, -2.0, -6.0, PI)
        .foe(11, Kind::Skirmisher, 3.0, -5.0, PI)
        .foe(12, Kind::Brute, 0.0, 7.0, 0.0);
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
