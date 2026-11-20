//! Courses baked on a terrain rather than open ground at 0: paths climb a slope and a hill and ride their heights,
//! never up a face steeper than the slope limit; a seabed below 0 is walked at its depth, and a block on it stands
//! from the seabed up; open ground handed in as a terrain bakes as open ground.

mod common;

use common::{closest, ends_at, path};
use movement::{Block, Flat, Terrain};
use navmesh::{AGENT, Bounds, NavMesh};

/// A 20 x 20 m field around the origin.
const FIELD: Bounds = Bounds { min_x: -10.0, min_y: -10.0, max_x: 10.0, max_y: 10.0 };

/// A terrain made from a function of (x, y).
struct Ground(fn(f64, f64) -> f64);

impl Terrain for Ground {
    fn height_at(&self, x: f64, y: f64) -> f64 {
        (self.0)(x, y)
    }
}

fn bake(ground: &Ground, blocks: &[Block]) -> NavMesh {
    NavMesh::bake_on(blocks, ground, FIELD, &AGENT)
}

/// Every waypoint stands on the ground under it, within a few centimetres.
fn rides(route: &[[f64; 3]], ground: &Ground) {
    for point in route {
        let under = ground.height_at(point[0], point[1]);
        assert!((point[2] - under).abs() < 0.03, "{point:?} is off the ground at {under}: {route:?}");
    }
}

fn ends_near(route: &[[f64; 3]], x: f64, y: f64) {
    let last = route[route.len() - 1];
    assert!((last[0] - x).abs() < 1e-9 && (last[1] - y).abs() < 1e-9, "the path ends at {last:?}: {route:?}");
}

/// Level at 0 in the west, rising east at 0.5 from x = -4 to x = 4, level at 4 m in the east.
const SLOPE: Ground = Ground(|x, _| 0.5 * (x.clamp(-4.0, 4.0) + 4.0));

#[test]
fn a_path_climbs_a_slope_and_rides_its_heights() {
    let navmesh = bake(&SLOPE, &[]);
    let route = path(&navmesh, [-8.0, 0.0, 0.0], [8.0, 3.0, 4.0]);
    ends_near(&route, 8.0, 3.0);
    rides(&route, &SLOPE);
    let reach = navmesh.reachable_from([-8.0, 0.0, 0.0]).expect("the foot of the slope is on the mesh");
    assert!(reach.contains([0.0, 5.0, 2.0]), "half way up, at 2 m");
    assert!(!reach.contains([0.0, 5.0, 0.0]), "nothing walks at 0 m under the slope");
}

#[test]
fn a_slope_within_the_limit_is_walked_and_a_steeper_one_is_not() {
    // Each 0.25 m cell rises less than a step on both, so only the slope limit tells them apart.
    let gentle = Ground(|x, _| 0.6 * (x.clamp(-1.0, 4.0) + 1.0));
    let route = path(&bake(&gentle, &[]), [-8.0, 0.0, 0.0], [7.0, 0.0, 3.0]);
    rides(&route, &gentle);
    let steep = Ground(|x, _| 1.2 * (x.clamp(-1.0, 1.5) + 1.0));
    let navmesh = bake(&steep, &[]);
    assert_eq!(navmesh.find_path([-8.0, 0.0, 0.0], [6.0, 0.0, 3.0]), None, "no way up a face of 1.2");
    let reach = navmesh.reachable_from([-8.0, 0.0, 0.0]).expect("the low ground is on the mesh");
    assert!(!reach.contains([0.25, 0.0, 1.5]), "the face itself is not floor");
}

/// A round hill 2 m high and 8 m across its foot, its steepest 0.5 at the foot.
const HILL: Ground = Ground(|x, y| 2.0 * (1.0 - (x * x + y * y) / 64.0).max(0.0));

#[test]
fn a_path_climbs_a_hill_to_its_top_and_its_firing_spots_stand_on_it() {
    let navmesh = bake(&HILL, &[]);
    assert_eq!(navmesh, bake(&HILL, &[]), "the same ground bakes the same twice");
    let route = path(&navmesh, [-9.0, -9.0, 0.0], [0.0, 0.0, 2.0]);
    ends_near(&route, 0.0, 0.0);
    rides(&route, &HILL);
    assert!((route[route.len() - 1][2] - 2.0).abs() < 0.03, "at the top: {route:?}");
    let spots: Vec<_> = navmesh.spots_near([0.0, 0.0, 2.0], 7.0).collect();
    assert!(!spots.is_empty(), "the hill has firing spots");
    for spot in spots {
        let under = HILL.height_at(spot.point[0], spot.point[1]);
        assert!((spot.point[2] - under).abs() < 0.03, "{spot:?} stands on the hill at {under}");
    }
}

