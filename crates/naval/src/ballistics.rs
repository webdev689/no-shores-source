//! Where a ball goes and what it meets: DFO's own ballistics (Daggerfall Unity has no cannon). A ball is a point under
//! gravity alone, so its flight is a closed form of its launch, swept as a segment from where it was to where it is:
//! no step bends a shot and none tunnels one through a hull. Metres east, south and up; radians unless named.

use crate::random::Mulberry32;
use std::f64::consts::PI;

/// m/s².
pub const GRAVITY: f64 = 9.81;
const DEGREE: f64 = PI / 180.0;

/// A ball's velocity leaving a gun laid along `dir` (east, south; any length) at `elevation`, at `speed`, from a deck
/// moving at `carry`.
#[must_use]
pub fn launch_velocity(dir: [f64; 2], elevation: f64, speed: f64, carry: [f64; 3]) -> [f64; 3] {
    let length = (dir[0] * dir[0] + dir[1] * dir[1]).sqrt();
    let ahead = libm::cos(elevation) * speed / if length > 0.0 { length } else { 1.0 };
    [dir[0] * ahead + carry[0], dir[1] * ahead + carry[1], libm::sin(elevation) * speed + carry[2]]
}

/// Where a ball launched from `start` at `launch` is `time` seconds on.
#[must_use]
pub fn flight(start: [f64; 3], launch: [f64; 3], time: f64) -> [f64; 3] {
    [
        start[0] + launch[0] * time,
        start[1] + launch[1] * time,
        start[2] + launch[2] * time - GRAVITY * time * time / 2.0,
    ]
}

/// A ball's velocity `time` seconds after its launch.
#[must_use]
pub fn velocity(launch: [f64; 3], time: f64) -> [f64; 3] {
    [launch[0], launch[1], launch[2] - GRAVITY * time]
}

/// When a ball at height `start` rising at `rise` comes down through `height`, or none if it never reaches it.
fn time_to_height(start: f64, rise: f64, height: f64) -> Option<f64> {
    let square = rise * rise + 2.0 * GRAVITY * (start - height);
    if square < 0.0 {
        return None;
    }
    let time = (rise + square.sqrt()) / GRAVITY;
    (time >= 0.0).then_some(time)
}

/// How far a gun `rise` metres over the water throws at `elevation` and `speed`, still decked.
#[must_use]
pub fn range_at(elevation: f64, speed: f64, rise: f64) -> f64 {
    time_to_height(rise, libm::sin(elevation) * speed, 0.0).map_or(0.0, |time| libm::cos(elevation) * speed * time)
}

/// The low arc that throws `range` metres from `rise` over the point laid on, within the carriage (`low`, `high`):
/// the lowest for no range, the highest past its reach.
#[must_use]
pub fn elevation_for_range(range: f64, speed: f64, rise: f64, low: f64, high: f64) -> f64 {
    if range.is_nan() || range <= 0.0 {
        return low;
    }
    let square = speed * speed;
    let room = square * square - GRAVITY * (GRAVITY * range * range - 2.0 * rise * square);
    if room < 0.0 {
        return high;
    }
    libm::atan((square - room.sqrt()) / (GRAVITY * range)).clamp(low, high)
}

/// The farthest a gun throws within its carriage: at its highest, or 45 degrees if it rises past that.
#[must_use]
pub fn max_range(speed: f64, rise: f64, high: f64) -> f64 {
    range_at(high.min(45.0 * DEGREE), speed, rise)
}

/// `dir` (east, south) turned by `angle` toward starboard: clockwise seen from above, as a heading turns.
#[must_use]
pub fn turned(dir: [f64; 2], angle: f64) -> [f64; 2] {
    let (sine, cosine) = (libm::sin(angle), libm::cos(angle));
    [dir[0] * cosine - dir[1] * sine, dir[1] * cosine + dir[0] * sine]
}

/// A lay bent by the scatter: each axis by its spread (degrees) times the sum of two draws less one, so most balls
/// fly near the lay and a few at its edge. Draws two for the yaw, then two for the elevation.
pub fn scatter(dir: [f64; 2], elevation: f64, yaw_deg: f64, pitch_deg: f64, draws: &mut Mulberry32) -> ([f64; 2], f64) {
    let mut triangle = || draws.draw() + draws.draw() - 1.0;
    let yaw = triangle() * yaw_deg * DEGREE;
    let pitch = triangle() * pitch_deg * DEGREE;
    (turned(dir, yaw), elevation + pitch)
}

/// A box that turns with what it bounds: its middle, its three unit axes and its half size along each, metres.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Block {
    pub centre: [f64; 3],
    pub axes: [[f64; 3]; 3],
    pub half: [f64; 3],
}

impl Block {
    /// A point in the box's own frame: along each axis from its middle.
    #[must_use]
    pub fn local(&self, point: [f64; 3]) -> [f64; 3] {
        let from = [point[0] - self.centre[0], point[1] - self.centre[1], point[2] - self.centre[2]];
        self.axes.map(|axis| axis[0] * from[0] + axis[1] * from[1] + axis[2] * from[2])
    }
}

/// Where the segment from `start` to `end` first meets the box grown by `radius`, as a share of the way along it (0
/// when it starts inside), or none.
#[must_use]
pub fn segment_entry(start: [f64; 3], end: [f64; 3], block: &Block, radius: f64) -> Option<f64> {
    let (from, to) = (block.local(start), block.local(end));
    let (mut enter, mut leave) = (0.0_f64, 1.0_f64);
    for axis in 0..3 {
        let half = block.half[axis] + radius;
        let run = to[axis] - from[axis];
        if run.abs() < 1e-9 {
            if from[axis] < -half || from[axis] > half {
                return None;
            }
            continue;
        }
        let (near, far) = ((-half - from[axis]) / run, (half - from[axis]) / run);
        enter = enter.max(near.min(far));
        leave = leave.min(near.max(far));
        if enter > leave {
            return None;
        }
    }
    Some(enter)
}

#[cfg(test)]
#[path = "ballistics_tests.rs"]
mod tests;
