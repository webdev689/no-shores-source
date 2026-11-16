//! One tick of a fighter by its own hand: its stamina and poise resting, what it is doing carried on or ended, a new
//! swing, guard, dodge, shot or telegraphed blow begun, its body moved by the movement rules as that allows, and its
//! aim turned. What it does to others is the host's: a blow that lands now is said, and the host judges it.

use crate::arms::{Ranged, swing_ticks, weapon};
use crate::fighter::{Action, Attack, CombatInput, Fighter, Held, Intent, Kept, Side, Swing};
use crate::shapes::Telegraph;
use crate::shots::{DRAW_FULL, DRAW_LEAST, DRAW_POWER_LEAST, Shot, loose, shot_numbers};
use crate::sight::{bearing, off, turned, wrap};
use crate::tuning::{
    AIM_TURN, ATTACK_PACE, DODGE_ATTACK, DODGE_LIFT, DODGE_SPEED, DODGE_STAMINA, DODGE_TICKS, FLINCH, FLINCH_DODGE,
    GUARD_PACE, GUARD_TURN, LOCK_ARC, PARRY_PLAYS, PARRY_RUSHED, PARRY_WINDOW, POISE_REST, PRESS_KEPT, STAMINA,
    STAMINA_GUARDING, STAMINA_PER_TICK, STAMINA_REST, STEER_REACH,
};
use core::f64::consts::FRAC_PI_2;
use movement::blocks::{ground_at, slide};
use movement::{Block, Body, Controls, Mode, TICK_SECONDS, step_body};

/// A falling hop this near the ground has come down: its last tick, whatever the sums' last bits.
const LANDED: f64 = 1e-6;

/// What a fighter's tick reads beyond itself: the course, and where its soft lock's target's chest stands as this
/// fighter's own view has it.
#[derive(Clone, Copy, Debug)]
pub struct Surroundings<'a> {
    pub blocks: &'a [Block],
    pub target_at: Option<[f64; 3]>,
}

/// What a fighter's tick set off, for the host to answer: a swing begun, its blow landing, a telegraphed blow landing
/// or cut short as a feint, a shot leaving (its owner for the host to fill), a dodge begun, a guard raised.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Happening {
    Swung(Attack),
    Struck(Attack),
    Landed(Telegraph),
    Feinted(Telegraph),
    Loosed(Shot),
    Dodged,
    Guarded { window: bool },
}

/// One tick of a fighter under its player's or brain's intent.
#[must_use]
pub fn step_fighter(fighter: &Fighter, intent: &Intent, around: &Surroundings<'_>) -> (Fighter, Option<Happening>) {
    let intent = &clean(intent, fighter.aim);
    let input = &intent.combat;
    let now = Held { attack: input.attack.is_some(), guard: input.guard, dodge: input.dodge, shoot: input.shoot };
    let mut next = Fighter { held: now, kept: kept(fighter, input, now), ..*fighter };
    if let Action::Dead { elapsed } = fighter.action {
        next.action = Action::Dead { elapsed: elapsed.saturating_add(1) };
        next.body = step_body(&fighter.body, &still(intent.controls), around.blocks, TICK_SECONDS);
        return (next, None);
    }
    rest(&mut next);
    let happening = act(&mut next, intent, around);
    move_body(&mut next, intent.controls, around.blocks);
    aim(&mut next, intent.controls.yaw, around);
    (next, happening)
}

/// An intent whose every number is one: a look that is none keeps the aim, a turned one is wrapped; the pushes are
/// -1 to 1 and the pitch within a quarter turn. A browser's numbers cannot be trusted to be numbers.
#[must_use]
pub fn clean(intent: &Intent, aim: f64) -> Intent {
    let unit = |value: f64| if value.is_finite() { value.clamp(-1.0, 1.0) } else { 0.0 };
    let controls = intent.controls;
    let yaw = if controls.yaw.is_finite() { wrap(controls.yaw) } else { aim };
    let pitch = intent.combat.pitch;
    let pitch = if pitch.is_finite() { pitch.clamp(-FRAC_PI_2, FRAC_PI_2) } else { 0.0 };
    Intent {
        controls: Controls { yaw, forward: unit(controls.forward), sideways: unit(controls.sideways), ..controls },
        combat: CombatInput { pitch, ..intent.combat },
    }
}

