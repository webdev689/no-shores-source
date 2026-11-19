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
/// How far past the nearest of a climb's or run's capsules another still sways its level, metres.
const RUN_BLEND_M: f64 = 3.0;
/// A bucket's side, metres, for finding the shapes near a point.
const BUCKET_M: f64 = 32.0;
/// How much a floor's edge wanders out from its stated reach, as a share: never in, so what was placed stays on it.
const WANDER: f64 = 0.35;
/// The highest a floor's ceiling stands, metres: over any massif, and finite so a level blended under it stays a number.
const CEILING_M: f64 = 1000.0;
/// How far a floor reaches past its edge for its top's roughness and the ceiling it sets on other sculpts, metres:
/// three cliffs' runs, where its ceiling stands at three times its massif's height, over the top of any neighbour of
/// the same height (a landmass's sculpts share one).
const FLOOR_REACH_M: f64 = 3.0 * CLIFF_RUN_M;

/// One layout's sculpt: its claim (where it reaches fully), the floor of its network as capsules (a segment and its
/// half-width; a basin is a capsule of no length), the outcrops raised on that floor (`[x, y, radius, height]`), the
/// massif's height and its noise's seed, and its climbs: ways cut up the massif's faces and flats on its top, each a
/// capsule `[x1, y1, x2, y2, half, from, to]` whose level runs from `from` to `to` of the massif's height along it (0
/// the floor, 1 the top), a lookout one of no length. Its runs are cut into the rock as its climbs are, and its wings
/// (`[x1, y1, x2, y2, half]`) carry its claim past its ring, so the massif stands round a run that leaves it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Sculpt {
    pub claim: Vec<[f64; 2]>,
    pub floors: Vec<[f64; 5]>,
    pub outcrops: Vec<[f64; 4]>,
    pub rise: f64,
    pub seed: u32,
    #[serde(default)]
    pub climbs: Vec<[f64; 7]>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub runs: Vec<[f64; 7]>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub wings: Vec<[f64; 5]>,
}

/// The floors, the outcrops, the climbs and the runs near one bucket, by their places in a sculpt's lists.
type Near = (Vec<u32>, Vec<u32>, Vec<u32>, Vec<u32>);

/// Every sculpt on a ground, indexed by bucket so a point finds only the shapes near it.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(from = "Vec<Sculpt>", into = "Vec<Sculpt>")]
pub struct Sculpts {
    sculpts: Vec<Sculpt>,
    /// Each sculpt's reach: its claim's bounds and the fade past them.
    reaches: Vec<[f64; 4]>,
    /// Per sculpt, the floors and outcrops whose reach touches each bucket.
    near: Vec<BTreeMap<(i64, i64), Near>>,
    /// Per sculpt, whether each bucket of its reach lies wholly in its claim (the fade there is 1), wholly past the
    /// fade (0), or across the claim's edge or fade, where a point is measured: the claim's edge measured once a
    /// bucket rather than at every point.
    fades: Vec<Fades>,
}

