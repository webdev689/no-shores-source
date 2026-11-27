//! A foe falling back as its group gives ground lets go of a target that has fallen or is left be, as any foe does,
//! and runs only for a new place its routes reach.

use crate::roster::{COLLECTOR, spawn};
use crate::{Board, Director, NoSpots, Rank, Routes, Straight, World, think};
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

/// Routes that reach nowhere from where a body stands: the next point still lies straight ahead, as the room's routes
/// answer for a goal off its navmesh.
struct Cut;

impl Routes for Cut {
    fn next_point(&self, _from: [f64; 3], to: [f64; 3]) -> Option<[f64; 3]> {
        Some(to)
    }

    fn walkable(&self, _from: [f64; 3], _point: [f64; 3]) -> bool {
        false
    }
}

#[test]
fn a_foe_whose_new_place_cannot_be_reached_stops_falling_back_and_fights() {
    let (fighter, mut brain) = spawn(crate::foe_type(COLLECTOR).unwrap(), Rank::Major, 0.0, 0.0, 0.0);
    brain.posted_at([0.0, -40.0, 0.0], 0.0);
    brain.hunt(ONE, [0.0, 3.0, 0.0], 100);
    brain.fall_back();
    let fighters =
        [(ME, fighter), (ONE, combat::fighter::player(movement::standing(0.0, 3.0), combat::arms::BARE_HANDS))];
    let thought = |routes: &dyn Routes| {
        let world = World {
            tick: 101,
            seed: 0,
            fighters: &fighters,
            blocks: &[],
            terrain: &movement::Flat,
            routes,
            spots: &NoSpots,
            director: Director::default(),
        };
        think(ME, &brain, &mut Board::default(), &world).0
    };
    assert!(thought(&Straight).falling_back(), "a place it can reach it runs to");
    let stranded = thought(&Cut);
    assert!(!stranded.falling_back(), "a place it cannot reach it never runs for");
    assert_eq!(stranded.fights(), Some(ONE), "it fights on from where it stands");
}
