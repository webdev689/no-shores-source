//! Keeping a captain off the land, as DFO's: it sounds its wanted course a turning circle and more ahead, along its
//! keel and either side of it; a foul one it swings off by the least that sounds clear, and holds that until its
//! own course has been clear a while; boxed in, it comes about to the more open side.

use super::course::{DEG, wrap};
use sailing::pose::frame;
use std::f64::consts::PI;

/// How far ahead it sounds: its way for this many seconds, this far at the least (metres).
pub const LOOKAHEAD_S: f64 = 22.0;
pub const LOOKAHEAD_MIN: f64 = 70.0;
/// Soundings this far apart along a course (twice as far past its turning circle), and this far outside its beam.
pub const SCAN_STEP: f64 = 6.0;
pub const SCAN_MARGIN: f64 = 4.0;
/// The swings it tries off a foul course, degrees, least first.
pub const AVOID_SWINGS: [f64; 11] = [25.0, -25.0, 50.0, -50.0, 80.0, -80.0, 115.0, -115.0, 150.0, -150.0, 180.0];
/// Its own course clear this long (seconds) takes it back to that course; it sounds this often.
pub const AVOID_HOLD_S: f64 = 3.0;
pub const NAV_EVERY_S: f64 = 0.25;

/// Where its soundings start (half its bow ahead of its middle), where they spread out (past its turning circle),
/// how far they go, and how far either side of its keel (metres).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Lookout {
    pub from: f64,
    pub near: f64,
    pub dist: f64,
    pub half: f64,
}

/// Its lookout: `bow` its hull's forward end from its middle, `half_beam` half its beam, at its way and turning
/// radius (metres).
#[must_use]
pub fn lookout(bow: f64, half_beam: f64, way: f64, turn_radius: f64) -> Lookout {
    let near = bow + turn_radius;
    Lookout { from: bow * 0.5, near, dist: near + LOOKAHEAD_MIN.max(way * LOOKAHEAD_S), half: half_beam + SCAN_MARGIN }
}

/// Whether `heading` from `pos` is water deep enough for it `dist` metres on, along its keel and either side.
#[must_use]
pub fn course_clear(
    pos: [f64; 2],
    heading: f64,
    dist: f64,
    is_water: &impl Fn(f64, f64) -> bool,
    look: &Lookout,
) -> bool {
    if !dist.is_finite() {
        return false;
    }
    let (forward, starboard) = frame(heading);
    let mut along = look.from.max(0.0);
    loop {
        let (x, y) = (pos[0] + forward[0] * along, pos[1] + forward[1] * along);
        let (aside_x, aside_y) = (starboard[0] * look.half, starboard[1] * look.half);
        if !is_water(x, y) || !is_water(x + aside_x, y + aside_y) || !is_water(x - aside_x, y - aside_y) {
            return false;
        }
        if along >= dist {
            return true;
        }
        along = dist.min(along + if along < look.near { SCAN_STEP } else { SCAN_STEP * 2.0 });
    }
}

/// Its swing off its wanted course: when it last sounded, the swing it holds (degrees), the heading it came about
/// to if boxed in, how long its own course has sounded clear since, and the side it turns to for a turn of more than
/// 120 degrees (the more open one; 0 none).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Avoid {
    at: f64,
    swing: f64,
    about: Option<f64>,
    clear_for: f64,
    turn_side: f64,
}

impl Default for Avoid {
    fn default() -> Self {
        Self::new()
    }
}

impl Avoid {
    #[must_use]
    pub fn new() -> Self {
        Self { at: f64::NEG_INFINITY, swing: 0.0, about: None, clear_for: 0.0, turn_side: 0.0 }
    }

    /// Its helm's error toward its heading, turned the long way round to the open side while a big turn is under way.
    pub fn helm_error(&mut self, error: f64) -> f64 {
        if self.turn_side == 0.0 {
            return error;
        }
        if error.abs() < 30.0 * DEG {
            self.turn_side = 0.0;
        } else if error.signum() != self.turn_side && error.abs() > 90.0 * DEG {
            return error - error.signum() * 2.0 * PI;
        }
        error
    }

