//! The hub's courts on the plaza: the seaward walk along the parapet, where players arrive; the Watch Court between
//! the ranges, the landing; the West Court through the west range's passages; the Forge Yard through the east's.

use super::{Laid, parapet, stand_against, stand_at};
use crate::courtyard::{Frame, OBELISK_M, PARAPET_TOP_M};
use crate::landmarks::turn_toward;
use crate::solids::{Material, Shape, Solid};
use crate::stations::StationKind;
use land::ground::Ground;

/// The plaza's half depth and half length, metres: its parapets stand on these lines.
pub(crate) const HALF_DEPTH_M: f64 = 60.0;
pub(crate) const HALF_LENGTH_M: f64 = 130.0;
/// Where the platform's ground beside the plaza (the landmark's cells) starts landward, metres seaward of the middle:
/// past it the plaza's east and west ends open onto the walks.
pub(crate) const PLATFORM_FROM_M: f64 = -26.0;
/// The ranges: their middles across the plaza, their depth, and how far seaward they run (the seaward walk passes in
/// front of them).
pub(crate) const RANGE_ACROSS_M: f64 = 60.0;
pub(crate) const RANGE_DEEP_M: f64 = 10.0;
pub(crate) const RANGE_SEAWARD_M: f64 = 48.0;
/// The ranges' pieces from the seaward end landward: a plain range, a gate, a range, a gate, a range; each piece's
/// length along the range, metres.
const RANGE_PIECES: [(&str, f64); 5] =
    [("range", 24.0), ("range-gate", 12.0), ("range", 24.0), ("range-gate", 12.0), ("range", 24.0)];
/// The obelisk's middle, metres seaward of the plaza's middle.
const OBELISK_TOWARD_M: f64 = 8.0;
/// How thick a band laid in the paving is, metres: too low to step over, and clear of the paving's face.
const INLAY_M: f64 = 0.02;
/// The notice board's landing: its middle across, its size across and along, and its height (three steps of 0.15).
pub const BOARD_LANDING_M: [f64; 4] = [-51.5, 6.0, 9.0, 0.45];

/// A unit vector across the plaza (toward its positive end), and seaward.
fn across_of(frame: &Frame) -> [f64; 2] {
    [-frame.seaward[1], frame.seaward[0]]
}

fn landward(frame: &Frame) -> [f64; 2] {
    [-frame.seaward[0], -frame.seaward[1]]
}

fn scaled(direction: [f64; 2], by: f64) -> [f64; 2] {
    [direction[0] * by, direction[1] * by]
}

/// The seaward walk: the parapet along the plaza's sea edge with a lantern every 40 m, the plaza's ends walled where
/// the city lies below them, its paving, and benches facing the sea between the arrivals.
pub fn seaward_walk(ground: &Ground, frame: &Frame, laid: &mut Laid) {
    let across = across_of(frame);
    let ends = [-HALF_LENGTH_M, HALF_LENGTH_M];
    laid.solids.push(parapet(
        ground,
        frame.at(HALF_DEPTH_M, ends[0]),
        frame.at(HALF_DEPTH_M, ends[1]),
        frame.seaward,
        frame.level,
    ));
    for side in [-1.0, 1.0] {
        let outward = scaled(across, side);
        let edge = side * HALF_LENGTH_M;
        laid.solids.push(parapet(
            ground,
            frame.at(HALF_DEPTH_M, edge),
            frame.at(PLATFORM_FROM_M, edge),
            outward,
            frame.level,
        ));
    }
    let [x, y] = frame.middle;
    let size = [2.0 * HALF_LENGTH_M, 2.0 * HALF_DEPTH_M, 0.05];
    let paving = Solid::upright(Shape::Block, [x, y, frame.level - 0.05], size, Material::Paving);
    laid.solids.push(paving.turned(turn_toward(frame.seaward)));
    for step in -3_i32..=3 {
        let along = f64::from(step) * 40.0;
        let [x, y] = frame.at(HALF_DEPTH_M, along);
        let top = frame.level + PARAPET_TOP_M;
        laid.solids.push(Solid::upright(
            Shape::Column { sides: 8, top: 0.7 },
            [x, y, top],
            [0.3, 0.3, 2.4],
            Material::Iron,
        ));
        laid.solids.push(Solid::upright(Shape::Block, [x, y, top + 2.4], [0.5, 0.5, 0.6], Material::Glow));
        laid.solids.push(Solid::upright(
            Shape::Pyramid { top: 0.0 },
            [x, y, top + 3.0],
            [0.7, 0.7, 0.4],
            Material::Iron,
        ));
    }
    for along in [-110.0, -80.0, 80.0, 110.0] {
        laid.piece(stand_at("bench", "front", frame.at(51.0, along), frame.level, frame.seaward));
    }
    laid.spots.push(frame.at(57.0, -95.0));
}

