//! A landmass made whole: its window, which cells are land, the land the generator makes (relief worked by erosion),
//! the ground with the owner's edits on it, and the water over that ground. Built the same on any machine from the
//! layout alone: the seed is the world's, salted with the landmass's id.

use crate::erosion::erode_coarse;
use crate::exact::seed_of;
use crate::grid::Grid;
use crate::relief::{Climate, PLACEHOLDER, coast_distance_km, land_mask, relief, window};
use crate::water::{Water, water};
use world::layout::Continent;

/// The world's seed. Every landmass's land is generated from it and the landmass's id, which never changes.
pub const WORLD_SEED: u32 = 0x4f56_4c4b;
/// Erosion's grid, in land cells a side, and its steps.
pub const EROSION_FACTOR: usize = 2;
pub const EROSION_STEPS: usize = 40;

#[derive(Debug, Clone)]
pub struct Landmass {
    pub id: String,
    pub climate: Climate,
    pub land: Vec<bool>,
    /// What the generator makes, before the owner's edits.
    pub generated: Grid,
    /// The ground: the generated land with the owner's edits on it.
    pub ground: Grid,
    pub water: Water,
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

/// The climate a continent is generated in: the placeholder until the owner chooses the nine.
#[must_use]
pub fn climate_of(_continent: &Continent) -> Climate {
    PLACEHOLDER
}

/// Generates a continent's land from its painted coast.
#[must_use]
pub fn generate(continent: &Continent) -> Landmass {
    let climate = climate_of(continent);
    let grid = window(&continent.outline);
    let land = land_mask(&grid, &continent.outline);
    let coast = coast_distance_km(&grid, &land);
    let (elevation, uplift) = relief(&grid, &land, &coast, seed_of(WORLD_SEED, &continent.id), climate);
    let generated = erode_coarse(&elevation, &uplift, &land, climate.rain_mm, EROSION_STEPS, EROSION_FACTOR);
    let water = water(&generated, &land, climate.rain_mm);
    Landmass { id: continent.id.clone(), climate, land, ground: generated.clone(), generated, water }
}
