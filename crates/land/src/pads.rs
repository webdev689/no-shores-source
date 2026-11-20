//! Levels a city sets the land to: rectangles of ground made flat at a level, a terrace each, the later standing over
//! the earlier where they overlap. The ground reads them before its own relief, so a terrace is flat to the bit on the
//! server and in every browser; past its edge the land blends into it within `EDGE_M`, and where two pads meet each
//! blends to their middle, so a lip a body would step is a slope it walks, and a terrace standing higher is still a
//! step the city walls.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// The side of the index's buckets, metres: about a city block.
const BUCKET_M: f64 = 128.0;
/// How far past a pad's edge the land blends into its level, metres.
pub const EDGE_M: f64 = 1.0;

/// One pad: west, north, east and south edges, metres, and its level.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Pad {
    pub bounds: [f64; 4],
    pub level: f64,
}

/// A landmass's pads, indexed so a point finds the ones over it quickly. The index is rebuilt, never stored.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(from = "Vec<Pad>", into = "Vec<Pad>")]
pub struct Pads {
    pads: Vec<Pad>,
    index: BTreeMap<(i64, i64), Vec<usize>>,
}

fn bucket(value: f64) -> i64 {
    (value / BUCKET_M).floor() as i64
}

/// How far past a seam the pad across it is read, metres: past the edge, short of any other.
const PAST_M: f64 = 1e-3;

/// Whether a pad's bounds (west, north, east, south) hold a point, edges included.
fn holds([west, north, east, south]: [f64; 4], x: f64, y: f64) -> bool {
    x >= west && x <= east && y >= north && y <= south
}

impl From<Vec<Pad>> for Pads {
    fn from(pads: Vec<Pad>) -> Self {
        let mut index: BTreeMap<(i64, i64), Vec<usize>> = BTreeMap::new();
        for (at, pad) in pads.iter().enumerate() {
            for column in bucket(pad.bounds[0])..=bucket(pad.bounds[2]) {
                for row in bucket(pad.bounds[1])..=bucket(pad.bounds[3]) {
                    index.entry((column, row)).or_default().push(at);
                }
            }
        }
        Self { pads, index }
    }
}

impl From<Pads> for Vec<Pad> {
    fn from(pads: Pads) -> Self {
        pads.pads
    }
}

impl Pads {
    /// The level of the last pad holding a point, edges included, or None where no pad lies.
    #[must_use]
    pub fn level_at(&self, x: f64, y: f64) -> Option<f64> {
        self.top_at(x, y).map(|at| self.pads[at].level)
    }

    /// The index of the last pad holding a point, edges included, or None where no pad lies.
    fn top_at(&self, x: f64, y: f64) -> Option<usize> {
        let holding = self.index.get(&(bucket(x), bucket(y)))?;
        holding.iter().rev().copied().find(|&at| holds(self.pads[at].bounds, x, y))
    }

    /// The nearest seam a point sees within `EDGE_M`, where the pad on top changes, and the level across it: its own
    /// pad's edge with another pad on top past it, or the edge of a later pad (on land, of any pad) it stands just off.
    /// A pad hidden under a later one shows no seam, nor does a pad's edge with the land past it, which the land blends
    /// up to.
    #[must_use]
    pub fn seam_near(&self, x: f64, y: f64) -> Option<(f64, f64)> {
        let top = self.top_at(x, y);
        let mut nearest: Option<(f64, f64)> = None;
        let mut take = |level: f64, off: f64| {
            if off <= EDGE_M && nearest.is_none_or(|(_, best)| off < best) {
                nearest = Some((level, off));
            }
        };
        // Its own pad's nearest edge, and what lies on top just past it.
        if let Some(own) = top {
            let [west, north, east, south] = self.pads[own].bounds;
            let sides =
                [(x - west, [-1.0, 0.0]), (east - x, [1.0, 0.0]), (y - north, [0.0, -1.0]), (south - y, [0.0, 1.0])];
            let (off, out) = sides
                .into_iter()
                .fold((f64::INFINITY, [0.0, 0.0]), |best, side| if side.0 < best.0 { side } else { best });
            let past = |reach: f64| [x + out[0] * reach, y + out[1] * reach];
            let [past_x, past_y] = past(off + PAST_M);
            if let Some(across) = self.top_at(past_x, past_y).filter(|&across| across != own) {
                take(self.pads[across].level, off);
            }
        }
        // A later pad's edge just off the point, and what lies on top just inside it.
        for column in bucket(x - EDGE_M)..=bucket(x + EDGE_M) {
            for row in bucket(y - EDGE_M)..=bucket(y + EDGE_M) {
                for &at in self.index.get(&(column, row)).into_iter().flatten() {
                    if top.is_some_and(|own| at <= own) {
                        continue;
                    }
                    let [west, north, east, south] = self.pads[at].bounds;
                    let (across, down) = ((west - x).max(x - east).max(0.0), (north - y).max(y - south).max(0.0));
                    let off = (across * across + down * down).sqrt();
                    if off <= 0.0 || off > EDGE_M {
                        continue;
                    }
                    // Just inside its edge, nearest the point.
                    let inside_x =
                        x.clamp(west + PAST_M.min((east - west) / 2.0), east - PAST_M.min((east - west) / 2.0));
                    let inside_y =
                        y.clamp(north + PAST_M.min((south - north) / 2.0), south - PAST_M.min((south - north) / 2.0));
                    if let Some(shown) = self.top_at(inside_x, inside_y) {
                        take(self.pads[shown].level, off);
                    }
                }
            }
        }
        nearest
    }

