//! The test character: who every developer plays in a test room (`room`'s test rooms), made as they join and kept
//! nowhere. Max gear, as the rules have it: level 30, Prestige 120 from the four Hard Breach armour pieces with every
//! node bought, a Forged weapon at the most Attack in each weapon slot with its perks, every Art mastered.

use crate::breach::{DROWNED_VALE, Tier, record_key};
use crate::character::{At, Character};
use crate::dice::Dice;
use crate::item::Item;
use crate::kinds::Slot;
use crate::rarity::Rarity;
use crate::source::Source;

impl Character {
    /// The test character: the Test Ground's (every Art mastered, the first ship given, the quests kept), with XP for
    /// level 20, the prologue played and the Breach won at Normal, and in every weapon and armour slot a Hard Breach
    /// piece of level 20 with every node bought and the first perk chosen in each column that offers them.
    #[must_use]
    pub fn max_test() -> Self {
        let mut character = Self::test_grounds();
        character.items.clear();
        character.xp = crate::power::xp_for_level(crate::power::XP_LEVEL_MOST);
        character.story.prologue = true;
        character.story.breaches.insert(record_key(&DROWNED_VALE, Tier::Normal));
        let dice = Dice { seed: 0, tick: 0, player: 0 };
        for slot in [Slot::Melee, Slot::Ranged, Slot::Head, Slot::Torso, Slot::Arms, Slot::Legs] {
            let id = character.take_id();
            if let Some(item) = maxed(id, slot, &dice) {
                character.items.insert(id, (item, At::Worn(slot)));
            }
        }
        character.ammo = crate::ammo::AMMO_FULL;
        character
    }
}

/// A Hard Breach piece for a slot at its most: Legendary, level 20, a weapon Forged with its element, every node
/// bought, and the first of each perk column's chosen.
fn maxed(id: u32, slot: Slot, dice: &Dice) -> Option<Item> {
    let mut item = crate::vestige::make(id, Rarity::Legendary, slot, 20, Source::Breach, dice)?;
    item.hard = true;
    if item.kind.weapon() {
        item.element = crate::element::forged(item.kind, dice);
    }
    let columns = item.columns();
    item.xp = item.xp_most();
    item.bought = (0..columns.len())
        .flat_map(|column| (0..columns[column].nodes()).map(move |node| (column, node)))
        .filter_map(|(column, node)| item.node_bit(column, node))
        .fold(0, |all, bit| all | bit);
    item.chosen =
        (0..columns.len()).map(|column| if columns[column].traits() { 0 } else { crate::item::NONE_CHOSEN }).collect();
    Some(item)
}
