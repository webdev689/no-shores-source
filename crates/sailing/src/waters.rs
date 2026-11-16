//! Where a ship meets the water: the bed under a point and the water's surface over it at a moment.

use land::ground::{Ground, WaterAt};
use land::sea::Swell;

/// The bed's height at a point and the water's surface over it, metres; no surface where the point is dry.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Spot {
    pub bed: f64,
    pub surface: Option<f64>,
}

/// Water a ship can sail on: the land's, or a test's.
pub trait Waters {
    fn at(&self, x: f64, y: f64, time: f64) -> Spot;
}

/// A landmass's waters: the sea with the swell on it, and its lakes and rivers at their levels.
#[derive(Debug, Clone, Copy)]
pub struct LandWaters<'land> {
    pub ground: &'land Ground,
    pub swell: &'land Swell,
}

impl Waters for LandWaters<'_> {
    fn at(&self, x: f64, y: f64, time: f64) -> Spot {
        let bed = self.ground.height_at(x, y);
        let surface = match self.ground.water_at(x, y) {
            WaterAt::Sea => Some(self.swell.height_at(x, y, time, -bed)),
            WaterAt::Lake { surface } | WaterAt::River { surface } => Some(surface),
            WaterAt::Dry => None,
        };
        Spot { bed, surface }
    }
}
