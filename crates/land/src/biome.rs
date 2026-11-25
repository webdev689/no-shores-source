//! The nine biomes a continent can be, one each: the climate its land is generated in, the colour of its ground and
//! its snow line. Each starts from one of World 2.0's climate profiles and one of its biomes' colours, under our own
//! names.

use crate::relief::Climate;

/// A biome: its key in the layout, the climate its land is generated in, its mean temperature at sea level and the
/// colour of its low ground (red, green, blue).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Biome {
    pub key: &'static str,
    pub climate: Climate,
    pub temperature_c: f64,
    pub ground: [u8; 3],
}

/// How fast the air cools with height, degrees a metre: World 2.0's lapse rate.
pub const LAPSE_C_PER_M: f64 = 0.0065;
/// Snow lies where the mean temperature falls to this.
pub const SNOW_C: f64 = -2.0;

/// A profile's range height is doubled: World 2.0 adds it to Daggerfall's own relief, which this land has no copy
/// of, so the range here carries the mountains' whole height. Doubled, the steppe's equals `PLACEHOLDER`'s.
const fn biome(
    key: &'static str,
    temperature_c: f64,
    rain_mm: f64,
    rugged: f64,
    range_m: f64,
    ground: [u8; 3],
) -> Biome {
    Biome { key, climate: Climate { rain_mm, rugged, range_m: 2.0 * range_m }, temperature_c, ground }
}

pub const BIOMES: [Biome; 9] = [
    biome("temperate-coast", 13.0, 900.0, 1.0, 900.0, [80, 140, 76]),
    biome("highland", 11.0, 1100.0, 1.1, 1100.0, [50, 96, 72]),
    biome("woodland", 15.0, 950.0, 1.0, 1200.0, [70, 120, 56]),
    biome("desert", 22.0, 280.0, 1.2, 1250.0, [226, 196, 130]),
    biome("savanna", 21.0, 420.0, 1.1, 700.0, [184, 170, 84]),
    biome("rainforest", 22.0, 1900.0, 0.8, 700.0, [30, 104, 44]),
    biome("steppe", 14.0, 640.0, 1.2, 1300.0, [176, 168, 98]),
    biome("swamp", 21.0, 2100.0, 0.5, 500.0, [62, 92, 60]),
    biome("tundra", 2.0, 650.0, 1.4, 1500.0, [150, 156, 130]),
];

/// The biome a layout's `climate` names, or None for one it does not.
#[must_use]
pub fn biome_of(key: &str) -> Option<&'static Biome> {
    BIOMES.iter().find(|biome| biome.key == key)
}

impl Biome {
    /// The height, metres, above which snow lies.
    #[must_use]
    pub fn snow_m(&self) -> f64 {
        (self.temperature_c - SNOW_C) / LAPSE_C_PER_M
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::landmass::generate;

    #[test]
    fn each_biome_has_its_own_key_and_a_snow_line_by_its_warmth() {
        let mut keys: Vec<&str> = BIOMES.iter().map(|biome| biome.key).collect();
        keys.sort_unstable();
        keys.dedup();
        assert_eq!(keys.len(), BIOMES.len());
        let snow = |key| biome_of(key).unwrap().snow_m();
        assert!(snow("tundra") < 700.0, "{}", snow("tundra"));
        assert!(snow("highland") < snow("temperate-coast") && snow("temperate-coast") < snow("desert"));
        assert!(biome_of("ashland").is_none());
        assert_eq!(biome_of("steppe").unwrap().climate.range_m, crate::relief::PLACEHOLDER.range_m);
    }

    /// The mean and highest land of a square continent generated as `key`.
    fn heights(key: &str) -> (f64, f64) {
        let text = format!(
            r#"{{ "continents": [{{ "id": "square", "outline": [[200000, 300000], [400000, 300000], [400000, 500000], [200000, 500000]], "climate": "{key}" }}], "isles": [] }}"#
        );
        let layout = world::layout::parse(&text).unwrap();
        let landmass = generate(&layout.continents[0], crate::edits::Edits::default()).unwrap();
        assert_eq!(landmass.biome.map(|biome| biome.key), Some(key));
        let land: Vec<f64> = landmass.ground.data.iter().copied().filter(|&height| height > 0.0).collect();
        (land.iter().sum::<f64>() / land.len() as f64, land.iter().copied().fold(0.0, f64::max))
    }

    #[test]
    fn a_swamp_lies_lower_and_flatter_than_the_tundra() {
        let (swamp_mean, swamp_top) = heights("swamp");
        let (tundra_mean, tundra_top) = heights("tundra");
        assert!(swamp_mean < tundra_mean, "{swamp_mean} {tundra_mean}");
        assert!(swamp_top < tundra_top, "{swamp_top} {tundra_top}");
    }
}
