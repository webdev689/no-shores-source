//! A shooter's fight, as DFO's tactics have it: a ranged token gates its shot and a shot spends it; without one it
//! stands off and holds its fire, never circling; a target closing inside its bow's near edge it walks away from, one
//! burst, and caught or cornered it fights close until it may kite again. It draws by aiming its bow and looses by
//! pulling the trigger once drawn, aiming high enough for the arrow's fall.

use crate::board::Board;
use crate::brain::Brain;
use crate::dice::Purpose;
use crate::senses::{Here, Sight};
use crate::steer::Ask;
use crate::tell::aimed;
use crate::tuning::{
    KITE_COOLDOWN, KITE_CORNERED, KITE_IN, KITE_MAX, KITE_OUT, PATIENCE, RANGED_LEASE, SHOT_GAP, STEP_PACE, SWING_FACE,
};
use combat::Ranged;
use combat::fighter::Action;
use combat::lock::sees;
use combat::shots::{DRAW_FULL, toward};
use combat::sight::{apart, off};
use core::f64::consts::PI;

/// What a shooter keeps: whether it is kiting and until when, when it may kite again, until when it fights close,
/// when it may shoot again, and whether it asked to walk last tick and from where (a kite that goes nowhere is
/// cornered).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Bow {
    pub kiting: bool,
    pub kite_until: u64,
    pub kite_ready: u64,
    pub close_until: u64,
    pub shot_ready: u64,
    pub walked: bool,
    pub from: [f64; 2],
}

/// The pitch that carries its shot from its chest to its target's, as a player's quick shot is laid: an arrow high
/// enough for its fall, a ball straight.
fn pitch(here: &Here<'_, '_>, sight: &Sight) -> f64 {
    toward(here.fighter.arms.ranged.unwrap_or(Ranged::Bow), here.feet(), sight.spot).1
}

/// Holding its aim until it has drawn `drawn` ticks, then pulling the trigger; and, from rest, raising its bow when
/// `may` allows. Answers the ask and whether it let a shot go this tick.
pub fn draw(brain: &mut Brain, here: &Here<'_, '_>, sight: &Sight, drawn: u32, may: bool) -> (Ask, bool) {
    let mut ask = Ask::facing(sight.toward);
    ask.combat.pitch = pitch(here, sight);
    let facing = off(brain.heading, sight.toward) <= SWING_FACE / 4.0;
    match here.fighter.action {
        Action::Draw { elapsed } => {
            ask.combat.aim = true;
            ask.combat.shoot = elapsed >= drawn;
            if ask.combat.shoot {
                brain.bow.shot_ready = here.tick() + Here::ticks(here.dice.between(Purpose::ShotGap, SHOT_GAP));
                return (ask, true);
            }
        }
        Action::Idle => ask.combat.aim = may && facing && here.tick() >= brain.bow.shot_ready,
        _ => {}
    }
    (ask, false)
}

/// Whether it fights by shooting now (else close, hand to hand, until it may kite again).
#[must_use]
pub fn shooting(brain: &Brain, here: &Here<'_, '_>, sight: &Sight) -> bool {
    let bow = &brain.bow;
    let tick = here.tick();
    here.numbers.shooter
        && tick >= bow.close_until
        && (sight.distance >= KITE_IN || bow.kiting || tick >= bow.kite_ready)
}

/// A shooter's tick at a target it fights by shooting.
pub fn ranged(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board, sight: &Sight) -> Ask {
    let tick = here.tick();
    let (me, target) = (here.me, sight.id);
    board.join(target, me, true, tick);
    if board.held_since(target, me).is_some_and(|since| tick > since + Here::ticks(RANGED_LEASE)) {
        board.hand_on(target, me, tick);
    }
    let has = board.take(target, me, true, tick, Here::ticks(PATIENCE));
    let walked = std::mem::take(&mut brain.bow.walked);
    let close = if brain.bow.kiting { sight.distance < KITE_OUT } else { sight.distance < KITE_IN };
    if close && !matches!(here.fighter.action, Action::Draw { .. }) {
        if !brain.bow.kiting {
            brain.bow.kiting = true;
            brain.bow.kite_until = tick + Here::ticks(KITE_MAX);
        }
        let cornered = walked && apart(brain.bow.from, here.at()) < 0.01;
        if cornered || tick >= brain.bow.kite_until {
            brain.bow.kiting = false;
            brain.bow.close_until = tick + Here::ticks(KITE_CORNERED);
            brain.bow.kite_ready = tick + Here::ticks(KITE_COOLDOWN);
            board.hand_on(target, me, tick);
            return Ask::facing(sight.toward);
        }
        let away = sight.toward + PI;
        brain.bow.walked = off(brain.heading, away) <= crate::tuning::WALK_FACE;
        brain.bow.from = here.at();
        return Ask::walking(away, STEP_PACE, false);
    }
    if brain.bow.kiting {
        brain.bow.kiting = false;
        brain.bow.kite_ready = tick + Here::ticks(KITE_COOLDOWN);
    }
    let clear = sight.seen && sees(here.world.blocks, &here.fighter, &sight.fighter);
    let ready = matches!(here.fighter.action, Action::Idle) && tick >= brain.bow.shot_ready;
    let facing = off(brain.heading, sight.toward) <= SWING_FACE / 4.0;
    if has
        && clear
        && ready
        && facing
        && let Some(order) = aimed(brain, here, sight)
    {
        board.hand_on(target, me, tick);
        let mut ask = Ask::facing(sight.toward);
        ask.combat.telegraph = Some(order);
        return ask;
    }
    let (ask, loosed) = draw(brain, here, sight, DRAW_FULL, has && clear);
    if loosed {
        board.hand_on(target, me, tick);
    }
    ask
}
