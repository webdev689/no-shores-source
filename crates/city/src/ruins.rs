//! A ruined city: one of the six that are no longer ports, desolate and destroyed. Its plan is laid by the same rules
//! as a port city's, so its land, nodes and collision stand where they were; then its landmark is broken, rubble is
//! heaped along its ways and two wrecks lie settled in its harbour. The wall's breaches and the broken piers are laid
//! by `walls`, the bare counters by `stations`, and its buildings are broken where the browser stands them.

use crate::footprint::Footprint;
use crate::grid::{CELL_M, Grid};
use crate::landmarks::{ahead, turn_toward};
use crate::solids::{Material, Shape, Solid};
use crate::terraces::Footing;
use crate::{Cell, Use};
use land::exact::rand01;
use land::ground::Ground;
use serde::Serialize;

/// How much of its height a ruined landmark keeps.
pub const LANDMARK_KEPT: f64 = 1.0 / 3.0;
/// How far a wreck lies heeled, radians: about 25 degrees.
pub const WRECK_HEEL: f64 = 25.0 * core::f64::consts::PI / 180.0;
/// Heaps of rubble a way's cell holds, and how far inside its edges they lie, metres.
const HEAPS_PER_CELL: usize = 4;
const HEAP_INSET_M: f64 = 12.0;
/// How far from the plaza no rubble lies, metres: past the window of ground its node is cut to, so its room's boxes
/// are a port city's.
const PLAZA_CLEAR_M: f64 = 110.0;
/// The water a wreck settles in, deeper than this, metres; and how far out from the harbour her search starts and
/// steps.
const WRECK_DEPTH_M: f64 = 4.0;
const WRECK_OUT_M: [f64; 2] = [170.0, 20.0];

/// Whether a city, by its id, is a ruin: every city that is not a port city.
#[must_use]
pub fn is_ruined(city_id: &str) -> bool {
    !world::ports::is_main_port(city_id)
}

/// A ruined city's name, as the game names it everywhere.
#[must_use]
pub fn ruined_name(name: &str) -> String {
    format!("Ruins of {name}")
}

/// A heap of rubble: a low frustum standing on the middle of its base.
#[must_use]
pub fn heap(at: [f64; 3], size: [f64; 3], turn: f64) -> Solid {
    Solid::upright(Shape::Pyramid { top: 0.3 }, at, size, Material::Rubble).turned(turn)
}

/// The landmark broken to a third of its height over the platform: what stood above the break is gone, what reached
/// through it ends there (a dome, a gable or an arch broken through falls whole), and any light it carried is out.
#[must_use]
pub fn broken_landmark(solids: Vec<Solid>, level: f64) -> Vec<Solid> {
    let top = solids.iter().map(|solid| solid.at[2] + solid.size[2]).fold(level, f64::max);
    let cut = level + (top - level) * LANDMARK_KEPT;
    solids
        .into_iter()
        .filter_map(|solid| {
            let material = if solid.material == Material::Glow { Material::Iron } else { solid.material };
            let solid = Solid { material, ..solid };
            if solid.at[2] + solid.size[2] <= cut {
                return Some(solid);
            }
            let height = cut - solid.at[2];
            if height <= 0.0 {
                return None;
            }
            // A tapering solid keeps the taper it had at the break.
            let share = height / solid.size[2];
            let shape = match solid.shape {
                Shape::Block => Shape::Block,
                Shape::Column { sides, top } => Shape::Column { sides, top: 1.0 - (1.0 - top) * share },
                Shape::Pyramid { top } => Shape::Pyramid { top: 1.0 - (1.0 - top) * share },
                Shape::Dome { .. } | Shape::Gable | Shape::Arch { .. } => return None,
            };
            Some(Solid { shape, size: [solid.size[0], solid.size[1], height], ..solid })
        })
        .collect()
}

