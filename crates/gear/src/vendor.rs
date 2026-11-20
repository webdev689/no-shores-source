//! The social space's vendors: the Armorsmith sells armour, the Weaponsmith loadouts, two Melee to each Ranged, and the
//! Shipwright a ship's modules, each six pieces a day, three Rare and three Magic at the buyer's level (the
//! Shipwright's at their ship's), the same for everyone that day. Their wares are paid in Aurem; Legendary and
//! Atheric gear is never sold for Aurem, only earned, or had from Shape (`shape.rs`).

use crate::dice::Dice;
use crate::item::{Item, NAMED_LEVEL};
use crate::kinds::Slot;
use crate::rarity::Rarity;
use crate::vestige;

/// A vendor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Vendor {
    Armorsmith,
    Weaponsmith,
    Shipwright,
}

impl Vendor {
    pub const ALL: [Vendor; 3] = [Vendor::Armorsmith, Vendor::Weaponsmith, Vendor::Shipwright];

    /// A vendor by its number on the wire: 0 the Armorsmith, 1 the Weaponsmith, 2 the Shipwright.
    #[must_use]
    pub fn from_number(number: u8) -> Option<Self> {
        Self::ALL.get(usize::from(number)).copied()
    }

    /// The slots its wares are for.
    fn slots(self) -> &'static [Slot] {
        match self {
            Vendor::Armorsmith => &[Slot::Head, Slot::Torso, Slot::Arms, Slot::Legs],
            Vendor::Weaponsmith => &[Slot::Melee, Slot::Melee, Slot::Ranged],
            Vendor::Shipwright => &Slot::SHIP,
        }
    }

    /// Whether its wares are made at the buyer's ship's level rather than their own.
    #[must_use]
    pub fn for_ship(self) -> bool {
        self == Vendor::Shipwright
    }
}

/// How many wares a vendor shows a day: the first half Rare, the rest Magic.
pub const WARES: usize = 6;

/// What a piece costs, in Aurem.
#[must_use]
pub fn price(rarity: Rarity) -> u32 {
    match rarity {
        Rarity::Rare => 2_000,
        Rarity::Magic => 600,
        _ => 200,
    }
}

/// A vendor's dice seed on a day: every vendor's apart from every other's on every day.
fn seed(vendor: Vendor, day: u64) -> u64 {
    day.wrapping_mul(Vendor::ALL.len() as u64).wrapping_add(vendor as u64)
}

/// A vendor's wares on a day, for a buyer of `level`: made at that level (at most 20), each by its own dice, so the
/// same day and level shows the same wares to everyone. Their numbers are none until bought.
#[must_use]
pub fn wares(vendor: Vendor, day: u64, level: u8) -> Vec<Item> {
    let slots = vendor.slots();
    (0..WARES)
        .filter_map(|ware| {
            let dice = Dice { seed: seed(vendor, day), tick: ware as u64, player: 0 };
            let rarity = if ware < WARES / 2 { Rarity::Rare } else { Rarity::Magic };
            // The slots turn with the day, so each is sold at each rarity in its turn.
            let slot = slots[(ware + (day % slots.len() as u64) as usize) % slots.len()];
            vestige::make(0, rarity, slot, level.clamp(1, NAMED_LEVEL), &dice)
        })
        .collect()
}

#[cfg(test)]
mod seed_tests {
    use super::{Vendor, seed};
    use std::collections::BTreeSet;

    #[test]
    fn no_two_vendors_ever_roll_from_one_seed_on_any_two_days() {
        let mut seen = BTreeSet::new();
        for day in 0..1000 {
            for vendor in Vendor::ALL {
                assert!(seen.insert(seed(vendor, day)), "{vendor:?} on day {day} shares a seed");
            }
        }
    }
}
