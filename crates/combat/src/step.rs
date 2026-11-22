//! One tick of a fighter by its own hand: its stamina and poise resting, its statuses running down (a Charge holding it
//! still), what it is doing carried on or ended, a new swing, guard, dodge, shot or telegraphed blow begun, its body
//! moved by the movement rules as that allows (faster Hasted), and its aim turned. What it does to others is the host's: a blow that lands now is said, and the host judges it.

use crate::arms::{Ranged, swing_ticks, weapon};
use crate::fighter::{Action, Attack, CombatInput, Fighter, Held, Intent, Kept, Swing};
use crate::shapes::Telegraph;
use crate::shots::{BRACE_GAP, DRAW_FULL, Shot, aimed_power, by_foe, loose, shot_numbers, toward};
use crate::sight::{apart, bearing, off, turned, wrap};
use crate::strike::reach_of;
use crate::tuning::{
    AIM_TURN, ATTACK_PACE, BODY_RADIUS, DODGE_ATTACK, DODGE_LIFT, DODGE_SPEED, DODGE_STAMINA, DODGE_TICKS, FLINCH,
    FLINCH_DODGE, GUARD_PACE, GUARD_TURN, LOCK_ARC, PARRY_PLAYS, PARRY_RUSHED, POISE_REST, PRESS_KEPT, STAMINA,
    STAMINA_GUARDING, STAMINA_PER_TICK, STAMINA_REST, STEER_REACH, parry_window,
};
use core::f64::consts::FRAC_PI_2;
use movement::blocks::ground_at;
use movement::{Block, Body, Controls, Mode, Near, TICK_SECONDS, Terrain, step_body, step_body_paced};

/// A falling hop this near the ground has come down: its last tick, whatever the sums' last bits.
const LANDED: f64 = 1e-6;

/// What a fighter's tick reads beyond itself: the course and the ground it stands on (open ground, or a node's window
/// of the land), and where its soft lock's target's chest stands as this fighter's own view has it. The blocks are any
/// the movement rules can ask for the ones near a body: a plain list, or a room's `movement::Blocks` with its grid.
pub struct Surroundings<'a, B: Near + ?Sized = [Block]> {
    pub blocks: &'a B,
    pub terrain: &'a dyn Terrain,
    pub target_at: Option<[f64; 3]>,
}

impl<B: Near + ?Sized> Clone for Surroundings<'_, B> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<B: Near + ?Sized> Copy for Surroundings<'_, B> {}

impl<B: Near + ?Sized> core::fmt::Debug for Surroundings<'_, B> {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        let surroundings = &mut formatter.debug_struct("Surroundings");
        surroundings
            .field("blocks", &self.blocks.all().len())
            .field("target_at", &self.target_at)
            .finish_non_exhaustive()
    }
}

/// What a fighter's tick set off, for the host to answer: a swing begun, its blow landing, a telegraphed blow landing
/// or cut short as a feint, a shot leaving (its owner for the host to fill), a dodge begun, a guard raised, a drink
/// ended with the health it gave back.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Happening {
    Swung(Attack),
    Struck(Attack),
    Landed(Telegraph),
    Feinted(Telegraph),
    Loosed(Shot),
    Dodged,
    Guarded { window: bool },
    Drank(f64),
}

