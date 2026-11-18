//! The ground anywhere on a landmass, to the metre: what the server judges a body against and every client draws.
//! The 1 km land is interpolated smoothly and given a fine grain; a town's area is levelled to its ground's mean; a
//! river's channel is cut under its surface, its banks easing from its surface back to the land; a road's bed is eased
//! to its level. World 2.0's laws, in exact maths only, so every machine finds the same height at the same point.

use crate::edits::Edits;
use crate::exact::{clamp, fbm, fingerprint, lerp, seed_of, smooth};
use crate::grid::{D8_X, D8_Y, Grid, catmull};
use crate::pads::Pads;
use crate::relief::{COAST_REACH_M, LAND_FLOOR_M, SEA_CEILING_M};
use crate::sculpts::Sculpts;
use crate::water::{River, river_depth_m, river_width_m};
use serde::{Deserialize, Serialize};
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
/// Within this many metres of the painted coast the land and the sea meet along it, not along the cells.
pub const COAST_BLEND_M: f64 = 1000.0;
/// The least the land stands above the sea, and the seabed under it, metres: met softly, so a spline sagging between
/// cells never floods the land or lifts the seabed dry.
pub const SHORE_FLOOR_M: f64 = 0.5;
/// How many rings of cells each side's heights are carried over the coast: enough for every cell a blended point reads.
const CARRY_RINGS: u8 = 6;

/// One point of a course: where it is, its level (a river's surface, a road's bed), and its width and depth.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TownPad {
    pub outline: Vec<(f64, f64)>,
    pub bounds: (f64, f64, f64, f64),
    pub level: f64,
}

/// Which courses pass near a bucket of the world: (is a road, which course, which segment).
type CourseIndex = BTreeMap<(i64, i64), Vec<(bool, usize, usize)>>;

/// A landmass's ground with its places on it, indexed so a point finds the courses near it quickly. It is saved
/// without its index, which is built again on load; one whose layers do not hold the same cells is refused.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(try_from = "window::SavedGround")]
pub struct Ground {
    pub land: Grid,
    pub lake_level: Vec<f64>,
    pub rivers: Vec<Vec<CoursePoint>>,
    pub roads: Vec<Vec<CoursePoint>>,
    pub towns: Vec<TownPad>,
    /// Each cell centre's distance from the painted coast, metres, positive on land (relief.rs `coast_signed_m`).
    pub coast: Grid,
    /// Each cell's height carried over the coast from the other side: a land cell's seabed, a sea cell's land.
    pub across: Grid,
    /// The levels a city sets its terraces to, over everything else where they lie.
    pub pads: Pads,
    /// The land the layouts carve: raised round their networks into cliffs and mesas.
    pub sculpts: Sculpts,
    seed: u32,
    #[serde(skip)]
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
pub(crate) fn near_segment(from: (f64, f64), to: (f64, f64), x: f64, y: f64) -> (f64, f64) {
    let (span_x, span_y) = (to.0 - from.0, to.1 - from.1);
    let length = span_x * span_x + span_y * span_y;
    let along =
        if length > 0.0 { (((x - from.0) * span_x + (y - from.1) * span_y) / length).clamp(0.0, 1.0) } else { 0.0 };
    let (dx, dy) = (x - from.0 - span_x * along, y - from.1 - span_y * along);
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
        nearest = nearest.min(near_segment((from_x, from_y), (to_x, to_y), x, y).0);
    }
    (inside, nearest)
}

fn bucket(x: f64, y: f64) -> (i64, i64) {
    ((x / BUCKET_M).floor() as i64, (y / BUCKET_M).floor() as i64)
}

/// Each side's heights carried over the coast into the other side's cells, ring by ring (a cell takes the mean of its
/// neighbours a ring nearer its side), so each side runs on past the coast with no step at it. A cell further than
/// CARRY_RINGS from the side, or past the coast's reach, holds the side's least height.
fn carried(land: &Grid, coast: &Grid) -> Grid {
    let mut across = land.like(0.0);
    let (width, height) = (land.width as isize, land.height as isize);
    for land_side in [true, false] {
        let own = |value: f64| (value > 0.0) == land_side;
        let mut side = land.data.clone();
        let mut ring: Vec<u8> = land.data.iter().map(|&value| if own(value) { 0 } else { u8::MAX }).collect();
        for step in 1..=CARRY_RINGS {
            for index in 0..side.len() {
                if ring[index] != u8::MAX || coast.data[index].abs() >= COAST_REACH_M {
                    continue;
                }
                let (i, j) = ((index % land.width) as isize, (index / land.width) as isize);
                let (mut sum, mut count) = (0.0, 0.0);
                for (dx, dy) in D8_X.iter().zip(D8_Y) {
                    let (column, row) = (i + dx, j + dy);
                    if column < 0 || row < 0 || column >= width || row >= height {
                        continue;
                    }
                    let other = (row * width + column) as usize;
                    if ring[other] < step {
                        sum += side[other];
                        count += 1.0;
                    }
                }
                if count > 0.0 {
                    side[index] = sum / count;
                    ring[index] = step;
                }
            }
        }
        let least = if land_side { LAND_FLOOR_M } else { SEA_CEILING_M };
        for index in 0..side.len() {
            if !own(land.data[index]) {
                across.data[index] = if ring[index] == u8::MAX { least } else { side[index] };
            }
        }
    }
    across
}

