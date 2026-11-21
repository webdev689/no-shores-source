//! The mail counter in Overlook's hub, where its keeper hands over the game's letters: a timber counter with parcels
//! on it, and behind its keeper a rack of pigeonholes holding letters under a lamp. A station like the hub's stalls,
//! its keeper facing out over the counter (`hub`).

use crate::courtyard::Frame;
use crate::landmarks::turn_toward;
use crate::solids::{Material, Solid};
use crate::stations::{Station, StationKind};

/// How far behind the counter its keeper stands, and the rack behind them, metres.
const KEEPER_BACK_M: f64 = 1.6;
const RACK_BACK_M: f64 = 3.0;
/// How far before the counter a player is served, as a stall's counter point stands before its counter, so the ring
/// round it clears the rack behind the keeper.
const SERVED_BEFORE_M: f64 = 1.0;

/// The mail counter standing at `at` (east, south) on a floor at `level`, its keeper facing along `facing` (a unit
/// vector) over it: its station, served a metre before it, and its solids.
#[must_use]
pub fn mail_counter(at: [f64; 2], level: f64, facing: [f64; 2]) -> (Station, Vec<Solid>) {
    // Laid in a frame of its own whose sea is the way its keeper faces.
    let frame = Frame { middle: at, seaward: facing, depth: 0.0, length: 0.0, level };
    let rack = -RACK_BACK_M;
    let mut solids = vec![
        frame.block(0.0, 0.0, 0.0, [3.6, 0.8, 1.05], Material::Timber),
        frame.block(0.0, -1.0, 1.05, [0.6, 0.45, 0.3], Material::Plaster),
        frame.block(0.0, 1.1, 1.05, [0.4, 0.35, 0.22], Material::Timber),
        frame.block(rack, 0.0, 0.0, [3.2, 0.5, 2.3], Material::Timber),
        frame.block(rack + 0.1, 0.0, 2.3, [0.3, 0.2, 0.2], Material::Glow),
    ];
    // Letters in the pigeonholes, two rows of three on the rack's face.
    for base in [0.9, 1.5] {
        for along in [-1.0, 0.0, 1.0] {
            solids.push(frame.block(rack + 0.27, along, base, [0.6, 0.03, 0.35], Material::Plaster));
        }
    }
    let station = Station {
        kind: StationKind::Mail,
        keeper: frame.at(-KEEPER_BACK_M, 0.0),
        facing: turn_toward(facing),
        counter: frame.at(SERVED_BEFORE_M, 0.0),
    };
    (station, solids)
}
