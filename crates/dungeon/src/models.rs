//! The forged props a dungeon's rooms are furnished with, by family: each model's id and its box in the forged frame
//! (x right, y up, z forward, in metres), as `content/forged/props.json` measures it. Only pieces that fit a cell of
//! 3.2 m and belong under the ground are here: no signs, tents, huts, boats, gazebos, wells or graves of earth, and
//! no fountain or cart, which are wider than a cell.
#![allow(clippy::approx_constant, reason = "the forged props' measures, as props.json writes them")]

/// What a piece is for beyond standing: a plain piece; a top that candles may stand on (a table, a lectern, an altar
/// or a coffin's lid); a hearth with its fire; a post a lantern hangs on; or a hanging, hung on a wall over head
/// height with no solid.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Piece {
    Plain,
    Top,
    Hearth,
    Post,
    Hung,
}

/// A forged prop by its model id, and its box in the forged frame.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PropModel {
    pub id: u32,
    pub min: [f64; 3],
    pub max: [f64; 3],
    pub piece: Piece,
}

impl PropModel {
    /// Its width along its x, its height and its depth along its z (m).
    #[must_use]
    pub fn width(&self) -> f64 {
        self.max[0] - self.min[0]
    }

    #[must_use]
    pub fn height(&self) -> f64 {
        self.max[1] - self.min[1]
    }

    #[must_use]
    pub fn depth(&self) -> f64 {
        self.max[2] - self.min[2]
    }
}

/// Every family below, for finding a model by its id.
pub const FAMILIES: &[&[PropModel]] = &[
    BENCHES,
    BEDS,
    NARROW_BEDS,
    CANOPY_BEDS,
    CHAIRS,
    TABLES,
    LONG_TABLES,
    SIDE_TABLES,
    COUNTERS,
    CABINETS,
    CUPBOARDS,
    WARDROBES,
    DRESSERS,
    SHELVES,
    LONG_SHELVES,
    STEP_SHELVES,
    WALL_RACKS,
    RACKS,
    CRATES,
    SMALL_CRATES,
    GREAT_CRATES,
    TROUGHS,
    HEARTHS,
    LADDERS,
    LOGS,
    BEAMS,
    POSTS,
    ROCKS,
    GREAT_ROCKS,
    RUBBLE,
    STANDING_STONES,
    COLUMNS,
    BROKEN_COLUMNS,
    PEDESTALS,
    LECTERNS,
    THRONES,
    STATUES,
    OBELISKS,
    ANKHS,
    SARCOPHAGI,
    TOMBS,
    GREAT_TOMBS,
    GRAVE_SLABS,
    HEADSTONES,
    HANGINGS,
];

/// The families whose pieces hold things, which a room may make searchable (`room::finds`): cabinets, cupboards,
/// wardrobes, dressers, shelves, crates, sarcophagi and tombs.
pub const HOLDERS: &[&[PropModel]] = &[
    CABINETS,
    CUPBOARDS,
    WARDROBES,
    DRESSERS,
    SHELVES,
    LONG_SHELVES,
    STEP_SHELVES,
    CRATES,
    SMALL_CRATES,
    GREAT_CRATES,
    SARCOPHAGI,
    TOMBS,
    GREAT_TOMBS,
];

/// The model with this id, if a family that holds things holds it.
#[must_use]
pub fn holder(id: u32) -> Option<PropModel> {
    HOLDERS.iter().flat_map(|family| family.iter()).find(|model| model.id == id).copied()
}

/// The model with this id, if a family holds it.
#[must_use]
pub fn prop_model(id: u32) -> Option<PropModel> {
    FAMILIES.iter().flat_map(|family| family.iter()).find(|model| model.id == id).copied()
}

/// Benches.
pub const BENCHES: &[PropModel] = &[
    PropModel { id: 41105, min: [-0.9, -0.375, -0.25], max: [0.9, 0.175, 0.25], piece: Piece::Plain },
    PropModel { id: 41106, min: [-0.9, -0.35, -0.25], max: [0.9, 0.2, 0.25], piece: Piece::Plain },
    PropModel { id: 51109, min: [-0.9, -0.35, -0.25], max: [0.9, 0.2, 0.25], piece: Piece::Plain },
];

/// Beds.
pub const BEDS: &[PropModel] = &[
    PropModel { id: 41000, min: [-1.269, -0.262, -0.811], max: [0.936, 0.221, 0.808], piece: Piece::Plain },
    PropModel { id: 41001, min: [-1.2, -0.233, -0.512], max: [0.867, 0.38, 0.533], piece: Piece::Plain },
];

/// A narrow bed, for a cell.
pub const NARROW_BEDS: &[PropModel] =
    &[PropModel { id: 41001, min: [-1.2, -0.233, -0.512], max: [0.867, 0.38, 0.533], piece: Piece::Plain }];

/// A bed under a canopy.
pub const CANOPY_BEDS: &[PropModel] =
    &[PropModel { id: 41002, min: [-1.334, -1.02, -0.67], max: [1.078, 1.107, 0.661], piece: Piece::Plain }];

/// Chairs, a stool and an armchair.
pub const CHAIRS: &[PropModel] = &[
    PropModel { id: 41100, min: [-0.415, -0.372, -0.432], max: [0.41, 0.878, 0.318], piece: Piece::Plain },
    PropModel { id: 41101, min: [-0.349, -0.364, -0.479], max: [0.326, 1.011, 0.346], piece: Piece::Plain },
    PropModel { id: 41102, min: [-0.306, -0.395, -0.329], max: [0.319, 0.955, 0.271], piece: Piece::Plain },
    PropModel { id: 41103, min: [-0.358, -0.306, -0.341], max: [0.367, 0.844, 0.284], piece: Piece::Plain },
    PropModel { id: 41119, min: [-0.376, -0.316, -0.356], max: [0.374, 0.859, 0.294], piece: Piece::Plain },
    PropModel { id: 41104, min: [-0.295, -0.517, -0.26], max: [0.295, 0.694, 0.213], piece: Piece::Plain },
];

