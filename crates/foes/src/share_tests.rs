//! Whom a foe fights among several: a blow draws it from its target unless its target stands in its reach or another
//! blow drew it a moment ago; waiting its turn, it goes for one it would strike half a beat sooner, only once it has
//! held its target SHARE_HOLD and only on its weighing tick.

use super::*;
use crate::dice::Dice;
use crate::roster::{COLLECTOR, spawn};
use crate::{Director, NoSpots, Rank, Seen, Straight, World, foe_type, notice};
use combat::Verdict;

const ME: FighterId = 10;
const ONE: FighterId = 1;
const TWO: FighterId = 2;

/// A Collector at the origin facing north, fighting player one at `one` and waiting its turn, player two at `two`.
fn fight(one: [f64; 2], two: [f64; 2]) -> (Brain, Vec<(FighterId, Fighter)>) {
    let (fighter, mut brain) = spawn(foe_type(COLLECTOR).unwrap(), Rank::Major, 0.0, 0.0, 0.0);
    brain.target = Some(ONE);
    let player = |at: [f64; 2]| combat::fighter::player(movement::standing(at[0], at[1]), combat::arms::BARE_HANDS);
    (brain, vec![(ME, fighter), (ONE, player(one)), (TWO, player(two))])
}

/// Whom it fights after its share of thought at `tick`, the board as given.
fn thinks(brain: &mut Brain, fighters: &[(FighterId, Fighter)], board: &Board, tick: u64) -> Option<FighterId> {
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
    let here = Here {
        me: ME,
        fighter: fighters[0].1,
        world: &world,
        numbers: brain.numbers(),
        dice: Dice { seed: 0, tick, foe: ME },
    };
    let target = brain.target.unwrap();
    let other = fighters.iter().find(|(id, _)| *id == target).unwrap().1;
    let kept = sight(&here, target, &other, true, Some(feet(&other)));
    share(brain, &here, board, Some(kept)).map(|sight| sight.id)
}

fn struck(brain: &mut Brain, by: FighterId, tick: u64) {
    notice(brain, ME, &Seen::Struck { by, verdict: Verdict::Hit { damage: 1.0, poise: 0.0 } }, tick);
}

#[test]
fn a_blow_draws_a_foe_unless_its_target_stands_in_its_reach_or_another_blow_drew_it_a_moment_ago() {
    let board = Board::default();
    let (mut brain, fighters) = fight([0.0, -4.0], [0.0, 3.0]);
    struck(&mut brain, TWO, 100);
    assert_eq!(thinks(&mut brain, &fighters, &board, 101), Some(TWO), "player two draws it");
    struck(&mut brain, ONE, 150);
    assert_eq!(thinks(&mut brain, &fighters, &board, 151), Some(TWO), "player one does not, so soon after");
    let hold = Here::ticks(SHARE_HOLD);
    struck(&mut brain, ONE, 101 + hold);
    assert_eq!(thinks(&mut brain, &fighters, &board, 102 + hold), Some(ONE), "and does once the hold has passed");
    let (mut brain, fighters) = fight([0.0, -1.5], [0.0, 3.0]);
    struck(&mut brain, TWO, 100);
    assert_eq!(thinks(&mut brain, &fighters, &board, 101), Some(ONE), "player one in its reach keeps it");
}

#[test]
fn a_waiting_foe_goes_for_one_it_would_strike_sooner_once_it_has_held_its_target_a_while() {
    // Player one 3.3 m north with three other foes at it; player two 7.8 m off to the north-east with none.
    let (mut brain, fighters) = fight([0.0, -3.3], [5.0, -6.0]);
    let mut board = Board::default();
    assert_eq!(thinks(&mut brain, &fighters, &board, 310), Some(ONE), "with none at player one, it stays");
    for other in [11, 12, 13] {
        board.aim(other, Some(ONE));
    }
    let every = Here::ticks(SHARE_EVERY);
    let due = |tick: u64| (tick + u64::from(ME)).is_multiple_of(every);
    let (early, between, weighs) = ((0..300).find(|tick| due(*tick)).unwrap(), 309, 310);
    assert!(!due(between) && due(weighs));
    assert_eq!(thinks(&mut brain, &fighters, &board, early), Some(ONE), "not before its hold");
    assert_eq!(thinks(&mut brain, &fighters, &board, between), Some(ONE), "nor between its weighings");
    assert_eq!(thinks(&mut brain, &fighters, &board, weighs), Some(TWO), "it goes for player two");
}
