//! What a layout builds with: the RMB blocks' contents (`content/world/rmb/*.json`), each building's and prop's place
//! in its block, the forged models' boxes (`content/forged/buildings.json`, `props.json`), which say how much ground
//! each one stands on, and the boxes each prop's drawn shape fills (`parts.json`). The browser hands the same texts
//! to its worker, so both read the same numbers.

use serde::Deserialize;
use std::collections::BTreeMap;

/// One RMB block's pieces, as `content/world/rmb/` keeps them: a building is
/// `[model, x, y, z, yaw, building type, record]`, a prop `[model, x, y, z, yaw, scale]`, x east of the block's west
/// edge and y south of its north edge, yaw in degrees clockwise from north; its ground is 16 x 16 tiles, base64.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct RmbBlock {
    pub name: String,
    pub buildings: Vec<[f64; 7]>,
    pub props: Vec<[f64; 6]>,
    pub ground: String,
}

/// A model's box in its own frame (x right, y up, z forward), metres; for a building, its plan and doors too.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Measure {
    pub min: [f64; 3],
    pub max: [f64; 3],
    /// The plan's grid, columns along x and rows along z, each cell 0.4 m or so.
    #[serde(default)]
    pub grid: Option<[u32; 2]>,
    #[serde(default)]
    pub plan: Vec<Wing>,
    #[serde(default)]
    pub doors: Vec<Door>,
}

/// One wing of a building's plan: its eaves and ridge, the floor it stands on if not the ground (`low`), whether it
/// is outdoor steps or a platform, and its rectangles of grid cells `[column0, row0, column1, row1]`, each with its
/// own top as a fifth number where it steps.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Wing {
    pub eaves: f64,
    pub ridge: f64,
    #[serde(default)]
    pub low: Option<f64>,
    #[serde(default)]
    pub steps: bool,
    #[serde(default)]
    pub platform: bool,
    pub rects: Vec<Vec<f64>>,
}

/// A door as measured: its top corner over its sill's start, its sill's two corners, and the way out of the building.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub struct Door {
    #[serde(rename = "a")]
    pub top: [f64; 3],
    #[serde(rename = "b")]
    pub sill: [f64; 3],
    #[serde(rename = "c")]
    pub sill_end: [f64; 3],
    #[serde(rename = "n")]
    pub out: [f64; 3],
}

/// The blocks by name and the models' boxes by id.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Book {
    pub blocks: BTreeMap<String, RmbBlock>,
    pub buildings: BTreeMap<u32, Measure>,
    pub props: BTreeMap<u32, Measure>,
    /// The boxes of its own frame (low x, y, z, then high) a prop's drawn shape fills, for each prop its box alone
    /// does not keep to.
    pub parts: BTreeMap<u32, Vec<[f64; 6]>>,
}

impl Book {
    /// Adds one of the RMB table's block files: a JSON list of blocks.
    pub fn add_blocks(&mut self, text: &str) -> Result<(), String> {
        let blocks: Vec<RmbBlock> =
            serde_json::from_str(text).map_err(|error| format!("an RMB block file: {error}"))?;
        for block in blocks {
            self.blocks.insert(block.name.clone(), block);
        }
        Ok(())
    }

    /// Reads a forged table's boxes (`buildings.json` or `props.json`): every entry's `min` and `max`, by model id.
    pub fn measures(text: &str) -> Result<BTreeMap<u32, Measure>, String> {
        let table: BTreeMap<String, Measure> =
            serde_json::from_str(text).map_err(|error| format!("a forged table: {error}"))?;
        table
            .into_iter()
            .map(|(id, measure)| id.parse::<u32>().map(|id| (id, measure)).map_err(|_| format!("a model id {id}")))
            .collect()
    }

    /// Reads the props' parts (`parts.json`): each prop's list of boxes, by model id.
    pub fn parts(text: &str) -> Result<BTreeMap<u32, Vec<[f64; 6]>>, String> {
        let table: BTreeMap<String, Vec<[f64; 6]>> =
            serde_json::from_str(text).map_err(|error| format!("the props' parts: {error}"))?;
        table
            .into_iter()
            .map(|(id, parts)| id.parse::<u32>().map(|id| (id, parts)).map_err(|_| format!("a model id {id}")))
            .collect()
    }

    /// The blocks whose names start with any of the prefixes, in name order.
    #[must_use]
    pub fn family(&self, prefixes: &[&str]) -> Vec<&RmbBlock> {
        self.blocks.values().filter(|block| prefixes.iter().any(|prefix| block.name.starts_with(prefix))).collect()
    }

    /// A model's box: a building's from the buildings' table, falling back to the props', as the city draws them.
    #[must_use]
    pub fn measure(&self, model: u32, building: bool) -> Option<&Measure> {
        let (first, second) = if building { (&self.buildings, &self.props) } else { (&self.props, &self.buildings) };
        first.get(&model).or_else(|| second.get(&model))
    }
}

/// The ground tiles of a block, 16 x 16 bytes row by row from the north-west: each byte a tile's record, plus 64
/// when it is rotated and 128 when it is flipped.
#[must_use]
pub fn ground_tiles(block: &RmbBlock) -> Vec<u8> {
    decode_base64(&block.ground)
}

fn decode_base64(text: &str) -> Vec<u8> {
    let value = |byte: u8| match byte {
        b'A'..=b'Z' => Some(byte - b'A'),
        b'a'..=b'z' => Some(byte - b'a' + 26),
        b'0'..=b'9' => Some(byte - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    };
    let sextets: Vec<u8> = text.bytes().filter_map(value).collect();
    sextets
        .chunks(4)
        .flat_map(|chunk| {
            let bits =
                chunk.iter().fold(0_u32, |bits, &sextet| (bits << 6) | u32::from(sextet)) << (6 * (4 - chunk.len()));
            let bytes = [(bits >> 16) as u8, (bits >> 8) as u8, bits as u8];
            bytes.into_iter().take(chunk.len().saturating_sub(1))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_decodes_as_the_standard_alphabet_does() {
        assert_eq!(decode_base64("TWFu"), b"Man");
        assert_eq!(decode_base64("TWE="), b"Ma");
        assert_eq!(decode_base64("TQ=="), b"M");
    }

    #[test]
    fn blocks_and_measures_are_read_from_their_tables() {
        let mut book = Book::default();
        book.add_blocks(
            r#"[{"name":"FARMAA00.RMB","buildings":[[520,54.4,28.65,0,90,21,0]],"props":[],"ground":"AgIC"}]"#,
        )
        .unwrap();
        book.buildings = Book::measures(r#"{"520": {"min":[-5,0,-3],"max":[5,4,3],"grid":[1,1]}}"#).unwrap();
        assert_eq!(book.family(&["FARM"]).len(), 1);
        assert_eq!(book.measure(520, true).map(|measure| measure.max[0]), Some(5.0));
        assert_eq!(ground_tiles(&book.blocks["FARMAA00.RMB"]), [2, 2, 2]);
    }
}
