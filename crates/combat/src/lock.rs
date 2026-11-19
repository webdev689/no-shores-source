//! The soft lock, as Soulframe has it: no button. A fighter's lock takes the foe it swings at, raises its guard to or
//! shoots at from the hip, and the one that strikes it; it steers that fighter's swings, guard and quick shots while
//! it holds. It lets go when the foe dies, walks out of range, is lost from sight, the fighter looks past its arc, or
//! the fighter aims a ranged weapon. The camera stays its player's.

use crate::fighter::{Fighter, FighterId};
use crate::sight::{apart, bearing, clear_line, off};
use crate::tuning::{LOCK_ARC, LOCK_BREAK, LOCK_KEEP, LOCK_RANGE, LOCK_UNSEEN_TICKS};
use movement::Block;

/// Whether one fighter sees another's chest, nothing between.
#[must_use]
pub fn sees(blocks: &[Block], from: &Fighter, to: &Fighter) -> bool {
    clear_line(blocks, from.chest(), to.chest())
}

/// How a foe ranks for a lock looking along `yaw` (lower is better), or none if it cannot be taken: alive, on
/// another side, within range, in sight and within the lock's arc of the look. Nearness to the look and nearness by
/// distance count by equal shares.
fn score(me: &Fighter, yaw: f64, other: &Fighter, blocks: &[Block]) -> Option<f64> {
    let (at, there) = ([me.body.x, me.body.y], [other.body.x, other.body.y]);
    let (distance, turn) = (apart(at, there), off(yaw, bearing(at, there)));
    let takes = other.side != me.side && !other.dead() && distance <= LOCK_RANGE && turn <= LOCK_ARC;
    (takes && sees(blocks, me, other)).then_some(turn / LOCK_ARC + distance / LOCK_RANGE)
}

/// The foe a fighter looking along `yaw` would take: the best ranked, ties to the lower number.
#[must_use]
pub fn choose(
    me_id: FighterId,
    me: &Fighter,
    yaw: f64,
    fighters: &[(FighterId, Fighter)],
    blocks: &[Block],
) -> Option<FighterId> {
    fighters
        .iter()
        .filter(|(id, _)| *id != me_id)
        .filter_map(|(id, other)| score(me, yaw, other, blocks).map(|score| (score, *id)))
        .min_by(|first, second| first.0.total_cmp(&second.0).then(first.1.cmp(&second.1)))
        .map(|(_, id)| id)
}

/// The lock carried a tick: kept while its foe lives, stays within range and in sight, and the look keeps it within
/// the arc a lock is taken in; let go otherwise.
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
    if lock_unseen > LOCK_UNSEEN_TICKS || off(yaw, bearing(at, there)) > LOCK_ARC {
        return let_go(me);
    }
    Fighter { lock_unseen, ..*me }
}

/// The lock let go.
#[must_use]
pub fn let_go(me: &Fighter) -> Fighter {
    Fighter { target: None, lock_unseen: 0, ..*me }
}

/// The lock as a swing or a guard begins: it takes the foe it would choose now, but keeps the one it holds while that
/// one is still to be taken and no worse than LOCK_KEEP behind the best, so it does not flick between neighbours.
/// Nothing to choose, it keeps what it holds.
#[must_use]
pub fn take(me_id: FighterId, me: &Fighter, yaw: f64, fighters: &[(FighterId, Fighter)], blocks: &[Block]) -> Fighter {
    let Some(best) = choose(me_id, me, yaw, fighters, blocks) else { return *me };
    let rank = |id: FighterId| {
        fighters.iter().find(|(each, _)| *each == id).and_then(|(_, other)| score(me, yaw, other, blocks))
    };
    let kept = me.target.and_then(|held| rank(held).map(|held_rank| (held, held_rank)));
    let target = match (kept, rank(best)) {
        (Some((held, held_rank)), Some(best_rank)) if held_rank <= best_rank + LOCK_KEEP => held,
        _ => best,
    };
    if me.target == Some(target) {
        return *me;
    }
    Fighter { target: Some(target), lock_unseen: 0, ..*me }
}
