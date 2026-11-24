//! What a kill lays on the ground for each player who earned it, seen by them alone for two minutes: their Vestige, an
//! Ammo box by the foe's rank, and a Miniboss's or a Boss's Ammo crate when they carry five already. Each is thrown out
//! of the fallen foe in a fan toward the player, comes to rest where the fan puts it, and is taken by walking within
//! reach once it rests. A chest's Vestige is poured out of it as its lid opens, as project-final's cache pours its
//! loot. A Vestige not taken goes to its player's mail as its time runs out or as they leave. And the shots a player
//! spends, kept with their gear.

use crate::{PlayerId, Room};
use gear::Vestige;
use gear::activities::Modifier;
use gear::dice::{Dice, Purpose};
use gear::mail::{Posted, Source};
use movement::TUNING;
use movement::blocks::ground_at;

/// How long a drop lies for its player, in the room's ticks of 1/60 s: two minutes.
pub const DROP_TICKS: u64 = 7_200;
/// How long a Vestige may be in the air before it can be taken: the longest its crystal bounces, about 1.6 s.
pub const VESTIGE_REST_TICKS: u64 = 94;
/// How long an Ammo box or crate may be in the air before it can be taken: the longest it bounces, 1 s.
pub const AMMO_REST_TICKS: u64 = 60;
/// How long a Vestige poured out of a chest may be before it can be taken: the 0.22 s the lid takes to open its mouth,
/// then the longest its higher pop bounces, about 1.8 s.
pub const POURED_REST_TICKS: u64 = 122;
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
    /// A won public event's chest, of its tier (1 to 4), from an event at its level.
    Chest {
        tier: u8,
        level: u8,
    },
}

