//! The walks round the courts on the Beacon's platform: the Beacon Walk between the courts and the Beacon's base, its
//! portico before the Hall's great door, townsfolk's market stalls and braziers; the East and West Walks off the
//! plaza's ends; the Stair Yard on round the base's east side, where the Tack keeps a stable at the head of the
//! Harbour Stair down to the harbour way; and the sealed gates where the platform runs on round the base.

use super::courts::{HALF_LENGTH_M, PLATFORM_FROM_M, brazier};
use super::{Laid, parapet, stand_against, stand_at};
use crate::courtyard::Frame;
use crate::landmarks::turn_toward;
use crate::solids::{Material, Shape, Solid};
use crate::stations::StationKind;
use land::ground::Ground;

/// The Beacon's base's face toward the plaza and the platform's edges beside it, metres seaward of the plaza's middle
/// and across it: the walks run from the courts to the base, and on along the plaza's ends to the platform's edges.
pub(crate) const BASE_FACE_M: f64 = -105.0;
pub(crate) const PLATFORM_EDGE_M: f64 = 154.0;
/// The walls that close the walks where the platform runs on round the base: seaward of the base's face, from the base's
/// corner towers out to the platform's edges, their thickness and height; a sealed gate in each.
pub(crate) const SEALED_M: [f64; 4] = [-108.0, 76.0, 2.0, 10.0];
const SEALED_GATE_ACROSS_M: f64 = 115.0;
/// On the east, the wall closes the Stair Yard past the Harbour Stair's head, where the city's switchback meets the
/// platform (`ramps`), metres seaward of the plaza's middle.
pub(crate) const SEALED_EAST_M: f64 = -150.0;
/// The Tack's stable against the base's east face, its middle metres seaward of the plaza's middle.
const STABLE_TOWARD_M: f64 = -130.0;
/// The portico before the Hall's door: its width, its podium's depth before the base and height, its columns' height.
/// The podium runs on through the door, and steps lead up to it outside and down from it inside.
const PORTICO_M: [f64; 4] = [52.0, 16.0, 0.9, 11.0];
/// How deep the base's wall is at the door, metres.
pub(crate) const DOOR_DEEP_M: f64 = 5.0;
/// The Hall's door: its width and its height over the portico's podium.
pub(crate) const DOOR_M: [f64; 2] = [12.0, 9.5];

/// The Beacon Walk and the East and West Walks.
pub fn beacon_walk(ground: &Ground, frame: &Frame, laid: &mut Laid) {
    let across = [-frame.seaward[1], frame.seaward[0]];
    laid.solids.extend(portico(frame));
    for side in [-1.0, 1.0] {
        laid.solids.extend(brazier(frame, BASE_FACE_M + 22.0, side * 36.0));
        let edge = side * PLATFORM_EDGE_M;
        // Over the city below the walks' seaward ends, beside the plaza's ends.
        laid.solids.push(parapet(
            ground,
            frame.at(PLATFORM_FROM_M, side * HALF_LENGTH_M),
            frame.at(PLATFORM_FROM_M, edge),
            frame.seaward,
            frame.level,
        ));
        let [west_toward, from, thick, high] = SEALED_M;
        let toward = if side > 0.0 { SEALED_EAST_M } else { west_toward };
        let length = PLATFORM_EDGE_M - from;
        let wall = frame.block(toward, side * (from + length / 2.0), 0.0, [length, thick, high], Material::Stone);
        laid.solids.push(wall);
        let gate = frame.at(toward + thick / 2.0, side * SEALED_GATE_ACROSS_M);
        laid.piece(stand_against("sealed-gate", "front", gate, frame.level, frame.seaward));
        laid.spots.push(frame.at(toward + 9.0, side * (SEALED_GATE_ACROSS_M - 9.0)));
    }
    let north = frame.seaward;
    for (name, side) in [("market-stall-fish", -58.0), ("market-stall-fruit", 58.0)] {
        laid.piece(stand_against(name, "front", frame.at(BASE_FACE_M, side), frame.level, north));
    }
    laid.piece(stand_against("market-stall-pots", "front", frame.at(SEALED_M[0] + 1.0, -136.0), frame.level, north));
    laid.piece(stand_at("crates-barrels", "front", frame.at(BASE_FACE_M + 4.0, -72.0), frame.level, north));
    let east = [across[0], across[1]];
    let base_side = SEALED_M[1] - 0.5;
    let stable = stand_against("stall-tack", "counter", frame.at(STABLE_TOWARD_M, base_side), frame.level, east);
    laid.stall(StationKind::Tack, stable);
    for side in [-1.0, 1.0] {
        laid.piece(stand_at("lamp-post", "front", frame.at(-80.0, side * 142.0), frame.level, north));
    }
}

/// The portico before the Hall's great door in the base's face: a podium up two steps, running on through the
/// door to two steps down into the Hall, six columns, an entablature and a pediment, and the door's arch, open.
fn portico(frame: &Frame) -> Vec<Solid> {
    let [width, deep, raised, tall] = PORTICO_M;
    let back = BASE_FACE_M;
    let front = back + deep;
    let mut solids = vec![frame.block(back + deep / 2.0, 0.0, 0.0, [width, deep, raised], Material::Stone)];
    let [door_wide, door_high] = DOOR_M;
    solids.push(frame.block(back - DOOR_DEEP_M / 2.0, 0.0, 0.0, [door_wide, DOOR_DEEP_M, raised], Material::Stone));
    for step in 1..=2 {
        let rise = raised * f64::from(step) / 3.0;
        let out = f64::from(3 - step);
        solids.push(frame.block(front + out - 0.5, 0.0, 0.0, [width, 1.0, rise], Material::Stone));
        let inside = back - DOOR_DEEP_M - out + 0.5;
        solids.push(frame.block(inside, 0.0, 0.0, [door_wide, 1.0, rise], Material::Stone));
    }
    for column in 0..6 {
        let across = (f64::from(column) - 2.5) * 8.0;
        solids.push(frame.round(front - 2.0, across, raised, [1.8, tall, 0.86], Material::Stone));
    }
    let lintel = raised + tall;
    solids.push(frame.block(back + deep / 2.0, 0.0, lintel, [width, deep, 2.0], Material::Trim));
    let [x, y] = frame.at(back + deep / 2.0, 0.0);
    let pediment = Solid::upright(Shape::Gable, [x, y, frame.level + lintel + 2.0], [width, deep, 7.0], Material::Trim);
    solids.push(pediment.turned(turn_toward(frame.seaward)));
    let [x, y] = frame.at(back + 0.3, 0.0);
    let arch = Shape::Arch { opening: 0.8 };
    let arch =
        Solid::upright(arch, [x, y, frame.level + raised], [door_wide + 3.0, 0.6, door_high + 1.5], Material::Trim);
    solids.push(arch.turned(turn_toward(frame.seaward)));
    solids
}
