//! Each style's purposes: its way in's room, its other rooms and its end room, each with the props it lays and the
//! lights it burns beside its torches.

use crate::fixtures::Kind;
use crate::fixtures::Kind::{Brazier, Candles, Crystals, Fungus, Hearth, Lantern};
use crate::models::{
    ANKHS, BEAMS, BEDS, BENCHES, BROKEN_COLUMNS, CABINETS, CANOPY_BEDS, CHAIRS, COLUMNS, COUNTERS, CRATES, CUPBOARDS,
    DRESSERS, GRAVE_SLABS, GREAT_CRATES, GREAT_ROCKS, GREAT_TOMBS, HANGINGS, HEADSTONES, HEARTHS, LADDERS, LECTERNS,
    LOGS, LONG_SHELVES, LONG_TABLES, NARROW_BEDS, OBELISKS, PEDESTALS, POSTS, PropModel, RACKS, ROCKS, RUBBLE,
    SARCOPHAGI, SHELVES, SIDE_TABLES, SMALL_CRATES, STANDING_STONES, STATUES, STEP_SHELVES, TABLES, THRONES, TOMBS,
    TROUGHS, WALL_RACKS, WARDROBES,
};
use crate::purposes::{Bank, Facing, Lay, Light, Lit, Pattern, Purpose};
use crate::shapes::Shape;

type Families = &'static [&'static [PropModel]];

const fn walls(per: usize, families: Families) -> Lay {
    Lay { pattern: Pattern::Walls { per }, families }
}

/// A single piece against a wall.
const fn one(families: Families) -> Lay {
    walls(usize::MAX, families)
}

const fn middle(families: Families) -> Lay {
    Lay { pattern: Pattern::Middle, families }
}

const fn rows(facing: Facing, families: Families) -> Lay {
    Lay { pattern: Pattern::Rows { facing }, families }
}

const fn flank(families: Families) -> Lay {
    Lay { pattern: Pattern::Flank, families }
}

const fn alcoves(families: Families) -> Lay {
    Lay { pattern: Pattern::Alcoves, families }
}

const fn rubble(per: usize, families: Families) -> Lay {
    Lay { pattern: Pattern::Rubble { per }, families }
}

const fn hung(per: usize, families: Families) -> Lay {
    Lay { pattern: Pattern::Hung { per }, families }
}

const fn light(kind: Kind, lit: Lit) -> Light {
    Light { kind, lit }
}

const fn tops(most: usize) -> Light {
    light(Candles, Lit::Tops { most })
}

const fn purpose(role: &'static str, name: &'static str, lays: &'static [Lay], lights: &'static [Light]) -> Purpose {
    Purpose { role, name, shapes: &[], lays, lights }
}

const BRAZIERS_FLANK: Light = light(Brazier, Lit::Flank);
const BRAZIER_MIDDLE: Light = light(Brazier, Lit::Middle);
const HEARTH_FIRES: Light = light(Hearth, Lit::Hearths);
const POST_LANTERNS: Light = light(Lantern, Lit::Posts);
const fn crystals(per: usize) -> Light {
    light(Crystals, Lit::Walls { per })
}
const fn fungus(per: usize) -> Light {
    light(Fungus, Lit::Walls { per })
}
const fn lanterns(per: usize) -> Light {
    light(Lantern, Lit::Walls { per })
}

