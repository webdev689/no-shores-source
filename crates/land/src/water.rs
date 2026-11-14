//! The water over a landmass's ground: where the rain goes, the rivers it gathers into and the lakes that fill the
//! hollows. A river starts where the water a cell gathers first reaches RIVER_MIN_FLOW and runs down to the sea or
//! into a larger river; a lake fills a hollow to its spill wherever it stands LAKE_MIN_DEPTH_M deep.

use crate::drainage::{OUTLET, accumulate, route_flow};
use crate::grid::Grid;

/// The least flow a river carries, cubic metres a second.
pub const RIVER_MIN_FLOW: f64 = 1.0;
/// The share of the rain that runs off rather than soaking in or rising again.
pub const RUNOFF: f64 = 0.3;
pub const SECONDS_A_YEAR: f64 = 31_557_600.0;
/// The least depth a hollow holds as a lake, metres.
pub const LAKE_MIN_DEPTH_M: f64 = 0.5;

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
    let lake_level: Vec<f64> = (0..land.len())
        .map(|cell| {
            let depth = routing.filled[cell] - ground.data[cell];
            if land[cell] && depth >= LAKE_MIN_DEPTH_M { routing.filled[cell] } else { 0.0 }
        })
        .collect();
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
}
