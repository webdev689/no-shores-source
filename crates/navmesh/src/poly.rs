//! The poly mesh: each region's outline (holes bridged in) ear-clipped into triangles, sliced on one grid-wide
//! lattice so no poly grows past a set area, and merged greedily into convex polys of up to six corners. Corners
//! are shared, so an edge two polys share links them, within a region and across a portal into the next.

use crate::contours::Contour;
use crate::geometry::{Point, left_on, merge_holes, triangulate};
use std::collections::BTreeMap;

/// The most corners a poly may have.
const MAX_CORNERS: usize = 6;
/// The largest poly, in square metres. Obstacles block whole polys, so this bounds how far one reaches.
const MAX_AREA: f64 = 12.0;

/// A mesh corner: its grid point (x, y in cells), its height, and the region it was made for.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Corner {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub region: usize,
}

/// A convex poly, counter-clockwise: its corners, the poly across each edge (edge `e` runs from corner `e` to the
/// next), and its region.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Poly {
    pub corners: Vec<usize>,
    pub neighbours: Vec<Option<usize>>,
    pub region: usize,
}

/// Mints corners, welding a point onto an existing corner at the same (x, y) made for the same region or within two
/// voxels of its height: floors stacked over each other keep their own corners, and a portal's ends are one corner
/// to both regions.
struct Welder {
    corners: Vec<Corner>,
    at: BTreeMap<(u64, u64), Vec<usize>>,
    region: usize,
    voxel: f64,
}

impl Welder {
    fn id(&mut self, point: Point) -> usize {
        // Adding 0 folds -0 into 0, so the two key alike.
        let key = ((point.x + 0.0).to_bits(), (point.y + 0.0).to_bits());
        if let Some(found) = self.at.get(&key) {
            for &index in found {
                let corner = self.corners[index];
                if corner.region == self.region || (corner.z - point.z).abs() <= 2.0 * self.voxel + 1e-6 {
                    return index;
                }
            }
        }
        let index = self.corners.len();
        self.corners.push(Corner { x: point.x, y: point.y, z: point.z, region: self.region });
        self.at.entry(key).or_default().push(index);
        index
    }

    fn point(&self, index: usize) -> Point {
        let corner = self.corners[index];
        Point { x: corner.x, y: corner.y, z: corner.z }
    }

    /// Twice a ring's signed area: positive counter-clockwise.
    fn area2(&self, ring: &[usize]) -> f64 {
        (0..ring.len()).fold(0.0, |area, at| {
            let (here, next) = (self.point(ring[at]), self.point(ring[(at + 1) % ring.len()]));
            area + here.x * next.y - next.x * here.y
        })
    }
}

/// Clips a ring to one side of an axis line (`along_y` picks y = `cut`, else x = `cut`), Sutherland-Hodgman style.
/// A point made on the line snaps to the eighth-cell lattice, so the same point made from either side of a shared
/// edge welds to one corner; its height is interpolated, so both sides agree on it too.
fn clip_half(ring: &[Point], along_y: bool, cut: f64, keep_below: bool) -> Vec<Point> {
    let side = |point: Point| (if along_y { point.y } else { point.x }) - cut;
    let snap = |value: f64| (value * 8.0).round() / 8.0;
    let mut out = Vec::new();
    for at in 0..ring.len() {
        let (a, b) = (ring[at], ring[(at + 1) % ring.len()]);
        let (side_a, side_b) = (side(a), side(b));
        let in_a = if keep_below { side_a <= 0.0 } else { side_a >= 0.0 };
        let in_b = if keep_below { side_b <= 0.0 } else { side_b >= 0.0 };
        if in_a {
            out.push(a);
        }
        if in_a != in_b {
            let t = side_a / (side_a - side_b);
            let z = a.z + (b.z - a.z) * t;
            out.push(if along_y {
                Point { x: snap(a.x + (b.x - a.x) * t), y: cut, z }
            } else {
                Point { x: cut, y: snap(a.y + (b.y - a.y) * t), z }
            });
        }
    }
    out
}

