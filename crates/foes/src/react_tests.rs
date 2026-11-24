//! A foe's answers: one whose time has passed leaves its striker no hold on it, and only a swing begun at it, the
//! striker within reach and aiming at it, is the blow it holds to answer.

use super::*;
use crate::roster::{COLLECTOR, spawn};
use crate::{Board, Director, NoSpots, Rank, Straight, World, think};
use combat::fighter::Swing;

const ME: FighterId = 10;
const NEAR: FighterId = 1;

fn player(at: [f64; 2]) -> Fighter {
    combat::fighter::player(movement::standing(at[0], at[1]), combat::arms::BARE_HANDS)
}

fn thought(brain: &Brain, fighters: &[(FighterId, Fighter)], tick: u64) -> Brain {
    let world = World {
        tick,
        seed: 0,
        fighters,
        blocks: &[],
        terrain: &movement::Flat,
        routes: &Straight,
        spots: &NoSpots,
        director: Director::default(),
    };
    think(ME, brain, &mut Board::default(), &world).0
}

#[test]
fn an_answer_whose_time_has_passed_leaves_its_striker_no_hold_on_the_foe() {
    let (fighter, mut brain) = spawn(crate::foe_type(COLLECTOR).unwrap(), Rank::Major, 0.0, 0.0, 0.0);
    let defence = Defence { answer: Answer::Guard, from: NEAR, press: 90, until: 95, side: 1.0 };
    brain.reactions.defence = Some(defence);
    // Its striker fell and lies far off: the foe sees no one to fight.
    let mut gone = player([0.0, -80.0]);
    gone.action = Action::Dead { elapsed: 0 };
    let next = thought(&brain, &[(ME, fighter), (NEAR, gone)], 200);
    assert_eq!(next.target(), None, "the answer ended at tick 95");
}

#[test]
fn only_a_swing_begun_at_a_foe_is_the_blow_it_holds_to_answer() {
    let (fighter, _) = spawn(crate::foe_type(COLLECTOR).unwrap(), Rank::Major, 0.0, 0.0, 0.0);
    let swing = |strike: u32| Attack {
        stroke: combat::Stroke::Down,
        elapsed: 0,
        strike,
        end: 60,
        swing: Swing::Plain,
        left_hand: false,
    };
    // Two metres before the foe, facing it, its swing begun at it.
    let mut near = player([0.0, -2.0]);
    (near.aim, near.target, near.action) = (std::f64::consts::PI, Some(ME), Action::Attack(swing(30)));
    // Fifteen metres off, facing away, its quicker swing at another.
    let mut far = player([0.0, -15.0]);
    (far.aim, far.target, far.action) = (0.0, Some(99), Action::Attack(swing(10)));
    assert!(swung_at(&near, ME, [0.0, 0.0]), "within reach, aimed at it");
    assert!(!swung_at(&far, ME, [0.0, 0.0]), "out of reach, aimed elsewhere");
    let walking = player([0.0, -2.0]);
    assert!(!swung_at(&walking, ME, [0.0, 0.0]), "no swing under way");
    let _ = fighter;
}