/// One tick of a fighter under its player's or brain's intent.
#[must_use]
pub fn step_fighter<B: Near + ?Sized>(
    fighter: &Fighter,
    intent: &Intent,
    around: &Surroundings<'_, B>,
) -> (Fighter, Option<Happening>) {
    let intent = &clean(intent, fighter.aim);
    let input = &intent.combat;
    let (attack, heal) = (input.attack.is_some(), input.heal);
    let now = Held { attack, guard: input.guard, dodge: input.dodge, shoot: input.shoot, heal };
    // A Charge holds its fighter from the tick's start, so its stagger and its ticks run down together.
    let mut held = *fighter;
    crate::status::held_still(&mut held);
    let statuses = held.statuses.ticked(&held.action);
    let mut next = Fighter { held: now, kept: kept(fighter, input, now), statuses, ..held };
    if let Action::Dead { elapsed } = fighter.action {
        next.action = Action::Dead { elapsed: elapsed.saturating_add(1) };
        // The dead let go of a wall or a lip they held, as a crouch does, and fall.
        let holding = matches!(fighter.body.mode, Mode::Hang | Mode::Climb);
        let controls = Controls { crouch: holding, ..still(intent.controls) };
        next.body = step_body(&fighter.body, &controls, around.blocks, around.terrain, TICK_SECONDS);
        return (next, None);
    }
    rest(&mut next);
    let pulled = input.shoot && !fighter.held.shoot;
    let happening = act(&mut next, intent, around, pulled);
    if matches!(happening, Some(Happening::Struck(_) | Happening::Loosed(_))) {
        next.statuses.unveil();
    }
    next.swap = next.swap.saturating_sub(1);
    move_body(&mut next, intent.controls, around);
    aim(&mut next, intent, around);
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
    let mark = intent.combat.mark.filter(|mark| mark.iter().all(|value| value.is_finite()));
    Intent {
        controls: Controls { yaw, forward: unit(controls.forward), sideways: unit(controls.sideways), ..controls },
        combat: CombatInput { pitch, mark, ..intent.combat },
    }
}

