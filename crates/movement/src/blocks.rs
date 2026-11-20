//! The blocks a body stands on and runs into, on the terrain under them: what is underfoot, what is in the way, and
//! sliding along a side.

use crate::body::{Body, Mode, TUNING};
use crate::near::Near;
use crate::terrain::{Terrain, too_steep};
use core::iter::once;

/// A block: its footprint (x east, y south, metres), its top, and its underside.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Block {
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
    pub top: f64,
    /// Its underside: the ground's height where it stands, or below it, for a block from the ground up; over the
    /// ground for a floor, a bridge or a roof a body walks under.
    pub bottom: f64,
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
pub fn ground_at<B: Near + ?Sized>(blocks: &B, terrain: &dyn Terrain, x: f64, y: f64, z: f64) -> f64 {
    blocks
        .near(x, y)
        .filter(|block| block.under(x, y) && block.top <= z + TUNING.step)
        .fold(terrain.height_at(x, y), |ground, block| if block.top > ground { block.top } else { ground })
}

/// The first block standing in the way at a point of a body `height` tall with its feet at `z`.
#[must_use]
pub fn blocking_at<B: Near + ?Sized>(blocks: &B, x: f64, y: f64, z: f64, height: f64) -> Option<&Block> {
    blocks.near(x, y).find(|block| block.holds(x, y, TUNING.radius) && in_the_way(block, z, height))
}

/// Whether a block overlaps the column of a body `height` tall with its feet at `z`: its top over a step above the
/// feet, its underside below the head. Written as `bottom - height < z` so a head clamped to `bottom - height` is
/// exactly clear of it.
fn in_the_way(block: &Block, z: f64, height: f64) -> bool {
    block.top > z + TUNING.step && block.bottom - height < z
}

/// Whether a body `height` tall with its feet at `z` fits at a point: no block is in the way of it there.
#[must_use]
pub fn room_at<B: Near + ?Sized>(blocks: &B, x: f64, y: f64, z: f64, height: f64) -> bool {
    blocking_at(blocks, x, y, z, height).is_none()
}

/// The lowest underside over a body with its feet at `z` at a point, within its radius: of the blocks whose
/// underside is over a step above the feet, so neither the ground nor a wall beside it; infinite when none is.
#[must_use]
pub fn ceiling_at<B: Near + ?Sized>(blocks: &B, x: f64, y: f64, z: f64) -> f64 {
    blocks
        .near(x, y)
        .filter(|block| block.holds(x, y, TUNING.radius) && block.bottom > z + TUNING.step)
        .fold(f64::INFINITY, |lowest, block| if block.bottom < lowest { block.bottom } else { lowest })
}

/// The feet of a body `height` tall rising from `from` towards `to` at a point, stopped where its head meets a
/// ceiling; never below `from`.
#[must_use]
pub fn under_ceiling<B: Near + ?Sized>(blocks: &B, x: f64, y: f64, from: f64, to: f64, height: f64) -> f64 {
    let highest = ceiling_at(blocks, x, y, from) - height;
    to.min(highest.max(from))
}

/// Whether a block stands in the way at a point of a body `height` tall with its feet at `feet`, asked only beside a
/// block, so open ground costs no look at the ground.
fn in_way<B: Near + ?Sized>(blocks: &B, x: f64, y: f64, height: f64, feet: impl FnOnce() -> f64) -> bool {
    let mut beside = blocks.near(x, y).filter(|block| block.holds(x, y, TUNING.radius)).peekable();
    if beside.peek().is_none() {
        return false;
    }
    let z = feet();
    beside.any(|block| in_the_way(block, z, height))
}

