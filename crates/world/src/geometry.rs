//! Plane geometry on whole metres, in integer arithmetic only, so every machine that runs it agrees to the bit.
//! Coordinates stay below 2^23 metres; products are taken in `i128`, which holds every value these functions form.

use serde::{Deserialize, Serialize};

/// A point in the world's frame: whole metres east (`x`) and south (`y`) of its north-west corner.
/// Written in a layout file as `[x, y]`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(from = "[i64; 2]", into = "[i64; 2]")]
pub struct Point {
    pub x: i64,
    pub y: i64,
}

impl Point {
    pub const fn new(x: i64, y: i64) -> Self {
        Self { x, y }
    }
}

impl From<[i64; 2]> for Point {
    fn from([x, y]: [i64; 2]) -> Self {
        Self { x, y }
    }
}

impl From<Point> for [i64; 2] {
    fn from(point: Point) -> Self {
        [point.x, point.y]
    }
}

/// The cross product of `origin → a` and `origin → b`: positive, zero or negative as `b` lies to one side of the line
/// through `origin` and `a`, on it, or to the other side.
pub fn cross(origin: Point, a: Point, b: Point) -> i128 {
    let (ax, ay) = (i128::from(a.x - origin.x), i128::from(a.y - origin.y));
    let (bx, by) = (i128::from(b.x - origin.x), i128::from(b.y - origin.y));
    ax * by - ay * bx
}

fn dot(origin: Point, a: Point, b: Point) -> i128 {
    let (ax, ay) = (i128::from(a.x - origin.x), i128::from(a.y - origin.y));
    let (bx, by) = (i128::from(b.x - origin.x), i128::from(b.y - origin.y));
    ax * bx + ay * by
}

/// The edges of a closed ring: each point to the next, the last back to the first.
pub fn edges(ring: &[Point]) -> impl Iterator<Item = (Point, Point)> + '_ {
    ring.iter().zip(ring.iter().cycle().skip(1)).map(|(&from, &to)| (from, to))
}

/// The ring's area in square metres, counted twice so it stays a whole number.
pub fn doubled_area(ring: &[Point]) -> u128 {
    let signed: i128 = edges(ring)
        .map(|(from, to)| i128::from(from.x) * i128::from(to.y) - i128::from(to.x) * i128::from(from.y))
        .sum();
    signed.unsigned_abs()
}

fn on_segment(from: Point, to: Point, point: Point) -> bool {
    point.x >= from.x.min(to.x)
        && point.x <= from.x.max(to.x)
        && point.y >= from.y.min(to.y)
        && point.y <= from.y.max(to.y)
}

/// Whether two segments share any point, touching and overlapping included.
pub fn segments_meet(first: (Point, Point), second: (Point, Point)) -> bool {
    let (start, end) = first;
    let (other_start, other_end) = second;
    // Segments whose boxes are apart share no point: most pairs are told so before any product is taken.
    if start.x.max(end.x) < other_start.x.min(other_end.x)
        || other_start.x.max(other_end.x) < start.x.min(end.x)
        || start.y.max(end.y) < other_start.y.min(other_end.y)
        || other_start.y.max(other_end.y) < start.y.min(end.y)
    {
        return false;
    }
    let side_other_start = cross(start, end, other_start).signum();
    let side_other_end = cross(start, end, other_end).signum();
    let side_start = cross(other_start, other_end, start).signum();
    let side_end = cross(other_start, other_end, end).signum();
    if side_other_start * side_other_end < 0 && side_start * side_end < 0 {
        return true;
    }
    (side_other_start == 0 && on_segment(start, end, other_start))
        || (side_other_end == 0 && on_segment(start, end, other_end))
        || (side_start == 0 && on_segment(other_start, other_end, start))
        || (side_end == 0 && on_segment(other_start, other_end, end))
}

/// Whether a ring's edges cross or touch anywhere but where neighbouring edges share a corner.
pub fn ring_is_simple(ring: &[Point]) -> bool {
    let all: Vec<(Point, Point)> = edges(ring).collect();
    let count = all.len();
    for i in 0..count {
        for j in i + 1..count {
            let neighbours = j == i + 1 || (i == 0 && j == count - 1);
            if neighbours {
                let (shared, outer_i, outer_j) =
                    if j == i + 1 { (all[i].1, all[i].0, all[j].1) } else { (all[i].0, all[i].1, all[j].0) };
                let folds_back = cross(shared, outer_i, outer_j) == 0 && dot(shared, outer_i, outer_j) > 0;
                if folds_back {
                    return false;
                }
            } else if segments_meet(all[i], all[j]) {
                return false;
            }
        }
    }
    true
}

/// Whether a point lies inside a ring or on its edge.
pub fn ring_contains(ring: &[Point], point: Point) -> bool {
    let mut inside = false;
    for (from, to) in edges(ring) {
        if cross(from, to, point) == 0 && on_segment(from, to, point) {
            return true;
        }
        if (from.y > point.y) != (to.y > point.y) {
            let side = cross(from, to, point);
            let upward = to.y > from.y;
            if (upward && side > 0) || (!upward && side < 0) {
                inside = !inside;
            }
        }
    }
    inside
}

/// Whether two rings share any ground: their edges meet, or one lies inside the other.
pub fn rings_overlap(first: &[Point], second: &[Point]) -> bool {
    let edges_meet = edges(first).any(|edge| edges(second).any(|other| segments_meet(edge, other)));
    edges_meet
        || first.first().is_some_and(|&point| ring_contains(second, point))
        || second.first().is_some_and(|&point| ring_contains(first, point))
}

/// Whether every point of a segment is more than `radius` metres from `centre`.
pub fn segment_clear_of_circle(segment: (Point, Point), centre: Point, radius: i64) -> bool {
    let (from, to) = segment;
    let radius_squared = i128::from(radius) * i128::from(radius);
    let along = dot(from, to, centre);
    let length_squared = dot(from, to, to);
    if along <= 0 || length_squared == 0 {
        return dot(from, centre, centre) > radius_squared;
    }
    if along >= length_squared {
        return dot(to, centre, centre) > radius_squared;
    }
    let across = cross(from, to, centre);
    across * across > radius_squared * length_squared
}

/// Whether a circle stays wholly outside a ring, never touching it.
pub fn circle_clear_of_ring(centre: Point, radius: i64, ring: &[Point]) -> bool {
    !ring_contains(ring, centre) && edges(ring).all(|edge| segment_clear_of_circle(edge, centre, radius))
}

/// Whether two circles stay apart, never touching.
pub fn circles_apart(first: (Point, i64), second: (Point, i64)) -> bool {
    let reach = i128::from(first.1) + i128::from(second.1);
    dot(first.0, second.0, second.0) > reach * reach
}

#[cfg(test)]
#[path = "geometry_tests.rs"]
mod tests;
