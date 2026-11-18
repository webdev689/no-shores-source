//! A small cut of a landmass's ground that answers exactly as the whole does inside its rect, and the ground as it is
//! saved and loaded: what a node's room is handed at build time, since a whole landmass outgrows a room's memory.

use super::{BANK_M, CoursePoint, Ground, SHOULDER_M, TOWN_EDGE_M, TownPad};
use crate::grid::Grid;
use crate::pads::Pads;
use crate::sculpts::Sculpts;
use serde::Deserialize;
use std::collections::BTreeMap;

/// A ground as it is saved: everything but the course index.
#[derive(Debug, Deserialize)]
pub(super) struct SavedGround {
    land: Grid,
    lake_level: Vec<f64>,
    rivers: Vec<Vec<CoursePoint>>,
    roads: Vec<Vec<CoursePoint>>,
    towns: Vec<TownPad>,
    coast: Grid,
    across: Grid,
    #[serde(default)]
    pads: Pads,
    #[serde(default)]
    sculpts: Sculpts,
    seed: u32,
}

impl TryFrom<SavedGround> for Ground {
    type Error = String;

    /// A saved ground, refused unless every layer holds the land's cells, at least one, so sampling it never fails.
    fn try_from(saved: SavedGround) -> Result<Self, String> {
        let SavedGround { land, lake_level, rivers, roads, towns, coast, across, pads, sculpts, seed } = saved;
        let shape = |grid: &Grid| (grid.width, grid.height, grid.first_column, grid.first_row, grid.data.len());
        let cells = land.width.checked_mul(land.height).filter(|&cells| cells > 0 && cells == land.data.len());
        if cells.is_none() || shape(&coast) != shape(&land) || shape(&across) != shape(&land) {
            return Err("the land, coast and across layers must hold the same cells, at least one".to_owned());
        }
        if lake_level.len() != land.data.len() {
            return Err("the lake levels must hold one level for each cell".to_owned());
        }
        let mut ground =
            Ground { land, lake_level, rivers, roads, towns, coast, across, pads, sculpts, seed, index: BTreeMap::new() };
        ground.index_courses();
        Ok(ground)
    }
}

impl Ground {
    /// The ground over the rect between `west` and `east` and between `north` and `south`, world metres, cut small: its
    /// `height_at` and `water_at` give the same bits as this ground's anywhere in the rect. It keeps the cells the
    /// spline, the coast's meeting and the lakes read there, and each course and town that reaches into the rect, whole.
    #[must_use]
    pub fn window(&self, west: f64, north: f64, east: f64, south: f64) -> Self {
        let (west, east, north, south) = (west.min(east), west.max(east), north.min(south), north.max(south));
        let land = &self.land;
        // A point's spline reads from the cell before the one it starts in to two after; a lake's reach stays inside.
        let span = |low: f64, high: f64, origin: f64, first: usize, count: usize| {
            let cell = |at: f64| ((at - origin) / land.cell_m - 0.5).floor() as isize;
            let (first, last) = (first as isize, (first + count) as isize - 1);
            (cell(low) - 1).clamp(first, last) as usize..=(cell(high) + 2).clamp(first, last) as usize
        };
        let columns = span(west, east, land.left_m, land.first_column, land.width);
        let rows = span(north, south, land.top_m, land.first_row, land.height);
        let cut = |layer: &[f64]| land.cut(layer, columns.clone(), rows.clone());
        // A metre past every reach, so rounding never drops what touches the rect.
        let near = |(from_west, from_north, from_east, from_south): (f64, f64, f64, f64), reach: f64| {
            from_west - reach - 1.0 < east
                && from_east + reach + 1.0 > west
                && from_north - reach - 1.0 < south
                && from_south + reach + 1.0 > north
        };
        let reaches = |course: &[CoursePoint], beyond: f64| {
            course.windows(2).any(|pair| {
                let (from, to) = (pair[0], pair[1]);
                let bounds = (from.x.min(to.x), from.y.min(to.y), from.x.max(to.x), from.y.max(to.y));
                near(bounds, from.width.max(to.width) / 2.0 + beyond)
            })
        };
        let mut window = Ground {
            land: cut(&land.data),
            lake_level: cut(&self.lake_level).data,
            rivers: self.rivers.iter().filter(|course| reaches(course, BANK_M)).cloned().collect(),
            roads: self.roads.iter().filter(|course| reaches(course, SHOULDER_M)).cloned().collect(),
            towns: self.towns.iter().filter(|town| near(town.bounds, TOWN_EDGE_M)).cloned().collect(),
            coast: cut(&self.coast.data),
            across: cut(&self.across.data),
            pads: self.pads.within(west, north, east, south),
            sculpts: self.sculpts.within(west, north, east, south),
            seed: self.seed,
            index: BTreeMap::new(),
        };
        window.index_courses();
        window
    }
}
