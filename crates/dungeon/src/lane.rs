//! The draws a dungeon's laws make, each from a lane named for what it draws, so no law's draws move another's.

/// A number for a name, the same every time: FNV-1a over its bytes.
#[must_use]
pub fn named(name: &str) -> u32 {
    name.bytes().fold(0x811c_9dc5, |hash, byte| (hash ^ u32::from(byte)).wrapping_mul(0x0100_0193))
}

/// A stream of draws in [0, 1): Mulberry32, as DFO's lanes draw.
#[derive(Clone, Debug)]
pub struct Lane {
    state: u32,
}

impl Lane {
    #[must_use]
    pub fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    /// The lane named `name`.
    #[must_use]
    pub fn named(name: &str) -> Self {
        Self::new(named(name))
    }

    /// The next draw, in [0, 1).
    pub fn draw(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6d2b_79f5);
        let mut mixed = self.state;
        mixed = (mixed ^ (mixed >> 15)).wrapping_mul(mixed | 1);
        mixed ^= mixed.wrapping_add((mixed ^ (mixed >> 7)).wrapping_mul(mixed | 61));
        f64::from(mixed ^ (mixed >> 14)) / 4_294_967_296.0
    }

    /// A whole number from `low` to `high`, both included.
    pub fn int(&mut self, low: usize, high: usize) -> usize {
        low + self.below(high + 1 - low)
    }

    /// A whole number below `count`.
    pub fn below(&mut self, count: usize) -> usize {
        ((self.draw() * count as f64) as usize).min(count.saturating_sub(1))
    }

    /// Whether a draw falls under `share`.
    pub fn chance(&mut self, share: f64) -> bool {
        self.draw() < share
    }
}
