//! How a foe moves: what its thinking asks (a way to go and how fast, a bearing to face, the fight's buttons) turned
//! into its fighter's controls. It turns at its own pace; walking away it turns first and steps only once it faces
//! its way; it steers apart from the foes beside it; and it finds its way by the routes the room hands in.

use crate::brain::Brain;
use crate::senses::Here;
use crate::tuning::{SPACING, SPACING_PACE, TURN, WALK_FACE};
use combat::sight::{apart, bearing, off, turned, wrap};
use combat::{CombatInput, Intent};
use movement::Controls;

/// What a foe's thinking asks of its body and its arms this tick.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Ask {
    /// The bearing to move along and at what share of a walk; none to stand.
    pub way: Option<(f64, f64)>,
    /// The bearing to face; none to face its way.
    pub face: Option<f64>,
    /// Face the way and step only once facing it, as a foe walking somewhere does.
    pub walk_facing: bool,
    pub run: bool,
    /// Keep its own course: no steering apart (a dodge's hop goes where it was aimed).
    pub unspaced: bool,
    pub combat: CombatInput,
}

impl Ask {
    /// Standing, facing a bearing.
    #[must_use]
    pub fn facing(bearing: f64) -> Self {
        Ask { face: Some(bearing), ..Ask::default() }
    }

    /// Walking somewhere along a bearing, facing it.
    #[must_use]
    pub fn walking(way: f64, pace: f64, run: bool) -> Self {
        Ask { way: Some((way, pace)), walk_facing: true, run, ..Ask::default() }
    }

    /// Moving along a bearing at a pace while it faces another.
    #[must_use]
    pub fn stepping(way: f64, pace: f64, face: f64) -> Self {
        Ask { way: Some((way, pace)), face: Some(face), ..Ask::default() }
    }
}

/// The bearing to walk to reach a spot by the room's routes, or none when there is no way. A route's corner underfoot
/// gives way to the spot itself; the stop is always measured to the target, never to a corner.
#[must_use]
pub fn way_to(here: &Here<'_, '_>, spot: [f64; 3]) -> Option<f64> {
    let from = here.feet();
    let point = here.world.routes.next_point(from, spot)?;
    let point = if apart([from[0], from[1]], [point[0], point[1]]) < 0.05 { spot } else { point };
    Some(bearing([from[0], from[1]], [point[0], point[1]]))
}

/// The push away from the foes of its side standing too near, as a share of a walk east and south.
fn spacing(here: &Here<'_, '_>) -> [f64; 2] {
    let at = here.at();
    let mut push = [0.0, 0.0];
    for (id, other) in here.world.fighters {
        if *id == here.me || other.side != here.fighter.side || other.dead() {
            continue;
        }
        let distance = apart(at, [other.body.x, other.body.y]);
        if distance >= SPACING {
            continue;
        }
        // Two on one spot part along a bearing their ids pick, the same on every machine.
        let away = if distance > 1e-6 {
            bearing([other.body.x, other.body.y], at)
        } else {
            f64::from(here.me.wrapping_sub(*id)) * 2.399_963_229_728_653
        };
        let share = (SPACING - distance) / SPACING * SPACING_PACE;
        push[0] += libm::sin(away) * share;
        push[1] -= libm::cos(away) * share;
    }
    let length = (push[0] * push[0] + push[1] * push[1]).sqrt();
    if length > SPACING_PACE { [push[0] / length * SPACING_PACE, push[1] / length * SPACING_PACE] } else { push }
}

/// The intent an ask comes to: the heading turned toward what it faces, the move made relative to it.
#[must_use]
pub fn controls(brain: &mut Brain, here: &Here<'_, '_>, ask: &Ask) -> Intent {
    let way = ask.way.map(|(way, _)| way);
    let face = if ask.walk_facing { way.or(ask.face) } else { ask.face.or(way) };
    if let Some(face) = face {
        brain.heading = turned(brain.heading, face, TURN);
    }
    let mut wish = [0.0, 0.0];
    if let Some((way, pace)) = ask.way
        && (!ask.walk_facing || off(brain.heading, way) <= WALK_FACE)
    {
        wish = [libm::sin(way) * pace, -libm::cos(way) * pace];
    }
    if !ask.unspaced {
        let push = spacing(here);
        wish = [wish[0] + push[0], wish[1] + push[1]];
    }
    let length = (wish[0] * wish[0] + wish[1] * wish[1]).sqrt().min(1.0);
    let (forward, sideways) = if length > 1e-9 {
        let relative = wrap(libm::atan2(wish[0], -wish[1]) - brain.heading);
        (libm::cos(relative) * length, libm::sin(relative) * length)
    } else {
        (0.0, 0.0)
    };
    Intent {
        controls: Controls { forward, sideways, yaw: brain.heading, run: ask.run, ..Controls::default() },
        combat: ask.combat,
    }
}
