//! The land before the water works it: each landmass's window on the world, which cells are land (the painted
//! coast decides, never the heights), how far each cell is from the coast, and the relief the generator lays down.
//! Land rises inland from the coast; ranges stand where a slow ridge network crosses the interior; the hills' grain
//! grows with height. The coast stays where it was painted: land never falls below LAND_FLOOR_M.

use crate::exact::{clamp, fbm, ridged, seed_of, smooth};
use crate::grid::Grid;
use crate::ground::near_segment;
use world::check::{FRAME_HEIGHT_M, FRAME_WIDTH_M};
use world::geometry::Point;

/// The land grid's cell, metres: the same square kilometre the World Editor paints.
pub const CELL_M: f64 = 1000.0;
/// Sea kept around a landmass's coast in its window, metres.
pub const MARGIN_M: i64 = 40_000;
/// The lowest land and the highest seabed, metres: the painted coast stays the coast.
pub const LAND_FLOOR_M: f64 = 1.0;
pub const SEA_CEILING_M: f64 = -2.0;
/// How far from the painted coast a cell's distance to it is kept, metres; further cells hold this.
pub const COAST_REACH_M: f64 = 6000.0;

/// The climate a landmass is generated in: its biome's (biome.rs), or `PLACEHOLDER` for a landmass with none.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Climate {
    pub rain_mm: f64,
    pub rugged: f64,
    pub range_m: f64,
}

pub const PLACEHOLDER: Climate = Climate { rain_mm: 800.0, rugged: 1.0, range_m: 2600.0 };

/// A landmass's window: whole cells over its coast and MARGIN_M of sea, clamped to the frame.
#[must_use]
pub fn window(outline: &[Point]) -> Grid {
    let cell = CELL_M as i64;
    let (mut west, mut north, mut east, mut south) = (i64::MAX, i64::MAX, i64::MIN, i64::MIN);
    for point in outline {
        (west, north, east, south) = (west.min(point.x), north.min(point.y), east.max(point.x), south.max(point.y));
    }
    let west = ((west - MARGIN_M).max(0) / cell) * cell;
    let north = ((north - MARGIN_M).max(0) / cell) * cell;
    let east = ((east + MARGIN_M).min(FRAME_WIDTH_M) + cell - 1) / cell * cell;
    let south = ((south + MARGIN_M).min(FRAME_HEIGHT_M) + cell - 1) / cell * cell;
    let width = ((east - west) / cell).max(1) as usize;
    let height = ((south - north) / cell).max(1) as usize;
    Grid::new(width, height, west as f64, north as f64, CELL_M)
}

/// Which cells of a window are land: those whose centre lies inside the coast (even-odd, row by row), the rule the
/// World Editor fills an outline by.
#[must_use]
pub fn land_mask(window: &Grid, outline: &[Point]) -> Vec<bool> {
    let mut land = vec![false; window.data.len()];
    for j in 0..window.height {
        let y = window.top_m + (j as f64 + 0.5) * window.cell_m;
        let mut crossings: Vec<f64> = Vec::new();
        for (index, from) in outline.iter().enumerate() {
            let to = outline[(index + 1) % outline.len()];
            let (from_y, to_y) = (from.y as f64, to.y as f64);
            if (from_y > y) == (to_y > y) {
                continue;
            }
            crossings.push(from.x as f64 + (y - from_y) / (to_y - from_y) * (to.x - from.x) as f64);
        }
        crossings.sort_by(f64::total_cmp);
        for pair in crossings.chunks_exact(2) {
            let first = ((pair[0] - window.left_m) / window.cell_m - 0.5).ceil().max(0.0) as usize;
            let last = ((pair[1] - window.left_m) / window.cell_m - 0.5).floor();
            if last < 0.0 {
                continue;
            }
            for i in first..=(last as usize).min(window.width - 1) {
                land[j * window.width + i] = true;
            }
        }
    }
    land
}