/// Tables a room's middle can hold.
pub const TABLES: &[PropModel] = &[
    PropModel { id: 41108, min: [-0.886, -0.443, -0.591], max: [0.886, 0.325, 0.591], piece: Piece::Top },
    PropModel { id: 41111, min: [-0.896, -0.392, -0.571], max: [0.876, 0.263, 0.61], piece: Piece::Top },
    PropModel { id: 41112, min: [-1.152, -0.375, -0.477], max: [1.152, 0.275, 0.477], piece: Piece::Top },
];

/// Tables too long for a room's middle, laid along a wall.
pub const LONG_TABLES: &[PropModel] = &[
    PropModel { id: 41109, min: [-1.5, -0.481, -0.647], max: [1.5, 0.344, 0.628], piece: Piece::Top },
    PropModel { id: 41110, min: [-1.5, -0.481, -0.631], max: [1.5, 0.344, 0.644], piece: Piece::Top },
];

/// Small side tables.
pub const SIDE_TABLES: &[PropModel] = &[
    PropModel { id: 41113, min: [-0.197, -0.261, -0.158], max: [0.197, 0.192, 0.157], piece: Piece::Top },
    PropModel { id: 41114, min: [-0.197, -0.197, -0.158], max: [0.197, 0.164, 0.157], piece: Piece::Top },
];

/// A counter.
pub const COUNTERS: &[PropModel] =
    &[PropModel { id: 41126, min: [-1.003, -0.427, -0.34], max: [0.997, 0.523, 0.335], piece: Piece::Top }];

/// Cabinets.
pub const CABINETS: &[PropModel] = &[
    PropModel { id: 41007, min: [-0.419, -0.304, -0.273], max: [0.419, 0.304, 0.273], piece: Piece::Plain },
    PropModel { id: 41008, min: [-0.419, -0.304, -0.273], max: [0.419, 0.304, 0.273], piece: Piece::Plain },
    PropModel { id: 41022, min: [-0.48, -0.443, -0.271], max: [0.48, 0.32, 0.344], piece: Piece::Plain },
    PropModel { id: 41023, min: [-0.488, -0.45, -0.275], max: [0.488, 0.325, 0.35], piece: Piece::Plain },
    PropModel { id: 41050, min: [-0.419, -0.304, -0.273], max: [0.419, 0.304, 0.273], piece: Piece::Plain },
    PropModel { id: 41309, min: [-0.775, 0.0, -0.575], max: [0.675, 1.075, 0.525], piece: Piece::Plain },
    PropModel { id: 41802, min: [-0.419, -0.304, -0.273], max: [0.419, 0.304, 0.273], piece: Piece::Plain },
    PropModel { id: 41803, min: [-0.419, -0.304, -0.273], max: [0.419, 0.304, 0.273], piece: Piece::Plain },
    PropModel { id: 41805, min: [-0.427, -0.425, -0.201], max: [0.427, 0.425, 0.201], piece: Piece::Plain },
    PropModel { id: 41806, min: [-0.45, -0.436, -0.151], max: [0.45, 0.436, 0.151], piece: Piece::Plain },
    PropModel { id: 41810, min: [-0.45, -0.436, -0.151], max: [0.45, 0.436, 0.151], piece: Piece::Plain },
];

/// Cupboards.
pub const CUPBOARDS: &[PropModel] = &[
    PropModel { id: 41032, min: [-0.438, -0.859, -0.193], max: [0.438, 0.943, 0.258], piece: Piece::Plain },
    PropModel { id: 41037, min: [-0.438, -0.859, -0.193], max: [0.438, 0.943, 0.258], piece: Piece::Plain },
    PropModel { id: 41051, min: [-0.53, -0.858, -0.195], max: [0.53, 0.928, 0.26], piece: Piece::Plain },
    PropModel { id: 41804, min: [-0.438, -0.859, -0.193], max: [0.438, 0.943, 0.258], piece: Piece::Plain },
];

/// Wardrobes.
pub const WARDROBES: &[PropModel] = &[
    PropModel { id: 41003, min: [-0.9, -1.483, -0.425], max: [0.9, 0.817, 0.525], piece: Piece::Plain },
    PropModel { id: 41800, min: [-0.9, -1.483, -0.425], max: [0.9, 0.817, 0.525], piece: Piece::Plain },
];

/// Dressers.
pub const DRESSERS: &[PropModel] = &[
    PropModel { id: 41033, min: [-0.427, -0.425, -0.201], max: [0.427, 0.425, 0.201], piece: Piece::Plain },
    PropModel { id: 41034, min: [-0.45, -0.436, -0.151], max: [0.45, 0.436, 0.151], piece: Piece::Plain },
];

