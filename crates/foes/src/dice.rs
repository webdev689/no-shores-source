//! The brain's dice: a hash of the room's seed, the tick, the foe and what the roll is for, so a room plays the same
//! fight again from the same seed and no two foes, ticks or questions share a roll.

use combat::FighterId;

/// What a roll decides.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Purpose {
    Answer = 1,
    Side = 2,
    Recover = 3,
    Stroke = 4,
    SwingDelay = 5,
    Blow = 6,
    Shape = 7,
    Windup = 8,
    Iron = 9,
    Feint = 10,
    Chain = 11,
    Cooldown = 12,
    ShotGap = 13,
    Aimed = 14,
    Press = 15,
    Search = 16,
    Hide = 24,
}

/// One foe's dice for one tick.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Dice {
    pub seed: u64,
    pub tick: u64,
    pub foe: FighterId,
}

/// SplitMix64's finaliser: every bit of the input moves every bit of the output.
fn mix(value: u64) -> u64 {
    let mut mixed = value.wrapping_add(0x9E37_79B9_7F4A_7C15);
    mixed = (mixed ^ (mixed >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    mixed = (mixed ^ (mixed >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    mixed ^ (mixed >> 31)
}

impl Dice {
    /// A number in [0, 1) for this purpose.
    #[must_use]
    pub fn roll(&self, purpose: Purpose) -> f64 {
        let hashed = mix(mix(mix(self.seed) ^ self.tick) ^ (u64::from(self.foe) << 8 | purpose as u64));
        (hashed >> 11) as f64 / (1_u64 << 53) as f64
    }

    /// A number between the two, evenly.
    #[must_use]
    pub fn between(&self, purpose: Purpose, range: (f64, f64)) -> f64 {
        range.0 + (range.1 - range.0) * self.roll(purpose)
    }
}
