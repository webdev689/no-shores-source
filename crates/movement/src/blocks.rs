//! The blocks a body stands on and runs into, on the terrain under them: what is underfoot, what is in the way, and
//! sliding along a side.

use crate::body::{Body, TUNING};
use crate::terrain::{Terrain, too_steep};

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
}

/// The ground under a point: the higher of the terrain and the highest block top at or below `z` plus a step.
#[must_use]
pub fn ground_at(blocks: &[Block], terrain: &dyn Terrain, x: f64, y: f64, z: f64) -> f64 {
    blocks
        .iter()
        .filter(|block| block.holds(x, y, 0.0) && block.top <= z + TUNING.step)
        .fold(terrain.height_at(x, y), |ground, block| if block.top > ground { block.top } else { ground })
}

/// The first block standing in the way at a point: one whose top is above a step over `z`.
fn blocking_at(blocks: &[Block], x: f64, y: f64, z: f64) -> Option<&Block> {
    blocks.iter().find(|block| block.holds(x, y, TUNING.radius) && block.top > z + TUNING.step)
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
    let past_blocks = along_axes(blocks, None, body, move_x, move_y);
    let (whole_x, whole_y) = (body.x + move_x, body.y + move_y);
    let run = (move_x * move_x + move_y * move_y).sqrt();
    if past_blocks == (whole_x, whole_y) && !too_steep(terrain, body.z, (body.x, body.y), (whole_x, whole_y), run) {
        return past_blocks;
    }
    along_axes(blocks, Some(terrain), body, move_x, move_y)
}

/// The move an axis at a time, each axis taken where no block, nor the terrain if one is given, stops it.
fn along_axes(blocks: &[Block], terrain: Option<&dyn Terrain>, body: &Body, move_x: f64, move_y: f64) -> (f64, f64) {
    let open = |from: (f64, f64), to: (f64, f64), run: f64| {
        blocking_at(blocks, to.0, to.1, body.z).is_none()
            && terrain.is_none_or(|terrain| !too_steep(terrain, body.z, from, to, run))
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
