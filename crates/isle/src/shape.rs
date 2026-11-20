//! An island's shape as its seed draws it: its coast's radius on every bearing, a bay bitten in where it is landed on,
//! cliffs on the far side, a hill toward the far side, and the height at any point, sea level 0, seabed below. Its
//! bearings run clockwise from north, x east and y south. Sines, cosines and arctangents are libm's, in pure Rust.

use crate::Kind;
use crate::coast::Coast;
use crate::draws::{Draws, Noise, mix};
use core::f64::consts::{PI, TAU};

/// The ripples a coast's radius takes round the island: how many to a turn, how strong, where they start.
const RIPPLES: usize = 4;

/// The ground levelled for something set on it: a disc of `radius` at `level`, easing back to the land over `ease`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pad {
    pub at: [f64; 2],
    pub radius: f64,
    pub level: f64,
    pub ease: f64,
}

/// A quarry cut into an isle: its middle, its radius at the rim and how deep it goes, in three terraces.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Quarry {
    pub at: [f64; 2],
    pub radius: f64,
    pub depth: f64,
}

#[derive(Clone, Debug)]
pub struct Shape {
    /// Its radius before its coast ripples, metres.
    pub radius: f64,
    /// The bearing it is landed on: its bay and beach face it.
    pub landing: f64,
    ripples: [(f64, f64); RIPPLES],
    bay: f64,
    /// Its hill's top and how high it stands.
    pub peak: [f64; 2],
    pub height: f64,
    cliffs: f64,
    noise: Noise,
    pub quarry: Option<Quarry>,
    pub pads: Vec<Pad>,
    /// The coast's distance once laid (`lay_coast`); till then the radial measure stands for it.
    coast: Option<Coast>,
}

/// The way a bearing points: x east, y south.
#[must_use]
pub fn way(bearing: f64) -> [f64; 2] {
    [libm::sin(bearing), -libm::cos(bearing)]
}

/// The bearing of a point from the island's middle.
#[must_use]
pub fn bearing_of([x, y]: [f64; 2]) -> f64 {
    libm::atan2(x, -y).rem_euclid(TAU)
}

/// How far apart two bearings are, either way round, in [0, PI].
#[must_use]
pub fn apart(one: f64, other: f64) -> f64 {
    ((one - other + PI).rem_euclid(TAU) - PI).abs()
}

/// 1 at 0, easing to 0 at 1 and past it.
fn bump(along: f64) -> f64 {
    let inside = (1.0 - along * along).max(0.0);
    inside * inside
}

/// 0 below `low`, 1 above `high`, eased between.
#[must_use]
pub fn smooth(low: f64, high: f64, value: f64) -> f64 {
    let along = ((value - low) / (high - low)).clamp(0.0, 1.0);
    along * along * (3.0 - 2.0 * along)
}

impl Shape {
    /// An island's shape from its seed and kind, its hill as high as its climate's relief makes it.
    #[must_use]
    pub fn new(seed: u64, kind: Kind, relief: f64) -> Self {
        let mut draws = Draws::of(seed, 1);
        // The reach drawn, half of how far it is across: its radius is found to give it once its coast ripples.
        let wanted = if kind == Kind::Cove { draws.between(66.0, 90.0) } else { draws.between(150.0, 250.0) };
        let landing = draws.between(0.0, TAU);
        let strength = if kind == Kind::Cove { 0.2 } else { 0.24 };
        let ripples = core::array::from_fn(|nth| {
            (strength * draws.between(0.35, 1.0) / (nth as f64 + 1.0), draws.between(0.0, TAU))
        });
        let bay = if kind == Kind::Cove { draws.between(0.32, 0.46) } else { draws.between(0.14, 0.24) };
        let height = relief
            * match kind {
                Kind::Cove => draws.between(7.0, 14.0),
                Kind::Ruin => draws.between(20.0, 34.0),
                Kind::Quarry => draws.between(18.0, 30.0),
            };
        let (behind, off) = (draws.between(-0.5, 0.5), draws.between(0.15, 0.32));
        let cliffs = draws.between(0.6, 1.4);
        let noise = Noise::new(mix(seed, 2));
        let unit = Shape {
            radius: 1.0,
            landing,
            ripples,
            bay,
            peak: [0.0; 2],
            height,
            cliffs,
            noise,
            quarry: None,
            pads: Vec::new(),
            coast: None,
        };
        let radius = wanted / unit.reach();
        let behind = way(landing + PI + behind);
        let off = radius * off;
        Shape { radius, peak: [behind[0] * off, behind[1] * off], ..unit }
    }

    /// How much of the bay a bearing lies in: 1 facing the landing, 0 past 0.6 radians either side.
    #[must_use]
    pub fn bayness(&self, bearing: f64) -> f64 {
        bump(apart(bearing, self.landing) / 0.6)
    }

    /// The coast's radius on a bearing, metres.
    #[must_use]
    pub fn edge(&self, bearing: f64) -> f64 {
        let ripple = self
            .ripples
            .iter()
            .enumerate()
            .map(|(nth, &(strength, start))| strength * libm::cos((nth as f64 + 2.0) * bearing + start));
        // Past each side of the bay a headland juts out, so a cove's beach lies between two arms of the land.
        let side = (apart(bearing, self.landing) - 0.62) / 0.3;
        let headland = 0.45 * self.bay * bump(side);
        self.radius * (1.0 + ripple.sum::<f64>()) * (1.0 - self.bay * self.bayness(bearing) + headland)
    }

    /// Where a ship anchors off the beach: `ANCHORAGE_OFF_M` past the coast on the landing's bearing.
    #[must_use]
    pub fn anchorage(&self) -> [f64; 2] {
        let [x, y] = way(self.landing);
        let off = self.edge(self.landing) + crate::sites::ANCHORAGE_OFF_M;
        [x * off, y * off]
    }

