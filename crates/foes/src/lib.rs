//! How foes think, the same on the server and in every browser: the factions, their enemy types, the roles and ranks
//! they come in, and the brain each fights with.
//! DFO's Enhanced AI, its tactics and its telegraphed blows, stands here on Overlook's own fight: foes take turns at a
//! target and ring it, back off, flee and kite, wind up telegraphed blows, and answer blows at them with the guard, the
//! parry and the dodge, the riposte and the counter. A brain reads its room and asks its fighter for controls and
//! buttons, a tick at a time; what it is told happened it notes. It fights only once alert: what it sees and hears
//! stirs it first.

mod awareness;
pub mod board;
pub mod brain;
mod cover;
mod dice;
pub mod director;
pub mod factions;
mod flank;
pub mod noises;
pub mod ranks;
mod react;
pub mod roles;
pub mod roster;
mod senses;
mod shoot;
mod steer;
mod tactics;
mod tell;
pub mod tuning;

pub use awareness::Alertness;
pub use board::Board;
pub use brain::{Brain, Calls, notice};
pub use combat::{Fighter, FighterId, Intent};
pub use director::{Caps, Director, Pressed};
pub use factions::{FACTIONS, Faction, faction};
pub use noises::Noise;
pub use ranks::Rank;
pub use roles::Role;
pub use roster::{FoeType, ROSTER, foe_type, spawn};

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

/// A place a shooter may fire from: its point on the walkable surface, and the bearings it has cover from (within
/// 2.4 m of the eye) and an open lane down (clear 14 m). Bit `n` of each mask is the bearing `n` sixteenths of a turn
/// clockwise from north.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Spot {
    pub point: [f64; 3],
    pub cover: u16,
    pub lanes: u16,
}

/// The firing spots over the course: those within `radius` of a point, across, always in the same order. The room
/// hands in one backed by the spots baked with its navmesh.
pub trait Spots {
    fn near(&self, point: [f64; 3], radius: f64) -> Vec<Spot>;
}

/// No spots anywhere: open ground, and tests.
#[derive(Clone, Copy, Debug, Default)]
pub struct NoSpots;

impl Spots for NoSpots {
    fn near(&self, _point: [f64; 3], _radius: f64) -> Vec<Spot> {
        Vec::new()
    }
}

/// What a foe knows of its room this tick: the room's tick and seed, every fighter by id (alive or not, both sides), the
/// course's blocks, routes and firing spots, and the room's director, whose heat sets the turn caps and the aggression
/// bias.
pub struct World<'a> {
    pub tick: u64,
    pub seed: u64,
    pub fighters: &'a [(FighterId, Fighter)],
    pub blocks: &'a [movement::Block],
    pub routes: &'a dyn Routes,
    pub spots: &'a dyn Spots,
    pub director: Director,
}

impl core::fmt::Debug for World<'_> {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        formatter
            .debug_struct("World")
            .field("tick", &self.tick)
            .field("seed", &self.seed)
            .field("fighters", &self.fighters.len())
            .field("blocks", &self.blocks.len())
            .field("director", &self.director)
            .finish_non_exhaustive()
    }
}

/// What the room tells a foe's brain it saw happen this tick.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Seen {
    /// A fighter began a swing (the attack as begun: its strike and end ticks tell when its blow lands).
    Swung { by: FighterId, attack: combat::fighter::Attack },
    /// A fighter loosed a shot: it is taken to leave now, arriving by its distance.
    /// A fighter loosed a shot, flying at `speed` (0 where the room does not know it, or it reaches its mark at once).
    Loosed { by: FighterId, speed: f64 },
    /// A blow reached this foe and came to `verdict`.
    Struck { by: FighterId, verdict: combat::Verdict },
    /// This foe's own blow reached `on` and came to `verdict`.
    Landed { on: FighterId, verdict: combat::Verdict },
    /// This foe's telegraphed blow landed: whether it found no one, and whether someone dodged it perfectly.
    TelegraphEnded { missed: bool, perfectly_dodged: bool },
    /// A noise a fighter made: heeded only when of another side.
    Heard(Noise),
    /// An ally standing at `from` turned alert, and shouts the place it believes its foe is.
    Shouted { from: [f64; 3], at: [f64; 3] },
}

/// One tick of a foe's thinking: its brain after it, and what it asks of its fighter (controls + combat buttons,
/// telegraph orders included). `me` must be in `world.fighters`; a dead foe asks nothing.
pub fn think(me: FighterId, brain: &Brain, board: &mut Board, world: &World<'_>) -> (Brain, Intent) {
    let found = world.fighters.iter().find(|(id, _)| *id == me).map(|(_, fighter)| *fighter);
    let Some(fighter) = found.filter(|fighter| !fighter.dead()) else {
        board.forget(me);
        let mut fallen = brain.clone();
        fallen.awareness.heard.clear();
        return (fallen, Intent::default());
    };
    let mut next = brain.clone();
    let here = Here {
        me,
        fighter,
        world,
        numbers: brain.numbers(),
        dice: Dice { seed: world.seed, tick: world.tick, foe: me },
    };
    let ask = tactics::decide(&mut next, &here, board);
    let intent = steer::controls(&mut next, &here, &ask);
    (next, intent)
}