/// Shelves.
pub const SHELVES: &[PropModel] = &[
    PropModel { id: 41005, min: [-0.65, -0.913, -0.087], max: [0.65, 0.938, 0.213], piece: Piece::Plain },
    PropModel { id: 41006, min: [-1.125, -0.837, -0.087], max: [1.125, 0.863, 0.213], piece: Piece::Plain },
    PropModel { id: 41010, min: [-0.65, -0.908, -0.3], max: [0.65, 0.942, 0.3], piece: Piece::Plain },
    PropModel { id: 41011, min: [-1.125, -0.833, -0.3], max: [1.125, 0.867, 0.3], piece: Piece::Plain },
    PropModel { id: 41012, min: [-0.65, -0.913, -0.087], max: [0.65, 0.938, 0.213], piece: Piece::Plain },
    PropModel { id: 41013, min: [-1.125, -0.837, -0.087], max: [1.125, 0.863, 0.213], piece: Piece::Plain },
    PropModel { id: 41014, min: [-0.65, -0.908, -0.3], max: [0.65, 0.942, 0.3], piece: Piece::Plain },
    PropModel { id: 41015, min: [-1.125, -0.933, -0.3], max: [1.125, 0.967, 0.3], piece: Piece::Plain },
    PropModel { id: 41016, min: [-0.6, -0.9, -0.2], max: [0.6, 0.9, 0.2], piece: Piece::Plain },
    PropModel { id: 41017, min: [-1.2, -0.9, -0.3], max: [1.2, 0.9, 0.3], piece: Piece::Plain },
    PropModel { id: 41018, min: [-0.65, -0.913, -0.213], max: [0.65, 0.938, 0.087], piece: Piece::Plain },
    PropModel { id: 41019, min: [-1.125, -0.913, -0.213], max: [1.125, 0.938, 0.087], piece: Piece::Plain },
    PropModel { id: 41025, min: [-0.6, -0.9, -0.125], max: [0.6, 0.9, 0.125], piece: Piece::Plain },
    PropModel { id: 41026, min: [-1.2, -0.9, -0.15], max: [1.2, 0.9, 0.15], piece: Piece::Plain },
    PropModel { id: 41027, min: [-0.6, -0.9, -0.2], max: [0.6, 0.9, 0.2], piece: Piece::Plain },
    PropModel { id: 41028, min: [-0.709, -0.669, -0.256], max: [0.709, 0.669, 0.256], piece: Piece::Plain },
    PropModel { id: 41029, min: [-1.2, -0.9, -0.3], max: [1.2, 0.9, 0.3], piece: Piece::Plain },
    PropModel { id: 41030, min: [-0.709, -0.868, -0.222], max: [0.709, 0.943, 0.171], piece: Piece::Plain },
    PropModel { id: 41031, min: [-1.2, -0.9, -0.15], max: [1.2, 0.9, 0.15], piece: Piece::Plain },
    PropModel { id: 41039, min: [-0.6, -0.9, -0.125], max: [0.6, 0.9, 0.125], piece: Piece::Plain },
    PropModel { id: 41040, min: [-1.2, -0.9, -0.15], max: [1.2, 0.9, 0.15], piece: Piece::Plain },
    PropModel { id: 41041, min: [-0.65, -0.908, -0.3], max: [0.65, 0.942, 0.3], piece: Piece::Plain },
    PropModel { id: 41042, min: [-1.125, -0.833, -0.3], max: [1.125, 0.867, 0.3], piece: Piece::Plain },
    PropModel { id: 41044, min: [-1.125, -0.837, -0.087], max: [1.125, 0.863, 0.213], piece: Piece::Plain },
    PropModel { id: 41045, min: [-0.65, -0.908, -0.3], max: [0.65, 0.942, 0.3], piece: Piece::Plain },
    PropModel { id: 41046, min: [-1.125, -0.833, -0.3], max: [1.125, 0.867, 0.3], piece: Piece::Plain },
    PropModel { id: 41047, min: [-0.6, -0.9, -0.2], max: [0.6, 0.9, 0.2], piece: Piece::Plain },
    PropModel { id: 41048, min: [-1.2, -0.9, -0.3], max: [1.2, 0.9, 0.3], piece: Piece::Plain },
    PropModel { id: 41049, min: [-0.6, -0.9, -0.125], max: [0.6, 0.9, 0.125], piece: Piece::Plain },
];

/// The longest shelves, which stand in rows.
pub const LONG_SHELVES: &[PropModel] = &[
    PropModel { id: 41006, min: [-1.125, -0.837, -0.087], max: [1.125, 0.863, 0.213], piece: Piece::Plain },
    PropModel { id: 41011, min: [-1.125, -0.833, -0.3], max: [1.125, 0.867, 0.3], piece: Piece::Plain },
    PropModel { id: 41013, min: [-1.125, -0.837, -0.087], max: [1.125, 0.863, 0.213], piece: Piece::Plain },
    PropModel { id: 41015, min: [-1.125, -0.933, -0.3], max: [1.125, 0.967, 0.3], piece: Piece::Plain },
    PropModel { id: 41017, min: [-1.2, -0.9, -0.3], max: [1.2, 0.9, 0.3], piece: Piece::Plain },
    PropModel { id: 41019, min: [-1.125, -0.913, -0.213], max: [1.125, 0.938, 0.087], piece: Piece::Plain },
    PropModel { id: 41026, min: [-1.2, -0.9, -0.15], max: [1.2, 0.9, 0.15], piece: Piece::Plain },
    PropModel { id: 41029, min: [-1.2, -0.9, -0.3], max: [1.2, 0.9, 0.3], piece: Piece::Plain },
    PropModel { id: 41031, min: [-1.2, -0.9, -0.15], max: [1.2, 0.9, 0.15], piece: Piece::Plain },
    PropModel { id: 41040, min: [-1.2, -0.9, -0.15], max: [1.2, 0.9, 0.15], piece: Piece::Plain },
    PropModel { id: 41042, min: [-1.125, -0.833, -0.3], max: [1.125, 0.867, 0.3], piece: Piece::Plain },
    PropModel { id: 41044, min: [-1.125, -0.837, -0.087], max: [1.125, 0.863, 0.213], piece: Piece::Plain },
    PropModel { id: 41046, min: [-1.125, -0.833, -0.3], max: [1.125, 0.867, 0.3], piece: Piece::Plain },
    PropModel { id: 41048, min: [-1.2, -0.9, -0.3], max: [1.2, 0.9, 0.3], piece: Piece::Plain },
];