pub(crate) const CRYPT: Bank = Bank {
    way_in: purpose(
        "mourners-hall",
        "Mourners' Hall",
        &[walls(6, &[BENCHES]), middle(&[LECTERNS, PEDESTALS]), walls(12, &[TOMBS])],
        &[BRAZIERS_FLANK, tops(2)],
    ),
    rooms: &[
        purpose(
            "ossuary",
            "Ossuary",
            &[walls(4, &[SHELVES, STEP_SHELVES]), alcoves(&[TOMBS, SARCOPHAGI]), rubble(12, &[ROCKS, BROKEN_COLUMNS])],
            &[BRAZIER_MIDDLE],
        ),
        purpose(
            "burial-hall",
            "Burial Hall",
            &[rows(Facing::Along, &[SARCOPHAGI, GRAVE_SLABS]), walls(8, &[HEADSTONES]), alcoves(&[SARCOPHAGI])],
            &[BRAZIERS_FLANK],
        ),
        purpose(
            "chapel-of-rest",
            "Chapel of Rest",
            &[middle(&[SARCOPHAGI]), flank(&[PEDESTALS, ANKHS]), walls(6, &[BENCHES])],
            &[tops(3)],
        ),
        purpose(
            "catacomb",
            "Catacomb",
            &[alcoves(&[SARCOPHAGI, TOMBS, GREAT_TOMBS]), walls(6, &[TOMBS, HEADSTONES]), rubble(14, &[GRAVE_SLABS])],
            &[BRAZIER_MIDDLE],
        ),
        purpose(
            "embalming-room",
            "Embalming Room",
            &[middle(&[TABLES]), walls(4, &[CABINETS, SHELVES, TROUGHS, SIDE_TABLES])],
            &[tops(2)],
        ),
        purpose(
            "collapsed-vault",
            "Collapsed Vault",
            &[rubble(3, &[ROCKS, RUBBLE, BROKEN_COLUMNS]), walls(10, &[TOMBS, GREAT_TOMBS])],
            &[],
        ),
    ],
    end: purpose(
        "sepulchre",
        "Sepulchre",
        &[flank(&[GREAT_TOMBS, OBELISKS, TOMBS]), walls(6, &[SARCOPHAGI, TOMBS]), alcoves(&[SARCOPHAGI])],
        &[BRAZIER_MIDDLE, tops(2)],
    ),
};

pub(crate) const HALLS: Bank = Bank {
    way_in: purpose("gatehouse", "Gatehouse", &[walls(5, &[RACKS, WALL_RACKS, CRATES, BENCHES])], &[BRAZIERS_FLANK]),
    rooms: &[
        purpose(
            "barracks",
            "Barracks",
            &[rows(Facing::Along, &[BEDS]), walls(6, &[WARDROBES, CUPBOARDS, CRATES]), hung(10, &[HANGINGS])],
            &[],
        ),
        purpose(
            "mess-hall",
            "Mess Hall",
            &[rows(Facing::Across, &[TABLES]), one(&[HEARTHS]), walls(5, &[COUNTERS, CUPBOARDS, BENCHES])],
            &[HEARTH_FIRES, tops(3)],
        ),
        purpose(
            "armoury",
            "Armoury",
            &[walls(3, &[RACKS, WALL_RACKS, CABINETS]), middle(&[TABLES]), hung(8, &[HANGINGS])],
            &[tops(1)],
        ),
        purpose(
            "storeroom",
            "Storeroom",
            &[
                rows(Facing::Across, &[GREAT_CRATES]),
                walls(3, &[CRATES, CUPBOARDS, SHELVES]),
                rubble(8, &[SMALL_CRATES]),
            ],
            &[],
        ),
        purpose(
            "archive",
            "Archive",
            &[rows(Facing::Across, &[LONG_SHELVES]), walls(5, &[STEP_SHELVES, CABINETS]), middle(&[LECTERNS, TABLES])],
            &[tops(2)],
        ),
        purpose(
            "war-room",
            "War Room",
            &[middle(&[TABLES]), walls(4, &[CHAIRS, CABINETS, LONG_TABLES]), hung(6, &[HANGINGS])],
            &[tops(2), BRAZIERS_FLANK],
        ),
    ],
    end: purpose(
        "great-hall",
        "Great Hall",
        &[
            flank(&[STATUES, COLUMNS]),
            one(&[HEARTHS]),
            walls(5, &[LONG_TABLES, BENCHES, THRONES, CHAIRS]),
            hung(5, &[HANGINGS]),
        ],
        &[HEARTH_FIRES, tops(3)],
    ),
};

