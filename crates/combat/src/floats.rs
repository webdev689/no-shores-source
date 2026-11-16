//! A fighter and a player's intent as plain 64-bit numbers in one fixed order: how they cross into a browser and onto
//! the wire, and what a fingerprint of a fight is taken over. Every number crosses with its bits intact; numbers that
//! name nothing read back as the plainest thing they could be.

use crate::arms::{Arms, Stroke};
use crate::fighter::{Action, Attack, Cause, CombatInput, Fighter, Held, Intent, Side, Swing, Weight};
use crate::shapes::{Shape, Telegraph};
use movement::floats::{BODY_FLOATS, CONTROLS_FLOATS};
use movement::{Body, Controls};

/// The fight's own numbers after the body's: side, arms, weight, health and its most, stamina and its rest, poise,
/// its most, its rest and its immunity, aim, target (id + 1, 0 none), the lock's away and unseen counts, the riposte's
/// foe (id + 1) and ticks, counter, punished, missed parry, held buttons, blows, might; then the action's kind and
/// its numbers.
pub const COMBAT_FLOATS: usize = 23 + 1 + ACTION_NUMBERS;
const ACTION_NUMBERS: usize = 10;
pub const FIGHTER_FLOATS: usize = BODY_FLOATS + COMBAT_FLOATS;
/// An intent's numbers: the controls', then the stroke held (0 none), guard, dodge, shoot, pitch.
pub const INTENT_FLOATS: usize = CONTROLS_FLOATS + 5;

fn flag(value: bool) -> f64 {
    if value { 1.0 } else { 0.0 }
}

/// A whole count from a number, or 0 where it is not one.
fn count(number: f64) -> u32 {
    if number.is_finite() && number >= 0.0 && number <= f64::from(u32::MAX) { number as u32 } else { 0 }
}

fn small(number: f64) -> u8 {
    u8::try_from(count(number)).unwrap_or_default()
}

fn id_or_none(number: f64) -> Option<u32> {
    count(number).checked_sub(1)
}

fn none_or_id(id: Option<u32>) -> f64 {
    id.map_or(0.0, |id| f64::from(id) + 1.0)
}

/// An action's kind and numbers.
fn action_floats(action: &Action) -> (f64, [f64; ACTION_NUMBERS]) {
    let mut numbers = [0.0; ACTION_NUMBERS];
    let mut put = |values: &[f64]| numbers[..values.len()].copy_from_slice(values);
    let kind = match *action {
        Action::Idle => 0,
        Action::Attack(attack) => {
            let (swing, foe) = match attack.swing {
                Swing::Plain => (0.0, None),
                Swing::Riposte(foe) => (1.0, Some(foe)),
                Swing::Counter => (2.0, None),
            };
            let timing = [attack.elapsed, attack.strike, attack.end].map(f64::from);
            put(&[
                f64::from(attack.stroke as u8),
                timing[0],
                timing[1],
                timing[2],
                swing,
                none_or_id(foe),
                flag(attack.left_hand),
            ]);
            1
        }
        Action::Guard { elapsed, window } => {
            put(&[f64::from(elapsed), f64::from(window)]);
            2
        }
        Action::Parry { elapsed } => {
            put(&[f64::from(elapsed)]);
            3
        }
        Action::Dodge { elapsed, toward } => {
            put(&[f64::from(elapsed), toward[0], toward[1]]);
            4
        }
        Action::Flinch { left } => {
            put(&[f64::from(left)]);
            5
        }
        Action::Staggered { left, cause } => {
            put(&[f64::from(left), f64::from(cause as u8)]);
            6
        }
        Action::Down { left } => {
            put(&[f64::from(left)]);
            7
        }
        Action::Telegraph(telegraph) => {
            let feint = telegraph.feint_at.map_or(0.0, |at| f64::from(at) + 1.0);
            put(&[
                f64::from(telegraph.shape as u8),
                f64::from(telegraph.elapsed),
                f64::from(telegraph.windup),
                telegraph.origin[0],
                telegraph.origin[1],
                telegraph.origin[2],
                telegraph.bearing,
                telegraph.ahead,
                flag(telegraph.iron),
                feint,
            ]);
            8
        }
        Action::Overreach { left } => {
            put(&[f64::from(left)]);
            9
        }
        Action::Draw { elapsed } => {
            put(&[f64::from(elapsed)]);
            10
        }
        Action::Reload { left } => {
            put(&[f64::from(left)]);
            11
        }
        Action::Dead { elapsed } => {
            put(&[f64::from(elapsed)]);
            12
        }
    };
    (f64::from(kind), numbers)
}

fn action_from(kind: f64, numbers: &[f64]) -> Action {
    let at = |index: usize| numbers.get(index).copied().unwrap_or_default();
    let ticks = |index: usize| count(at(index));
    match count(kind) {
        1 => {
            let Some(stroke) = Stroke::from_number(small(at(0))) else { return Action::Idle };
            let swing = match (count(at(4)), id_or_none(at(5))) {
                (1, Some(foe)) => Swing::Riposte(foe),
                (2, _) => Swing::Counter,
                _ => Swing::Plain,
            };
            let (elapsed, strike, end) = (ticks(1), ticks(2), ticks(3));
            Action::Attack(Attack { stroke, elapsed, strike, end, swing, left_hand: at(6) != 0.0 })
        }
        2 => Action::Guard { elapsed: ticks(0), window: ticks(1) },
        3 => Action::Parry { elapsed: ticks(0) },
        4 => Action::Dodge { elapsed: ticks(0), toward: [at(1), at(2)] },
        5 => Action::Flinch { left: ticks(0) },
        6 => {
            let cause = match count(at(1)) {
                1 => Cause::Parried,
                2 => Cause::GuardBroken,
                _ => Cause::Poise,
            };
            Action::Staggered { left: ticks(0), cause }
        }
        7 => Action::Down { left: ticks(0) },
        8 => {
            let Some(shape) = Shape::from_number(small(at(0))) else { return Action::Idle };
            Action::Telegraph(Telegraph {
                shape,
                elapsed: ticks(1),
                windup: ticks(2),
                origin: [at(3), at(4), at(5)],
                bearing: at(6),
                ahead: at(7),
                iron: at(8) != 0.0,
                feint_at: id_or_none(at(9)),
            })
        }
        9 => Action::Overreach { left: ticks(0) },
        10 => Action::Draw { elapsed: ticks(0) },
        11 => Action::Reload { left: ticks(0) },
        12 => Action::Dead { elapsed: ticks(0) },
        _ => Action::Idle,
    }
}

