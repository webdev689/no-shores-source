//! The water over a landmass's ground: where the rain goes, the rivers it gathers into and the lakes that fill the
//! hollows. A river starts where the water a cell gathers first reaches RIVER_MIN_FLOW and runs down to the sea or
//! into a larger river; a lake fills a hollow to its spill wherever it stands LAKE_MIN_DEPTH_M deep, out to the
//! hollow's shallow edge, so its shore is where the ground meets its surface, never the side of a cell.

use crate::drainage::{OUTLET, accumulate, route_flow};
use crate::grid::{D8_X, D8_Y, Grid};

/// The least flow a river carries, cubic metres a second.
pub const RIVER_MIN_FLOW: f64 = 1.0;
/// The share of the rain that runs off rather than soaking in or rising again.
pub const RUNOFF: f64 = 0.3;
pub const SECONDS_A_YEAR: f64 = 31_557_600.0;
/// The least depth a hollow holds as a lake, metres.
pub const LAKE_MIN_DEPTH_M: f64 = 0.5;
/// A lake reaches the cells round it that its water stands this deep over, at its level to this nearness, metres.
const LAKE_EDGE_DEPTH_M: f64 = 0.01;
const SAME_LEVEL_M: f64 = 0.05;

/// A river's width and depth for its flow, metres: World 2.0's river law (square roots only, so exact).
#[must_use]
pub fn river_width_m(flow: f64) -> f64 {
    2.4 * flow.sqrt() + 1.5
}

#[must_use]
pub fn river_depth_m(flow: f64) -> f64 {
    0.45 * flow.sqrt().sqrt() + 0.3
}

/// One river: its course through cell centres from source to mouth, world metres, with the flow at each point and
/// the level its water stands at there: the ground with every hollow filled, so across a lake it is the lake's.
#[derive(Debug, Clone, PartialEq)]
pub struct River {
    pub points: Vec<(f64, f64)>,
    pub flow: Vec<f64>,
    pub level: Vec<f64>,
}

/// The water of a landmass: its rivers, and each cell's lake surface in metres (0 where no lake stands).
#[derive(Debug, Clone, PartialEq)]
pub struct Water {
    pub rivers: Vec<River>,
    pub lake_level: Vec<f64>,
}

/// The water over `ground`, `land` marking the cells that are land and `rain_mm` the yearly rain.
#[must_use]
pub fn water(ground: &Grid, land: &[bool], rain_mm: f64) -> Water {
    let (width, height) = (ground.width, ground.height);
    let sea: Vec<bool> = land.iter().map(|&cell| !cell).collect();
    let routing = route_flow(&ground.data, width, height, ground.cell_m, &sea);
    let rain = vec![ground.cell_m * ground.cell_m * rain_mm / 1000.0 * RUNOFF / SECONDS_A_YEAR; land.len()];
    let flow = accumulate(&routing, &rain);
    let lake_level = lakes(ground, land, &routing.filled);
    let is_river = |cell: usize| land[cell] && flow[cell] >= RIVER_MIN_FLOW;
    let mut fed = vec![false; land.len()];
    for &cell in &routing.order {
        let receiver = routing.receiver[cell as usize];
        if is_river(cell as usize) && receiver != OUTLET {
            fed[receiver as usize] = true;
        }
    }
    let mut taken = vec![false; land.len()];
    let mut rivers = Vec::new();
    for &cell in routing.order.iter().rev() {
        let source = cell as usize;
        if !is_river(source) || fed[source] {
            continue;
        }
        let (mut points, mut flows, mut levels, mut at) = (Vec::new(), Vec::new(), Vec::new(), source);
        loop {
            points.push(ground.centre(at % width, at / width));
            flows.push(flow[at]);
            levels.push(routing.filled[at]);
            let receiver = routing.receiver[at];
            if taken[at] || receiver == OUTLET {
                break;
            }
            taken[at] = true;
            at = receiver as usize;
        }
        if points.len() >= 2 {
            rivers.push(River { points, flow: flows, level: levels });
        }
    }
    Water { rivers, lake_level }
}

