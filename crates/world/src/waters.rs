//! The sea's nine waters. A point of sea belongs to the island whose coast is nearest, by straight-line distance in
//! metres; each island's continent id names its water and its holder. Home waters reach `HOME_REACH_M` from their
//! coast; past it the Grey Tithe holds the open sea. Only + - * / and sqrt on f64, so every machine gives the same
//! answer.

use crate::check::{FRAME_HEIGHT_M, FRAME_WIDTH_M};
use crate::layout::Layout;
use std::collections::BTreeSet;

/// Who holds a water, or none.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Holder {
    /// Home waters, within `HOME_REACH_M` of their coast: no hostile ship.
    Home,
    /// Sunspire's and Rimeholt's waters.
    GreyTithe,
    /// The six ruined cities' waters. The Grey Tithe's ships sail them; the Lattice is met on land.
    Lattice,
}

impl Holder {
    /// The holder's name as the doors write it.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Holder::Home => "home",
            Holder::GreyTithe => "grey-tithe",
            Holder::Lattice => "lattice",
        }
    }
}

/// Each island's water: its continent id, its holder and its name.
pub const WATERS: [(&str, Holder, &str); 9] = [
    ("continent-1", Holder::Home, "The Lantern Sea"),
    ("continent-2", Holder::Lattice, "The Cairn Straits"),
    ("continent-3", Holder::Lattice, "The Elmwater"),
    ("continent-4", Holder::GreyTithe, "The Sunscorch Coves"),
    ("continent-5", Holder::Lattice, "The Gilded Reach"),
    ("continent-6", Holder::Lattice, "The Mistwrack"),
    ("continent-7", Holder::Lattice, "The Windward Levy"),
    ("continent-8", Holder::Lattice, "The Fen Deeps"),
    ("continent-9", Holder::GreyTithe, "The Rimeholt Deep"),
];

/// How far out from its coast a home water stays home, metres; past it the Grey Tithe holds the open sea.
pub const HOME_REACH_M: f64 = 10_000.0;

/// The grid cell `borders` judges on.
pub const BORDER_CELL_M: f64 = 10_000.0;

/// A grid cell's byte for land; a sea cell holds its water's continent index.
pub const LAND_CELL: u8 = 255;

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
    /// Its island water's holder.
    pub holder: Holder,
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
/// point in it.
#[derive(Debug, Clone)]
pub struct Waters {
    rings: Vec<Vec<[f64; 2]>>,
    /// Each ring's shoelace sign: the side of an edge its land lies on.
    orientation: Vec<f64>,
    holders: Vec<Holder>,
    edges: Vec<Edge>,
    columns: usize,
    rows: usize,
    nearest_lists: Vec<Vec<u32>>,
    /// Each static isle's centre and radius: land, but no island's water.
    isles: Vec<([f64; 2], f64)>,
    /// For each bucket, the isles that can be the nearest land to some point in it.
    isle_lists: Vec<Vec<u32>>,
}

