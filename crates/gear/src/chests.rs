//! A public event's chest, opened by the player it was left for: XP, which grows the worn Art and the faction pledged
//! as a kill's does; Aurem, Fragments and the island's resource, more with each tier; Essence from the day's first
//! heroic chest alone; and a Vestige always, the better colours likelier with each tier, a
//! Normal one coming as its item.

use crate::character::{Character, Stuff, Vestige};
use crate::dice::Dice;
use crate::kinds::Stock;
use crate::vestige;
use crate::world::Difficulty;

/// What a chest of each tier (1 won, 2 won with the bonus, 3 heroic, 4 heroic with the bonus) holds: XP and Aurem at
/// level 5, growing with the level as a kill's worth does; each Fragment and the island's resource as they stand, at
/// any level.
pub const CHEST_XP: [u32; 4] = [1_500, 2_200, 3_200, 4_500];
pub const CHEST_AUREM: [u32; 4] = [120, 180, 260, 360];
pub const CHEST_FRAGMENTS: [u16; 4] = [2, 3, 5, 7];
pub const CHEST_RESOURCE: [u16; 4] = [3, 4, 6, 8];
/// The Essence of each stock a player's first heroic chest of a day holds, as Destiny 1's first gold public event of
/// the day sent an Ascendant material: one, at any level, and none from a later heroic chest that day, so an event
/// far below a player is no well of Essence.
pub const FIRST_HEROIC_ESSENCE: u16 = 1;
/// The first heroic tier.
const HEROIC: u8 = 3;

/// What one chest gave its player.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Chest {
    pub xp: u32,
    pub aurem: u32,
    /// Its Vestige, numbered here and returned to be carried, or laid on the ground when the player's ten are full;
    /// none when it rolled Normal, whose item is kept as a found item is (`Character::unsealed`).
    pub vestige: Option<Vestige>,
}

/// A chest's Vestige: a foe's colours (a Major's, the rank a role's numbers are given at) from a plain chest, a Boss's
/// from a heroic one; the bonus's tier rolls twice and keeps the better.
fn chest_vestige(tier: u8, level: u8, dice: &Dice) -> Option<(crate::Rarity, crate::Slot, u8)> {
    let rank = if tier >= 3 { 5 } else { 2 };
    let first = vestige::of_colours(vestige::colours(rank), level, dice);
    if tier % 2 == 1 {
        return Some(first);
    }
    let again = Dice { tick: dice.tick ^ 0x0063_6865_7374, ..*dice };
    let second = vestige::of_colours(vestige::colours(rank), level, &again);
    Some(if second.0 > first.0 { second } else { first })
}

impl Character {
    /// Opens a chest of `tier` (1 to 4) from an event at `level` on a voyage of `difficulty`, in a zone of island
    /// `resource` (its place in the catalogue's list, if any); none for a tier there is no chest of. A harder voyage
    /// pays more XP and Aurem, as a kill's does.
    pub fn open_chest(
        &mut self,
        tier: u8,
        (level, difficulty, day): (u8, Difficulty, u64),
        resource: Option<usize>,
        dice: &Dice,
    ) -> Option<Chest> {
        let at = usize::from(tier).checked_sub(1).filter(|at| *at < CHEST_XP.len())?;
        let first_heroic = tier >= HEROIC && !std::mem::replace(&mut self.activity.today(day).heroic_chest, true);
        let grown = |amount: u32| {
            let raised = libm::round(f64::from(amount * (5 + u32::from(level)) / 10) * difficulty.reward());
            u32::try_from(raised as u64).unwrap_or(u32::MAX)
        };
        let (xp, aurem) = (grown(CHEST_XP[at]), grown(CHEST_AUREM[at]));
        self.earn_play_xp(xp, None);
        self.materials.add_aurem(aurem);
        for stock in [Stock::Weapon, Stock::Armor] {
            self.materials.add(Stuff::Fragments(stock), CHEST_FRAGMENTS[at]);
            if first_heroic {
                self.materials.add(Stuff::Essence(stock), FIRST_HEROIC_ESSENCE);
            }
        }
        if let Some(resource) = resource {
            self.materials.add(Stuff::Resource(resource), CHEST_RESOURCE[at]);
        }
        let rolled = chest_vestige(tier, level, dice)?;
        Some(Chest { xp, aurem, vestige: self.unsealed(rolled, crate::Source::World, dice) })
    }
}

#[cfg(test)]
#[path = "chests_tests.rs"]
mod chests_tests;