/// A drop lying for one player: their number for it, what it is, where it rests and where it was thrown from (the
/// foot of the chest it was poured out of, if it was), the tick it comes to rest and the tick it is gone.
#[derive(Clone, Debug, PartialEq)]
pub struct Drop {
    pub player: PlayerId,
    pub id: u32,
    pub what: Dropped,
    pub at: [f64; 3],
    pub from: [f64; 3],
    pub poured: bool,
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
        // Juggler leaves no ammunition: no box, and no crate, kept or thrown.
        let juggling = self.modded(Modifier::Juggler);
        let Some(found) = self.players.get_mut(&player) else { return };
        let mut spoils: Vec<Dropped> = vestiges.into_iter().map(Dropped::Vestige).collect();
        if !juggling && dice.roll(Purpose::AmmoBox, 0) < gear::ammo::box_chance(rank) {
            spoils.push(Dropped::AmmoBox);
        }
        if !juggling && gear::ammo::drops_crate(rank) && !found.character.take_crate() {
            spoils.push(Dropped::Crate);
        }
        let body = [found.fighter.body.x, found.fighter.body.y];
        for (what, angle) in spoils.iter().cloned().zip(fan(from, body, spoils.len())) {
            let at = self.rest_at(from, angle);
            self.lay(player, what, at, from);
        }
    }

    /// Pours a chest's Vestiges out of it for the player who opened it, standing at its foot `from`: up out of its
    /// mouth as its lid opens, onto the floor `onto` where the chest keeps it clear, else fanned toward them as a
    /// kill's are, each where its throw puts it.
    pub(crate) fn pour(&mut self, player: PlayerId, vestiges: Vec<Vestige>, from: [f64; 3], onto: Option<[f64; 3]>) {
        let Some(found) = self.players.get(&player) else { return };
        let body = [found.fighter.body.x, found.fighter.body.y];
        for (vestige, angle) in vestiges.iter().cloned().zip(fan(from, body, vestiges.len())) {
            let at = onto.unwrap_or_else(|| self.rest_at(from, angle));
            self.put(player, Dropped::Vestige(vestige), (at, from), true);
        }
    }

    /// Where a drop thrown from `from` along `angle` rests: on the ground or a block's top there; or where it was
    /// thrown from when a block more than a step high or a wall of the floor stands anywhere in the throw's way, the
    /// ground there lies more than a step below, there is past the section's ring, or it lies so deep in a solid no
    /// body may stand on (a dungeon's lake, dais or pool) that no body standing off it can reach it, so a drop is
    /// never out of its player's reach.
    fn rest_at(&self, from: [f64; 3], angle: f64) -> [f64; 3] {
        let (x, y) = (from[0] + libm::sin(angle) * THROW_M, from[1] - libm::cos(angle) * THROW_M);
        let high = from[2] + TUNING.step;
        let walled = !combat::sight::clear_line(&self.blocks, &self.floor, [from[0], from[1], high], [x, y, high]);
        let outside = self.section.as_ref().is_some_and(|section| !reach::inside(&section.ring, x, y));
        let buried = self.floor.depth_in_solid(x, y) > PICK_UP_REACH - TUNING.radius;
        let ground = ground_at(&self.blocks, &self.floor, x, y, from[2]);
        if walled || outside || buried || ground < from[2] - TUNING.step { from } else { [x, y, ground] }
    }

    /// Lays a drop for a player where it lies already, thrown from nowhere: for tests, this crate's and the door's.
    pub fn lay_drop(&mut self, player: PlayerId, what: Dropped, at: [f64; 3]) {
        self.lay(player, what, at, at);
    }

    /// Lays a drop for a player, numbered as their own: a Vestige by its number, anything else a fresh one.
    pub(crate) fn lay(&mut self, player: PlayerId, what: Dropped, at: [f64; 3], from: [f64; 3]) {
        self.put(player, what, (at, from), false);
    }

    /// Lays a drop for a player thrown from `from` to rest at `at`, `poured` out of a chest or not.
    fn put(&mut self, player: PlayerId, what: Dropped, (at, from): ([f64; 3], [f64; 3]), poured: bool) {
        let Some(found) = self.players.get_mut(&player) else { return };
        let (id, flies) = match &what {
            Dropped::Vestige(vestige) if poured => (vestige.id, POURED_REST_TICKS),
            Dropped::Vestige(vestige) => (vestige.id, VESTIGE_REST_TICKS),
            Dropped::AmmoBox | Dropped::Crate | Dropped::Chest { .. } => (found.character.take_id(), AMMO_REST_TICKS),
        };
        found.gear_changed = true;
        let (rests, until) = (self.clock + flies, self.clock + DROP_TICKS);
        self.drops.push(Drop { player, id, what, at, from, poured, rests, until });
    }

    /// Takes every drop at rest a player has walked over and has room for, and lets go of those that have lain their
    /// time, a Vestige to their mail, telling their player so their page stops showing them.
    pub(crate) fn pick_up_drops(&mut self) {
        let clock = self.clock;
        let mut kept = Vec::with_capacity(self.drops.len());
        let mut expired = Vec::new();
        for drop in std::mem::take(&mut self.drops) {
            let Some(found) = self.players.get_mut(&drop.player) else { continue };
            if clock >= drop.until {
                found.gear_changed = true;
                match drop.what {
                    Dropped::Vestige(vestige) => found.character.post(Source::LeftLying, Posted::Vestige(vestige)),
                    // A chest never goes unopened: it pays its player as it goes.
                    Dropped::Chest { tier, level } => expired.push((drop.player, (tier, level), drop.at)),
                    Dropped::AmmoBox | Dropped::Crate => {}
                }
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
                    Dropped::Chest { .. } => false,
                };
            if taken {
                found.gear_changed = true;
                found.fighter = found.armed(found.fighter);
            } else {
                kept.push(drop);
            }
        }
        self.drops = kept;
        for (player, chest, at) in expired {
            self.pay_chest(player, chest, at, crate::public::Paid::Lapsed);
        }
    }

    /// Sends every Vestige still lying for a player to their mail and takes all their drops off the ground. Their host
    /// calls it as they leave, before it reads their character for its last save, so the save keeps the Vestiges.
    pub fn mail_lying(&mut self, player: PlayerId) {
        // A chest is never lost: opened for them first, whatever their host called before.
        self.open_chests_of(player);
        let Some(found) = self.players.get_mut(&player) else { return };
        let (theirs, others) = std::mem::take(&mut self.drops).into_iter().partition(|drop| drop.player == player);
        self.drops = others;
        for drop in theirs {
            found.gear_changed = true;
            if let Dropped::Vestige(vestige) = drop.what {
                found.character.post(Source::LeftBehind, Posted::Vestige(vestige));
            }
        }
    }

    /// Takes every drop off the ground, each Vestige still lying to its player's mail, as a wipe starts a run over.
    pub(crate) fn mail_all_lying(&mut self) {
        for drop in std::mem::take(&mut self.drops) {
            let Some(found) = self.players.get_mut(&drop.player) else { continue };
            found.gear_changed = true;
            if let Dropped::Vestige(vestige) = drop.what {
                found.character.post(Source::LeftLying, Posted::Vestige(vestige));
            }
        }
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

/// The way each of `count` drops thrown from `from` goes: in a fan toward `body`, `FAN_HALF` either side.
fn fan(from: [f64; 3], body: [f64; 2], count: usize) -> impl Iterator<Item = f64> {
    let toward = combat::sight::bearing([from[0], from[1]], body);
    (0..count).map(move |place| toward + ((place as f64 + 0.5) / count as f64 * 2.0 - 1.0) * FAN_HALF)
}

#[cfg(test)]
#[path = "drops_tests.rs"]
mod drops_tests;