/// The presses kept a tick on, and any new one: a press is kept PRESS_KEPT ticks or until it is acted on.
fn kept(fighter: &Fighter, input: &CombatInput, now: Held) -> Kept {
    let age = |left: u8| left.saturating_sub(1);
    let was = fighter.kept;
    let mut kept = Kept { attack: age(was.attack), stroke: was.stroke, guard: age(was.guard), dodge: age(was.dodge) };
    if now.attack && !fighter.held.attack {
        kept.attack = PRESS_KEPT;
        kept.stroke = input.attack;
    }
    if now.guard && !fighter.held.guard {
        kept.guard = PRESS_KEPT;
    }
    if now.dodge && !fighter.held.dodge {
        kept.dodge = PRESS_KEPT;
    }
    if kept.attack == 0 {
        kept.stroke = None;
    }
    kept
}

/// Stamina comes back once it has rested, slower behind a guard; poise drains once nothing has filled it for a
/// while; the windows a fight opened run down.
fn rest(next: &mut Fighter) {
    if next.stamina_rest >= STAMINA_REST {
        let share = if matches!(next.action, Action::Guard { .. }) { STAMINA_GUARDING } else { 1.0 };
        next.stamina = (next.stamina + STAMINA_PER_TICK * share).min(STAMINA);
    }
    next.stamina_rest = next.stamina_rest.saturating_add(1);
    if next.poise_rest >= POISE_REST {
        next.poise = (next.poise - next.poise_max / 4.0 * TICK_SECONDS).max(0.0);
    }
    next.poise_rest = next.poise_rest.saturating_add(1);
    next.poise_immune = next.poise_immune.saturating_sub(1);
    next.counter = next.counter.saturating_sub(1);
    next.punished = next.punished.saturating_sub(1);
    next.riposte = next.riposte.and_then(|(foe, left)| (left > 1).then_some((foe, left - 1)));
    if next.missed_parry > 0 {
        next.missed_parry = if next.missed_parry >= PARRY_RUSHED { 0 } else { next.missed_parry + 1 };
    }
}

fn spend(next: &mut Fighter, stamina: f64) {
    next.stamina = (next.stamina - stamina).max(0.0);
    next.stamina_rest = 0;
}

/// What the fighter is doing, carried on a tick or ended, and anything new it begins.
fn act(next: &mut Fighter, intent: &Intent, around: &Surroundings<'_>) -> Option<Happening> {
    let input = &intent.combat;
    let countdown = |left: u32| left.saturating_sub(1);
    let dodges = |next: &Fighter| next.kept.dodge > 0 && can_dodge(next, intent.controls, around.blocks);
    match next.action {
        Action::Idle => begin(next, intent, around),
        Action::Attack(attack) => {
            let elapsed = attack.elapsed + 1;
            // The blow's own tick is never cut short: a dodge pressed on it is kept for the next.
            if elapsed != attack.strike && dodges(next) {
                return Some(dodge(next, intent.controls, around));
            }
            // Once the blow has landed, the guard cuts the follow-through short, as the dodge does.
            if elapsed > attack.strike && (input.guard || next.kept.guard > 0) {
                return Some(raise_guard(next));
            }
            if elapsed >= attack.end {
                next.action = Action::Idle;
                // A press kept, or the button held, swings again as the last blow ends.
                return begin(next, intent, around);
            }
            let attack = Attack { elapsed, ..attack };
            next.action = Action::Attack(attack);
            (elapsed == attack.strike).then_some(Happening::Struck(attack))
        }
        Action::Guard { elapsed, window } => {
            if dodges(next) {
                return Some(dodge(next, intent.controls, around));
            }
            if next.kept.attack > 0 {
                if elapsed < window {
                    next.missed_parry = 1;
                }
                next.action = Action::Idle;
                return swing(next, intent);
            }
            // A guard let go while its parry window is open stays up until the window closes: a tap parries.
            if !input.guard && elapsed >= window {
                next.action = Action::Idle;
                return None;
            }
            let elapsed = elapsed + 1;
            if elapsed == window {
                next.missed_parry = 1;
            }
            next.action = Action::Guard { elapsed, window };
            None
        }
        Action::Parry { elapsed } => {
            if dodges(next) {
                return Some(dodge(next, intent.controls, around));
            }
            // The riposte: a swing held or pressed through the deflect strikes at once.
            if input.attack.is_some() || next.kept.attack > 0 {
                next.action = Action::Idle;
                return swing(next, intent);
            }
            let elapsed = elapsed + 1;
            if elapsed < PARRY_PLAYS {
                next.action = Action::Parry { elapsed };
                return None;
            }
            next.action = Action::Idle;
            begin(next, intent, around)
        }
        Action::Dodge { elapsed, toward } => {
            let elapsed = elapsed + 1;
            let wants = input.attack.is_some() || input.guard || next.kept != Kept::default();
            let free = elapsed >= DODGE_TICKS || (elapsed >= DODGE_ATTACK && wants);
            if free && landed(&next.body, around.blocks) {
                next.action = Action::Idle;
                return begin(next, intent, around);
            }
            next.action = Action::Dodge { elapsed: elapsed.min(DODGE_TICKS), toward };
            None
        }
        Action::Flinch { left } => {
            if FLINCH.saturating_sub(left) >= FLINCH_DODGE && dodges(next) {
                return Some(dodge(next, intent.controls, around));
            }
            next.action = if left > 1 { Action::Flinch { left: countdown(left) } } else { Action::Idle };
            None
        }
        Action::Staggered { left, cause } => {
            next.action = if left > 1 { Action::Staggered { left: countdown(left), cause } } else { Action::Idle };
            None
        }
        Action::Down { left } => {
            next.action = if left > 1 { Action::Down { left: countdown(left) } } else { Action::Idle };
            None
        }
        Action::Overreach { left } => {
            next.action = if left > 1 { Action::Overreach { left: countdown(left) } } else { Action::Idle };
            None
        }
        Action::Reload { left } => {
            next.action = if left > 1 { Action::Reload { left: countdown(left) } } else { Action::Idle };
            None
        }
        Action::Telegraph(telegraph) => wind_up(next, telegraph, around),
        Action::Draw { elapsed } => {
            if dodges(next) {
                return Some(dodge(next, intent.controls, around));
            }
            draw(next, elapsed, intent)
        }
        Action::Dead { .. } => None,
    }
}

