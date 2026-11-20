//! A hamlet's terraces where the brief asks for heights (basins.rs): its blocks step up its hillside, each on a terrace
//! of its own with a ramp up from the plaza.

use crate::areas::Area;
use crate::basins::{RAMP_HALF_M, RAMP_STEEPEST, TALLEST_LEVEL_M, TERRACE_EDGE_M, middle_of, off_ways, ramp_run};
use crate::field::distance;
use crate::paths::{Path, rect_off_line};
use crate::seat::Seating;

/// How much higher each of a hamlet's blocks stands than the one below it up its hillside, a share of the massif's
/// height, where the brief asks for heights; how far its terrace reaches past its block's tile, metres, so what stands
/// at the tile's edge keeps room before its doors; and its terrace's strips' widest half, metres.
const HAMLET_STEP: f64 = 0.08;
const STEP_ROOM_M: f64 = 5.0;
const STRIP_HALF_M: f64 = 6.0;
/// The least a block steps up to be worth its ramp, a share of the massif's height (about a metre).
const LEAST_STEP: f64 = 0.03;

/// A hamlet's terraces where the brief asks for heights: its blocks up its hillside (by the ground their buildings were
/// seated on), each a step higher than the last on a terrace over its whole tile and `STEP_ROOM_M` past it, with a
/// ramp straight up to it from the plaza at the hamlet's middle, at a lower step where its lane holds no longer a
/// ramp. The lowest block, and any a way runs into (the block holding the hub its ways end at), stand on the plaza's
/// floor; so does a block whose ramp would run along a way or whose terrace would stand across a building. A terrace
/// is laid as level strips across its tile (`STRIP_HALF_M` each), so its edge runs square along the tile's; the
/// strips stand on one ramp between them.
pub(crate) fn steps(area: &Area, seating: &Seating, paths: &[Path]) -> Vec<[f64; 7]> {
    let half = city::grid::CELL_M / 2.0 + STEP_ROOM_M;
    let square = |[x, y]: [f64; 2]| [x - half, y - half, x + half, y + half];
    let inside =
        |[west, north, east, south]: [f64; 4], [x, y]: [f64; 2]| x >= west && x <= east && y >= north && y <= south;
    // Each of its blocks with the ground its buildings were seated on, lowest first.
    let mut blocks: Vec<([f64; 2], f64)> = seating
        .blocks
        .iter()
        .filter(|block| distance(block.at, area.at) <= area.radius)
        .filter_map(|block| {
            let heights: Vec<f64> = seating
                .buildings
                .iter()
                .filter(|building| inside(square(block.at), middle_of(building.footprint)))
                .map(|building| building.at[2])
                .collect();
            (!heights.is_empty()).then(|| (block.at, heights.iter().sum::<f64>() / heights.len() as f64))
        })
        .collect();
    blocks.sort_by(|first, second| first.1.total_cmp(&second.1));
    let way_into = |tile: [f64; 4]| {
        paths.iter().any(|path| {
            let reach = path.tier.width() / 2.0 + TERRACE_EDGE_M;
            path.points.windows(2).any(|pair| rect_off_line(tile, pair[0], pair[1]) <= reach)
        })
    };
    // Every building wholly on the terrace or clear of its edge's fall.
    let none_across = |[west, north, east, south]: [f64; 4]| {
        seating.buildings.iter().all(|building| {
            let [b_west, b_north, b_east, b_south] = building.footprint;
            let on = b_west >= west + 1.0 && b_east <= east - 1.0 && b_north >= north + 1.0 && b_south <= south - 1.0;
            let gap = (west - b_east).max(b_west - east).max(north - b_south).max(b_north - south);
            on || gap > TERRACE_EDGE_M + 1.0
        })
    };
    let mut terraces: Vec<[f64; 7]> = Vec::new();
    let mut rank = 0;
    for &(middle, _) in blocks.iter().skip(1) {
        let tile = square(middle);
        if way_into(tile) || inside(tile, area.at) || !none_across(tile) {
            continue;
        }
        // From the plaza toward the block, to 2 m inside its terrace's edge.
        let reach = distance(area.at, middle);
        let toward = [(middle[0] - area.at[0]) / reach, (middle[1] - area.at[1]) / reach];
        let along = |out: f64| [area.at[0] + toward[0] * out, area.at[1] + toward[1] * out];
        let mut edge = 0.0;
        while !inside(tile, along(edge)) && edge < reach {
            edge += 0.5;
        }
        let top_out = edge + 2.0;
        let step = (f64::from(rank + 1) * HAMLET_STEP).min(top_out * RAMP_STEEPEST / TALLEST_LEVEL_M);
        if step < LEAST_STEP {
            continue;
        }
        let (foot, top) = (along(top_out - ramp_run(step)), along(top_out));
        if !off_ways(paths, along(top_out - ramp_run(step) / 2.0), top, RAMP_HALF_M) {
            continue;
        }
        rank += 1;
        let strips = ((2.0 * half) / (2.0 * STRIP_HALF_M)).ceil();
        let strip = half / strips;
        for number in 0..strips as u32 {
            let y = tile[1] + strip * (2.0 * f64::from(number) + 1.0);
            // Each runs the tile's whole width, its rounded ends past it, so the tile's corners stand level too.
            terraces.push([tile[0], y, tile[2], y, strip, step, step]);
        }
        terraces.push([foot[0], foot[1], top[0], top[1], RAMP_HALF_M, 0.0, step]);
    }
    terraces
}
