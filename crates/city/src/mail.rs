//! The mail counter in Overlook's plaza, where its keeper hands over the game's letters: a timber counter standing
//! free on the factions' side, seaward of the obelisk's braziers, across the plaza from the bounty board, with parcels
//! on it, and behind its keeper a rack of pigeonholes holding letters under a lamp. A station like the arcades', its
//! keeper facing the sea.

use crate::courtyard::Frame;
use crate::landmarks::turn_toward;
use crate::solids::{Material, Solid};
use crate::stations::{Station, StationKind};

/// Where the counter stands in the plaza's frame: metres toward the sea from its middle, and across it.
pub const MAIL_AT_M: [f64; 2] = [24.0, 45.0];
/// How far landward of the counter its keeper stands, and the rack behind them, metres.
const KEEPER_BACK_M: f64 = 1.6;
const RACK_BACK_M: f64 = 3.0;

/// The mail counter's station, and its solids.
#[must_use]
pub fn mail_counter(frame: &Frame) -> (Station, Vec<Solid>) {
    let [toward, across] = MAIL_AT_M;
    let rack = toward - RACK_BACK_M;
    let mut solids = vec![
        frame.block(toward, across, 0.0, [3.6, 0.8, 1.05], Material::Timber),
        frame.block(toward, across - 1.0, 1.05, [0.6, 0.45, 0.3], Material::Plaster),
        frame.block(toward, across + 1.1, 1.05, [0.4, 0.35, 0.22], Material::Timber),
        frame.block(rack, across, 0.0, [3.2, 0.5, 2.3], Material::Timber),
        frame.block(rack + 0.1, across, 2.3, [0.3, 0.2, 0.2], Material::Glow),
    ];
    // Letters in the pigeonholes, two rows of three on the rack's face.
    for base in [0.9, 1.5] {
        for along in [-1.0, 0.0, 1.0] {
            solids.push(frame.block(rack + 0.27, across + along, base, [0.6, 0.03, 0.35], Material::Plaster));
        }
    }
    let station = Station {
        kind: StationKind::Mail,
        keeper: frame.at(toward - KEEPER_BACK_M, across),
        facing: turn_toward(frame.seaward),
        counter: frame.at(toward, across),
    };
    (station, solids)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::board;
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
    fn the_counter_stands_on_the_plaza_clear_of_the_courtyard_the_stations_the_board_and_every_spawn() {
        for frame in FRAMES {
            let (station, solids) = mail_counter(&frame);
            let standing: Vec<[f64; 6]> = courtyard(&frame)
                .into_iter()
                .chain(stations(&frame, false).1)
                .chain(board(&frame).1)
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
                    assert!(on && across.abs() > 6.0, "on the plaza, off the processional way");
                }
            }
            // The keeper stands between the counter and the rack, clear of both, facing the sea.
            let keeper = [station.keeper[0], station.keeper[1], station.keeper[0], station.keeper[1], 0.0, 0.0];
            assert!(solids.iter().all(|piece| gap(piece.bounds(), keeper) > 0.4), "the keeper stands clear");
            assert!((station.facing - turn_toward(frame.seaward)).abs() < 1e-9, "the keeper faces the sea");
        }
    }

    /// Twice a counter's reach (the room's 4 m) apart, so where the mail serves no other counter does: every
    /// station's, every spot Shape may stand at, and where the bounty board is read.
    #[test]
    fn no_counter_shapes_spot_or_the_board_overlaps_the_mails() {
        for frame in FRAMES {
            let (station, _) = mail_counter(&frame);
            let (stations, _) = stations(&frame, false);
            let others = stations.iter().map(|station| station.counter).chain(visitor_spots(&frame));
            for [x, y] in others.chain([board(&frame).0.front]) {
                let apart = libm::hypot(station.counter[0] - x, station.counter[1] - y);
                assert!(apart > 8.0, "a counter {apart:.1} m from the mail's");
            }
        }
    }

    /// The townsfolk's lanes as the page walks them (`content/world/social.json`), metres toward the sea and across.
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Lanes {
        toward: Vec<f64>,
        across: Vec<f64>,
    }

    #[derive(serde::Deserialize)]
    struct Social {
        lanes: Lanes,
    }

    /// The counter, its keeper and where a player stands before it keep off every lane, so no one walks through them.
    #[test]
    fn the_counter_and_its_keeper_stand_off_the_townsfolks_lanes() {
        let social: Social =
            serde_json::from_str(include_str!("../../../content/world/social.json")).expect("social.json reads");
        let frame = FRAMES[0];
        let (station, solids) = mail_counter(&frame);
        let before = frame.at(MAIL_AT_M[0] + 2.0, MAIL_AT_M[1]);
        let points = solids.iter().map(|piece| [piece.at[0], piece.at[1]]).chain([station.keeper, before]);
        for point in points {
            let [toward, across] = local(&frame, point);
            let rows = social.lanes.toward.iter().map(|lane| (lane - toward).abs());
            let nearest =
                rows.chain(social.lanes.across.iter().map(|lane| (lane - across).abs())).fold(f64::MAX, f64::min);
            assert!(nearest > 4.0, "{toward} toward the sea, {across} across, stands {nearest} m off a lane");
        }
    }
}