/// Step shelves.
pub const STEP_SHELVES: &[PropModel] = &[
    PropModel { id: 41035, min: [-0.438, -0.859, -0.193], max: [0.438, 0.943, 0.258], piece: Piece::Plain },
    PropModel { id: 41036, min: [-0.438, -0.859, -0.193], max: [0.438, 0.943, 0.258], piece: Piece::Plain },
    PropModel { id: 41807, min: [-0.438, -0.859, -0.193], max: [0.438, 0.943, 0.258], piece: Piece::Plain },
    PropModel { id: 41808, min: [-0.438, -0.859, -0.193], max: [0.438, 0.943, 0.258], piece: Piece::Plain },
    PropModel { id: 41814, min: [-0.53, -0.858, -0.195], max: [0.53, 0.928, 0.26], piece: Piece::Plain },
];

/// A low rack for a wall.
pub const WALL_RACKS: &[PropModel] =
    &[PropModel { id: 41115, min: [-0.6, -0.332, -0.107], max: [0.6, 0.468, 0.107], piece: Piece::Plain }];

/// Racks.
pub const RACKS: &[PropModel] = &[
    PropModel { id: 41125, min: [-0.6, -0.321, -0.775], max: [0.6, 0.479, 0.775], piece: Piece::Plain },
    PropModel { id: 41300, min: [-0.809, -0.802, -1.066], max: [0.611, 1.304, 1.391], piece: Piece::Plain },
    PropModel { id: 41302, min: [-0.608, -1.857, -1.526], max: [0.642, 1.238, 1.324], piece: Piece::Plain },
];

/// Crates and boxes.
pub const CRATES: &[PropModel] = &[
    PropModel { id: 41816, min: [-0.4, -0.201, -0.389], max: [0.4, 0.201, 0.389], piece: Piece::Plain },
    PropModel { id: 41817, min: [-0.4, -0.25, -0.389], max: [0.4, 0.25, 0.389], piece: Piece::Plain },
    PropModel { id: 41818, min: [-0.289, -0.289, -0.289], max: [0.289, 0.289, 0.289], piece: Piece::Plain },
    PropModel { id: 41822, min: [-0.389, -0.389, -0.389], max: [0.389, 0.389, 0.389], piece: Piece::Plain },
    PropModel { id: 41824, min: [-0.3, -0.151, -0.176], max: [0.3, 0.151, 0.176], piece: Piece::Plain },
    PropModel { id: 41825, min: [-0.3, -0.15, -0.3], max: [0.3, 0.15, 0.3], piece: Piece::Plain },
    PropModel { id: 41826, min: [-0.375, -0.2, -0.375], max: [0.375, 0.2, 0.375], piece: Piece::Plain },
    PropModel { id: 41827, min: [-0.475, -0.3, -0.475], max: [0.475, 0.3, 0.475], piece: Piece::Plain },
    PropModel { id: 41828, min: [-0.25, -0.25, -0.25], max: [0.25, 0.25, 0.25], piece: Piece::Plain },
    PropModel { id: 41829, min: [-0.475, -0.2, -0.475], max: [0.475, 0.2, 0.475], piece: Piece::Plain },
    PropModel { id: 41830, min: [-0.325, -0.15, -0.325], max: [0.325, 0.15, 0.325], piece: Piece::Plain },
    PropModel { id: 41831, min: [-0.475, -0.3, -0.4], max: [0.475, 0.3, 0.4], piece: Piece::Plain },
];

/// Small boxes, scattered.
pub const SMALL_CRATES: &[PropModel] = &[
    PropModel { id: 41819, min: [-0.189, -0.076, -0.189], max: [0.189, 0.076, 0.189], piece: Piece::Plain },
    PropModel { id: 41821, min: [-0.175, -0.112, -0.139], max: [0.175, 0.112, 0.139], piece: Piece::Plain },
    PropModel { id: 41823, min: [-0.126, -0.126, -0.126], max: [0.126, 0.126, 0.126], piece: Piece::Plain },
    PropModel { id: 41824, min: [-0.3, -0.151, -0.176], max: [0.3, 0.151, 0.176], piece: Piece::Plain },
    PropModel { id: 41825, min: [-0.3, -0.15, -0.3], max: [0.3, 0.15, 0.3], piece: Piece::Plain },
    PropModel { id: 41828, min: [-0.25, -0.25, -0.25], max: [0.25, 0.25, 0.25], piece: Piece::Plain },
    PropModel { id: 41830, min: [-0.325, -0.15, -0.325], max: [0.325, 0.15, 0.325], piece: Piece::Plain },
];

/// Great crates, stacked in rows.
pub const GREAT_CRATES: &[PropModel] = &[
    PropModel { id: 41832, min: [-0.65, -0.65, -0.65], max: [0.65, 0.65, 0.65], piece: Piece::Plain },
    PropModel { id: 41833, min: [-1.05, -1.05, -1.05], max: [1.05, 1.05, 1.05], piece: Piece::Plain },
    PropModel { id: 41834, min: [-1.225, -0.65, -0.775], max: [1.225, 0.65, 0.775], piece: Piece::Plain },
];

/// Troughs.
pub const TROUGHS: &[PropModel] = &[
    PropModel { id: 41209, min: [-0.25, -0.25, -1.026], max: [0.25, 0.25, 1.024], piece: Piece::Plain },
    PropModel { id: 41210, min: [-0.249, -0.2, -1.026], max: [0.251, 0.3, 1.024], piece: Piece::Plain },
];

/// Hearths, each with a fire in it.
pub const HEARTHS: &[PropModel] = &[
    PropModel { id: 41116, min: [-0.8, -0.55, -0.25], max: [0.8, 0.7, 0.25], piece: Piece::Hearth },
    PropModel { id: 41117, min: [-1.096, -0.672, -0.731], max: [1.096, 0.878, 0.365], piece: Piece::Hearth },
    PropModel { id: 41124, min: [-0.8, -0.8, -0.3], max: [0.8, 0.8, 0.3], piece: Piece::Hearth },
];

/// A ladder.
pub const LADDERS: &[PropModel] =
    &[PropModel { id: 41409, min: [-0.7, -1.581, -0.079], max: [0.7, 1.569, 0.121], piece: Piece::Plain }];

