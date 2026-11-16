//! Shots: an arrow or a bolt flies, falling a little, until it meets a block or a body; a gun's ball reaches its mark
//! at once along its line. A body is an upright cylinder from its feet.

use crate::arms::Ranged;
use crate::fighter::FighterId;
use crate::tuning::{BODY_HEIGHT, BODY_RADIUS};
use movement::{Block, TICK_SECONDS};

/// A shot in flight: what shot it, where it is and how fast it goes (m and m/s), what it does when it lands, and how
/// many ticks it has flown.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Shot {
    pub owner: FighterId,
    pub ranged: Ranged,
    pub at: [f64; 3],
    pub velocity: [f64; 3],
    pub damage: f64,
    pub weight: f64,
    pub age: u32,
}

/// What each weapon's shot does: speed (0 for a ball, which arrives at once), damage at a full draw, weight against
/// poise and guards, and the ticks before it shoots again: the first person's firing frames and its reload.
#[must_use]
pub fn shot_numbers(ranged: Ranged) -> (f64, f64, f64, u32) {
    match ranged {
        Ranged::Bow => (45.0, 18.0, 0.5, 37),
        Ranged::Crossbow => (55.0, 26.0, 0.6, 96),
        Ranged::Pistolet => (0.0, 30.0, 0.8, 114),
        Ranged::Thunderlock => (0.0, 45.0, 1.0, 132),
    }
}

/// An arrow or a bolt falls this fast; a ball reaches this far.
pub const FALL: f64 = 6.0;
pub const BALL_REACH: f64 = 60.0;
/// A bow loosed sooner than this does not shoot; drawn this long it is at full power, and never less than this.
pub const DRAW_LEAST: u32 = 12;
pub const DRAW_FULL: u32 = 60;
pub const DRAW_POWER_LEAST: f64 = 0.4;
/// A flight is let go after this many ticks.
pub const FLIGHT_TICKS: u32 = 240;

/// A shot leaving a fighter's chest along a bearing and pitch, at a share of its full power.
#[must_use]
pub fn loose(owner: FighterId, ranged: Ranged, chest: [f64; 3], bearing: f64, pitch: f64, power: f64) -> Shot {
    let (speed, damage, weight, _) = shot_numbers(ranged);
    let pitch = if pitch.is_finite() { pitch.clamp(-1.4, 1.4) } else { 0.0 };
    let flat = libm::cos(pitch);
    let along = [libm::sin(bearing) * flat, -libm::cos(bearing) * flat, libm::sin(pitch)];
    let at = [chest[0] + along[0] * 0.4, chest[1] + along[1] * 0.4, chest[2] + along[2] * 0.4];
    let speed = if speed > 0.0 { speed } else { BALL_REACH / TICK_SECONDS };
    Shot {
        owner,
        ranged,
        at,
        velocity: [along[0] * speed, along[1] * speed, along[2] * speed],
        damage: damage * power,
        weight,
        age: 0,
    }
}

/// What a tick of flight came to: the shot flown on, or where it stopped and the body it struck, if any.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Flight {
    Flying(Shot),
    Stopped { at: [f64; 3], struck: Option<FighterId> },
}

/// One tick of a shot's flight among the blocks and the bodies (`(id, feet)`), its owner's left out. A ball crosses
/// its whole reach in this one tick.
#[must_use]
pub fn fly(shot: &Shot, blocks: &[Block], bodies: &[(FighterId, [f64; 3])]) -> Flight {
    let falls = shot_numbers(shot.ranged).0 > 0.0;
    let fall = if falls { FALL * TICK_SECONDS } else { 0.0 };
    let velocity = [shot.velocity[0], shot.velocity[1], shot.velocity[2] - fall];
    let to = [
        shot.at[0] + velocity[0] * TICK_SECONDS,
        shot.at[1] + velocity[1] * TICK_SECONDS,
        shot.at[2] + velocity[2] * TICK_SECONDS,
    ];
    let wall = blocks.iter().filter_map(|block| entry(block, shot.at, to)).fold(f64::INFINITY, f64::min);
    let ground = if to[2] < 0.0 && shot.at[2] > to[2] { shot.at[2] / (shot.at[2] - to[2]) } else { f64::INFINITY };
    let body = bodies
        .iter()
        .filter(|(id, _)| *id != shot.owner)
        .filter_map(|(id, feet)| cylinder_entry(*feet, shot.at, to).map(|share| (share, *id)))
        .fold(None, |best: Option<(f64, FighterId)>, found| match best {
            Some(kept) if kept.0 <= found.0 => Some(kept),
            _ => Some(found),
        });
    let stop = wall.min(ground);
    let point = |share: f64| {
        [
            shot.at[0] + (to[0] - shot.at[0]) * share,
            shot.at[1] + (to[1] - shot.at[1]) * share,
            shot.at[2] + (to[2] - shot.at[2]) * share,
        ]
    };
    match body {
        Some((share, id)) if share <= stop => Flight::Stopped { at: point(share), struck: Some(id) },
        _ if stop <= 1.0 => Flight::Stopped { at: point(stop), struck: None },
        _ if !falls || shot.age >= FLIGHT_TICKS => Flight::Stopped { at: to, struck: None },
        _ => Flight::Flying(Shot { at: to, velocity, age: shot.age + 1, ..*shot }),
    }
}

/// How far along the segment (0 to 1) it enters a block's box, if it does.
fn entry(block: &Block, from: [f64; 3], to: [f64; 3]) -> Option<f64> {
    let low = [block.min_x, block.min_y, 0.0];
    let high = [block.max_x, block.max_y, block.top];
    let (mut enter, mut leave) = (0.0_f64, 1.0_f64);
    for axis in 0..3 {
        let span = to[axis] - from[axis];
        if span.abs() < 1e-12 {
            if from[axis] < low[axis] || from[axis] > high[axis] {
                return None;
            }
            continue;
        }
        let (first, second) = ((low[axis] - from[axis]) / span, (high[axis] - from[axis]) / span);
        enter = enter.max(first.min(second));
        leave = leave.min(first.max(second));
        if enter > leave {
            return None;
        }
    }
    Some(enter)
}

/// How far along the segment (0 to 1) it enters the upright cylinder of a body standing at `feet`, if it does.
fn cylinder_entry(feet: [f64; 3], from: [f64; 3], to: [f64; 3]) -> Option<f64> {
    let (start_x, start_y) = (from[0] - feet[0], from[1] - feet[1]);
    let (span_x, span_y) = (to[0] - from[0], to[1] - from[1]);
    let square = span_x * span_x + span_y * span_y;
    let inside = start_x * start_x + start_y * start_y - BODY_RADIUS * BODY_RADIUS;
    let enter = if square < 1e-12 {
        if inside > 0.0 {
            return None;
        }
        0.0
    } else {
        let half = start_x * span_x + start_y * span_y;
        let reach = half * half - square * inside;
        if reach < 0.0 {
            return None;
        }
        ((-half - reach.sqrt()) / square).max(0.0)
    };
    if enter > 1.0 {
        return None;
    }
    let height = from[2] + (to[2] - from[2]) * enter - feet[2];
    (0.0..=BODY_HEIGHT).contains(&height).then_some(enter)
}