    /// The pads reaching into a rectangle (west, north, east, south), in their order.
    #[must_use]
    pub fn within(&self, west: f64, north: f64, east: f64, south: f64) -> Self {
        let kept = self
            .pads
            .iter()
            .filter(|pad| {
                pad.bounds[0] <= east && pad.bounds[2] >= west && pad.bounds[1] <= south && pad.bounds[3] >= north
            })
            .copied()
            .collect::<Vec<_>>();
        Self::from(kept)
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.pads.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pads() -> Pads {
        Pads::from(vec![
            Pad { bounds: [0.0, 0.0, 102.4, 102.4], level: 12.0 },
            Pad { bounds: [50.0, 50.0, 150.0, 150.0], level: 20.0 },
        ])
    }

    #[test]
    fn a_point_on_a_pad_takes_its_level_and_the_later_pad_wins() {
        let pads = pads();
        assert_eq!(pads.level_at(10.0, 10.0), Some(12.0));
        assert_eq!(pads.level_at(60.0, 60.0), Some(20.0));
        assert_eq!(pads.level_at(140.0, 140.0), Some(20.0));
        assert_eq!(pads.level_at(140.0, 10.0), None);
        assert_eq!(pads.level_at(-1.0, 10.0), None);
    }

    #[test]
    fn a_point_just_off_a_pad_finds_its_edge_and_one_further_off_none() {
        let pads = pads();
        assert_eq!(pads.seam_near(-0.5, 10.0), Some((12.0, 0.5)));
        assert_eq!(pads.seam_near(155.0, 100.0).map(|(level, _)| level), None, "5 m off");
        assert!(pads.seam_near(150.6, 100.0).is_some_and(|(level, off)| level == 20.0 && (off - 0.6).abs() < 1e-9));
        // Where the later pad lies over the earlier, its edge is the seam, seen from both sides.
        assert_eq!(pads.seam_near(49.5, 60.0), Some((20.0, 0.5)));
        assert!(pads.seam_near(50.5, 60.0).is_some_and(|(level, off)| level == 12.0 && (off - 0.5).abs() < 1e-9));
        assert_eq!(pads.seam_near(103.0, 60.0), None, "inside the later pad, the earlier's hidden edge shows nothing");
    }

    #[test]
    fn a_seam_shows_only_where_the_pad_on_top_changes() {
        // Two cells side by side, a plaza laid over the seam between them, later.
        let pads = Pads::from(vec![
            Pad { bounds: [0.0, 0.0, 100.0, 100.0], level: 0.0 },
            Pad { bounds: [100.0, 0.0, 200.0, 100.0], level: 2.0 },
            Pad { bounds: [20.0, 20.0, 180.0, 80.0], level: 14.0 },
        ]);
        assert_eq!(pads.seam_near(100.5, 50.0), None, "the cells' seam lies hidden under the plaza");
        assert_eq!(pads.seam_near(99.5, 50.0), None);
        // On a cell just off the plaza's edge, the plaza's edge shows; on the plaza just inside it, the cell's level.
        assert!(pads.seam_near(19.5, 50.0).is_some_and(|(level, off)| level == 14.0 && (off - 0.5).abs() < 1e-9));
        assert!(pads.seam_near(20.5, 50.0).is_some_and(|(level, off)| level == 0.0 && (off - 0.5).abs() < 1e-9));
        // Where the two cells meet past the plaza, each shows the other.
        assert_eq!(pads.seam_near(99.5, 90.0), Some((2.0, 0.5)));
        assert_eq!(pads.seam_near(100.5, 90.0), Some((0.0, 0.5)));
        // A pad's edge with the land past it shows nothing from on the pad.
        assert_eq!(pads.seam_near(199.5, 90.0), None);
    }

    #[test]
    fn pads_keep_their_order_through_their_written_form() {
        let text = serde_json::to_string(&pads()).unwrap();
        let back: Pads = serde_json::from_str(&text).unwrap();
        assert_eq!(back, pads());
        assert_eq!(back.level_at(60.0, 60.0), Some(20.0));
    }

    #[test]
    fn a_window_keeps_only_the_pads_reaching_into_it() {
        let kept = pads().within(120.0, 120.0, 200.0, 200.0);
        assert_eq!(kept.level_at(140.0, 140.0), Some(20.0));
        assert_eq!(kept.level_at(10.0, 10.0), None);
    }
}
