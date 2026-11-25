//! A guild's outpost's room (`node-<site>--guild-<key>`): its members' asks of the outpost, which only the accounts can
//! answer. The room takes what an ask gives from the character (Aurem for the treasury, materials for a structure being
//! built) and holds the ask as an errand; its host takes each errand (`outpost_errands`), asks the accounts, and gives
//! the answer back (`outpost_answered`), when the room gives back what was not moved or used, gives what the stores
//! gave, and answers the player. An errand that takes or gives is carried by the character until it is answered
//! (`gear::errand`), so a room that holds the character later settles it should this one not. The host stands the
//! plot as blocks, and the room counts each plot it stood, which the snapshot carries so the page reads the outpost
//! again. The War Horn's foe is `outpost_boss.rs`'s.

use crate::asks::{STOCK_FULL, answer_code};
use crate::{PlayerId, Room};
use gear::Refusal;
use gear::character::STOCK_MOST;
use gear::errand::{Carried, held_mut, settle};
pub use gear::errand::{Material, What};
use gear::ship::materials::ShipMaterial;
use std::collections::BTreeSet;

/// An ask's answer while its errand is with the accounts: the player is answered once they answer.
pub const PENDING: u8 = u8::MAX;
/// How often a room reads its plot again on its players' word, ticks: once a second, a word sooner read once it has.
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

/// An errand the host runs for a player: its number in this room, the accounts' id for it, the player and their
/// account, and what it asks.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Errand {
    pub id: u32,
    pub rid: String,
    pub player: PlayerId,
    pub account: String,
    pub what: What,
}

/// A guild's outpost as its room holds it: the guild's key, its muster ground, how many plots the host has stood, what
/// begins the accounts' id of each of its errands, the errands not yet taken and those with the accounts, when its plot
/// was last read again on a player's word and who asked again since, the players leaving while their errands settle,
/// and the War Horn's foe; and the foot of its Delve Gate's steps and the way out from it, where one stands.
#[derive(Debug, Default)]
pub(crate) struct Outpost {
    pub key: String,
    pub muster: [f64; 2],
    pub plot: u32,
    pub gate: Option<([f64; 2], f64)>,
    ids: String,
    next: u32,
    waiting: Vec<Errand>,
    out: std::collections::BTreeMap<u32, Errand>,
    changed_at: Option<u64>,
    changed_late: Option<(PlayerId, String)>,
    parting: BTreeSet<PlayerId>,
    pub boss: crate::outpost_boss::HornFoe,
}

/// A guild's id's key, as its outposts' rooms are named (`outpostStores.ts` `guildKey`): its whole id without its
/// hyphens, in lowercase.
#[must_use]
pub fn guild_key(guild: &str) -> String {
    guild.chars().filter(|each| *each != '-').collect::<String>().to_lowercase()
}

