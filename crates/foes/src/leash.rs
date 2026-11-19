//! A garrison foe's walks home to its post. Once its target stands LEASH from its place at its post, or off the ground
//! the room's routes cover, it gives its fight up: its target, the blow it saw coming, its hunt and its search. Once a
//! search finds no one, it lets go. Either way it goes back to its first phase, and walks back to its place, healing as
//! it goes so it is whole as it arrives, turns to face as it was posted, and stands idle. Leashed, it heeds nothing it
//! sees or hears on the way, so the one it gave up on cannot draw it out again at once; only a blow brings it back.
//! After a search it heeds them as ever, and turns back to the fight only once they alert it.

use crate::awareness::{Awareness, look};
use crate::board::Board;
use crate::brain::{Brain, Home, Homeward, Plan};
use crate::react::Reactions;
use crate::senses::Here;
use crate::shoot::Bow;
use crate::steer::{Ask, way_to};
use crate::tuning::{ALERT_OFF, HOME_FACED, HOME_REACHED, KEEP_UP, LEASH, SQUARING_PACE};
use combat::fighter::Action;
use combat::sight::{apart, off};
use movement::{TICK_SECONDS, TUNING};

/// What its leash asks this tick: its walk back, once it has given its fight up; none for a foe with no post, one
/// whose target stands near enough its post, or one still winding up a blow (a roar's new phase begins in its wind-up).
pub fn leash(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board) -> Option<Ask> {
    let home = brain.home?;
    if brain.returning.is_some() && brain.target.is_some() {
        // A blow on it on its way back: it fights again, unless that one too stands past its leash.
        brain.returning = None;
    }
    if brain.returning != Some(Homeward::Leashed) {
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

/// What a foe with no one to fight asks: a garrison foe whose search has just let go (it was alert before its senses
/// this tick, `was_alert`) walks home, and goes on walking while nothing turns it alert; one with nothing stirring it
/// keeps to its place, stepping back to it when an ally passing by has moved it; any other looks about.
pub fn unoccupied(brain: &mut Brain, here: &Here<'_, '_>, was_alert: bool) -> Ask {
    let Some(home) = brain.home else { return look(brain, here) };
    if brain.returning == Some(Homeward::Searched) && !brain.awareness.alert {
        return walk_home(brain, here, home);
    }
    brain.returning = None;
    let ask = look(brain, here);
    if !brain.awareness.alert && brain.awareness.level <= ALERT_OFF {
        return walk_home(brain, here, home);
    }
    if !was_alert || brain.awareness.alert {
        return ask;
    }
    start_home(brain, Homeward::Searched);
    walk_home(brain, here, home)
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
    start_home(brain, Homeward::Leashed);
}

/// Its walk home begun, its next fight a fresh one: back in its first phase, its numbers, blows and chains that
/// phase's, with no blow, chain or roar owed, and its Expose and Charge shed. The room sees it walk home, and the foes
/// it called fall.
fn start_home(brain: &mut Brain, why: Homeward) {
    let tells = &mut brain.tells;
    (tells.windup, tells.ended, tells.chained, tells.roar, tells.phase) = (None, None, 0, false, 1);
    brain.calls.cleanse = true;
    brain.returning = Some(why);
}

/// Its walk back to its place, healing a share of what it lacks each tick by the walk still left, so it is whole as it
/// arrives; there, it turns to face as it was posted, and is home. While its group walks on and it has nothing to walk
/// back from, it keeps up with its place instead, the faster the farther behind.
fn walk_home(brain: &mut Brain, here: &Here<'_, '_>, home: Home) -> Ask {
    brain.awareness.heard.clear();
    let fighter = &here.fighter;
    let missing = fighter.health_max - fighter.health;
    let left = apart(here.at(), [home.at[0], home.at[1]]);
    if home.marching && brain.returning.is_none() {
        brain.calls.heal = missing;
        let way = (left > HOME_REACHED).then(|| way_to(here, home.at)).flatten();
        return way.map_or_else(|| Ask::facing(home.facing), |way| Ask::walking(way, (left / KEEP_UP).min(1.0), false));
    }
    if left > HOME_REACHED
        && let Some(way) = way_to(here, home.at)
    {
        brain.calls.heal = missing * (TUNING.walk * TICK_SECONDS / left).min(1.0);
        return Ask::walking(way, 1.0, false);
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
