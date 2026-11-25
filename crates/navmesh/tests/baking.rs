//! A navmesh baked a slice at a time, as a room spreads one over its ticks, is the mesh a bake at once makes, to the
//! bit, whichever ground it stands on.

use movement::{Block, Terrain};
use navmesh::{AGENT, Baking, Bounds, NavMesh};

const BOUNDS: Bounds = Bounds { min_x: -20.0, min_y: -18.0, max_x: 24.0, max_y: 16.0 };

/// A rolling slope: up to the east, a ridge across it and a hollow.
struct Rolling;

impl Terrain for Rolling {
    fn height_at(&self, x: f64, y: f64) -> f64 {
        let ridge = 1.5 / (1.0 + (y - 4.0) * (y - 4.0) / 9.0);
        let hollow = -1.2 / (1.0 + ((x + 8.0) * (x + 8.0) + (y + 6.0) * (y + 6.0)) / 16.0);
        0.06 * x + ridge + hollow
    }
}

fn blocks() -> Vec<Block> {
    let block = |min_x, min_y, max_x, max_y, top| Block { min_x, min_y, max_x, max_y, top, bottom: -4.0 };
    vec![
        block(-6.0, -2.0, -2.0, 2.0, 2.4),
        block(2.0, -10.0, 3.0, 8.0, 3.2),
        block(8.0, 4.0, 14.0, 9.0, 1.3),
        block(10.0, -12.0, 11.0, -3.0, 0.9),
    ]
}

/// Steps a bake to its end, answering its mesh and how many slices it took; none answers a mesh before its last.
fn stepped(mut baking: Baking, ground: &dyn Terrain) -> (NavMesh, usize) {
    for slices in 1.. {
        if let Some(mesh) = baking.step(ground) {
            assert!(baking.step(ground).is_none(), "a bake done answers no second mesh");
            return (mesh, slices);
        }
    }
    unreachable!()
}

#[test]
fn a_bake_on_ground_spread_over_slices_is_the_bake_at_once() {
    let (mesh, slices) = stepped(Baking::on(&blocks(), BOUNDS, &AGENT), &Rolling);
    assert!(slices > 3, "spread over {slices} slices");
    assert_eq!(mesh, NavMesh::bake_on(&blocks(), &Rolling, BOUNDS, &AGENT));
}

#[test]
fn a_bake_on_open_ground_or_over_the_sea_spread_over_slices_is_the_bake_at_once() {
    let (flat, _) = stepped(Baking::flat(&blocks(), BOUNDS, &AGENT), &Rolling);
    assert_eq!(flat, NavMesh::bake(&blocks(), BOUNDS, &AGENT), "the ground handed is not read on open ground");
    let (sea, _) = stepped(Baking::over_sea(&blocks(), BOUNDS, &AGENT), &Rolling);
    assert_eq!(sea, NavMesh::bake_over_sea(&blocks(), BOUNDS, &AGENT));
}
