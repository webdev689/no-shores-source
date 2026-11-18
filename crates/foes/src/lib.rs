//! How foes think, the same on the server and in every browser: the kinds of foe, and the brain each fights with.
//! DFO's Enhanced AI, its tactics and its telegraphed blows, stands here on Overlook's own fight: foes take turns at a
//! target and ring it, back off, flee and kite, wind up telegraphed blows, and answer blows at them with the guard, the
//! parry and the dodge, the riposte and the counter. A brain reads its room and asks its fighter for controls and
//! buttons, a tick at a time; what it is told happened it notes.

pub mod board;
pub mod brain;
mod dice;
pub mod kinds;
mod react;
mod senses;
mod shoot;
mod steer;
mod tactics;
mod tell;
pub mod tuning;

pub use board::Board;
pub use brain::{Brain, notice};
pub use combat::{Fighter, FighterId, Intent};
pub use kinds::{Kind, spawn};

use dice::Dice;
use senses::Here;

/// Routes across the course: the next point to walk to on the way from one place to another, or None when there is no
/// way. The room hands in one backed by its navmesh.
pub trait Routes {
    fn next_point(&self, from: [f64; 3], to: [f64; 3]) -> Option<[f64; 3]>;
}

/// A straight line: open ground, and tests.
#[derive(Clone, Copy, Debug, Default)]
pub struct Straight;

impl Routes for Straight {
    fn next_point(&self, _from: [f64; 3], to: [f64; 3]) -> Option<[f64; 3]> {
        Some(to)
    }
}

/// What a foe knows of its room this tick: the room's tick and seed, every fighter by id (alive or not, both sides), and
/// the course's blocks and routes.
pub struct World<'a> {
    pub tick: u64,
    pub seed: u64,
    pub fighters: &'a [(FighterId, Fighter)],
    pub blocks: &'a [movement::Block],
    pub routes: &'a dyn Routes,
}

impl core::fmt::Debug for World<'_> {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        formatter
            .debug_struct("World")
            .field("tick", &self.tick)
            .field("seed", &self.seed)
            .field("fighters", &self.fighters.len())
            .field("blocks", &self.blocks.len())
            .finish_non_exhaustive()
    }
}

/// What the room tells a foe's brain it saw happen this tick.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Seen {
    /// A fighter began a swing (the attack as begun: its strike and end ticks tell when its blow lands).
    Swung { by: FighterId, attack: combat::fighter::Attack },
    /// A fighter loosed a shot: it is taken to leave now, arriving by its distance.
    Loosed { by: FighterId },
    /// A blow reached this foe and came to `verdict`.
    Struck { by: FighterId, verdict: combat::Verdict },
    /// This foe's own blow reached `on` and came to `verdict`.
    Landed { on: FighterId, verdict: combat::Verdict },
    /// This foe's telegraphed blow landed: whether it found no one, and whether someone dodged it perfectly.
    TelegraphEnded { missed: bool, perfectly_dodged: bool },
}

/// One tick of a foe's thinking: its brain after it, and what it asks of its fighter (controls + combat buttons,
/// telegraph orders included). `me` must be in `world.fighters`; a dead foe asks nothing.
pub fn think(me: FighterId, brain: &Brain, board: &mut Board, world: &World<'_>) -> (Brain, Intent) {
    let found = world.fighters.iter().find(|(id, _)| *id == me).map(|(_, fighter)| *fighter);
    let Some(fighter) = found.filter(|fighter| !fighter.dead()) else {
        board.forget(me);
        return (brain.clone(), Intent::default());
    };
    let mut next = brain.clone();
    let here = Here {
        me,
        fighter,
        world,
        numbers: kinds::numbers(brain.kind),
        dice: Dice { seed: world.seed, tick: world.tick, foe: me },
    };
    let ask = tactics::decide(&mut next, &here, board);
    let intent = steer::controls(&mut next, &here, &ask);
    (next, intent)
}
