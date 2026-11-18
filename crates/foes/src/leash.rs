//! A garrison foe's leash to its post. Once its target stands LEASH from its place at its post, or off the ground the
//! room's routes cover, it gives its fight up: its target, the blow it saw coming, its hunt and its search. It walks
//! back to its place, healing as it goes so it is whole as it arrives, turns to face as it was posted, and stands idle.
//! Walking back it heeds nothing it sees or hears, so the one it gave up on cannot draw it out again at once; only a
//! blow on it brings it back to the fight.

use crate::awareness::Awareness;
use crate::board::Board;
use crate::brain::{Brain, Home, Plan};
use crate::react::Reactions;
use crate::senses::Here;
use crate::shoot::Bow;
use crate::steer::{Ask, way_to};
use crate::tuning::{HOME_FACED, HOME_REACHED, LEASH, SQUARING_PACE};
use combat::fighter::Action;
use combat::sight::{apart, off};
use movement::{TICK_SECONDS, TUNING};

/// What its leash asks this tick: its walk back, once it has given its fight up; none for a foe with no post, one
/// whose target stands near enough its post, or one still winding up a blow (a roar's new phase begins in its wind-up).
pub fn leash(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board) -> Option<Ask> {
    let home = brain.home?;
    if brain.returning && brain.target.is_some() {
        // A blow on it on its way back: it fights again, unless that one too stands past its leash.
        brain.returning = false;
    }
    if !brain.returning {
        if matches!(here.fighter.action, Action::Telegraph(_)) {
            return None;
        }
        let target = brain.target.and_then(|target| here.enemy(target))?;
        let feet = [target.body.x, target.body.y, target.body.z];
        let far = apart([home.at[0], home.at[1]], [feet[0], feet[1]]) > LEASH;
        if !far && here.world.routes.walkable(feet) {
            return None;
        }
        give_up(brain, here, board);
    }
    Some(walk_home(brain, here, home))
}

/// Its fight given up: its turn and its post on the board, its target, where it last knew it, its awareness, the blow
/// it saw coming and its answer, the blow it owed, and any roar into a phase its health no longer calls for.
fn give_up(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board) {
    board.forget(here.me);
    brain.target = None;
    brain.last_seen = None;
    brain.awareness = Awareness::default();
    brain.reactions = Reactions::default();
    brain.bow = Bow::default();
    brain.plan = Plan::Wait;
    (brain.ready_at, brain.slot, brain.blocked, brain.walled) = (None, None, 0, None);
    let tells = &mut brain.tells;
    (tells.windup, tells.ended, tells.chained, tells.roar) = (None, None, 0, false);
    brain.returning = true;
}

/// Its walk back to its place, healing a share of what it lacks each tick by the walk still left, so it is whole as it
/// arrives; there, it turns to face as it was posted, and is home.
fn walk_home(brain: &mut Brain, here: &Here<'_, '_>, home: Home) -> Ask {
    brain.awareness.heard.clear();
    let fighter = &here.fighter;
    let missing = fighter.health_max - fighter.health;
    let left = apart(here.at(), [home.at[0], home.at[1]]);
    if left > HOME_REACHED
        && let Some(way) = way_to(here, home.at)
    {
        brain.calls.heal = missing * (TUNING.walk * TICK_SECONDS / left).min(1.0);
        return Ask::walking(way, 1.0, false);
    }
    brain.calls.heal = missing;
    let body = fighter.body.facing;
    if off(brain.heading, home.facing) <= HOME_FACED && off(body, home.facing) <= HOME_FACED {
        brain.returning = false;
        return Ask::facing(home.facing);
    }
    // A body turns only as it moves: a step of a hair along the way it was posted squares it there.
    Ask { unspaced: true, ..Ask::stepping(home.facing, SQUARING_PACE, home.facing) }
}
