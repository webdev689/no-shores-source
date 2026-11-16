//! What every combat test builds on: fighters on open ground, intents, and stepping them.
#![allow(dead_code, reason = "each test file uses its own share of these")]

use combat::arms::{Arms, OffHand, WeaponClass};
use combat::fighter::{Side, Weight};
use combat::{CombatInput, Fighter, Intent, Stroke, Surroundings, step_fighter};
use movement::{Block, Controls, standing};

pub const SWORD: Arms = Arms { melee: WeaponClass::Sword, ranged: None, off_hand: OffHand::Empty };
pub const SWORD_AND_SHIELD: Arms = Arms { melee: WeaponClass::Sword, ranged: None, off_hand: OffHand::Shield };

/// A player at (x, y) facing north, holding a sword.
pub fn player_at(x: f64, y: f64) -> Fighter {
    let mut body = standing(x, y);
    body.facing = 0.0;
    let mut fighter = combat::fighter::player(body, SWORD);
    fighter.aim = 0.0;
    fighter
}

/// A foe at (x, y) facing south toward a player north of it... or wherever `facing` says.
pub fn foe_at(x: f64, y: f64, facing: f64) -> Fighter {
    let mut body = standing(x, y);
    body.facing = facing;
    let mut fighter = combat::fighter(Side::Foes, body, SWORD, Weight::Medium, 70.0, 35.0);
    fighter.aim = facing;
    fighter
}

/// Looking along `yaw`, standing still, with these fight buttons.
pub fn asking(yaw: f64, combat: CombatInput) -> Intent {
    Intent { controls: Controls { yaw, ..Controls::default() }, combat }
}

pub fn idle(yaw: f64) -> Intent {
    asking(yaw, CombatInput::default())
}

pub fn swinging(yaw: f64, stroke: Stroke) -> Intent {
    asking(yaw, CombatInput { attack: Some(stroke), ..CombatInput::default() })
}

pub fn guarding(yaw: f64) -> Intent {
    asking(yaw, CombatInput { guard: true, ..CombatInput::default() })
}

pub fn dodging(yaw: f64, forward: f64, sideways: f64) -> Intent {
    Intent {
        controls: Controls { yaw, forward, sideways, ..Controls::default() },
        combat: CombatInput { dodge: true, ..CombatInput::default() },
    }
}

/// Steps the fighter `ticks` times under one intent on open ground, with its target's chest at `target_at`; gives
/// the fighter and every happening with its tick.
pub fn run(
    fighter: Fighter,
    intent: Intent,
    ticks: u32,
    target_at: Option<[f64; 3]>,
) -> (Fighter, Vec<(u32, combat::Happening)>) {
    run_on(fighter, intent, ticks, target_at, &[])
}

pub fn run_on(
    mut fighter: Fighter,
    intent: Intent,
    ticks: u32,
    target_at: Option<[f64; 3]>,
    blocks: &[Block],
) -> (Fighter, Vec<(u32, combat::Happening)>) {
    let mut happenings = Vec::new();
    for tick in 0..ticks {
        let (next, happening) = step_fighter(&fighter, &intent, &Surroundings { blocks, target_at });
        fighter = next;
        if let Some(happening) = happening {
            happenings.push((tick, happening));
        }
    }
    (fighter, happenings)
}
