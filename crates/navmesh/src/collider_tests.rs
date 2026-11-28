//! The surface a path rides where a dungeon's slab ends on a cell's edge.

use super::*;

/// The ground the bake samples under a slab's edge: between the storey under it and the floor past it.
struct Between;

impl Terrain for Between {
    fn height_at(&self, _x: f64, _y: f64) -> f64 {
        -4.0
    }
}

#[test]
fn a_point_a_rounding_past_a_slabs_edge_rides_its_top_not_the_ground_under_its_edge() {
    let slab = Block { min_x: 76.8, min_y: 16.0, max_x: 80.0, max_y: 19.2, top: 0.0, bottom: -4.8 };
    let colliders = [Collider::from(slab)];
    // Lion-grasslands' dungeon 4: a path's corner at the threshold of a door on the slab, back from the grid.
    let (x, y) = (78.80000000000001, 19.200000000000003);
    assert_eq!(surface_near(&colliders, &Between, x, y, Some(0.0)), 0.0);
    assert_eq!(surface_near(&colliders, &Between, x, 19.21, Some(0.0)), -4.0, "a cell's hundredth past, the ground's");
}