impl Room {
    /// Makes this node's room a guild's outpost: the guild's key, the middle of the site's muster ground, and what
    /// begins the accounts' id of each errand, the room's own (its name, and something new each time it opens).
    pub fn open_outpost(&mut self, key: &str, muster: [f64; 2], ids: &str) {
        let ids = ids.to_owned();
        self.outpost = Some(Box::new(Outpost { key: key.to_owned(), muster, ids, ..Outpost::default() }));
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

    /// The host stood the plot's Delve Gate: the foot of its steps and the way out from it, or none where it is gone.
    pub fn outpost_gate(&mut self, gate: Option<([f64; 2], f64)>) {
        if let Some(outpost) = self.outpost.as_mut() {
            outpost.gate = gate;
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

    /// A player's ask at an outpost: refused off their guild's outpost, and while their last is not yet answered (here,
    /// or carried in from another room); otherwise what it gives is taken from them and its errand held for the host,
    /// answered once the accounts answer (`PENDING`), and carried by their character until it is.
    pub(crate) fn ask_outpost(&mut self, player: PlayerId, ask: OutpostAsk) -> u8 {
        let Some(account) = self.outpost_member(player) else { return answer_code(Err(Refusal::NotAtOutpost)) };
        let clock = self.clock;
        let stuff = match ask {
            OutpostAsk::Deliver { slot, .. } | OutpostAsk::Take { slot, .. } => self.material_of(slot),
            _ => None,
        };
        let horn_up = self.horn_foe_up();
        let (Some(outpost), Some(found)) = (self.outpost.as_mut(), self.players.get_mut(&player)) else { return 0 };
        let mut held = outpost.waiting.iter().chain(outpost.out.values());
        let carried = found.character.errand.is_some();
        if ask != OutpostAsk::Changed
            && (carried || held.any(|errand| errand.account == account && errand.what != What::Changed))
        {
            return answer_code(Err(Refusal::AskInFlight));
        }
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
            (OutpostAsk::Take { count: 0, .. }, _) => return answer_code(Err(Refusal::Short)),
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
                    outpost.changed_late = Some((player, account));
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
        let rid = format!("{}:{player}:{}", outpost.ids, outpost.next);
        if matches!(what, What::Deposit(_) | What::Deliver { .. } | What::Take { .. }) {
            found.character.errand = Some(Carried { rid: rid.clone(), what, answer: None });
            found.gear_changed = true;
        }
        outpost.waiting.push(Errand { id: outpost.next, rid, player, account, what });
        if what == What::Changed { 0 } else { PENDING }
    }

    /// The errands held for the host since it last took them; each but a plot to read again waits on its answer. A
    /// plot asked to be read again too soon after the last is held for the host once the second has passed.
    pub fn outpost_errands(&mut self) -> Vec<Errand> {
        let clock = self.clock;
        let Some(outpost) = self.outpost.as_mut() else { return Vec::new() };
        let due = outpost.changed_at.is_none_or(|at| clock >= at + CHANGED_EVERY_TICKS);
        if due && let Some((player, account)) = outpost.changed_late.take() {
            outpost.changed_at = Some(clock);
            outpost.next = outpost.next.wrapping_add(1);
            let rid = format!("{}:{player}:{}", outpost.ids, outpost.next);
            outpost.waiting.push(Errand { id: outpost.next, rid, player, account, what: What::Changed });
        }
        let taken = std::mem::take(&mut outpost.waiting);
        for errand in taken.iter().filter(|errand| errand.what != What::Changed) {
            outpost.out.insert(errand.id, errand.clone());
        }
        taken
    }

    /// The accounts' answer to an errand: how many they moved, used or gave, or the horn's tier (0 sounded this week,
    /// -1 not by this player, -2 no horn stands, -3 past the accounts' limit on asks); none when they could not be
    /// reached, when the errand is given back whole. The room gives back what was not moved or used, gives what was
    /// given, and answers the player, if their character still carries the errand: one who left, or whose character a
    /// room holding it since settled it, is given nothing here. False for no such errand.
    pub fn outpost_answered(&mut self, id: u32, answer: Option<i64>) -> bool {
        let Some(outpost) = self.outpost.as_mut() else { return false };
        let Some(errand) = outpost.out.remove(&id) else { return false };
        let tier = answer.and_then(|tier| u32::try_from(tier).ok()).filter(|tier| *tier > 0);
        if let (What::Horn, Some(tier)) = (errand.what, tier) {
            self.horn_sounded(tier);
        }
        // One account is one player here: one who left and joined again is answered as themselves.
        let mut players = self.players.values_mut();
        let Some(found) = players.find(|found| found.owner.as_ref() == Some(&errand.account)) else { return true };
        let carried = found.character.errand.as_ref().is_some_and(|carried| carried.rid == errand.rid);
        if errand.what != What::Horn && !carried {
            return true;
        }
        // A Horn is never carried: what the character carries then is another errand, still to be answered.
        if carried {
            found.character.errand = None;
        }
        found.answer =
            settle(&mut found.character.materials, errand.what, answer).map_or(0, |none| answer_code(Err(none)));
        found.answered = found.answered.wrapping_add(1);
        found.gear_changed = true;
        true
    }

    /// A player leaving this room while their errands settle (`outpostHost.ts` `settled`): the same account joining
    /// again meanwhile takes their account over (`Room::own`), so each answer goes to the player it is now. False in a
    /// room that is no outpost.
    pub fn outpost_parting(&mut self, player: PlayerId) -> bool {
        let present: Vec<PlayerId> = self.players.keys().copied().collect();
        let Some(outpost) = self.outpost.as_mut() else { return false };
        outpost.parting.retain(|kept| present.contains(kept));
        outpost.parting.insert(player);
        true
    }

    /// Whether another player in the room holds `owner`'s account; one leaving an outpost's room gives it up to
    /// `player` instead.
    pub(crate) fn owned_elsewhere(&mut self, player: PlayerId, owner: &str) -> bool {
        let parting = self.outpost.as_ref().map(|outpost| outpost.parting.clone()).unwrap_or_default();
        let holders: Vec<_> = (self.players.iter_mut())
            .filter(|(id, found)| **id != player && found.owner.as_deref() == Some(owner))
            .collect();
        if holders.iter().any(|(id, _)| !parting.contains(*id)) {
            return true;
        }
        for (_, found) in holders {
            found.owner = None;
        }
        false
    }
}

#[cfg(test)]
#[path = "outpost_tests.rs"]
mod tests;
