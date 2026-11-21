//! Stage I: the city's social space, the one part of it a player walks, as Destiny 1's Tower is the one part of its
//! City walked. A plaza the Tower's size beside the landmark on its seaward side, level with the landmark's foot,
//! walled all round with a parapet and laid out as a courtyard (`courtyard`); from it the city below and the harbour
//! are seen whole and never reached.

use crate::courtyard::{Frame, PARAPET_TOP_M, SPAWN_OFFSETS_M, courtyard, townsfolk_life, visitor_spots};
use crate::landmarks::{Landmark, ahead};
use crate::life::{Post, Ways};
use crate::solids::{Material, Shape, Solid};
use crate::stations::{Station, stations};
use land::ground::Ground;
use serde::Serialize;

/// The plaza's length and depth, metres: the size of Destiny 1's Tower, walked end to end.
pub const PLAZA_M: [f64; 2] = [260.0, 120.0];
/// The parapet's thickness, metres.
const PARAPET_THICK_M: f64 = 0.8;
/// How far inside the seaward parapet the spawns stand, metres.
const SPAWN_INSET_M: f64 = 4.0;
/// A gap between the landmark's reach and the plaza, metres.
const APART_M: f64 = 10.0;

/// The social space: its plaza's bounds (west, north, east, south) and level, its section's ring, its spawns, its
/// parapets, retaining walls and courtyard, its stations, and its townsfolk's ways and posts.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Social {
    pub bounds: [f64; 4],
    pub level: f64,
    pub ring: Vec<[f64; 2]>,
    pub spawns: Vec<[f64; 2]>,
    pub solids: Vec<Solid>,
    /// The stations in its arcades' alcoves (`stations`).
    pub stations: Vec<Station>,
    /// Where a visitor of no counter may stand, one a week (`visitor_spots`): Shape's places.
    pub visitor_spots: Vec<[f64; 2]>,
    /// The ways its townsfolk walk, and the posts where they work, play or stay a while (`life`).
    pub ways: Ways,
    pub posts: Vec<Post>,
    /// Where ships lie moored beside its pier, if it reaches one: each one's middle (east, south) and the bearing her
    /// bow points along (radians clockwise from north), drawn while a player walks it (`hub::harbour`).
    pub moorings: Vec<[f64; 3]>,
    /// The trees and bushes its beds, pots and planters stand, drawn as the world's own plants (`hub::plants`).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub plants: Vec<crate::hub::plants::Plant>,
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
/// looks out over the city to the sea. A ruined city's plaza is empty: its counters stand bare and keep no station.
/// The city of the hub (`hub::HUB_CITY`) lays its own on it.
#[must_use]
pub fn plaza(
    city_id: &str,
    ground: &Ground,
    centre: [f64; 2],
    level: f64,
    seaward: [f64; 2],
    landmark: &Landmark,
    ruined: bool,
) -> Social {
    let (bounds, along_seaward) = plaza_bounds(centre, seaward, landmark.reach);
    let (extent_x, extent_y) = (bounds[2] - bounds[0], bounds[3] - bounds[1]);
    let middle = [(bounds[0] + bounds[2]) / 2.0, (bounds[1] + bounds[3]) / 2.0];
    let depth = if along_seaward[0] == 0.0 { extent_y } else { extent_x };
    let length = if along_seaward[0] == 0.0 { extent_x } else { extent_y };
    if city_id == crate::hub::HUB_CITY {
        let frame = Frame { middle, seaward: along_seaward, depth, length, level };
        return crate::hub::overlook(ground, &frame, bounds);
    }
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
        ([middle[0], bounds[1]], [extent_x, PARAPET_THICK_M], [0.0, -1.0]),
        ([middle[0], bounds[3]], [extent_x, PARAPET_THICK_M], [0.0, 1.0]),
        ([bounds[0], middle[1]], [PARAPET_THICK_M, extent_y], [-1.0, 0.0]),
        ([bounds[2], middle[1]], [PARAPET_THICK_M, extent_y], [1.0, 0.0]),
    ];
    // The landward side is walled too: past the landmark's base the ground there may be a terrace's, far below.
    for (edge_middle, size, outward) in edges {
        let out = ahead(edge_middle, outward, 4.0);
        let below = ground.height_at(out[0], out[1]).min(level);
        let foot = below - 2.0;
        let shape = Shape::Block;
        solids.push(Solid::upright(
            shape,
            [edge_middle[0], edge_middle[1], foot],
            [size[0], size[1], level + PARAPET_TOP_M - foot],
            Material::Stone,
        ));
    }
    solids.push(Solid::upright(
        Shape::Block,
        [middle[0], middle[1], level - 0.05],
        [extent_x, extent_y, 0.05],
        Material::Paving,
    ));
    let frame = Frame { middle, seaward: along_seaward, depth, length, level };
    solids.extend(courtyard(&frame));
    let (stations, stalls) = stations(&frame, ruined);
    solids.extend(stalls);
    let visitor_spots = visitor_spots(&frame);
    let (ways, posts) = townsfolk_life(&frame, &stations);
    Social {
        bounds,
        level,
        ring,
        spawns,
        solids,
        stations,
        visitor_spots,
        ways,
        posts,
        moorings: Vec::new(),
        plants: Vec::new(),
    }
}
