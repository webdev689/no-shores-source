//! A guild's outpost's room (`node-<site>--guild-<key>`): its members' asks of the outpost, which only the accounts can
//! answer. The room takes what an ask gives from the character (Aurem for the treasury, materials for a structure being
//! built) and holds the ask as an errand; its host takes each errand (`outpost_errands`), asks the accounts, and gives
//! the answer back (`outpost_answered`), when the room gives back what was not moved or used, gives what the stores
//! gave, and answers the player. The host stands the plot as blocks, and the room counts each plot it stood, which the
//! snapshot carries so the page reads the outpost again. The War Horn's foe is `outpost_boss.rs`'s.

use crate::asks::{STOCK_FULL, answer_code};
use crate::{PlayerId, Room};
use gear::Refusal;
use gear::character::{Materials, STOCK_MOST};
use gear::ship::materials::ShipMaterial;
use std::collections::BTreeMap;

/// An ask's answer while its errand is with the accounts: the player is answered once they answer.
pub const PENDING: u8 = u8::MAX;
/// How often a room reads its plot again on its players' word, ticks: once a second.
const CHANGED_EVERY_TICKS: u64 = 60;

/// What a player asks at their guild's outpost, as the page sends it: Aurem put into the treasury; a material
/// delivered to a structure being built, `slot` the material (0 Timber, 1 Canvas, 2 Iron, 3 Heartwood, 4 the island's
/// own resource); a material taken from the stores; the War Horn sounded; and the plot changed, to read it again.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OutpostAsk {
    Deposit { count: u32 },
    Deliver { structure: u32, slot: u8, count: u32 },
    Take { slot: u8, count: u32 },
    Horn,
    Changed,
}

/// A material an outpost takes: one of the ship's, or the island's own resource by its place in the catalogue.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Material {
    Ship(ShipMaterial),
    Island(usize),
}

impl Material {
    /// Its name as the accounts know it (`outpostLaw.ts` `Stuff`).
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Ship(ShipMaterial::Timber) => "timber",
            Self::Ship(ShipMaterial::Canvas) => "canvas",
            Self::Ship(ShipMaterial::Iron) => "iron",
            Self::Ship(ShipMaterial::Heartwood) => "heartwood",
            Self::Island(_) => "island",
        }
    }
}

/// What an errand asks of the accounts: Aurem to deposit, materials to deliver to a structure, materials to take from
/// the stores, the horn to sound, or the plot to be read again (which waits on no answer).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum What {
    Deposit(u32),
    Deliver { structure: u32, stuff: Material, amount: u32 },
    Take { stuff: Material, amount: u32 },
    Horn,
    Changed,
}

/// An errand the host runs for a player: its number in this room, the player and their account, and what it asks.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Errand {
    pub id: u32,
    pub player: PlayerId,
    pub account: String,
    pub what: What,
}

/// A guild's outpost as its room holds it: the guild's key, its muster ground, how many plots the host has stood, the
/// errands not yet taken and those with the accounts, when its plot was last read again on a player's word, and the
/// War Horn's foe.
#[derive(Debug, Default)]
pub(crate) struct Outpost {
    pub key: String,
    pub muster: [f64; 2],
    pub plot: u32,
    next: u32,
    waiting: Vec<Errand>,
    out: BTreeMap<u32, Errand>,
    changed_at: Option<u64>,
    pub boss: crate::outpost_boss::HornFoe,
}

/// A guild's id's short key, as its outposts' rooms are named: its first eight hexadecimal digits.
#[must_use]
pub fn guild_key(guild: &str) -> String {
    guild.chars().filter(|each| *each != '-').take(8).collect::<String>().to_lowercase()
}

