//! An errand a guild's outpost runs with the accounts for a player, and the one their character carries while it is
//! unanswered. The outpost's room takes what an errand gives (Aurem for the treasury, materials for a structure being
//! built) and writes the errand into the character under the accounts' id for it, so it is saved with what it took.
//! Whichever room answers it while it holds the character settles it: the outpost's room when the accounts answer, or
//! a room that holds the character later, which asks the accounts again under its id (they answer as they did) and
//! writes the answer in before the character is read (`Character::from_json`). Settled, it is carried no more, so a
//! give-back lands once whatever room the character goes to.

use crate::asks::Refusal;
use crate::character::{Character, Materials, STOCK_MOST};
use crate::ship::materials::ShipMaterial;
use serde::{Deserialize, Serialize};

/// What the accounts answer a delivery, a take or the horn past the account's limit on outpost asks.
pub const LIMITED: i64 = -3;

/// A material an outpost takes: one of the ship's, or the island's own resource by its place in the catalogue.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
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
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum What {
    Deposit(u32),
    Deliver { structure: u32, stuff: Material, amount: u32 },
    Take { stuff: Material, amount: u32 },
    Horn,
    Changed,
}

/// The errand a character carries: the accounts' id for it, what it asks, and their answer once a room that holds the
/// character anew has asked again and written it in.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Carried {
    pub rid: String,
    pub what: What,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub answer: Option<i64>,
}

/// How much of a material is held, to take from or give to.
pub fn held_mut(materials: &mut Materials, stuff: Material) -> &mut u16 {
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

/// Gives back what an answered errand did not move or use and gives what it was given; why the player is told it did
/// nothing, or none when it did. No answer (the accounts were not asked) gives back all it took.
pub fn settle(materials: &mut Materials, what: What, answer: Option<i64>) -> Option<Refusal> {
    let count = |most: u32| answer.map_or(0, |count| u32::try_from(count).unwrap_or(0).min(most));
    let (done, none) = match what {
        What::Deposit(amount) => {
            materials.add_aurem(amount - count(amount));
            (count(amount), Refusal::TreasuryFull)
        }
        What::Deliver { stuff, amount, .. } => {
            give(materials, stuff, amount - count(amount));
            (count(amount), Refusal::NothingNeeds)
        }
        What::Take { stuff, amount } => {
            give(materials, stuff, count(amount));
            (count(amount), Refusal::StoresEmpty)
        }
        What::Horn => match answer {
            Some(-1) => (0, Refusal::HornNotLeader),
            Some(tier) if tier < 0 => (0, Refusal::NoHorn),
            Some(tier) => (u32::try_from(tier).unwrap_or(0), Refusal::HornSounded),
            None => (0, Refusal::OutpostTrouble),
        },
        What::Changed => return None,
    };
    match answer {
        None => Some(Refusal::OutpostTrouble),
        Some(LIMITED) => Some(Refusal::TooManyAsks),
        Some(_) if done == 0 => Some(none),
        Some(_) => None,
    }
}

impl Character {
    /// Settles the errand it carries once its answer is written in, and carries it no more; one unanswered is kept.
    pub fn settle_carried(&mut self) {
        if let Some(carried) = self.errand.take_if(|carried| carried.answer.is_some()) {
            settle(&mut self.materials, carried.what, carried.answer);
        }
    }
}

#[cfg(test)]
#[path = "errand_tests.rs"]
mod tests;