/// A log.
pub const LOGS: &[PropModel] =
    &[PropModel { id: 41722, min: [-0.725, 0.0, -0.675], max: [0.95, 0.725, 0.0], piece: Piece::Plain }];

/// A timber beam.
pub const BEAMS: &[PropModel] =
    &[PropModel { id: 62319, min: [-1.55, -0.2, -0.2], max: [1.55, 0.2, 0.2], piece: Piece::Plain }];

/// Timber posts, a lantern on each.
pub const POSTS: &[PropModel] = &[
    PropModel { id: 41901, min: [-0.2, -1.587, -0.2], max: [0.2, 1.587, 0.2], piece: Piece::Post },
    PropModel { id: 41902, min: [-0.2, -1.587, -0.2], max: [0.2, 1.587, 0.2], piece: Piece::Post },
];

/// Rocks.
pub const ROCKS: &[PropModel] = &[
    PropModel { id: 60511, min: [-0.35, -0.225, -0.325], max: [0.375, 0.4, 0.325], piece: Piece::Plain },
    PropModel { id: 60512, min: [-0.3, -0.225, -0.35], max: [0.375, 0.325, 0.325], piece: Piece::Plain },
    PropModel { id: 60513, min: [-0.45, -0.225, -0.275], max: [0.55, 0.325, 0.275], piece: Piece::Plain },
    PropModel { id: 60514, min: [-0.65, -0.225, -0.45], max: [0.725, 0.325, 0.55], piece: Piece::Plain },
    PropModel { id: 60515, min: [-0.825, -0.275, -0.95], max: [0.65, 0.35, 0.375], piece: Piece::Plain },
    PropModel { id: 60516, min: [-0.975, -0.375, -0.45], max: [0.95, 0.675, 0.55], piece: Piece::Plain },
    PropModel { id: 60517, min: [-0.425, -0.25, -0.275], max: [0.4, 0.45, 0.35], piece: Piece::Plain },
    PropModel { id: 60518, min: [-0.975, -0.3, -0.95], max: [0.65, 0.4, 0.4], piece: Piece::Plain },
    PropModel { id: 60519, min: [-0.575, -0.4, -0.675], max: [0.8, 0.575, 0.95], piece: Piece::Plain },
    PropModel { id: 60520, min: [-0.75, -0.325, -0.625], max: [0.775, 0.675, 0.85], piece: Piece::Plain },
    PropModel { id: 41704, min: [-0.625, 0.0, -0.275], max: [0.75, 0.8, 1.55], piece: Piece::Plain },
    PropModel { id: 41712, min: [-1.05, 0.0, -0.25], max: [0.425, 0.6, 1.225], piece: Piece::Plain },
];

/// Great rocks.
pub const GREAT_ROCKS: &[PropModel] = &[
    PropModel { id: 41705, min: [-0.925, 0.0, -0.4], max: [1.125, 1.0, 2.3], piece: Piece::Plain },
    PropModel { id: 41710, min: [-1.5, 0.0, -0.425], max: [0.575, 0.425, 1.525], piece: Piece::Plain },
];

/// Fallen masonry.
pub const RUBBLE: &[PropModel] = &[
    PropModel { id: 41721, min: [-2.125, 0.0, -1.275], max: [0.15, 1.75, 0.4], piece: Piece::Plain },
    PropModel { id: 41724, min: [-1.575, 0.0, -0.325], max: [1.25, 1.9, 0.0], piece: Piece::Plain },
    PropModel { id: 41725, min: [-0.6, 0.0, 0.0], max: [1.425, 1.975, 0.25], piece: Piece::Plain },
    PropModel { id: 41727, min: [-1.275, 0.0, 0.0], max: [0.4, 1.95, 0.225], piece: Piece::Plain },
    PropModel { id: 41728, min: [-1.225, 0.0, -0.225], max: [0.1, 1.525, 0.0], piece: Piece::Plain },
    PropModel { id: 41729, min: [-1.825, 0.0, -0.275], max: [0.65, 1.525, 0.0], piece: Piece::Plain },
    PropModel { id: 43400, min: [-0.8, -1.6, -0.2], max: [0.8, -0.2, 0.2], piece: Piece::Plain },
];

/// Standing stones.
pub const STANDING_STONES: &[PropModel] = &[
    PropModel { id: 43403, min: [-0.747, -1.663, -0.201], max: [0.853, 1.35, 0.201], piece: Piece::Plain },
    PropModel { id: 43515, min: [-0.393, -1.513, -0.419], max: [0.395, 0.871, 0.754], piece: Piece::Plain },
    PropModel { id: 43516, min: [-0.404, -0.86, -1.187], max: [0.404, 1.317, 0.814], piece: Piece::Plain },
];

/// A column.
pub const COLUMNS: &[PropModel] =
    &[PropModel { id: 41723, min: [-0.425, 0.0, -0.55], max: [0.425, 2.6, 0.35], piece: Piece::Plain }];

/// Broken columns.
pub const BROKEN_COLUMNS: &[PropModel] = &[
    PropModel { id: 41731, min: [-0.275, 0.0, -0.375], max: [0.275, 1.225, 0.225], piece: Piece::Plain },
    PropModel { id: 41733, min: [-0.3, 0.0, -0.4], max: [0.3, 1.05, 0.25], piece: Piece::Plain },
];

/// A pedestal, an altar for candles.
pub const PEDESTALS: &[PropModel] =
    &[PropModel { id: 41020, min: [-0.285, -0.477, -0.285], max: [0.285, 0.468, 0.285], piece: Piece::Top }];

/// Lecterns.
pub const LECTERNS: &[PropModel] = &[
    PropModel { id: 41021, min: [-0.325, -1.033, -0.21], max: [0.325, 0.384, 0.292], piece: Piece::Top },
    PropModel { id: 41118, min: [-0.333, -0.514, -0.098], max: [0.375, 0.262, 0.098], piece: Piece::Top },
];

