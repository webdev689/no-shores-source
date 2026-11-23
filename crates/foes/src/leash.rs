//! A garrison foe's walks home to its post. It gives its fight up once its target stands past its leash from its post,
//! or far from it on ground the room's routes do not cover (never one close by), or once a search finds no one: back to
//! its first phase, it walks to its place healing so it is whole as it arrives, turns as it was posted and stands idle.
//! Leashed, it heeds nothing it sees or hears on the way, so the one it gave up on cannot draw it out again at once;
//! only a blow brings it back. After a search it heeds them as ever, and turns back to the fight only once they alert
//! it. Falling back as its group gives ground, it runs to its new place, its target and its awareness kept.

use crate::awareness::{Awareness, look};
use crate::board::Board;
use crate::brain::{Brain, Home, Homeward, Plan};
use crate::react::Reactions;
use crate::senses::Here;
use crate::shoot::Bow;
use crate::steer::{Ask, way_to};
use crate::tuning::{ALERT_OFF, ENGAGE_RANGE, FALLEN_BACK, HOME_FACED, HOME_REACHED, KEEP_UP, SQUARING_PACE};
use combat::fighter::Action;
use combat::sight::{apart, off};
use movement::TICK_SECONDS;

/// What its leash asks this tick: its walk back, once it has given its fight up; none for a foe with no post, one
/// whose target stands near enough its post, or one still winding up a blow (a roar's new phase begins in its wind-up).
pub fn leash(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board) -> Option<Ask> {
    let home = brain.home?;
    if brain.returning == Some(Homeward::Falling) {
        return fall_back(brain, here, board, home);
    }
    if brain.returning.is_some() && brain.target.is_some() {
        // A blow on it on its way back: it fights again, unless that one too stands past its leash.
        brain.returning = None;
    }
    if brain.returning != Some(Homeward::Leashed) {
        if matches!(here.fighter.action, Action::Telegraph(_)) {
            return None;
        }
        let target = brain.target.and_then(|target| here.enemy(target))?;
        if within(brain, here, target) {
            return None;
        }
        give_up(brain, here, board);
    }
    Some(walk_home(brain, here, home))
}

/// Its run back to its group's new place, its turn given up, until it stands within FALLEN_BACK of it, or has no
/// target left to fight from there; a wind-up of its own it finishes first.
fn fall_back(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board, home: Home) -> Option<Ask> {
    if matches!(here.fighter.action, Action::Telegraph(_)) {
        return None;
    }
    // A target that fell, left or is left be is no target to fight from there: its senses let it go as they do.
    let fighting = brain.target.is_some_and(|target| here.enemy(target).is_some());
    let left = apart(here.at(), [home.at[0], home.at[1]]);
    let way = (left > FALLEN_BACK && fighting).then(|| way_to(here, home.at)).flatten();
    let Some(way) = way else {
        brain.returning = None;
        return None;
    };
    board.forget(here.me);
    brain.plan = Plan::Wait;
    (brain.ready_at, brain.slot) = (None, None);
    Some(Ask::walking(way, 1.0, true))
}

/// Whether a foe may fight a fighter where it stands: a garrison foe only within its leash (LEASH, or its own) of its
/// place, and, while that fighter stands on the ground, only on ground the room's routes cover from that place, unless
/// it stands close to the foe itself, within the range it engages a target it sees: a foe never gives up on one close
/// by. A body in the air, on a wall or over a lip is judged by its distance alone: the navmesh lies on the floor, and its
/// leap or climb lands back on it.
pub fn within(brain: &Brain, here: &Here<'_, '_>, other: &combat::Fighter) -> bool {
    let feet = [other.body.x, other.body.y];
    let near = |home: Home| apart([home.at[0], home.at[1]], feet) <= brain.leash;
    brain.home.is_none_or(near) && (apart(here.at(), feet) <= ENGAGE_RANGE || reachable(brain, here, other))
}

/// Whether a garrison foe's routes reach where a fighter stands from its place, however far: always for a body off the
/// ground, and for any foe with no place.
pub fn reachable(brain: &Brain, here: &Here<'_, '_>, other: &combat::Fighter) -> bool {
    let feet = [other.body.x, other.body.y, other.body.z];
    let grounded = other.body.mode == movement::Mode::Ground;
    brain.home.is_none_or(|home| !grounded || here.world.routes.walkable(home.at, feet))
}

