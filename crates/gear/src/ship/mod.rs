//! A ship's own power, apart from its captain's: its level, 1 to 20 from the experience it earns in sea fights and
//! 21 to 30 from the Prestige its four modules carry, as armour carries a player's; its Attack from its guns and its
//! Defense from its hull, sails and rigging, by the character's own sums and shares (`item.rs`, `power.rs`). Ship
//! power decides every fight of ship against ship; character power everything on foot, and the two are never summed.

pub mod found;
pub mod infuse;
pub mod materials;
pub mod trim;

#[cfg(test)]
mod ship_tests;

use crate::character::{At, Character};
use crate::item::Item;
use crate::kinds::{Kind, Slot};
use crate::power;
use crate::rarity::Rarity;
use crate::rewards::Foe;
use crate::world::Difficulty;

/// A ship's power in one fight, as the sea's rules take it: its level, Attack and Defense.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ShipPower {
    pub level: u8,
    pub attack: u32,
    pub defense: u32,
}

impl ShipPower {
    /// A plain ship's at `level`: its four Normal modules of that level, as a test bench fits one with no character.
    #[must_use]
    pub fn plain(level: u8) -> Self {
        let modules = || Kind::MODULES.iter().map(|kind| Item::new(0, *kind, Rarity::Normal, level, kind.slot()));
        let attack = modules().filter_map(|module| module.attack()).sum();
        let defense = modules().filter_map(|module| module.defense()).sum();
        ShipPower { level, attack, defense }
    }

    /// What its balls' harm on a ship of this level is times: the player's own law for a blow on a foe.
    #[must_use]
    pub fn harm_dealt(self, foe_level: u8) -> f64 {
        power::by_player(self.attack, self.level, foe_level)
    }

    /// What the harm of a ship of this level's balls on it is times: the player's own law for a foe's blow.
    #[must_use]
    pub fn harm_taken(self, foe_level: u8) -> f64 {
        power::on_player(self.defense, self.level, foe_level)
    }
}

/// How many land kills of its rank a sinking pays as. A sea fight runs three and a half to four and a half minutes
/// from 700 m (`measure_fights_by_rank`) and a ship is sighted every four to six, against some 25 s a kill on foot;
/// twenty-one puts an hour at sea inside the band beside a patrol zone's, its kills and its events' chests together
/// (`band`): a little under in the first waters and over in the last, whose fights are hardest.
pub const SINKING_KILLS: u32 = 21;

impl Character {
    /// The module fitted in one of the ship's slots.
    #[must_use]
    pub fn fitted(&self, slot: Slot) -> Option<&Item> {
        slot.ship().then(|| self.worn(slot)).flatten()
    }

    /// Every module fitted, slot by slot.
    pub fn all_fitted(&self) -> impl Iterator<Item = (Slot, &Item)> {
        self.all_worn().filter(|(slot, _)| slot.ship())
    }

    /// The Prestige its modules carry.
    #[must_use]
    pub fn ship_prestige(&self) -> u32 {
        self.all_fitted().map(|(_, module)| module.prestige()).sum()
    }

    /// Its level, 1 to 30: its experience's to 20, then its modules' Prestige.
    #[must_use]
    pub fn ship_level(&self) -> u8 {
        power::level(self.ship_xp, self.ship_prestige())
    }

    /// How far it is to its next level, 0 to 1, and what it still takes: experience below level 20, Prestige past it;
    /// at the highest, full and nothing.
    #[must_use]
    pub fn ship_to_next(&self) -> (f64, u32) {
        power::to_next(self.ship_xp, self.ship_prestige())
    }

    /// Its Attack: its guns'.
    #[must_use]
    pub fn ship_attack(&self) -> u32 {
        self.fitted(Slot::Guns).and_then(Item::attack).unwrap_or(0)
    }

    /// Its Defense: its hull's, sails' and rigging's.
    #[must_use]
    pub fn ship_defense(&self) -> u32 {
        self.all_fitted().filter_map(|(_, module)| module.defense()).sum()
    }

    /// Its power as a fight takes it.
    #[must_use]
    pub fn ship_power(&self) -> ShipPower {
        ShipPower { level: self.ship_level(), attack: self.ship_attack(), defense: self.ship_defense() }
    }

    /// The traits its fitted modules give, each once.
    #[must_use]
    pub fn ship_traits(&self) -> Vec<&str> {
        let mut traits: Vec<&str> = self.all_fitted().flat_map(|(_, module)| module.active_traits()).collect();
        traits.sort_unstable();
        traits.dedup();
        traits
    }

    /// Adds experience to it and to every module fitted, each to its last column's.
    pub fn earn_ship_xp(&mut self, xp: u32) {
        self.ship_xp = self.ship_xp.saturating_add(u64::from(xp));
        for (module, at) in self.items.values_mut() {
            if matches!(at, At::Worn(slot) if slot.ship()) {
                module.xp = module.xp.saturating_add(xp).min(module.xp_most());
            }
        }
    }

    /// Pays a ship of a rank (1 Minor to 5 Boss) its player fought sinking or striking: `SINKING_KILLS` land kills of
    /// the foe its rank fights as, at its level and more on a harder voyage, in XP to the ship and its modules and, as
    /// a kill pays them, in XP and Aurem to the player, their worn Art and their faction; what the ship earned. A ship
    /// whose guns could do it no harm (four levels or more below it) earns nothing from it, as a player's blows on a
    /// foe so far above share no kill.
    pub fn reward_sinking(&mut self, foe: Foe, rank: u8, foe_level: u8, difficulty: Difficulty) -> u32 {
        if self.ship_power().harm_dealt(foe_level) <= 0.0 {
            return 0;
        }
        let worth = crate::rewards::worth(foe, rank);
        let paid = self.pay((worth.xp * SINKING_KILLS, worth.aurem * SINKING_KILLS), foe_level, None, difficulty);
        self.earn_ship_xp(paid.xp);
        paid.xp
    }

    /// Fits a ship that has never been fitted with the plain modules every ship is built with: level 1 and Normal, as
    /// a new player's gear is. A ship once fitted is left as it is, though its modules are taken off or dismantled.
    pub(crate) fn fit_first_modules(&mut self) {
        if self.ship_fitted {
            return;
        }
        for kind in Kind::MODULES {
            let id = self.take_id();
            let slot = kind.slot();
            self.items.insert(id, (Item::new(id, kind, Rarity::Normal, 1, slot), At::Worn(slot)));
        }
        self.ship_fitted = true;
    }
}
