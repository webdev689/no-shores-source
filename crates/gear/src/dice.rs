//! Gear's dice: a hash of the room's seed, its tick, the player and what the roll is for, so the same room gives the
//! same loot from the same seed and no two players, ticks or questions share a roll.

/// What a roll decides.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Purpose {
    /// Whether a kill leaves a Vestige.
    Drops = 1,
    /// The colour of a Vestige dropped.
    Colour = 2,
    /// The slot a Vestige holds an item for.
    Slot = 3,
    /// The colour a Vestige opens to.
    Opens = 4,
    /// The kind of item a lesser Vestige opens to, or which named item a Legendary or Atheric one does.
    Which = 5,
    /// A rolled item's name.
    Name = 6,
    /// A rolled item's traits, column by column (the column added to the purpose's number).
    Traits = 16,
    /// The Essence a dismantled Legendary gives back.
    Essence = 7,
}

/// One player's dice for one tick of one room.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Dice {
    pub seed: u64,
    pub tick: u64,
    pub player: u32,
}

/// SplitMix64's finaliser: every bit of the input moves every bit of the output.
fn mix(value: u64) -> u64 {
    let mut mixed = value.wrapping_add(0x9E37_79B9_7F4A_7C15);
    mixed = (mixed ^ (mixed >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    mixed = (mixed ^ (mixed >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    mixed ^ (mixed >> 31)
}

impl Dice {
    /// A number in [0, 1) for this purpose, and for the `nth` of several rolls with the same purpose.
    #[must_use]
    pub fn roll(&self, purpose: Purpose, nth: u32) -> f64 {
        let asked = u64::from(self.player) << 32 | u64::from(purpose as u32 + nth) << 8;
        let hashed = mix(mix(mix(self.seed) ^ self.tick) ^ asked);
        (hashed >> 11) as f64 / (1_u64 << 53) as f64
    }

    /// One of `count` choices, evenly; 0 when there are none.
    #[must_use]
    pub fn pick(&self, purpose: Purpose, nth: u32, count: usize) -> usize {
        let picked = (self.roll(purpose, nth) * count as f64) as usize;
        picked.min(count.saturating_sub(1))
    }

    /// The index of the weight the roll lands in, its chance by its share of the whole; the last when every weight
    /// is none.
    #[must_use]
    pub fn weighted(&self, purpose: Purpose, nth: u32, weights: &[u32]) -> usize {
        let total: u32 = weights.iter().sum();
        let mut landed = self.roll(purpose, nth) * f64::from(total);
        for (index, weight) in weights.iter().enumerate() {
            let weight = f64::from(*weight);
            if landed < weight {
                return index;
            }
            landed -= weight;
        }
        weights.len().saturating_sub(1)
    }
}