/// Each cell's distance in kilometres to the nearest cell of the other kind (land to sea, sea to land): a two-pass
/// chamfer over the eight neighbours.
#[must_use]
pub fn coast_distance_km(window: &Grid, land: &[bool]) -> Vec<f64> {
    let (width, height) = (window.width, window.height);
    let step = window.cell_m / 1000.0;
    let diagonal = step * std::f64::consts::SQRT_2;
    let far = 1e9;
    let mut distance: Vec<f64> = (0..land.len())
        .map(|index| {
            let (i, j) = (index % width, index / width);
            let border = [(0, -1), (-1, 0), (1, 0), (0, 1)].iter().any(|&(dx, dy)| {
                let (column, row) = (i as isize + dx, j as isize + dy);
                column >= 0
                    && row >= 0
                    && (column as usize) < width
                    && (row as usize) < height
                    && land[row as usize * width + column as usize] != land[index]
            });
            if border { step * 0.5 } else { far }
        })
        .collect();
    let mut relax = |index: usize, column: isize, row: isize, cost: f64| {
        if column < 0 || row < 0 || column as usize >= width || row as usize >= height {
            return;
        }
        let other = row as usize * width + column as usize;
        if land[other] == land[index] && distance[other] + cost < distance[index] {
            distance[index] = distance[other] + cost;
        }
    };
    for j in 0..height {
        for i in 0..width {
            let (index, column, row) = (j * width + i, i as isize, j as isize);
            relax(index, column - 1, row, step);
            relax(index, column, row - 1, step);
            relax(index, column - 1, row - 1, diagonal);
            relax(index, column + 1, row - 1, diagonal);
        }
    }
    for j in (0..height).rev() {
        for i in (0..width).rev() {
            let (index, column, row) = (j * width + i, i as isize, j as isize);
            relax(index, column + 1, row, step);
            relax(index, column, row + 1, step);
            relax(index, column + 1, row + 1, diagonal);
            relax(index, column - 1, row + 1, diagonal);
        }
    }
    distance
}

/// Each cell centre's distance from the painted coast, metres, positive on land and negative at sea, held within
/// COAST_REACH_M: the line the ground's coast runs along between the cells (ground.rs).
#[must_use]
pub fn coast_signed_m(window: &Grid, outline: &[Point], land: &[bool]) -> Grid {
    let mut distance = window.like(COAST_REACH_M);
    let cell = |metres: f64, origin: f64, size: usize| {
        (((metres - origin) / window.cell_m - 0.5).floor().max(0.0) as usize).min(size - 1)
    };
    for (index, from) in outline.iter().enumerate() {
        let to = outline[(index + 1) % outline.len()];
        let (from, to) = ((from.x as f64, from.y as f64), (to.x as f64, to.y as f64));
        let (first_i, last_i) = (
            cell(from.0.min(to.0) - COAST_REACH_M, window.left_m, window.width),
            cell(from.0.max(to.0) + COAST_REACH_M, window.left_m, window.width),
        );
        let (first_j, last_j) = (
            cell(from.1.min(to.1) - COAST_REACH_M, window.top_m, window.height),
            cell(from.1.max(to.1) + COAST_REACH_M, window.top_m, window.height),
        );
        for j in first_j..=last_j {
            for i in first_i..=last_i {
                let (x, y) = window.centre(i, j);
                let nearest = &mut distance.data[j * window.width + i];
                *nearest = nearest.min(near_segment(from, to, x, y).0);
            }
        }
    }
    for (value, &inside) in distance.data.iter_mut().zip(land) {
        if !inside {
            *value = -*value;
        }
    }
    distance
}