/// A sculpt's buckets over its reach, row by row from its north-west bucket: what the fade is in each.
#[derive(Debug, Clone, Default, PartialEq)]
struct Fades {
    west: i64,
    north: i64,
    columns: i64,
    rows: i64,
    each: Vec<Fade>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Fade {
    Whole,
    None,
    Measured,
}

fn bucket(value: f64) -> i64 {
    (value / BUCKET_M).floor() as i64
}

impl From<Vec<Sculpt>> for Sculpts {
    fn from(sculpts: Vec<Sculpt>) -> Self {
        let mut reaches = Vec::new();
        let mut near = Vec::new();
        let mut fades = Vec::new();
        for sculpt in &sculpts {
            let start = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
            let [west, north, east, south] = sculpt.claim.iter().fold(start, |[west, north, east, south], &[x, y]| {
                [west.min(x), north.min(y), east.max(x), south.max(y)]
            });
            let [west, north, east, south] =
                sculpt.wings.iter().fold([west, north, east, south], |[west, north, east, south], wing| {
                    let [x1, y1, x2, y2, half] = *wing;
                    let near = [x1.min(x2) - half, y1.min(y2) - half, x1.max(x2) + half, y1.max(y2) + half];
                    [west.min(near[0]), north.min(near[1]), east.max(near[2]), south.max(near[3])]
                });
            // Its fade past the claim, and as far as its floors hold other sculpts down: a gorge out of a gate runs on
            // past the claim into a neighbour's.
            let reach = sculpt.floors.iter().fold(
                [west - FADE_M, north - FADE_M, east + FADE_M, south + FADE_M],
                |[west, north, east, south], &[x1, y1, x2, y2, half]| {
                    let out = half * (1.0 + WANDER) + FLOOR_REACH_M;
                    [
                        west.min(x1.min(x2) - out),
                        north.min(y1.min(y2) - out),
                        east.max(x1.max(x2) + out),
                        south.max(y1.max(y2) + out),
                    ]
                },
            );
            reaches.push(reach);
            fades.push(Fades::of(&sculpt.claim, &sculpt.wings, reach));
            let mut map: BTreeMap<(i64, i64), Near> = BTreeMap::new();
            let mut spread = |bounds: [f64; 4], add: &mut dyn FnMut(&mut Near)| {
                for column in bucket(bounds[0])..=bucket(bounds[2]) {
                    for row in bucket(bounds[1])..=bucket(bounds[3]) {
                        add(map.entry((column, row)).or_default());
                    }
                }
            };
            for (number, &[x1, y1, x2, y2, half]) in sculpt.floors.iter().enumerate() {
                let reach = half * (1.0 + WANDER) + FLOOR_REACH_M;
                let bounds = [x1.min(x2) - reach, y1.min(y2) - reach, x1.max(x2) + reach, y1.max(y2) + reach];
                spread(bounds, &mut |entry| entry.0.push(number as u32));
            }
            for (number, &[x, y, radius, _]) in sculpt.outcrops.iter().enumerate() {
                let reach = radius * (1.0 + WANDER);
                spread([x - reach, y - reach, x + reach, y + reach], &mut |entry| entry.1.push(number as u32));
            }
            for (number, &[x1, y1, x2, y2, half, ..]) in sculpt.climbs.iter().enumerate() {
                let reach = half + CLIFF_RUN_M + RUN_BLEND_M;
                let bounds = [x1.min(x2) - reach, y1.min(y2) - reach, x1.max(x2) + reach, y1.max(y2) + reach];
                spread(bounds, &mut |entry| entry.2.push(number as u32));
            }
            for (number, &[x1, y1, x2, y2, half, ..]) in sculpt.runs.iter().enumerate() {
                let reach = half + CLIFF_RUN_M + RUN_BLEND_M;
                let bounds = [x1.min(x2) - reach, y1.min(y2) - reach, x1.max(x2) + reach, y1.max(y2) + reach];
                spread(bounds, &mut |entry| entry.3.push(number as u32));
            }
            near.push(map);
        }
        Self { sculpts, reaches, near, fades }
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

/// How far a point lies inside a claim (positive) or outside it (negative): in its ring, or in the wing that carries
/// it furthest.
fn inside_claim(ring: &[[f64; 2]], wings: &[[f64; 5]], x: f64, y: f64) -> f64 {
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
    fn of(claim: &[[f64; 2]], wings: &[[f64; 5]], [west, north, east, south]: [f64; 4]) -> Self {
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

    fn at(&self, x: f64, y: f64) -> Fade {
        let (column, row) = (bucket(x) - self.west, bucket(y) - self.north);
        if column < 0 || row < 0 || column >= self.columns || row >= self.rows {
            return Fade::Measured;
        }
        self.each[(row * self.columns + column) as usize]
    }
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
        let Some((floors, ..)) = self.near[number].get(&(bucket(x), bucket(y))) else { return f64::INFINITY };
        let wander = 1.0 + WANDER * (0.5 + 0.5 * fbm(sculpt.seed, x / 70.0, y / 70.0, 2));
        floors
            .iter()
            .map(|&floor| {
                let [x1, y1, x2, y2, half] = sculpt.floors[floor as usize];
                to_segment(x, y, [x1, y1], [x2, y2]) - half * wander
            })
            .fold(f64::INFINITY, f64::min)
    }

    /// How far a point lies off the nearest climb or run of a sculpt (metres, negative on it), and its level there as
    /// a share of the massif's height; infinity where none is near. Capsules meet at bends, and a climb at its lookout,
    /// at levels that differ off their lines, so the level is a blend of the near capsules', weighted by how near each
    /// is: the land then climbs round a bend, or beside a climb's top, without a step.
    fn off_climb(&self, number: usize, x: f64, y: f64) -> (f64, f64) {
        let sculpt = &self.sculpts[number];
        let Some((_, _, climbs, runs)) = self.near[number].get(&(bucket(x), bucket(y))) else {
            return (f64::INFINITY, 1.0);
        };
        let measured = |capsule: &[f64; 7]| {
            let [x1, y1, x2, y2, half, from, to] = *capsule;
            let (distance, along) = along_segment(x, y, [x1, y1], [x2, y2]);
            (distance - half, from + (to - from) * along)
        };
        let parts: Vec<(f64, f64)> = climbs
            .iter()
            .map(|&climb| measured(&sculpt.climbs[climb as usize]))
            .chain(runs.iter().map(|&run| measured(&sculpt.runs[run as usize])))
            .collect();
        let nearest = parts.iter().map(|part| part.0).fold(f64::INFINITY, f64::min);
        if !nearest.is_finite() {
            return (f64::INFINITY, 1.0);
        }
        let (sum, weight) = parts.iter().fold((0.0, 0.0), |(sum, weight), &(off, level)| {
            let near = (1.0 - (off - nearest) / RUN_BLEND_M).max(0.0);
            (sum + near * level, weight + near)
        });
        (nearest, sum / weight)
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
    /// on land, and no sculpt raises the strand or the sea. Each sculpt's rise is held under the faces rising from
    /// every other sculpt's floor, so no layout's massif or fade buries another's basins, canyons, climbs or gorges,
    /// and where two floors meet both stay open.
    #[must_use]
    pub fn raise(&self, x: f64, y: f64, coast: f64) -> f64 {
        if coast <= 0.0 || self.sculpts.is_empty() {
            return 0.0;
        }
        let reaches = |number: &usize| {
            let reach = self.reaches[*number];
            x >= reach[0] && x <= reach[2] && y >= reach[1] && y <= reach[3]
        };
        let near = || (0..self.sculpts.len()).filter(reaches);
        let strand = smooth(0.0, STRAND_M, coast);
        near()
            .map(|number| {
                let own = self.raised_by(number, x, y);
                let held = near()
                    .filter(|&other| other != number && own > 0.0)
                    .fold(own, |height, other| height.min(self.ceiling(other, x, y)));
                held * strand
            })
            .fold(0.0, f64::max)
    }

    /// The massif's height before its outcrops and fade at a point, for a sculpt: its top's height there, roughened,
    /// stepped down its faces to its floor (`floor_face`, from how far off its floor the point lies), and cut to its
    /// climbs' and runs' levels.
    fn carved(&self, number: usize, x: f64, y: f64, rough: bool) -> f64 {
        let sculpt = &self.sculpts[number];
        let off = self.off_floor(number, x, y);
        let rise = sculpt.rise * (0.7 + 0.45 * (0.5 + 0.5 * fbm(sculpt.seed ^ 0x51, x / 230.0, y / 230.0, 3)));
        let mut height = if rough {
            if off > 0.0 {
                // A face in ledges up to the top's roughness.
                let stepped = face(off);
                let rough =
                    4.0 * fbm(sculpt.seed ^ 0x77, x / 48.0, y / 48.0, 3) * smooth(0.0, 1.0, off / (2.0 * CLIFF_RUN_M));
                rise * stepped + rough.max(-2.0) * stepped
            } else {
                0.0
            }
        } else {
            ceiling_face(rise, off)
        };
        // A climb is cut into the massif at its own level, its own face rising from it to the top: the land is
        // the lower of the two, so a way up runs along the cliff with a drop on its floor's side.
        let (off_climb, share) = self.off_climb(number, x, y);
        if off_climb.is_finite() {
            let level = rise * share;
            // On the climb the land is its level, an embankment where the floor's face runs lower; off it, over
            // a couple of metres, whichever face is lower.
            let beside = height.min(level + (height - level) * face(off_climb.max(0.0)));
            height = level + (beside - level) * smooth(0.0, CLIMB_EDGE_M, off_climb);
        }
        height
    }

    /// How far one sculpt raises the land at a point, metres, before the strand: its carving, its outcrops, faded
    /// past its claim.
    fn raised_by(&self, number: usize, x: f64, y: f64) -> f64 {
        let sculpt = &self.sculpts[number];
        let fade = match self.fades[number].at(x, y) {
            Fade::Whole => 1.0,
            Fade::None => 0.0,
            Fade::Measured => smooth(-FADE_M, 0.0, inside_claim(&sculpt.claim, &sculpt.wings, x, y)),
        };
        if fade <= 0.0 {
            return 0.0;
        }
        let mut height = self.carved(number, x, y, true);
        if let Some((_, outcrops, ..)) = self.near[number].get(&(bucket(x), bucket(y))) {
            for &outcrop in outcrops {
                let [middle_x, middle_y, radius, tall] = sculpt.outcrops[outcrop as usize];
                let wander = 1.0 + WANDER * (0.5 + 0.5 * fbm(sculpt.seed ^ outcrop, x / 9.0, y / 9.0, 2));
                let out = ((x - middle_x) * (x - middle_x) + (y - middle_y) * (y - middle_y)).sqrt() / wander;
                let mesa = 1.0 - smooth(radius * 0.7, radius, out);
                let band = (mesa * 3.0).floor();
                height = height.max(tall * (band + smooth(0.6, 1.0, mesa * 3.0 - band)) / 3.0);
            }
        }
        height * fade
    }

    /// The most another sculpt may raise the land at a point, metres: this sculpt's faces rising from its floor, its
    /// climbs and its runs, as its own massif's would, then on up steeply past its cliffs' top, so its floor stays
    /// open through another's massif and fade.
    fn ceiling(&self, number: usize, x: f64, y: f64) -> f64 {
        self.carved(number, x, y, false)
    }
}

/// The ceiling a floor's face sets `off` metres from its edge: the face's ledges up to `rise`, then on up at the
/// face's own steepness, so a neighbour's higher massif meets it as a cliff and not a step; never past `CEILING_M`.
fn ceiling_face(rise: f64, off: f64) -> f64 {
    if off <= CLIFF_RUN_M { rise * face(off.max(0.0)) } else { (rise * off / CLIFF_RUN_M).min(CEILING_M) }
}

#[cfg(test)]
#[path = "sculpts_tests.rs"]
mod tests;