pub(crate) const CELLS: Bank = Bank {
    way_in: purpose(
        "wardens-gate",
        "Warden's Gate",
        &[walls(4, &[BENCHES, SIDE_TABLES, WALL_RACKS, CHAIRS])],
        &[BRAZIERS_FLANK, tops(1)],
    ),
    rooms: &[
        purpose(
            "cell-block",
            "Cell Block",
            &[alcoves(&[NARROW_BEDS, BENCHES, TROUGHS]), walls(8, &[BENCHES, SMALL_CRATES])],
            &[],
        ),
        purpose(
            "guard-room",
            "Guard Room",
            &[middle(&[TABLES]), walls(3, &[CHAIRS, WALL_RACKS, RACKS, BENCHES])],
            &[tops(1)],
        ),
        purpose(
            "kitchen",
            "Kitchen",
            &[one(&[HEARTHS]), walls(3, &[COUNTERS, CUPBOARDS, TROUGHS, CRATES]), middle(&[TABLES])],
            &[HEARTH_FIRES, tops(1)],
        ),
        purpose(
            "question-room",
            "Question Room",
            &[middle(&[CHAIRS, TABLES]), walls(3, &[RACKS, TROUGHS, CABINETS])],
            &[BRAZIER_MIDDLE],
        ),
        purpose("pit", "Pit", &[rubble(3, &[ROCKS, GREAT_ROCKS, LOGS]), one(&[LADDERS])], &[BRAZIER_MIDDLE]),
        purpose(
            "chain-hall",
            "Chain Hall",
            &[rows(Facing::Across, &[POSTS]), walls(3, &[WALL_RACKS, BENCHES])],
            &[BRAZIERS_FLANK],
        ),
    ],
    end: purpose(
        "wardens-hall",
        "Warden's Hall",
        &[walls(4, &[LONG_TABLES, CABINETS, WARDROBES, CANOPY_BEDS, CHAIRS, DRESSERS])],
        &[BRAZIERS_FLANK, tops(2)],
    ),
};

pub(crate) const SANCTUM: Bank = Bank {
    way_in: purpose(
        "narthex",
        "Narthex",
        &[flank(&[STATUES, ANKHS]), walls(5, &[BENCHES, PEDESTALS])],
        &[BRAZIER_MIDDLE, tops(2)],
    ),
    rooms: &[
        purpose(
            "nave",
            "Nave",
            &[rows(Facing::Along, &[BENCHES]), walls(6, &[COLUMNS, STATUES]), hung(6, &[HANGINGS])],
            &[BRAZIERS_FLANK],
        ),
        purpose(
            "reliquary",
            "Reliquary",
            &[middle(&[PEDESTALS]), walls(3, &[CABINETS, CUPBOARDS, PEDESTALS])],
            &[tops(3)],
        ),
        purpose(
            "scriptorium",
            "Scriptorium",
            &[rows(Facing::Across, &[TABLES]), walls(4, &[SHELVES, LECTERNS, STEP_SHELVES])],
            &[tops(4)],
        ),
        purpose(
            "cloister",
            "Cloister",
            &[walls(3, &[COLUMNS, BENCHES]), middle(&[STATUES, OBELISKS])],
            &[BRAZIERS_FLANK],
        ),
        purpose(
            "shrine",
            "Shrine",
            &[middle(&[OBELISKS, ANKHS, STATUES]), walls(5, &[PEDESTALS, ANKHS]), hung(8, &[HANGINGS])],
            &[BRAZIERS_FLANK, tops(2)],
        ),
        purpose(
            "vestry",
            "Vestry",
            &[walls(3, &[WARDROBES, CUPBOARDS, DRESSERS, CABINETS]), middle(&[TABLES]), hung(10, &[HANGINGS])],
            &[tops(2)],
        ),
    ],
    end: purpose(
        "high-altar",
        "High Altar",
        &[flank(&[STATUES, OBELISKS]), walls(5, &[PEDESTALS, COLUMNS, LECTERNS]), hung(5, &[HANGINGS])],
        &[tops(3), BRAZIER_MIDDLE],
    ),
};

