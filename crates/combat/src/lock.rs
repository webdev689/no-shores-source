//! The soft lock, as Soulframe has it: no button. A fighter's lock takes the foe it swings at or raises its guard
//! to, and the one that strikes it; it steers that fighter's swings and guard while it holds. It lets go when the foe
//! dies, walks out of range, is lost from sight, or the fighter turns its look away. The camera stays its player's.

use crate::fighter::{Fighter, FighterId};
use crate::sight::{apart, bearing, clear_line, off};
use crate::tuning::{LOCK_ARC, LOCK_AWAY, LOCK_AWAY_TICKS, LOCK_BREAK, LOCK_RANGE, LOCK_UNSEEN_TICKS};
use movement::Block;

/// Whether one fighter sees another's chest, nothing between.
#[must_use]
pub fn sees(blocks: &[Block], from: &Fighter, to: &Fighter) -> bool {
    clear_line(blocks, from.chest(), to.chest())
}

/// The foe a fighter looking along `yaw` would take: alive, on another side, within range, in sight and within the
/// lock's arc of the look; the one nearest the look and nearest by distance, by equal shares.
#[must_use]
pub fn choose(
    me_id: FighterId,
    me: &Fighter,
    yaw: f64,
    fighters: &[(FighterId, Fighter)],
    blocks: &[Block],
) -> Option<FighterId> {
    let at = [me.body.x, me.body.y];
    fighters
        .iter()
        .filter(|(id, other)| *id != me_id && other.side != me.side && !other.dead())
        .filter_map(|(id, other)| {
            let there = [other.body.x, other.body.y];
            let distance = apart(at, there);
            let turn = off(yaw, bearing(at, there));
            (distance <= LOCK_RANGE && turn <= LOCK_ARC && sees(blocks, me, other))
                .then_some((turn / LOCK_ARC + distance / LOCK_RANGE, *id))
        })
        .min_by(|first, second| first.0.total_cmp(&second.0).then(first.1.cmp(&second.1)))
        .map(|(_, id)| id)
}

/// The lock carried a tick: kept while its foe lives, stays within range and in sight, and the look does not stay
/// turned away; let go otherwise.
#[must_use]
pub fn hold(me: &Fighter, yaw: f64, fighters: &[(FighterId, Fighter)], blocks: &[Block]) -> Fighter {
    let Some(target) = me.target else { return *me };
    let found = fighters.iter().find(|(id, _)| *id == target).map(|(_, other)| other);
    let Some(other) = found.filter(|other| !other.dead()) else { return let_go(me) };
    let (at, there) = ([me.body.x, me.body.y], [other.body.x, other.body.y]);
    if apart(at, there) > LOCK_BREAK {
        return let_go(me);
    }
    let lock_unseen = if sees(blocks, me, other) { 0 } else { me.lock_unseen + 1 };
    let lock_away = if off(yaw, bearing(at, there)) > LOCK_AWAY { me.lock_away + 1 } else { 0 };
    if lock_unseen > LOCK_UNSEEN_TICKS || lock_away > LOCK_AWAY_TICKS {
        return let_go(me);
    }
    Fighter { lock_unseen, lock_away, ..*me }
}

fn let_go(me: &Fighter) -> Fighter {
    Fighter { target: None, lock_away: 0, lock_unseen: 0, ..*me }
}

/// The lock as a swing or a guard begins: a fighter with no target, or one off the lock's arc of its look, takes the
/// foe it would choose now, if any.
#[must_use]
pub fn take(me_id: FighterId, me: &Fighter, yaw: f64, fighters: &[(FighterId, Fighter)], blocks: &[Block]) -> Fighter {
    let keeps = me
        .target
        .and_then(|target| fighters.iter().find(|(id, _)| *id == target))
        .is_some_and(|(_, other)| off(yaw, bearing([me.body.x, me.body.y], [other.body.x, other.body.y])) <= LOCK_ARC);
    if keeps {
        return *me;
    }
    match choose(me_id, me, yaw, fighters, blocks) {
        Some(target) => Fighter { target: Some(target), lock_away: 0, lock_unseen: 0, ..*me },
        None => *me,
    }
}
