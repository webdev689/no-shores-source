//! The sea's nine waters. A point of sea belongs to the island whose coast is nearest, by straight-line distance in
//! metres; each island's continent id names its water and its holder. The sea near the border between the fourth and
//! eighth islands' waters is contested whatever its water's holder. Only + - * / and sqrt on f64, so every machine
//! gives the same answer.

use crate::check::{FRAME_HEIGHT_M, FRAME_WIDTH_M};
use crate::layout::Layout;
use std::collections::BTreeSet;

/// Who holds a water: the hostile ships it sends, or none.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Holder {
    /// Home waters: no hostile ship.
    Home,
    /// Pirates and the Grey Tithe, fighting each other.
    Contested,
    GreyTithe,
    Pirates,
}

impl Holder {
    /// The holder's name as the doors write it.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Holder::Home => "home",
            Holder::Contested => "contested",
            Holder::GreyTithe => "grey-tithe",
            Holder::Pirates => "pirates",
        }
    }
}

/// Each island's water: its continent id, its holder and its name.
pub const WATERS: [(&str, Holder, &str); 9] = [
    ("continent-1", Holder::Home, "The Lantern Sea"),
    ("continent-2", Holder::Contested, "The Cairn Straits"),
    ("continent-3", Holder::GreyTithe, "The Elmwater"),
    ("continent-4", Holder::Pirates, "The Sunscorch Coves"),
    ("continent-5", Holder::Pirates, "The Gilded Reach"),
    ("continent-6", Holder::Pirates, "The Mistwrack"),
    ("continent-7", Holder::GreyTithe, "The Windward Levy"),
    ("continent-8", Holder::GreyTithe, "The Fen Deeps"),
    ("continent-9", Holder::GreyTithe, "The Rimeholt Deep"),
];

/// The two islands whose waters meet along the contested seam.
pub const SEAM_CONTINENTS: [&str; 2] = ["continent-4", "continent-8"];

/// A seam point is at most this much farther from the other seam island's coast than from its own: about 100 km
/// either side of the border.
pub const SEAM_EXTRA_M: f64 = 200_000.0;

/// The grid cell `borders` judges on.
pub const BORDER_CELL_M: f64 = 10_000.0;

/// A grid cell's byte for land; a sea cell holds its water's continent index, with `SEAM_BIT` set on the seam.
pub const LAND_CELL: u8 = 255;
pub const SEAM_BIT: u8 = 0x80;

/// The side of a bucket of the acceleration grid, metres.
const BUCKET_M: f64 = 32_000.0;

/// A water's holder by its continent id; none for a continent the table does not name.
#[must_use]
pub fn holder_of(continent_id: &str) -> Option<Holder> {
    WATERS.iter().find(|(id, ..)| *id == continent_id).map(|&(_, holder, _)| holder)
}

/// A water's name by its continent id; none for a continent the table does not name.
#[must_use]
pub fn name_of(continent_id: &str) -> Option<&'static str> {
    WATERS.iter().find(|(id, ..)| *id == continent_id).map(|&(.., name)| name)
}

/// The water at a point of sea.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Water {
    /// The index in the layout of the continent whose coast is nearest.
    pub continent: usize,
    /// The water's holder; `Contested` on the seam.
    pub holder: Holder,
    /// Whether the point lies on the contested seam.
    pub seam: bool,
}

/// The sea's waters judged over the whole frame, cell by cell: `cells[row * columns + column]`.
#[derive(Debug, Clone, PartialEq)]
pub struct Grid {
    pub columns: usize,
    pub rows: usize,
    pub cell_m: f64,
    pub cells: Vec<u8>,
}

/// One edge of a coast, with the ring it belongs to and its place in it.
#[derive(Debug, Clone, Copy)]
struct Edge {
    from: [f64; 2],
    to: [f64; 2],
    continent: usize,
    index: usize,
}

/// The nearest coast to a point: its continent, the squared distance, and whether the point is on land.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Nearest {
    pub continent: usize,
    pub distance_squared: f64,
    pub land: bool,
}