/// Rubble scattered along the ways: a few heaps in each avenue's cell, seeded by the cell, none near the plaza.
#[must_use]
pub fn street_rubble(grid: &Grid, cells: &[Cell], plaza: [f64; 4], seed: u32) -> Vec<Solid> {
    let clear =
        [plaza[0] - PLAZA_CLEAR_M, plaza[1] - PLAZA_CLEAR_M, plaza[2] + PLAZA_CLEAR_M, plaza[3] + PLAZA_CLEAR_M];
    let mut heaps = Vec::new();
    for cell in cells.iter().filter(|cell| cell.used == Use::Avenue) {
        let Footing::Level { level } = cell.footing else { continue };
        let [west, north, ..] = grid.bounds(cell.column, cell.row);
        for heap_at in 0..HEAPS_PER_CELL {
            let draw = |salt: i64| rand01(seed, &[31, cell.column as i64, cell.row as i64, heap_at as i64, salt]);
            let span = CELL_M - 2.0 * HEAP_INSET_M;
            let at = [west + HEAP_INSET_M + span * draw(0), north + HEAP_INSET_M + span * draw(1)];
            let inside_clear = at[0] > clear[0] && at[0] < clear[2] && at[1] > clear[1] && at[1] < clear[3];
            if inside_clear {
                continue;
            }
            let size = [3.0 + 4.0 * draw(2), 2.0 + 3.0 * draw(3), 0.8 + 1.2 * draw(4)];
            heaps.push(heap([at[0], at[1], level], size, draw(5) * core::f64::consts::TAU));
        }
    }
    heaps
}

/// Which of the ships layer's ships a wreck is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Hull {
    Sloop,
    Schooner,
}

/// A wreck settled in a ruined harbour: which ship, where she lies (east, south), her heading clockwise from north
/// and her heel to starboard, radians. The browser settles her to her deck and draws her mastless.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Wreck {
    pub ship: Hull,
    pub at: [f64; 2],
    pub heading: f64,
    pub heel: f64,
}

/// Two wrecks in the harbour, a Sloop and a Schooner, either side of its way out to sea, each where the water first
/// lies deep enough past the piers.
#[must_use]
pub fn wrecks(ground: &Ground, footprint: &Footprint, harbour: [f64; 2], seed: u32) -> Vec<Wreck> {
    let ray = footprint.ray_toward(harbour[0] - footprint.centre[0], harbour[1] - footprint.centre[1]);
    let outward = footprint.rays[ray].direction;
    let across = [-outward[1], outward[0]];
    [(Hull::Sloop, -70.0, 1.0), (Hull::Schooner, 80.0, -1.0)]
        .into_iter()
        .enumerate()
        .map(|(place, (ship, aside, heel))| {
            let start = ahead(harbour, across, aside);
            let deep = (0..30)
                .map(|step| ahead(start, outward, WRECK_OUT_M[0] + WRECK_OUT_M[1] * step as f64))
                .find(|at| ground.height_at(at[0], at[1]) < -WRECK_DEPTH_M);
            let at = deep.unwrap_or_else(|| ahead(start, outward, WRECK_OUT_M[0]));
            let heading = turn_toward(across) + (rand01(seed, &[37, place as i64]) - 0.5) * 1.2;
            Wreck { ship, at, heading, heel: heel * WRECK_HEEL }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_six_that_are_not_ports_are_ruined_and_named_so() {
        for city in ["cairnwatch", "elmhaven", "goldreach", "mistfall", "windmere", "fenhallow"] {
            assert!(is_ruined(city), "{city}");
        }
        for city in ["overlook", "sunspire", "rimeholt"] {
            assert!(!is_ruined(city), "{city}");
        }
        assert_eq!(ruined_name("Mistfall"), "Ruins of Mistfall");
    }

    #[test]
    fn a_broken_landmark_stands_a_third_as_high_and_its_light_is_out() {
        let level = 40.0;
        let shaft = Solid::upright(
            Shape::Column { sides: 24, top: 0.4 },
            [0.0, 0.0, level],
            [20.0, 20.0, 90.0],
            Material::Stone,
        );
        let fire = Solid::upright(Shape::Block, [0.0, 0.0, level + 2.0], [3.0, 3.0, 3.0], Material::Glow);
        let dome =
            Solid::upright(Shape::Dome { sides: 16 }, [0.0, 0.0, level + 30.0], [20.0, 20.0, 15.0], Material::Gold);
        let lantern = Solid::upright(Shape::Block, [0.0, 0.0, level + 90.0], [6.0, 6.0, 30.0], Material::Glow);
        let broken = broken_landmark(vec![shaft, fire, dome, lantern], level);
        let top = broken.iter().map(|solid| solid.at[2] + solid.size[2]).fold(f64::MIN, f64::max);
        assert!((top - (level + 40.0)).abs() < 1e-9, "a third of 120 m: {top}");
        assert_eq!(
            broken.len(),
            2,
            "the shaft and the fire kept; the dome through the break falls, the lantern over it is gone"
        );
        assert!(broken.iter().all(|solid| solid.material != Material::Glow));
        let Shape::Column { top: taper, .. } = broken[0].shape else { panic!("the shaft stays a column") };
        assert!((taper - (1.0 - 0.6 * 40.0 / 90.0)).abs() < 1e-9, "its taper as it was at the break: {taper}");
    }
}
