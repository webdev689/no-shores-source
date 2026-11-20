//! A ship's own power, apart from her captain's: her level, 1 to 20 from the experience she earns in sea fights and
//! 21 to 30 from the Prestige her four modules carry, as armour carries a player's; her Attack from her guns and her
//! Defense from her hull, sails and rigging, by the character's own sums and shares (`item.rs`, `power.rs`). Ship
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

/// A ship's power in one fight, as the sea's rules take it: her level, Attack and Defense.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ShipPower {
    pub level: u8,
    pub attack: u32,
    pub defense: u32,
}

impl ShipPower {
    /// What her balls' harm on a ship of this level is times: the player's own law for a blow on a foe.
    #[must_use]
    pub fn harm_dealt(self, foe_level: u8) -> f64 {
        power::by_player(self.attack, self.level, foe_level)
    }

    /// What the harm of a ship of this level's balls on her is times: the player's own law for a foe's blow.
    #[must_use]
    pub fn harm_taken(self, foe_level: u8) -> f64 {
        power::on_player(self.defense, self.level, foe_level)
    }
}

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

    /// The Prestige her modules carry.
    #[must_use]
    pub fn ship_prestige(&self) -> u32 {
        self.all_fitted().map(|(_, module)| module.prestige()).sum()
    }

    /// Her level, 1 to 30: her experience's to 20, then her modules' Prestige.
    #[must_use]
    pub fn ship_level(&self) -> u8 {
        power::level(self.ship_xp, self.ship_prestige())
    }

    /// How far she is to her next level, 0 to 1, and what it still takes: experience below level 20, Prestige past it;
    /// at the highest, full and nothing.
    #[must_use]
    pub fn ship_to_next(&self) -> (f64, u32) {
        power::to_next(self.ship_xp, self.ship_prestige())
    }

    /// Her Attack: her guns'.
    #[must_use]
    pub fn ship_attack(&self) -> u32 {
        self.fitted(Slot::Guns).and_then(Item::attack).unwrap_or(0)
    }

    /// Her Defense: her hull's, sails' and rigging's.
    #[must_use]
    pub fn ship_defense(&self) -> u32 {
        self.all_fitted().filter_map(|(_, module)| module.defense()).sum()
    }

    /// Her power as a fight takes it.
    #[must_use]
    pub fn ship_power(&self) -> ShipPower {
        ShipPower { level: self.ship_level(), attack: self.ship_attack(), defense: self.ship_defense() }
    }

    /// The traits her fitted modules give, each once.
    #[must_use]
    pub fn ship_traits(&self) -> Vec<&str> {
        let mut traits: Vec<&str> = self.all_fitted().flat_map(|(_, module)| module.active_traits()).collect();
        traits.sort_unstable();
        traits.dedup();
        traits
    }

    /// Whether her fitted modules give a trait.
    #[must_use]
    pub fn has_ship_trait(&self, id: &str) -> bool {
        self.all_fitted().any(|(_, module)| module.active_traits().any(|active| active == id))
    }

    /// Adds experience to her and to every module fitted, each to its last column's.
    pub fn earn_ship_xp(&mut self, xp: u32) {
        self.ship_xp = self.ship_xp.saturating_add(u64::from(xp));
        for (module, at) in self.items.values_mut() {
            if matches!(at, At::Worn(slot) if slot.ship()) {
                module.xp = module.xp.saturating_add(xp).min(module.xp_most());
            }
        }
    }

    /// Pays her for a ship she fought sinking or striking, as a kill pays a player: the foe's own XP at her level, more
    /// on a harder voyage; what she earned.
    pub fn reward_sinking(&mut self, foe: Foe, foe_level: u8, difficulty: Difficulty) -> u32 {
        let worth = crate::rewards::worth(foe).xp * (5 + u32::from(foe_level)) / 10;
        let xp = u32::try_from(libm::round(f64::from(worth) * difficulty.reward()) as u64).unwrap_or(u32::MAX);
        self.earn_ship_xp(xp);
        xp
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
