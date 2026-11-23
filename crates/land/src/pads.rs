//! Levels a city sets the land to: rectangles of ground made flat at a level, a terrace each, or sloped from one level
//! to another, a ramp, the later standing over the earlier where they overlap. The ground reads them before its own
//! relief, so a terrace is flat to the bit on the server and in every browser; past its edge the land blends into it
//! within `EDGE_M`, and where two pads meet within `BLEND_MOST_M` of each other each blends to their middle, so a lip
//! a body would step is a slope it walks; a terrace standing higher keeps its level to its edge, where the city walls
//! it.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// The side of the index's buckets, metres: about a city block.
const BUCKET_M: f64 = 128.0;
/// How far past a pad's edge the land blends into its level, metres.
pub const EDGE_M: f64 = 1.0;
/// The highest seam between two pads blended into a slope, metres: a body's step (the movement crate's `step`). A
/// higher one is a wall's, and blending it would sink the floor beside the wall, where a body falls in.
pub const BLEND_MOST_M: f64 = 0.5;

/// One pad: west, north, east and south edges, metres, and its level; a sloped pad (a ramp) falls from that level at
/// its west or north edge to a second level at its east or south edge. A level pad writes no fall at all.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Pad {
    pub bounds: [f64; 4],
    pub level: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fall: Option<Fall>,
}

/// Which way a sloped pad falls, and the level it reaches at that far edge, metres.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Fall {
    East(f64),
    South(f64),
}

impl Pad {
    /// A level pad.
    #[must_use]
    pub const fn flat(bounds: [f64; 4], level: f64) -> Self {
        Self { bounds, level, fall: None }
    }