/// A height kept softly at SHORE_FLOOR_M or more: unchanged from twice that up, eased onto it below.
fn above_floor(value: f64) -> f64 {
    let share = clamp(0.5 + 0.5 * (value - SHORE_FLOOR_M) / SHORE_FLOOR_M, 0.0, 1.0);
    lerp(SHORE_FLOOR_M, value, share) + SHORE_FLOOR_M * share * (1.0 - share)
}

/// The land and the sea met along the painted coast, `distance` metres inland of it (negative at sea): the land's
/// height inland past COAST_BLEND_M, the sea's as far out, 0 on the coast, and never the wrong side of 0 between.
#[must_use]
pub fn coast_meet(land: f64, sea: f64, distance: f64) -> f64 {
    let (land, sea) = (above_floor(land), -above_floor(-sea));
    let near = smooth(0.0, COAST_BLEND_M, distance.abs());
    let side = 2.0 * smooth(-COAST_BLEND_M, COAST_BLEND_M, distance) - 1.0;
    0.5 * (land * (near + side) + sea * (near - side))
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
    /// gathered into, and the places in its edits. `coast` holds each cell's distance from the painted coast.
    #[must_use]
    pub fn new(land: &Grid, coast: &Grid, lake_level: &[f64], rivers: &[River], edits: &Edits, seed: u32) -> Self {
        let mut ground = Self {
            land: land.clone(),
            lake_level: lake_level.to_vec(),
            rivers: Vec::new(),
            roads: Vec::new(),
            towns: Vec::new(),
            coast: coast.clone(),
            across: carried(land, coast),
            seed: seed_of(seed, "grain"),
            pads: Pads::default(),
            sculpts: Sculpts::default(),
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
            // A course ends where the painted coast crosses it, not at the first sea cell's centre beyond.
            let (mut points, mut inland): (Vec<[f64; 4]>, Option<f64>) = (Vec::new(), None);
            for point in chaikin(&chaikin(&raw)) {
                let coast = ground.sides(point[0], point[1])[2];
                if coast <= 0.0 {
                    if let (Some(before), Some(&last)) = (inland, points.last()) {
                        let share = before / (before - coast);
                        points.push(std::array::from_fn(|at| lerp(last[at], point[at], share)));
                    }
                    break;
                }
                inland = Some(coast);
                points.push(point);
            }
            // A level gathered on the cells can float above the smooth ground down a steep reach: off a lake it is
            // held to the ground, so the water lies in its channel, never over dry land.
            let mut surface = f64::MAX;
            let course: Vec<CoursePoint> = points
                .iter()
                .map(|&[x, y, flow, level]| {
                    let floor = ground.padded(x, y);
                    let cap = ground.lake_surface(x, y).filter(|&lake| lake > floor).unwrap_or(floor);
                    surface = surface.min(level - 0.5).min(cap).max(0.0);
                    CoursePoint { x, y, level: surface, width: river_width_m(flow), depth: river_depth_m(flow) }
                })
                .collect();
            if course.len() >= 2 {
                ground.rivers.push(course);
            }
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

    /// Lays more roads on the ground after it is made, as a layout's paths: each course is points (already as close
    /// together as it bends) and a width, and its bed is the ground under it smoothed over its two points either side.
    pub fn add_roads(&mut self, roads: &[(Vec<(f64, f64)>, f64)]) {
        for (points, width) in roads {
            let beds: Vec<f64> = points.iter().map(|&(x, y)| self.padded(x, y)).collect();
            let course = points.iter().enumerate().map(|(at, &(x, y))| {
                let near = &beds[at.saturating_sub(2)..(at + 3).min(beds.len())];
                let level = near.iter().sum::<f64>() / near.len() as f64;
                CoursePoint { x, y, level, width: *width, depth: 0.0 }
            });
            self.roads.push(course.collect());
        }
        self.index.clear();
        self.index_courses();
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

    /// The land and the sea either side of the coast, and the coast's distance, splined through the cells the way the
    /// grid's cubic is: each side reads the other's cells as their carried heights, so neither steps at the coast.
    fn sides(&self, x: f64, y: f64) -> [f64; 3] {
        let grid = &self.land;
        let (grid_x, grid_y) = ((x - grid.left_m) / grid.cell_m - 0.5, (y - grid.top_m) / grid.cell_m - 0.5);
        let (i, j) = (grid_x.floor(), grid_y.floor());
        let (fraction_x, fraction_y) = (grid_x - i, grid_y - j);
        let (i, j) = (i as isize, j as isize);
        let cell = |column: isize, row: isize| {
            let (height, across, coast) =
                (grid.get(column, row), self.across.get(column, row), self.coast.get(column, row));
            if height > 0.0 { [height, across, coast] } else { [across, height, coast] }
        };
        let row = |row: isize| {
            let cells = [cell(i - 1, row), cell(i, row), cell(i + 1, row), cell(i + 2, row)];
            std::array::from_fn::<f64, 3, _>(|at| {
                catmull(cells[0][at], cells[1][at], cells[2][at], cells[3][at], fraction_x)
            })
        };
        let rows = [row(j - 1), row(j), row(j + 1), row(j + 2)];
        std::array::from_fn(|at| catmull(rows[0][at], rows[1][at], rows[2][at], rows[3][at], fraction_y))
    }

    /// The land alone: the land and the sea met along the painted coast, with its grain on the land.
    fn base(&self, x: f64, y: f64) -> f64 {
        self.base_and_coast(x, y).0
    }

    /// The land alone, and the point's distance from the painted coast.
    fn base_and_coast(&self, x: f64, y: f64) -> (f64, f64) {
        let [land, sea, coast] = self.sides(x, y);
        let height = coast_meet(land, sea, coast);
        let grain = GRAIN_M * fbm(self.seed, x / GRAIN_SCALE_M, y / GRAIN_SCALE_M, 3);
        (height + grain * smooth(2.0, 30.0, height), coast)
    }

    /// The land as the layouts carved it, with the towns' areas levelled.
    fn padded(&self, x: f64, y: f64) -> f64 {
        let (base, coast) = self.base_and_coast(x, y);
        let mut height = base + self.sculpts.raise(x, y, coast);
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
            let (distance, along) = near_segment((from.x, from.y), (to.x, to.y), x, y);
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
        if let Some(level) = self.pads.level_at(x, y) {
            return level;
        }
        let ground = self.padded(x, y);
        if let Some((river, distance)) = self.nearest(x, y, false) {
            let half = river.width / 2.0;
            if distance < half {
                // A trough levelling into its banks at the edge, so the channel meets them without a crease.
                let across = 1.0 - (distance / half) * (distance / half);
                return ground.min(river.level - river.depth * across * across);
            }
            // From the channel's edge (its surface, or the land where that lies lower, as in a lake it crosses) to the land.
            let edge = ground.min(river.level);
            return edge + (ground - edge) * smooth(half, half + BANK_M, distance);
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
        if self.pads.level_at(x, y).is_some() {
            return WaterAt::Dry;
        }
        if let Some((river, distance)) = self.nearest(x, y, false)
            && distance < river.width / 2.0
        {
            return WaterAt::River { surface: river.level };
        }
        let height = self.height_at(x, y);
        if let Some(surface) = self.lake_surface(x, y)
            && surface > height
        {
            return WaterAt::Lake { surface };
        }
        if height < 0.0 { WaterAt::Sea } else { WaterAt::Dry }
    }

    /// The surface of the lake reaching a point: the highest of the lake cells whose centre lies within a cell of it,
    /// across and down.
    /// A lake's cells fill its hollow and the cells round them stand above it, so its shore is where the ground meets
    /// its surface, between the cells. A lake level of 0 is no lake.
    fn lake_surface(&self, x: f64, y: f64) -> Option<f64> {
        let land = &self.land;
        let (grid_x, grid_y) = ((x - land.left_m) / land.cell_m - 0.5, (y - land.top_m) / land.cell_m - 0.5);
        let (i, j) = (grid_x.round() as isize, grid_y.round() as isize);
        let mut surface: Option<f64> = None;
        for row in j - 1..=j + 1 {
            for column in i - 1..=i + 1 {
                let Some(at) = land.index_of(column, row) else { continue };
                let (dx, dy) = (grid_x - column as f64, grid_y - row as f64);
                let level = self.lake_level[at];
                if level > 0.0 && dx.abs().max(dy.abs()) < 1.0 {
                    surface = Some(surface.map_or(level, |higher: f64| higher.max(level)));
                }
            }
        }
        surface
    }

    /// How far past fresh water's edge a point lies, metres, negative inside it: a lake's depth under its surface (or
    /// height above it on its shore), or the distance beyond a river's channel within its banks' reach. None where no
    /// fresh water is near. Drawn water follows this, so its edge is smooth wherever the ground is sampled.
    #[must_use]
    pub fn fresh_edge(&self, x: f64, y: f64) -> Option<f64> {
        // In the order water_at finds water: a river's channel, then a lake, then a river's banks.
        let river = self.nearest(x, y, false).map(|(river, distance)| distance - river.width / 2.0);
        if let Some(inside) = river.filter(|&edge| edge < 0.0) {
            return Some(inside);
        }
        // Both near: the nearer edge of either water, so a lake a cell off never hides a river's bank.
        let lake = self.lake_surface(x, y).map(|surface| self.height_at(x, y) - surface);
        match (lake, river) {
            (Some(lake), Some(river)) => Some(lake.min(river)),
            (lake, river) => lake.or(river),
        }
    }
}

/// A fingerprint of the ground's heights at the given points (FNV-1a over their bits): the same on every machine.
#[must_use]
pub fn sample_hash(ground: &Ground, points: &[(f64, f64)]) -> u64 {
    fingerprint(points.iter().map(|&(x, y)| ground.height_at(x, y)))
}

#[path = "ground_window.rs"]
mod window;

#[cfg(test)]
#[path = "ground_tests.rs"]
mod tests;