/// Thrones.
pub const THRONES: &[PropModel] = &[
    PropModel { id: 41120, min: [-0.8, -0.777, -0.205], max: [0.8, 1.93, 0.395], piece: Piece::Plain },
    PropModel { id: 41122, min: [-0.546, -0.716, -0.414], max: [0.529, 1.309, 0.436], piece: Piece::Plain },
    PropModel { id: 41123, min: [-0.538, -0.7, -0.414], max: [0.538, 1.275, 0.436], piece: Piece::Plain },
];

/// Statues.
pub const STATUES: &[PropModel] = &[
    PropModel { id: 62327, min: [-0.5, -1.55, -0.5], max: [0.5, 1.55, 0.5], piece: Piece::Plain },
    PropModel { id: 62329, min: [-0.5, -1.55, -0.5], max: [0.5, 1.25, 1.0], piece: Piece::Plain },
];

/// Obelisks.
pub const OBELISKS: &[PropModel] = &[
    PropModel { id: 43071, min: [-0.45, -1.444, -0.45], max: [0.45, 1.956, 0.45], piece: Piece::Plain },
    PropModel { id: 43072, min: [-0.45, -1.444, -0.45], max: [0.45, 1.956, 0.45], piece: Piece::Plain },
    PropModel { id: 43073, min: [-0.45, -1.444, -0.45], max: [0.45, 1.956, 0.45], piece: Piece::Plain },
    PropModel { id: 43074, min: [-0.45, -1.444, -0.45], max: [0.45, 1.956, 0.45], piece: Piece::Plain },
    PropModel { id: 43105, min: [-1.014, -0.875, -1.014], max: [1.014, 2.287, 1.014], piece: Piece::Plain },
    PropModel { id: 43106, min: [-1.014, -0.875, -1.014], max: [1.014, 2.287, 1.014], piece: Piece::Plain },
    PropModel { id: 43107, min: [-1.014, -0.875, -1.014], max: [1.014, 2.287, 1.014], piece: Piece::Plain },
    PropModel { id: 43108, min: [-1.014, -0.875, -1.014], max: [1.014, 2.287, 1.014], piece: Piece::Plain },
    PropModel { id: 43125, min: [-0.522, -1.147, -0.509], max: [0.539, 0.908, 0.512], piece: Piece::Plain },
    PropModel { id: 43126, min: [-0.522, -1.147, -0.509], max: [0.539, 0.908, 0.512], piece: Piece::Plain },
    PropModel { id: 43127, min: [-0.522, -1.147, -0.509], max: [0.539, 0.908, 0.512], piece: Piece::Plain },
    PropModel { id: 43128, min: [-0.522, -1.147, -0.509], max: [0.539, 0.908, 0.512], piece: Piece::Plain },
    PropModel { id: 43303, min: [-0.375, -0.925, -0.35], max: [0.375, 1.45, 0.4], piece: Piece::Plain },
];

/// Ankhs.
pub const ANKHS: &[PropModel] = &[
    PropModel { id: 43083, min: [-0.801, -1.259, -0.798], max: [0.8, 0.944, 0.803], piece: Piece::Plain },
    PropModel { id: 43084, min: [-0.801, -1.259, -0.798], max: [0.8, 0.944, 0.803], piece: Piece::Plain },
    PropModel { id: 43085, min: [-0.801, -1.259, -0.798], max: [0.8, 0.944, 0.803], piece: Piece::Plain },
    PropModel { id: 43086, min: [-0.801, -1.259, -0.798], max: [0.8, 0.944, 0.803], piece: Piece::Plain },
    PropModel { id: 43121, min: [-0.603, -1.432, -0.32], max: [0.599, 0.833, 0.322], piece: Piece::Plain },
    PropModel { id: 43122, min: [-0.603, -1.432, -0.32], max: [0.599, 0.833, 0.322], piece: Piece::Plain },
    PropModel { id: 43123, min: [-0.603, -1.432, -0.32], max: [0.599, 0.833, 0.322], piece: Piece::Plain },
    PropModel { id: 43124, min: [-0.603, -1.432, -0.32], max: [0.599, 0.833, 0.322], piece: Piece::Plain },
];

/// Low coffins, whose lids hold candles.
pub const SARCOPHAGI: &[PropModel] = &[
    PropModel { id: 43304, min: [-0.45, -0.3, -1.05], max: [0.45, 0.375, 1.05], piece: Piece::Top },
    PropModel { id: 43306, min: [-0.45, -0.275, -1.0], max: [0.45, 0.375, 1.1], piece: Piece::Top },
];

/// Tomb markers.
pub const TOMBS: &[PropModel] = &[
    PropModel { id: 43055, min: [-0.5, -1.039, -0.5], max: [0.5, 0.861, 0.5], piece: Piece::Plain },
    PropModel { id: 43056, min: [-0.5, -1.039, -0.5], max: [0.5, 0.861, 0.5], piece: Piece::Plain },
    PropModel { id: 43057, min: [-0.5, -1.039, -0.5], max: [0.5, 0.861, 0.5], piece: Piece::Plain },
    PropModel { id: 43058, min: [-0.5, -1.039, -0.5], max: [0.5, 0.861, 0.5], piece: Piece::Plain },
    PropModel { id: 43059, min: [-0.575, -1.221, -0.575], max: [0.575, 0.979, 0.575], piece: Piece::Plain },
    PropModel { id: 43060, min: [-0.575, -1.221, -0.575], max: [0.575, 0.979, 0.575], piece: Piece::Plain },
    PropModel { id: 43061, min: [-0.575, -1.221, -0.575], max: [0.575, 0.979, 0.575], piece: Piece::Plain },
    PropModel { id: 43062, min: [-0.575, -1.221, -0.575], max: [0.575, 0.979, 0.575], piece: Piece::Plain },
    PropModel { id: 43302, min: [-0.325, -0.6, -0.1], max: [0.275, 0.3, 0.15], piece: Piece::Plain },
];