/// How much of a material is held, to take from or give to.
fn held_mut(materials: &mut Materials, stuff: Material) -> &mut u16 {
    match stuff {
        Material::Ship(ShipMaterial::Timber) => &mut materials.ship.timber,
        Material::Ship(ShipMaterial::Canvas) => &mut materials.ship.canvas,
        Material::Ship(ShipMaterial::Iron) => &mut materials.ship.iron,
        Material::Ship(ShipMaterial::Heartwood) => &mut materials.ship.heartwood,
        Material::Island(index) => {
            if materials.resources.len() <= index {
                materials.resources.resize(index + 1, 0);
            }
            &mut materials.resources[index]
        }
    }
}

/// Gives some of a material back, up to its most.
fn give(materials: &mut Materials, stuff: Material, amount: u32) {
    let held = held_mut(materials, stuff);
    *held = u16::try_from(u32::from(*held).saturating_add(amount).min(u32::from(STOCK_MOST))).unwrap_or(STOCK_MOST);
}

impl Room {
    /// Makes this node's room a guild's outpost: the guild's key, and the middle of the site's muster ground.
    pub fn open_outpost(&mut self, key: &str, muster: [f64; 2]) {
        self.outpost = Some(Box::new(Outpost { key: key.to_owned(), muster, ..Outpost::default() }));
    }

    /// How many plots the host has stood here, which the snapshot carries; 0 in any other room.
    #[must_use]
    pub fn outpost_plot(&self) -> u32 {
        self.outpost.as_ref().map_or(0, |outpost| outpost.plot)
    }

    /// The host stood the plot anew.
    pub fn outpost_stood(&mut self) {
        if let Some(outpost) = self.outpost.as_mut() {
            outpost.plot = outpost.plot.wrapping_add(1).max(1);
        }
    }

    /// The account of a player in this outpost's guild, kept; none for anyone else, or in a room that is no outpost.
    fn outpost_member(&self, player: PlayerId) -> Option<String> {
        let key = &self.outpost.as_ref()?.key;
        let guild = self.guilds.of(player)?;
        (guild_key(&guild.id) == *key).then(|| self.players.get(&player)?.owner.clone())?
    }

    /// A material by its slot on the wire: the ship's four, then the island's own resource.
    fn material_of(&self, slot: u8) -> Option<Material> {
        if let Some(ship) = ShipMaterial::ALL.get(usize::from(slot)) {
            return Some(Material::Ship(*ship));
        }
        let island = self.island?;
        let resource = gear::catalogue::catalogue().resources.iter().position(|found| found.continent == island);
        resource.filter(|_| slot == 4).map(Material::Island)
    }

    /// A player's ask at an outpost: refused off their guild's outpost; otherwise what it gives is taken from them and
    /// its errand held for the host, answered once the accounts answer (`PENDING`).
    pub(crate) fn ask_outpost(&mut self, player: PlayerId, ask: OutpostAsk) -> u8 {
        let Some(account) = self.outpost_member(player) else { return answer_code(Err(Refusal::NotAtOutpost)) };
        let clock = self.clock;
        let stuff = match ask {
            OutpostAsk::Deliver { slot, .. } | OutpostAsk::Take { slot, .. } => self.material_of(slot),
            _ => None,
        };
        let horn_up = self.horn_foe_up();
        let (Some(outpost), Some(found)) = (self.outpost.as_mut(), self.players.get_mut(&player)) else { return 0 };
        let materials = &mut found.character.materials;
        let what = match (ask, stuff) {
            (OutpostAsk::Deposit { count }, _) => {
                let amount = count.min(materials.aurem);
                if amount == 0 {
                    return answer_code(Err(Refusal::Short));
                }
                materials.aurem -= amount;
                What::Deposit(amount)
            }
            (OutpostAsk::Deliver { structure, count, .. }, Some(stuff)) => {
                let held = held_mut(materials, stuff);
                let amount = count.min(u32::from(*held));
                if amount == 0 {
                    return answer_code(Err(Refusal::Short));
                }
                *held -= u16::try_from(amount).unwrap_or(0);
                What::Deliver { structure, stuff, amount }
            }
            (OutpostAsk::Take { count, .. }, Some(stuff)) => {
                // Asked only for what the player has room for, so nothing the stores give is lost.
                let room_for = u32::from(STOCK_MOST.saturating_sub(*held_mut(materials, stuff)));
                if room_for == 0 {
                    return STOCK_FULL;
                }
                What::Take { stuff, amount: count.min(room_for) }
            }
            (OutpostAsk::Horn, _) if horn_up => return answer_code(Err(Refusal::HornFoeStands)),
            (OutpostAsk::Horn, _) => What::Horn,
            (OutpostAsk::Changed, _) => {
                if outpost.changed_at.is_some_and(|at| clock < at + CHANGED_EVERY_TICKS) {
                    return 0;
                }
                outpost.changed_at = Some(clock);
                What::Changed
            }
            (OutpostAsk::Deliver { .. } | OutpostAsk::Take { .. }, None) => {
                return answer_code(Err(Refusal::NothingNeeds));
            }
        };
        outpost.next = outpost.next.wrapping_add(1);
        outpost.waiting.push(Errand { id: outpost.next, player, account, what });
        if what == What::Changed { 0 } else { PENDING }
    }

