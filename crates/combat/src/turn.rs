//! A player's tick, as its room takes it and its browser predicts it: the soft lock carried, let go while a ranged
//! weapon aims and taken as its trigger is pulled from the hip, the fighter stepped with its lock's target where the
//! player's own view has it, and the lock taken afresh as a swing or a guard begins.

use crate::fighter::{Fighter, FighterId, Intent};
use crate::lock::{hold, let_go, take};
use crate::step::{Happening, Surroundings, step_fighter};
use movement::{Block, Terrain};

/// One tick of a player's fighter among `view`, every fighter as that player last saw them, on the course's blocks and
/// the ground under them.
#[must_use]
pub fn player_tick(
    id: FighterId,
    fighter: &Fighter,
    intent: &Intent,
    view: &[(FighterId, Fighter)],
    blocks: &[Block],
    terrain: &dyn Terrain,
) -> (Fighter, Option<Happening>) {
    let (yaw, combat, ranged) = (intent.controls.yaw, &intent.combat, fighter.arms.ranged.is_some());
    let held = hold(fighter, yaw, view, blocks, terrain);
    // An aimed shot flies where the look is; one from the hip flies at the foe the lock takes, as a swing would.
    let held = if ranged && combat.aim {
        let_go(&held)
    } else if ranged && combat.shoot {
        take(id, &held, yaw, view, blocks, terrain)
    } else {
        held
    };
    let target_at =
        held.target.and_then(|target| view.iter().find(|(other, _)| *other == target)).map(|(_, other)| other.chest());
    let (next, happening) = step_fighter(&held, intent, &Surroundings { blocks, terrain, target_at });
    let next = match happening {
        Some(Happening::Swung(_) | Happening::Guarded { .. }) => take(id, &next, yaw, view, blocks, terrain),
        _ => next,
    };
    (next, happening)
}