/// Each cell's lake surface (0 where none): every hollow LAKE_MIN_DEPTH_M deep somewhere, and the cells round it its
/// water stands over at its level, out to its rim.
fn lakes(ground: &Grid, land: &[bool], filled: &[f64]) -> Vec<f64> {
    let depth = |cell: usize| filled[cell] - ground.data[cell];
    let mut level = vec![0.0; land.len()];
    let mut open: Vec<usize> = (0..land.len()).filter(|&cell| land[cell] && depth(cell) >= LAKE_MIN_DEPTH_M).collect();
    for &cell in &open {
        level[cell] = filled[cell];
    }
    let (width, height) = (ground.width as isize, ground.height as isize);
    while let Some(cell) = open.pop() {
        let (i, j) = ((cell % ground.width) as isize, (cell / ground.width) as isize);
        for (dx, dy) in D8_X.iter().zip(D8_Y) {
            let (column, row) = (i + dx, j + dy);
            if column < 0 || row < 0 || column >= width || row >= height {
                continue;
            }
            let next = (row * width + column) as usize;
            let joins = land[next]
                && level[next] == 0.0
                && depth(next) >= LAKE_EDGE_DEPTH_M
                && (filled[next] - filled[cell]).abs() <= SAME_LEVEL_M;
            if joins {
                level[next] = filled[next];
                open.push(next);
            }
        }
    }
    level
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rain_on_a_slope_gathers_into_a_river_to_the_sea() {
        // a tilted plane 60 km across, falling to the sea along its west side
        let mut ground = Grid::new(60, 30, 0.0, 0.0, 1000.0);
        let land: Vec<bool> = (0..ground.data.len()).map(|index| index % 60 != 0).collect();
        for (index, value) in ground.data.iter_mut().enumerate() {
            let (i, j) = (index % 60, index / 60);
            *value = if i == 0 { -5.0 } else { 10.0 * i as f64 + (j as f64 - 15.0).abs() * 30.0 };
        }
        let found = water(&ground, &land, 800.0);
        assert!(!found.rivers.is_empty(), "a river forms");
        let longest = found.rivers.iter().max_by_key(|river| river.points.len()).unwrap();
        assert!(longest.flow.windows(2).all(|pair| pair[1] >= pair[0]), "flow only grows downstream");
        assert!(longest.flow.last().unwrap() >= &RIVER_MIN_FLOW);
        assert!(found.lake_level.iter().all(|&level| level == 0.0), "a plane holds no lake");
        assert!((river_width_m(100.0) - 25.5).abs() < 1e-9);
    }

    #[test]
    fn a_lake_fills_its_whole_hollow_out_to_its_rim() {
        // A hollow on a plateau: a 2 m deep middle, a shallow ring 20 cm under the spill, and a rim at 10 m.
        let mut ground = Grid::new(9, 9, 0.0, 0.0, 1000.0);
        for (index, value) in ground.data.iter_mut().enumerate() {
            let (i, j) = ((index % 9) as i64 - 4, (index / 9) as i64 - 4);
            *value = match i.abs().max(j.abs()) {
                0 => 8.0,
                1 => 9.8,
                _ => 10.0 + (i.abs().max(j.abs()) as f64 - 2.0),
            };
        }
        let (land, filled) = (vec![true; 81], vec![10.0; 81]);
        let level = lakes(&ground, &land, &filled);
        assert_eq!(level[40], 10.0, "the deep middle");
        assert_eq!(level[30], 10.0, "the shallow ring is the same lake");
        assert_eq!(level[20], 0.0, "the rim stands at the spill: dry");
        let flat = lakes(&ground, &land, &ground.data);
        assert!(flat.iter().all(|&surface| surface == 0.0), "no hollow, no lake");
    }
}