/// Whether a dodge's hop has come down: out of the air, or touching down.
fn landed(body: &Body, blocks: &[Block]) -> bool {
    body.mode != Mode::Air || touching_down(body, blocks)
}

/// In the air, falling, and within a hair of the ground: a hop's last tick, whatever the sums' last bits.
fn touching_down(body: &Body, blocks: &[Block]) -> bool {
    body.mode == Mode::Air && body.vz <= 0.0 && body.z - ground_at(blocks, body.x, body.y, body.z) <= LANDED
}

/// From rest, in this order: a dodge pressed, a foe's telegraphed blow, a swing pressed, a guard pressed or held, a
/// shot, and a swing while the button is held. The newest press wins over a button only held.
fn begin(next: &mut Fighter, intent: &Intent, around: &Surroundings<'_>) -> Option<Happening> {
    let input = &intent.combat;
    if next.kept.dodge > 0 && can_dodge(next, intent.controls, around.blocks) {
        return Some(dodge(next, intent.controls, around));
    }
    if let Some(order) = input.telegraph.filter(|_| next.side == Side::Foes) {
        let body = next.body;
        next.action = Action::Telegraph(Telegraph::begin(&order, [body.x, body.y, body.z]));
        next.aim = order.bearing;
        return None;
    }
    if next.kept.attack > 0 {
        return swing(next, intent);
    }
    if input.guard || next.kept.guard > 0 {
        return Some(raise_guard(next));
    }
    // The shot's button shoots; the swing's swings the melee hand, a bow's holder's fists.
    if let Some(ranged) = next.arms.ranged.filter(|_| input.shoot) {
        if ranged == Ranged::Bow {
            next.action = Action::Draw { elapsed: 0 };
            return None;
        }
        let shot = loose(0, ranged, next.chest(), intent.controls.yaw, input.pitch, 1.0);
        next.action = Action::Reload { left: shot_numbers(ranged).3 };
        next.aim = intent.controls.yaw;
        return Some(Happening::Loosed(shot));
    }
    swing(next, intent)
}

/// The guard raised: a press opens a parry window, unless it comes hard on the heels of one left unused.
fn raise_guard(next: &mut Fighter) -> Happening {
    let window = if next.kept.guard > 0 && next.missed_parry == 0 { PARRY_WINDOW } else { 0 };
    next.kept.guard = 0;
    next.action = Action::Guard { elapsed: 0, window };
    Happening::Guarded { window: window > 0 }
}

