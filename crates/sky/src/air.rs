//! The air a place's weather is made in: how warm it is at sea level, how much rain its year brings, and whether its
//! ground lifts sand. An island's comes from its biome; the open sea's from its latitude.

use crate::heavens::{NORTH_EDGE_DEG, SOUTH_EDGE_DEG, latitude_deg};
use land::biome::{BIOMES, Biome, biome_of};
use land::exact::{clamp, lerp};

/// The sea's warmth at sea level in the map's far north and far south, degrees.
pub const SEA_NORTH_C: f64 = 5.0;
pub const SEA_SOUTH_C: f64 = 27.0;
/// The rain the open sea's year brings, millimetres.
pub const SEA_RAIN_MM: f64 = 1000.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Air {
    pub warmth_c: f64,
    pub rain_mm: f64,
    /// How readily its ground lifts sand or dust in a strong wind, 0 to 1.
    pub sand: f64,
    pub at_sea: bool,
}

impl Air {
    /// The air over an island of a biome.
    #[must_use]
    pub fn of_biome(biome: &Biome) -> Self {
        Self {
            warmth_c: biome.temperature_c,
            rain_mm: biome.climate.rain_mm,
            sand: match biome.key {
                "desert" => 1.0,
                "steppe" => 0.3,
                _ => 0.0,
            },
            at_sea: false,
        }
    }

    /// The air over the open sea `y_m` metres down the map.
    #[must_use]
    pub fn of_sea(y_m: f64) -> Self {
        let south = clamp((NORTH_EDGE_DEG - latitude_deg(y_m)) / (NORTH_EDGE_DEG - SOUTH_EDGE_DEG), 0.0, 1.0);
        Self { warmth_c: lerp(SEA_NORTH_C, SEA_SOUTH_C, south), rain_mm: SEA_RAIN_MM, sand: 0.0, at_sea: true }
    }

    /// The air of a climate by its key, or the sea's where the key names no biome.
    #[must_use]
    pub fn of_climate(key: &str, y_m: f64) -> Self {
        biome_of(key).map_or_else(|| Self::of_sea(y_m), Self::of_biome)
    }

    /// The climate keys this crate knows, in the land's order, then the sea.
    #[must_use]
    pub fn keys() -> Vec<&'static str> {
        BIOMES.iter().map(|biome| biome.key).chain(["sea"]).collect()
    }
}
