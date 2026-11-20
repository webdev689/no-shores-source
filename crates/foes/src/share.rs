//! How foes share themselves out among the fighters they fight. A foe goes for the one it could strike soonest: its run
//! there, and a beat for each other foe already at it, since blows at one target land a beat apart. It leaves the
//! nearest, or the one it fights, only for one it would strike half a beat sooner. Waiting its turn on the ring it
//! weighs whom to fight again every quarter second, as DFO's target timer does, but having changed whom it fights it
//! holds to it a while. A fighter that strikes it draws it, unless the one it fights stands in its reach, as DFO's foes
//! keep a target in sight within 2 m, or another drew it a moment ago. A foe with no one else in sight fights as it
//! always did.

use crate::board::Board;
use crate::brain::{Brain, Plan};
use crate::leash::within;
use crate::senses::{Here, Sight, feet, in_sight, sight};
use crate::tuning::{SHARE_EVERY, SHARE_HOLD, SHARE_SOONER, SWING_SLACK};
use combat::arms::weapon;
use combat::fighter::Action;
use combat::lock::sees;
use combat::{Fighter, FighterId};
use movement::TUNING;

/// How soon, in seconds, it could land a blow on `target`, `distance` m off: its run there, and a beat for each other
/// foe already at it.
fn soon(here: &Here<'_, '_>, board: &Board, target: FighterId, distance: f64) -> f64 {
    let beat = here.world.director.pressed().beat;
    distance / TUNING.run + beat * board.fighting(target, here.me) as f64
}

/// Of the fighters it sees (`seen`, as `in_sight` gives them), the one to go for rather than `kept` (an id and its
/// distance): the soonest to strike, if SHARE_SOONER of a beat sooner than `kept`, and one its leash lets it fight.
pub fn sooner<'seen>(
    brain: &Brain,
    here: &Here<'_, '_>,
    board: &Board,
    kept: (FighterId, f64),
    seen: &'seen [(f64, FighterId, Fighter, f64)],
) -> Option<&'seen (f64, FighterId, Fighter, f64)> {
    let bar = soon(here, board, kept.0, kept.1) - SHARE_SOONER * here.world.director.pressed().beat;
    seen.iter()
        .filter(|(_, id, other, _)| *id != kept.0 && within(brain, here, other))
        .map(|entry| (soon(here, board, entry.1, entry.0), entry))
        .filter(|(time, _)| *time < bar)
        .min_by(|first, second| first.0.total_cmp(&second.0).then(first.1.1.cmp(&second.1.1)))
        .map(|(_, entry)| entry)
}

/// Its target this tick: kept, or, free to change it, the fighter that struck it, or one it would strike sooner.
pub fn share(brain: &mut Brain, here: &Here<'_, '_>, board: &Board, sight: Option<Sight>) -> Option<Sight> {
    let Some(kept) = sight else {
        brain.struck_by = None;
        return None;
    };
    let (tick, hold) = (here.tick(), Here::ticks(SHARE_HOLD));
    // A blow draws it only while it fights on: not once it backs off or runs, nor with the one it fights in its reach,
    // nor while it holds to one that drew it.
    let reach = weapon(here.fighter.arms.melee).reach + SWING_SLACK;
    let holding = brain.drawn_at.is_some_and(|at| tick < at + hold);
    if matches!(brain.plan, Plan::Backoff | Plan::Flee) || (kept.seen && kept.distance <= reach) || holding {
        brain.struck_by = None;
    }
    // Mid-blow, mid-wind-up or reeling, it changes nothing until it is free.
    if !matches!(here.fighter.action, Action::Idle | Action::Guard { .. }) {
        return Some(kept);
    }
    let striker = brain.struck_by.take().and_then(|id| here.enemy(id).map(|other| (id, *other)));
    if let Some((id, other)) = striker.filter(|(_, other)| within(brain, here, other)) {
        let seen = sees(here.world.blocks, here.world.terrain, &here.fighter, &other);
        brain.drawn_at = Some(tick);
        return Some(turn_to(brain, here, id, &other, seen));
    }
    let waiting =
        brain.plan == Plan::Wait && !board.holds(kept.id, here.me, false) && !board.holds(kept.id, here.me, true);
    let due = (tick + u64::from(here.me)).is_multiple_of(Here::ticks(SHARE_EVERY));
    if !waiting || !due || tick < brain.taken_at + hold {
        return Some(kept);
    }
    let seen = in_sight(here);
    match sooner(brain, here, board, (kept.id, kept.distance), &seen) {
        Some(&(_, id, other, _)) => Some(turn_to(brain, here, id, &other, true)),
        None => Some(kept),
    }
}

/// Its target changed to `id`, standing where it is now.
fn turn_to(brain: &mut Brain, here: &Here<'_, '_>, id: FighterId, other: &Fighter, seen: bool) -> Sight {
    brain.target = Some(id);
    brain.last_seen = Some(feet(other));
    brain.seen_at = here.tick();
    brain.awareness.look = None;
    sight(here, id, other, seen, brain.last_seen)
}

#[cfg(test)]
#[path = "share_tests.rs"]
mod share_tests;
