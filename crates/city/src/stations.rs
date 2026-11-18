//! The social plaza's stations, as the Tower's merchants stand in its booths: one in each alcove of the arcades, a
//! counter across the alcove under its hung lamp, its keeper behind it facing the plaza, and its goods on shelves
//! against the back wall. The Reader of Vestiges, the vaults, the Quartermaster and the Armsmith answer a player's
//! gear; the Harbourmaster and the traders make the plaza a busy place.

use crate::courtyard::{ARCADE_M, Frame};
use crate::landmarks::turn_toward;
use crate::solids::{Material, Solid};
use serde::Serialize;

/// What a station is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StationKind {
    /// Opens a player's Vestiges, as the Tower's Cryptarch decrypts engrams.
    Reader,
    /// A player's vault.
    Vault,
    /// Armour.
    Quartermaster,
    /// Weapons.
    Armsmith,
    /// The harbour and the ships.
    Harbourmaster,
    Chandler,
    Fishmonger,
    Cartographer,
    Tailor,
    Herbalist,
    Smith,
}

/// A station: what it is, where its keeper stands and which way they face (radians clockwise from north), and its
/// counter's middle, where a player comes to it.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Station {
    pub kind: StationKind,
    pub keeper: [f64; 2],
    pub facing: f64,
    pub counter: [f64; 2],
}

/// The stations in the alcoves, nearest the portico first: on one side, then the other. The Reader stands by the
/// door as the Cryptarch stood by the Tower's hall, and a vault stands on each side.
const ALCOVES: [[StationKind; 6]; 2] = [
    [
        StationKind::Reader,
        StationKind::Vault,
        StationKind::Quartermaster,
        StationKind::Armsmith,
        StationKind::Chandler,
        StationKind::Fishmonger,
    ],
    [
        StationKind::Harbourmaster,
        StationKind::Vault,
        StationKind::Cartographer,
        StationKind::Tailor,
        StationKind::Herbalist,
        StationKind::Smith,
    ],
];
/// A counter: its width across the alcove, its depth and its height, metres; and how far inside the arcade's columns
/// it stands, the keeper behind it, and the shelves against the back wall.
const COUNTER_M: [f64; 3] = [5.0, 0.8, 1.05];
const COUNTER_IN_M: f64 = 1.6;
const KEEPER_IN_M: f64 = 3.4;
const SHELVES_IN_M: f64 = 8.6;

/// The stations, and everything they stand on the plaza.
#[must_use]
pub fn stations(frame: &Frame) -> (Vec<Station>, Vec<Solid>) {
    let [start, end, deep, ..] = ARCADE_M;
    let spacing = ARCADE_M[4];
    let length = end - start;
    // The arcade's own count of bays, so each counter stands under an alcove's lamp, between its dividers.
    let bays = (length / spacing / 2.0).round() * 2.0;
    let pitch = length / bays;
    let front = -frame.depth / 2.0 + deep;
    let facing = turn_toward(frame.seaward);
    let mut found = Vec::new();
    let mut solids = Vec::new();
    for (row, side) in [(0, -1.0), (1, 1.0)] {
        for (alcove, kind) in ALCOVES[row].iter().copied().enumerate() {
            let across = side * (start + pitch * (2.0 * alcove as f64 + 1.0));
            let counter = front - COUNTER_IN_M;
            solids.push(frame.block(counter, across, 0.0, COUNTER_M, Material::Timber));
            solids.extend(goods(frame, kind, front, across));
            found.push(Station {
                kind,
                keeper: frame.at(front - KEEPER_IN_M, across),
                facing,
                counter: frame.at(counter, across),
            });
        }
    }
    (found, solids)
}

