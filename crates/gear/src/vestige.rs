//! Vestiges, the sealed drops: whether a kill leaves one for a player, the colour it shows and the slot it holds an
//! item for; and, once identified in a social space, the colour it opens to (at, above or below its own) and the item
//! that comes out: a named Legendary or Atheric of its slot, or a lesser item of its kind with rolled traits.

use crate::catalogue::{NamedDef, catalogue};
use crate::dice::{Dice, Purpose};
use crate::item::{Item, NAMED_LEVEL};
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;

/// The foe level from which a Legendary may drop, and an Atheric.
pub const LEGENDARY_FROM: u8 = 18;
pub const ATHERIC_FROM: u8 = 20;
/// A Vestige's colour from most foes, in 100: Normal, Magic, Rare, Legendary, Atheric.
const FROM_FOES: [u32; 5] = [55, 33, 10, 2, 0];
/// A Vestige's colour from a boss.
const FROM_BOSSES: [u32; 5] = [0, 20, 55, 22, 3];
/// What a Vestige of each colour opens to, in 100: it can open below its own colour, as the owner set, and rarely
/// above it.
const OPENS: [[u32; 5]; 5] =
    [[85, 15, 0, 0, 0], [20, 70, 10, 0, 0], [0, 25, 65, 10, 0], [0, 0, 60, 35, 5], [0, 0, 0, 20, 80]];

/// Colour weights as `level` allows them: too low for the best colours, what would have been one is the best its level
/// allows.
fn gated(mut weights: [u32; 5], level: u8) -> [u32; 5] {
    if level < ATHERIC_FROM {
        weights[3] += weights[4];
        weights[4] = 0;
    }
    if level < LEGENDARY_FROM {
        weights[2] += weights[3];
        weights[3] = 0;
    }
    weights
}

/// What a kill leaves for one player: a Vestige of this colour, for this slot, its item of this level. `chance` is the
/// foe's chance of leaving one; a boss always does, and leaves the better colours.
#[must_use]
pub fn dropped(chance: f64, boss: bool, foe_level: u8, dice: &Dice) -> Option<(Rarity, Slot, u8)> {
    if !boss && dice.roll(Purpose::Drops, 0) >= chance {
        return None;
    }
    let weights = gated(if boss { FROM_BOSSES } else { FROM_FOES }, foe_level);
    let colour = Rarity::ALL[dice.weighted(Purpose::Colour, 0, &weights)];
    let slot = Slot::VESTIGE[dice.pick(Purpose::Slot, 0, Slot::VESTIGE.len())];
    Some((colour, slot, foe_level.clamp(1, NAMED_LEVEL)))
}

/// The colour a Vestige of this level opens to: above its own colour only as far as its level allows a drop, so a
/// low Vestige never opens to what its foe could not have dropped.
#[must_use]
pub fn opens_to(colour: Rarity, level: u8, dice: &Dice) -> Rarity {
    Rarity::ALL[dice.weighted(Purpose::Opens, 0, &gated(OPENS[colour as usize], level))]
}

/// The item a Vestige of this slot and level makes at this rarity, numbered `id`: a named one of its slot, chosen
/// evenly, at level 20; or a lesser item of a kind the slot takes, its name and traits rolled.
#[must_use]
pub fn make(id: u32, rarity: Rarity, slot: Slot, level: u8, dice: &Dice) -> Option<Item> {
    if rarity.named() {
        let pool: Vec<&NamedDef> = catalogue().vestige_pool(rarity, slot).collect();
        return pool.get(dice.pick(Purpose::Which, 0, pool.len())).map(|named| named_item(id, named, slot));
    }
    let kinds: Vec<Kind> = slot.kinds().collect();
    let kind = *kinds.get(dice.pick(Purpose::Which, 0, kinds.len()))?;
    Some(rolled(id, kind, rarity, slot, level, dice))
}

/// A named item from the catalogue, carried with `bucket`'s items: a cloak at level 1, anything else at 20, its traits
/// copied so it stays what it was.
#[must_use]
pub fn named_item(id: u32, named: &NamedDef, bucket: Slot) -> Item {
    let level = if named.kind == Kind::Cloak { 1 } else { NAMED_LEVEL };
    let mut item = Item::new(id, named.kind, named.rarity, level, bucket);
    item.named = Some(named.id.clone());
    item.layout.clone_from(&named.layout);
    item.resource = named
        .resource
        .as_deref()
        .and_then(|resource| catalogue().resource_index(resource))
        .and_then(|index| u8::try_from(index).ok());
    item.breach = named.breach;
    item
}

/// A lesser item of a kind, its name and its traits rolled from the kind's pools, never one trait twice.
#[must_use]
pub fn rolled(id: u32, kind: Kind, rarity: Rarity, bucket: Slot, level: u8, dice: &Dice) -> Item {
    let content = catalogue();
    let mut item = Item::new(id, kind, rarity, level, bucket);
    let names = content.names_of(kind, rarity);
    item.name = u8::try_from(dice.pick(Purpose::Name, 0, names.len())).unwrap_or_default();
    let mut used: Vec<&str> = Vec::new();
    for (column_index, column) in item.columns().iter().enumerate().filter(|(_, column)| column.traits()) {
        let mut pool: Vec<&str> = content
            .pool(*column, kind)
            .into_iter()
            .map(|found| found.id.as_str())
            .filter(|found| !used.contains(found))
            .collect();
        let mut offered = Vec::new();
        for nth in 0..column.nodes() {
            let taken = dice.pick(Purpose::Traits, column_index as u32 * 8 + u32::from(nth), pool.len());
            if taken < pool.len() {
                let chosen = pool.remove(taken);
                used.push(chosen);
                offered.push(chosen.to_owned());
            }
        }
        item.layout.push(offered);
    }
    item
}