/// What a foe with no one to fight asks: a garrison foe whose search has just let go (it was alert before its senses
/// this tick, `was_alert`) walks home, and goes on walking while nothing turns it alert; one with nothing stirring it
/// keeps to its place, stepping back to it when an ally passing by has moved it; any other looks about.
pub fn unoccupied(brain: &mut Brain, here: &Here<'_, '_>, was_alert: bool) -> Ask {
    let Some(home) = brain.home else { return look(brain, here) };
    if let Some(heel) = brain.heel {
        let far = apart(here.at(), [home.at[0], home.at[1]]) > heel;
        return if far { walk_home(brain, here, home) } else { look(brain, here) };
    }
    if brain.returning == Some(Homeward::Searched) && !brain.awareness.alert {
        return walk_home(brain, here, home);
    }
    brain.returning = None;
    let ask = look(brain, here);
    // Its search over, by its look about or by its awareness bleeding away first: it walks home either way.
    if was_alert && !brain.awareness.alert {
        start_home(brain, Homeward::Searched);
        return walk_home(brain, here, home);
    }
    if !brain.awareness.alert && brain.awareness.level <= ALERT_OFF {
        return walk_home(brain, here, home);
    }
    ask
}

/// Its fight given up: its turn and its post on the board, its target, where it last knew it, its awareness, the blow
/// it saw coming and its answer, and all its fight's telegraphed blows.
fn give_up(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board) {
    board.forget(here.me);
    brain.target = None;
    brain.last_seen = None;
    brain.awareness = Awareness::default();
    brain.reactions = Reactions::default();
    brain.bow = Bow::default();
    brain.plan = Plan::Wait;
    (brain.ready_at, brain.slot, brain.blocked, brain.walled) = (None, None, 0, None);
    brain.leashed = true;
    start_home(brain, Homeward::Leashed);
}

/// Its walk home begun, its next fight a fresh one: back in its first phase, its numbers, blows and chains that
/// phase's, with no blow, chain or roar owed, and its Expose and Charge shed. The room sees it walk home, and the foes
/// it called fall.
fn start_home(brain: &mut Brain, why: Homeward) {
    let tells = &mut brain.tells;
    (tells.windup, tells.ended, tells.chained, tells.roar, tells.phase) = (None, None, 0, false, 1);
    (brain.broken_until, brain.cover, brain.raging, brain.held_since) = (0, None, false, None);
    brain.calls.cleanse = true;
    brain.returning = Some(why);
}

/// Its walk back to its place, healing a share of what it lacks each tick by the walk still left, so it is whole as it
/// arrives; there, it turns to face as it was posted, and is home. While its group walks on and it has nothing to walk
/// back from, it keeps up with its place instead, the faster the farther behind. A companion runs to keep up with its
/// leader, heals nothing, and is home once within its heel.
fn walk_home(brain: &mut Brain, here: &Here<'_, '_>, home: Home) -> Ask {
    brain.awareness.heard.clear();
    let fighter = &here.fighter;
    let missing = fighter.health_max - fighter.health;
    let left = apart(here.at(), [home.at[0], home.at[1]]);
    if home.marching && brain.returning.is_none() && brain.heel.is_none() {
        brain.calls.heal = missing;
        let way = (left > HOME_REACHED).then(|| way_to(here, home.at)).flatten();
        return way.map_or_else(|| Ask::facing(home.facing), |way| Ask::walking(way, (left / KEEP_UP).min(1.0), false));
    }
    if left > brain.heel.unwrap_or(HOME_REACHED)
        && let Some(way) = way_to(here, home.at)
    {
        if brain.heel.is_none() {
            brain.calls.heal = missing * (here.walk() * TICK_SECONDS / left).min(1.0);
        }
        return Ask::walking(way, 1.0, brain.heel.is_some());
    }
    if brain.heel.is_some() {
        brain.returning = None;
        return Ask::facing(brain.heading);
    }
    brain.calls.heal = missing;
    let body = fighter.body.facing;
    if off(brain.heading, home.facing) <= HOME_FACED && off(body, home.facing) <= HOME_FACED {
        brain.returning = None;
        return Ask::facing(home.facing);
    }
    // A body turns only as it moves: a step of a hair along the way it was posted squares it there.
    Ask { unspaced: true, ..Ask::stepping(home.facing, SQUARING_PACE, home.facing) }
}

#[cfg(test)]
#[path = "leash_tests.rs"]
mod leash_tests;