/// A station's goods: the shelves behind its keeper, and on its counter and shelves what it deals in.
fn goods(frame: &Frame, kind: StationKind, front: f64, across: f64) -> Vec<Solid> {
    let back = front - SHELVES_IN_M;
    let counter = front - COUNTER_IN_M;
    let top = COUNTER_M[2];
    let mut solids = vec![frame.block(back, across, 0.0, [4.6, 0.6, 2.4], Material::Timber)];
    // Three of a thing along the shelves or the counter, a little apart.
    let row = |solids: &mut Vec<Solid>, toward_sea: f64, base: f64, size: [f64; 3], material: Material| {
        for step in [-1.4, 0.0, 1.4] {
            solids.push(frame.block(toward_sea, across + step, base, size, material));
        }
    };
    match kind {
        StationKind::Reader => {
            solids.push(frame.round(counter, across - 1.8, top, [0.3, 0.5, 0.6], Material::Glow));
            row(&mut solids, back, 1.0, [0.5, 0.4, 0.4], Material::Gold);
            row(&mut solids, back, 1.8, [0.5, 0.4, 0.4], Material::Gold);
        }
        StationKind::Vault => {
            row(&mut solids, back + 0.9, 0.0, [1.1, 0.9, 1.0], Material::Iron);
            row(&mut solids, back + 0.9, 1.0, [1.1, 0.9, 0.8], Material::Iron);
        }
        StationKind::Quartermaster => {
            for step in [-1.5, 1.5] {
                solids.push(frame.round(back + 1.6, across + step, 0.0, [0.7, 1.8, 0.8], Material::Iron));
            }
            row(&mut solids, counter, top, [0.6, 0.5, 0.25], Material::Iron);
        }
        StationKind::Armsmith => {
            solids.push(frame.block(back + 0.6, across, 0.0, [4.0, 0.3, 2.0], Material::Timber));
            row(&mut solids, back + 0.75, 0.3, [0.12, 0.12, 1.5], Material::Iron);
            row(&mut solids, counter, top, [1.0, 0.2, 0.1], Material::Iron);
        }
        StationKind::Harbourmaster => {
            solids.push(frame.block(counter, across, top, [2.4, 0.7, 0.05], Material::Plaster));
            solids.push(frame.round(back + 1.4, across + 1.6, 0.0, [0.9, 1.0, 1.0], Material::Bone));
        }
        StationKind::Chandler => row(&mut solids, counter, top, [0.25, 0.25, 0.4], Material::Plaster),
        StationKind::Fishmonger => row(&mut solids, counter, top, [1.0, 0.6, 0.15], Material::Iron),
        StationKind::Cartographer => {
            row(&mut solids, back, 1.0, [0.9, 0.4, 0.15], Material::Plaster);
            solids.push(frame.block(counter, across, top, [1.6, 0.6, 0.04], Material::Plaster));
        }
        StationKind::Tailor => row(&mut solids, back, 1.0, [0.9, 0.5, 0.3], Material::Plaster),
        StationKind::Herbalist => row(&mut solids, counter, top, [0.35, 0.35, 0.3], Material::Bone),
        StationKind::Smith => {
            solids.push(frame.block(back + 1.6, across - 1.2, 0.0, [1.2, 0.8, 0.8], Material::Iron));
            solids.push(frame.round(back + 1.6, across + 1.2, 0.0, [1.0, 0.9, 0.7], Material::Glow));
        }
    }
    solids
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::courtyard::{SPAWN_OFFSETS_M, courtyard};

    const FRAME: Frame =
        Frame { middle: [500.0, -200.0], seaward: [0.0, 1.0], depth: 120.0, length: 260.0, level: 30.0 };

    #[test]
    fn each_alcove_has_its_station_its_keeper_behind_the_counter_facing_the_plaza() {
        let (found, solids) = stations(&FRAME);
        assert_eq!(found.len(), 12);
        assert_eq!(found.iter().filter(|station| station.kind == StationKind::Vault).count(), 2, "a vault each side");
        for station in &found {
            assert!(station.keeper[1] < station.counter[1], "behind the counter, the plaza being south");
            assert!((station.facing - turn_toward(FRAME.seaward)).abs() < 1e-9);
        }
        // Every solid stands inside the plaza's landward strip, under the arcades, clear of every spawn.
        let landward = FRAME.middle[1] - FRAME.depth / 2.0;
        for solid in &solids {
            let [x, y, z] = solid.at;
            assert!(y >= landward && y <= landward + 10.0, "under the arcade: {y}");
            assert!((x - FRAME.middle[0]).abs() <= 130.0 && z >= FRAME.level);
            for offset in SPAWN_OFFSETS_M {
                assert!(libm::hypot(x - (FRAME.middle[0] + offset), y - (FRAME.middle[1] + 56.0)) > 40.0);
            }
        }
    }

    #[test]
    fn no_counter_stands_in_a_column() {
        let (found, _) = stations(&FRAME);
        let columns: Vec<Solid> =
            courtyard(&FRAME).into_iter().filter(|solid| solid.material == Material::Stone).collect();
        for station in &found {
            let [x, y] = station.counter;
            let crowded = columns.iter().any(|column| {
                let near = (column.at[0] - x).abs() < COUNTER_M[0] / 2.0 && (column.at[1] - y).abs() < 0.5;
                near && column.size[0] < 2.0
            });
            assert!(!crowded, "the counter at {x}, {y} stands clear of the arcade's columns");
        }
    }
}