/// The waters of a layout, with a bucket grid over the frame: each bucket lists the edges that can be nearest to some
/// point in it, and the edges of each seam island that can be its nearest.
#[derive(Debug, Clone)]
pub struct Waters {
    rings: Vec<Vec<[f64; 2]>>,
    /// Each ring's shoelace sign: the side of an edge its land lies on.
    orientation: Vec<f64>,
    holders: Vec<Holder>,
    edges: Vec<Edge>,
    seam: Option<[usize; 2]>,
    columns: usize,
    rows: usize,
    nearest_lists: Vec<Vec<u32>>,
    seam_lists: Vec<[Vec<u32>; 2]>,
}

/// The squared distance from a point to a segment, and how far along it the nearest point lies (0 at `from`, 1 at
/// `to`).
fn to_segment(point: [f64; 2], from: [f64; 2], to: [f64; 2]) -> (f64, f64) {
    let (along_x, along_y) = (to[0] - from[0], to[1] - from[1]);
    let (off_x, off_y) = (point[0] - from[0], point[1] - from[1]);
    let length_squared = along_x * along_x + along_y * along_y;
    let fraction = if length_squared == 0.0 {
        0.0
    } else {
        ((off_x * along_x + off_y * along_y) / length_squared).clamp(0.0, 1.0)
    };
    let (gap_x, gap_y) = (off_x - fraction * along_x, off_y - fraction * along_y);
    (gap_x * gap_x + gap_y * gap_y, fraction)
}

fn cross(origin: [f64; 2], a: [f64; 2], b: [f64; 2]) -> f64 {
    (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0])
}

impl Waters {
    /// The waters of a layout's continents. A continent the table does not name is held as home waters.
    #[must_use]
    pub fn new(layout: &Layout) -> Self {
        let rings: Vec<Vec<[f64; 2]>> = layout
            .continents
            .iter()
            .map(|continent| continent.outline.iter().map(|point| [point.x as f64, point.y as f64]).collect())
            .collect();
        let orientation = rings
            .iter()
            .map(|ring: &Vec<[f64; 2]>| {
                let doubled: f64 = (0..ring.len())
                    .map(|i| {
                        let (a, b) = (ring[i], ring[(i + 1) % ring.len()]);
                        a[0] * b[1] - b[0] * a[1]
                    })
                    .sum();
                doubled.signum()
            })
            .collect();
        let holders =
            layout.continents.iter().map(|continent| holder_of(&continent.id).unwrap_or(Holder::Home)).collect();
        let edges: Vec<Edge> = rings
            .iter()
            .enumerate()
            .flat_map(|(continent, ring)| {
                (0..ring.len()).map(move |index| Edge {
                    from: ring[index],
                    to: ring[(index + 1) % ring.len()],
                    continent,
                    index,
                })
            })
            .collect();
        let position = |id: &str| layout.continents.iter().position(|continent| continent.id == id);
        let seam = match (position(SEAM_CONTINENTS[0]), position(SEAM_CONTINENTS[1])) {
            (Some(first), Some(second)) => Some([first, second]),
            _ => None,
        };
        let columns = (FRAME_WIDTH_M as f64 / BUCKET_M).ceil() as usize;
        let rows = (FRAME_HEIGHT_M as f64 / BUCKET_M).ceil() as usize;
        let mut waters = Self {
            rings,
            orientation,
            holders,
            edges,
            seam,
            columns,
            rows,
            nearest_lists: Vec::new(),
            seam_lists: Vec::new(),
        };
        waters.fill_buckets();
        waters
    }

