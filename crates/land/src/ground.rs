//! The ground anywhere on a landmass, to the metre: what the server judges a body against and every client draws.
//! The 1 km land is interpolated smoothly and given a fine grain; a town's area is levelled to its ground's mean; a
//! river's channel is cut under its surface with banks above it; a road's bed is eased to its level. World 2.0's
//! laws, in exact maths only, so every machine finds the same height at the same point.

use crate::edits::Edits;
use crate::exact::{fbm, lerp, seed_of, smooth};
use crate::grid::Grid;
use crate::water::{River, river_depth_m, river_width_m};
use std::collections::BTreeMap;
use world::geometry::Point;

/// A carved river's banks past its channel, and a road's shoulder past its edge, metres.
pub const BANK_M: f64 = 10.0;
pub const SHOULDER_M: f64 = 4.0;
/// A town's ground eases from its level back to the land over this many metres past its edge.
pub const TOWN_EDGE_M: f64 = 150.0;
/// A hand-drawn course's points come every this many metres.
pub const COURSE_STEP_M: f64 = 50.0;
/// The grain laid on the land, metres high, and its scale.
pub const GRAIN_M: f64 = 4.0;
pub const GRAIN_SCALE_M: f64 = 250.0;
/// The side of the index's buckets, metres.
const BUCKET_M: f64 = 2000.0;

/// One point of a course: where it is, its level (a river's surface, a road's bed), and its width and depth.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CoursePoint {
    pub x: f64,
    pub y: f64,
    pub level: f64,
    pub width: f64,
    pub depth: f64,
}

/// What water stands at a point, and its surface.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum WaterAt {
    Dry,
    Sea,
    Lake { surface: f64 },
    River { surface: f64 },
}

/// A town's area, its bounds (west, north, east, south) and the level its ground is set to.
#[derive(Debug, Clone, PartialEq)]
pub struct TownPad {
    pub outline: Vec<(f64, f64)>,
    pub bounds: (f64, f64, f64, f64),
    pub level: f64,
}

/// Which courses pass near a bucket of the world: (is a road, which course, which segment).
type CourseIndex = BTreeMap<(i64, i64), Vec<(bool, usize, usize)>>;

/// A landmass's ground with its places on it, indexed so a point finds the courses near it quickly.
#[derive(Debug, Clone, PartialEq)]
pub struct Ground {
    pub land: Grid,
    pub lake_level: Vec<f64>,
    pub rivers: Vec<Vec<CoursePoint>>,
    pub roads: Vec<Vec<CoursePoint>>,
    pub towns: Vec<TownPad>,
    seed: u32,
    index: CourseIndex,
}

/// A polyline with a point at least every `step` metres.
#[must_use]
pub fn densify(points: &[(f64, f64)], step: f64) -> Vec<(f64, f64)> {
    let Some(&first) = points.first() else { return Vec::new() };
    let mut out = vec![first];
    for pair in points.windows(2) {
        let ((from_x, from_y), (to_x, to_y)) = (pair[0], pair[1]);
        let length = ((to_x - from_x) * (to_x - from_x) + (to_y - from_y) * (to_y - from_y)).sqrt();
        let count = (length / step).ceil().max(1.0) as usize;
        for at in 1..=count {
            let fraction = at as f64 / count as f64;
            out.push((lerp(from_x, to_x, fraction), lerp(from_y, to_y, fraction)));
        }
    }
    out
}

/// One pass of Chaikin's corner cutting, its ends kept; every value a point carries is cut alike.
#[must_use]
pub fn chaikin<const N: usize>(points: &[[f64; N]]) -> Vec<[f64; N]> {
    if points.len() < 3 {
        return points.to_vec();
    }
    let mix =
        |from: &[f64; N], to: &[f64; N], fraction: f64| std::array::from_fn(|at| lerp(from[at], to[at], fraction));
    let mut out = vec![points[0]];
    for pair in points.windows(2) {
        out.push(mix(&pair[0], &pair[1], 0.25));
        out.push(mix(&pair[0], &pair[1], 0.75));
    }
    out.extend(points.last());
    out
}