/// Great tombs.
pub const GREAT_TOMBS: &[PropModel] = &[
    PropModel { id: 43133, min: [-1.0, -0.77, -0.8], max: [1.0, 1.903, 0.8], piece: Piece::Plain },
    PropModel { id: 43134, min: [-1.0, -0.77, -0.8], max: [1.0, 1.903, 0.8], piece: Piece::Plain },
    PropModel { id: 43135, min: [-1.0, -0.77, -0.8], max: [1.0, 1.903, 0.8], piece: Piece::Plain },
    PropModel { id: 43136, min: [-1.0, -0.77, -0.8], max: [1.0, 1.903, 0.8], piece: Piece::Plain },
];

/// Grave slabs.
pub const GRAVE_SLABS: &[PropModel] = &[
    PropModel { id: 43027, min: [-0.5, -0.25, -0.817], max: [0.5, 0.325, 0.833], piece: Piece::Plain },
    PropModel { id: 43028, min: [-0.5, -0.25, -0.817], max: [0.5, 0.325, 0.833], piece: Piece::Plain },
    PropModel { id: 43029, min: [-0.5, -0.25, -0.817], max: [0.5, 0.325, 0.833], piece: Piece::Plain },
    PropModel { id: 43030, min: [-0.5, -0.25, -0.817], max: [0.5, 0.325, 0.833], piece: Piece::Plain },
    PropModel { id: 43031, min: [-0.526, -0.163, -0.817], max: [0.499, 0.337, 0.833], piece: Piece::Plain },
    PropModel { id: 43032, min: [-0.526, -0.163, -0.817], max: [0.499, 0.337, 0.833], piece: Piece::Plain },
    PropModel { id: 43033, min: [-0.526, -0.163, -0.817], max: [0.499, 0.337, 0.833], piece: Piece::Plain },
    PropModel { id: 43034, min: [-0.526, -0.163, -0.817], max: [0.499, 0.337, 0.833], piece: Piece::Plain },
    PropModel { id: 43035, min: [-0.5, -0.056, -0.931], max: [0.5, 0.119, 0.869], piece: Piece::Plain },
    PropModel { id: 43036, min: [-0.5, -0.056, -0.931], max: [0.5, 0.119, 0.869], piece: Piece::Plain },
    PropModel { id: 43037, min: [-0.5, -0.056, -0.931], max: [0.5, 0.119, 0.869], piece: Piece::Plain },
    PropModel { id: 43038, min: [-0.5, -0.056, -0.931], max: [0.5, 0.119, 0.869], piece: Piece::Plain },
];

