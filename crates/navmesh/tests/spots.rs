//! Firing spots baked with the mesh: covered from a wall standing within reach of the eye, a lane away from it, no
//! cover from a wall below the eye, no lane out past the bounds' edge, nothing kept where there is neither, and the
//! spots near a point answered in a fixed order. The ground's own rises cover a spot and shut its lanes as a wall does.

use movement::{Block, Terrain};
use navmesh::{AGENT, Bounds, NavMesh, Spot};

/// A 40 x 40 m field around the origin: lanes 14 m long fit across its middle.
const FIELD: Bounds = Bounds { min_x: -20.0, min_y: -20.0, max_x: 20.0, max_y: 20.0 };

/// The bits of the four quarters in a spot's masks: north, then clockwise.
const NORTH: u16 = 1;
const EAST: u16 = 1 << 4;
const SOUTH: u16 = 1 << 8;
const WEST: u16 = 1 << 12;

fn block(min_x: f64, min_y: f64, max_x: f64, max_y: f64, top: f64) -> Block {
    Block { min_x, min_y, max_x, max_y, top }
}

/// Every spot of a mesh, in its order.
fn every(navmesh: &NavMesh) -> Vec<Spot> {
    navmesh.spots_near([0.0, 0.0, 0.0], 1000.0).copied().collect()
}

/// The spots standing within a box (west, north, east, south), at least one.
fn within(spots: &[Spot], [west, north, east, south]: [f64; 4]) -> Vec<Spot> {
    let found: Vec<Spot> = spots
        .iter()
        .filter(|spot| spot.point[0] > west && spot.point[0] < east && spot.point[1] > north && spot.point[1] < south)
        .copied()
        .collect();
    assert!(!found.is_empty(), "no spot within {west}, {north}, {east}, {south}");
    found
}

#[test]
fn a_spot_beside_a_tall_wall_is_covered_from_it_and_has_a_lane_away_from_it() {
    let spots = every(&NavMesh::bake(&[block(-4.0, -3.0, 4.0, -2.5, 3.0)], FIELD, &AGENT));
    for spot in within(&spots, [-3.0, -2.5, 3.0, -0.5]) {
        assert_ne!(spot.cover & NORTH, 0, "the wall is within 2.4 m north: {spot:?}");
        assert_eq!(spot.lanes & NORTH, 0, "no lane through the wall: {spot:?}");
        assert_ne!(spot.lanes & SOUTH, 0, "a lane away from it: {spot:?}");
        assert_eq!(spot.cover & SOUTH, 0, "nothing covers it from the south: {spot:?}");
    }
    for spot in within(&spots, [-3.0, -0.2, 3.0, 0.2]) {
        assert_eq!(spot.cover & NORTH, 0, "2.5 m from the wall is past cover's reach: {spot:?}");
        assert_eq!(spot.lanes & NORTH, 0, "but the wall still shuts the lane: {spot:?}");
    }
}

#[test]
fn a_wall_below_the_eye_covers_nothing() {
    let spots = every(&NavMesh::bake(&[block(-4.0, -3.0, 4.0, -2.5, 1.2)], FIELD, &AGENT));
    for spot in within(&spots, [-3.0, -2.5, 3.0, -0.5]) {
        assert_eq!(spot.cover, 0, "the eye at 1.6 m sees over a 1.2 m wall: {spot:?}");
        assert_ne!(spot.lanes & NORTH, 0, "and down the lane past it: {spot:?}");
    }
}

#[test]
fn the_bounds_edge_shuts_a_lane_and_gives_no_cover() {
    let spots = every(&NavMesh::bake(&[], FIELD, &AGENT));
    for spot in within(&spots, [6.5, -1.0, 20.0, 1.0]) {
        assert_eq!(spot.lanes & EAST, 0, "the edge is under 14 m east: {spot:?}");
        assert_ne!(spot.lanes & WEST, 0, "the field is open 14 m west: {spot:?}");
        assert_eq!(spot.cover, 0, "the edge is no cover: {spot:?}");
    }
    for spot in within(&spots, [-6.0, -6.0, 6.0, 6.0]) {
        assert_eq!(spot.lanes, u16::MAX, "every way is a lane in the middle of the open: {spot:?}");
    }
}

