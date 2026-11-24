//! The pace of a fight in numbers. Foes at one target land their blows one at a time: a foe begins a blow there only
//! if it lands a beat after the latest another foe has begun there, so a player meets one blow, reads it and answers
//! before the next, however many stand round them. Each foe's own blows keep their own rhythm, so one foe alone
//! fights at its own pace. project-final's strike token, one blow in flight at a time, kept by when each lands.

use crate::board::Board;
use crate::brain::Brain;
use crate::senses::Here;
use crate::shoot::aimed_shot;
use combat::fighter::Action;
use combat::shapes::{IRON_EXTRA, Shape};
use combat::shots::{Shot, by_foe, loose, toward};
use combat::sight::{apart, bearing};
use combat::tuning::BODY_RADIUS;
use combat::{FighterId, Intent};
use movement::TICK_SECONDS;

/// The tick a swing begun now lands.
#[must_use]
pub fn swing_lands(here: &Here<'_, '_>) -> u64 {
    here.tick() + u64::from(here.fighter.swing_ticks().0)
}

/// The tick a shot loosed now at a body standing at `target` lands, after its flight.
#[must_use]
pub fn shot_lands(here: &Here<'_, '_>, target: [f64; 3]) -> u64 {
    let Some(ranged) = here.fighter.arms.ranged else { return here.tick() };
    let pitch = toward(ranged, here.feet(), target).1;
    let way = bearing(here.at(), [target[0], target[1]]);
    here.tick() + flight(&by_foe(&loose(here.me, ranged, here.fighter.chest(), way, pitch, 1.0)), target)
}

/// The ticks after the one it leaves in that a shot reaches the edge of a body standing at `target`: it leaves ahead
/// of its shooter's chest, and takes its first step in the tick it is loosed.
fn flight(shot: &Shot, target: [f64; 3]) -> u64 {
    let step = libm::hypot(shot.velocity[0], shot.velocity[1]) * TICK_SECONDS;
    let edge = apart([shot.at[0], shot.at[1]], [target[0], target[1]]) - BODY_RADIUS;
    if step <= 0.0 || edge <= 0.0 {
        return 0;
    }
    (libm::ceil(edge / step) as u64).saturating_sub(1)
}

/// Whether, ready to, it may begin a blow at `target` that lands at `lands`: a beat, as the room's heat presses it,
/// after the latest another foe has begun there, and in its place among the foes that beat holds back. Asked only
/// once it would strike, so a foe not ready holds no place.
pub fn may(here: &Here<'_, '_>, board: &mut Board, target: FighterId, lands: u64) -> bool {
    let beat = Here::ticks(here.world.director.pressed().beat);
    board.may_strike(target, here.me, lands, beat, here.tick(), true)
}

/// Whether, drawn, it may loose a shot or begin an aimed one at `target` that lands at `lands`: as a blow may, but
/// only into a beat no ally waits for to strike hand to hand, so its shots fill the gaps between their blows.
pub fn may_shoot(here: &Here<'_, '_>, board: &mut Board, target: FighterId, lands: u64) -> bool {
    let beat = Here::ticks(here.world.director.pressed().beat);
    board.may_strike(target, here.me, lands, beat, here.tick(), false)
}

/// Notes on the board the blow its intent begins this tick at its target, if it begins one: a swing from rest, a
/// telegraphed blow, or a shot loosed.
pub fn note(brain: &Brain, here: &Here<'_, '_>, board: &mut Board, intent: &Intent) {
    let Some(target) = brain.target else { return };
    let combat = &intent.combat;
    let free = matches!(here.fighter.action, Action::Idle | Action::Guard { .. } | Action::Parry { .. });
    let lands = if let Some(order) = combat.telegraph {
        let iron = if order.iron { combat::ticks(IRON_EXTRA) } else { 0 };
        let ended = here.tick() + u64::from(order.windup.max(1) + iron);
        // An aimed shot leaves as its wind-up ends, and flies.
        let at = here.find(target).map(|other| [other.body.x, other.body.y, other.body.z]);
        let shot =
            (order.shape == Shape::Aimed).then(|| aimed_shot(here.me, &here.fighter, order.bearing, order.ahead));
        ended + shot.zip(at).map_or(0, |(shot, at)| flight(&shot, at))
    } else if combat.attack.is_some() && free && here.fighter.stamina > 0.0 {
        swing_lands(here)
    } else if combat.shoot && matches!(here.fighter.action, Action::Draw { .. }) {
        let Some(at) = here.find(target).map(|other| [other.body.x, other.body.y, other.body.z]) else { return };
        shot_lands(here, at)
    } else {
        return;
    };
    board.struck(target, here.me, lands, Here::ticks(here.world.director.pressed().breath));
}
