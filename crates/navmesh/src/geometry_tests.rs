//! The ear-clip of an outline with holes bridged into it: a bridge visits its two ends twice, and a diagonal to one
//! of those corners must not be taken for one crossing the edges at its twin.

use super::*;

/// A dungeon room's floor round two pillars, each hole their footprint grown by a body's half-width, as the bake
/// traced it, both holes bridged in (grid cells of 0.4 m).
const BRIDGED: &[(f64, f64)] = &[
    (273.0, 202.0),
    (290.0, 202.0),
    (290.0, 203.0),
    (289.0, 203.0),
    (289.0, 205.0),
    (290.0, 205.0),
    (290.0, 206.0),
    (292.0, 206.0),
    (292.0, 208.0),
    (293.0, 208.0),
    (293.0, 209.0),
    (291.0, 210.0),
    (291.0, 212.0),
    (290.0, 214.0),
    (289.0, 214.0),
    (287.0, 214.0),
    (287.0, 215.0),
    (286.0, 215.0),
    (286.0, 217.0),
    (288.0, 218.0),
    (288.0, 219.0),
    (291.0, 219.0),
    (291.0, 220.0),
    (290.0, 220.0),
    (290.0, 222.0),
    (291.0, 222.0),
    (291.0, 223.0),
    (293.0, 223.0),
    (293.0, 224.0),
    (294.0, 224.0),
    (294.0, 226.0),
    (296.0, 227.0),
    (296.0, 231.0),
    (280.0, 231.0),
    (280.0, 230.0),
    (281.0, 219.0),
    (281.0, 222.0),
    (282.0, 222.0),
    (282.0, 223.0),
    (285.0, 223.0),
    (285.0, 222.0),
    (286.0, 222.0),
    (286.0, 219.0),
    (285.0, 219.0),
    (285.0, 218.0),
    (282.0, 218.0),
    (282.0, 219.0),
    (281.0, 219.0),
    (280.0, 230.0),
    (274.0, 230.0),
    (274.0, 208.0),
    (281.0, 210.0),
    (281.0, 213.0),
    (282.0, 213.0),
    (282.0, 214.0),
    (284.0, 214.0),
    (284.0, 213.0),
    (285.0, 213.0),
    (285.0, 210.0),
    (284.0, 210.0),
    (284.0, 209.0),
    (282.0, 209.0),
    (282.0, 210.0),
    (281.0, 210.0),
    (274.0, 208.0),
    (273.0, 208.0),
    (273.0, 206.0),
    (272.0, 206.0),
    (272.0, 205.0),
    (271.0, 205.0),
    (271.0, 204.0),
    (272.0, 204.0),
];

fn twice_area(points: &[Point]) -> f64 {
    (0..points.len())
        .map(|at| {
            let (here, next) = (points[at], points[(at + 1) % points.len()]);
            here.x * next.y - next.x * here.y
        })
        .sum()
}

#[test]
fn an_outline_with_two_bridged_holes_is_clipped_into_its_own_area_and_never_over_a_hole() {
    let outline: Vec<Point> = BRIDGED.iter().map(|&(x, y)| Point { x, y, z: 0.0 }).collect();
    let triangles = triangulate(&outline);
    let covered: f64 = triangles.iter().map(|triangle| twice_area(triangle).abs()).sum();
    assert_eq!(covered, twice_area(&outline), "the triangles cover the floor and nothing more");
    // Each pillar's middle, inside its hole.
    for (x, y) in [(283.5, 220.5), (283.0, 211.5)] {
        let middle = Point { x, y, z: 0.0 };
        let over =
            triangles.iter().any(|&[a, b, c]| left_on(a, b, middle) && left_on(b, c, middle) && left_on(c, a, middle));
        assert!(!over, "a triangle over the pillar at {x}, {y}");
    }
}