impl Fighter {
    #[must_use]
    pub fn to_floats(&self) -> [f64; FIGHTER_FLOATS] {
        let mut floats = [0.0; FIGHTER_FLOATS];
        floats[..BODY_FLOATS].copy_from_slice(&self.body.to_floats());
        let held = u8::from(self.held.attack)
            | u8::from(self.held.guard) << 1
            | u8::from(self.held.dodge) << 2
            | u8::from(self.held.shoot) << 3;
        let riposte = self.riposte.map_or((0.0, 0.0), |(foe, left)| (f64::from(foe) + 1.0, f64::from(left)));
        let (kind, numbers) = action_floats(&self.action);
        let combat = [
            f64::from(self.side as u8),
            f64::from(self.arms.code()),
            f64::from(self.weight as u8),
            self.health,
            self.health_max,
            self.stamina,
            f64::from(self.stamina_rest),
            self.poise,
            self.poise_max,
            f64::from(self.poise_rest),
            f64::from(self.poise_immune),
            self.aim,
            none_or_id(self.target),
            f64::from(self.lock_away),
            f64::from(self.lock_unseen),
            riposte.0,
            riposte.1,
            f64::from(self.counter),
            f64::from(self.punished),
            f64::from(self.missed_parry),
            f64::from(held),
            f64::from(self.blows),
            self.might,
            kind,
        ];
        floats[BODY_FLOATS..BODY_FLOATS + combat.len()].copy_from_slice(&combat);
        floats[BODY_FLOATS + combat.len()..].copy_from_slice(&numbers);
        floats
    }

    #[must_use]
    pub fn from_floats(floats: &[f64; FIGHTER_FLOATS]) -> Self {
        let (body, combat) = floats.split_at(BODY_FLOATS);
        let body = Body::from_floats(body.try_into().unwrap_or(&[0.0; BODY_FLOATS]));
        let at = |index: usize| combat.get(index).copied().unwrap_or_default();
        let side = if count(at(0)) == 1 { Side::Foes } else { Side::Players };
        let weight = [Weight::Light, Weight::Medium, Weight::Heavy, Weight::Massive]
            .into_iter()
            .find(|weight| f64::from(*weight as u8) == at(2))
            .unwrap_or(Weight::Medium);
        let held = count(at(20));
        Fighter {
            side,
            body,
            arms: Arms::from_code(count(at(1))),
            weight,
            health: at(3),
            health_max: at(4),
            stamina: at(5),
            stamina_rest: count(at(6)),
            poise: at(7),
            poise_max: at(8),
            poise_rest: count(at(9)),
            poise_immune: count(at(10)),
            action: action_from(at(23), &combat[24..]),
            aim: at(11),
            target: id_or_none(at(12)),
            lock_away: count(at(13)),
            lock_unseen: count(at(14)),
            riposte: id_or_none(at(15)).map(|foe| (foe, count(at(16)))),
            counter: count(at(17)),
            punished: count(at(18)),
            missed_parry: count(at(19)),
            held: Held { attack: held & 1 != 0, guard: held & 2 != 0, dodge: held & 4 != 0, shoot: held & 8 != 0 },
            blows: count(at(21)),
            might: at(22),
        }
    }
}

impl Intent {
    #[must_use]
    pub fn to_floats(&self) -> [f64; INTENT_FLOATS] {
        let mut floats = [0.0; INTENT_FLOATS];
        floats[..CONTROLS_FLOATS].copy_from_slice(&self.controls.to_floats());
        let combat = &self.combat;
        let stroke = combat.attack.map_or(0.0, |stroke| f64::from(stroke as u8));
        floats[CONTROLS_FLOATS..].copy_from_slice(&[
            stroke,
            flag(combat.guard),
            flag(combat.dodge),
            flag(combat.shoot),
            combat.pitch,
        ]);
        floats
    }

    /// A player's intent from its numbers: a player never begins a telegraphed blow.
    #[must_use]
    pub fn from_floats(floats: &[f64; INTENT_FLOATS]) -> Self {
        let (controls, combat) = floats.split_at(CONTROLS_FLOATS);
        let controls = Controls::from_floats(controls.try_into().unwrap_or(&[0.0; CONTROLS_FLOATS]));
        let at = |index: usize| combat.get(index).copied().unwrap_or_default();
        let pitch = if at(4).is_finite() { at(4) } else { 0.0 };
        Intent {
            controls,
            combat: CombatInput {
                attack: Stroke::from_number(small(at(0))),
                guard: at(1) != 0.0,
                dodge: at(2) != 0.0,
                shoot: at(3) != 0.0,
                pitch,
                telegraph: None,
            },
        }
    }
}