/// A seabed 6 m down in the west, rising east to 4 m down.
const SEABED: Ground = Ground(|x, _| -5.0 + 0.1 * x);

#[test]
fn a_seabed_below_zero_is_walked_at_its_depth() {
    let navmesh = bake(&SEABED, &[]);
    let route = path(&navmesh, [-8.0, -6.0, -5.8], [8.0, 6.0, -4.2]);
    ends_near(&route, 8.0, 6.0);
    rides(&route, &SEABED);
    let reach = navmesh.reachable_from([-8.0, -6.0, -5.8]).expect("the seabed is on the mesh");
    assert!(reach.contains([0.0, 0.0, -5.0]), "on the seabed");
    assert!(!reach.contains([0.0, 0.0, 0.0]), "nothing walks at 0 m over it");
}

#[test]
fn a_block_on_the_seabed_stands_from_the_seabed_up() {
    let seabed = Ground(|_, _| -6.0);
    // A rock 7 m tall, from the seabed to a metre over 0, with its north end in the open water.
    let rock = Block { min_x: -1.0, min_y: -4.0, max_x: 1.0, max_y: 10.0, top: 1.0, bottom: -6.0 };
    let route = path(&bake(&seabed, &[rock]), [-5.0, 5.0, -6.0], [5.0, 5.0, -6.0]);
    ends_near(&route, 5.0, 5.0);
    assert!(closest(&route, &rock) >= AGENT.radius, "round the rock's north end, not under it: {route:?}");
}

#[test]
fn open_ground_handed_in_as_a_terrain_bakes_as_open_ground() {
    let stairs = [
        Block { min_x: 2.0, min_y: -2.0, max_x: 3.0, max_y: 2.0, top: 0.5, bottom: 0.0 },
        Block { min_x: 3.0, min_y: -2.0, max_x: 8.0, max_y: 2.0, top: 1.0, bottom: 0.0 },
        Block { min_x: -1.0, min_y: -8.0, max_x: 1.0, max_y: -3.0, top: 3.0, bottom: 0.0 },
    ];
    let (open, flat) = (NavMesh::bake(&stairs, FIELD, &AGENT), NavMesh::bake_on(&stairs, &Flat, FIELD, &AGENT));
    for (from, to) in [([-5.0, 0.0, 0.0], [6.0, 0.0, 1.0]), ([0.0, -9.0, 0.0], [-4.0, 6.0, 0.0])] {
        assert_eq!(open.find_path(from, to), flat.find_path(from, to));
        ends_at(&path(&flat, from, to), to);
    }
    let everywhere = |navmesh: &NavMesh| navmesh.spots_near([0.0, 0.0, 0.0], 100.0).copied().collect::<Vec<_>>();
    assert_eq!(everywhere(&open), everywhere(&flat));
}

/// Ground rising gently east, 0.1 a metre.
const RISE: Ground = Ground(|x, _| 0.1 * x);

#[test]
fn a_path_runs_through_a_roofed_tunnel_cut_in_a_terrain_at_the_ground_beneath_its_roof() {
    // Two walls of rock from the ground up across the field, a 3 m gap between them, roofed over from 2.5 m.
    let rock = |min_y: f64, max_y: f64| Block { min_x: -3.0, min_y, max_x: 3.0, max_y, top: 6.0, bottom: -1.0 };
    let roof = Block { min_x: -3.0, min_y: -1.5, max_x: 3.0, max_y: 1.5, top: 6.0, bottom: 2.5 };
    let navmesh = bake(&RISE, &[rock(-10.0, -1.5), rock(1.5, 10.0), roof]);
    let route = path(&navmesh, [-8.0, 0.0, -0.8], [8.0, 0.0, 0.8]);
    ends_near(&route, 8.0, 0.0);
    rides(&route, &RISE);
    // The rock's top over the tunnel is reached only by climbing a face outside it, never from the tunnel's floor.
    let up = path(&navmesh, [-8.0, 0.0, -0.8], [0.0, 0.0, 6.0]);
    let climb = up.windows(2).find(|pair| pair[1][2] - pair[0][2] > 5.0).expect("the rock's top is climbed onto");
    let [x, y, _] = climb[0];
    assert!(x < -3.0 || x > 3.0 || y.abs() > 1.5, "the climb starts in the tunnel: {up:?}");
}
