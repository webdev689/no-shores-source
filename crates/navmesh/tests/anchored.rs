//! A bake anchored at a point keeps the walkable part joined to the floor under that point, where an ordinary bake
//! keeps the largest part: a floor walled in by a larger raised plateau, as a dungeon's rooms are by its rock.

use movement::Terrain;
use navmesh::{AGENT, Bounds, NavMesh};

/// A 40 x 40 m field around the origin.
const FIELD: Bounds = Bounds { min_x: -20.0, min_y: -20.0, max_x: 20.0, max_y: 20.0 };

/// A floor at 0 m, 8 m square round the origin, walled in by a plateau 10 m up that fills the rest of the field.
struct Pit;

impl Terrain for Pit {
    fn height_at(&self, x: f64, y: f64) -> f64 {
        if x.abs() < 4.0 && y.abs() < 4.0 { 0.0 } else { 10.0 }
    }
}

#[test]
fn an_ordinary_bake_keeps_the_larger_plateau() {
    let navmesh = NavMesh::bake_on(&[], &Pit, FIELD, &AGENT);
    assert!(navmesh.find_path([-2.0, -2.0, 0.0], [2.0, 2.0, 0.0]).is_none(), "the floor is left out");
    assert!(navmesh.find_path([-15.0, -15.0, 10.0], [15.0, 15.0, 10.0]).is_some(), "the plateau is walked");
}

#[test]
fn an_anchored_bake_keeps_the_floor_under_the_anchor() {
    let navmesh = NavMesh::bake_anchored(&[], &Pit, FIELD, &AGENT, [-2.0, 0.0, 0.0]);
    let route = navmesh.find_path([-2.0, -2.0, 0.0], [2.0, 2.0, 0.0]).expect("a path over the floor");
    assert!(route.iter().all(|point| point[2].abs() < 0.05), "the floor is walked at 0 m: {route:?}");
    assert!(navmesh.find_path([-15.0, -15.0, 10.0], [15.0, 15.0, 10.0]).is_none(), "the plateau is left out");
    let nearest = navmesh.nearest_point([5.0, 0.0, 0.0]).expect("the floor is on the mesh");
    assert!(
        nearest[0].abs() < 4.0 && nearest[2].abs() < 0.05,
        "the nearest walkable point is on the floor: {nearest:?}"
    );
}

#[test]
fn an_anchor_on_the_largest_part_bakes_as_an_ordinary_bake() {
    let anchored = NavMesh::bake_anchored(&[], &Pit, FIELD, &AGENT, [15.0, 15.0, 10.0]);
    assert_eq!(anchored, NavMesh::bake_on(&[], &Pit, FIELD, &AGENT));
}

#[test]
fn an_anchored_bake_lays_no_links_where_an_ordinary_one_climbs_a_block() {
    // A table-high block on open ground: the movement rules vault it, but a dungeon's are walls no body climbs.
    let block = movement::Block { min_x: 2.0, min_y: -1.0, max_x: 4.0, max_y: 1.0, top: 1.0, bottom: 0.0 };
    let ordinary = NavMesh::bake_on(&[block], &movement::Flat, FIELD, &AGENT);
    assert!(ordinary.links().count() > 0, "an ordinary bake links the block's top");
    let anchored = NavMesh::bake_anchored(&[block], &movement::Flat, FIELD, &AGENT, [-10.0, 0.0, 0.0]);
    assert_eq!(anchored.links().count(), 0, "an anchored bake, a dungeon's, lays none");
}

/// A way 3.2 m wide at 0 m along x, walled by a plateau, crossing a room 8 m under it on a slab of rock from that
/// room's ceiling up to the way's floor, as a dungeon's way crosses a room of the storey under it.
struct OverARoom;

impl Terrain for OverARoom {
    fn height_at(&self, x: f64, y: f64) -> f64 {
        if y.abs() >= 1.6 {
            10.0
        } else if x.abs() < 1.6 {
            -8.0
        } else {
            0.0
        }
    }
}

#[test]
fn a_way_over_a_room_on_a_slab_is_walked_where_its_floor_meets_the_drop_beside_it() {
    let slab = movement::Block { min_x: -1.6, min_y: -1.6, max_x: 1.6, max_y: 1.6, top: 0.0, bottom: -4.0 };
    let (from, to) = ([-10.0, 0.0, 0.0], [10.0, 0.0, 0.0]);
    let cliffs = NavMesh::bake_anchored(&[slab], &OverARoom, FIELD, &AGENT, from);
    assert!(cliffs.find_path(from, to).is_none(), "an edge over a drop is no floor to an ordinary bake");
    let agent = navmesh::Agent { walks_to_drops: true, ..AGENT };
    let walked = NavMesh::bake_anchored(&[slab], &OverARoom, FIELD, &agent, from);
    let route = walked.find_path(from, to).expect("across the slab");
    assert!(route.iter().all(|point| point[2].abs() < 0.3), "on the way's floor: {route:?}");
}

/// A way 3.2 m wide that winds back over itself, as a dungeon's does from one storey to the one over it: a corridor
/// at -8 m along y, turning east at its north end onto a ramp that climbs south to 0 m, and from the ramp's top a way
/// at 0 m west, over the corridor on a slab of rock from 4 m over the corridor's floor up to the way's.
struct OverItself;

impl Terrain for OverItself {
    fn height_at(&self, x: f64, y: f64) -> f64 {
        let corridor = x.abs() < 1.6 && (-16.0..12.0).contains(&y);
        let turn = (-1.6..9.6).contains(&x) && (-16.0..-12.8).contains(&y);
        let ramp = (6.4..9.6).contains(&x) && (-12.8..3.2).contains(&y);
        let way = (-6.4..9.6).contains(&x) && (3.2..6.4).contains(&y);
        if corridor || turn {
            -8.0
        } else if ramp {
            -8.0 + (y + 12.8) * 0.5
        } else if way {
            0.0
        } else {
            10.0
        }
    }
}

#[test]
fn a_way_that_winds_up_a_ramp_and_back_over_itself_is_walked_end_to_end() {
    let slab = movement::Block { min_x: -1.6, min_y: 3.2, max_x: 1.6, max_y: 6.4, top: 0.0, bottom: -4.0 };
    // Over this field one region once grew from the corridor up the ramp, along the way and back over the corridor
    // under it: its outline crossed itself, and its polys overlapped and never linked.
    let field = Bounds { min_x: -12.0, min_y: -24.0, max_x: 16.0, max_y: 16.0 };
    let agent = navmesh::Agent { cell_size: 0.4, walks_to_drops: true, ..AGENT };
    let from = [0.0, 10.0, -8.0];
    let navmesh = NavMesh::bake_anchored(&[slab], &OverItself, field, &agent, from);
    let (under, over) = ([0.0, 4.8, -8.0], [0.0, 4.8, 0.0]);
    let along =
        [under, [0.0, -4.0, -8.0], [4.0, -14.4, -8.0], [8.0, -4.8, -4.0], [8.0, 4.8, 0.0], over, [-5.0, 4.8, 0.0]];
    for to in along {
        assert!(navmesh.find_path(from, to).is_some(), "a way to {to:?}");
    }
    let round = navmesh.path_length(under, over).expect("from under the slab to over it");
    assert!(round > 30.0, "by the ramp, not up through the slab: {round:.1} m");
}
