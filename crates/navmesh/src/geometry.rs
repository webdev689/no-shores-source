//! Plane geometry on grid points: exact orientation tests (O'Rourke's), ear-clipping, and bridging holes into
//! their outline. Grid points sit on eighths of a cell, so every product here is exact.

/// A grid point (x, y in cells) and its height.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Point {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// Twice the signed area of the triangle: positive when `point` is left of `a`→`b`.
pub(crate) fn area2(a: Point, b: Point, point: Point) -> f64 {
    (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y)
}

fn collinear(a: Point, b: Point, point: Point) -> bool {
    area2(a, b, point) == 0.0
}

pub(crate) fn left(a: Point, b: Point, point: Point) -> bool {
    area2(a, b, point) > 0.0
}

pub(crate) fn left_on(a: Point, b: Point, point: Point) -> bool {
    area2(a, b, point) >= 0.0
}

/// Whether `point` lies on the segment `a`-`b`.
fn between(a: Point, b: Point, point: Point) -> bool {
    if !collinear(a, b, point) {
        return false;
    }
    if a.x == b.x { (a.y <= point.y) == (point.y <= b.y) } else { (a.x <= point.x) == (point.x <= b.x) }
}

/// Whether the segments `a`-`b` and `from`-`to` cross at a point inside both.
fn cross_properly(a: Point, b: Point, from: Point, to: Point) -> bool {
    if collinear(a, b, from) || collinear(a, b, to) || collinear(from, to, a) || collinear(from, to, b) {
        return false;
    }
    (left(a, b, from) != left(a, b, to)) && (left(from, to, a) != left(from, to, b))
}

/// Whether the segments `a`-`b` and `from`-`to` touch at all.
pub(crate) fn intersect(a: Point, b: Point, from: Point, to: Point) -> bool {
    cross_properly(a, b, from, to)
        || between(a, b, from)
        || between(a, b, to)
        || between(from, to, a)
        || between(from, to, b)
}

/// Whether the diagonal from `i` to `j` crosses no edge of the polygon it does not share an end with. An end is
/// shared by place, as Recast's is: a bridged hole visits its bridge's corners twice, and a diagonal from one would
/// otherwise meet the edges at its twin and leave the loop no ear.
fn crosses_no_edge(poly: &[Point], i: usize, j: usize) -> bool {
    let n = poly.len();
    let at = |one: Point, other: Point| one.x == other.x && one.y == other.y;
    (0..n).all(|k| {
        let next = (k + 1) % n;
        let shares = |end: usize| at(poly[end], poly[i]) || at(poly[end], poly[j]);
        shares(k) || shares(next) || !intersect(poly[i], poly[j], poly[k], poly[next])
    })
}

/// Whether the diagonal from `i` to `j` leaves `i` into the polygon's inside.
fn in_cone(poly: &[Point], i: usize, j: usize) -> bool {
    let n = poly.len();
    let (here, next, previous, other) = (poly[i], poly[(i + 1) % n], poly[(i + n - 1) % n], poly[j]);
    if left_on(here, next, previous) {
        left(here, other, previous) && left(other, here, next)
    } else {
        !(left_on(here, other, next) && left_on(other, here, previous))
    }
}

fn diagonal(poly: &[Point], i: usize, j: usize) -> bool {
    in_cone(poly, i, j) && in_cone(poly, j, i) && crosses_no_edge(poly, i, j)
}

/// Whether the diagonal from corner `i` to the corner two on cuts an ear, and if so its squared length.
fn ear(poly: &[Point], i: usize) -> Option<f64> {
    let j = (i + 2) % poly.len();
    let (a, b) = (poly[i], poly[j]);
    diagonal(poly, i, j).then_some((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y))
}

