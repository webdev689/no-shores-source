//! Bearings between points, the turn between two bearings, and whether a straight line passes clear of the course's
//! blocks: what a lock, a blow, a shot and a foe's eyes all ask.

use movement::Block;
pub use movement::wrap;

/// The bearing from one point to another on the ground, clockwise from north.
#[must_use]
pub fn bearing(from: [f64; 2], to: [f64; 2]) -> f64 {
    libm::atan2(to[0] - from[0], -(to[1] - from[1]))
}

/// How far apart two bearings are, 0 to PI.
#[must_use]
pub fn off(first: f64, second: f64) -> f64 {
    wrap(first - second).abs()
}

/// A bearing turned toward another by at most `most`.
#[must_use]
pub fn turned(from: f64, toward: f64, most: f64) -> f64 {
    let gap = wrap(toward - from);
    wrap(from + gap.clamp(-most, most))
}

/// The distance between two points on the ground.
#[must_use]
pub fn apart(first: [f64; 2], second: [f64; 2]) -> f64 {
    let (along_x, along_y) = (second[0] - first[0], second[1] - first[1]);
    (along_x * along_x + along_y * along_y).sqrt()
}

/// Whether the straight line from one point to another (x, y, z) passes clear of every block, each standing from the
/// ground to its top.
#[must_use]
pub fn clear_line(blocks: &[Block], from: [f64; 3], to: [f64; 3]) -> bool {
    blocks.iter().all(|block| !crosses(block, from, to))
}

/// Whether the segment passes through the block's box, by the slabs between its faces.
fn crosses(block: &Block, from: [f64; 3], to: [f64; 3]) -> bool {
    let low = [block.min_x, block.min_y, 0.0];
    let high = [block.max_x, block.max_y, block.top];
    let (mut enter, mut leave) = (0.0_f64, 1.0_f64);
    for axis in 0..3 {
        let span = to[axis] - from[axis];
        if span.abs() < 1e-12 {
            if from[axis] < low[axis] || from[axis] > high[axis] {
                return false;
            }
            continue;
        }
        let (first, second) = ((low[axis] - from[axis]) / span, (high[axis] - from[axis]) / span);
        enter = enter.max(first.min(second));
        leave = leave.min(first.max(second));
        if enter > leave {
            return false;
        }
    }
    true
}
