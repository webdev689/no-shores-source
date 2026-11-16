//! Stage I: the city's social space, the one part of it a player walks, as Destiny 1's Tower is the one part of its
//! City walked. A plaza the Tower's size beside the landmark on its seaward side, level with the landmark's foot, its
//! open edges walled with a parapet; from it the city below and the harbour are seen whole and never reached.

use crate::landmarks::{Landmark, ahead};
use crate::solids::{Material, Shape, Solid};
use land::ground::Ground;
use serde::Serialize;

/// The plaza's length and depth, metres: the size of Destiny 1's Tower, walked end to end.
pub const PLAZA_M: [f64; 2] = [260.0, 120.0];
/// The parapet's height and thickness, metres.
const PARAPET_M: [f64; 2] = [1.1, 0.8];
/// How far inside the seaward parapet the spawns stand, metres.
const SPAWN_INSET_M: f64 = 4.0;
/// A gap between the landmark's reach and the plaza, metres.
const APART_M: f64 = 10.0;
/// The spawns' offsets along the seaward parapet from its middle, metres; a lantern stands midway between each two.
const SPAWN_OFFSETS_M: [f64; 4] = [-60.0, -20.0, 20.0, 60.0];
/// A lantern's post over the parapet, and its light, metres high.
const LANTERN_M: [f64; 2] = [2.4, 0.6];
/// The monument in the plaza's middle: its two steps' widths and the obelisk's height, metres.
const STEPS_M: [f64; 2] = [16.0, 11.0];
const OBELISK_M: f64 = 18.0;

/// The social space: its plaza's bounds (west, north, east, south) and level, its section's ring, its spawns, and its
/// parapets and retaining walls.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Social {
    pub bounds: [f64; 4],
    pub level: f64,
    pub ring: Vec<[f64; 2]>,
    pub spawns: Vec<[f64; 2]>,
    pub solids: Vec<Solid>,
}

/// Where the plaza stands beside a landmark reaching `reach` from its middle: its bounds (west, north, east, south),
/// and the way to the sea along the world's axes that it looks out along.
#[must_use]
pub fn plaza_bounds(centre: [f64; 2], seaward: [f64; 2], reach: f64) -> ([f64; 4], [f64; 2]) {
    let east_west = seaward[0].abs() >= seaward[1].abs();
    let along_seaward = if east_west { [seaward[0].signum(), 0.0] } else { [0.0, seaward[1].signum()] };
    let (extent_x, extent_y) = if east_west { (PLAZA_M[1], PLAZA_M[0]) } else { (PLAZA_M[0], PLAZA_M[1]) };
    let depth = if east_west { extent_x } else { extent_y };
    let middle = ahead(centre, along_seaward, reach + APART_M + depth / 2.0);
    let bounds = [
        middle[0] - extent_x / 2.0,
        middle[1] - extent_y / 2.0,
        middle[0] + extent_x / 2.0,
        middle[1] + extent_y / 2.0,
    ];
    (bounds, along_seaward)
}

/// The plaza beside a landmark: square to the world, its long side across the seaward way, so the whole length of it
/// looks out over the city to the sea.
#[must_use]
pub fn plaza(ground: &Ground, centre: [f64; 2], level: f64, seaward: [f64; 2], landmark: &Landmark) -> Social {
    let (bounds, along_seaward) = plaza_bounds(centre, seaward, landmark.reach);
    let (extent_x, extent_y) = (bounds[2] - bounds[0], bounds[3] - bounds[1]);
    let middle = [(bounds[0] + bounds[2]) / 2.0, (bounds[1] + bounds[3]) / 2.0];
    let depth = if along_seaward[0] == 0.0 { extent_y } else { extent_x };
    // The section is the plaza's own edge, along the parapet's middle: the floor is walked right to the parapet to look
    // down over it, and only climbing onto it or over it warns.
    let ring = vec![[bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[2], bounds[3]], [bounds[0], bounds[3]]];
    // The spawns stand just inside the seaward parapet, where a player arrives and comes back looking down over the
    // city and the harbour: farther in, the parapet hides all of the city below its edge.
    let landward = ahead(middle, along_seaward, depth / 2.0 - SPAWN_INSET_M);
    let across = [-along_seaward[1], along_seaward[0]];
    let spawns = SPAWN_OFFSETS_M.into_iter().map(|offset| ahead(landward, across, offset)).collect();
    let mut solids = Vec::new();
    let edges = [
        ([middle[0], bounds[1]], [extent_x, PARAPET_M[1]], [0.0, -1.0]),
        ([middle[0], bounds[3]], [extent_x, PARAPET_M[1]], [0.0, 1.0]),
        ([bounds[0], middle[1]], [PARAPET_M[1], extent_y], [-1.0, 0.0]),
        ([bounds[2], middle[1]], [PARAPET_M[1], extent_y], [1.0, 0.0]),
    ];
    for (edge_middle, size, outward) in edges {
        if outward == [-along_seaward[0], -along_seaward[1]] {
            continue; // the landmark's side opens onto its base
        }
        let out = ahead(edge_middle, outward, 4.0);
        let below = ground.height_at(out[0], out[1]).min(level);
        let foot = below - 2.0;
        let shape = Shape::Block;
        solids.push(Solid::upright(
            shape,
            [edge_middle[0], edge_middle[1], foot],
            [size[0], size[1], level + PARAPET_M[0] - foot],
            Material::Stone,
        ));
    }
    solids.push(Solid::upright(
        Shape::Block,
        [middle[0], middle[1], level - 0.05],
        [extent_x, extent_y, 0.05],
        Material::Paving,
    ));
    solids.extend(furniture(middle, along_seaward, depth, level));
    Social { bounds, level, ring, spawns, solids }
}

