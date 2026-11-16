//! The baked mesh and the query every other one starts from: which poly a point stands on. Polys are bucketed by
//! their bounds on a coarse grid, so a query reads only the few near the point.

use crate::poly::{Corner, Poly};

/// Grid cells to a bucket's side.
const BUCKET: f64 = 8.0;
/// How far off every poly, in cells, a point still snaps onto the nearest: the eroded margin by a wall.
const SNAP: f64 = 2.0;

/// The polys by bucket, each list in ascending poly order, so the first-inside and nearest tie-breaks are a full
/// scan's.
#[derive(Clone, Debug, PartialEq)]
struct Index {
    min_x: f64,
    min_y: f64,
    columns: usize,
    rows: usize,
    buckets: Vec<Vec<usize>>,
}

impl Index {
    fn bucket(&self, value: f64, origin: f64, count: usize) -> usize {
        (((value - origin) / BUCKET).floor().max(0.0) as usize).min(count - 1)
    }
}

/// The mesh in grid units: corners, convex polys, each poly's level (the mean height of its corners) and centre.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Mesh {
    pub corners: Vec<Corner>,
    pub polys: Vec<Poly>,
    pub levels: Vec<f64>,
    pub centres: Vec<(f64, f64)>,
    index: Option<Index>,
}

impl Mesh {
    pub fn new(corners: Vec<Corner>, polys: Vec<Poly>) -> Self {
        let mean = |poly: &Poly, value: fn(&Corner) -> f64| {
            poly.corners.iter().map(|&corner| value(&corners[corner])).sum::<f64>() / poly.corners.len() as f64
        };
        let levels = polys.iter().map(|poly| mean(poly, |corner| corner.z)).collect();
        let centres = polys.iter().map(|poly| (mean(poly, |corner| corner.x), mean(poly, |corner| corner.y))).collect();
        let index = build_index(&corners, &polys);
        Self { corners, polys, levels, centres, index }
    }

    /// A poly's corner as a grid point (x, y).
    pub fn corner(&self, poly: usize, at: usize) -> (f64, f64) {
        let corners = &self.polys[poly].corners;
        let corner = self.corners[corners[at % corners.len()]];
        (corner.x, corner.y)
    }

    /// The poly under a grid point: of those holding it, the one whose level is nearest `height` (the first, with no
    /// height); else the nearest within the snap.
    pub fn locate(&self, x: f64, y: f64, height: Option<f64>) -> Option<usize> {
        let Some(index) = &self.index else { return self.scan(x, y, 0..self.polys.len(), height) };
        let first_x = index.bucket(x - SNAP, index.min_x, index.columns);
        let last_x = index.bucket(x + SNAP, index.min_x, index.columns);
        let first_y = index.bucket(y - SNAP, index.min_y, index.rows);
        let last_y = index.bucket(y + SNAP, index.min_y, index.rows);
        let mut candidates: Vec<usize> = (first_y..=last_y)
            .flat_map(|row| (first_x..=last_x).flat_map(move |column| &index.buckets[row * index.columns + column]))
            .copied()
            .collect();
        candidates.sort_unstable();
        candidates.dedup();
        self.scan(x, y, candidates.into_iter(), height)
    }

    /// The locate's kernel over a list of candidate polys, taken in the list's order.
    pub fn scan(&self, x: f64, y: f64, candidates: impl Iterator<Item = usize>, height: Option<f64>) -> Option<usize> {
        let mut nearest = None;
        let mut nearest_dist = f64::INFINITY;
        let mut on_level = None;
        let mut level_off = f64::INFINITY;
        for poly in candidates {
            let count = self.polys[poly].corners.len();
            let mut inside = true;
            let mut dist = f64::INFINITY;
            for at in 0..count {
                let (a, b) = (self.corner(poly, at), self.corner(poly, at + 1));
                if (b.0 - a.0) * (y - a.1) - (x - a.0) * (b.1 - a.1) < -1e-6 {
                    inside = false;
                }
                let (dx, dy) = (b.0 - a.0, b.1 - a.1);
                let length_sq = dx * dx + dy * dy;
                let t = if length_sq > 0.0 { ((x - a.0) * dx + (y - a.1) * dy) / length_sq } else { 0.0 };
                let t = t.clamp(0.0, 1.0);
                dist = dist.min(libm::hypot(x - (a.0 + t * dx), y - (a.1 + t * dy)));
            }
            if inside {
                let Some(height) = height else { return Some(poly) };
                let off = (self.levels[poly] - height).abs();
                if off < level_off {
                    level_off = off;
                    on_level = Some(poly);
                }
                continue;
            }
            if dist < nearest_dist {
                nearest_dist = dist;
                nearest = Some(poly);
            }
        }
        on_level.or(if nearest_dist <= SNAP { nearest } else { None })
    }
}

fn build_index(corners: &[Corner], polys: &[Poly]) -> Option<Index> {
    if corners.is_empty() {
        return None;
    }
    let bounds = |points: &mut dyn Iterator<Item = &Corner>| {
        points.fold([f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY], |found, corner| {
            [found[0].min(corner.x), found[1].min(corner.y), found[2].max(corner.x), found[3].max(corner.y)]
        })
    };
    let [min_x, min_y, max_x, max_y] = bounds(&mut corners.iter());
    let columns = ((max_x - min_x) / BUCKET).ceil().max(1.0) as usize;
    let rows = ((max_y - min_y) / BUCKET).ceil().max(1.0) as usize;
    let mut index = Index { min_x, min_y, columns, rows, buckets: vec![Vec::new(); columns * rows] };
    for (poly_index, poly) in polys.iter().enumerate() {
        let [low_x, low_y, high_x, high_y] = bounds(&mut poly.corners.iter().map(|&corner| &corners[corner]));
        let (first_x, last_x) = (index.bucket(low_x, min_x, columns), index.bucket(high_x, min_x, columns));
        let (first_y, last_y) = (index.bucket(low_y, min_y, rows), index.bucket(high_y, min_y, rows));
        for row in first_y..=last_y {
            for column in first_x..=last_x {
                index.buckets[row * columns + column].push(poly_index);
            }
        }
    }
    Some(index)
}
