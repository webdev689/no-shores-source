//! How much of a sculpt's carving stands at a point (sculpts.rs): its claim's edge measured once a 32 m bucket, so a
//! bucket wholly in the claim or wholly past its fade reads 1 or 0 with no measuring, the same to the bit.

use crate::sculpts::{BUCKET_M, FADE_M, bucket, to_segment};

/// A sculpt's buckets over its reach, row by row from its north-west bucket: what the fade is in each.
#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct Fades {
    west: i64,
    north: i64,
    columns: i64,
    rows: i64,
    each: Vec<Fade>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Fade {
    Whole,
    None,
    Measured,
}

/// How far a point lies inside a claim (positive) or outside it (negative): in its ring, or in the wing that carries
/// it furthest.
pub(crate) fn inside_claim(ring: &[[f64; 2]], wings: &[[f64; 5]], x: f64, y: f64) -> f64 {
    wings.iter().fold(inside_ring(ring, x, y), |inside, &[x1, y1, x2, y2, half]| {
        inside.max(half - to_segment(x, y, [x1, y1], [x2, y2]))
    })
}

/// How far a point lies inside a ring (positive) or outside it (negative), by its nearest edge.
fn inside_ring(ring: &[[f64; 2]], x: f64, y: f64) -> f64 {
    let mut inside = false;
    let mut nearest = f64::INFINITY;
    for (at, &from) in ring.iter().enumerate() {
        let to = ring[(at + 1) % ring.len()];
        if (from[1] > y) != (to[1] > y) && x < from[0] + (y - from[1]) / (to[1] - from[1]) * (to[0] - from[0]) {
            inside = !inside;
        }
        nearest = nearest.min(to_segment(x, y, from, to));
    }
    if inside { nearest } else { -nearest }
}

impl Fades {
    /// A claim's buckets over its reach: a bucket whose middle lies further inside the claim than the bucket's half
    /// diagonal is wholly in it, and one further past it than the fade and that half diagonal is wholly past; there
    /// the fade is exactly 1 or 0, as `smooth` clamps it.
    pub(crate) fn of(claim: &[[f64; 2]], wings: &[[f64; 5]], [west, north, east, south]: [f64; 4]) -> Self {
        if claim.len() < 3 {
            return Self::default();
        }
        let (west, north) = (bucket(west), bucket(north));
        let (columns, rows) = (bucket(east) - west + 1, bucket(south) - north + 1);
        let half_diagonal = BUCKET_M * std::f64::consts::FRAC_1_SQRT_2 + 1e-6;
        let each = (0..rows)
            .flat_map(|row| (0..columns).map(move |column| (column, row)))
            .map(|(column, row)| {
                let x = ((west + column) as f64 + 0.5) * BUCKET_M;
                let y = ((north + row) as f64 + 0.5) * BUCKET_M;
                let inside = inside_claim(claim, wings, x, y);
                if inside > half_diagonal {
                    Fade::Whole
                } else if inside < -FADE_M - half_diagonal {
                    Fade::None
                } else {
                    Fade::Measured
                }
            })
            .collect();
        Self { west, north, columns, rows, each }
    }

    pub(crate) fn at(&self, x: f64, y: f64) -> Fade {
        let (column, row) = (bucket(x) - self.west, bucket(y) - self.north);
        if column < 0 || row < 0 || column >= self.columns || row >= self.rows {
            return Fade::Measured;
        }
        self.each[(row * self.columns + column) as usize]
    }
}