/// The nearest point of a segment to (x, y): its distance and the share of the way along it.
fn near_segment(from: &CoursePoint, to: &CoursePoint, x: f64, y: f64) -> (f64, f64) {
    let (span_x, span_y) = (to.x - from.x, to.y - from.y);
    let length = span_x * span_x + span_y * span_y;
    let along =
        if length > 0.0 { (((x - from.x) * span_x + (y - from.y) * span_y) / length).clamp(0.0, 1.0) } else { 0.0 };
    let (dx, dy) = (x - from.x - span_x * along, y - from.y - span_y * along);
    ((dx * dx + dy * dy).sqrt(), along)
}

/// Whether (x, y) lies inside a ring (even-odd), and its distance to the ring's edge.
fn in_ring(ring: &[(f64, f64)], x: f64, y: f64) -> (bool, f64) {
    let (mut inside, mut nearest) = (false, f64::MAX);
    for (index, &(from_x, from_y)) in ring.iter().enumerate() {
        let (to_x, to_y) = ring[(index + 1) % ring.len()];
        if (from_y > y) != (to_y > y) && x < from_x + (y - from_y) / (to_y - from_y) * (to_x - from_x) {
            inside = !inside;
        }
        let start = CoursePoint { x: from_x, y: from_y, level: 0.0, width: 0.0, depth: 0.0 };
        let end = CoursePoint { x: to_x, ..start };
        let end = CoursePoint { y: to_y, ..end };
        nearest = nearest.min(near_segment(&start, &end, x, y).0);
    }
    (inside, nearest)
}

fn bucket(x: f64, y: f64) -> (i64, i64) {
    ((x / BUCKET_M).floor() as i64, (y / BUCKET_M).floor() as i64)
}

fn to_metres(points: &[Point]) -> Vec<(f64, f64)> {
    points.iter().map(|point| (point.x as f64, point.y as f64)).collect()
}

/// A level that never rises downstream: each point's surface is the lowest the ground has been from the source.
fn held_surface(points: &[(f64, f64)], height: impl Fn(f64, f64) -> f64) -> Vec<f64> {
    let mut surface = f64::MAX;
    points
        .iter()
        .map(|&(x, y)| {
            surface = surface.min(height(x, y) - 0.5).max(0.0);
            surface
        })
        .collect()
}