    /// Every number the swing holds, in a fixed order.
    #[must_use]
    pub fn numbers(&self) -> [f64; 5] {
        [self.at, self.swing, self.about.unwrap_or(-9.0), self.clear_for, self.turn_side]
    }

    /// Whether it has come about, boxed in: it shortens sail.
    #[must_use]
    pub fn boxed(&self) -> bool {
        self.about.is_some()
    }
}

/// The open courses either side of it (45, 90 and 135 degrees off its heading) within its turning circle.
fn room(pos: [f64; 2], heading: f64, look: &Lookout, is_water: &impl Fn(f64, f64) -> bool, side: f64) -> usize {
    [45.0, 90.0, 135.0]
        .into_iter()
        .filter(|off| course_clear(pos, wrap(heading + side * off * DEG), look.near, is_water, look))
        .count()
}

/// `want` kept off the land, sounded each `NAV_EVERY_S` (`now` seconds, `pos` and `heading` the ship's). A turn of more
/// than 120 degrees is made to the side with more room.
pub fn avoid_land(
    avoid: &mut Avoid,
    (now, pos, heading): (f64, [f64; 2], f64),
    want: f64,
    look: &Lookout,
    is_water: &impl Fn(f64, f64) -> bool,
) -> f64 {
    if now - avoid.at < NAV_EVERY_S {
        return avoid.about.unwrap_or_else(|| wrap(want + avoid.swing * DEG));
    }
    let side = avoid.turn_side;
    let course = sounded(avoid, (now, pos, heading), want, look, is_water);
    avoid.turn_side = side;
    if wrap(course - heading).abs() <= 120.0 * DEG {
        avoid.turn_side = 0.0;
    } else if avoid.turn_side == 0.0 {
        let (right, left) = (room(pos, heading, look, is_water, 1.0), room(pos, heading, look, is_water, -1.0));
        avoid.turn_side = if right == left {
            0.0
        } else if right > left {
            1.0
        } else {
            -1.0
        };
    }
    course
}

fn sounded(
    avoid: &mut Avoid,
    (now, pos, heading): (f64, [f64; 2], f64),
    want: f64,
    look: &Lookout,
    is_water: &impl Fn(f64, f64) -> bool,
) -> f64 {
    let since = if avoid.at.is_finite() { now - avoid.at } else { 0.0 };
    avoid.at = now;
    let sound = |course: f64| course_clear(pos, course, look.dist, is_water, look);
    let want_clear = sound(want);
    if avoid.about.is_none() && avoid.swing == 0.0 {
        if want_clear {
            return want;
        }
    } else {
        avoid.clear_for = if want_clear { avoid.clear_for + since } else { 0.0 };
        if avoid.clear_for >= AVOID_HOLD_S {
            *avoid = Avoid { at: now, ..Avoid::new() };
            return want;
        }
        let swung = wrap(want + avoid.swing * DEG);
        if avoid.about.is_none() && sound(swung) {
            return swung;
        }
        // The swing is foul and its own course clear again.
        if want_clear {
            *avoid = Avoid { at: now, ..Avoid::new() };
            return want;
        }
    }
    for swing in AVOID_SWINGS {
        let course = wrap(want + swing * DEG);
        if sound(course) {
            *avoid = Avoid { at: now, swing, about: None, clear_for: 0.0, turn_side: 0.0 };
            return course;
        }
    }
    let side =
        if room(pos, heading, look, is_water, 1.0) >= room(pos, heading, look, is_water, -1.0) { 1.0 } else { -1.0 };
    let about = wrap(heading + side * (PI - 1e-3));
    *avoid = Avoid { at: now, swing: 0.0, about: Some(about), clear_for: 0.0, turn_side: 0.0 };
    about
}

#[cfg(test)]
#[path = "land_tests.rs"]
mod tests;
