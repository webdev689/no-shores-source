//! A player's healing charges: a drink begun from rest on the ground, walked through, its health coming as it ends; a
//! blow that lands cuts it short with the charge kept, as it flinches the drinker (`judge`). And the meter toward the
//! next charge, which the host fills as the player's blows land.

use crate::fighter::{Action, Fighter};
use crate::step::Happening;
use crate::tuning::{CHARGES, DRINK_HEALS, DRINK_TICKS};
use movement::{Controls, Mode};

/// Whether a drink may begin: a player's, standing on the ground and on foot, out of a loadout swap (as an aim's draw
/// is), with a charge to drink and health short of its most to take it. A foe never drinks.
#[must_use]
pub fn can_drink(fighter: &Fighter, controls: Controls) -> bool {
    let footed = fighter.body.mode == Mode::Ground && !controls.mounted;
    let free = fighter.swap == 0;
    fighter.is_player() && footed && free && fighter.charges > 0 && fighter.health < fighter.health_max
}

/// A drink begun, its press acted on. A meter left over from a drink cut short stands empty again first, as it would
/// have with every charge full.
pub(crate) fn begin_drink(next: &mut Fighter) {
    next.kept.heal = 0;
    filled(next);
    next.action = Action::Drink { elapsed: 0 };
}

/// A drink a tick on. The charge is spent only as it ends, so one cut short keeps it; its health comes then, never past
/// the most, and is said for the host to tell. Off the ground or in the saddle (a climb begun, a fall, a horse) it is
/// put down, and so is one ending at full health (a spell topped it up) or with no charge to spend: none spends a
/// charge or heals.
pub(crate) fn drink(next: &mut Fighter, elapsed: u32, controls: Controls) -> Option<Happening> {
    let elapsed = elapsed + 1;
    let footed = next.body.mode == Mode::Ground && !controls.mounted;
    if footed && elapsed < DRINK_TICKS {
        next.action = Action::Drink { elapsed };
        return None;
    }
    next.action = Action::Idle;
    if !footed || next.charges == 0 || next.health >= next.health_max {
        filled(next);
        return None;
    }
    let health = (next.health + next.health_max * DRINK_HEALS * next.trim.drink_heal).min(next.health_max);
    let healed = health - next.health;
    next.health = health;
    next.charges -= 1;
    filled(next);
    Some(Happening::Drank(healed))
}

/// The fighter with `gain` of a charge more toward its next (`filled`).
#[must_use]
pub fn recharged(fighter: &Fighter, gain: f64) -> Fighter {
    let mut next = *fighter;
    if gain.is_finite() && gain > 0.0 {
        next.meter += gain;
    }
    filled(&mut next);
    next
}

/// Each whole meter is a charge, none past `CHARGES`, and the meter stands empty while every charge is full. While a
/// drink is under way the charge it drinks counts as spent: the meter fills to one whole, a charge as the drink spends
/// one, so a charge earned in its last moments is not lost.
fn filled(next: &mut Fighter) {
    while next.meter >= 1.0 && next.charges < CHARGES {
        next.charges += 1;
        next.meter -= 1.0;
    }
    if next.charges >= CHARGES {
        let drinking = matches!(next.action, Action::Drink { .. });
        next.meter = if drinking { next.meter.min(1.0) } else { 0.0 };
    }
}
