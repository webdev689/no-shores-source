//! Erosion, World 2.0's law: stream power with an implicit step (Braun and Willett 2013, n = 1). A river cuts in
//! proportion to the square root of the rain it gathers and its slope; what it cuts is carried down and laid where the
//! slope can no longer carry it, and a lake keeps all it is given; a slope steeper than the rock stands slides. Every
//! pass walks the drainage order, so the result is the same on any machine. The painted coast holds: land stays land.

use crate::drainage::{OUTLET, hollows, neighbour, on_edge, route_flow};
use crate::grid::{D8_LENGTH, Grid};
use crate::relief::LAND_FLOOR_M;

/// Years a step.
pub const STEP_YEARS: f64 = 2000.0;
/// The stream's erodibility, per year, for metres of square-rooted rain-area.
pub const ERODIBILITY: f64 = 3.2e-6;
/// The land's rise where the uplift is whole, metres a year.
pub const UPLIFT_RATE: f64 = 1.5e-4;
/// What a stream can carry, as a share of what it could cut on the same slope.
pub const SEDIMENT_CARRY: f64 = 1.2;
/// Thermal passes a step, and the share of a slope's excess moved a pass.
pub const SLIDE_PASSES: usize = 2;
pub const SLIDE_SHARE: f64 = 0.2;
/// The steepest slope the land stands at over a whole cell (rise over run).
pub const TALUS: f64 = 0.35;
/// The most a cell is built up a step, metres: a fan grows, it never dams its own stream in one step.
pub const LAY_MAX: f64 = 0.5;

/// Works `elevation` for `steps` steps; `uplift` (0..1) raises the ranges as the water cuts them.
#[must_use]
pub fn erode(elevation: &Grid, uplift: &Grid, land: &[bool], rain_mm: f64, steps: usize) -> Grid {
    let (width, height, cell_m) = (elevation.width, elevation.height, elevation.cell_m);
    let count = width * height;
    let area = cell_m * cell_m;
    let sea: Vec<bool> = land.iter().map(|&cell| !cell).collect();
    let fixed: Vec<bool> = (0..count).map(|index| on_edge(index, width, height) || sea[index]).collect();
    let inner: Vec<usize> = (0..count).filter(|&index| !fixed[index]).collect();
    let mut ground = elevation.data.clone();
    let rain = vec![area * rain_mm / 1000.0; count];
    let (mut eroded, mut load, mut delta) = (vec![0.0; count], vec![0.0; count], vec![0.0; count]);
    for _ in 0..steps {
        let routing = route_flow(&ground, width, height, cell_m, &sea);
        let gathered = crate::drainage::accumulate(&routing, &rain);
        // The lakes are the hollows of the ground the flood routed, found before any cell is cut: afterwards every
        // cut cell would sit under its old filled level and look flooded.
        let pools = hollows(&routing, &ground, width, height, 0.0);
        let mut pool_of = vec![usize::MAX; count];
        for (pool, hollow) in pools.iter().enumerate() {
            for &cell in &hollow.cells {
                pool_of[cell as usize] = pool;
            }
        }
        for &cell in &routing.order {
            let cell = cell as usize;
            eroded[cell] = 0.0;
            let receiver = routing.receiver[cell];
            if receiver == OUTLET || fixed[cell] {
                continue;
            }
            let rise = STEP_YEARS * UPLIFT_RATE * uplift.data[cell];
            if routing.filled[cell] > ground[cell] + 1e-6 {
                ground[cell] += rise;
                continue;
            }
            let power = STEP_YEARS * ERODIBILITY * gathered[cell].sqrt() / routing.distance[cell];
            let next = (ground[cell] + rise + power * ground[receiver as usize]) / (1.0 + power);
            eroded[cell] = (ground[cell] + rise - next).max(0.0);
            ground[cell] = next;
        }
        load.fill(0.0);
        let mut held = vec![0.0; pools.len()];
        for &cell in routing.order.iter().rev() {
            let cell = cell as usize;
            load[cell] += eroded[cell] * area;
            let receiver = routing.receiver[cell];
            if receiver == OUTLET {
                continue;
            }
            if pool_of[cell] != usize::MAX {
                held[pool_of[cell]] += load[cell];
                load[cell] = 0.0;
                continue;
            }
            let slope = (ground[cell] - ground[receiver as usize]).max(0.0) / routing.distance[cell];
            let carry = SEDIMENT_CARRY * STEP_YEARS * ERODIBILITY * gathered[cell].sqrt() * slope * area;
            if load[cell] > carry {
                let lay = ((load[cell] - carry) * 0.5 / area).min(LAY_MAX);
                ground[cell] += lay;
                load[cell] -= lay * area;
            }
            load[receiver as usize] += load[cell];
        }
        for (pool, hollow) in pools.iter().enumerate() {
            let lay = held[pool] / (hollow.cells.len() as f64 * area);
            for &cell in &hollow.cells {
                let cell = cell as usize;
                ground[cell] += lay.min(routing.filled[cell] - ground[cell]);
            }
        }
        for _ in 0..SLIDE_PASSES {
            delta.fill(0.0);
            for &cell in &inner {
                for (direction, length) in D8_LENGTH.iter().enumerate() {
                    let Some(next) = neighbour(cell, direction, width, height) else { continue };
                    let excess = ground[cell] - ground[next] - TALUS * length * cell_m;
                    if excess > 0.0 {
                        let moved = SLIDE_SHARE * excess / 8.0;
                        delta[cell] -= moved;
                        delta[next] += moved;
                    }
                }
            }
            for &cell in &inner {
                ground[cell] += delta[cell];
            }
        }
        for &cell in &inner {
            ground[cell] = ground[cell].max(LAND_FLOOR_M);
        }
    }
    Grid { data: ground, ..elevation.clone() }
}

