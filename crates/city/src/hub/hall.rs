//! The Hall of the Arts inside the Beacon's base, after the Tower's Hall of Guardians: two rows of columns to its
//! roof, the war table down its middle under two hung rings of light, braziers by the door, and a chapel for each
//! faction, the Stormcallers' and the Veiled's facing each other across it and the Lamplighters' at its back, where
//! Elder Maren Hale keeps their counter.

use super::walks::{BASE_FACE_M, DOOR_DEEP_M};
use super::{Laid, stand_against, stand_at};
use crate::courtyard::Frame;
use crate::landmarks::BEACON_HALL_M;
use crate::solids::{Material, Shape, Solid};
use crate::stations::StationKind;

/// The columns' rows across the Hall, and their places along it seaward of the plaza's middle, metres.
const COLUMN_ACROSS_M: f64 = 16.0;
const COLUMN_TOWARD_M: [f64; 3] = [-124.0, -140.0, -156.0];
/// The war table's middle and the rings of light over it, metres seaward of the plaza's middle.
const TABLE_TOWARD_M: f64 = -140.0;
const LIGHTS_TOWARD_M: [f64; 2] = [-132.0, -148.0];

/// How far in from the Hall's near end the rug's middle lies, and how high the stone walk on from it stands, metres.
pub(crate) const RUG_FROM_DOOR_M: f64 = 9.5;
const NAVE_HIGH_M: f64 = 0.08;

/// The Hall's near and far ends, metres seaward of the plaza's middle, and its half width.
pub(crate) fn hall_span() -> (f64, f64, f64) {
    let [across, deep, _] = BEACON_HALL_M;
    let near = BASE_FACE_M - DOOR_DEEP_M;
    (near, near - deep, across / 2.0)
}

/// The Hall's furnishings and its three chapels.
pub fn hall(frame: &Frame, laid: &mut Laid) {
    let (near, far, half) = hall_span();
    let high = BEACON_HALL_M[2];
    for toward in COLUMN_TOWARD_M {
        for side in [-1.0, 1.0] {
            let across = side * COLUMN_ACROSS_M;
            laid.solids.push(frame.block(toward, across, 0.0, [2.8, 2.8, 0.5], Material::Trim));
            laid.solids.push(frame.round(toward, across, 0.5, [2.2, high - 1.1, 1.0], Material::Stone));
            laid.solids.push(frame.block(toward, across, high - 0.6, [2.8, 2.8, 0.6], Material::Trim));
        }
    }
    let east = [-frame.seaward[1], frame.seaward[0]];
    let west = [-east[0], -east[1]];
    laid.piece(stand_at("war-table", "front", frame.at(TABLE_TOWARD_M, 0.0), frame.level, east));
    for toward in LIGHTS_TOWARD_M {
        let [x, y] = frame.at(toward, 0.0);
        let hoop = Solid::upright(
            Shape::Column { sides: 12, top: 1.0 },
            [x, y, frame.level + 9.6],
            [3.2, 3.2, 0.3],
            Material::Iron,
        );
        let fire = Solid::upright(
            Shape::Column { sides: 12, top: 0.6 },
            [x, y, frame.level + 9.9],
            [1.8, 1.8, 0.5],
            Material::Glow,
        );
        let chain = Solid::upright(Shape::Block, [x, y, frame.level + 10.4], [0.12, 0.12, high - 10.4], Material::Iron);
        laid.solids.extend([hoop, fire, chain]);
    }
    for side in [-1.0, 1.0] {
        laid.solids.extend(super::courts::brazier(frame, near - 6.0, side * 9.0));
    }
    let middle = (near + far) / 2.0;
    let storm = stand_against("chapel-stormcallers", "counter", frame.at(middle, -half), frame.level, east);
    laid.stall(StationKind::Stormcallers, storm);
    let veiled = stand_against("chapel-veiled", "counter", frame.at(middle, half), frame.level, west);
    laid.stall(StationKind::Veiled, veiled);
    let lamps = stand_against("chapel-lamplighters", "counter", frame.at(far, 0.0), frame.level, frame.seaward);
    laid.stall(StationKind::Lamplighters, lamps);
    // Its own paved floor, wall to wall but round the rug, and a raised stone walk on from the rug to the war table.
    // The rug lies on the levelled land itself: the city is drawn a few centimetres nearer than it stands, a bend
    // across a face this large, so a thin rug laid over such a face can lose to it.
    let [rug_wide, rug_long, _] =
        crate::modules::number_of("rug-long").map_or([0.0; 3], |number| crate::modules::all()[number as usize].size);
    let (rug_near, rug_far) = (near - RUG_FROM_DOOR_M + rug_long / 2.0, near - RUG_FROM_DOOR_M - rug_long / 2.0);
    let side = (half - rug_wide / 2.0) / 2.0;
    for (toward, across, size) in [
        ((near + far) / 2.0, -half + side, [2.0 * side, near - far]),
        ((near + far) / 2.0, half - side, [2.0 * side, near - far]),
        ((near + rug_near) / 2.0, 0.0, [rug_wide, near - rug_near]),
        ((rug_far + far) / 2.0, 0.0, [rug_wide, rug_far - far]),
    ] {
        laid.solids.push(frame.block(toward, across, 0.0, [size[0], size[1], 0.01], Material::Paving));
    }
    let to = far + 12.0;
    laid.solids.push(frame.block((rug_far + to) / 2.0, 0.0, 0.0, [4.0, rug_far - to, NAVE_HIGH_M], Material::Stone));
    laid.spots.push(frame.at(TABLE_TOWARD_M + 12.0, 6.25));
}
