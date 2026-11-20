//! Blocks laid over the open sea, as ships' decks are: the sea is no floor, so the mesh is their tops alone, and every
//! deck a body could stand in is kept, though no walk joins it to the largest; a crate's top too small to stand in is
//! still left out. On open ground the same blocks stand on the ground, each deck joined to it by the climb up its
//! side.

use movement::Block;
use navmesh::{AGENT, Bounds, NavMesh};

/// Two decks 2.2 m and 3.7 m over the sea, 4 m apart, the lower with a crate on it; the water 30 m about them.
const DECKS: [Block; 3] = [
    Block { min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 6.0, top: 2.2, bottom: 0.0 },
    Block { min_x: 14.0, min_y: 0.0, max_x: 20.0, max_y: 5.0, top: 3.7, bottom: 0.0 },
    Block { min_x: 4.0, min_y: 2.0, max_x: 5.0, max_y: 3.0, top: 3.2, bottom: 0.0 },
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
fn on_open_ground_the_ground_is_walked_and_each_deck_is_climbed_from_it() {
    let mesh = NavMesh::bake(&DECKS, WATER, &AGENT);
    assert!(on_mesh(&mesh, [30.0, 20.0, 0.0]), "the ground");
    assert!(on_mesh(&mesh, [17.0, 2.5, 3.7]), "the higher deck, which the ground joins");
    let climbed = |link: &navmesh::Link| link.from[2] == 0.0 && (link.to[2] - 3.7).abs() < 1e-9 && !link.jump;
    assert!(mesh.links().any(climbed), "the climb up its side");
    assert!(!on_mesh(&mesh, [4.5, 2.5, 3.2]), "a crate's top no one stands in");
    assert!(mesh.find_path([25.0, 2.5, 0.0], [17.0, 2.5, 3.7]).is_some(), "a way from the ground up onto it");
}