/// Where the feet of a body moved to (x, y) stand: on its feet, on the ground there when that is lower by no more
/// than a step, as the feet follow it down; otherwise where they are, as a body that falls has not dropped yet. A
/// move is judged there, so a block that is a step up from where the feet start, and a wall from where they end,
/// stops it.
pub(crate) fn feet_after<B: Near + ?Sized>(blocks: &B, terrain: &dyn Terrain, body: &Body, x: f64, y: f64) -> f64 {
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
pub fn wall_ahead<B: Near + ?Sized>(blocks: &B, body: &Body, bearing: f64) -> Option<WallAhead> {
    let (dir_x, dir_y) = (libm::sin(bearing), -libm::cos(bearing));
    let probe = TUNING.radius + 0.15;
    let block = *blocking_at(blocks, body.x + dir_x * probe, body.y + dir_y * probe, body.z, body.height())?;
    let depth = if dir_x.abs() > dir_y.abs() { block.max_x - block.min_x } else { block.max_y - block.min_y };
    Some(WallAhead { block, depth })
}

/// Moves along the ground by (`move_x`, `move_y`), sliding along a block's side or terrain too steep to walk up, and
/// stepping up onto a block no higher than a step. A path the blocks leave open and no steeper than the slope limit is
/// walked whole; otherwise each axis is tried alone, so the body slides along the rise. Answers the new (x, y).
#[must_use]
pub fn slide<B: Near + ?Sized>(blocks: &B, terrain: &dyn Terrain, body: &Body, move_x: f64, move_y: f64) -> (f64, f64) {
    let past_blocks = along_axes(blocks, terrain, false, body, move_x, move_y);
    let (whole_x, whole_y) = (body.x + move_x, body.y + move_y);
    let run = (move_x * move_x + move_y * move_y).sqrt();
    if past_blocks == (whole_x, whole_y) && !too_steep(terrain, body.z, (body.x, body.y), (whole_x, whole_y), run) {
        return past_blocks;
    }
    along_axes(blocks, terrain, true, body, move_x, move_y)
}

/// The move an axis at a time, each axis taken where no block stops it, nor, with `slopes`, the terrain.
fn along_axes<B: Near + ?Sized>(
    blocks: &B,
    terrain: &dyn Terrain,
    slopes: bool,
    body: &Body,
    move_x: f64,
    move_y: f64,
) -> (f64, f64) {
    let open = |from: (f64, f64), to: (f64, f64), run: f64| {
        !in_way(blocks, to.0, to.1, body.height(), || feet_after(blocks, terrain, body, to.0, to.1))
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

/// The nearest point to (x, y) clear of every block, for a body `height` tall with its feet standing at `feet` there:
/// (x, y) itself when no block is in the way, else pushed straight out of those that are, along one axis or both, onto
/// no terrain that stops a move. A body beside a block is never pushed out past its far side. Feet sinking past a
/// block's top beside it leave the body overlapping it, stopped by it whichever way it walks, so it is pushed out;
/// where nowhere near is clear, it stays.
pub fn pushed_out<B: Near + ?Sized>(
    blocks: &B,
    terrain: &dyn Terrain,
    x: f64,
    y: f64,
    height: f64,
    feet: impl Fn(f64, f64) -> f64,
) -> (f64, f64) {
    if !in_way(blocks, x, y, height, || feet(x, y)) {
        return (x, y);
    }
    let z = feet(x, y);
    let pushing: Vec<&Block> =
        blocks.near(x, y).filter(|block| block.holds(x, y, TUNING.radius) && in_the_way(block, z, height)).collect();
    // Out past a block's near side, or past either side from within its footprint.
    let exits = |at: f64, low: f64, high: f64| {
        [(at >= low).then_some(high + TUNING.radius), (at <= high).then_some(low - TUNING.radius)]
    };
    let x_exits = pushing.iter().flat_map(|block| exits(x, block.min_x, block.max_x)).flatten();
    let y_exits = pushing.iter().flat_map(|block| exits(y, block.min_y, block.max_y)).flatten();
    let (xs, ys): (Vec<f64>, Vec<f64>) = (once(x).chain(x_exits).collect(), once(y).chain(y_exits).collect());
    let open = |to: (f64, f64), push: f64| {
        !in_way(blocks, to.0, to.1, height, || feet(to.0, to.1)) && !too_steep(terrain, z, (x, y), to, push)
    };
    xs.iter()
        .flat_map(|&to_x| ys.iter().map(move |&to_y| (to_x, to_y)))
        .map(|to| (to, ((to.0 - x) * (to.0 - x) + (to.1 - y) * (to.1 - y)).sqrt()))
        .filter(|&(to, push)| push > 0.0 && open(to, push))
        .min_by(|(_, one), (_, other)| one.total_cmp(other))
        .map_or((x, y), |(to, _)| to)
}
