//! The land a layout carves: round each patrol area's and instance's walkable network (its basins and the canyons
//! between them) the ground is raised into a massif whose faces fall in stepped cliffs to the network's floor, so the
//! layout's bounds are rock and its ways run through gorges; mesas and spires stand up inside its basins. A sculpt
//! only raises the land, never on the sea or within a strand's width of the coast, and fades back into the natural
//! land past its claim. Its maths is + - * /, square root and the exact noise, so every machine reads the same land.

use crate::exact::{fbm, smooth};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// How far a cliff runs out from the network's floor to its top, metres: steep enough that no body climbs it.
pub const CLIFF_RUN_M: f64 = 16.0;
/// The ledges a cliff's face steps in.
const STRATA: f64 = 4.0;
/// How far past its claim a sculpt fades back to the natural land, metres.
pub const FADE_M: f64 = 140.0;
/// How far inland from the painted coast the land is left as it is, metres: the strand.
const STRAND_M: f64 = 35.0;
/// How far a climb's edge runs from its level to the land beside it, metres.
const CLIMB_EDGE_M: f64 = 2.0;
/// A bucket's side, metres, for finding the shapes near a point.
const BUCKET_M: f64 = 32.0;
/// How much a floor's edge wanders out from its stated reach, as a share: never in, so what was placed stays on it.
const WANDER: f64 = 0.35;

/// One layout's sculpt: its claim (where it reaches fully), the floor of its network as capsules (a segment and its
/// half-width; a basin is a capsule of no length), the outcrops raised on that floor (`[x, y, radius, height]`), the
/// massif's height and its noise's seed, and its climbs: ways cut up the massif's faces and flats on its top, each a
/// capsule `[x1, y1, x2, y2, half, from, to]` whose level runs from `from` to `to` of the massif's height along it (0
/// the floor, 1 the top), a lookout one of no length.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Sculpt {
    pub claim: Vec<[f64; 2]>,
    pub floors: Vec<[f64; 5]>,
    pub outcrops: Vec<[f64; 4]>,
    pub rise: f64,
    pub seed: u32,
    #[serde(default)]
    pub climbs: Vec<[f64; 7]>,
}

/// The floors, the outcrops and the climbs near one bucket, by their places in a sculpt's lists.
type Near = (Vec<u32>, Vec<u32>, Vec<u32>);

/// Every sculpt on a ground, indexed by bucket so a point finds only the shapes near it.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(from = "Vec<Sculpt>", into = "Vec<Sculpt>")]
pub struct Sculpts {
    sculpts: Vec<Sculpt>,
    /// Each sculpt's reach: its claim's bounds and the fade past them.
    reaches: Vec<[f64; 4]>,
    /// Per sculpt, the floors and outcrops whose reach touches each bucket.
    near: Vec<BTreeMap<(i64, i64), Near>>,
}

fn bucket(value: f64) -> i64 {
    (value / BUCKET_M).floor() as i64
}

