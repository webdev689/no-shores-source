//! A player's tick, as its room takes it and its browser predicts it: the soft lock carried, the fighter stepped with
//! its lock's target where the player's own view has it, and the lock taken afresh as a swing or a guard begins.

use crate::fighter::{Fighter, FighterId, Intent};
use crate::lock::{hold, take};
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
    let yaw = intent.controls.yaw;
    let held = hold(fighter, yaw, view, blocks);
    let target_at =
        held.target.and_then(|target| view.iter().find(|(other, _)| *other == target)).map(|(_, other)| other.chest());
    let (next, happening) = step_fighter(&held, intent, &Surroundings { blocks, terrain, target_at });
    let next = match happening {
        Some(Happening::Swung(_) | Happening::Guarded { .. }) => take(id, &next, yaw, view, blocks),
        _ => next,
    };
    (next, happening)
}