/// The plaza's furniture, after the Tower's courtyard: lanterns on the seaward parapet every 40 m, midway between
/// the spawns so each frames an arriving player's view and none blocks it; and in the middle a stepped plinth and an
/// obelisk capped in gold, a mark to find the way by from anywhere on the plaza.
fn furniture(middle: [f64; 2], along_seaward: [f64; 2], depth: f64, level: f64) -> Vec<Solid> {
    let across = [-along_seaward[1], along_seaward[0]];
    let parapet = ahead(middle, along_seaward, depth / 2.0);
    let top = level + PARAPET_M[0];
    let mut solids = Vec::new();
    for step in -3_i32..=3 {
        let [x, y] = ahead(parapet, across, f64::from(step) * 40.0);
        let post = Shape::Column { sides: 8, top: 0.7 };
        solids.push(Solid::upright(post, [x, y, top], [0.3, 0.3, LANTERN_M[0]], Material::Iron));
        let light = top + LANTERN_M[0];
        solids.push(Solid::upright(Shape::Block, [x, y, light], [0.5, 0.5, LANTERN_M[1]], Material::Glow));
        let cap = Shape::Pyramid { top: 0.0 };
        solids.push(Solid::upright(cap, [x, y, light + LANTERN_M[1]], [0.7, 0.7, 0.4], Material::Iron));
    }
    let [x, y] = middle;
    let round = Shape::Column { sides: 24, top: 1.0 };
    solids.push(Solid::upright(round, [x, y, level], [STEPS_M[0], STEPS_M[0], 0.5], Material::Stone));
    solids.push(Solid::upright(round, [x, y, level + 0.5], [STEPS_M[1], STEPS_M[1], 0.5], Material::Stone));
    let shaft = Shape::Pyramid { top: 0.55 };
    solids.push(Solid::upright(shaft, [x, y, level + 1.0], [2.4, 2.4, OBELISK_M], Material::Trim));
    let cap = Shape::Pyramid { top: 0.0 };
    solids.push(Solid::upright(cap, [x, y, level + 1.0 + OBELISK_M], [1.32, 1.32, 1.4], Material::Gold));
    solids
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_lanterns_stand_on_the_seaward_parapet_between_the_spawns_and_the_obelisk_in_the_middle() {
        let solids = furniture([1000.0, 2000.0], [0.0, -1.0], PLAZA_M[1], 80.0);
        let lights: Vec<&Solid> = solids.iter().filter(|solid| solid.material == Material::Glow).collect();
        assert_eq!(lights.len(), 7);
        for light in &lights {
            assert!((light.at[1] - (2000.0 - PLAZA_M[1] / 2.0)).abs() < 1e-9, "on the parapet's line: {light:?}");
            assert!((light.at[0] - 1000.0).abs() <= PLAZA_M[0] / 2.0, "along the parapet: {light:?}");
            let nearest =
                SPAWN_OFFSETS_M.iter().map(|offset| (light.at[0] - 1000.0 - offset).abs()).fold(f64::MAX, f64::min);
            assert!(nearest >= 20.0, "midway between the spawns: {light:?}");
        }
        let gold = solids.iter().find(|solid| solid.material == Material::Gold).expect("the obelisk's cap");
        assert_eq!([gold.at[0], gold.at[1]], [1000.0, 2000.0]);
        assert!((gold.at[2] - (80.0 + 1.0 + OBELISK_M)).abs() < 1e-9);
    }
}
