//! The bounty board in Overlook's hub: a timber board under a little roof, its notices and its lamp, standing on the
//! notice board's landing against the Watch Court's west range (`hub::BOARD_LANDING_M`), its face to the court. It is
//! built of the hub's own solids, so the plaza draws, collides and lights it as the rest. It is no station and no
//! keeper stands at it: a player reads it from before its face, where the room serves its asks.

use crate::courtyard::Frame;
use crate::landmarks::turn_toward;
use crate::solids::{Material, Shape, Solid};
use serde::Serialize;

/// How far before its face a player stands to read it, metres.
pub const READ_FROM_M: f64 = 2.0;

/// The bounty board: its middle, the way its face looks (radians clockwise from north), and where a player stands to
/// read it.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Board {
    pub at: [f64; 2],
    pub facing: f64,
    pub front: [f64; 2],
}

/// The board standing at `at` (east, south) on a floor at `level`, its face looking along `facing` (a unit vector),
/// and its solids: two posts, the face, six notices in two rows, a lamp and a gable roof.
#[must_use]
pub fn board(at: [f64; 2], level: f64, facing: [f64; 2]) -> (Board, Vec<Solid>) {
    // Laid in a frame of its own whose sea is the way its face looks.
    let frame = Frame { middle: at, seaward: facing, depth: 0.0, length: 0.0, level };
    let turned = turn_toward(facing);
    let mut solids: Vec<Solid> =
        [-1.9, 1.9].map(|side| frame.block(0.0, side, 0.0, [0.25, 0.25, 3.1], Material::Timber)).to_vec();
    solids.push(frame.block(0.0, 0.0, 0.9, [3.6, 0.15, 2.0], Material::Timber));
    for base in [1.15, 1.95] {
        for along in [-1.1, 0.0, 1.1] {
            solids.push(frame.block(0.09, along, base, [0.7, 0.03, 0.6], Material::Plaster));
        }
    }
    solids.push(frame.block(0.3, 0.0, 2.95, [0.3, 0.2, 0.2], Material::Glow));
    solids.push(
        Solid::upright(Shape::Gable, [at[0], at[1], level + 3.1], [4.2, 0.9, 0.6], Material::Roof).turned(turned),
    );
    (Board { at, facing: turned, front: frame.at(READ_FROM_M, 0.0) }, solids)
}