/// The Watch Court, the landing: the obelisk on its stepped plinth, braziers either side, a processional way from the
/// seaward walk to the Beacon's portico, the two vault houses either side of it, the Mage's study against the east
/// range, the notice board's landing against the west range, benches and lamp posts.
pub fn watch_court(frame: &Frame, laid: &mut Laid) {
    let across = across_of(frame);
    laid.solids.push(frame.round(OBELISK_TOWARD_M, 0.0, 0.0, [16.0, 0.5, 1.0], Material::Stone));
    laid.solids.push(frame.round(OBELISK_TOWARD_M, 0.0, 0.5, [11.0, 0.5, 1.0], Material::Stone));
    let [x, y] = frame.at(OBELISK_TOWARD_M, 0.0);
    let shaft = Shape::Pyramid { top: 0.55 };
    laid.solids.push(Solid::upright(shaft, [x, y, frame.level + 1.0], [2.4, 2.4, OBELISK_M], Material::Trim));
    let cap = Solid::upright(
        Shape::Pyramid { top: 0.0 },
        [x, y, frame.level + 1.0 + OBELISK_M],
        [1.32, 1.32, 1.4],
        Material::Gold,
    );
    laid.solids.push(cap);
    for side in [-22.0, 22.0] {
        laid.solids.extend(brazier(frame, OBELISK_TOWARD_M, side));
    }
    let from = -HALF_DEPTH_M;
    let to = RANGE_SEAWARD_M - 1.0;
    laid.solids.push(frame.block((from + to) / 2.0, 0.0, 0.0, [6.0, to - from, INLAY_M], Material::Stone));
    laid.solids.push(frame.round(OBELISK_TOWARD_M, 0.0, 0.0, [26.0, INLAY_M, 1.0], Material::Stone));
    for side in [-1.0, 1.0] {
        let vault = stand_at("stall-vault", "counter", frame.at(-30.0, side * 24.0), frame.level, frame.seaward);
        laid.stall(StationKind::Vault, vault);
    }
    let range_face = RANGE_ACROSS_M - RANGE_DEEP_M / 2.0;
    let mage = stand_against("stall-mage", "counter", frame.at(0.0, range_face), frame.level, scaled(across, -1.0));
    laid.stall(StationKind::Mage, mage);
    let [middle, wide, long, high] = BOARD_LANDING_M;
    laid.solids.push(frame.block(0.0, middle, 0.0, [wide, long, high], Material::Stone));
    for step in 1..=2 {
        let rise = high * f64::from(step) / 3.0;
        let out = middle + wide / 2.0 + f64::from(3 - step) * 0.4 - 0.2;
        laid.solids.push(frame.block(0.0, out, 0.0, [0.4, long, rise], Material::Stone));
    }
    for side in [-1.0, 1.0] {
        laid.piece(stand_at(
            "bench",
            "front",
            frame.at(OBELISK_TOWARD_M + 16.0, side * 12.0),
            frame.level,
            landward(frame),
        ));
        for toward in [44.0, -56.0] {
            laid.piece(stand_at("lamp-post", "front", frame.at(toward, side * 50.0), frame.level, frame.seaward));
        }
    }
}