pub(crate) const CAVERNS: Bank = Bank {
    way_in: purpose("cave-mouth", "Cave Mouth", &[rubble(3, &[ROCKS, GREAT_ROCKS, LOGS])], &[crystals(10)]),
    rooms: &[
        purpose("crystal-hollow", "Crystal Hollow", &[rubble(5, &[ROCKS, STANDING_STONES])], &[crystals(3)]),
        purpose(
            "dripping-gallery",
            "Dripping Gallery",
            &[rubble(3, &[ROCKS, GREAT_ROCKS]), one(&[TROUGHS])],
            &[fungus(8)],
        ),
        purpose(
            "bone-pit",
            "Bone Pit",
            &[rubble(2, &[GRAVE_SLABS, ROCKS, HEADSTONES, BROKEN_COLUMNS])],
            &[crystals(8)],
        ),
        purpose("fungus-grove", "Fungus Grove", &[rubble(4, &[LOGS, ROCKS])], &[fungus(3)]),
        purpose(
            "squatters-den",
            "Squatters' Den",
            &[one(&[HEARTHS]), walls(3, &[BEDS, CRATES, BENCHES, TABLES]), rubble(8, &[SMALL_CRATES])],
            &[HEARTH_FIRES, tops(1)],
        ),
        purpose(
            "echoing-chamber",
            "Echoing Chamber",
            &[middle(&[GREAT_ROCKS, STANDING_STONES]), rubble(4, &[ROCKS, STANDING_STONES])],
            &[crystals(6)],
        ),
    ],
    end: purpose(
        "deep-cavern",
        "Deep Cavern",
        &[flank(&[STANDING_STONES]), rubble(4, &[ROCKS, GREAT_ROCKS])],
        &[crystals(5)],
    ),
};

pub(crate) const MINES: Bank = Bank {
    way_in: purpose("adit", "Adit", &[walls(4, &[CRATES, POSTS, LADDERS, BEAMS])], &[POST_LANTERNS, lanterns(10)]),
    rooms: &[
        Purpose {
            shapes: &[Shape::Rectangle],
            ..purpose("gallery", "Gallery", &[walls(3, &[POSTS, BEAMS, CRATES])], &[POST_LANTERNS, lanterns(10)])
        },
        Purpose {
            shapes: &[Shape::Cave],
            ..purpose("stope", "Stope", &[rubble(3, &[ROCKS, GREAT_ROCKS]), one(&[LADDERS, LOGS])], &[lanterns(6)])
        },
        purpose(
            "ore-store",
            "Ore Store",
            &[rows(Facing::Across, &[GREAT_CRATES]), walls(3, &[CRATES, TROUGHS])],
            &[lanterns(8)],
        ),
        purpose(
            "miners-rest",
            "Miners' Rest",
            &[one(&[HEARTHS]), walls(3, &[BEDS, BENCHES, CRATES]), middle(&[TABLES])],
            &[HEARTH_FIRES, tops(1), lanterns(12)],
        ),
        purpose(
            "collapsed-drift",
            "Collapsed Drift",
            &[rubble(2, &[ROCKS, LOGS, RUBBLE]), walls(6, &[BEAMS, POSTS])],
            &[POST_LANTERNS, lanterns(10)],
        ),
        purpose(
            "winch-room",
            "Winch Room",
            &[middle(&[RACKS, LOGS]), walls(3, &[POSTS, CRATES, LADDERS, TROUGHS])],
            &[POST_LANTERNS, lanterns(10)],
        ),
    ],
    end: purpose(
        "motherlode",
        "Motherlode",
        &[rubble(4, &[ROCKS, GREAT_ROCKS]), walls(5, &[CRATES, TROUGHS, POSTS])],
        &[BRAZIERS_FLANK, POST_LANTERNS, lanterns(8)],
    ),
};
