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
        let holding = self.index.get(&(bucket(x), bucket(y)))?;
        holding
            .iter()
            .rev()
            .map(|&at| self.pads[at])
            .find(|pad| x >= pad.bounds[0] && x <= pad.bounds[2] && y >= pad.bounds[1] && y <= pad.bounds[3])
            .map(|pad| pad.level)
    }

    /// The nearest pad within `EDGE_M` of a point that does not hold it: its level and how far the point lies off its
    /// edge.
    #[must_use]
    pub fn edge_near(&self, x: f64, y: f64) -> Option<(f64, f64)> {
        let mut nearest: Option<(f64, f64)> = None;
        for column in bucket(x - EDGE_M)..=bucket(x + EDGE_M) {
            for row in bucket(y - EDGE_M)..=bucket(y + EDGE_M) {
                for &at in self.index.get(&(column, row)).into_iter().flatten() {
                    let [west, north, east, south] = self.pads[at].bounds;
                    let (across, down) = ((west - x).max(x - east).max(0.0), (north - y).max(y - south).max(0.0));
                    let off = (across * across + down * down).sqrt();
                    if off > 0.0 && off <= EDGE_M && nearest.is_none_or(|(_, best)| off < best) {
                        nearest = Some((self.pads[at].level, off));
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
        assert_eq!(pads.edge_near(-0.5, 10.0), Some((12.0, 0.5)));
        assert_eq!(pads.edge_near(155.0, 100.0).map(|(level, _)| level), None, "5 m off");
        assert!(pads.edge_near(150.6, 100.0).is_some_and(|(level, off)| level == 20.0 && (off - 0.6).abs() < 1e-9));
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
