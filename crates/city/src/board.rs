//! The bounty board in Overlook's plaza: a timber board under a little roof, its notices and its lamp facing the sea,
//! standing free on the Mage's side, seaward of the obelisk's braziers. It is built of the courtyard's own solids,
//! so the plaza draws, collides and lights it as the rest. It is no station and no keeper stands at it: a player reads
//! it from before its face, where the room serves its asks.

use crate::courtyard::Frame;
use crate::landmarks::turn_toward;
use crate::solids::{Material, Shape, Solid};
use serde::Serialize;

/// The city whose plaza has the bounty board.
pub const BOARD_CITY: &str = "overlook";
/// Where the board stands in the plaza's frame: metres toward the sea from its middle, and across it.
pub const BOARD_AT_M: [f64; 2] = [24.0, -45.0];
/// How far before its face a player stands to read it, metres.
const READ_FROM_M: f64 = 2.0;

/// The bounty board: its middle, the way its face looks (radians clockwise from north), and where a player stands to
/// read it.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Board {
    pub at: [f64; 2],
    pub facing: f64,
    pub front: [f64; 2],
}

/// The board in a plaza, and its solids: two posts, the face, six notices in two rows, a lamp and a gable roof.
#[must_use]
pub fn board(frame: &Frame) -> (Board, Vec<Solid>) {
    let [toward, across] = BOARD_AT_M;
    let facing = turn_toward(frame.seaward);
    let mut solids: Vec<Solid> =
        [-1.9, 1.9].map(|side| frame.block(toward, across + side, 0.0, [0.25, 0.25, 3.1], Material::Timber)).to_vec();
    solids.push(frame.block(toward, across, 0.9, [3.6, 0.15, 2.0], Material::Timber));
    for base in [1.15, 1.95] {
        for along in [-1.1, 0.0, 1.1] {
            solids.push(frame.block(toward + 0.09, across + along, base, [0.7, 0.03, 0.6], Material::Plaster));
        }
    }
    solids.push(frame.block(toward + 0.3, across, 2.95, [0.3, 0.2, 0.2], Material::Glow));
    let [x, y] = frame.at(toward, across);
    solids
        .push(Solid::upright(Shape::Gable, [x, y, frame.level + 3.1], [4.2, 0.9, 0.6], Material::Roof).turned(facing));
    let front = frame.at(toward + READ_FROM_M, across);
    (Board { at: [x, y], facing, front }, solids)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::courtyard::{SPAWN_OFFSETS_M, courtyard, visitor_spots};
    use crate::stations::stations;

    const FRAMES: [Frame; 2] = [
        Frame { middle: [1000.0, 2000.0], seaward: [0.0, -1.0], depth: 120.0, length: 260.0, level: 80.0 },
        Frame { middle: [500.0, -200.0], seaward: [1.0, 0.0], depth: 120.0, length: 260.0, level: 30.0 },
    ];

    /// A point in the plaza's frame: metres toward the sea from its middle, and across it.
    fn local(frame: &Frame, [x, y]: [f64; 2]) -> [f64; 2] {
        let [east, south] = [x - frame.middle[0], y - frame.middle[1]];
        let [toward_x, toward_y] = frame.seaward;
        [east * toward_x + south * toward_y, -east * toward_y + south * toward_x]
    }

    /// The gap between two boxes on the ground, metres: none where they overlap.
    fn gap(one: [f64; 6], other: [f64; 6]) -> f64 {
        let along =
            |low: f64, high: f64, other_low: f64, other_high: f64| (other_low - high).max(low - other_high).max(0.0);
        libm::hypot(along(one[0], one[2], other[0], other[2]), along(one[1], one[3], other[1], other[3]))
    }

    #[test]
    fn the_board_stands_on_the_plaza_clear_of_the_courtyard_the_stations_and_every_spawn() {
        for frame in FRAMES {
            let (board, solids) = board(&frame);
            let standing: Vec<[f64; 6]> = courtyard(&frame)
                .into_iter()
                .chain(stations(&frame, false).1)
                .filter(|solid| solid.size[2] > 0.1)
                .map(|solid| solid.bounds())
                .collect();
            for piece in &solids {
                let bounds = piece.bounds();
                assert!(bounds[4] >= frame.level - 1e-9, "{piece:?}");
                assert!(standing.iter().all(|other| gap(bounds, *other) > 1.0), "{piece:?} stands within a metre");
                for across in SPAWN_OFFSETS_M {
                    let [x, y] = frame.at(frame.depth / 2.0 - 4.0, across);
                    assert!(gap(bounds, [x, y, x, y, 0.0, 0.0]) > 10.0, "a spawn by {piece:?}");
                }
                for corner in [[bounds[0], bounds[1]], [bounds[2], bounds[3]]] {
                    let [toward, across] = local(&frame, corner);
                    let on = toward.abs() < frame.depth / 2.0 - 2.0 && across.abs() < frame.length / 2.0 - 2.0;
                    assert!(on, "on the plaza");
                    assert!(across.abs() > 6.0, "off the processional way");
                }
            }
            let [toward, across] = local(&frame, board.front);
            assert!((toward - 26.0).abs() < 1e-9 && (across + 45.0).abs() < 1e-9, "read from before its face");
            // Twice a counter's reach (the room's 4 m) apart, so where the board serves no other counter does: every
            // station's, the Harbourmaster's among them, and every spot Shape may stand at.
            let (stations, _) = stations(&frame, false);
            let counters = stations.iter().map(|station| station.counter).chain(visitor_spots(&frame));
            for [x, y] in counters {
                let apart = libm::hypot(board.front[0] - x, board.front[1] - y);
                assert!(apart > 8.0, "a counter {apart:.1} m from where the board is read");
            }
            assert!((board.facing - turn_toward(frame.seaward)).abs() < 1e-9, "its face to the sea");
        }
    }
}
