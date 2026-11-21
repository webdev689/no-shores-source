//! An island's chances: one stream of numbers from a seed (SplitMix64), and value noise over the plane, made of
//! integer sums and + - * / alone, so every machine draws the same island.

/// A stream of draws from a seed.
#[derive(Clone, Debug)]
pub struct Draws {
    state: u64,
}

/// SplitMix64's finaliser: a seed mixed with a salt into a number with no pattern left in it.
#[must_use]
pub fn mix(seed: u64, salt: u64) -> u64 {
    let mut mixed = (seed ^ salt.wrapping_mul(0x9e37_79b9_7f4a_7c15)).wrapping_add(0x9e37_79b9_7f4a_7c15);
    mixed = (mixed ^ (mixed >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    mixed = (mixed ^ (mixed >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    mixed ^ (mixed >> 31)
}

/// A whole number's 53 high bits as a share in [0, 1): exact on every machine.
fn share(number: u64) -> f64 {
    (number >> 11) as f64 / (1_u64 << 53) as f64
}

impl Draws {
    #[must_use]
    pub fn new(seed: u64) -> Self {
        Draws { state: seed }
    }

    /// A stream of its own for one part of the island, so a part drawn more or less leaves the others as they were.
    #[must_use]
    pub fn of(seed: u64, part: u64) -> Self {
        Draws { state: mix(seed, part) }
    }

    pub fn next_whole(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        mix(self.state, 0)
    }

    /// A share in [0, 1).
    pub fn unit(&mut self) -> f64 {
        share(self.next_whole())
    }

    /// A number in [low, high).
    pub fn between(&mut self, low: f64, high: f64) -> f64 {
        low + (high - low) * self.unit()
    }

    /// One of `count` things, 0 for none.
    pub fn index(&mut self, count: usize) -> usize {
        ((self.unit() * count as f64) as usize).min(count.saturating_sub(1))
    }

    /// One of the things, or none of none.
    pub fn pick<'item, Item>(&mut self, items: &'item [Item]) -> Option<&'item Item> {
        items.get(self.index(items.len()))
    }
}

/// Value noise: a number in [-1, 1] at each whole point of the plane, eased between them.
#[derive(Clone, Copy, Debug)]
pub struct Noise {
    seed: u64,
}

impl Noise {
    #[must_use]
    pub fn new(seed: u64) -> Self {
        Noise { seed }
    }

    fn lattice(self, column: i64, row: i64) -> f64 {
        let point = (column as u64).wrapping_mul(0x8da6_b343).wrapping_add((row as u64).wrapping_mul(0xd816_3841));
        share(mix(self.seed, point)) * 2.0 - 1.0
    }

    /// The noise at a point, its lattice one unit apart.
    #[must_use]
    pub fn at(self, x: f64, y: f64) -> f64 {
        let (column, row) = (x.floor(), y.floor());
        let ease = |along: f64| along * along * (3.0 - 2.0 * along);
        let (east, south) = (ease(x - column), ease(y - row));
        let (column, row) = (column as i64, row as i64);
        let north = self.lattice(column, row) + (self.lattice(column + 1, row) - self.lattice(column, row)) * east;
        let below =
            self.lattice(column, row + 1) + (self.lattice(column + 1, row + 1) - self.lattice(column, row + 1)) * east;
        north + (below - north) * south
    }

    /// Octaves of the noise, each twice as fine and half as strong as the last, kept within [-1, 1].
    #[must_use]
    pub fn fractal(self, x: f64, y: f64, octaves: u32) -> f64 {
        let (mut sum, mut strength, mut fineness, mut total) = (0.0, 1.0, 1.0, 0.0);
        for octave in 0..octaves {
            let shifted = Noise { seed: mix(self.seed, u64::from(octave)) };
            sum += shifted.at(x * fineness, y * fineness) * strength;
            total += strength;
            strength *= 0.5;
            fineness *= 2.0;
        }
        sum / total
    }
}