    /// The errands held for the host since it last took them; each but a plot to read again waits on its answer.
    pub fn outpost_errands(&mut self) -> Vec<Errand> {
        let Some(outpost) = self.outpost.as_mut() else { return Vec::new() };
        let taken = std::mem::take(&mut outpost.waiting);
        for errand in taken.iter().filter(|errand| errand.what != What::Changed) {
            outpost.out.insert(errand.id, errand.clone());
        }
        taken
    }

    /// The accounts' answer to an errand: how many they moved, used or gave, or the horn's tier; none when they could
    /// not be reached, when the errand is given back whole. The room gives back what was not moved or used, gives what
    /// was given, and answers the player. False for no such errand.
    pub fn outpost_answered(&mut self, id: u32, answer: Option<u32>) -> bool {
        let Some(errand) = self.outpost.as_mut().and_then(|outpost| outpost.out.remove(&id)) else { return false };
        let refused = |refusal: Refusal| answer_code(Err(refusal));
        let mut tier = 0;
        let Some(found) = self.players.get_mut(&errand.player) else { return true };
        let materials = &mut found.character.materials;
        let code = match (errand.what, answer) {
            (What::Deposit(amount), answer) => {
                let moved = answer.unwrap_or(0).min(amount);
                materials.add_aurem(amount - moved);
                if answer.is_none() {
                    refused(Refusal::OutpostTrouble)
                } else if moved == 0 {
                    refused(Refusal::TreasuryFull)
                } else {
                    0
                }
            }
            (What::Deliver { stuff, amount, .. }, answer) => {
                let used = answer.unwrap_or(0).min(amount);
                give(materials, stuff, amount - used);
                if answer.is_none() {
                    refused(Refusal::OutpostTrouble)
                } else if used == 0 {
                    refused(Refusal::NothingNeeds)
                } else {
                    0
                }
            }
            (What::Take { stuff, amount }, answer) => {
                let given = answer.unwrap_or(0).min(amount);
                give(materials, stuff, given);
                if answer.is_none() {
                    refused(Refusal::OutpostTrouble)
                } else if given == 0 {
                    refused(Refusal::StoresEmpty)
                } else {
                    0
                }
            }
            (What::Horn, None) => refused(Refusal::OutpostTrouble),
            (What::Horn, Some(0)) => refused(Refusal::HornSounded),
            (What::Horn, Some(sounded)) => {
                tier = sounded;
                0
            }
            (What::Changed, _) => 0,
        };
        found.answer = code;
        found.answered = found.answered.wrapping_add(1);
        found.gear_changed = true;
        if tier > 0 {
            self.horn_sounded(tier);
        }
        true
    }
}

#[cfg(test)]
#[path = "outpost_tests.rs"]
mod tests;
