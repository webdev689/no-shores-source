//! A landmass made whole: its window, which cells are land, the land the generator makes (relief worked by erosion),
//! the ground with the owner's edits on it, and the water over that ground. Built the same on any machine from the
//! layout alone: the seed is the world's, salted with the landmass's id.

use crate::biome::{Biome, biome_of};
use crate::edits::{self, CellRect, Edits, Problem, Stroke};
use crate::erosion::erode_coarse;
use crate::exact::seed_of;
use crate::grid::Grid;
use crate::ground::Ground;
use crate::relief::{Climate, PLACEHOLDER, coast_distance_km, coast_signed_m, land_mask, relief, window};
use crate::water::{Water, water};
use world::geometry::Point;
use world::layout::Continent;

/// The world's seed. Every landmass's land is generated from it and the landmass's id, which never changes.
pub const WORLD_SEED: u32 = 0x4f56_4c4b;
/// Erosion's grid, in land cells a side, and its steps.
pub const EROSION_FACTOR: usize = 2;
pub const EROSION_STEPS: usize = 40;

#[derive(Debug, Clone)]
pub struct Landmass {
    pub id: String,
    pub seed: u32,
    /// The painted coast, which the places are checked against.
    pub coast: Vec<Point>,
    /// The biome the layout names for it, or None for a landmass with none.
    pub biome: Option<&'static Biome>,
    pub climate: Climate,
    pub land: Vec<bool>,
    /// Each cell centre's distance from the painted coast, metres, positive on land: where the ground's coast runs.
    pub coast_m: Grid,
    /// What the generator makes, before the owner's edits.
    pub generated: Grid,
    /// The owner's edits, from the landmass's edits file and the editor.
    pub edits: Edits,
    /// The ground: the generated land with the owner's edits on it.
    pub ground: Grid,
    pub water: Water,
    /// The ground anywhere, to the metre, with the places' channels, beds and pads: what the runtime samples.
    pub surface: Ground,
}

/// A fingerprint of every ground height's bits (FNV-1a, 64-bit): the same on every machine, or the land disagrees.
#[must_use]
pub fn ground_hash(ground: &Grid) -> u64 {
    ground.data.iter().fold(0xcbf2_9ce4_8422_2325, |hash: u64, value| {
        value
            .to_bits()
            .to_le_bytes()
            .iter()
            .fold(hash, |hash, &byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3))
    })
}

impl Landmass {
    /// Replaces the edits: the ground is the generated land with these on it, and the water runs over it again.
    pub fn set_edits(&mut self, edits: Edits) {
        self.ground = self.generated.clone();
        edits::apply(&mut self.ground, &self.land, &edits);
        self.edits = edits;
        self.settle();
    }

    /// One dab of a stroke, live: `starts` begins a new stroke with this brush, else the dab joins the last one.
    /// The water is not run again until `settle`, so a stroke stays quick.
    pub fn dab(&mut self, brush: &Stroke, point: Point, starts: bool) -> Option<CellRect> {
        match self.edits.strokes.last_mut() {
            Some(last) if !starts => last.points.push(point),
            _ => self.edits.strokes.push(Stroke { points: vec![point], ..brush.clone() }),
        }
        let stroke = self.edits.strokes.last()?.clone();
        edits::dab(&mut self.ground, &self.land, &stroke, point)
    }

    /// Runs the water over the ground as it stands, and lays the places on it.
    pub fn settle(&mut self) {
        self.water = water(&self.ground, &self.land, self.climate.rain_mm);
        self.surface = Ground::new(
            &self.ground,
            &self.coast_m,
            &self.water.lake_level,
            &self.water.rivers,
            &self.edits,
            self.seed,
        );
    }

    /// Every rule the landmass's edits break, its places checked against its coast.
    #[must_use]
    pub fn problems(&self) -> Vec<Problem> {
        edits::check_on(&self.edits, &self.coast)
    }
}

/// The biome a continent is: its `climate` in the layout, if that names one of the nine.
#[must_use]
pub fn biome_of_continent(continent: &Continent) -> Option<&'static Biome> {
    continent.climate.as_deref().and_then(biome_of)
}

/// The climate a continent is generated in: its biome's, or the placeholder for a continent with none.
#[must_use]
pub fn climate_of(continent: &Continent) -> Climate {
    biome_of_continent(continent).map_or(PLACEHOLDER, |biome| biome.climate)
}

/// The most cells a landmass's window may hold: about 2,450 km square, room for the largest continent drawn in any
/// shape, and a bound on the memory and time one landmass may take.
pub const MAX_WINDOW_CELLS: usize = 6_000_000;

/// Generates a continent's land from its painted coast, with the owner's edits on it, or says why it cannot: a coast
/// of fewer than three points, or one whose window is too big.
pub fn generate(continent: &Continent, edits: Edits) -> Result<Landmass, String> {
    if continent.outline.len() < 3 {
        return Err(format!("{}'s coast has fewer than three points", continent.id));
    }
    let climate = climate_of(continent);
    let grid = window(&continent.outline);
    if grid.width * grid.height > MAX_WINDOW_CELLS {
        let (east, south) = (grid.width as f64 * grid.cell_m / 1000.0, grid.height as f64 * grid.cell_m / 1000.0);
        return Err(format!("{} spans {east:.0} × {south:.0} km: too wide a reach to generate", continent.id));
    }
    let land = land_mask(&grid, &continent.outline);
    let coast = coast_distance_km(&grid, &land);
    let coast_m = coast_signed_m(&grid, &continent.outline, &land);
    let seed = seed_of(WORLD_SEED, &continent.id);
    let (elevation, uplift) = relief(&grid, &land, &coast, seed, climate);
    let generated = erode_coarse(&elevation, &uplift, &land, climate.rain_mm, EROSION_STEPS, EROSION_FACTOR);
    let water = Water { rivers: Vec::new(), lake_level: vec![0.0; generated.data.len()] };
    let surface = Ground::new(&generated, &coast_m, &water.lake_level, &[], &Edits::default(), seed);
    let mut landmass = Landmass {
        id: continent.id.clone(),
        seed,
        coast: continent.outline.clone(),
        biome: biome_of_continent(continent),
        surface,
        climate,
        land,
        coast_m,
        edits: Edits::default(),
        ground: generated.clone(),
        water,
        generated,
    };
    landmass.set_edits(edits);
    Ok(landmass)
}