    /// The coast on `count` bearings, `off` metres out past it: the ring a ship keeps outside.
    #[must_use]
    pub fn ring(&self, count: u32, off: f64) -> Vec<[f64; 2]> {
        let point = |nth: u32| {
            let bearing = f64::from(nth) * TAU / f64::from(count);
            let [x, y] = way(bearing);
            [x * (self.edge(bearing) + off), y * (self.edge(bearing) + off)]
        };
        (0..count).map(point).collect()
    }

    /// The farthest the coast reaches on any bearing, judged every half degree.
    #[must_use]
    pub fn reach(&self) -> f64 {
        (0..720).map(|step| self.edge(f64::from(step) * TAU / 720.0)).fold(0.0, f64::max)
    }

    /// How much cliff the coast is on a bearing, 0 to its climate's `cliffs` times the seed's: the far side from the
    /// landing, never in the bay.
    #[must_use]
    pub fn cliffness(&self, bearing: f64, cliffs: f64) -> f64 {
        let far = smooth(-0.15, 0.55, -libm::cos(bearing - self.landing));
        let wavering = 0.5 + 0.5 * self.noise.at(bearing * 2.2, 7.5);
        (cliffs * self.cliffs * far * (0.55 + 0.9 * wavering)).min(1.0) * (1.0 - self.bayness(bearing))
    }

    /// Lays the coast's distance over `half` metres each way of the middle, in cells of `cell` metres.
    pub fn lay_coast(&mut self, half: f64, cell: f64) {
        let radial = |at: [f64; 2]| self.edge(bearing_of(at)) - (at[0] * at[0] + at[1] * at[1]).sqrt();
        self.coast = Some(Coast::new(half, cell, &radial));
    }

    /// How far in from the coast a point lies, metres, negative at sea.
    #[must_use]
    pub fn inland(&self, at: [f64; 2]) -> f64 {
        let radial = self.edge(bearing_of(at)) - (at[0] * at[0] + at[1] * at[1]).sqrt();
        self.coast.as_ref().map_or(radial, |coast| coast.inland(at, radial))
    }

    /// The ground's height at a point before any pad or quarry, metres above the sea.
    #[must_use]
    pub fn natural(&self, [x, y]: [f64; 2], cliffs: f64) -> f64 {
        let bearing = bearing_of([x, y]);
        let inland = self.inland([x, y]);
        let grain = self.noise.fractal(x / 36.0, y / 36.0, 3);
        let bay = self.bayness(bearing);
        if inland <= 0.0 {
            // The seabed shelves gently off the beach and falls steeply elsewhere, to 14 m down.
            let slope = 0.32 - 0.24 * bay;
            return (inland * slope).max(-14.0 + grain);
        }
        // The beach widens toward the landing's strand by distance from it, not by bearing, which swings fast near
        // the middle and would cut a groove behind the bay.
        let strand = way(self.landing);
        let strand = [strand[0] * self.edge(self.landing), strand[1] * self.edge(self.landing)];
        let (off_x, off_y) = (x - strand[0], y - strand[1]);
        let near = bump((off_x * off_x + off_y * off_y).sqrt() / (0.7 * self.radius));
        let beach = ((0.05 + 0.13 * near) * self.radius).clamp(4.0, 24.0);
        let shore = 1.2 * (inland / beach).min(1.0);
        let rise = smooth(beach, beach + 0.4 * self.radius, inland);
        let (from_x, from_y) = (x - self.peak[0], y - self.peak[1]);
        let span = self.radius * 1.15;
        let dome = (1.0 - (from_x * from_x + from_y * from_y) / (span * span)).max(0.0);
        let hill = (self.height * dome * dome.sqrt() - 1.2).max(0.0) + grain * 0.14 * self.height;
        let land = shore + hill.max(0.0) * rise;
        let cliff = self.cliffness(bearing, cliffs) * (1.0 - smooth(0.15 * self.radius, 0.35 * self.radius, inland));
        if cliff <= 0.0 {
            return land;
        }
        let top = self.height * (0.45 + 0.12 * grain) * smooth(0.0, 0.06 * self.radius, inland);
        land + (top.max(land) - land) * cliff
    }

    /// The ground's height at a point: the natural ground, cut by the quarry and levelled by each pad in turn.
    #[must_use]
    pub fn height(&self, at: [f64; 2], cliffs: f64) -> f64 {
        let mut height = self.natural(at, cliffs);
        if let Some(quarry) = self.quarry {
            height = height.min(quarried(quarry, at, self.natural(quarry.at, cliffs)));
        }
        for pad in &self.pads {
            let (along_x, along_y) = (at[0] - pad.at[0], at[1] - pad.at[1]);
            let off = (along_x * along_x + along_y * along_y).sqrt();
            height = pad.level + (height - pad.level) * smooth(pad.radius, pad.radius + pad.ease, off);
        }
        height
    }
}

/// A quarry's floor at a point: three terraces down from its rim at `rim` metres, each a third of its depth, a steep
/// face between them, and the land past its rim untouched.
fn quarried(quarry: Quarry, [x, y]: [f64; 2], rim: f64) -> f64 {
    let (along_x, along_y) = (x - quarry.at[0], y - quarry.at[1]);
    let off = (along_x * along_x + along_y * along_y).sqrt() / quarry.radius;
    if off >= 1.0 {
        return f64::INFINITY;
    }
    let step = (3.0 * (1.0 - off)).min(2.999);
    let terrace = step.floor() + smooth(0.0, 0.3, step.fract());
    rim - quarry.depth * terrace / 3.0
}
