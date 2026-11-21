//! A player's healing charges: a drink begun from rest on the ground, walked through, its health coming as it ends; a
//! blow that lands cuts it short with the charge kept, as it flinches the drinker (`judge`). And the meter toward the
//! next charge, which the host fills as the player's blows land.

use crate::fighter::{Action, Fighter};
use crate::step::Happening;
use crate::tuning::{CHARGES, DRINK_HEALS, DRINK_TICKS};
use movement::{Controls, Mode};

/// Whether a drink may begin: a player's, standing on the ground and on foot, with a charge to drink and health short
/// of its most to take it. A foe never drinks.
#[must_use]
pub fn can_drink(fighter: &Fighter, controls: Controls) -> bool {
    let footed = fighter.body.mode == Mode::Ground && !controls.mounted;
    fighter.is_player() && footed && fighter.charges > 0 && fighter.health < fighter.health_max
}

/// A drink begun, its press acted on.
pub(crate) fn begin_drink(next: &mut Fighter) {
    next.kept.heal = 0;
    next.action = Action::Drink { elapsed: 0 };
}

/// A drink a tick on. The charge is spent only as it ends, so one cut short keeps it; its health comes then, never past
/// the most, and is said for the host to tell. Off the ground or in the saddle (a climb begun, a fall, a horse) it is put
/// down, and so is one ending at full health (a spell topped it up): neither spends its charge.
pub(crate) fn drink(next: &mut Fighter, elapsed: u32, controls: Controls) -> Option<Happening> {
    let elapsed = elapsed + 1;
    let footed = next.body.mode == Mode::Ground && !controls.mounted;
    if footed && elapsed < DRINK_TICKS {
        next.action = Action::Drink { elapsed };
        return None;
    }
    if !footed || next.health >= next.health_max {
        next.action = Action::Idle;
        return None;
    }
    let health = (next.health + next.health_max * DRINK_HEALS).min(next.health_max);
    let healed = health - next.health;
    next.health = health;
    next.charges = next.charges.saturating_sub(1);
    next.action = Action::Idle;
    Some(Happening::Drank(healed))
}

/// The fighter with `gain` of a charge more toward its next: each whole one filled is a charge, none past `CHARGES`,
/// and the meter stands empty while every charge is full.
#[must_use]
pub fn recharged(fighter: &Fighter, gain: f64) -> Fighter {
    let mut next = *fighter;
    if gain.is_finite() && gain > 0.0 {
        next.meter += gain;
    }
    while next.meter >= 1.0 && next.charges < CHARGES {
        next.charges += 1;
        next.meter -= 1.0;
    }
    if next.charges >= CHARGES {
        next.meter = 0.0;
    }
    next
}