/// Drops repeated corners in a row, and the closing repeat.
fn clean(ids: Vec<usize>) -> Vec<usize> {
    let mut out: Vec<usize> = Vec::with_capacity(ids.len());
    for id in ids {
        if out.last() != Some(&id) {
            out.push(id);
        }
    }
    while out.len() > 1 && out.last() == out.first() {
        out.pop();
    }
    out
}

/// A ring that visits a corner twice is two loops pinched at that point: split them, rather than drop the ring.
fn unpinch(ring: &[usize]) -> Vec<Vec<usize>> {
    for i in 0..ring.len() {
        for j in i + 1..ring.len() {
            if ring[i] == ring[j] {
                let mut loops = unpinch(&ring[i..j]);
                let rest: Vec<usize> = ring[..i].iter().chain(&ring[j..]).copied().collect();
                loops.extend(unpinch(&rest));
                return loops;
            }
        }
    }
    vec![ring.to_vec()]
}

/// Slices a triangle on the lattice into convex rings of corners, each ear-clipped again if it has too many.
fn slice_triangle(welder: &mut Welder, triangle: [Point; 3], pitch: f64) -> Vec<Vec<usize>> {
    let mut cells = vec![triangle.to_vec()];
    for along_y in [false, true] {
        let coordinate = |point: &Point| if along_y { point.y } else { point.x };
        let low = triangle.iter().map(coordinate).fold(f64::INFINITY, f64::min);
        let high = triangle.iter().map(coordinate).fold(f64::NEG_INFINITY, f64::max);
        let mut cut = (low / pitch).ceil() * pitch;
        while cut < high {
            let mut next = Vec::new();
            for ring in &cells {
                for keep_below in [true, false] {
                    let half = clip_half(ring, along_y, cut, keep_below);
                    if half.len() >= 3 {
                        next.push(half);
                    }
                }
            }
            cells = next;
            cut += pitch;
        }
    }
    let rings: Vec<Vec<usize>> =
        cells.into_iter().map(|ring| clean(ring.into_iter().map(|point| welder.id(point)).collect())).collect();
    let mut out = Vec::new();
    for ring in rings.iter().flat_map(|ring| unpinch(ring)) {
        if ring.len() < 3 || welder.area2(&ring) <= 0.0 {
            continue;
        }
        if ring.len() > MAX_CORNERS {
            let points: Vec<Point> = ring.iter().map(|&index| welder.point(index)).collect();
            for piece in triangulate(&points) {
                out.push(piece.iter().map(|&point| welder.id(point)).collect());
            }
        } else {
            out.push(ring);
        }
    }
    out
}

/// The first edge `first` shares with `second`, wound the other way: its index in each.
fn shared_edge(first: &[usize], second: &[usize]) -> Option<(usize, usize)> {
    for i in 0..first.len() {
        let (from, to) = (first[i], first[(i + 1) % first.len()]);
        for j in 0..second.len() {
            if from == second[(j + 1) % second.len()] && to == second[j] {
                return Some((i, j));
            }
        }
    }
    None
}

/// How good merging two polys is: their shared edge's squared length, or none when the result would have too many
/// corners, too much area, or a reflex corner at either end of the seam.
fn merge_value(welder: &Welder, first: &[usize], second: &[usize], max_area2: f64) -> Option<f64> {
    let (edge_first, edge_second) = shared_edge(first, second)?;
    let (len_first, len_second) = (first.len(), second.len());
    if len_first + len_second - 2 > MAX_CORNERS {
        return None;
    }
    if welder.area2(first) + welder.area2(second) > max_area2 {
        return None;
    }
    let start = first[edge_first];
    let end = first[(edge_first + 1) % len_first];
    let first_before = first[(edge_first + len_first - 1) % len_first];
    let first_after = first[(edge_first + 2) % len_first];
    let second_before = second[(edge_second + len_second - 1) % len_second];
    let second_after = second[(edge_second + 2) % len_second];
    let point = |index| welder.point(index);
    if !left_on(point(first_before), point(start), point(second_after)) {
        return None;
    }
    if !left_on(point(second_before), point(end), point(first_after)) {
        return None;
    }
    let (a, b) = (point(start), point(end));
    Some((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y))
}