/// The presses kept a tick on, and any new one: a press is kept PRESS_KEPT ticks or until it is acted on. A swap
/// keeps a click, or a trigger pulled in it, for its end while nothing has the fighter reeling (struck, it runs out as
/// any press); a guard or a dodge pressed in a swap is newer than either, and lets it go.
fn kept(fighter: &Fighter, input: &CombatInput, now: Held) -> Kept {
    let age = |left: u8| left.saturating_sub(1);
    let was = fighter.kept;
    let swapping = fighter.swap > 0;
    let reeling = matches!(fighter.action, Action::Flinch { .. }) || fighter.staggered();
    let held_on = |left: u8| if swapping && !reeling { left } else { age(left) };
    let (attack, shoot) = (held_on(was.attack), held_on(was.shoot));
    let (guard, dodge, heal) = (age(was.guard), age(was.dodge), age(was.heal));
    let mut kept = Kept { attack, stroke: was.stroke, guard, dodge, shoot, heal };
    let overtaken = (now.guard && !fighter.held.guard) || (now.dodge && !fighter.held.dodge);
    if swapping && overtaken {
        (kept.attack, kept.shoot) = (0, 0);
    }
    if swapping && now.shoot && !fighter.held.shoot {
        kept.shoot = PRESS_KEPT;
    }
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
    if now.heal && !fighter.held.heal {
        kept.heal = PRESS_KEPT;
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
        let low = if next.health < next.health_max / 2.0 { next.trim.regen_low } else { 1.0 };
        next.stamina = (next.stamina + STAMINA_PER_TICK * share * next.trim.regen * low).min(STAMINA);
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

/// A tick of a fighter its room moves itself, never stepped: its statuses, rest and reeling run on as a stepped one's.
pub fn wear(fighter: &mut Fighter) {
    fighter.statuses = fighter.statuses.ticked(&fighter.action);
    rest(fighter);
    fighter.action = reeled(fighter.action).unwrap_or(fighter.action);
}

/// A flinch, a stagger, a fall, an overreach or a reload a tick on, run out to Idle; None for any other action.
fn reeled(action: Action) -> Option<Action> {
    let on = |left: u32, then: Action| if left > 1 { then } else { Action::Idle };
    Some(match action {
        Action::Flinch { left } => on(left, Action::Flinch { left: left.saturating_sub(1) }),
        Action::Staggered { left, cause } => on(left, Action::Staggered { left: left.saturating_sub(1), cause }),
        Action::Down { left } => on(left, Action::Down { left: left.saturating_sub(1) }),
        Action::Overreach { left } => on(left, Action::Overreach { left: left.saturating_sub(1) }),
        Action::Reload { left } => on(left, Action::Reload { left: left.saturating_sub(1) }),
        _ => return None,
    })
}

fn spend(next: &mut Fighter, stamina: f64) {
    next.stamina = (next.stamina - stamina).max(0.0);
    next.stamina_rest = 0;
}

/// Whether a fighter can raise a guard: never with a bow, a crossbow or a gun in hand.
fn guards(fighter: &Fighter) -> bool {
    fighter.arms.ranged.is_none()
}

/// What the fighter is doing, carried on a tick or ended, and anything new it begins; `pulled` a fresh pull of the
/// shot's trigger.
fn act<B: Near + ?Sized>(
    next: &mut Fighter,
    intent: &Intent,
    around: &Surroundings<'_, B>,
    pulled: bool,
) -> Option<Happening> {
    let input = &intent.combat;
    if dodge_leaves(&next.action) && next.kept.dodge > 0 && can_dodge(next, intent.controls, around) {
        return Some(dodge(next, intent.controls, around));
    }
    if let Some(on) = reeled(next.action) {
        next.action = on;
        return None;
    }
    match next.action {
        Action::Idle => begin(next, intent, around),
        Action::Attack(attack) => {
            let elapsed = attack.elapsed + 1;
            // Once the blow has landed, the guard cuts the follow-through short, as the dodge does.
            if elapsed > attack.strike && (input.guard || next.kept.guard > 0) && guards(next) {
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
            // A click kept swings out of the guard, but only once a swing can start: until then the guard holds.
            if next.kept.attack > 0 && can_swing(next, intent) {
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
            let wants = input.attack.is_some() || input.guard || Kept { heal: 0, ..next.kept } != Kept::default();
            let free = elapsed >= DODGE_TICKS || (elapsed >= DODGE_ATTACK && wants);
            if free && landed(&next.body, around) {
                next.action = Action::Idle;
                return begin(next, intent, around);
            }
            next.action = Action::Dodge { elapsed: elapsed.min(DODGE_TICKS), toward };
            None
        }
        Action::Telegraph(telegraph) => wind_up(next, telegraph, around),
        Action::Draw { elapsed } => draw(next, elapsed, intent, pulled),
        Action::Drink { elapsed } => crate::drink::drink(next, elapsed, intent.controls),
        // Dead, or reeling (run on above).
        _ => None,
    }
}

/// Whether a dodge may start out of what a fighter is doing as its tick begins: at rest, a swing (never on its blow's
/// own tick: a dodge pressed then is kept for the next), a guard, a parry, a draw, or a flinch from its
/// `FLINCH_DODGE`th tick; never a dodge, a stagger, a fall, an overreach, a reload, a wind-up or a drink.
#[must_use]
pub fn dodge_leaves(action: &Action) -> bool {
    match *action {
        Action::Idle | Action::Guard { .. } | Action::Parry { .. } | Action::Draw { .. } => true,
        Action::Attack(attack) => attack.elapsed + 1 != attack.strike,
        Action::Flinch { left } => FLINCH.saturating_sub(left) >= FLINCH_DODGE,
        _ => false,
    }
}

/// Whether a dodge's hop has come down: out of the air, or touching down.
fn landed<B: Near + ?Sized>(body: &Body, around: &Surroundings<'_, B>) -> bool {
    body.mode != Mode::Air || touching_down(body, around)
}

/// In the air, falling, and within a hair of the ground: a hop's last tick, whatever the sums' last bits.
fn touching_down<B: Near + ?Sized>(body: &Body, around: &Surroundings<'_, B>) -> bool {
    let ground = ground_at(around.blocks, around.terrain, body.x, body.y, body.z);
    body.mode == Mode::Air && body.vz <= 0.0 && body.z - ground <= LANDED
}

/// From rest, in this order: a dodge pressed, a drink pressed, a foe's telegraphed blow, a swing pressed, a guard
/// pressed or held (never with a ranged weapon), a ranged weapon raised to aim, a quick shot, and a swing while the
/// button is held. The newest press wins over a button only held.
fn begin<B: Near + ?Sized>(next: &mut Fighter, intent: &Intent, around: &Surroundings<'_, B>) -> Option<Happening> {
    let input = &intent.combat;
    if next.kept.dodge > 0 && can_dodge(next, intent.controls, around) {
        return Some(dodge(next, intent.controls, around));
    }
    if next.kept.heal > 0 && crate::drink::can_drink(next, intent.controls) {
        crate::drink::begin_drink(next);
        return None;
    }
    if let Some(order) = input.telegraph.filter(|_| !next.is_player()) {
        let body = next.body;
        next.action = Action::Telegraph(Telegraph::begin(&order, [body.x, body.y, body.z]));
        next.aim = order.bearing;
        return None;
    }
    // A kept click that cannot swing yet (no stamina, a swap) leaves a guard free to rise.
    if next.kept.attack > 0 && can_swing(next, intent) {
        return swing(next, intent);
    }
    if (input.guard || next.kept.guard > 0) && guards(next) {
        return Some(raise_guard(next));
    }
    if next.arms.ranged.is_some() && input.aim && next.swap == 0 {
        next.action = Action::Draw { elapsed: 0 };
        next.aim = intent.controls.yaw;
        return None;
    }
    // The trigger shoots at once, at the soft lock's target if it holds one the look is toward (turned away from it,
    // the shot flies along the look, as a swing turns only after a target within the lock's arc); the swing's button
    // swings a ranged holder's fists.
    let trigger = input.shoot || next.kept.shoot > 0;
    if let Some(ranged) = next.arms.ranged.filter(|_| trigger && next.swap == 0 && next.loaded()) {
        let (chest, yaw) = (next.chest(), intent.controls.yaw);
        let ahead = |at: &[f64; 3]| off(yaw, bearing([chest[0], chest[1]], [at[0], at[1]])) <= LOCK_ARC;
        let (heading, pitch) =
            around.target_at.filter(ahead).map_or((yaw, input.pitch), |target| toward(ranged, chest, target));
        return Some(shoot(next, loose(0, ranged, chest, heading, pitch, 1.0)));
    }
    swing(next, intent)
}

/// The guard raised: a press opens its side's parry window, unless it comes hard on the heels of one left unused.
fn raise_guard(next: &mut Fighter) -> Happening {
    let window = if next.kept.guard > 0 && next.missed_parry == 0 { parry_window(next.is_player()) } else { 0 };
    next.kept.guard = 0;
    next.action = Action::Guard { elapsed: 0, window };
    Happening::Guarded { window: window > 0 }
}

/// A swing begun with the stroke held, or the one a kept press was made with: a riposte at the foe it parried, a
/// counter a perfect dodge earned, or a plain one. None without stamina, riding off the ground, or in a swap.
fn swing(next: &mut Fighter, intent: &Intent) -> Option<Happening> {
    if !can_swing(next, intent) {
        return None;
    }
    let stroke = intent.combat.attack.or(next.kept.stroke.filter(|_| next.kept.attack > 0))?;
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
    spend(next, weapon(next.arms.melee).stamina * next.trim.swing_stamina);
    next.blows = next.blows.wrapping_add(1);
    next.kept.attack = 0;
    next.kept.stroke = None;
    let attack = Attack { stroke, elapsed: 0, strike, end, swing, left_hand };
    next.action = Action::Attack(attack);
    Some(Happening::Swung(attack))
}

/// Whether a swing could start now: a stroke held or kept, stamina left, footed when riding, and no swap under way.
fn can_swing(next: &Fighter, intent: &Intent) -> bool {
    let stroke = intent.combat.attack.is_some() || (next.kept.attack > 0 && next.kept.stroke.is_some());
    let riding_aloft = intent.controls.mounted && next.body.mode != Mode::Ground;
    stroke && next.stamina > 0.0 && !riding_aloft && next.swap == 0
}

fn can_dodge<B: Near + ?Sized>(next: &Fighter, controls: Controls, around: &Surroundings<'_, B>) -> bool {
    let footed = next.body.mode == Mode::Ground || touching_down(&next.body, around);
    footed && !controls.mounted && next.stamina > 0.0
}

/// The dodge's hop: the way the controls point (straight back with none), fast and low, facing the lock's target if
/// it has one and else the way it goes.
fn dodge<B: Near + ?Sized>(next: &mut Fighter, controls: Controls, around: &Surroundings<'_, B>) -> Happening {
    let (sin, cos) = (libm::sin(controls.yaw), libm::cos(controls.yaw));
    let forward = if controls.forward.is_finite() { controls.forward.clamp(-1.0, 1.0) } else { 0.0 };
    let sideways = if controls.sideways.is_finite() { controls.sideways.clamp(-1.0, 1.0) } else { 0.0 };
    let (wish_x, wish_y) = (sin * forward + cos * sideways, -cos * forward + sin * sideways);
    let length = (wish_x * wish_x + wish_y * wish_y).sqrt();
    let toward = if length > 1e-9 { [wish_x / length, wish_y / length] } else { [-sin, cos] };
    let body = next.body;
    let facing =
        around.target_at.map_or_else(|| bearing([0.0, 0.0], toward), |at| bearing([body.x, body.y], [at[0], at[1]]));
    let drawn = if next.arms == crate::arms::BARE_HANDS { 1.0 } else { next.trim.drawn_dodge_stamina };
    spend(next, DODGE_STAMINA * next.trim.dodge_stamina * drawn);
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
fn wind_up<B: Near + ?Sized>(
    next: &mut Fighter,
    telegraph: Telegraph,
    around: &Surroundings<'_, B>,
) -> Option<Happening> {
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
        // A charge or a leap strikes at the height it came down at, not the one it set off from.
        telegraph.landed_z = telegraph.landing().map(|_| next.body.z);
        return Some(Happening::Landed(telegraph));
    }
    next.action = Action::Telegraph(telegraph);
    None
}

/// The bearing an aimed shot flies along: at the aim's mark, or along the look without one or with one inside the
/// fighter's own round across the ground (straight below or above, it has no bearing of its own).
fn aimed_bearing(next: &Fighter, intent: &Intent) -> f64 {
    let at = [next.body.x, next.body.y];
    let mark = intent.combat.mark.map(|mark| [mark[0], mark[1]]).filter(|mark| apart(at, *mark) >= BODY_RADIUS);
    mark.map_or(intent.controls.yaw, |mark| bearing(at, mark))
}

/// A ranged weapon held up to aim while the aim is held, a bow charging: a pull of the trigger fires the aimed shot
/// onto the aim's mark (an arrow laid high enough for its fall) or along the look, at the power its aiming has
/// reached (a foe's at a quick shot's); letting the aim go lowers it unfired.
fn draw(next: &mut Fighter, elapsed: u32, intent: &Intent, pulled: bool) -> Option<Happening> {
    let input = &intent.combat;
    let Some(ranged) = next.arms.ranged.filter(|_| input.aim) else {
        next.action = Action::Idle;
        return None;
    };
    if pulled && next.loaded() {
        let (chest, heading) = (next.chest(), aimed_bearing(next, intent));
        let pitch = input.mark.map_or(input.pitch, |mark| toward(ranged, chest, mark).1);
        // A foe's drawn shot strikes as a quick one: the aimed shot's power is a player's alone. A quicker draw reaches
        // its power sooner.
        let player = next.is_player();
        let drawn = (f64::from(elapsed) / next.trim.draw).round().min(f64::from(DRAW_FULL)) as u32;
        let power = if player { aimed_power(ranged, drawn) * next.trim.aimed } else { 1.0 };
        let shot = loose(0, ranged, chest, heading, pitch, power * next.might);
        return Some(shoot(next, if player { shot } else { by_foe(&shot) }));
    }
    next.action = Action::Draw { elapsed: (elapsed + 1).min(DRAW_FULL) };
    None
}

/// A shot leaving: one of its ammunition spent, the weapon reloads, its arms pointing the way the shot flies (an aimed
/// one's turned back to the look by `aim`). A double pistolet's right shot waits only for its firing frames, the
/// left's for the reload of both.
fn shoot(next: &mut Fighter, shot: Shot) -> Happening {
    next.ammo = next.ammo.map(|left| left.saturating_sub(1));
    next.kept.shoot = 0;
    let right = shot.ranged == Ranged::DoublePistolet && !next.fired_right;
    next.fired_right = right;
    let reload = if right { f64::from(BRACE_GAP) } else { f64::from(shot_numbers(shot.ranged).3) * next.trim.reload };
    next.action = Action::Reload { left: reload.round().max(1.0) as u32 };
    next.aim = crate::sight::bearing([0.0, 0.0], [shot.velocity[0], shot.velocity[1]]);
    Happening::Loosed(shot)
}

/// The share of its pace a fighter keeps while it aims a ranged weapon.
const AIM_PACE: f64 = 0.5;

/// Controls that hold the body still where it stands, but let it fall.
fn still(controls: Controls) -> Controls {
    Controls { forward: 0.0, sideways: 0.0, run: false, jump: false, crouch: false, ..controls }
}

/// Controls slowed to a share of their pace, with no running, jumping or crouching.
fn slowed(controls: Controls, share: f64) -> Controls {
    Controls { forward: controls.forward * share, sideways: controls.sideways * share, ..still(controls) }
}

/// The body moved as the action allows: freely at rest, slowly swinging or guarding, at a walk drinking, not at all
/// when struck or while a Charge holds (one waiting out a reload too), and a charge or a leap carried to its landing
/// at the end of its wind-up.
fn move_body<B: Near + ?Sized>(next: &mut Fighter, controls: Controls, around: &Surroundings<'_, B>) {
    let allowed = match next.action {
        _ if next.statuses.has(crate::Status::Charge) => still(controls),
        Action::Idle | Action::Reload { .. } => controls,
        Action::Attack(_) => slowed(controls, ATTACK_PACE),
        Action::Guard { .. } | Action::Parry { .. } => slowed(controls, GUARD_PACE),
        Action::Draw { .. } => slowed(controls, (AIM_PACE * next.trim.aim_pace).min(1.0)),
        Action::Drink { .. } => slowed(controls, 1.0),
        Action::Telegraph(telegraph) => {
            if let Some(body) = crate::shapes::travel(&next.body, &telegraph, around) {
                next.body = body;
                return;
            }
            still(controls)
        }
        _ => still(controls),
    };
    let pace = crate::status::pace(next);
    let body = step_body_paced(&next.body, &allowed, around.blocks, around.terrain, TICK_SECONDS, pace);
    let fighting = matches!(
        next.action,
        Action::Attack(_) | Action::Guard { .. } | Action::Parry { .. } | Action::Draw { .. } | Action::Telegraph(_)
    );
    next.body = if fighting && body.mode == Mode::Ground { Body { facing: next.aim, ..body } } else { body };
}

/// The arms point where the fighter looks, but a swing's wind-up turns after the soft lock's target in reach and a
/// guard turns to face it; a blow, once it lands, is locked where it was, and a quick shot's weapon stays pointed where
/// it fired while it reloads. A weapon aimed faces the look, its reload too while the aim is held: the camera stands
/// over the shoulder, so the bearing to a near mark would turn the fighter aside, and only the shot need reach it.
fn aim<B: Near + ?Sized>(next: &mut Fighter, intent: &Intent, around: &Surroundings<'_, B>) {
    let (yaw, body) = (intent.controls.yaw, next.body);
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
            let reach = reach_of(next) + STEER_REACH;
            turned(next.aim, in_reach(reach).unwrap_or(yaw), AIM_TURN)
        }
        Action::Guard { .. } | Action::Parry { .. } => {
            turned(next.aim, target.map_or(yaw, |(toward, _)| toward), GUARD_TURN)
        }
        Action::Draw { .. } | Action::Idle | Action::Flinch { .. } | Action::Drink { .. } => yaw,
        Action::Reload { .. } if intent.combat.aim => yaw,
        _ => next.aim,
    };
}