    /// Lists, for each bucket, every edge that can be nearest to some point in it. From the bucket's middle the
    /// nearest edge is `d` away, so every point in it has a coast within `d + h` (h the half diagonal), and an edge more
    /// than `d + 2h` from the middle is farther than that from every point in it.
    fn fill_buckets(&mut self) {
        let half_diagonal = BUCKET_M * std::f64::consts::FRAC_1_SQRT_2 + 1.0;
        let all: Vec<u32> = (0..self.edges.len() as u32).collect();
        let seam_edges: [Vec<u32>; 2] = self.seam.map_or_else(Default::default, |seam| {
            seam.map(|continent| {
                all.iter().copied().filter(|&edge| self.edges[edge as usize].continent == continent).collect()
            })
        });
        let within = |middle: [f64; 2], from: &[u32]| -> Vec<u32> {
            let distances: Vec<f64> = from
                .iter()
                .map(|&edge| to_segment(middle, self.edges[edge as usize].from, self.edges[edge as usize].to).0.sqrt())
                .collect();
            let reach = distances.iter().copied().fold(f64::INFINITY, f64::min) + 2.0 * half_diagonal;
            from.iter().zip(&distances).filter(|&(_, &distance)| distance <= reach).map(|(&edge, _)| edge).collect()
        };
        for row in 0..self.rows {
            for column in 0..self.columns {
                let middle = [(column as f64 + 0.5) * BUCKET_M, (row as f64 + 0.5) * BUCKET_M];
                self.nearest_lists.push(within(middle, &all));
                self.seam_lists.push([within(middle, &seam_edges[0]), within(middle, &seam_edges[1])]);
            }
        }
    }

    /// The bucket a point inside the frame falls in; none outside it.
    fn bucket(&self, point: [f64; 2]) -> Option<usize> {
        let inside =
            (0.0..=FRAME_WIDTH_M as f64).contains(&point[0]) && (0.0..=FRAME_HEIGHT_M as f64).contains(&point[1]);
        inside.then(|| {
            let column = ((point[0] / BUCKET_M) as usize).min(self.columns - 1);
            let row = ((point[1] / BUCKET_M) as usize).min(self.rows - 1);
            row * self.columns + column
        })
    }

    /// The nearest of these edges to a point; ties go to the lower continent index, then the lower edge.
    fn nearest_of(&self, point: [f64; 2], candidates: impl Iterator<Item = u32>) -> Option<(f64, f64, Edge)> {
        let mut best: Option<(f64, f64, Edge)> = None;
        for candidate in candidates {
            let edge = self.edges[candidate as usize];
            let (distance_squared, fraction) = to_segment(point, edge.from, edge.to);
            let better = best.is_none_or(|(least, _, held)| {
                distance_squared < least
                    || (distance_squared == least && (edge.continent, edge.index) < (held.continent, held.index))
            });
            if better {
                best = Some((distance_squared, fraction, edge));
            }
        }
        best
    }

    /// Whether the point lies on the land side of its nearest edge. Where the nearest coast is a corner, it is land
    /// when it lies inside the corner's angle: on the land side of both edges at a corner bulging out, of either at one
    /// cut in.
    fn on_land(&self, point: [f64; 2], fraction: f64, edge: Edge) -> bool {
        let ring = &self.rings[edge.continent];
        let sign = self.orientation[edge.continent];
        let landward = |from: [f64; 2], to: [f64; 2]| cross(from, to, point) * sign >= 0.0;
        if fraction > 0.0 && fraction < 1.0 {
            return landward(edge.from, edge.to);
        }
        let corner = if fraction <= 0.0 { edge.index } else { (edge.index + 1) % ring.len() };
        let before = ring[(corner + ring.len() - 1) % ring.len()];
        let (at, after) = (ring[corner], ring[(corner + 1) % ring.len()]);
        let bulging = cross(before, at, after) * sign > 0.0;
        if bulging { landward(before, at) && landward(at, after) } else { landward(before, at) || landward(at, after) }
    }

    /// The nearest coast to a point, and whether the point is on land; none for a layout with no continent.
    #[must_use]
    pub fn nearest(&self, point: [f64; 2]) -> Option<Nearest> {
        let found = match self.bucket(point) {
            Some(bucket) => self.nearest_of(point, self.nearest_lists[bucket].iter().copied()),
            None => self.nearest_of(point, 0..self.edges.len() as u32),
        };
        found.map(|(distance_squared, fraction, edge)| Nearest {
            continent: edge.continent,
            distance_squared,
            land: distance_squared == 0.0 || self.on_land(point, fraction, edge),
        })
    }

