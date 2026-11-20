//! A shooter's fight, as DFO's tactics have it: a ranged token gates its shot and a shot spends it; a target closing
//! inside its weapon's near edge it walks away from, one burst out to its ring, then shoots; caught or cornered it
//! fights close until it may kite again. With cover near, it fights from a post (the cover module); without, it
//! stands off and holds its fire without a token, never circling. It draws by aiming its own weapon (a bow, a crossbow
//! or a gun, each its own draw) and looses by pulling the trigger once drawn, aiming high enough for an arrow's or a
//! bolt's fall.

use crate::board::Board;
use crate::brain::Brain;
use crate::cover::{Post, hold};
use crate::dice::Purpose;
use crate::pace;
use crate::senses::{Here, Sight};
use crate::steer::Ask;
use crate::tell::{aim_ready, aimed};
use crate::tuning::{
    AIMED_SHARE, AIMED_SPEED, DRAW_BOW, DRAW_CROSSBOW, DRAW_PISTOLET, DRAW_THUNDERLOCK, KITE_CAUGHT, KITE_COOLDOWN,
    KITE_CORNERED, KITE_IN, KITE_MAX, KITE_OUT, RANGED_LEASE, SHOT_GAP, SWING_FACE, WINDUP_LEAST,
};
use combat::fighter::Action;
use combat::lock::sees;
use combat::shots::{FALL, Shot, by_foe, foe_speed, loose, shot_numbers, toward};
use combat::sight::{apart, off};
use combat::{Fighter, FighterId, Ranged};
use core::f64::consts::PI;

/// What a shooter keeps: whether it is kiting and until when, when it may kite again, until when it fights close,
/// when it may shoot again, whether it asked to walk last tick and from where (a kite that goes nowhere is
/// cornered), and the tick it last raised its weapon from rest, which its draw is counted from. And its post, whether
/// it looks out from it or hides, and until when, and when it may seek a post again after finding none. And whether
/// it is closing on a target it saw past its range.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Bow {
    pub kiting: bool,
    pub kite_until: u64,
    pub kite_ready: u64,
    pub close_until: u64,
    pub shot_ready: u64,
    pub walked: bool,
    pub from: [f64; 2],
    pub raised: u64,
    pub post: Option<Post>,
    pub peeking: bool,
    pub turn_at: u64,
    pub seek_at: u64,
    pub closing: bool,
}

/// An aimed shot as it leaves a foe's own weapon along `bearing`, its line `ahead` long: faster than a plain one, an
/// arrow or a bolt aimed up for its fall over the line, a ball straight.
#[must_use]
pub fn aimed_shot(id: FighterId, foe: &Fighter, bearing: f64, ahead: f64) -> Shot {
    let ranged = foe.arms.ranged.unwrap_or(Ranged::Bow);
    let falls = shot_numbers(ranged).0 > 0.0;
    let flight = ahead / (foe_speed(ranged) * AIMED_SPEED);
    let rise = if falls { 0.5 * FALL * flight * flight } else { 0.0 };
    let pitch = libm::atan2(rise, ahead.max(0.1));
    let mut shot = by_foe(&loose(id, ranged, foe.chest(), bearing, pitch, 1.0));
    shot.velocity = shot.velocity.map(|speed| speed * AIMED_SPEED);
    shot
}

/// The ticks a shooter draws its weapon before it looses.
#[must_use]
pub fn draw_ticks(ranged: Ranged) -> u64 {
    Here::ticks(match ranged {
        Ranged::Bow => DRAW_BOW,
        Ranged::Crossbow => DRAW_CROSSBOW,
        Ranged::Pistolet | Ranged::DoublePistolet => DRAW_PISTOLET,
        Ranged::Thunderlock => DRAW_THUNDERLOCK,
    })
}

/// The pitch that carries its shot from its chest to its target's, as a player's quick shot is laid: an arrow high
/// enough for its fall, a ball straight.
fn pitch(here: &Here<'_, '_>, sight: &Sight) -> f64 {
    toward(here.fighter.arms.ranged.unwrap_or(Ranged::Bow), here.feet(), sight.spot).1
}

/// Holding its aim until it has drawn `drawn` ticks, then pulling the trigger once `loose` allows; and, from rest,
/// raising its weapon when `may` allows. Its turn gone on (`held` false), the shot the turn gated goes with it: it
/// lowers its weapon. Answers the ask and whether it let a shot go this tick.
fn draw(
    brain: &mut Brain,
    here: &Here<'_, '_>,
    sight: &Sight,
    drawn: u64,
    (held, may): (bool, bool),
    loose: impl FnOnce() -> bool,
) -> (Ask, bool) {
    let mut ask = Ask::facing(sight.toward);
    ask.combat.pitch = pitch(here, sight);
    let facing = off(brain.heading, sight.toward) <= SWING_FACE / 4.0;
    match here.fighter.action {
        Action::Draw { .. } => {
            // Counted from its raising, not the draw's own count, which a bow's full charge caps.
            ask.combat.aim = held;
            ask.combat.shoot = held && here.tick() > brain.bow.raised + drawn && loose();
            if ask.combat.shoot {
                brain.bow.shot_ready = here.tick() + Here::ticks(here.dice.between(Purpose::ShotGap, SHOT_GAP));
                return (ask, true);
            }
        }
        Action::Idle => {
            ask.combat.aim = may && facing && here.tick() >= brain.bow.shot_ready;
            if ask.combat.aim {
                brain.bow.raised = here.tick();
            }
        }
        _ => {}
    }
    (ask, false)
}

