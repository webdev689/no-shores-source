//! What a kill lays on the ground for each player who earned it, seen by them alone for two minutes: their Vestige, an
//! Ammo box by the foe's rank, and a Miniboss's or a Boss's Ammo crate when they carry five already. Each is thrown out
//! of the fallen foe in a fan toward the player, comes to rest where the fan puts it, and is taken by walking within
//! reach once it rests. And the shots a player spends, kept with their gear.

use crate::{PlayerId, Room};
use gear::Vestige;
use gear::dice::{Dice, Purpose};
use movement::TUNING;
use movement::blocks::ground_at;

/// How long a drop lies for its player, in the room's ticks of 1/60 s: two minutes.
pub const DROP_TICKS: u64 = 7_200;
/// How long a drop is in the air before it rests and can be taken: about 0.6 s, bouncing.
pub const REST_TICKS: u64 = 36;
/// How near a player walks to a drop to take it, across and up, in metres.
pub const PICK_UP_REACH: f64 = 1.5;
const PICK_UP_HEIGHT: f64 = 2.0;
/// How far from the body a drop comes to rest, metres, and how far either side of the way to the player its fan opens,
/// radians.
pub const THROW_M: f64 = 2.0;
pub const FAN_HALF: f64 = 1.2;

/// What lies on the ground.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Dropped {
    Vestige(Vestige),
    AmmoBox,
    Crate,
}

/// A drop lying for one player: their number for it, what it is, where it rests and where it was thrown from, the tick
/// it comes to rest and the tick it is gone.
#[derive(Clone, Debug, PartialEq)]
pub struct Drop {
    pub player: PlayerId,
    pub id: u32,
    pub what: Dropped,
    pub at: [f64; 3],
    pub from: [f64; 3],
    pub rests: u64,
    pub until: u64,
}

impl Room {
    /// Lays what a kill at `from` left one player: their Vestiges, an Ammo box by the foe's rank (the foes crate's
    /// number), and from a Miniboss or a Boss an Ammo crate, which goes straight into their five while there is room.
    pub(crate) fn drop_spoils(
        &mut self,
        player: PlayerId,
        vestiges: Vec<Vestige>,
        rank: u8,
        from: [f64; 3],
        dice: &Dice,
    ) {
        let Some(found) = self.players.get_mut(&player) else { return };
        let mut spoils: Vec<Dropped> = vestiges.into_iter().map(Dropped::Vestige).collect();
        if dice.roll(Purpose::AmmoBox, 0) < gear::ammo::box_chance(rank) {
            spoils.push(Dropped::AmmoBox);
        }
        if gear::ammo::drops_crate(rank) && !found.character.take_crate() {
            spoils.push(Dropped::Crate);
        }
        let body = found.fighter.body;
        let toward = combat::sight::bearing([from[0], from[1]], [body.x, body.y]);
        let count = spoils.len() as f64;
        for (place, what) in spoils.into_iter().enumerate() {
            let angle = toward + ((place as f64 + 0.5) / count * 2.0 - 1.0) * FAN_HALF;
            let at = self.rest_at(from, angle);
            self.lay(player, what, at, from);
        }
    }

    /// Where a drop thrown from `from` along `angle` rests: on the ground or a block's top there; or where it was
    /// thrown from when a block more than a step high stands anywhere in the throw's way, the ground there lies more
    /// than a step below, or there is past the section's ring, so a drop is never out of its player's reach.
    fn rest_at(&self, from: [f64; 3], angle: f64) -> [f64; 3] {
        let (x, y) = (from[0] + libm::sin(angle) * THROW_M, from[1] - libm::cos(angle) * THROW_M);
        let high = from[2] + TUNING.step;
        let walled = !combat::sight::clear_line(&self.blocks, [from[0], from[1], high], [x, y, high]);
        let outside = self.section.as_ref().is_some_and(|section| !reach::inside(&section.ring, x, y));
        let ground = ground_at(&self.blocks, &self.floor, x, y, from[2]);
        if walled || outside || ground < from[2] - TUNING.step { from } else { [x, y, ground] }
    }

    /// Lays a drop for a player where it lies already, thrown from nowhere: for tests and the Test Ground.
    pub fn lay_drop(&mut self, player: PlayerId, what: Dropped, at: [f64; 3]) {
        self.lay(player, what, at, at);
    }

    /// Lays a drop for a player, numbered as their own: a Vestige by its number, anything else a fresh one.
    fn lay(&mut self, player: PlayerId, what: Dropped, at: [f64; 3], from: [f64; 3]) {
        let Some(found) = self.players.get_mut(&player) else { return };
        let id = match &what {
            Dropped::Vestige(vestige) => vestige.id,
            Dropped::AmmoBox | Dropped::Crate => found.character.take_id(),
        };
        found.gear_changed = true;
        let (rests, until) = (self.clock + REST_TICKS, self.clock + DROP_TICKS);
        self.drops.push(Drop { player, id, what, at, from, rests, until });
    }

    /// Takes every drop at rest a player has walked over and has room for, and lets go of those that have lain their
    /// time, telling their player so their page stops showing them.
    pub(crate) fn pick_up_drops(&mut self) {
        let clock = self.clock;
        let mut kept = Vec::with_capacity(self.drops.len());
        for drop in std::mem::take(&mut self.drops) {
            let Some(found) = self.players.get_mut(&drop.player) else { continue };
            if clock >= drop.until {
                found.gear_changed = true;
                continue;
            }
            let body = found.fighter.body;
            let near = libm::hypot(body.x - drop.at[0], body.y - drop.at[1]) <= PICK_UP_REACH
                && (body.z - drop.at[2]).abs() <= PICK_UP_HEIGHT;
            let character = &mut found.character;
            let taken = clock >= drop.rests
                && near
                && match &drop.what {
                    Dropped::Vestige(vestige) => character.pick_up(vestige.clone()),
                    Dropped::AmmoBox => character.take_ammo_box(),
                    Dropped::Crate => character.take_crate(),
                };
            if taken {
                found.gear_changed = true;
                found.fighter = found.armed(found.fighter);
            } else {
                kept.push(drop);
            }
        }
        self.drops = kept;
    }

    /// The drops lying for a player.
    pub fn drops_for(&self, player: PlayerId) -> impl Iterator<Item = &Drop> {
        self.drops.iter().filter(move |drop| drop.player == player)
    }

    /// A shot a player's fighter loosed, spent from their Ranged weapon's ammunition; a foe's spends nothing.
    pub(crate) fn spent_shot(&mut self, shooter: PlayerId) {
        if let Some(found) = self.players.get_mut(&shooter) {
            found.character.spend_shot();
            found.gear_changed = true;
        }
    }
}

#[cfg(test)]
#[path = "drops_tests.rs"]
mod drops_tests;