/// The squared distance from a point to a segment, and how far along it the nearest point lies (0 at `from`, 1 at
/// `to`).
pub(crate) fn to_segment(point: [f64; 2], from: [f64; 2], to: [f64; 2]) -> (f64, f64) {
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
            .map(|continent| {
                // A corner written twice would leave an edge of no length, with no side for land.
                let mut ring: Vec<[f64; 2]> =
                    continent.outline.iter().map(|point| [point.x as f64, point.y as f64]).collect();
                ring.dedup();
                while ring.len() > 1 && ring.first() == ring.last() {
                    ring.pop();
                }
                ring
            })
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
        let columns = (FRAME_WIDTH_M as f64 / BUCKET_M).ceil() as usize;
        let rows = (FRAME_HEIGHT_M as f64 / BUCKET_M).ceil() as usize;
        let mut waters = Self {
            rings,
            orientation,
            holders,
            edges,
            columns,
            rows,
            nearest_lists: Vec::new(),
            isles: layout
                .isles
                .iter()
                .map(|isle| ([isle.centre.x as f64, isle.centre.y as f64], isle.radius_m as f64))
                .collect(),
            isle_lists: Vec::new(),
        };
        waters.fill_buckets();
        waters
    }

    /// Lists, for each bucket, every edge that can be nearest to some point in it. From the bucket's middle the
    /// nearest edge is `d` away, so every point in it has a coast within `d + h` (h the half diagonal), and an edge more
    /// than `d + 2h` from the middle is farther than that from every point in it. Isles are judged the same way against
    /// the nearest land of either kind.
    fn fill_buckets(&mut self) {
        let half_diagonal = BUCKET_M * std::f64::consts::FRAC_1_SQRT_2 + 1.0;
        let all: Vec<u32> = (0..self.edges.len() as u32).collect();
        // The edges that can be nearest to some point in the bucket, and the nearest one's distance from its middle.
        let within = |middle: [f64; 2], from: &[u32]| -> (Vec<u32>, f64) {
            let distances: Vec<f64> = from
                .iter()
                .map(|&edge| to_segment(middle, self.edges[edge as usize].from, self.edges[edge as usize].to).0.sqrt())
                .collect();
            let least = distances.iter().copied().fold(f64::INFINITY, f64::min);
            let reach = least + 2.0 * half_diagonal;
            let edges = from.iter().zip(&distances).filter(|&(_, &distance)| distance <= reach).map(|(&edge, _)| edge);
            (edges.collect(), least)
        };
        for row in 0..self.rows {
            for column in 0..self.columns {
                let middle = [(column as f64 + 0.5) * BUCKET_M, (row as f64 + 0.5) * BUCKET_M];
                let (edges, coast) = within(middle, &all);
                let reach = self.isle_gap(middle, 0..self.isles.len() as u32).min(coast) + 2.0 * half_diagonal;
                let isles =
                    (0..self.isles.len() as u32).filter(|&isle| self.isle_gap(middle, std::iter::once(isle)) <= reach);
                self.isle_lists.push(isles.collect());
                self.nearest_lists.push(edges);
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
    /// The squared distance and how far along the edge its nearest point lies come with it.
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

    /// Whether a point off the coast lies on the land side of its nearest edge. Where the nearest coast is a corner, the
    /// point lies in the corner's outward or inward wedge, where both edges' lines agree; on the line running on from
    /// one edge that edge says nothing, so the two signed distances from the edges' lines are summed and the other
    /// decides.
    fn on_land(&self, point: [f64; 2], fraction: f64, edge: Edge) -> bool {
        let sign = self.orientation[edge.continent];
        if fraction > 0.0 && fraction < 1.0 {
            return cross(edge.from, edge.to, point) * sign > 0.0;
        }
        let ring = &self.rings[edge.continent];
        let corner = if fraction <= 0.0 { edge.index } else { (edge.index + 1) % ring.len() };
        let (before, at, after) =
            (ring[(corner + ring.len() - 1) % ring.len()], ring[corner], ring[(corner + 1) % ring.len()]);
        let length = |from: [f64; 2], to: [f64; 2]| {
            ((to[0] - from[0]) * (to[0] - from[0]) + (to[1] - from[1]) * (to[1] - from[1])).sqrt()
        };
        (cross(before, at, point) / length(before, at) + cross(at, after, point) / length(at, after)) * sign > 0.0
    }

    /// The distance from a point to the nearest of these isles' coasts, 0 inside one; infinite for none.
    fn isle_gap(&self, point: [f64; 2], isles: impl Iterator<Item = u32>) -> f64 {
        isles
            .map(|isle| {
                let (centre, radius) = self.isles[isle as usize];
                let (dx, dy) = (point[0] - centre[0], point[1] - centre[1]);
                ((dx * dx + dy * dy).sqrt() - radius).max(0.0)
            })
            .fold(f64::INFINITY, f64::min)
    }

    /// The distance from a point to the nearest isle's coast, 0 inside one; infinite for a layout with none.
    fn nearest_isle(&self, point: [f64; 2]) -> f64 {
        match self.bucket(point) {
            Some(bucket) => self.isle_gap(point, self.isle_lists[bucket].iter().copied()),
            None => self.isle_gap(point, 0..self.isles.len() as u32),
        }
    }

    /// The nearest continent's coast to a point, and whether the point is on that continent; none for a layout with no
    /// continent, or for a point that is not a finite number.
    #[must_use]
    pub fn nearest(&self, point: [f64; 2]) -> Option<Nearest> {
        if !(point[0].is_finite() && point[1].is_finite()) {
            return None;
        }
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

    /// The distance from a point to the nearest coast of a continent or an isle, metres, as a ship would keep clear of
    /// it: 0 on land, and 0 for a point that is not a finite number.
    #[must_use]
    pub fn clearance(&self, point: [f64; 2]) -> f64 {
        if !(point[0].is_finite() && point[1].is_finite()) {
            return 0.0;
        }
        let coast = self
            .nearest(point)
            .map_or(f64::INFINITY, |nearest| if nearest.land { 0.0 } else { nearest.distance_squared.sqrt() });
        coast.min(self.nearest_isle(point))
    }

    /// The water at a point; none on land (a continent or an isle), for a layout with no continent, or for a point that
    /// is not a finite number. An isle's sea belongs to the island whose coast is nearest. A home water's sea past
    /// `HOME_REACH_M` from its coast is the Grey Tithe's.
    #[must_use]
    pub fn water_at(&self, point: [f64; 2]) -> Option<Water> {
        let nearest = self.nearest(point)?;
        if nearest.land || self.nearest_isle(point) == 0.0 {
            return None;
        }
        let holder = match self.holders[nearest.continent] {
            Holder::Home if nearest.distance_squared > HOME_REACH_M * HOME_REACH_M => Holder::GreyTithe,
            holder => holder,
        };
        Some(Water { continent: nearest.continent, holder })
    }

    /// A continent's water's holder near its coast; home waters for a continent the table does not name.
    #[must_use]
    pub fn holder(&self, continent: usize) -> Holder {
        self.holders[continent]
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

    /// The waters judged at the middle of each `cell_m` cell over the frame: the continent index for sea, and
    /// `LAND_CELL` for land. None for a cell that is not a positive finite number.
    #[must_use]
    pub fn grid(&self, cell_m: f64) -> Option<Grid> {
        if !(cell_m.is_finite() && cell_m > 0.0) {
            return None;
        }
        let columns = (FRAME_WIDTH_M as f64 / cell_m).ceil() as usize;
        let rows = (FRAME_HEIGHT_M as f64 / cell_m).ceil() as usize;
        let mut cells = Vec::with_capacity(columns * rows);
        for row in 0..rows {
            for column in 0..columns {
                let middle = [(column as f64 + 0.5) * cell_m, (row as f64 + 0.5) * cell_m];
                cells.push(match self.water_at(middle) {
                    None => LAND_CELL,
                    Some(water) => water.continent as u8,
                });
            }
        }
        Some(Grid { columns, rows, cell_m, cells })
    }

    /// Which waters touch: each pair of continent indices, lower first, whose sea cells lie side by side on a
    /// `BORDER_CELL_M` grid.
    #[must_use]
    pub fn borders(&self) -> Vec<[usize; 2]> {
        let Some(grid) = self.grid(BORDER_CELL_M) else { return Vec::new() };
        let water = |cell: u8| (cell != LAND_CELL).then_some(usize::from(cell));
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