/// Ear-clips a counter-clockwise simple polygon into triangles, the shortest diagonal first. Each corner's ear is kept
/// between clips and tried again only where a clip can change it: the four corners whose diagonal ends or turns at the
/// clip's two ends, and any whose diagonal's box meets the clipped triangle's, the only place an edge came or went.
pub(crate) fn triangulate(points: &[Point]) -> Vec<[Point; 3]> {
    let mut poly = points.to_vec();
    let mut triangles = Vec::new();
    let mut ears: Vec<Option<f64>> =
        if poly.len() > 3 { (0..poly.len()).map(|i| ear(&poly, i)).collect() } else { Vec::new() };
    while poly.len() > 3 {
        let n = poly.len();
        let mut best = None;
        let mut best_length = f64::INFINITY;
        for (i, length) in ears.iter().enumerate() {
            if let Some(length) = *length
                && length < best_length
            {
                best_length = length;
                best = Some(i);
            }
        }
        // A degenerate polygon has no proper diagonal: clip its first convex corner.
        let best = best.or_else(|| (0..n).find(|&i| left(poly[i], poly[(i + 1) % n], poly[(i + 2) % n])));
        let Some(best) = best else { break };
        let middle = (best + 1) % n;
        let clipped = [poly[best], poly[middle], poly[(best + 2) % n]];
        triangles.push(clipped);
        poly.remove(middle);
        ears.remove(middle);
        let n = n - 1;
        if n <= 3 {
            continue;
        }
        let start = if middle == 0 { n - 1 } else { best };
        let [one, two, three] = clipped;
        let (low_x, high_x) = (one.x.min(two.x).min(three.x), one.x.max(two.x).max(three.x));
        let (low_y, high_y) = (one.y.min(two.y).min(three.y), one.y.max(two.y).max(three.y));
        for i in 0..n {
            let (a, b) = (poly[i], poly[(i + 2) % n]);
            let beside = (i + n - start) % n >= n - 2 || (i + n - start) % n <= 1;
            let meets =
                a.x.min(b.x) <= high_x && a.x.max(b.x) >= low_x && a.y.min(b.y) <= high_y && a.y.max(b.y) >= low_y;
            if beside || meets {
                ears[i] = ear(&poly, i);
            }
        }
    }
    if poly.len() == 3 {
        triangles.push([poly[0], poly[1], poly[2]]);
    }
    triangles
}

/// A point of a loop under construction, with the identity of the corner it came from: a bridge visits its two ends
/// twice, and edges at those ends are told apart by identity, not position.
#[derive(Clone, Copy, Debug)]
struct Tagged {
    id: usize,
    point: Point,
}

fn tag(points: &[Point], first_id: usize) -> Vec<Tagged> {
    points.iter().enumerate().map(|(at, &point)| Tagged { id: first_id + at, point }).collect()
}

/// Bridges each hole, leftmost first, to the nearest outline corner whose diagonal crosses no edge of the outline or
/// any hole, and splices the hole in around the bridge. The result is one weakly simple loop the ear-clip cuts as
/// any other. A hole that cannot be bridged is left out, as Recast leaves it.
pub(crate) fn merge_holes(outer: &[Point], holes: &[&[Point]]) -> Vec<Point> {
    let mut poly = tag(outer, 0);
    let mut next_id = outer.len();
    let mut sorted: Vec<(Vec<Tagged>, usize)> = holes
        .iter()
        .map(|hole| {
            let tagged = tag(hole, next_id);
            next_id += hole.len();
            let leftmost = (1..hole.len()).fold(0, |best, at| {
                let (here, kept) = (hole[at], hole[best]);
                if here.x < kept.x || (here.x == kept.x && here.y < kept.y) { at } else { best }
            });
            (tagged, leftmost)
        })
        .collect();
    sorted.sort_by(|(first, first_left), (second, second_left)| {
        let (one, two) = (first[*first_left].point, second[*second_left].point);
        one.x.total_cmp(&two.x).then(one.y.total_cmp(&two.y))
    });
    for (hole, leftmost) in &sorted {
        let target = hole[*leftmost];
        let mut order: Vec<(usize, f64)> = poly
            .iter()
            .enumerate()
            .map(|(at, corner)| {
                let (dx, dy) = (corner.point.x - target.point.x, corner.point.y - target.point.y);
                (at, dx * dx + dy * dy)
            })
            .collect();
        order.sort_by(|first, second| first.1.total_cmp(&second.1));
        let bridge = order.iter().map(|&(at, _)| at).find(|&at| {
            let from = poly[at];
            let clear_of = |edges: &[Tagged], end: Tagged| {
                (0..edges.len()).all(|k| {
                    let (start, stop) = (edges[k], edges[(k + 1) % edges.len()]);
                    start.id == end.id
                        || stop.id == end.id
                        || !intersect(from.point, target.point, start.point, stop.point)
                })
            };
            clear_of(&poly, from) && sorted.iter().all(|(other, _)| clear_of(other, target))
        });
        let Some(bridge) = bridge else { continue };
        let mut merged = poly[..=bridge].to_vec();
        merged.extend_from_slice(&hole[*leftmost..]);
        merged.extend_from_slice(&hole[..*leftmost]);
        merged.push(target);
        merged.push(poly[bridge]);
        merged.extend_from_slice(&poly[bridge + 1..]);
        poly = merged;
    }
    poly.into_iter().map(|corner| corner.point).collect()
}

#[cfg(test)]
#[path = "geometry_tests.rs"]
mod geometry_tests;
