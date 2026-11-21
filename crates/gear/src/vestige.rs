//! Vestiges, the sealed drops: whether a kill leaves one for a player, the colour it shows and the slot it holds an
//! item for; and, once identified in a social space, the colour it opens to (at, above or below its own) and the item
//! that comes out: a named Legendary or Atheric of its slot, or a lesser item of its kind with rolled traits.

use crate::catalogue::{NamedDef, catalogue};
use crate::dice::{Dice, Purpose};
use crate::element;
use crate::item::{Item, NAMED_LEVEL};
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;

/// The foe level from which a Legendary may drop, and an Atheric.
pub const LEGENDARY_FROM: u8 = 18;
pub const ATHERIC_FROM: u8 = 20;
/// A kill's chance of a Vestige for each player who struck it, by the foe's rank, Minor to Boss: a Boss always leaves
/// one, as Destiny 1's bosses did, and every rank more often than the one below.
const CHANCE: [f64; 5] = [0.02, 0.04, 0.10, 0.35, 1.0];
/// A Vestige's colour by the foe's rank, Minor to Boss, in 1,000, Normal to Atheric: at every rank each colour is
/// rarer than the one below it, and each colour or better likelier the higher the rank, as Destiny 1's majors and
/// ultras dropped the better engrams.
const COLOURS: [[u32; 5]; 5] = [
    [720, 230, 45, 4, 1],
    [640, 280, 68, 10, 2],
    [520, 320, 130, 27, 3],
    [400, 330, 200, 60, 10],
    [300, 280, 250, 135, 35],
];
/// What a Vestige of each colour opens to, in 100: its own colour most often, below it now and then, and above it
/// rarely.
const OPENS: [[u32; 5]; 5] =
    [[95, 5, 0, 0, 0], [20, 75, 5, 0, 0], [0, 20, 75, 5, 0], [0, 0, 20, 75, 5], [0, 0, 0, 20, 80]];

/// The place of a rank (the foes' numbers, 1 Minor to 5 Boss) in the tables; a number past them reads as the nearest.
fn rank_index(rank: u8) -> usize {
    usize::from(rank.clamp(1, 5) - 1)
}

/// A kill's chance of a Vestige from a foe of this rank (1 Minor to 5 Boss), on a Normal voyage.
#[must_use]
pub fn chance(rank: u8) -> f64 {
    CHANCE[rank_index(rank)]
}

/// The colour weights for what a foe of this rank (1 Minor to 5 Boss) drops, the order of the colours kept whole.
#[must_use]
pub fn colours(rank: u8) -> [u32; 5] {
    COLOURS[rank_index(rank)]
}

/// Colour weights as `level` allows them: the colours too good for its level are struck out, so the rest keep their
/// order; were nothing left, the best its level allows.
pub(crate) fn gated(weights: [u32; 5], level: u8) -> [u32; 5] {
    let best = if level >= ATHERIC_FROM {
        4
    } else if level >= LEGENDARY_FROM {
        3
    } else {
        2
    };
    let mut allowed = weights;
    let over: u32 = allowed[best + 1..].iter().sum();
    allowed[best + 1..].fill(0);
    if allowed.iter().sum::<u32>() == 0 {
        allowed[best] = over.max(1);
    }
    allowed
}

/// What a kill leaves for one player: a Vestige of this colour, for this slot, its item of this level. `chance` is the
/// kill's chance of leaving one (its rank's, raised by a harder voyage); `rank` (1 Minor to 5 Boss) weights its
/// colour.
#[must_use]
pub fn dropped(chance: f64, rank: u8, foe_level: u8, dice: &Dice) -> Option<(Rarity, Slot, u8)> {
    if dice.roll(Purpose::Drops, 0) >= chance {
        return None;
    }
    let colour = Rarity::ALL[dice.weighted(Purpose::Colour, 0, &gated(colours(rank), foe_level))];
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
/// evenly, at level 20; or a lesser item of a kind the slot takes, its name and traits rolled. A weapon may roll an
/// element.
#[must_use]
pub fn make(id: u32, rarity: Rarity, slot: Slot, level: u8, dice: &Dice) -> Option<Item> {
    let mut item = if rarity.named() {
        let pool: Vec<&NamedDef> = catalogue().vestige_pool(rarity, slot).collect();
        named_item(id, pool.get(dice.pick(Purpose::Which, 0, pool.len()))?, slot)
    } else {
        let kinds: Vec<Kind> = slot.kinds().collect();
        rolled(id, *kinds.get(dice.pick(Purpose::Which, 0, kinds.len()))?, rarity, slot, level, dice)
    };
    item.element = element::rolled(item.kind, item.rarity, dice);
    Some(item)
}

/// A named item from the catalogue, carried with `bucket`'s items: a cloak at level 1, anything else at 20, its traits
/// copied from its entry, which a kept one follows as it is read (`old_hands::unfit`).
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