/// Whether it fights by shooting now: not while caught, and with its target inside KITE_CAUGHT only while it may
/// kite (else close, hand to hand, until it may kite again).
#[must_use]
pub fn shooting(brain: &Brain, here: &Here<'_, '_>, sight: &Sight) -> bool {
    let bow = &brain.bow;
    let tick = here.tick();
    here.numbers.shooter
        && tick >= bow.close_until
        && (sight.distance >= KITE_CAUGHT || bow.kiting || tick >= bow.kite_ready)
}

/// Its ranged turn at `target`, waited for or taken; held unused past its lease, it goes on. Whether it holds one.
pub fn turn(here: &Here<'_, '_>, board: &mut Board, target: FighterId) -> bool {
    let (tick, me) = (here.tick(), here.me);
    board.join(target, me, true, tick);
    if board.held_since(target, me).is_some_and(|since| tick > since + Here::ticks(RANGED_LEASE)) {
        board.hand_on(target, me, tick);
    }
    let director = here.world.director;
    board.take(target, me, true, tick, Here::ticks(director.pressed().patience), director.caps())
}

/// A shooter's tick at a target it fights by shooting.
pub fn ranged(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board, sight: &Sight) -> Ask {
    let tick = here.tick();
    let (me, target) = (here.me, sight.id);
    if tick < brain.broken_until {
        // Broken, it holds its fire and falls back to its cover; in the open it steps back from its target, facing it.
        board.forget(me);
        return hold(brain, here, board, sight, false)
            .unwrap_or_else(|| Ask::stepping(sight.toward + PI, 1.0, sight.toward));
    }
    let has = turn(here, board, target);
    let walked = std::mem::take(&mut brain.bow.walked);
    let (kite_in, kite_out) = (KITE_IN * here.numbers.standoff, KITE_OUT * here.numbers.standoff);
    let close = if brain.bow.kiting { sight.distance < kite_out } else { sight.distance < kite_in };
    let may_kite = brain.bow.kiting || tick >= brain.bow.kite_ready;
    if close && may_kite && !matches!(here.fighter.action, Action::Draw { .. }) {
        if !brain.bow.kiting {
            brain.bow.kiting = true;
            brain.bow.kite_until = tick + Here::ticks(KITE_MAX);
        }
        let cornered = walked && apart(brain.bow.from, here.at()) < 0.01;
        if !cornered && tick < brain.bow.kite_until {
            let away = sight.toward + PI;
            brain.bow.walked = off(brain.heading, away) <= crate::tuning::WALK_FACE;
            brain.bow.from = here.at();
            return Ask::walking(away, 1.0, false);
        }
        brain.bow.kiting = false;
        brain.bow.kite_ready = tick + Here::ticks(KITE_COOLDOWN);
        // Out of time short of its ring but clear of its target, it shoots from there; caught or cornered, it fights.
        if cornered || sight.distance < KITE_CAUGHT {
            brain.bow.close_until = tick + Here::ticks(KITE_CORNERED);
            board.hand_on(target, me, tick);
            return Ask::facing(sight.toward);
        }
    }
    if brain.bow.kiting {
        brain.bow.kiting = false;
        brain.bow.kite_ready = tick + Here::ticks(KITE_COOLDOWN);
    }
    if let Some(ask) = hold(brain, here, board, sight, has) {
        return ask;
    }
    fire(brain, here, board, sight, has, false, false)
}

/// Its shot: now and then an aimed one, from rest with its turn, facing its target with nothing between; else a draw.
/// In the open it raises its weapon only with its turn and nothing between, and looses once drawn; from cover it
/// raises with its turn alone, behind its cover, and looses once drawn with nothing between, unless its turn is an
/// aimed shot (`aim`): then it steps out unraised and aims once on the line.
pub fn fire(
    brain: &mut Brain,
    here: &Here<'_, '_>,
    board: &mut Board,
    sight: &Sight,
    has: bool,
    covered: bool,
    aim: bool,
) -> Ask {
    let tick = here.tick();
    let clear = sight.seen && sees(here.world.blocks, &here.fighter, &sight.fighter);
    let ready = matches!(here.fighter.action, Action::Idle) && tick >= brain.bow.shot_ready;
    let facing = off(brain.heading, sight.toward) <= SWING_FACE / 4.0;
    let roll = if aim { 0.0 } else { here.dice.roll(Purpose::Aimed) };
    if has
        && clear
        && ready
        && facing
        && (aim || !covered)
        && aim_ready(brain, here, sight)
        && roll < AIMED_SHARE
        && pace::may_shoot(here, board, sight.id, tick + Here::ticks(WINDUP_LEAST))
    {
        board.hand_on(sight.id, here.me, tick);
        let mut ask = Ask::facing(sight.toward);
        ask.combat.telegraph = Some(aimed(brain, here, sight));
        return ask;
    }
    let drawn = draw_ticks(here.fighter.arms.ranged.unwrap_or(Ranged::Bow));
    let (may, loose) = if covered { (has && !aim, clear) } else { (has && clear, true) };
    // Drawn, it looses into the beat between its allies' blows at its target, not on top of one.
    let lands = pace::shot_lands(here, sight.spot);
    let loose = || loose && pace::may_shoot(here, board, sight.id, lands);
    let (ask, loosed) = draw(brain, here, sight, drawn, (has, may), loose);
    if loosed {
        board.hand_on(sight.id, here.me, tick);
    }
    ask
}