impl Ground {
    /// The ground of a landmass: its land (the 1 km grid with the owner's strokes), its lakes, the rivers the water
    /// gathered into, and the places in its edits.
    #[must_use]
    pub fn new(land: &Grid, lake_level: &[f64], rivers: &[River], edits: &Edits, seed: u32) -> Self {
        let mut ground = Self {
            land: land.clone(),
            lake_level: lake_level.to_vec(),
            rivers: Vec::new(),
            roads: Vec::new(),
            towns: Vec::new(),
            seed: seed_of(seed, "grain"),
            index: BTreeMap::new(),
        };
        for town in &edits.towns {
            let outline = to_metres(&town.outline);
            let bounds =
                outline.iter().fold((f64::MAX, f64::MAX, f64::MIN, f64::MIN), |(west, north, east, south), &(x, y)| {
                    (west.min(x), north.min(y), east.max(x), south.max(y))
                });
            let cell =
                |metres: f64, origin: f64, size: usize| (((metres - origin) / land.cell_m).max(0.0) as usize).min(size);
            let (first_i, last_i) =
                (cell(bounds.0, land.left_m, land.width), cell(bounds.2, land.left_m, land.width - 1));
            let (first_j, last_j) =
                (cell(bounds.1, land.top_m, land.height), cell(bounds.3, land.top_m, land.height - 1));
            let inside: Vec<f64> = (first_j..=last_j)
                .flat_map(|j| (first_i..=last_i).map(move |i| (i, j)))
                .filter_map(|(i, j)| {
                    let (x, y) = land.centre(i, j);
                    in_ring(&outline, x, y).0.then(|| ground.base(x, y))
                })
                .collect();
            let around: Vec<f64> = outline.iter().map(|&(x, y)| ground.base(x, y)).collect();
            let heights = if inside.is_empty() { around } else { inside };
            let level = heights.iter().sum::<f64>() / heights.len().max(1) as f64;
            ground.towns.push(TownPad { outline, bounds, level });
        }
        for river in &edits.rivers {
            let points = densify(&to_metres(&river.points), COURSE_STEP_M);
            let surface = held_surface(&points, |x, y| ground.padded(x, y));
            let (width, depth) = (river.width_m as f64, river.depth_m as f64);
            ground.rivers.push(
                points.iter().zip(surface).map(|(&(x, y), level)| CoursePoint { x, y, level, width, depth }).collect(),
            );
        }
        // A gathered river's surface is the drainage's: the ground with every hollow filled, so it runs level across a
        // lake and never cuts down to the lake's floor beyond it.
        for river in rivers {
            let raw: Vec<[f64; 4]> = (0..river.points.len())
                .map(|at| [river.points[at].0, river.points[at].1, river.flow[at], river.level[at]])
                .collect();
            let mut surface = f64::MAX;
            let course = chaikin(&chaikin(&raw)).into_iter().map(|[x, y, flow, level]| {
                surface = surface.min(level - 0.5).max(0.0);
                CoursePoint { x, y, level: surface, width: river_width_m(flow), depth: river_depth_m(flow) }
            });
            ground.rivers.push(course.collect());
        }
        for road in &edits.roads {
            let points = densify(&to_metres(&road.points), COURSE_STEP_M);
            let beds: Vec<f64> = points.iter().map(|&(x, y)| ground.padded(x, y)).collect();
            let width = road.width_m as f64;
            let course = points.iter().enumerate().map(|(at, &(x, y))| {
                let near = &beds[at.saturating_sub(2)..(at + 3).min(beds.len())];
                let level = near.iter().sum::<f64>() / near.len() as f64;
                CoursePoint { x, y, level, width, depth: 0.0 }
            });
            ground.roads.push(course.collect());
        }
        ground.index_courses();
        ground
    }

    fn index_courses(&mut self) {
        let courses =
            self.rivers.iter().map(|course| (false, course)).chain(self.roads.iter().map(|course| (true, course)));
        for (number, (is_road, course)) in courses.enumerate() {
            let number = if is_road { number - self.rivers.len() } else { number };
            for (segment, pair) in course.windows(2).enumerate() {
                let reach = pair[0].width.max(pair[1].width) / 2.0 + if is_road { SHOULDER_M } else { BANK_M };
                let (west, north) = bucket(pair[0].x.min(pair[1].x) - reach, pair[0].y.min(pair[1].y) - reach);
                let (east, south) = bucket(pair[0].x.max(pair[1].x) + reach, pair[0].y.max(pair[1].y) + reach);
                for column in west..=east {
                    for row in north..=south {
                        self.index.entry((column, row)).or_default().push((is_road, number, segment));
                    }
                }
            }
        }
    }

    /// The land alone: the grid interpolated smoothly, with its grain on the land.
    fn base(&self, x: f64, y: f64) -> f64 {
        let height = self.land.cubic_at(x, y);
        let grain = GRAIN_M * fbm(self.seed, x / GRAIN_SCALE_M, y / GRAIN_SCALE_M, 3);
        height + grain * smooth(2.0, 30.0, height)
    }

    /// The land with the towns' areas levelled.
    fn padded(&self, x: f64, y: f64) -> f64 {
        let mut height = self.base(x, y);
        for town in &self.towns {
            let (west, north, east, south) = town.bounds;
            if x < west - TOWN_EDGE_M || x > east + TOWN_EDGE_M || y < north - TOWN_EDGE_M || y > south + TOWN_EDGE_M {
                continue;
            }
            let (inside, distance) = in_ring(&town.outline, x, y);
            let share = if inside { 1.0 } else { 1.0 - smooth(0.0, TOWN_EDGE_M, distance) };
            if share > 0.0 {
                height = lerp(height, town.level, share);
            }
        }
        height
    }

