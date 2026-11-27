//! An Ascent's climb, as the plan lays it (`encounter_plan.rs`): its pads, each a running jump through open air from
//! the one before, rising to its seal stone on the last.

use super::{
    ASCENT_PADS, FIRST_PAD_TOP_M, HEAD_ROOM_M, JUMP_ROOM_M, LEAP_M, PAD_HALF_M, PAD_OVER_REACH_M, PAD_RISE_M,
    QUARTER_M, Reading,
};
use dungeon::SIDES;
use movement::{Block, TUNING};

/// A pad's footprint: west, north, east and south edges (m).
pub(super) type Footprint = [f64; 4];

/// How far apart two footprints stand edge to edge, squared.
fn gap_squared(a: Footprint, b: Footprint) -> f64 {
    let east = (a[0] - b[2]).max(b[0] - a[2]).max(0.0);
    let south = (a[1] - b[3]).max(b[1] - a[3]).max(0.0);
    east * east + south * south
}

/// Whether the leap from one footprint to the next, edge to edge along the line between their middles, is within
/// LEAP_M; compared squared, so no root is taken.
fn leaps(a: Footprint, b: Footprint) -> bool {
    let middle = |pad: Footprint| [(pad[0] + pad[2]) / 2.0, (pad[1] + pad[3]) / 2.0];
    let ([ax, ay], [bx, by]) = (middle(a), middle(b));
    let (east, south) = ((bx - ax).abs(), (by - ay).abs());
    // The share of the line between the middles each pad covers, out from its middle to its edge.
    let out = |pad: Footprint| {
        let (half_x, half_y) = ((pad[2] - pad[0]) / 2.0, (pad[3] - pad[1]) / 2.0);
        match (east > 0.0, south > 0.0) {
            (true, true) => (half_x / east).min(half_y / south),
            (true, false) => half_x / east,
            (false, true) => half_y / south,
            (false, false) => 1.0,
        }
    };
    let open = 1.0 - out(a) - out(b);
    let leap_squared = (east * east + south * south) * open * open;
    open > 0.0 && leap_squared >= LEAP_M.0 * LEAP_M.0 && leap_squared <= LEAP_M.1 * LEAP_M.1
}

/// Whether the way from one footprint's middle to the next's, as wide as a body and a hand besides, meets no solid: the
/// dungeon's solids are walls to a body however high it leaps.
pub(super) fn open_air(a: Footprint, b: Footprint, boxes: &[[f64; 6]]) -> bool {
    let middle = |pad: Footprint| [(pad[0] + pad[2]) / 2.0, (pad[1] + pad[3]) / 2.0];
    let ([ax, ay], [bx, by]) = (middle(a), middle(b));
    let wide = TUNING.radius + 0.1;
    boxes.iter().all(|&[min_x, min_y, max_x, max_y, _, _]| {
        // The share of the way inside the box's span on each axis, widened; the way meets it where all overlap.
        let span = |from: f64, to: f64, low: f64, high: f64| {
            let (low, high, run) = (low - wide, high + wide, to - from);
            if run == 0.0 {
                return if from >= low && from <= high { (0.0, 1.0) } else { (1.0, 0.0) };
            }
            let (first, second) = ((low - from) / run, (high - from) / run);
            (first.min(second), first.max(second))
        };
        let ((east_in, east_out), (south_in, south_out)) = (span(ax, bx, min_x, max_x), span(ay, by, min_y, max_y));
        east_in.max(south_in).max(0.0) > east_out.min(south_out).min(1.0)
    })
}

