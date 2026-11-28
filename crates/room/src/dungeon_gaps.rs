//! The gaps a body fits through between a dungeon's solids, kept open in its navmesh. The bake walls every cell a
//! solid touches and erodes one cell more, so two free-standing solids trimmed alike can close a gap up to 1.5 m wide
//! on its 0.4 m grid, and the floor past it is off the mesh, where no foe finds a way to a player. A trimmed solid's
//! side that faces another across such a gap is cut back further, so the cell nearest the gap's middle stays open.

use movement::{Block, TUNING};

/// The least a block is cut back to across, metres, as the bake's own trim keeps.
const KEPT_M: f64 = 0.02;
/// How far inside a cell's edge a cut side stops, metres, so the bake reads the cell past it as untouched.
const INSIDE_M: f64 = 1e-6;

/// Cuts back `blocks`, each the bake's block of the solid of the same number in `solids` (min x, min y, max x, max y,
/// bottom, top), where two of a storey face each other across a gap a body fits through that the bake would close:
/// a trimmed block's facing side (one narrower than its solid, a free-standing one), so the cell nearest the gap's
/// middle wholly inside it stays open, the cells either side of it walled no nearer. `grid` is the bake's cell and its
/// corner.
pub(crate) fn open(blocks: &mut [Block], solids: &[[f64; 6]], (cell, origin): (f64, [f64; 2])) {
    let trimmed: Vec<bool> =
        blocks.iter().zip(solids).map(|(block, solid)| block.min_x > solid[0] || block.min_y > solid[1]).collect();
    let body = 2.0 * TUNING.radius;
    for (one, low) in solids.iter().enumerate() {
        for (other, high) in solids.iter().enumerate() {
            if !(trimmed[one] || trimmed[other]) || (low[4] - high[4]).abs() > 0.5 {
                continue;
            }
            for axis in 0..2 {
                let across = 1 - axis;
                let (near, far) = (low[axis + 2], high[axis]);
                let facing = low[across + 2].min(high[across + 2]) > low[across].max(high[across]);
                let at = |metres: f64| (metres - origin[axis]) / cell;
                let walled = [at(edges(&blocks[one], axis)[1]).ceil(), at(edges(&blocks[other], axis)[0]).floor()];
                // Walled up to one side, eroded a cell each side: a cell open between needs three.
                if !facing || far - near < body || walled[1] - walled[0] >= 3.0 {
                    continue;
                }
                let first = at(near).ceil() + if trimmed[one] { 0.0 } else { 1.0 };
                let last = at(far).floor() - if trimmed[other] { 1.0 } else { 2.0 };
                if first > last {
                    continue;
                }
                let kept = ((at(near) + at(far)) / 2.0 - 0.5).round().clamp(first, last);
                if trimmed[one] {
                    let [lowest, end] = edges(&blocks[one], axis);
                    let cut = (origin[axis] + (kept - 1.0) * cell - INSIDE_M).max(lowest + KEPT_M);
                    set(&mut blocks[one], axis, 1, cut.min(end));
                }
                if trimmed[other] {
                    let [start, highest] = edges(&blocks[other], axis);
                    let cut = (origin[axis] + (kept + 2.0) * cell + INSIDE_M).min(highest - KEPT_M);
                    set(&mut blocks[other], axis, 0, cut.max(start));
                }
            }
        }
    }
}

/// A block's low and high edges along x (`axis` 0) or y.
fn edges(block: &Block, axis: usize) -> [f64; 2] {
    if axis == 0 { [block.min_x, block.max_x] } else { [block.min_y, block.max_y] }
}

/// Sets a block's low (`end` 0) or high edge along x (`axis` 0) or y.
fn set(block: &mut Block, axis: usize, end: usize, to: f64) {
    match (axis, end) {
        (0, 0) => block.min_x = to,
        (0, _) => block.max_x = to,
        (_, 0) => block.min_y = to,
        _ => block.max_y = to,
    }
}

#[cfg(test)]
#[path = "dungeon_gaps_tests.rs"]
mod dungeon_gaps_tests;
