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
