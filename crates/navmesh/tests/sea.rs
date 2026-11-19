//! Blocks laid over the open sea, as ships' decks are: the sea is no floor, so the mesh is their tops alone, and every
//! deck a body could stand in is kept, though no walk joins it to the largest; a crate's top too small to stand in is
//! still left out. The same blocks on open ground keep the ground alone, as every other course does.

use movement::Block;
use navmesh::{AGENT, Bounds, NavMesh};

/// Two decks 2.2 m and 3.7 m over the sea, 4 m apart, the lower with a crate on it; the water 30 m about them.
const DECKS: [Block; 3] = [
    Block { min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 6.0, top: 2.2 },
    Block { min_x: 14.0, min_y: 0.0, max_x: 20.0, max_y: 5.0, top: 3.7 },
    Block { min_x: 4.0, min_y: 2.0, max_x: 5.0, max_y: 3.0, top: 3.2 },
];
const WATER: Bounds = Bounds { min_x: -30.0, min_y: -30.0, max_x: 50.0, max_y: 35.0 };

fn on_mesh(mesh: &NavMesh, point: [f64; 3]) -> bool {
    mesh.nearest_point(point).is_some_and(|found| (found[2] - point[2]).abs() < 0.05)
}

#[test]
fn over_the_sea_every_deck_is_walked_and_the_sea_is_not() {
    let mesh = NavMesh::bake_over_sea(&DECKS, WATER, &AGENT);
    assert!(on_mesh(&mesh, [2.0, 3.0, 2.2]), "the larger deck");
    assert!(on_mesh(&mesh, [17.0, 2.5, 3.7]), "the smaller deck, which no walk joins to the larger");
    assert!(mesh.nearest_point([30.0, 20.0, 0.0]).is_none(), "the open sea");
    assert!(!on_mesh(&mesh, [4.5, 2.5, 3.2]), "a crate's top no one stands in");
    assert!(mesh.find_path([1.0, 1.0, 2.2], [9.0, 5.0, 2.2]).is_some(), "a way across a deck");
}

#[test]
fn on_open_ground_the_same_blocks_leave_the_ground_alone() {
    let mesh = NavMesh::bake(&DECKS, WATER, &AGENT);
    assert!(on_mesh(&mesh, [30.0, 20.0, 0.0]), "the ground");
    assert!(!on_mesh(&mesh, [17.0, 2.5, 3.7]), "a top no step reaches");
}