/// Headstones.
pub const HEADSTONES: &[PropModel] = &[
    PropModel { id: 43011, min: [-0.375, -0.347, -0.144], max: [0.375, 0.803, 0.131], piece: Piece::Plain },
    PropModel { id: 43012, min: [-0.375, -0.347, -0.144], max: [0.375, 0.803, 0.131], piece: Piece::Plain },
    PropModel { id: 43013, min: [-0.375, -0.347, -0.144], max: [0.375, 0.803, 0.131], piece: Piece::Plain },
    PropModel { id: 43014, min: [-0.375, -0.347, -0.144], max: [0.375, 0.803, 0.131], piece: Piece::Plain },
    PropModel { id: 43015, min: [-0.3, -0.506, -0.125], max: [0.3, 0.519, 0.125], piece: Piece::Plain },
    PropModel { id: 43016, min: [-0.3, -0.506, -0.125], max: [0.3, 0.519, 0.125], piece: Piece::Plain },
    PropModel { id: 43017, min: [-0.3, -0.506, -0.125], max: [0.3, 0.519, 0.125], piece: Piece::Plain },
    PropModel { id: 43018, min: [-0.3, -0.506, -0.125], max: [0.3, 0.519, 0.125], piece: Piece::Plain },
    PropModel { id: 43019, min: [-0.338, -0.47, -0.114], max: [0.338, 0.63, 0.136], piece: Piece::Plain },
    PropModel { id: 43020, min: [-0.338, -0.47, -0.114], max: [0.338, 0.63, 0.136], piece: Piece::Plain },
    PropModel { id: 43021, min: [-0.338, -0.47, -0.114], max: [0.338, 0.63, 0.136], piece: Piece::Plain },
    PropModel { id: 43022, min: [-0.338, -0.47, -0.114], max: [0.338, 0.63, 0.136], piece: Piece::Plain },
    PropModel { id: 43023, min: [-0.296, -0.65, -0.111], max: [0.279, 0.375, 0.089], piece: Piece::Plain },
    PropModel { id: 43024, min: [-0.296, -0.65, -0.111], max: [0.279, 0.375, 0.089], piece: Piece::Plain },
    PropModel { id: 43025, min: [-0.296, -0.65, -0.111], max: [0.279, 0.375, 0.089], piece: Piece::Plain },
    PropModel { id: 43026, min: [-0.296, -0.65, -0.111], max: [0.279, 0.375, 0.089], piece: Piece::Plain },
    PropModel { id: 43039, min: [-0.432, -0.293, -0.111], max: [0.368, 0.632, 0.114], piece: Piece::Plain },
    PropModel { id: 43040, min: [-0.432, -0.293, -0.111], max: [0.368, 0.632, 0.114], piece: Piece::Plain },
    PropModel { id: 43041, min: [-0.432, -0.293, -0.111], max: [0.368, 0.632, 0.114], piece: Piece::Plain },
    PropModel { id: 43042, min: [-0.432, -0.293, -0.111], max: [0.368, 0.632, 0.114], piece: Piece::Plain },
    PropModel { id: 43043, min: [-0.364, -0.428, -0.125], max: [0.386, 0.523, 0.104], piece: Piece::Plain },
    PropModel { id: 43044, min: [-0.364, -0.428, -0.125], max: [0.386, 0.523, 0.104], piece: Piece::Plain },
    PropModel { id: 43045, min: [-0.364, -0.428, -0.125], max: [0.386, 0.523, 0.104], piece: Piece::Plain },
    PropModel { id: 43046, min: [-0.364, -0.428, -0.125], max: [0.386, 0.523, 0.104], piece: Piece::Plain },
    PropModel { id: 43047, min: [-0.262, -0.55, -0.101], max: [0.213, 0.3, 0.074], piece: Piece::Plain },
    PropModel { id: 43048, min: [-0.262, -0.55, -0.101], max: [0.213, 0.3, 0.074], piece: Piece::Plain },
    PropModel { id: 43049, min: [-0.262, -0.55, -0.101], max: [0.213, 0.3, 0.074], piece: Piece::Plain },
    PropModel { id: 43050, min: [-0.262, -0.55, -0.101], max: [0.213, 0.3, 0.074], piece: Piece::Plain },
    PropModel { id: 43051, min: [-0.365, -0.69, -0.098], max: [0.36, 0.51, 0.102], piece: Piece::Plain },
    PropModel { id: 43052, min: [-0.365, -0.69, -0.098], max: [0.36, 0.51, 0.102], piece: Piece::Plain },
    PropModel { id: 43053, min: [-0.365, -0.69, -0.098], max: [0.36, 0.51, 0.102], piece: Piece::Plain },
    PropModel { id: 43054, min: [-0.365, -0.69, -0.098], max: [0.36, 0.51, 0.102], piece: Piece::Plain },
    PropModel { id: 43063, min: [-0.5, -1.347, -0.15], max: [0.5, 0.978, 0.15], piece: Piece::Plain },
    PropModel { id: 43064, min: [-0.5, -1.347, -0.15], max: [0.5, 0.978, 0.15], piece: Piece::Plain },
    PropModel { id: 43065, min: [-0.5, -1.347, -0.15], max: [0.5, 0.978, 0.15], piece: Piece::Plain },
    PropModel { id: 43066, min: [-0.5, -1.347, -0.15], max: [0.5, 0.978, 0.15], piece: Piece::Plain },
    PropModel { id: 43067, min: [-0.838, -1.063, -0.15], max: [0.735, 0.936, 0.15], piece: Piece::Plain },
    PropModel { id: 43068, min: [-0.838, -1.063, -0.15], max: [0.735, 0.936, 0.15], piece: Piece::Plain },
    PropModel { id: 43069, min: [-0.838, -1.063, -0.15], max: [0.735, 0.936, 0.15], piece: Piece::Plain },
    PropModel { id: 43070, min: [-0.838, -1.063, -0.15], max: [0.735, 0.936, 0.15], piece: Piece::Plain },
    PropModel { id: 43101, min: [-0.6, -1.0, -0.2], max: [0.6, 1.0, 0.2], piece: Piece::Plain },
    PropModel { id: 43102, min: [-0.6, -1.0, -0.2], max: [0.6, 1.0, 0.2], piece: Piece::Plain },
    PropModel { id: 43103, min: [-0.6, -1.0, -0.2], max: [0.6, 1.0, 0.2], piece: Piece::Plain },
    PropModel { id: 43104, min: [-0.6, -1.0, -0.2], max: [0.6, 1.0, 0.2], piece: Piece::Plain },
    PropModel { id: 43117, min: [-0.557, -0.695, -0.54], max: [0.557, 1.221, 0.66], piece: Piece::Plain },
    PropModel { id: 43118, min: [-0.557, -0.695, -0.54], max: [0.557, 1.221, 0.66], piece: Piece::Plain },
    PropModel { id: 43119, min: [-0.557, -0.695, -0.54], max: [0.557, 1.221, 0.66], piece: Piece::Plain },
    PropModel { id: 43120, min: [-0.557, -0.695, -0.54], max: [0.557, 1.221, 0.66], piece: Piece::Plain },
    PropModel { id: 43142, min: [-1.008, -2.248, -0.606], max: [1.008, 1.179, 0.614], piece: Piece::Plain },
    PropModel { id: 43143, min: [-1.008, -2.248, -0.606], max: [1.008, 1.179, 0.614], piece: Piece::Plain },
    PropModel { id: 43144, min: [-1.008, -2.248, -0.606], max: [1.008, 1.179, 0.614], piece: Piece::Plain },
    PropModel { id: 43145, min: [-1.008, -2.248, -0.606], max: [1.008, 1.179, 0.614], piece: Piece::Plain },
    PropModel { id: 43300, min: [-0.247, -0.7, -0.1], max: [0.253, 0.375, 0.1], piece: Piece::Plain },
    PropModel { id: 43301, min: [-0.25, -0.525, -0.1], max: [0.25, 0.425, 0.1], piece: Piece::Plain },
];

/// Hangings, hung on a wall over head height.
pub const HANGINGS: &[PropModel] = &[
    PropModel { id: 51115, min: [-0.634, 0.0, 0.404], max: [0.923, 1.096, 0.404], piece: Piece::Hung },
    PropModel { id: 51116, min: [-0.634, 0.0, 0.404], max: [1.326, 1.096, 0.404], piece: Piece::Hung },
    PropModel { id: 51117, min: [-0.634, 0.0, 0.404], max: [1.326, 2.076, 0.404], piece: Piece::Hung },
    PropModel { id: 51118, min: [-0.379, 0.0, 0.404], max: [0.792, 1.24, 0.404], piece: Piece::Hung },
    PropModel { id: 51119, min: [-0.162, 0.0, 0.404], max: [0.339, 0.53, 0.404], piece: Piece::Hung },
    PropModel { id: 51122, min: [-0.8, 0.05, -0.001], max: [0.9, 2.45, -0.001], piece: Piece::Hung },
];
