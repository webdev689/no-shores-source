//! The solids a city's own structures are made of (its landmark, walls, towers, quays and terraces' retaining walls):
//! simple shapes the browser meshes and dresses in the city's pictures, and the server reads as boxes where a node's
//! section reaches them.

use land::exact::sin_cos;
use serde::{Deserialize, Serialize};

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
    /// Natural rock (`rock`): a thick slab spanning a cavern, its underside rough, standing on its underside.
    CaveRoof { seed: u32 },
    /// Natural rock: a mass against a face at its -y end, its lip jutting toward +y over the ground.
    Overhang { seed: u32 },
    /// Natural rock: an arch across its width (x), heavier than the built one, its opening square-shouldered.
    RockArch { seed: u32 },
    /// Natural rock: a frame round an opening along y into rising rock, a brow jutting over it at its -y side.
    TunnelMouth { seed: u32 },
    /// One surface group of a handcrafted module (`modules`), drawn from its mesh; its first group carries its parts.
    Module { module: u32, group: u32 },
}

/// What a solid is dressed in; the browser picks each one's picture from the city's climate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Material {
    Stone,
    Trim,
    Roof,
    Timber,
    Plaster,
    Paving,
    /// A walk's dressed flagstones, laid over a court's paving so the way reads apart from the ground.
    Path,
    /// A garden's lawn, and a working yard's trodden earth, laid over the paving where no way runs.
    Lawn,
    Earth,
    Gold,
    Iron,
    Bone,
    /// Rough natural stone, as the terraces' rubble: boulders, outcrops and the rock of cliffs.
    Rubble,
    /// Glows at night: a beacon's fire, a lantern.
    Glow,
    /// Cloth, in plain dyed colours: awnings, banners, curtains, hangings and bolts. Undyed linen and canvas.
    Linen,
    Crimson,
    Verdant,
    Black,
    /// Straw and hay: bales, a cart's load, a stable's bedding.
    Straw,
    /// A faction's own cloth, dyed as its capes are (content/gear/cosmetics.json names each dye).
    #[serde(rename = "stormcaller_blue")]
    StormcallerBlue,
    #[serde(rename = "lamplighter_gold")]
    LamplighterGold,
    #[serde(rename = "veiled_dusk")]
    VeiledDusk,
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
    /// leaning or rolled solid's box holds its turned corners, so no more than the whole of it.
    #[must_use]
    pub fn bounds(&self) -> [f64; 6] {
        let (half_width, half_depth) = (self.size[0] / 2.0, self.size[1] / 2.0);
        self.bounds_of([-half_width, -half_depth, 0.0, half_width, half_depth, self.size[2]])
    }

    /// A box of the solid's own frame (its low x, y and z, then its high ones) as a box square to the world round
    /// its turned corners: west, north, east, south, bottom, top.
    #[must_use]
    pub fn bounds_of(&self, own: [f64; 6]) -> [f64; 6] {
        let start =
            [f64::INFINITY, f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
        let mut found = start;
        let turns = self.turns();
        for corner in 0..8 {
            let x = if corner & 1 == 0 { own[0] } else { own[3] };
            let y = if corner & 2 == 0 { own[1] } else { own[4] };
            let z = if corner & 4 == 0 { own[2] } else { own[5] };
            for (axis, value) in self.placed([x, y, z], turns).into_iter().enumerate() {
                found[axis] = found[axis].min(value);
                found[axis + 3] = found[axis + 3].max(value);
            }
        }
        [found[0], found[1], found[3], found[4], found[2], found[5]]
    }

    /// A point of the solid's own frame in the world: rolled about its y, leaned toward its +y, turned and stood at
    /// its place, as the browser draws it (client/src/city/solidMesh.ts solidTurn).
    #[must_use]
    pub fn place(&self, point: [f64; 3]) -> [f64; 3] {
        self.placed(point, self.turns())
    }

    /// The sines and cosines of its roll, lean and turn, worked once for every point a caller places.
    fn turns(&self) -> [(f64, f64); 3] {
        [sin_cos(self.roll), sin_cos(self.lean), sin_cos(self.turn)]
    }

    /// A point of its own frame in the world, as `place`, from its turns' sines and cosines.
    fn placed(&self, [x, y, z]: [f64; 3], turns: [(f64, f64); 3]) -> [f64; 3] {
        let [(roll_sine, roll_cosine), (lean_sine, lean_cosine), (sine, cosine)] = turns;
        let (x, z) = (x * roll_cosine + z * roll_sine, -x * roll_sine + z * roll_cosine);
        let (y, z) = (y * lean_cosine + z * lean_sine, -y * lean_sine + z * lean_cosine);
        [self.at[0] + x * cosine - y * sine, self.at[1] + x * sine + y * cosine, self.at[2] + z]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_leaning_solid_reaches_only_as_far_as_its_top_swings() {
        let lean = 5.0 * core::f64::consts::PI / 180.0;
        let shaft = Solid { lean, ..Solid::upright(Shape::Block, [0.0; 3], [20.0, 20.0, 190.0], Material::Stone) };
        let [west, north, east, south, bottom, top] = shaft.bounds();
        let (sine, cosine) = (libm::sin(lean), libm::cos(lean));
        // It leans toward its own +y, south when not turned: its top's far edge swings out, its foot's near edge in.
        assert!((south - (190.0 * sine + 10.0 * cosine)).abs() < 1e-9, "{south}");
        assert!((north + 10.0 * cosine).abs() < 1e-9 && (west + 10.0).abs() < 1e-9 && (east - 10.0).abs() < 1e-9);
        assert!((bottom + 10.0 * sine).abs() < 1e-9 && (top - (190.0 * cosine + 10.0 * sine)).abs() < 1e-9);
    }

    #[test]
    fn a_turned_block_bounds_its_corners() {
        let block = Solid::upright(Shape::Block, [0.0, 0.0, 5.0], [10.0, 2.0, 3.0], Material::Stone);
        assert_eq!(block.bounds(), [-5.0, -1.0, 5.0, 1.0, 5.0, 8.0]);
        let quarter = block.turned(std::f64::consts::FRAC_PI_2).bounds();
        assert!((quarter[0] + 1.0).abs() < 1e-9 && (quarter[1] + 5.0).abs() < 1e-9, "{quarter:?}");
    }

    #[test]
    fn cloth_reads_by_the_names_the_page_and_the_dyes_give_it() {
        let read = |name: &str| serde_json::from_str::<Material>(&format!("\"{name}\"")).ok();
        assert_eq!(read("linen"), Some(Material::Linen));
        assert_eq!(read("black"), Some(Material::Black));
        assert_eq!(read("stormcaller_blue"), Some(Material::StormcallerBlue));
        assert_eq!(read("lamplighter_gold"), Some(Material::LamplighterGold));
        assert_eq!(read("veiled_dusk"), Some(Material::VeiledDusk));
    }
}