fn merge(first: &[usize], second: &[usize]) -> Vec<usize> {
    let Some((edge_first, edge_second)) = shared_edge(first, second) else { return first.to_vec() };
    let (len_first, len_second) = (first.len(), second.len());
    let mut out: Vec<usize> = (0..len_first - 1).map(|k| first[(edge_first + 1 + k) % len_first]).collect();
    out.extend((0..len_second - 1).map(|k| second[(edge_second + 1 + k) % len_second]));
    out
}

/// Builds the convex polys of every region and links them across their shared edges.
pub(crate) fn build(contours: &[Contour], cell: f64, voxel: f64) -> (Vec<Corner>, Vec<Poly>) {
    let max_area2 = 2.0 * (MAX_AREA / (cell * cell));
    let pitch = (MAX_AREA.sqrt() / cell).floor().max(2.0);
    let mut welder = Welder { corners: Vec::new(), at: BTreeMap::new(), region: 0, voxel };
    let to_points = |contour: &Contour| -> Vec<Point> {
        contour.verts.iter().map(|vertex| Point { x: vertex.x, y: vertex.y, z: vertex.z }).collect()
    };
    let mut holes: BTreeMap<usize, Vec<Vec<Point>>> = BTreeMap::new();
    for contour in contours.iter().filter(|contour| contour.hole) {
        holes.entry(contour.region).or_default().push(to_points(contour));
    }
    let mut polys = Vec::new();
    for contour in contours.iter().filter(|contour| !contour.hole) {
        welder.region = contour.region;
        let outline = to_points(contour);
        let outline = match holes.get(&contour.region) {
            Some(inner) => merge_holes(&outline, &inner.iter().map(Vec::as_slice).collect::<Vec<_>>()),
            None => outline,
        };
        let mut rings: Vec<Vec<usize>> = Vec::new();
        for triangle in triangulate(&outline) {
            rings.extend(slice_triangle(&mut welder, triangle, pitch));
        }
        loop {
            let mut best: Option<(f64, usize, usize)> = None;
            for i in 0..rings.len() {
                for j in i + 1..rings.len() {
                    let Some(value) = merge_value(&welder, &rings[i], &rings[j], max_area2) else { continue };
                    if best.is_none_or(|(kept, _, _)| value > kept) {
                        best = Some((value, i, j));
                    }
                }
            }
            let Some((_, i, j)) = best else { break };
            let merged = merge(&rings[i], &rings[j]);
            rings.remove(j);
            rings.remove(i);
            rings.push(merged);
        }
        for ring in rings {
            let neighbours = vec![None; ring.len()];
            polys.push(Poly { corners: ring, neighbours, region: contour.region });
        }
    }
    link_neighbours(&mut polys);
    (welder.corners, polys)
}

/// Links every edge to the one poly that shares it wound the other way; an edge with any other count of owners
/// links nothing.
fn link_neighbours(polys: &mut [Poly]) {
    // Each edge's owners: the poly, the edge's place in it, and the corners it runs from and to.
    type Owner = (usize, usize, usize, usize);
    let mut edges: BTreeMap<(usize, usize), Vec<Owner>> = BTreeMap::new();
    for (poly_index, poly) in polys.iter().enumerate() {
        let corners = &poly.corners;
        for edge in 0..corners.len() {
            let (from, to) = (corners[edge], corners[(edge + 1) % corners.len()]);
            edges.entry((from.min(to), from.max(to))).or_default().push((poly_index, edge, from, to));
        }
    }
    for owners in edges.values() {
        if let [(first, first_edge, first_from, first_to), (second, second_edge, second_from, second_to)] =
            owners.as_slice()
            && first_from == second_to
            && first_to == second_from
        {
            polys[*first].neighbours[*first_edge] = Some(*second);
            polys[*second].neighbours[*second_edge] = Some(*first);
        }
    }
}
