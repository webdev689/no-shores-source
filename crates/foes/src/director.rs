//! The room's combat director: one heat meter that breathes with how its players fare. Damage the players deal and
//! foes they kill heat the fight; damage they take cools it, faster than dealing heats it; between beats the heat eases
//! back to its rest. The heat sets how many foes a target fights at once, and, in a hot fight, an aggression bias
//! that makes the waiting foes go in sooner and stand closer.

use crate::tuning::{MELEE_TOKENS, PATIENCE, RANGED_TOKENS, RING_GAP, SWING_DELAY};
use movement::TICK_SECONDS;

/// Where the heat settles between beats, in the mid band, so a fight at rest is fought as it always was.
pub const REST: f64 = 0.35;
/// Heat for each point of damage the players deal, lost for each point they take, and gained for each foe they kill.
pub const DEALT_GAIN: f64 = 0.0022;
pub const TAKEN_LOSS: f64 = 0.006;
pub const KILL_GAIN: f64 = 0.09;
/// The time constant, in seconds, of the ease back to rest.
pub const EASE: f64 = 6.0;
/// Above this heat the aggression bias rises evenly, to its most at full heat.
pub const BIAS_FROM: f64 = 0.6;
pub const BIAS_MOST: f64 = 0.3;

/// How many foes may hold a turn at one target at once, hand to hand and shooting.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Caps {
    pub melee: usize,
    pub ranged: usize,
}

/// The bands of heat, coldest first: each holds from its edge up to the next one's. A player who is hurting gets room
/// to breathe; one who dominates is pressed by more foes at once.
pub const BANDS: [(f64, Caps); 4] = [
    (0.0, Caps { melee: 1, ranged: 1 }),
    (0.25, Caps { melee: MELEE_TOKENS, ranged: RANGED_TOKENS }),
    (0.6, Caps { melee: 3, ranged: 2 }),
    (0.85, Caps { melee: 3, ranged: 3 }),
];

/// What a waiting foe turns on, shortened by the bias's share: its patience and its swing delay in seconds, and its
/// ring's gap in metres.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pressed {
    pub patience: f64,
    pub swing_delay: (f64, f64),
    pub ring_gap: f64,
}

/// The room's heat, between 0 and 1.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Director {
    pub heat: f64,
}

impl Default for Director {
    fn default() -> Self {
        Director { heat: REST }
    }
}

impl Director {
    fn add(&mut self, change: f64) {
        self.heat = (self.heat + change).clamp(0.0, 1.0);
    }

    /// The players dealt `damage` to foes.
    pub fn dealt(&mut self, damage: f64) {
        self.add(damage * DEALT_GAIN);
    }

    /// A player took `damage`.
    pub fn taken(&mut self, damage: f64) {
        self.add(-damage * TAKEN_LOSS);
    }

    /// A player killed a foe.
    pub fn killed(&mut self) {
        self.add(KILL_GAIN);
    }

    /// One tick of the ease back to rest.
    pub fn step(&mut self) {
        self.heat = REST + (self.heat - REST) * libm::exp(-TICK_SECONDS / EASE);
    }

    /// The turn caps for this heat: the hottest band it has reached.
    #[must_use]
    pub fn caps(&self) -> Caps {
        let reached = BANDS.iter().rev().find(|(edge, _)| self.heat >= *edge);
        reached.map_or(BANDS[0].1, |(_, caps)| *caps)
    }

    /// The aggression bias for this heat: none up to BIAS_FROM, then evenly up to BIAS_MOST at full heat.
    #[must_use]
    pub fn bias(&self) -> f64 {
        if self.heat <= BIAS_FROM { 0.0 } else { (self.heat - BIAS_FROM) / (1.0 - BIAS_FROM) * BIAS_MOST }
    }

    /// A waiting foe's numbers, pressed by the bias. No bias leaves each exactly as tuned.
    #[must_use]
    pub fn pressed(&self) -> Pressed {
        let share = 1.0 - self.bias();
        Pressed {
            patience: PATIENCE * share,
            swing_delay: (SWING_DELAY.0 * share, SWING_DELAY.1 * share),
            ring_gap: RING_GAP * share,
        }
    }
}