/// Erosion on a grid `factor` times coarser, its work laid back on the fine land: each fine cell gains what erosion
/// changed under it (bilinear between the coarse cells), so valleys and fans follow the water while the fine relief
/// keeps its grain. A coarse cell is land when most of its fine cells are.
#[must_use]
pub fn erode_coarse(elevation: &Grid, uplift: &Grid, land: &[bool], rain_mm: f64, steps: usize, factor: usize) -> Grid {
    let (width, height) = (elevation.width.div_ceil(factor), elevation.height.div_ceil(factor));
    let mut coarse = Grid::new(width, height, elevation.left_m, elevation.top_m, elevation.cell_m * factor as f64);
    let mut coarse_uplift = coarse.clone();
    let mut coarse_land = vec![false; width * height];
    for j in 0..height {
        for i in 0..width {
            let (mut sum, mut lift, mut count, mut lands) = (0.0, 0.0, 0.0, 0);
            for fine_j in j * factor..((j + 1) * factor).min(elevation.height) {
                for fine_i in i * factor..((i + 1) * factor).min(elevation.width) {
                    let fine = fine_j * elevation.width + fine_i;
                    sum += elevation.data[fine];
                    lift += uplift.data[fine];
                    count += 1.0;
                    lands += usize::from(land[fine]);
                }
            }
            let index = j * width + i;
            coarse_land[index] = 2 * lands > count as usize;
            let mean = sum / count;
            coarse.data[index] = if coarse_land[index] { mean.max(LAND_FLOOR_M) } else { mean.min(-LAND_FLOOR_M) };
            coarse_uplift.data[index] = lift / count;
        }
    }
    let worked = erode(&coarse, &coarse_uplift, &coarse_land, rain_mm, steps);
    let change =
        Grid { data: worked.data.iter().zip(&coarse.data).map(|(after, before)| after - before).collect(), ..coarse };
    let mut out = elevation.clone();
    for (index, value) in out.data.iter_mut().enumerate() {
        if !land[index] {
            continue;
        }
        let (x, y) = elevation.centre(index % elevation.width, index / elevation.width);
        *value = (*value + change.at(x, y)).max(LAND_FLOOR_M);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::relief::{PLACEHOLDER, coast_distance_km, land_mask, relief, window};
    use world::geometry::Point;

    #[test]
    fn what_a_slope_loses_reaches_the_sea() {
        // a plain ramp with no hollow, falling west to the sea: whatever the streams cut must leave the land
        let mut elevation = Grid::new(40, 20, 0.0, 0.0, 1000.0);
        let land: Vec<bool> = (0..800).map(|index| index % 40 > 1).collect();
        for (index, value) in elevation.data.iter_mut().enumerate() {
            let (i, j) = (index % 40, index / 40);
            *value = if i > 1 { 20.0 * i as f64 + 2.0 * (j as f64 - 10.0).abs() } else { -10.0 };
        }
        let still = elevation.like(0.0);
        let worked = erode(&elevation, &still, &land, 800.0, 1);
        let volume = |grid: &Grid| (0..800).filter(|&index| land[index]).map(|index| grid.data[index]).sum::<f64>();
        // One step cuts about 79 metre-cells from this ramp; finding the lakes after the cut laid a third of it back.
        let lost = volume(&elevation) - volume(&worked);
        assert!(lost > 70.0, "what the streams cut leaves the land: {lost}");
    }

    #[test]
    fn erosion_cuts_the_land_and_keeps_the_coast() {
        let outline =
            vec![Point::new(0, 0), Point::new(120_000, 0), Point::new(120_000, 90_000), Point::new(0, 90_000)];
        let grid = window(&outline);
        let land = land_mask(&grid, &outline);
        let coast = coast_distance_km(&grid, &land);
        let (elevation, uplift) = relief(&grid, &land, &coast, 5, PLACEHOLDER);
        let worked = erode(&elevation, &uplift, &land, PLACEHOLDER.rain_mm, 12);
        let mut changed = 0;
        for (index, &is_land) in land.iter().enumerate() {
            assert_eq!(worked.data[index] > 0.0, is_land, "the coast holds at {index}");
            if (worked.data[index] - elevation.data[index]).abs() > 0.5 {
                changed += 1;
            }
        }
        assert!(changed > 1000, "the water works the land: {changed} cells changed");
        assert_eq!(worked, erode(&elevation, &uplift, &land, PLACEHOLDER.rain_mm, 12), "the same on every run");
    }
}