#[test]
fn a_spot_with_neither_cover_nor_a_lane_is_left_out() {
    // Not even corner to corner: 9 m across, its diagonal is under 13 m.
    let small = Bounds { min_x: -4.5, min_y: -4.5, max_x: 4.5, max_y: 4.5 };
    assert!(every(&NavMesh::bake(&[], small, &AGENT)).is_empty(), "no lane fits, and nothing covers");
    let spots = every(&NavMesh::bake(&[block(-3.0, -0.25, 3.0, 0.25, 3.0)], small, &AGENT));
    assert!(!spots.is_empty(), "the spots beside the wall are kept for its cover");
    for spot in spots {
        assert_ne!(spot.cover, 0, "only a covered spot is kept: {spot:?}");
        assert!(spot.point[1].abs() < 0.25 + 2.4, "within cover's reach of the wall: {spot:?}");
    }
}

#[test]
fn the_spots_near_a_point_are_those_within_the_radius_row_by_row_from_the_north() {
    let navmesh = NavMesh::bake(&[block(-4.0, -3.0, 4.0, -2.5, 3.0)], FIELD, &AGENT);
    let (centre, radius) = ([1.0, -2.0, 0.0], 6.0);
    let near: Vec<Spot> = navmesh.spots_near(centre, radius).copied().collect();
    let apart = |spot: &Spot| {
        let (east, south) = (spot.point[0] - centre[0], spot.point[1] - centre[1]);
        (east * east + south * south).sqrt()
    };
    let inside: Vec<Spot> = every(&navmesh).into_iter().filter(|spot| apart(spot) <= radius).collect();
    assert!(near.len() > 4, "several spots: {near:?}");
    assert_eq!(near, inside, "every spot within the radius, and no other");
    for pair in near.windows(2) {
        let (first, second) = (pair[0].point, pair[1].point);
        assert!(first[1] < second[1] || (first[1] == second[1] && first[0] < second[0]), "{first:?} before {second:?}");
    }
}

/// A terrain made from a function of (x, y).
struct Ground(fn(f64, f64) -> f64);

impl Terrain for Ground {
    fn height_at(&self, x: f64, y: f64) -> f64 {
        (self.0)(x, y)
    }
}

#[test]
fn a_rise_of_the_ground_over_the_eye_covers_a_spot_and_shuts_its_lane_as_a_wall_does() {
    // A bank of earth 3 m high where the first test stands its wall, on open ground at 0.
    let bank = Ground(|x, y| if x.abs() <= 4.0 && (-3.0..=-2.5).contains(&y) { 3.0 } else { 0.0 });
    let spots = every(&NavMesh::bake_on(&[], &bank, FIELD, &AGENT));
    for spot in within(&spots, [-3.0, -2.5, 3.0, -0.5]) {
        assert_ne!(spot.cover & NORTH, 0, "the bank is within 2.4 m north: {spot:?}");
        assert_eq!(spot.lanes & NORTH, 0, "no lane through the bank: {spot:?}");
        assert_ne!(spot.lanes & SOUTH, 0, "a lane away from it: {spot:?}");
    }
    for spot in within(&spots, [-3.0, -0.2, 3.0, 0.2]) {
        assert_eq!(spot.cover & NORTH, 0, "2.5 m from the bank is past cover's reach: {spot:?}");
        assert_eq!(spot.lanes & NORTH, 0, "but the bank still shuts the lane: {spot:?}");
    }
    let low = Ground(|x, y| if x.abs() <= 4.0 && (-3.0..=-2.5).contains(&y) { 1.2 } else { 0.0 });
    for spot in within(&every(&NavMesh::bake_on(&[], &low, FIELD, &AGENT)), [-3.0, -2.5, 3.0, -0.5]) {
        assert_eq!(spot.cover, 0, "the eye sees over a bank of 1.2 m: {spot:?}");
        assert_ne!(spot.lanes & NORTH, 0, "and down the lane past it: {spot:?}");
    }
}
