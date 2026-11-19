//! The social space's vendors: the Quartermaster sells armour and the Armsmith loadouts, two Melee to each Ranged, each
//! six pieces a day, three Rare and three Magic at the buyer's level, the same for everyone that day. Their wares are
//! paid in Aurem; Legendary and Atheric gear is never sold, only earned.

use crate::dice::Dice;
use crate::item::{Item, NAMED_LEVEL};
use crate::kinds::Slot;
use crate::rarity::Rarity;
use crate::vestige;

/// A vendor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Vendor {
    Quartermaster,
    Armsmith,
}

impl Vendor {
    pub const ALL: [Vendor; 2] = [Vendor::Quartermaster, Vendor::Armsmith];

    /// A vendor by its number on the wire: 0 the Quartermaster, 1 the Armsmith.
    #[must_use]
    pub fn from_number(number: u8) -> Option<Self> {
        Self::ALL.get(usize::from(number)).copied()
    }

    /// The slots its wares are for.
    fn slots(self) -> &'static [Slot] {
        match self {
            Vendor::Quartermaster => &[Slot::Head, Slot::Torso, Slot::Arms, Slot::Legs],
            Vendor::Armsmith => &[Slot::Melee, Slot::Melee, Slot::Ranged],
        }
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

/// A vendor's wares on a day, for a buyer of `level`: made at that level (at most 20), each by its own dice, so the
/// same day and level shows the same wares to everyone. Their numbers are none until bought.
#[must_use]
pub fn wares(vendor: Vendor, day: u64, level: u8) -> Vec<Item> {
    let slots = vendor.slots();
    (0..WARES)
        .filter_map(|ware| {
            let dice = Dice { seed: day.wrapping_mul(2).wrapping_add(vendor as u64), tick: ware as u64, player: 0 };
            let rarity = if ware < WARES / 2 { Rarity::Rare } else { Rarity::Magic };
            // The slots turn with the day, so each is sold at each rarity in its turn.
            let slot = slots[(ware + (day % slots.len() as u64) as usize) % slots.len()];
            vestige::make(0, rarity, slot, level.clamp(1, NAMED_LEVEL), &dice)
        })
        .collect()
}