/// A swing begun with the stroke held, or the one a kept press was made with: a riposte at the foe it parried, a
/// counter a perfect dodge earned, or a plain one. None without stamina, or riding off the ground.
fn swing(next: &mut Fighter, intent: &Intent) -> Option<Happening> {
    let stroke = intent.combat.attack.or(next.kept.stroke.filter(|_| next.kept.attack > 0))?;
    if next.stamina <= 0.0 || (intent.controls.mounted && next.body.mode != Mode::Ground) {
        return None;
    }
    let (strike, end) = swing_ticks(next.arms.melee);
    let swing = if let Some((foe, _)) = next.riposte.take() {
        Swing::Riposte(foe)
    } else if next.counter > 0 {
        next.counter = 0;
        Swing::Counter
    } else {
        Swing::Plain
    };
    let left_hand = next.arms.off_hand == crate::arms::OffHand::Weapon && next.blows % 2 == 1;
    spend(next, weapon(next.arms.melee).stamina);
    next.blows = next.blows.wrapping_add(1);
    next.kept.attack = 0;
    next.kept.stroke = None;
    let attack = Attack { stroke, elapsed: 0, strike, end, swing, left_hand };
    next.action = Action::Attack(attack);
    Some(Happening::Swung(attack))
}

fn can_dodge(next: &Fighter, controls: Controls, blocks: &[Block]) -> bool {
    let footed = next.body.mode == Mode::Ground || touching_down(&next.body, blocks);
    footed && !controls.mounted && next.stamina > 0.0
}

/// The dodge's hop: the way the controls point (straight back with none), fast and low, facing the lock's target if
/// it has one and else the way it goes.
fn dodge(next: &mut Fighter, controls: Controls, around: &Surroundings<'_>) -> Happening {
    let (sin, cos) = (libm::sin(controls.yaw), libm::cos(controls.yaw));
    let forward = if controls.forward.is_finite() { controls.forward.clamp(-1.0, 1.0) } else { 0.0 };
    let sideways = if controls.sideways.is_finite() { controls.sideways.clamp(-1.0, 1.0) } else { 0.0 };
    let (wish_x, wish_y) = (sin * forward + cos * sideways, -cos * forward + sin * sideways);
    let length = (wish_x * wish_x + wish_y * wish_y).sqrt();
    let toward = if length > 1e-9 { [wish_x / length, wish_y / length] } else { [-sin, cos] };
    let body = next.body;
    let facing =
        around.target_at.map_or_else(|| bearing([0.0, 0.0], toward), |at| bearing([body.x, body.y], [at[0], at[1]]));
    spend(next, DODGE_STAMINA);
    next.body = Body {
        mode: Mode::Air,
        vx: toward[0] * DODGE_SPEED,
        vy: toward[1] * DODGE_SPEED,
        vz: DODGE_LIFT,
        grounded: 0.0,
        crouched: false,
        facing,
        moving: true,
        ..body
    };
    next.aim = facing;
    next.kept.dodge = 0;
    next.action = Action::Dodge { elapsed: 0, toward };
    Happening::Dodged
}

/// A telegraphed blow's wind-up: a tracker turns after its target through the first part; a feint is cut at its tick;
/// at the end it lands.
fn wind_up(next: &mut Fighter, telegraph: Telegraph, around: &Surroundings<'_>) -> Option<Happening> {
    let elapsed = telegraph.elapsed + 1;
    let mut telegraph = Telegraph { elapsed, ..telegraph };
    // A tracker turns through the first part of its wind-up, and never once a charge or a leap has set off.
    let turns_until = (f64::from(telegraph.windup) * crate::shapes::TRACK_SHARE)
        .min(f64::from(telegraph.windup.saturating_sub(telegraph.travel_ticks())));
    let tracking = f64::from(elapsed) < turns_until;
    if let (true, true, Some(at)) = (telegraph.shape.tracks(), tracking, around.target_at) {
        let body = next.body;
        telegraph.bearing =
            turned(telegraph.bearing, bearing([body.x, body.y], [at[0], at[1]]), crate::shapes::TRACK_TURN);
        telegraph.origin = [body.x, body.y, body.z];
        next.aim = telegraph.bearing;
    }
    if telegraph.feint_at.is_some_and(|at| elapsed >= at) {
        next.action = Action::Idle;
        return Some(Happening::Feinted(telegraph));
    }
    if elapsed >= telegraph.windup {
        next.action = Action::Idle;
        return Some(Happening::Landed(telegraph));
    }
    next.action = Action::Telegraph(telegraph);
    None
}

/// A bow drawn while the button is held, loosed when it is let go: too soon and nothing leaves.
fn draw(next: &mut Fighter, elapsed: u32, intent: &Intent) -> Option<Happening> {
    if intent.combat.shoot {
        next.action = Action::Draw { elapsed: (elapsed + 1).min(DRAW_FULL) };
        return None;
    }
    if elapsed < DRAW_LEAST {
        next.action = Action::Idle;
        return None;
    }
    let power = (f64::from(elapsed) / f64::from(DRAW_FULL)).clamp(DRAW_POWER_LEAST, 1.0);
    let shot = loose(0, Ranged::Bow, next.chest(), intent.controls.yaw, intent.combat.pitch, power);
    next.action = Action::Reload { left: shot_numbers(Ranged::Bow).3 };
    Some(Happening::Loosed(shot))
}

