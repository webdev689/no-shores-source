//! Meshes baked apart over ground of their own and joined into one: each answers paths within its ground as it did
//! alone, no path runs from one to another, and a point is placed on whichever has it nearest.

use movement::Block;
use navmesh::{AGENT, Bounds, NavMesh, Way};

fn square(middle_x: f64, middle_y: f64) -> Bounds {
    Bounds { min_x: middle_x - 10.0, min_y: middle_y - 10.0, max_x: middle_x + 10.0, max_y: middle_y + 10.0 }
}

fn wall(middle_x: f64) -> Block {
    Block { min_x: middle_x - 1.0, min_y: -6.0, max_x: middle_x + 1.0, max_y: 6.0, top: 3.0, bottom: 0.0 }
}

#[test]
fn a_joined_mesh_paths_within_each_part_as_it_did_alone_and_never_between_them() {
    let (home, far) = (NavMesh::bake(&[wall(0.0)], square(0.0, 0.0), &AGENT), wall(100.0));
    let apart = NavMesh::bake(&[far], square(100.0, 0.0), &AGENT);
    let mut joined = home.clone();
    joined.join(vec![apart.clone()]);
    let (west, east) = ([-5.0, 0.0, 0.0], [5.0, 0.0, 0.0]);
    assert_eq!(joined.find_path(west, east), home.find_path(west, east), "round the home wall as before");
    let (far_west, far_east) = ([95.0, 0.0, 0.0], [105.0, 0.0, 0.0]);
    assert!(home.find_path(far_west, far_east).is_none(), "the home mesh alone knows nothing there");
    assert_eq!(joined.find_path(far_west, far_east), apart.find_path(far_west, far_east), "round the far wall");
    assert_eq!(joined.path_length(far_west, far_east), apart.path_length(far_west, far_east));
    assert!(joined.find_path(west, far_east).is_none(), "no way between the parts");
    let mut way = Way::default();
    assert_eq!(joined.find_path_kept(&mut way, far_west, far_east), apart.find_path(far_west, far_east));
    assert_eq!(joined.find_path_kept(&mut way, far_west, far_east), apart.find_path(far_west, far_east), "kept");
    assert_eq!(joined.find_path_kept(&mut way, west, east), home.find_path(west, east), "a way kept moves parts");
    assert_eq!(joined.nearest_point([101.5, 20.5, 0.0]), apart.nearest_point([101.5, 20.5, 0.0]));
    assert_eq!(joined.nearest_point([-3.0, 11.0, 0.0]), home.nearest_point([-3.0, 11.0, 0.0]));
    assert_eq!(joined.nearest_point([50.0, 0.0, 0.0]), None, "nowhere near either");
    let spots = joined.spots_near([100.0, 0.0, 0.0], 15.0).count();
    assert_eq!(spots, apart.spots_near([100.0, 0.0, 0.0], 15.0).count());
}

#[test]
fn a_point_is_placed_from_a_body_only_on_the_part_the_body_stands_on() {
    let home = NavMesh::bake(&[wall(0.0)], square(0.0, 0.0), &AGENT);
    let apart = NavMesh::bake(&[wall(100.0)], square(100.0, 0.0), &AGENT);
    let mut joined = home.clone();
    joined.join(vec![apart.clone()]);
    let (at_home, far) = ([-5.0, 0.0, 0.0], [95.0, 0.0, 0.0]);
    assert_eq!(joined.nearest_point_from(at_home, [-3.0, 11.0, 0.0]), home.nearest_point([-3.0, 11.0, 0.0]));
    assert_eq!(joined.nearest_point_from(far, far), apart.nearest_point(far), "from the far part, on it");
    assert_eq!(joined.nearest_point_from(at_home, far), None, "the far part is no ground a body at home walks to");
    assert_eq!(joined.nearest_point_from([50.0, 0.0, 0.0], at_home), None, "a body on neither part reaches neither");
}
