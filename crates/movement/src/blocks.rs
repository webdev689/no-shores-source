//! The blocks a body stands on and runs into, on the terrain under them: what is underfoot, what is in the way, and
//! sliding along a side.

use crate::body::{Body, Mode, TUNING};
use crate::terrain::{Terrain, too_steep};
use core::iter::once;

/// A block standing on the ground: its footprint (x east, y south, metres) and its top.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Block {
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
    pub top: f64,
}

impl Block {
    fn holds(&self, x: f64, y: f64, margin: f64) -> bool {
        x > self.min_x - margin && x < self.max_x + margin && y > self.min_y - margin && y < self.max_y + margin
    }

    /// Whether a point stands on its top, its edges included: blocks that tile a deck share their edges, so a point on
    /// a seam stands on both and none falls between them.
    fn under(&self, x: f64, y: f64) -> bool {
        x >= self.min_x && x <= self.max_x && y >= self.min_y && y <= self.max_y
    }
}

/// The ground under a point: the higher of the terrain and the highest block top at or below `z` plus a step.
#[must_use]
pub fn ground_at(blocks: &[Block], terrain: &dyn Terrain, x: f64, y: f64, z: f64) -> f64 {
    blocks
        .iter()
        .filter(|block| block.under(x, y) && block.top <= z + TUNING.step)
        .fold(terrain.height_at(x, y), |ground, block| if block.top > ground { block.top } else { ground })
}

/// The first block standing in the way at a point: one whose top is above a step over `z`.
fn blocking_at(blocks: &[Block], x: f64, y: f64, z: f64) -> Option<&Block> {
    blocks.iter().find(|block| block.holds(x, y, TUNING.radius) && block.top > z + TUNING.step)
}

/// Whether a block stands in the way at a point for feet at `feet`, asked only beside a block, so open ground costs
/// no look at the ground.
fn in_way(blocks: &[Block], x: f64, y: f64, feet: impl FnOnce() -> f64) -> bool {
    let mut beside = blocks.iter().filter(|block| block.holds(x, y, TUNING.radius)).peekable();
    if beside.peek().is_none() {
        return false;
    }
    let z = feet();
    beside.any(|block| block.top > z + TUNING.step)
}

/// Where the feet of a body moved to (x, y) stand: on its feet, on the ground there when that is lower by no more
/// than a step, as the feet follow it down; otherwise where they are, as a body that falls has not dropped yet. A
/// move is judged there, so a block that is a step up from where the feet start, and a wall from where they end,
/// stops it.
pub(crate) fn feet_after(blocks: &[Block], terrain: &dyn Terrain, body: &Body, x: f64, y: f64) -> f64 {
    if body.mode != Mode::Ground {
        return body.z;
    }
    let ground = ground_at(blocks, terrain, x, y, body.z);
    if ground < body.z && ground >= body.z - TUNING.step { ground } else { body.z }
}

/// A block ahead of a body, and how deep it runs the way the body faces.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WallAhead {
    pub block: Block,
    pub depth: f64,
}

/// The block ahead of the body along a bearing, a short reach past its radius, and how deep it runs that way.
#[must_use]
pub fn wall_ahead(blocks: &[Block], body: &Body, bearing: f64) -> Option<WallAhead> {
    let (dir_x, dir_y) = (libm::sin(bearing), -libm::cos(bearing));
    let probe = TUNING.radius + 0.15;
    let block = *blocking_at(blocks, body.x + dir_x * probe, body.y + dir_y * probe, body.z)?;
    let depth = if dir_x.abs() > dir_y.abs() { block.max_x - block.min_x } else { block.max_y - block.min_y };
    Some(WallAhead { block, depth })
}

/// Moves along the ground by (`move_x`, `move_y`), sliding along a block's side or terrain too steep to walk up, and
/// stepping up onto a block no higher than a step. A path the blocks leave open and no steeper than the slope limit is
/// walked whole; otherwise each axis is tried alone, so the body slides along the rise. Answers the new (x, y).
#[must_use]
pub fn slide(blocks: &[Block], terrain: &dyn Terrain, body: &Body, move_x: f64, move_y: f64) -> (f64, f64) {
    let past_blocks = along_axes(blocks, terrain, false, body, move_x, move_y);
    let (whole_x, whole_y) = (body.x + move_x, body.y + move_y);
    let run = (move_x * move_x + move_y * move_y).sqrt();
    if past_blocks == (whole_x, whole_y) && !too_steep(terrain, body.z, (body.x, body.y), (whole_x, whole_y), run) {
        return past_blocks;
    }
    along_axes(blocks, terrain, true, body, move_x, move_y)
}

/// The move an axis at a time, each axis taken where no block stops it, nor, with `slopes`, the terrain.
fn along_axes(
    blocks: &[Block],
    terrain: &dyn Terrain,
    slopes: bool,
    body: &Body,
    move_x: f64,
    move_y: f64,
) -> (f64, f64) {
    let open = |from: (f64, f64), to: (f64, f64), run: f64| {
        !in_way(blocks, to.0, to.1, || feet_after(blocks, terrain, body, to.0, to.1))
            && !(slopes && too_steep(terrain, body.z, from, to, run))
    };
    let (mut x, mut y) = (body.x, body.y);
    if open((x, y), (x + move_x, y), move_x.abs()) {
        x += move_x;
    }
    if open((x, y), (x, y + move_y), move_y.abs()) {
        y += move_y;
    }
    (x, y)
}

/// The nearest point to (x, y) clear of every block, for feet standing at `feet` there: (x, y) itself when no block
/// is in the way, else pushed straight out of those that are, along one axis or both, onto no terrain that stops a
/// move. A body beside a block is never pushed out past its far side. Feet sinking past a block's top beside it leave
/// the body overlapping it, stopped by it whichever way it walks, so it is pushed out; where nowhere near is clear,
/// it stays.
pub fn pushed_out(
    blocks: &[Block],
    terrain: &dyn Terrain,
    x: f64,
    y: f64,
    feet: impl Fn(f64, f64) -> f64,
) -> (f64, f64) {
    if !in_way(blocks, x, y, || feet(x, y)) {
        return (x, y);
    }
    let z = feet(x, y);
    let pushing: Vec<&Block> =
        blocks.iter().filter(|block| block.holds(x, y, TUNING.radius) && block.top > z + TUNING.step).collect();
    // Out past a block's near side, or past either side from within its footprint.
    let exits = |at: f64, low: f64, high: f64| {
        [(at >= low).then_some(high + TUNING.radius), (at <= high).then_some(low - TUNING.radius)]
    };
    let x_exits = pushing.iter().flat_map(|block| exits(x, block.min_x, block.max_x)).flatten();
    let y_exits = pushing.iter().flat_map(|block| exits(y, block.min_y, block.max_y)).flatten();
    let (xs, ys): (Vec<f64>, Vec<f64>) = (once(x).chain(x_exits).collect(), once(y).chain(y_exits).collect());
    let open = |to: (f64, f64), push: f64| {
        !in_way(blocks, to.0, to.1, || feet(to.0, to.1)) && !too_steep(terrain, z, (x, y), to, push)
    };
    xs.iter()
        .flat_map(|&to_x| ys.iter().map(move |&to_y| (to_x, to_y)))
        .map(|to| (to, ((to.0 - x) * (to.0 - x) + (to.1 - y) * (to.1 - y)).sqrt()))
        .filter(|&(to, push)| push > 0.0 && open(to, push))
        .min_by(|(_, one), (_, other)| one.total_cmp(other))
        .map_or((x, y), |(to, _)| to)
}