    /// The nearest course of one kind within its reach of (x, y): the point there, and its distance.
    fn nearest(&self, x: f64, y: f64, roads: bool) -> Option<(CoursePoint, f64)> {
        let mut best: Option<(CoursePoint, f64)> = None;
        for &(is_road, number, segment) in self.index.get(&bucket(x, y))? {
            if is_road != roads {
                continue;
            }
            let course = if roads { &self.roads[number] } else { &self.rivers[number] };
            let (from, to) = (&course[segment], &course[segment + 1]);
            let (distance, along) = near_segment(from, to, x, y);
            let point = CoursePoint {
                x,
                y,
                level: lerp(from.level, to.level, along),
                width: lerp(from.width, to.width, along),
                depth: lerp(from.depth, to.depth, along),
            };
            let reach = point.width / 2.0 + if roads { SHOULDER_M } else { BANK_M };
            // The course whose edge is nearest wins, so a point in a wide channel is not given a tributary's bank.
            let beyond = distance - point.width / 2.0;
            if distance < reach && best.is_none_or(|(near, nearest)| beyond < nearest - near.width / 2.0) {
                best = Some((point, distance));
            }
        }
        best
    }

    /// The ground's height at a world point, metres: what a body stands on.
    #[must_use]
    pub fn height_at(&self, x: f64, y: f64) -> f64 {
        let ground = self.padded(x, y);
        if let Some((river, distance)) = self.nearest(x, y, false) {
            let half = river.width / 2.0;
            if distance < half {
                let from_middle = distance / half;
                return ground.min(river.level - river.depth * (1.0 - from_middle * from_middle));
            }
            let top = ground.max(river.level);
            return river.level + (top - river.level) * smooth(half, half + BANK_M, distance);
        }
        if let Some((road, distance)) = self.nearest(x, y, true) {
            let half = road.width / 2.0;
            return road.level + (ground - road.level) * smooth(half, half + SHOULDER_M, distance);
        }
        ground
    }

    /// Whether a world point lies on a road's bed.
    #[must_use]
    pub fn on_road(&self, x: f64, y: f64) -> bool {
        self.nearest(x, y, true).is_some_and(|(road, distance)| distance < road.width / 2.0)
    }

    /// Whether a world point lies inside a town's area.
    #[must_use]
    pub fn in_town(&self, x: f64, y: f64) -> bool {
        self.towns.iter().any(|town| {
            let (west, north, east, south) = town.bounds;
            x >= west && x <= east && y >= north && y <= south && in_ring(&town.outline, x, y).0
        })
    }

    /// What water stands at a world point.
    #[must_use]
    pub fn water_at(&self, x: f64, y: f64) -> WaterAt {
        if let Some((river, distance)) = self.nearest(x, y, false)
            && distance < river.width / 2.0
        {
            return WaterAt::River { surface: river.level };
        }
        let height = self.height_at(x, y);
        let (i, j) = ((x - self.land.left_m) / self.land.cell_m, (y - self.land.top_m) / self.land.cell_m);
        if self.land.covers(x, y) {
            // A lake level of 0 is no lake: the sea's own cells hold it too.
            let surface = self.lake_level[j as usize * self.land.width + i as usize];
            if surface > 0.0 && surface > height {
                return WaterAt::Lake { surface };
            }
        }
        if height < 0.0 { WaterAt::Sea } else { WaterAt::Dry }
    }
}

/// A fingerprint of the ground's heights at the given points (FNV-1a over their bits): the same on every machine.
#[must_use]
pub fn sample_hash(ground: &Ground, points: &[(f64, f64)]) -> u64 {
    points.iter().fold(0xcbf2_9ce4_8422_2325, |hash: u64, &(x, y)| {
        let bits = ground.height_at(x, y).to_bits().to_le_bytes();
        bits.iter().fold(hash, |hash, &byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3))
    })
}

#[cfg(test)]
#[path = "ground_tests.rs"]
mod tests;
