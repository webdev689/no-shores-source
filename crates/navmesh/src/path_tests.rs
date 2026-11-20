//! The funnel's own cases, on portals as a corridor lays them.

use super::{Portal, funnel};

fn point(at: (f64, f64)) -> Portal {
    Portal { left: at, right: at }
}

#[test]
fn a_start_on_the_first_portal_s_edge_walks_on_and_never_back_to_its_far_end() {
    // A walker standing on the edge between two polys, the goal north of it beyond a third, all on one line: as a
    // follower stood straight behind its leader on a beat walked due north.
    let start = (260.0, 145.75);
    let goal = (260.0, 142.56);
    let between = Portal { left: (260.0, 156.0), right: (260.0, 143.0) };
    let on = Portal { left: (273.0, 143.0), right: (260.0, 143.0) };
    assert_eq!(funnel(&[point(start), between, on, point(goal)]), vec![start, goal]);
    let aside = (262.0, 140.0);
    assert_eq!(funnel(&[point(start), between, on, point(aside)]), vec![start, aside], "off the line, as straight");
}