/// A brazier: an iron stem and bowl with a fire in it.
pub(crate) fn brazier(frame: &Frame, toward: f64, across: f64) -> [Solid; 3] {
    [
        frame.round(toward, across, 0.0, [0.8, 1.1, 0.5], Material::Iron),
        frame.round(toward, across, 1.1, [1.0, 0.5, 1.6], Material::Iron),
        frame.round(toward, across, 1.6, [1.1, 0.35, 0.7], Material::Glow),
    ]
}

/// The West Court, after Tower North: the Tailor's atelier against the west parapet, a fountain in the middle with
/// benches round it, and the bandstand where the band plays.
pub fn west_court(frame: &Frame, laid: &mut Laid) {
    let across = across_of(frame);
    let parapet_face = -HALF_LENGTH_M + 0.4;
    let tailor = stand_against("stall-tailor", "counter", frame.at(22.0, parapet_face), frame.level, across);
    laid.stall(StationKind::Tailor, tailor);
    laid.piece(stand_at("fountain", "front", frame.at(-6.0, -98.0), frame.level, frame.seaward));
    for (toward, side, facing) in [(-6.0, -112.0, across), (-6.0, -84.0, scaled(across, -1.0))] {
        laid.piece(stand_at("bench", "front", frame.at(toward, side), frame.level, facing));
    }
    laid.piece(stand_at("bandstand", "front", frame.at(-40.0, -98.0), frame.level, frame.seaward));
    laid.spots.push(frame.at(4.5, -98.0));
    for (toward, side) in [(44.0, -76.0), (44.0, -122.0), (-56.0, -122.0)] {
        laid.piece(stand_at("lamp-post", "front", frame.at(toward, side), frame.level, frame.seaward));
    }
}

/// The Forge Yard, toward the harbour as the Tower's Hangar lay: the Weaponsmith's forge and the Armorsmith's armoury
/// against the east parapet, the anvil yard where two smiths work, crates and a hay cart.
pub fn forge_yard(frame: &Frame, laid: &mut Laid) {
    let west = [-across_of(frame)[0], -across_of(frame)[1]];
    let parapet_face = HALF_LENGTH_M - 0.4;
    let forge = stand_against("stall-weaponsmith", "counter", frame.at(26.0, parapet_face), frame.level, west);
    laid.stall(StationKind::Weaponsmith, forge);
    let armoury = stand_against("stall-armorsmith", "counter", frame.at(-12.0, parapet_face), frame.level, west);
    laid.stall(StationKind::Armorsmith, armoury);
    laid.piece(stand_at("anvil-yard", "front", frame.at(8.0, 98.0), frame.level, west));
    laid.piece(stand_at("crates-barrels", "front", frame.at(42.0, 116.0), frame.level, west));
    laid.piece(stand_at("hay-cart", "front", frame.at(-44.0, 112.0), frame.level, frame.seaward));
    laid.spots.push(frame.at(42.0, 74.0));
    for (toward, side) in [(44.0, 76.0), (-56.0, 76.0)] {
        laid.piece(stand_at("lamp-post", "front", frame.at(toward, side), frame.level, frame.seaward));
    }
}

/// The two stone ranges between the Watch Court and the side courts, each of five pieces from the seaward walk
/// landward, two of them gates whose arched passages lead through; their arcades face the Watch Court.
pub fn ranges(frame: &Frame, laid: &mut Laid) {
    let across = across_of(frame);
    for side in [-1.0, 1.0] {
        let mut toward = RANGE_SEAWARD_M;
        for (name, length) in RANGE_PIECES {
            let middle = frame.at(toward - length / 2.0, side * RANGE_ACROSS_M);
            laid.piece(stand_at(name, "front", middle, frame.level, scaled(across, -side)));
            toward -= length;
        }
    }
}
