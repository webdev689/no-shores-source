//! The fight's one stream of chance: DFO's mulberry32, whole-number steps a machine cannot round differently.

/// A seeded stream of draws in [0, 1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    #[must_use]
    pub const fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    /// The next draw, in [0, 1).
    pub fn draw(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6d2b_79f5);
        let mut mixed = self.state;
        mixed = (mixed ^ (mixed >> 15)).wrapping_mul(mixed | 1);
        mixed ^= mixed.wrapping_add((mixed ^ (mixed >> 7)).wrapping_mul(mixed | 61));
        f64::from(mixed ^ (mixed >> 14)) / 4_294_967_296.0
    }

    /// A seed for another stream drawn from this one, never 0 (DFO's volley seed).
    pub fn seed(&mut self) -> u32 {
        // The draw is under 1, so the product is under 2^32 - 1 and truncates to a whole u32.
        let drawn = (self.draw() * 4_294_967_295.0) as u32;
        drawn.max(1)
    }

    /// A draw between `low` and `high`.
    pub fn between(&mut self, low: f64, high: f64) -> f64 {
        low + (high - low) * self.draw()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn its_draws_are_dfos_mulberry32s() {
        let mut ones = Mulberry32::new(1);
        assert_eq!(
            [ones.draw(), ones.draw(), ones.draw()],
            [0.6270739405881613, 0.002735721180215478, 0.5274470399599522]
        );
        let mut beef = Mulberry32::new(0xdead_beef);
        assert_eq!(
            [beef.draw(), beef.draw(), beef.draw()],
            [0.9413696140982211, 0.26719574979506433, 0.772033357527107]
        );
    }

    #[test]
    fn a_seed_drawn_is_never_nought_and_follows_the_stream() {
        let mut stream = Mulberry32::new(1);
        let seed = stream.seed();
        assert_eq!(seed, (0.6270739405881613 * 4_294_967_295.0) as u32);
        assert!((0..1000).all(|_| stream.seed() > 0));
        let mut same = Mulberry32::new(7);
        let mut again = Mulberry32::new(7);
        assert_eq!(same.between(650.0, 1000.0), again.between(650.0, 1000.0));
    }
}
