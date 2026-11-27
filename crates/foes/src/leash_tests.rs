//! A foe falling back as its group gives ground lets go of a target that has fallen or is left be, as any foe does.

use crate::roster::{COLLECTOR, spawn};
use crate::{Board, Director, NoSpots, Rank, Straight, World, think};
use combat::FighterId;
use combat::fighter::{Action, Fighter};

const ME: FighterId = 10;
const ONE: FighterId = 1;

#[test]
fn a_foe_falling_back_lets_go_of_a_target_that_fell() {
    let (fighter, mut brain) = spawn(crate::foe_type(COLLECTOR).unwrap(), Rank::Major, 0.0, 0.0, 0.0);
    brain.posted_at([0.0, -40.0, 0.0], 0.0);
    brain.hunt(ONE, [0.0, 3.0, 0.0], 100);
    brain.fall_back();
    assert!(brain.falling_back(), "running back to its group's new place");
    let mut fallen: Fighter = combat::fighter::player(movement::standing(0.0, 3.0), combat::arms::BARE_HANDS);
    fallen.action = Action::Dead { elapsed: 0 };
    let fighters = [(ME, fighter), (ONE, fallen)];
    let world = World {
        tick: 101,
        seed: 0,
        fighters: &fighters,
        blocks: &[],
        terrain: &movement::Flat,
        routes: &Straight,
        spots: &NoSpots,
        director: Director::default(),
    };
    let (next, _) = think(ME, &brain, &mut Board::default(), &world);
    assert_eq!(next.fights(), None, "its target fell");
}

#[test]
fn a_foe_straight_over_its_home_a_storey_up_is_not_home_yet() {
    let (fighter, mut brain) = spawn(crate::foe_type(COLLECTOR).unwrap(), Rank::Major, 0.0, 0.0, 0.0);
    brain.posted_at([0.0, 0.0, -8.0], 0.0);
    brain.returning = Some(crate::brain::Homeward::Leashed);
    let fighters = [(ME, fighter)];
    let world = World {
        tick: 1,
        seed: 0,
        fighters: &fighters,
        blocks: &[],
        terrain: &movement::Flat,
        routes: &Straight,
        spots: &NoSpots,
        director: Director::default(),
    };
    let (next, _) = think(ME, &brain, &mut Board::default(), &world);
    assert_eq!(next.returning, Some(crate::brain::Homeward::Leashed), "still on its way home, a storey under it");
}