/// An Ascent's pads and its seal stone. The first pad stands on a free cell beside the room's doorway nearest the way
/// in, reaching back to that doorway so the way onto it crosses no water, its top FIRST_PAD_TOP_M; each next a leap
/// away (LEAP_M) and every two at least the least leap apart, so no pad after the first is reached but by a running
/// jump; each PAD_RISE_M over the one before, to under the room's lowest ceiling less a body's height and JUMP_ROOM_M,
/// the last HEAD_ROOM_M.
/// The stone stands on the last pad's top. None for fewer than the fewest pads, or a ceiling too low for the second
/// pad to stand over a mantle's reach.
pub(super) fn ascent(reading: &Reading, room: usize) -> Option<(Vec<Block>, [f64; 3])> {
    let dungeon = reading.dungeon;
    let found = &dungeon.rooms[room];
    let lowest = found.cells.iter().map(|&cell| dungeon.ceilings[cell]).fold(f64::INFINITY, f64::min);
    let (under, leapt_under) = (lowest - TUNING.height - HEAD_ROOM_M, lowest - TUNING.height - JUMP_ROOM_M);
    if leapt_under < TUNING.reach + PAD_OVER_REACH_M {
        return None;
    }
    let start = reading.entered_by(room)?;
    let (padded, floor) = (reading.padded(room), dungeon::storey_floor(found.storey));
    // What is not the room walls a leap as its solids do: none crosses a cave's bitten corner.
    let boxes = reading.on_storey(room).0;
    let walls = [boxes.clone(), dungeon.walls_round(room)].concat();
    let clear = |pad: Footprint| {
        boxes.iter().all(|&[min_x, min_y, max_x, max_y, _, _]| {
            max_x <= pad[0] || min_x >= pad[2] || max_y <= pad[1] || min_y >= pad[3]
        })
    };
    let fits = |pad: Footprint| {
        let on = |x: f64, y: f64| x >= 0.0 && y >= 0.0 && padded.contains(&dungeon.cell_at([x, y, floor]));
        clear(pad) && on(pad[0], pad[1]) && on(pad[2], pad[1]) && on(pad[0], pad[3]) && on(pad[2], pad[3])
    };
    // Every pad's middle on a grid QUARTER_M apart over the room's cells, four a side to a cell.
    let offsets = [-1.5 * QUARTER_M, -0.5 * QUARTER_M, 0.5 * QUARTER_M, 1.5 * QUARTER_M];
    let spots: Vec<Footprint> = found
        .cells
        .iter()
        .flat_map(|&cell| {
            let [x, y] = dungeon.centre(cell);
            offsets.into_iter().flat_map(move |east| offsets.map(|south| [x + east, y + south]))
        })
        .map(|[x, y]| [x - PAD_HALF_M, y - PAD_HALF_M, x + PAD_HALF_M, y + PAD_HALF_M])
        .filter(|pad| fits(*pad))
        .collect();
    let mut best: Vec<Footprint> = Vec::new();
    for side in SIDES {
        let Some(first_cell) = dungeon.beside(start, side).filter(|cell| padded.contains(cell)) else { continue };
        let ([start_x, start_y], [x, y]) = (dungeon.centre(start), dungeon.centre(first_cell));
        let mut first = [x - PAD_HALF_M, y - PAD_HALF_M, x + PAD_HALF_M, y + PAD_HALF_M];
        // Reaching back to the doorway's cell.
        let edge = |from: f64, to: f64| (from + to) / 2.0;
        match (x.total_cmp(&start_x), y.total_cmp(&start_y)) {
            (core::cmp::Ordering::Greater, _) => first[0] = edge(start_x, x),
            (core::cmp::Ordering::Less, _) => first[2] = edge(start_x, x),
            (_, core::cmp::Ordering::Greater) => first[1] = edge(start_y, y),
            _ => first[3] = edge(start_y, y),
        }
        if !clear(first) {
            continue;
        }
        let mut path = vec![first];
        let mut budget = LEAP_SEARCH;
        leaping(&spots, &walls, &mut path, &mut best, &mut budget);
    }
    if best.len() < ASCENT_PADS.0 {
        return None;
    }
    let mut top = FIRST_PAD_TOP_M - PAD_RISE_M;
    let pads: Vec<Block> = best
        .iter()
        .enumerate()
        .map(|(nth, &[min_x, min_y, max_x, max_y])| {
            top = (top + PAD_RISE_M).min(if nth + 1 == best.len() { under } else { leapt_under });
            Block { min_x, min_y, max_x, max_y, top, bottom: dungeon::FLOOR_M }
        })
        .collect();
    let last = pads.last()?;
    let stone = [(last.min_x + last.max_x) / 2.0, (last.min_y + last.max_y) / 2.0, last.top];
    Some((pads, stone))
}

/// How many steps the search for an Ascent's leaps takes from each first pad at the most.
const LEAP_SEARCH: usize = 20_000;

/// The longest run of `spots` from `path`'s last, each a leap through open air from the one before and at least the
/// least leap from every other, ASCENT_PADS' most at the most; of two as long, the first found.
fn leaping(
    spots: &[Footprint],
    boxes: &[[f64; 6]],
    path: &mut Vec<Footprint>,
    best: &mut Vec<Footprint>,
    budget: &mut usize,
) {
    if path.len() > best.len() {
        best.clone_from(path);
    }
    if path.len() == ASCENT_PADS.1 || best.len() == ASCENT_PADS.1 {
        return;
    }
    let Some(&here) = path.last() else { return };
    for &next in spots {
        if *budget == 0 {
            return;
        }
        *budget -= 1;
        let apart = path.iter().all(|&pad| gap_squared(pad, next) >= LEAP_M.0 * LEAP_M.0);
        if apart && leaps(here, next) && open_air(here, next, boxes) {
            path.push(next);
            leaping(spots, boxes, path, best, budget);
            path.pop();
        }
    }
}
