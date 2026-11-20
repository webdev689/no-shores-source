//! Fields that drift with the weather: fractal noise carried east or west by the steering flow and changing as it
//! goes. Each field is two noises a spell apart, each carried from its own moment and the one fading into the next,
//! so a pattern moves with the wind and is a new one after a while, with no seam and no drift growing without end.

use land::exact::{fbm, hash32, smooth};

/// How fast weather is carried east, m/s: the westerlies blow north of 36 degrees, the trades blow west south of
/// 20, and between them the flow slackens and turns.
pub const WESTERLIES_M_S: f64 = 30.0;
pub const TRADES_M_S: f64 = -18.0;

/// The steering flow at a latitude, m/s east.
#[must_use]
pub fn steering_m_s(latitude_deg: f64) -> f64 {
    TRADES_M_S + (WESTERLIES_M_S - TRADES_M_S) * smooth(20.0, 36.0, latitude_deg)
}

/// One drifting field.
#[derive(Debug, Clone, Copy)]
pub struct Drift {
    pub seed: u32,
    /// The size of its features, metres, and how long one pattern lasts, seconds.
    pub scale_m: f64,
    pub spell_s: f64,
    pub octaves: u32,
    /// How much of the steering flow carries it.
    pub carried: f64,
}

impl Drift {
    /// The field at (x, y) at `world_s`, carried at `steering` m/s east: about -1 to 1, its spread the same through
    /// every fade.
    #[must_use]
    pub fn at(&self, x: f64, y: f64, world_s: f64, steering: f64) -> f64 {
        let spells = world_s / self.spell_s;
        let index = spells.floor();
        let fade = smooth(0.0, 1.0, spells - index);
        let field = |spell: f64| {
            let shift = self.carried * steering * (world_s - spell * self.spell_s);
            let seed = hash32(&[i64::from(self.seed), spell as i64]);
            fbm(seed, (x - shift) / self.scale_m, y / self.scale_m, self.octaves)
        };
        let (from, to) = (field(index), field(index + 1.0));
        (from * (1.0 - fade) + to * fade) / ((1.0 - fade) * (1.0 - fade) + fade * fade).sqrt()
    }
}