/// Controls that hold the body still where it stands, but let it fall.
fn still(controls: Controls) -> Controls {
    Controls { forward: 0.0, sideways: 0.0, run: false, jump: false, crouch: false, ..controls }
}

/// Controls slowed to a share of their pace, with no running, jumping or crouching.
fn slowed(controls: Controls, share: f64) -> Controls {
    Controls { forward: controls.forward * share, sideways: controls.sideways * share, ..still(controls) }
}

/// The body moved as the action allows: freely at rest, slowly swinging or guarding, not at all when struck, and a
/// charge or a leap carried to its landing at the end of its wind-up.
fn move_body(next: &mut Fighter, controls: Controls, blocks: &[Block]) {
    let allowed = match next.action {
        Action::Idle | Action::Reload { .. } => controls,
        Action::Attack(_) => slowed(controls, ATTACK_PACE),
        Action::Guard { .. } | Action::Parry { .. } => slowed(controls, GUARD_PACE),
        Action::Draw { .. } => slowed(controls, 0.5),
        Action::Telegraph(telegraph) => {
            if let Some(body) = travel(&next.body, &telegraph, blocks) {
                next.body = body;
                return;
            }
            still(controls)
        }
        _ => still(controls),
    };
    let body = step_body(&next.body, &allowed, blocks, TICK_SECONDS);
    let fighting = matches!(
        next.action,
        Action::Attack(_) | Action::Guard { .. } | Action::Parry { .. } | Action::Draw { .. } | Action::Telegraph(_)
    );
    next.body = if fighting && body.mode == Mode::Ground { Body { facing: next.aim, ..body } } else { body };
}

/// A charge crosses its lane and a leap flies to its disc in the last ticks of the wind-up.
fn travel(body: &Body, telegraph: &Telegraph, blocks: &[Block]) -> Option<Body> {
    let landing = telegraph.landing()?;
    let travel = telegraph.travel_ticks();
    let begun = telegraph.windup.saturating_sub(travel);
    if telegraph.elapsed < begun || travel == 0 {
        return None;
    }
    let left = f64::from(telegraph.windup.saturating_sub(telegraph.elapsed).max(1));
    let (step_x, step_y) = ((landing[0] - body.x) / left, (landing[1] - body.y) / left);
    let (x, y) = slide(blocks, body, step_x, step_y);
    let ground = ground_at(blocks, x, y, body.z);
    let share = f64::from(telegraph.elapsed - begun + 1) / f64::from(travel);
    let rise = if telegraph.shape == crate::shapes::Shape::Leap { 4.8 * share * (1.0 - share) } else { 0.0 };
    let facing = telegraph.bearing;
    Some(Body { x, y, z: ground + rise, vx: 0.0, vy: 0.0, vz: 0.0, facing, moving: true, ..*body })
}

/// The arms point where the fighter looks, but a swing's wind-up turns after the soft lock's target in reach and a
/// guard turns to face it; a blow, once it lands, is locked where it was.
fn aim(next: &mut Fighter, yaw: f64, around: &Surroundings<'_>) {
    let body = next.body;
    // The lock steers a swing or a guard only at a target the look is toward: turned to face another, the guard
    // follows the look.
    let target = around
        .target_at
        .map(|at| (bearing([body.x, body.y], [at[0], at[1]]), at))
        .filter(|(toward, _)| off(yaw, *toward) <= LOCK_ARC);
    let in_reach = |reach: f64| {
        target.and_then(|(toward, at)| {
            let (along_x, along_y) = (at[0] - body.x, at[1] - body.y);
            ((along_x * along_x + along_y * along_y).sqrt() <= reach).then_some(toward)
        })
    };
    next.aim = match next.action {
        Action::Attack(attack) if attack.elapsed < attack.strike => {
            let reach = weapon(next.arms.melee).reach + STEER_REACH;
            turned(next.aim, in_reach(reach).unwrap_or(yaw), AIM_TURN)
        }
        Action::Guard { .. } | Action::Parry { .. } => {
            turned(next.aim, target.map_or(yaw, |(toward, _)| toward), GUARD_TURN)
        }
        Action::Idle | Action::Flinch { .. } | Action::Reload { .. } | Action::Draw { .. } => yaw,
        _ => next.aim,
    };
}