/// The relief the generator lays down, metres, and where the land is being raised (0..1) so erosion keeps its tops.
#[must_use]
pub fn relief(window: &Grid, land: &[bool], coast_km: &[f64], seed: u32, climate: Climate) -> (Grid, Grid) {
    let seed = seed_of(seed, "relief");
    let (mut elevation, mut uplift) = (window.like(0.0), window.like(0.0));
    for index in 0..land.len() {
        let (x, y) = window.centre(index % window.width, index / window.width);
        let (km_x, km_y) = (x / 1000.0, y / 1000.0);
        let distance = coast_km[index];
        if !land[index] {
            let depth = 12.0 + 2.5 * distance + 6.0 * fbm(seed.wrapping_add(11), km_x / 25.0, km_y / 25.0, 3);
            elevation.data[index] = (-depth).clamp(-400.0, SEA_CEILING_M);
            continue;
        }
        let upland =
            smooth(4.0, 140.0, distance) * (0.65 + 0.35 * fbm(seed.wrapping_add(1), km_x / 300.0, km_y / 300.0, 2));
        let network = ridged(seed.wrapping_add(2), km_x / 380.0, km_y / 380.0, 3);
        let lift = smooth(0.55, 0.85, network) * smooth(10.0, 70.0, distance);
        let warp_u = 1.6 * fbm(seed.wrapping_add(7), km_x / 18.0, km_y / 18.0, 2);
        let warp_v = 1.6 * fbm(seed.wrapping_add(8), km_x / 18.0, km_y / 18.0, 2);
        let crest = 0.65 * ridged(seed.wrapping_add(3), km_x / 30.0 + warp_u, km_y / 30.0 + warp_v, 4)
            + 0.35 * ridged(seed.wrapping_add(9), km_x / 12.0, km_y / 12.0, 3);
        let range = climate.range_m * lift * (0.45 + 0.55 * crest) * smooth(0.0, 0.35, lift);
        let amplitude = climate.rugged * (40.0 + 110.0 * upland + 160.0 * lift);
        let height = 2.0 + 650.0 * upland + range + amplitude * fbm(seed.wrapping_add(4), km_x / 9.0, km_y / 9.0, 5);
        elevation.data[index] = height.max(LAND_FLOOR_M + 1.0);
        uplift.data[index] = clamp(0.75 * lift + 0.25 * upland, 0.0, 1.0);
    }
    (elevation, uplift)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn square(west: i64, north: i64, side: i64) -> Vec<Point> {
        vec![
            Point::new(west, north),
            Point::new(west + side, north),
            Point::new(west + side, north + side),
            Point::new(west, north + side),
        ]
    }

    #[test]
    fn the_window_holds_the_coast_and_its_margin_in_whole_cells() {
        let grid = window(&square(100_000, 200_000, 50_000));
        assert_eq!((grid.left_m, grid.top_m), (60_000.0, 160_000.0));
        assert_eq!((grid.width, grid.height), (130, 130));
        let land = land_mask(&grid, &square(100_000, 200_000, 50_000));
        assert_eq!(land.iter().filter(|&&cell| cell).count(), 2500, "a 50 km square is 2,500 cells");
    }

    #[test]
    fn land_stays_above_the_sea_and_rises_inland() {
        let outline = square(100_000, 200_000, 300_000);
        let grid = window(&outline);
        let land = land_mask(&grid, &outline);
        let coast = coast_distance_km(&grid, &land);
        let (elevation, _) = relief(&grid, &land, &coast, 42, PLACEHOLDER);
        for (index, &is_land) in land.iter().enumerate() {
            assert_eq!(elevation.data[index] > 0.0, is_land, "cell {index}");
        }
        let centre = (grid.height / 2) * grid.width + grid.width / 2;
        assert!(coast[centre] > 140.0 && coast[centre] < 160.0, "{}", coast[centre]);
        let mean = |cells: Vec<usize>| cells.iter().map(|&cell| elevation.data[cell]).sum::<f64>() / cells.len() as f64;
        let inland = mean((0..land.len()).filter(|&cell| land[cell] && coast[cell] > 100.0).collect());
        let shore = mean((0..land.len()).filter(|&cell| land[cell] && coast[cell] < 5.0).collect());
        assert!(inland > shore + 200.0, "inland {inland}, shore {shore}");
    }

    #[test]
    fn each_cell_knows_its_distance_from_the_painted_coast_and_its_side() {
        let outline = vec![Point::new(100_000, 200_000), Point::new(140_000, 200_000), Point::new(100_000, 240_000)];
        let grid = window(&outline);
        let land = land_mask(&grid, &outline);
        let coast = coast_signed_m(&grid, &outline, &land);
        for (index, &value) in coast.data.iter().enumerate() {
            assert_eq!(value.is_sign_positive(), land[index], "cell {index}");
            assert!(value.abs() <= COAST_REACH_M);
        }
        // The diagonal coast is x + y = 340 km: the centre (120.5, 219.5) km lies on it, (121.5, 219.5) beyond it.
        let at =
            |x: f64, y: f64| coast.get(((x - grid.left_m) / 1000.0) as isize, ((y - grid.top_m) / 1000.0) as isize);
        assert!(at(120_500.0, 219_500.0).abs() < 1e-9);
        assert!((at(121_500.0, 219_500.0) + 1000.0 / std::f64::consts::SQRT_2).abs() < 1e-9);
        assert!((at(103_500.0, 204_500.0) - 3_500.0).abs() < 1e-9, "the west coast is nearest");
        assert_eq!(at(60_500.0, 160_500.0), -COAST_REACH_M, "far out at sea");
    }
}