    /// The distance from a point to the nearest coast, metres, as a ship would keep clear of it: 0 on land.
    #[must_use]
    pub fn clearance(&self, point: [f64; 2]) -> f64 {
        self.nearest(point)
            .map_or(f64::INFINITY, |nearest| if nearest.land { 0.0 } else { nearest.distance_squared.sqrt() })
    }

    /// The water at a point; none on land (or for a layout with no continent).
    #[must_use]
    pub fn water_at(&self, point: [f64; 2]) -> Option<Water> {
        let nearest = self.nearest(point)?;
        if nearest.land {
            return None;
        }
        let seam = self.on_seam(point, nearest);
        let holder = if seam { Holder::Contested } else { self.holders[nearest.continent] };
        Some(Water { continent: nearest.continent, holder, seam })
    }

    fn on_seam(&self, point: [f64; 2], nearest: Nearest) -> bool {
        let Some(seam) = self.seam else { return false };
        let Some(own) = seam.iter().position(|&continent| continent == nearest.continent) else { return false };
        let other = 1 - own;
        let other_edges: Vec<u32> = match self.bucket(point) {
            Some(bucket) => self.seam_lists[bucket][other].clone(),
            None => (0..self.edges.len() as u32)
                .filter(|&edge| self.edges[edge as usize].continent == seam[other])
                .collect(),
        };
        self.nearest_of(point, other_edges.into_iter()).is_some_and(|(distance_squared, ..)| {
            distance_squared.sqrt() - nearest.distance_squared.sqrt() <= SEAM_EXTRA_M
        })
    }

    /// The continent count of the layout the waters were made from.
    #[must_use]
    pub fn continent_count(&self) -> usize {
        self.rings.len()
    }

    /// A continent's coast as the waters hold it.
    #[must_use]
    pub fn ring(&self, continent: usize) -> &[[f64; 2]] {
        &self.rings[continent]
    }

    /// The waters judged at the middle of each `cell_m` cell over the frame: the continent index for sea, with
    /// `SEAM_BIT` on the seam, and `LAND_CELL` for land.
    #[must_use]
    pub fn grid(&self, cell_m: f64) -> Grid {
        let columns = (FRAME_WIDTH_M as f64 / cell_m).ceil() as usize;
        let rows = (FRAME_HEIGHT_M as f64 / cell_m).ceil() as usize;
        let mut cells = Vec::with_capacity(columns * rows);
        for row in 0..rows {
            for column in 0..columns {
                let middle = [(column as f64 + 0.5) * cell_m, (row as f64 + 0.5) * cell_m];
                cells.push(match self.water_at(middle) {
                    None => LAND_CELL,
                    Some(water) => (water.continent as u8 & !SEAM_BIT) | if water.seam { SEAM_BIT } else { 0 },
                });
            }
        }
        Grid { columns, rows, cell_m, cells }
    }

    /// Which waters touch: each pair of continent indices, lower first, whose sea cells lie side by side on a
    /// `BORDER_CELL_M` grid.
    #[must_use]
    pub fn borders(&self) -> Vec<[usize; 2]> {
        let grid = self.grid(BORDER_CELL_M);
        let water = |cell: u8| (cell != LAND_CELL).then_some(usize::from(cell & !SEAM_BIT));
        let mut pairs = BTreeSet::new();
        for row in 0..grid.rows {
            for column in 0..grid.columns {
                let here = water(grid.cells[row * grid.columns + column]);
                let right = (column + 1 < grid.columns).then(|| water(grid.cells[row * grid.columns + column + 1]));
                let below = (row + 1 < grid.rows).then(|| water(grid.cells[(row + 1) * grid.columns + column]));
                for there in [right, below].into_iter().flatten() {
                    if let (Some(a), Some(b)) = (here, there)
                        && a != b
                    {
                        pairs.insert([a.min(b), a.max(b)]);
                    }
                }
            }
        }
        pairs.into_iter().collect()
    }
}

#[cfg(test)]
#[path = "waters_tests.rs"]
pub(crate) mod tests;