impl From<Vec<Sculpt>> for Sculpts {
    fn from(sculpts: Vec<Sculpt>) -> Self {
        let mut reaches = Vec::new();
        let mut near = Vec::new();
        for sculpt in &sculpts {
            let start = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
            let [west, north, east, south] = sculpt.claim.iter().fold(start, |[west, north, east, south], &[x, y]| {
                [west.min(x), north.min(y), east.max(x), south.max(y)]
            });
            reaches.push([west - FADE_M, north - FADE_M, east + FADE_M, south + FADE_M]);
            let mut map: BTreeMap<(i64, i64), Near> = BTreeMap::new();
            let mut spread = |bounds: [f64; 4], add: &mut dyn FnMut(&mut Near)| {
                for column in bucket(bounds[0])..=bucket(bounds[2]) {
                    for row in bucket(bounds[1])..=bucket(bounds[3]) {
                        add(map.entry((column, row)).or_default());
                    }
                }
            };
            for (number, &[x1, y1, x2, y2, half]) in sculpt.floors.iter().enumerate() {
                let reach = half * (1.0 + WANDER) + CLIFF_RUN_M;
                let bounds = [x1.min(x2) - reach, y1.min(y2) - reach, x1.max(x2) + reach, y1.max(y2) + reach];
                spread(bounds, &mut |entry| entry.0.push(number as u32));
            }
            for (number, &[x, y, radius, _]) in sculpt.outcrops.iter().enumerate() {
                let reach = radius * (1.0 + WANDER);
                spread([x - reach, y - reach, x + reach, y + reach], &mut |entry| entry.1.push(number as u32));
            }
            for (number, &[x1, y1, x2, y2, half, ..]) in sculpt.climbs.iter().enumerate() {
                let reach = half + CLIFF_RUN_M;
                let bounds = [x1.min(x2) - reach, y1.min(y2) - reach, x1.max(x2) + reach, y1.max(y2) + reach];
                spread(bounds, &mut |entry| entry.2.push(number as u32));
            }
            near.push(map);
        }
        Self { sculpts, reaches, near }
    }
}

impl From<Sculpts> for Vec<Sculpt> {
    fn from(sculpts: Sculpts) -> Self {
        sculpts.sculpts
    }
}

/// The distance from a point to a segment.
fn to_segment(x: f64, y: f64, from: [f64; 2], to: [f64; 2]) -> f64 {
    along_segment(x, y, from, to).0
}

/// The distance from a point to a segment, and how far along it (0 to 1) its nearest point lies.
fn along_segment(x: f64, y: f64, from: [f64; 2], to: [f64; 2]) -> (f64, f64) {
    let (span_x, span_y) = (to[0] - from[0], to[1] - from[1]);
    let length = span_x * span_x + span_y * span_y;
    let along =
        if length > 0.0 { (((x - from[0]) * span_x + (y - from[1]) * span_y) / length).clamp(0.0, 1.0) } else { 0.0 };
    let (dx, dy) = (x - from[0] - span_x * along, y - from[1] - span_y * along);
    ((dx * dx + dy * dy).sqrt(), along)
}

