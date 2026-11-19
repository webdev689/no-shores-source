//! The solids a city's own structures are made of (its landmark, walls, towers, quays and terraces' retaining walls):
//! simple shapes the browser meshes and dresses in the city's pictures, and the server reads as boxes where a node's
//! section reaches them.

use land::exact::sin_cos;
use serde::Serialize;

/// A solid's shape. Every shape stands on the middle of its base, its own x across, y along and z up.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(tag = "shape", rename_all = "lowercase")]
pub enum Shape {
    /// A box.
    Block,
    /// A round column of `sides` faces, its top `top` of its base's width (1 straight, 0 a cone).
    Column { sides: u32, top: f64 },
    /// A half sphere of `sides` faces round, as wide as the solid.
    Dome { sides: u32 },
    /// A four-sided frustum, its top `top` of its base (0 a pyramid).
    Pyramid { top: f64 },
    /// A roof: two slopes meeting along its length (y), gable ends at its ends.
    Gable,
    /// A half-round arch across its width (x), its opening `opening` of its height high, as thick as its depth.
    Arch { opening: f64 },
}

/// What a solid is dressed in; the browser picks each one's picture from the city's climate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Material {
    Stone,
    Trim,
    Roof,
    Timber,
    Plaster,
    Paving,
    Gold,
    Iron,
    Bone,
    /// Glows at night: a beacon's fire, a lantern.
    Glow,
    /// The broken stone heaped in a ruined city: a breach's fall, the rubble along its ways.
    Rubble,
}

/// One solid: its shape, the middle of its base in world metres (z up), its size (width, depth, height), its turn
/// clockwise from north in radians, how far it leans toward its own +y, and its roll about its own y, both radians.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Solid {
    #[serde(flatten)]
    pub shape: Shape,
    pub at: [f64; 3],
    pub size: [f64; 3],
    pub turn: f64,
    pub lean: f64,
    pub roll: f64,
    pub material: Material,
}

impl Solid {
    /// An upright solid, not turned.
    #[must_use]
    pub const fn upright(shape: Shape, at: [f64; 3], size: [f64; 3], material: Material) -> Self {
        Self { shape, at, size, turn: 0.0, lean: 0.0, roll: 0.0, material }
    }

    /// The same solid, turned.
    #[must_use]
    pub const fn turned(self, turn: f64) -> Self {
        Self { turn, ..self }
    }

    /// The solid's footprint and height as a box square to the world: west, north, east, south, bottom, top. A
    /// leaning or rolled solid's box holds the whole of it: round its base, as far as its top swings out.
    #[must_use]
    pub fn bounds(&self) -> [f64; 6] {
        let (sine, cosine) = sin_cos(self.turn);
        let (half_width, half_depth) = (self.size[0] / 2.0, self.size[1] / 2.0);
        let mut reach_east = half_width * cosine.abs() + half_depth * sine.abs();
        let mut reach_south = half_width * sine.abs() + half_depth * cosine.abs();
        if self.lean != 0.0 || self.roll != 0.0 {
            let swing = sin_cos(self.lean).0.abs().max(sin_cos(self.roll).0.abs());
            let tallest = self.size[2] * swing + half_width.max(half_depth) * core::f64::consts::SQRT_2;
            reach_east = reach_east.max(tallest);
            reach_south = reach_south.max(tallest);
        }
        [
            self.at[0] - reach_east,
            self.at[1] - reach_south,
            self.at[0] + reach_east,
            self.at[1] + reach_south,
            self.at[2],
            self.at[2] + self.size[2],
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_leaning_solid_reaches_only_as_far_as_its_top_swings() {
        let lean = 5.0 * core::f64::consts::PI / 180.0;
        let shaft = Solid { lean, ..Solid::upright(Shape::Block, [0.0; 3], [20.0, 20.0, 190.0], Material::Stone) };
        let [west, _, east, _, _, top] = shaft.bounds();
        assert!(east > 190.0 * libm::sin(lean) && east < 35.0, "{east}");
        assert!((west + east).abs() < 1e-9 && (top - 190.0).abs() < 1e-9);
    }

    #[test]
    fn a_turned_block_bounds_its_corners() {
        let block = Solid::upright(Shape::Block, [0.0, 0.0, 5.0], [10.0, 2.0, 3.0], Material::Stone);
        assert_eq!(block.bounds(), [-5.0, -1.0, 5.0, 1.0, 5.0, 8.0]);
        let quarter = block.turned(std::f64::consts::FRAC_PI_2).bounds();
        assert!((quarter[0] + 1.0).abs() < 1e-9 && (quarter[1] + 5.0).abs() < 1e-9, "{quarter:?}");
    }
}