    /// Its level at a point, the slope held to its bounds so a point just past an edge reads that edge's level.
    #[must_use]
    pub fn level_at(&self, x: f64, y: f64) -> f64 {
        let [west, north, east, south] = self.bounds;
        let (to, from, along, span) = match self.fall {
            None => return self.level,
            Some(Fall::East(to)) => (to, west, x, east - west),
            Some(Fall::South(to)) => (to, north, y, south - north),
        };
        // A pad with no length along its fall stands at its first level, never at a level divided by nothing.
        let share = if span > 0.0 { ((along - from) / span).clamp(0.0, 1.0) } else { 0.0 };
        self.level + (to - self.level) * share
    }
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
        self.top_at(x, y).map(|at| self.pads[at].level_at(x, y))
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
        // Each of its own pad's edges within reach (near a corner, two), and what lies on top just past it.
        if let Some(own) = top {
            let [west, north, east, south] = self.pads[own].bounds;
            let sides =
                [(x - west, [-1.0, 0.0]), (east - x, [1.0, 0.0]), (y - north, [0.0, -1.0]), (south - y, [0.0, 1.0])];
            for (off, out) in sides.into_iter().filter(|&(off, _)| off <= EDGE_M) {
                let past = [x + out[0] * (off + PAST_M), y + out[1] * (off + PAST_M)];
                if let Some(across) = self.top_at(past[0], past[1]).filter(|&across| across != own) {
                    take(self.pads[across].level_at(past[0], past[1]), off);
                }
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
                        take(self.pads[shown].level_at(inside_x, inside_y), off);
                    }
                }
            }
        }
        nearest
    }

    /// The pads that set the ground's height anywhere in a rectangle (west, north, east, south), in their order: those
    /// reaching into it, and those within a seam's reach past it (`seam_near`), whose edges the land there blends to.
    #[must_use]
    pub fn within(&self, west: f64, north: f64, east: f64, south: f64) -> Self {
        let reach = EDGE_M + PAST_M;
        let (west, north, east, south) = (west - reach, north - reach, east + reach, south + reach);
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
        Pads::from(vec![Pad::flat([0.0, 0.0, 102.4, 102.4], 12.0), Pad::flat([50.0, 50.0, 150.0, 150.0], 20.0)])
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
    fn near_a_pads_corner_the_seam_with_an_earlier_pad_shows_though_land_is_nearer() {
        // B, then A laid after it touching its east side; a point in A's north-west corner, 0.3 m from A's open
        // north edge and 0.6 m from its west edge on B.
        let pads = Pads::from(vec![Pad::flat([0.0, 0.0, 10.0, 10.0], 4.0), Pad::flat([10.0, 2.0, 20.0, 12.0], 6.0)]);
        assert!(pads.seam_near(10.6, 2.3).is_some_and(|(level, off)| level == 4.0 && (off - 0.6).abs() < 1e-9));
    }

    #[test]
    fn a_seam_shows_only_where_the_pad_on_top_changes() {
        // Two cells side by side, a plaza laid over the seam between them, later.
        let pads = Pads::from(vec![
            Pad::flat([0.0, 0.0, 100.0, 100.0], 0.0),
            Pad::flat([100.0, 0.0, 200.0, 100.0], 2.0),
            Pad::flat([20.0, 20.0, 180.0, 80.0], 14.0),
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

    /// A cell at 10 m, a ramp laid after it falling south from 10 m to 4 m across its northern half, and the cell
    /// south of it at 4 m.
    fn ramped() -> Pads {
        Pads::from(vec![
            Pad::flat([0.0, 0.0, 100.0, 100.0], 10.0),
            Pad::flat([0.0, 100.0, 100.0, 200.0], 4.0),
            Pad { fall: Some(Fall::South(4.0)), ..Pad::flat([40.0, 70.0, 60.0, 130.0], 10.0) },
        ])
    }

    #[test]
    fn a_sloped_pad_with_no_length_along_its_fall_stands_at_its_level() {
        let flat_east = Pad { bounds: [10.0, 0.0, 10.0, 5.0], level: 3.0, fall: Some(Fall::East(7.0)) };
        let flat_south = Pad { bounds: [0.0, 4.0, 5.0, 4.0], level: 3.0, fall: Some(Fall::South(7.0)) };
        assert_eq!((flat_east.level_at(10.0, 2.0), flat_south.level_at(2.0, 4.0)), (3.0, 3.0));
    }

    #[test]
    fn a_sloped_pad_falls_from_its_level_to_its_second_across_its_bounds() {
        let pads = ramped();
        assert_eq!(pads.level_at(50.0, 70.0), Some(10.0));
        assert_eq!(pads.level_at(50.0, 100.0), Some(7.0));
        assert_eq!(pads.level_at(50.0, 130.0), Some(4.0));
        assert_eq!(pads.level_at(45.0, 85.0), Some(8.5));
        let east = Pad { fall: Some(Fall::East(2.0)), ..Pad::flat([0.0, 0.0, 10.0, 4.0], 12.0) };
        assert_eq!(east.level_at(5.0, 1.0), 7.0);
        assert_eq!(east.level_at(10.0, 1.0), 2.0);
    }

    #[test]
    fn across_a_sloped_pads_seam_each_side_reads_the_others_level_where_it_meets() {
        let pads = ramped();
        // On the cell just west of the ramp, the ramp's level beside the point; on the ramp, the cell's.
        let beside = pads.seam_near(39.5, 85.0).expect("the ramp's west edge");
        assert!((beside.0 - 8.5).abs() < 1e-12 && (beside.1 - 0.5).abs() < 1e-12, "{beside:?}");
        let on = pads.seam_near(40.5, 85.0).expect("the cell past the ramp's edge");
        assert!((on.0 - 10.0).abs() < 1e-12 && (on.1 - 0.5).abs() < 1e-12, "{on:?}");
        // At the ramp's top and foot the cells meet it level, so the seam there is no step.
        let top = pads.seam_near(50.0, 70.5).expect("the ramp's top");
        assert!((top.0 - 10.0).abs() < 1e-12, "{top:?}");
        let foot = pads.seam_near(50.0, 130.5).expect("past the ramp's foot");
        assert!((foot.0 - 4.0).abs() < 1e-3, "{foot:?}");
        let window = pads.within(41.0, 80.0, 45.0, 90.0);
        assert_eq!(window.level_at(42.0, 87.5), pads.level_at(42.0, 87.5), "a window on it reads its slope");
        assert_eq!(window.level_at(42.0, 87.5), Some(8.25));
    }

    #[test]
    fn a_level_pad_writes_as_it_always_has_and_a_sloped_one_names_its_fall() {
        let text = serde_json::to_string(&Pad::flat([0.0, 1.0, 2.0, 3.0], 4.5)).unwrap();
        assert_eq!(text, r#"{"bounds":[0.0,1.0,2.0,3.0],"level":4.5}"#);
        let sloped: Pad = serde_json::from_str(r#"{"bounds":[0,0,10,4],"level":12,"fall":{"east":2}}"#).unwrap();
        assert_eq!(sloped.fall, Some(Fall::East(2.0)));
        let back: Pads = serde_json::from_str(&serde_json::to_string(&ramped()).unwrap()).unwrap();
        assert_eq!(back, ramped());
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
        // A pad just past the window's edge still blends the land inside it, so the window keeps it.
        let near = pads().within(151.0, 100.0, 200.0, 200.0);
        assert_eq!(near.seam_near(151.0, 120.0), pads().seam_near(151.0, 120.0));
        assert!(near.seam_near(151.0, 120.0).is_some());
    }
}