/// A cliff's face over `off` metres from its foot, as a share of its height: in ledges, each stratum level, then a
/// short steep rise to the next.
fn face(off: f64) -> f64 {
    let climbed = smooth(0.0, 1.0, off / CLIFF_RUN_M) * STRATA;
    let stratum = climbed.floor();
    (stratum + smooth(0.55, 1.0, climbed - stratum)) / STRATA
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

impl Sculpts {
    /// Whether no sculpt stands on the ground.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.sculpts.is_empty()
    }

    /// The sculpts reaching into a rect (west, north, east, south), for a window of the ground.
    #[must_use]
    pub fn within(&self, west: f64, north: f64, east: f64, south: f64) -> Self {
        let kept: Vec<Sculpt> = self
            .sculpts
            .iter()
            .zip(&self.reaches)
            .filter(|(_, reach)| reach[0] <= east && reach[2] >= west && reach[1] <= south && reach[3] >= north)
            .map(|(sculpt, _)| sculpt.clone())
            .collect();
        Self::from(kept)
    }

    /// How far below the network's floor's edge a point lies, metres (negative on the floor), for a sculpt, and the
    /// floors' wander there; infinity where no floor is near.
    fn off_floor(&self, number: usize, x: f64, y: f64) -> f64 {
        let sculpt = &self.sculpts[number];
        let Some((floors, _, _)) = self.near[number].get(&(bucket(x), bucket(y))) else { return f64::INFINITY };
        let wander = 1.0 + WANDER * (0.5 + 0.5 * fbm(sculpt.seed, x / 70.0, y / 70.0, 2));
        floors
            .iter()
            .map(|&floor| {
                let [x1, y1, x2, y2, half] = sculpt.floors[floor as usize];
                to_segment(x, y, [x1, y1], [x2, y2]) - half * wander
            })
            .fold(f64::INFINITY, f64::min)
    }

    /// How far a point lies off the nearest climb of a sculpt (metres, negative on it), and that climb's level there
    /// as a share of the massif's height; infinity where none is near.
    fn off_climb(&self, number: usize, x: f64, y: f64) -> (f64, f64) {
        let sculpt = &self.sculpts[number];
        let Some((_, _, climbs)) = self.near[number].get(&(bucket(x), bucket(y))) else {
            return (f64::INFINITY, 1.0);
        };
        climbs
            .iter()
            .map(|&climb| {
                let [x1, y1, x2, y2, half, from, to] = sculpt.climbs[climb as usize];
                let (distance, along) = along_segment(x, y, [x1, y1], [x2, y2]);
                (distance - half, from + (to - from) * along)
            })
            .fold((f64::INFINITY, 1.0), |nearest, each| if each.0 < nearest.0 { each } else { nearest })
    }

    /// How far a point lies off the nearest sculpt's floor or climb, metres: negative on it, infinity far from any.
    #[must_use]
    pub fn floor_distance(&self, x: f64, y: f64) -> f64 {
        (0..self.sculpts.len())
            .filter(|&number| {
                let reach = self.reaches[number];
                x >= reach[0] && x <= reach[2] && y >= reach[1] && y <= reach[3]
            })
            .map(|number| self.off_floor(number, x, y).min(self.off_climb(number, x, y).0))
            .fold(f64::INFINITY, f64::min)
    }

    /// Whether a point lies on a sculpt's floor: where its layout's network runs.
    #[must_use]
    pub fn on_floor(&self, x: f64, y: f64) -> bool {
        self.floor_distance(x, y) <= 0.0
    }

    /// How far the sculpts raise the land at a point, metres; `coast` is its distance from the painted coast, positive
    /// on land, and no sculpt raises the strand or the sea.
    #[must_use]
    pub fn raise(&self, x: f64, y: f64, coast: f64) -> f64 {
        if coast <= 0.0 || self.sculpts.is_empty() {
            return 0.0;
        }
        let mut raised: f64 = 0.0;
        for (number, sculpt) in self.sculpts.iter().enumerate() {
            let reach = self.reaches[number];
            if x < reach[0] || x > reach[2] || y < reach[1] || y > reach[3] {
                continue;
            }
            let fade = smooth(-FADE_M, 0.0, inside_ring(&sculpt.claim, x, y));
            if fade <= 0.0 {
                continue;
            }
            let off = self.off_floor(number, x, y);
            let rise = sculpt.rise * (0.7 + 0.45 * (0.5 + 0.5 * fbm(sculpt.seed ^ 0x51, x / 230.0, y / 230.0, 3)));
            let mut height = 0.0;
            if off > 0.0 {
                // A face in ledges up to the top's roughness.
                let stepped = face(off);
                let rough =
                    4.0 * fbm(sculpt.seed ^ 0x77, x / 48.0, y / 48.0, 3) * smooth(0.0, 1.0, off / (2.0 * CLIFF_RUN_M));
                height = rise * stepped + rough.max(-2.0) * stepped;
            }
            // A climb is cut into the massif at its own level, its own face rising from it to the top: the land is
            // the lower of the two, so a way up runs along the cliff with a drop on its floor's side.
            let (off_climb, share) = self.off_climb(number, x, y);
            if off_climb.is_finite() {
                let level = rise * share;
                // On the climb the land is its level, an embankment where the floor's face runs lower; off it, over
                // a couple of metres, whichever face is lower.
                let beside = height.min(level + (rise - level) * face(off_climb.max(0.0)));
                height = level + (beside - level) * smooth(0.0, CLIMB_EDGE_M, off_climb);
            }
            if let Some((_, outcrops, _)) = self.near[number].get(&(bucket(x), bucket(y))) {
                for &outcrop in outcrops {
                    let [middle_x, middle_y, radius, tall] = sculpt.outcrops[outcrop as usize];
                    let wander = 1.0 + WANDER * (0.5 + 0.5 * fbm(sculpt.seed ^ outcrop, x / 9.0, y / 9.0, 2));
                    let out = ((x - middle_x) * (x - middle_x) + (y - middle_y) * (y - middle_y)).sqrt() / wander;
                    let mesa = 1.0 - smooth(radius * 0.7, radius, out);
                    let band = (mesa * 3.0).floor();
                    height = height.max(tall * (band + smooth(0.6, 1.0, mesa * 3.0 - band)) / 3.0);
                }
            }
            raised = raised.max(height * fade * smooth(0.0, STRAND_M, coast));
        }
        raised
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sculpt() -> Sculpts {
        let claim = vec![[-500.0, -500.0], [500.0, -500.0], [500.0, 500.0], [-500.0, 500.0]];
        Sculpts::from(vec![Sculpt {
            claim,
            floors: vec![[0.0, 0.0, 0.0, 0.0, 60.0], [0.0, 0.0, 300.0, 0.0, 12.0]],
            outcrops: vec![[20.0, 20.0, 10.0, 12.0]],
            rise: 30.0,
            seed: 7,
            climbs: vec![[60.0, -40.0, 180.0, -40.0, 4.0, 0.0, 1.0], [180.0, -40.0, 180.0, -40.0, 10.0, 1.0, 1.0]],
        }])
    }

    #[test]
    fn the_floor_is_left_and_the_land_round_it_rises_to_cliffs() {
        let sculpts = sculpt();
        assert_eq!(sculpts.raise(-30.0, -30.0, 1000.0), 0.0, "a basin's floor is its own land");
        assert_eq!(sculpts.raise(200.0, 0.0, 1000.0), 0.0, "a canyon's floor too");
        let top = sculpts.raise(200.0, 120.0, 1000.0);
        assert!(top > 15.0, "the massif stands well over the floor: {top}");
        assert!(sculpts.on_floor(200.0, 0.0) && !sculpts.on_floor(200.0, 120.0));
    }

    #[test]
    fn an_outcrop_stands_on_the_floor_and_nothing_rises_on_the_strand() {
        let sculpts = sculpt();
        assert!(sculpts.raise(20.0, 20.0, 1000.0) > 10.0, "a mesa's top");
        assert_eq!(sculpts.raise(200.0, 120.0, -5.0), 0.0, "the sea is never raised");
        assert!(sculpts.raise(200.0, 120.0, 10.0) < sculpts.raise(200.0, 120.0, 1000.0), "the strand eases");
    }

    #[test]
    fn a_climb_rises_along_the_cliff_from_the_floor_to_a_lookout_on_the_top() {
        let sculpts = sculpt();
        let [start, middle, end] = [62.0, 120.0, 180.0].map(|x| sculpts.raise(x, -40.0, 1000.0));
        assert!(start < 3.0 && middle > start + 5.0 && end > middle + 5.0, "it climbs: {start} {middle} {end}");
        assert!(sculpts.raise(120.0, -80.0, 1000.0) > middle + 5.0, "the massif stands over it beyond");
        assert!(sculpts.floor_distance(120.0, -40.0) < 0.0 && sculpts.floor_distance(185.0, -45.0) < 0.0);
        let lookout = [176.0, 184.0].map(|x| sculpts.raise(x, -36.0, 1000.0));
        assert!((lookout[0] - lookout[1]).abs() < 1.0, "the lookout is flat: {lookout:?}");
    }

    #[test]
    fn far_past_the_claim_the_land_is_as_it_was() {
        assert_eq!(sculpt().raise(900.0, 0.0, 1000.0), 0.0);
    }

    #[test]
    fn a_window_keeps_the_sculpts_it_reaches() {
        let sculpts = sculpt();
        assert!(!sculpts.within(0.0, 0.0, 10.0, 10.0).is_empty());
        assert!(sculpts.within(5000.0, 5000.0, 5010.0, 5010.0).is_empty());
    }
}
