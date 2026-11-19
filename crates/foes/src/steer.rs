//! How a foe moves: what its thinking asks (a way to go and how fast, a bearing to face, the fight's buttons) turned
//! into its fighter's controls. It turns at its own pace; walking away it turns first and steps only once it faces
//! its way; it steers apart from the foes beside it; and it finds its way by the routes the room hands in, climbing
//! and dropping where they cross a block with the controls a player would use.

use crate::brain::Brain;
use crate::senses::Here;
use crate::tuning::{CLEAR, SPACING, SPACING_PACE, SQUARE, TURN, WALK_FACE};
use combat::sight::{apart, bearing, off, turned, wrap};
use combat::{CombatInput, Intent};
use movement::blocks::wall_ahead;
use movement::step::{CLIMB_SQUARE, square_into};
use movement::{Block, Body, Controls, Mode, TICK_SECONDS, TUNING};

/// How far wider than the rules' square a foe looks to keep off a wall it is not to climb, in radians.
const WIDE_OF_SQUARE: f64 = 0.02;

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

    /// The same, its guard held up or not.
    #[must_use]
    pub fn guarded(mut self, guard: bool) -> Self {
        self.combat.guard = guard;
        self
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

/// Whether an ally of its side already stands nearer a place than it does, within SPACING of it: walking on for the
/// place would only press into that ally, so foes making for one place stand behind the first there.
#[must_use]
pub fn taken(here: &Here<'_, '_>, place: [f64; 3]) -> bool {
    let (at, to) = (here.at(), [place[0], place[1]]);
    let mine = apart(at, to);
    here.world.fighters.iter().any(|(id, other)| {
        let there = [other.body.x, other.body.y];
        here.ally(*id, other) && apart(there, at) < SPACING && apart(there, to) < mine
    })
}

/// Its move, as shares of a walk east and south, steered clear of the foes of its side standing too near: inside
/// SPACING each pushes it away, harder the nearer, and the part of its move that walks into one turns aside round it,
/// all of it within CLEAR, so a foe pressing on toward its target slips past an ally rather than through it. It turns
/// the way its move already leans, and dead on the side its number picks, the same on every machine. Each ally turns
/// the move as asked, not as another already turned it, so a foe between two is held back, not tossed between them.
fn spaced(here: &Here<'_, '_>, wish: [f64; 2]) -> [f64; 2] {
    let at = here.at();
    let (mut push, mut bent) = ([0.0, 0.0], wish);
    for (id, other) in here.world.fighters {
        if !here.ally(*id, other) {
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
        let out = [libm::sin(away), -libm::cos(away)];
        let share = (SPACING - distance) / SPACING * SPACING_PACE;
        push = [push[0] + out[0] * share, push[1] + out[1] * share];
        let along = wish[0] * out[0] + wish[1] * out[1];
        if along < 0.0 {
            let across = [wish[0] - along * out[0], wish[1] - along * out[1]];
            let length = libm::sqrt(across[0] * across[0] + across[1] * across[1]);
            let side = here.way_round(0.0);
            let aside =
                if length > 1e-9 { [across[0] / length, across[1] / length] } else { [-out[1] * side, out[0] * side] };
            let turned = -along * ((SPACING - distance) / (SPACING - CLEAR)).min(1.0);
            bent = [bent[0] + (out[0] + aside[0]) * turned, bent[1] + (out[1] + aside[1]) * turned];
        }
    }
    let length = libm::sqrt(push[0] * push[0] + push[1] * push[1]);
    let push =
        if length > SPACING_PACE { [push[0] / length * SPACING_PACE, push[1] / length * SPACING_PACE] } else { push };
    [bent[0] + push[0], bent[1] + push[1]]
}

/// Crossing a block: a foe on its side, or in the air, presses on the way it faces, so it goes up and over, or catches
/// a lip it jumped for; one whose way crosses a climb or a drop from where it stands turns square to the side, then
/// walks on along its way, pressing jump to go over where the crossing says, never running nor steered apart. So the
/// rules carry it across as they carry a player, or, struck or set down short, it finds its way again from wherever
/// it stands.
fn across(brain: &mut Brain, here: &Here<'_, '_>, ask: &Ask) -> Option<Controls> {
    let body = here.fighter.body;
    if matches!(body.mode, Mode::Climb | Mode::Hang | Mode::Air) {
        brain.heading = body.facing;
        return Some(Controls { forward: 1.0, yaw: body.facing, ..Controls::default() });
    }
    let (way, _) = ask.way?;
    let crossing = here.world.routes.crossing(here.feet()).filter(|crossing| off(way, crossing.bearing) <= SQUARE)?;
    brain.heading = turned(brain.heading, crossing.bearing, TURN);
    let square = off(brain.heading, crossing.bearing) <= SQUARE;
    if square {
        brain.heading = crossing.bearing;
    }
    let jump = square && crossing.jump && body.mode == Mode::Ground;
    Some(Controls { forward: if square { 1.0 } else { 0.0 }, yaw: brain.heading, jump, ..Controls::default() })
}

/// Whether this tick's step, a share of a walk (or a run) east and south, walks a foe on its feet off an edge more
/// than a step high. Only a crossing drops a foe: its hop back from a blow, or its circling, holds at the edge.
fn off_edge(here: &Here<'_, '_>, share: [f64; 2], run: bool) -> bool {
    let feet = here.feet();
    let pace = if run { TUNING.run } else { TUNING.walk } * TICK_SECONDS;
    let to = [feet[0] + share[0] * pace, feet[1] + share[1] * pace, feet[2]];
    here.fighter.body.mode == Mode::Ground && here.world.routes.drops(feet, to)
}

/// The intent an ask comes to: the heading turned toward what it faces, the move made relative to it.
#[must_use]
pub fn controls(brain: &mut Brain, here: &Here<'_, '_>, ask: &Ask) -> Intent {
    if let Some(controls) = across(brain, here, ask) {
        return Intent { controls, combat: ask.combat };
    }
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
        wish = spaced(here, wish);
    }
    let whole = libm::sqrt(wish[0] * wish[0] + wish[1] * wish[1]);
    let length = whole.min(1.0);
    let share = if whole > 1e-9 { [wish[0] / whole * length, wish[1] / whole * length] } else { [0.0, 0.0] };
    let held = length > 1e-9 && off_edge(here, share, ask.run);
    let length = if held { 0.0 } else { length };
    // Faced near square into a wall too high to grab that its step makes no way into, the rules would take hold of
    // it; only a crossing climbs, so this tick it looks just wide of square, and moves on as asked.
    let yaw = climbs_ahead(here, brain.heading, share, ask.run).map_or(brain.heading, |into| {
        let side = if wrap(brain.heading - into) < 0.0 { -1.0 } else { 1.0 };
        wrap(into + side * (CLIMB_SQUARE + WIDE_OF_SQUARE))
    });
    let (forward, sideways) = if length > 1e-9 {
        let relative = wrap(libm::atan2(wish[0], -wish[1]) - yaw);
        (libm::cos(relative) * length, libm::sin(relative) * length)
    } else {
        (0.0, 0.0)
    };
    Intent { controls: Controls { forward, sideways, yaw, run: ask.run, ..Controls::default() }, combat: ask.combat }
}

/// The bearing square into the side of a wall too high to grab that a step along its heading would take hold of, as
/// the rules take hold for a body stepping on along its heading, faced near square into a side its move makes no way
/// into, from where it stands or where this tick's step (a share of a walk, or a run) leaves it; none when the step
/// takes hold of nothing.
fn climbs_ahead(here: &Here<'_, '_>, heading: f64, share: [f64; 2], run: bool) -> Option<f64> {
    let body = here.fighter.body;
    let pace = if run { TUNING.run } else { TUNING.walk } * TICK_SECONDS;
    let stepped = Body { x: body.x + share[0] * pace, y: body.y + share[1] * pace, ..body };
    let held_by = |block: &Block| {
        let into = square_into(block, &body);
        // Its step toward the side, and the room left before its body meets the side.
        let toward = (libm::sin(into) * share[0] - libm::cos(into) * share[1]) * pace;
        let gap =
            (block.min_x - body.x).max(body.x - block.max_x).max((block.min_y - body.y).max(body.y - block.max_y));
        let stopped = toward.abs() < 1e-9 || toward > gap - TUNING.radius;
        (stopped && block.top - body.z > TUNING.reach && off(heading, into) <= CLIMB_SQUARE).then_some(into)
    };
    let walls = [body, stepped].map(|at| wall_ahead(here.world.blocks, &at, heading));
    // Only a step with some way along its heading presses on into what is before it.
    let onward = libm::sin(heading) * share[0] - libm::cos(heading) * share[1] > 1e-9;
    let held = walls.iter().flatten().find_map(|wall| held_by(&wall.block));
    held.filter(|_| onward && body.mode == Mode::Ground)
}
