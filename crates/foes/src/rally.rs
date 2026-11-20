//! A foe as its group asks. Broken by its leader's fall, it gives its turn up and falls back to cover, or runs or backs
//! off in the open; its group defending its ground, a fighter hand to hand keeps to its place against a target that
//! stands off.

use crate::board::Board;
use crate::brain::{Brain, Plan};
use crate::cover::cover_from;
use crate::roles::Role;
use crate::senses::{Here, Sight};
use crate::steer::{Ask, way_to};
use crate::tuning::{DEFEND, GUARD_RESERVE, HOME_REACHED, PATIENCE, SHARE_HOLD};
use combat::sight::apart;

/// Broken by its leader's fall, for the break's time it gives its turn up and falls back behind the nearest cover from
/// its target; in the open a skirmisher runs, and any other backs off, a shooter stepping back, a fighter hand to hand
/// huddled on a farther ring, its guard up if it bears a shield.
pub(crate) fn broken(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board, sight: &Sight) {
    let tick = here.tick();
    if tick >= brain.broken_until {
        brain.cover = None;
        return;
    }
    let breaking = if brain.role() == Role::Skirmisher { Plan::Flee } else { Plan::Backoff };
    if brain.plan == breaking && brain.until >= brain.broken_until {
        return;
    }
    brain.plan = breaking;
    (brain.until, brain.hop_until, brain.ready_at) = (brain.broken_until, brain.broken_until, None);
    board.hand_on(sight.id, here.me, tick);
    brain.cover = cover_from(here, board, sight);
}

/// Its group defending its ground, a fighter hand to hand fights only a target within DEFEND of its place, or a target
/// whose blow struck it in the last SHARE_HOLD, or one that has stood within its range of its place for PATIENCE, until
/// it goes out of that range again: past that it gives its turn up, keeps to its place and faces its target, its guard
/// up if it bears a shield.
pub(crate) fn hold_ground(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board, sight: &Sight) -> Option<Ask> {
    let Some(home) = brain.home.filter(|_| brain.orders.defend && !here.numbers.shooter && !brain.raging) else {
        brain.held_since = None;
        return None;
    };
    let tick = here.tick();
    let struck = brain.struck_at.is_some_and(|(by, at)| by == sight.id && tick < at + Here::ticks(SHARE_HOLD));
    let from_place = apart([home.at[0], home.at[1]], [sight.spot[0], sight.spot[1]]);
    if from_place > here.range() {
        brain.held_since = None;
    } else if from_place > DEFEND {
        // A standoff lasts a foe's patience, then it comes for its target.
        let since = *brain.held_since.get_or_insert(tick);
        if tick >= since + Here::ticks(PATIENCE) {
            return None;
        }
    }
    if struck || from_place <= DEFEND {
        return None;
    }
    board.forget(here.me);
    if brain.plan == Plan::Engage {
        brain.plan = Plan::Wait;
    }
    brain.ready_at = None;
    let guard = here.numbers.block > 0.0 && here.fighter.stamina > GUARD_RESERVE;
    let left = apart(here.at(), [home.at[0], home.at[1]]);
    let back = (left > HOME_REACHED).then(|| way_to(here, home.at)).flatten();
    let ask = back.map_or_else(|| Ask::facing(sight.toward), |way| Ask::stepping(way, 1.0, sight.toward));
    Some(ask.guarded(guard))
}
