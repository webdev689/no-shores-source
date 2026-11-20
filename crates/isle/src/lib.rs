//! The sea's procedural islands. The sea room rolls each one as a place and a seed in hostile waters; every machine
//! near it builds the same island from the seed and its water's climate: its shape and fine ground (a grid of heights
//! 2 m apart, the continents' 1 km cells being far too coarse), its places (`sites`) and its dressing of modules
//! made in Blender (`dressing`, content/islands/kits.json). Most are coves about 150 m across; about one in eight is
//! an isle of 300 to 500 m, a ruin or a quarry, with a landmark and guards. Its frame is its own: metres from its
//! middle, x east, y south.

pub mod catalog;
pub mod coast;
pub mod draws;
pub mod dressing;
pub mod shape;
pub mod sites;

use crate::catalog::catalog;
use crate::draws::Draws;
use crate::shape::Shape;
use crate::sites::Sites;
use movement::{Block, Heights};

/// How far apart the ground's heights are, metres.
pub const CELL_M: f64 = 2.0;
/// How far past the coast's farthest reach the ground is laid, metres: past the anchorage and the section's shallows.
pub const SHELF_M: f64 = 60.0;

/// What kind of island a seed makes: a cove, or an isle that is a ruin or a quarry. Each has its dungeon's style.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Cove,
    Ruin,
    Quarry,
}

impl Kind {
    pub const ALL: [Kind; 3] = [Kind::Cove, Kind::Ruin, Kind::Quarry];

    /// The kind a seed makes: one in eight an isle, a ruin or a quarry alike.
    #[must_use]
    pub fn of(seed: u64) -> Self {
        let mut draws = Draws::of(seed, 0);
        if draws.unit() >= 0.125 {
            Kind::Cove
        } else if draws.unit() < 0.5 {
            Kind::Ruin
        } else {
            Kind::Quarry
        }
    }

    /// The style of the dungeon behind its door, as the dungeons' kits name it: caverns in a cove, a crypt in a ruin,
    /// mines where it is quarried.
    #[must_use]
    pub fn dungeon(self) -> &'static str {
        match self {
            Kind::Cove => "caverns",
            Kind::Ruin => "crypt",
            Kind::Quarry => "mines",
        }
    }

    /// Its number on the wire.
    #[must_use]
    pub fn number(self) -> u8 {
        match self {
            Kind::Cove => 0,
            Kind::Ruin => 1,
            Kind::Quarry => 2,
        }
    }

    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Kind::Cove => "cove",
            Kind::Ruin => "ruin",
            Kind::Quarry => "quarry",
        }
    }

    /// Whether it is an isle, with a landmark and guards.
    #[must_use]
    pub fn is_isle(self) -> bool {
        self != Kind::Cove
    }
}

/// One module set on the island: its number in the catalog, where its base's middle stands, the bearing its front
/// faces, its size against the module's, and how much taller again (a cliff's face, raised to its land).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Placement {
    pub module: u16,
    pub at: [f64; 3],
    pub turn: f64,
    pub scale: f64,
    pub lift: f64,
}

/// An island built from its seed: its kind and climate, its shape, its ground, its places, every module set on it and
/// the blocks their solids stand as.
#[derive(Clone, Debug)]
pub struct Plan {
    pub seed: u64,
    pub kind: Kind,
    pub climate: String,
    pub shape: Shape,
    pub ground: Heights,
    pub sites: Sites,
    pub placements: Vec<Placement>,
    pub blocks: Vec<Block>,
    pub ring: Vec<[f64; 2]>,
}

/// An island's shape from its seed alone, its hill as high as any climate's: its coast, reach and anchorage, which
/// no climate changes, for the sea to judge ships by.
#[must_use]
pub fn shape_of(seed: u64) -> Shape {
    Shape::new(seed, Kind::of(seed), 1.0)
}

/// How far the island's coast reaches from its middle at most, metres.
#[must_use]
pub fn reach_of(seed: u64) -> f64 {
    shape_of(seed).reach()
}

/// How far each way of the island's middle its ground is laid, metres: a whole number of cells.
fn half_of(shape: &Shape) -> f64 {
    ((shape.reach() + SHELF_M) / CELL_M).ceil() * CELL_M
}

/// The ground under the shape, a grid of heights square on the island's middle.
fn ground_of(shape: &Shape, cliffs: f64) -> Heights {
    let half = half_of(shape);
    let cells = (2.0 * half / CELL_M) as usize;
    let mut heights = Vec::with_capacity(cells * cells);
    for row in 0..cells {
        for column in 0..cells {
            let at = [-half + (column as f64 + 0.5) * CELL_M, -half + (row as f64 + 0.5) * CELL_M];
            heights.push(Some(shape.height(at, cliffs)));
        }
    }
    Heights::new(-half, -half, CELL_M, cells, cells, heights).unwrap_or_else(|| unreachable!("a grid of its own cells"))
}

impl Plan {
    /// The island a seed makes in a climate (the layout's id of its water's continent's, `desert` or `tundra`), or none
    /// for a climate the islands' contract does not dress.
    #[must_use]
    pub fn new(seed: u64, climate: &str) -> Option<Self> {
        let dressing = catalog().climates.get(climate)?;
        let kind = Kind::of(seed);
        let mut shape = Shape::new(seed, kind, dressing.relief);
        shape.lay_coast(half_of(&shape), CELL_M);
        let sites = Sites::new(&mut shape, dressing.cliffs, kind, seed);
        let ground = ground_of(&shape, dressing.cliffs);
        let placements = dressing::dress(&shape, &ground, &sites, (kind, dressing), seed);
        let blocks = dressing::blocks(&placements);
        let ring = Sites::ring(&shape);
        Some(Plan { seed, kind, climate: climate.to_owned(), shape, ground, sites, placements, blocks, ring })
    }
}

#[cfg(test)]
mod tests;
