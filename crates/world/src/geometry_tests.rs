use super::*;

fn ring(points: &[(i64, i64)]) -> Vec<Point> {
    points.iter().map(|&(x, y)| Point::new(x, y)).collect()
}

fn square(left: i64, top: i64, side: i64) -> Vec<Point> {
    ring(&[(left, top), (left + side, top), (left + side, top + side), (left, top + side)])
}

#[test]
fn a_square_kilometre_is_a_million_square_metres() {
    assert_eq!(doubled_area(&square(0, 0, 1_000)) / 2, 1_000_000);
}

#[test]
fn area_does_not_depend_on_which_way_the_ring_runs() {
    let mut reversed = square(10, 20, 300);
    reversed.reverse();
    assert_eq!(doubled_area(&reversed), doubled_area(&square(10, 20, 300)));
}

#[test]
fn a_triangle_with_half_metre_area_counts_exactly() {
    assert_eq!(doubled_area(&ring(&[(0, 0), (1, 0), (0, 1)])), 1);
}

#[test]
fn a_point_is_written_as_a_pair() {
    let json = serde_json::to_string(&Point::new(5, -7)).unwrap();
    assert_eq!(json, "[5,-7]");
    assert_eq!(serde_json::from_str::<Point>("[5,-7]").unwrap(), Point::new(5, -7));
}

#[test]
fn crossing_touching_and_parallel_segments() {
    let at = Point::new;
    assert!(segments_meet((at(0, 0), at(10, 10)), (at(0, 10), at(10, 0))), "crossing");
    assert!(segments_meet((at(0, 0), at(10, 0)), (at(10, 0), at(10, 5))), "touching at an end");
    assert!(segments_meet((at(0, 0), at(10, 0)), (at(5, 0), at(15, 0))), "overlapping on one line");
    assert!(!segments_meet((at(0, 0), at(10, 0)), (at(0, 1), at(10, 1))), "parallel");
    assert!(!segments_meet((at(0, 0), at(10, 0)), (at(11, 0), at(20, 0))), "on one line, apart");
}

#[test]
fn a_square_is_simple_and_a_bow_tie_is_not() {
    assert!(ring_is_simple(&square(0, 0, 100)));
    assert!(!ring_is_simple(&ring(&[(0, 0), (100, 100), (100, 0), (0, 100)])));
}

#[test]
fn a_ring_that_folds_back_on_itself_is_not_simple() {
    assert!(!ring_is_simple(&ring(&[(0, 0), (100, 0), (50, 0), (50, 50)])));
}

#[test]
fn containment_inside_outside_and_on_the_edge() {
    let land = square(0, 0, 100);
    assert!(ring_contains(&land, Point::new(50, 50)));
    assert!(ring_contains(&land, Point::new(100, 50)), "on the edge counts");
    assert!(!ring_contains(&land, Point::new(150, 50)));
    let notch = ring(&[(0, 0), (100, 0), (100, 100), (50, 40), (0, 100)]);
    assert!(!ring_contains(&notch, Point::new(50, 80)), "inside the notch is outside the land");
}

#[test]
fn rings_overlap_when_they_cross_or_nest_but_not_when_apart() {
    let big = square(0, 0, 100);
    assert!(rings_overlap(&big, &square(50, 50, 100)), "crossing edges");
    assert!(rings_overlap(&big, &square(10, 10, 10)), "one inside the other");
    assert!(rings_overlap(&square(10, 10, 10), &big), "the other way round");
    assert!(!rings_overlap(&big, &square(200, 0, 50)), "apart");
}

#[test]
fn a_circle_clears_a_ring_only_with_sea_between() {
    let land = square(0, 0, 100);
    assert!(circle_clear_of_ring(Point::new(200, 50), 50, &land), "fifty metres of sea to spare");
    assert!(!circle_clear_of_ring(Point::new(150, 50), 50, &land), "touching the coast");
    assert!(!circle_clear_of_ring(Point::new(140, 50), 50, &land), "over the coast");
    assert!(!circle_clear_of_ring(Point::new(50, 50), 5, &land), "on the land");
    assert!(!circle_clear_of_ring(Point::new(140, 140), 57, &land), "over a corner");
    assert!(circle_clear_of_ring(Point::new(140, 140), 56, &land), "just clear of a corner");
}

#[test]
fn circles_apart_and_touching() {
    assert!(circles_apart((Point::new(0, 0), 10), (Point::new(30, 0), 10)));
    assert!(!circles_apart((Point::new(0, 0), 10), (Point::new(20, 0), 10)), "touching");
    assert!(!circles_apart((Point::new(0, 0), 10), (Point::new(5, 5), 1)), "one inside the other");
}

#[test]
fn the_largest_values_stay_exact() {
    let frame = square(0, 0, 4_915_200);
    assert_eq!(doubled_area(&frame) / 2, 4_915_200_u128 * 4_915_200);
    assert!(circle_clear_of_ring(Point::new(8_000_000, 1_000_000), 3_000_000, &frame));
    assert!(!circle_clear_of_ring(Point::new(8_000_000, 1_000_000), 3_084_800, &frame));
}
