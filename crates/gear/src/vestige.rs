//! Vestiges, the sealed drops: whether a kill leaves one for a player, the colour it shows and the slot it holds an
//! item for; and, once identified in a social space, the colour it opens to (at, above or below its own) and the item
//! that comes out: a named Atheric of its slot, or an item of its kind in its content's set with rolled traits. A
//! Miniboss's or a Boss's kill may also leave an item as itself, made as an opened Vestige's is.

use crate::catalogue::{NamedDef, catalogue};
use crate::dice::{Dice, Purpose};
use crate::element;
use crate::grid::Column;
use crate::item::{Item, NAMED_LEVEL};
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;
use crate::source::Source;

/// The foe level from which a Legendary may drop, and an Atheric.
pub const LEGENDARY_FROM: u8 = 18;
pub const ATHERIC_FROM: u8 = 20;
/// The stream a kill's found items are rolled on, apart from its Vestiges'.
const ITEM_STREAM: u64 = 0x6974_656d;
/// A kill's chance of a Vestige for each player who struck it, by the foe's rank, Minor to Boss: a Boss always leaves
/// one, as Destiny 1's bosses did, and every rank more often than the one below.
const CHANCE: [f64; 5] = [0.02, 0.04, 0.10, 0.35, 1.0];
/// A kill's chance of leaving an item as itself, by the foe's rank: a Miniboss's as often as its Vestige, a Boss's
/// always, apart from its Vestige.
const ITEM_CHANCE: [f64; 5] = [0.0, 0.0, 0.0, 0.35, 1.0];
/// A Vestige's colour by the foe's rank, Minor to Boss, in 1,000, Normal to Atheric: at every rank each colour is half
/// or less of the one below it, so each is far rarer, and each colour or better likelier the higher the rank, as
/// Destiny 1's majors and ultras dropped the better engrams.
const COLOURS: [[u32; 5]; 5] = [
    [750, 188, 47, 12, 3],
    [716, 204, 58, 17, 5],
    [670, 223, 74, 25, 8],
    [606, 242, 97, 39, 16],
    [517, 258, 129, 64, 32],
];
/// What a Vestige of each colour opens to, in 100: its own colour most often, since its colour is what a player chases,
/// and, as the owner chose, below it now and then and above it rarely.
pub(crate) const OPENS: [[u32; 5]; 5] =
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

/// A kill's chance of leaving an item as itself from a foe of this rank (1 Minor to 5 Boss), on a Normal voyage.
#[must_use]
pub fn item_chance(rank: u8) -> f64 {
    ITEM_CHANCE[rank_index(rank)]
}

/// How many drops `chance` gives: one for each whole one in it, and one more by its fraction, so a harder voyage that
/// raises a sure drop past one still gives more.
fn how_many(chance: f64, dice: &Dice) -> u32 {
    let whole = libm::floor(chance.max(0.0));
    whole as u32 + u32::from(dice.roll(Purpose::Drops, 0) < chance - whole)
}

/// The dice for a kill's `nth` drop, each rolled apart from the others; the first is the kill's own.
fn nth_dice(dice: &Dice, nth: u32) -> Dice {
    Dice { seed: dice.seed ^ u64::from(nth).wrapping_mul(0x9E37_79B9_7F4A_7C15), ..*dice }
}

/// What a kill leaves for one player: Vestiges, each of a colour, for a slot, its item of this level. `chance` is the
/// kill's chance of leaving one (its rank's, raised by a harder voyage, past one for a second); `rank` (1 Minor to 5
/// Boss) weights their colour.
#[must_use]
pub fn dropped(chance: f64, rank: u8, foe_level: u8, dice: &Dice) -> Vec<(Rarity, Slot, u8)> {
    (0..how_many(chance, dice)).map(|nth| of_colours(colours(rank), foe_level, &nth_dice(dice, nth))).collect()
}

/// A Vestige of these colour weights (Normal to Atheric) for a foe of this level, gated as every drop is: its
/// colour, its slot and its item's level.
#[must_use]
pub fn of_colours(weights: [u32; 5], foe_level: u8, dice: &Dice) -> (Rarity, Slot, u8) {
    let colour = Rarity::ALL[dice.weighted(Purpose::Colour, 0, &gated(weights, foe_level))];
    let slot = Slot::VESTIGE[dice.pick(Purpose::Slot, 0, Slot::VESTIGE.len())];
    (colour, slot, foe_level.clamp(1, NAMED_LEVEL))
}

/// The items a kill leaves as themselves, not sealed, by `chance` as `dropped` takes it: each coloured by `rank`'s
/// row and opened as a Vestige of that colour would be, for any slot, at the foe's level, numbered 0 until kept. Rolled
/// on dice apart from the kill's Vestiges, so the two never move together.
#[must_use]
pub fn found_items(chance: f64, rank: u8, foe_level: u8, source: Source, dice: &Dice) -> Vec<Item> {
    let dice = Dice { seed: dice.seed ^ ITEM_STREAM, ..*dice };
    dropped(chance, rank, foe_level, &dice)
        .into_iter()
        .zip(0..)
        .filter_map(|((colour, slot, level), nth)| {
            let dice = nth_dice(&dice, nth);
            make(0, opens_to(colour, level, &dice), slot, level, source, &dice)
        })
        .collect()
}

/// The colour a Vestige of this level opens to: above its own colour only as far as its level allows a drop, so a
/// low Vestige never opens to what its foe could not have dropped.
#[must_use]
pub fn opens_to(colour: Rarity, level: u8, dice: &Dice) -> Rarity {
    Rarity::ALL[dice.weighted(Purpose::Opens, 0, &gated(OPENS[colour as usize], level))]
}

/// The item a Vestige of this slot and level from `source` makes at this rarity, numbered `id`: an Atheric (or a
/// ship's Legendary module) is a named one of its slot, chosen evenly among its source's, else among every source's
/// while its own has none, at level 20, keeping its own source; anything else an item of a kind the slot takes, its
/// look and traits rolled, from `source`. A weapon may roll an element.
#[must_use]
pub fn make(id: u32, rarity: Rarity, slot: Slot, level: u8, source: Source, dice: &Dice) -> Option<Item> {
    let named = rarity == Rarity::Atheric || (rarity == Rarity::Legendary && Slot::SHIP.contains(&slot));
    let mut item = if named {
        let every: Vec<&NamedDef> = catalogue().vestige_pool(rarity, slot).collect();
        let own: Vec<&NamedDef> = every.iter().copied().filter(|named| named.source() == source).collect();
        let pool = if own.is_empty() { every } else { own };
        named_item(id, pool.get(dice.pick(Purpose::Which, 0, pool.len()))?, slot)
    } else {
        let kinds: Vec<Kind> = slot.kinds().collect();
        let mut item = rolled(id, *kinds.get(dice.pick(Purpose::Which, 0, kinds.len()))?, rarity, slot, level, dice);
        item.source = source;
        // A Breach's armour and weapons roll their perks from the Breaches' own; its Legendary armour climbs further.
        item.breach = source == Source::Breach && (item.kind.armour() || item.kind.weapon());
        if item.breach {
            item.layout = rolled_layout(&item, None, dice);
        }
        item
    };
    item.element = element::rolled(item.kind, item.rarity, dice);
    Some(item)
}

/// A named item from the catalogue, carried with `bucket`'s items: a cloak at level 1, anything else at 20, its traits
/// copied from its entry, which a kept one follows as it is read (`old_hands::unfit`); none for a faction's armour or
/// weapon, whose traits roll as it is made for a player (`made_named`).
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
    item.source = named.source();
    item
}

/// A rolled item of a kind, its traits rolled from the kind's pools, never one trait twice. Its `name` is a ship
/// module's name among its kind's, or an armour piece's or weapon's look, which the page climbs its content's sets
/// and dyes by. A Legendary is level 20, its nodes asking for an island's resource rolled among the catalogue's.
#[must_use]
pub fn rolled(id: u32, kind: Kind, rarity: Rarity, bucket: Slot, level: u8, dice: &Dice) -> Item {
    let content = catalogue();
    let legendary = rarity == Rarity::Legendary;
    let mut item = Item::new(id, kind, rarity, if legendary { NAMED_LEVEL } else { level }, bucket);
    let looks = if kind.module() { content.names_of(kind, rarity).len() } else { LOOK_ROLLS };
    item.name = u8::try_from(dice.pick(Purpose::Name, 0, looks)).unwrap_or_default();
    if legendary {
        item.resource = u8::try_from(dice.pick(Purpose::Name, 1, content.resources.len())).ok();
    }
    item.layout = rolled_layout(&item, None, dice);
    item
}

/// How many looks a rolled armour piece or weapon rolls among: its remainders by 2, 3 and 4 climb its content's sets
/// and metals and pick its dye, and its sixths its make, shield and Magic set (the page's `numberOf`), so each pairs
/// with each, and a ware shows the look it keeps once bought.
pub const LOOK_ROLLS: usize = 36;

/// The traits an item's columns offer, each column's rolled from its kind's pool, never one trait twice; with a
/// faction, the first node of its first perk column is drawn from that faction's own perks that fit it instead. A
/// Breach's piece draws every node of its perk columns from the Breaches' own perks that fit it, never one it has
/// already offered (the catalogue holds enough of them for every perk node, `Catalogue::problems`).
fn rolled_layout(item: &Item, faction: Option<&str>, dice: &Dice) -> Vec<Vec<String>> {
    let content = catalogue();
    let mut used: Vec<&str> = Vec::new();
    let mut layout = Vec::new();
    let mut faction_node = faction;
    let breach_perks: Vec<&str> = content.breach_perks(item.kind).into_iter().map(|found| found.id.as_str()).collect();
    for (column_index, column) in item.columns().iter().enumerate().filter(|(_, column)| column.traits()) {
        let fresh = |found: &&str| !used.contains(found);
        let shared: Vec<&str> = content.pool(*column, item.kind).into_iter().map(|found| found.id.as_str()).collect();
        let mut pool: Vec<&str> = shared.into_iter().filter(fresh).collect();
        let breach_column = item.breach && matches!(column, Column::Perk(_));
        let mut offered: Vec<String> = Vec::new();
        for nth in 0..column.nodes() {
            let index = column_index as u32 * 8 + u32::from(nth);
            let own = faction_node.filter(|_| matches!(column, Column::Perk(_)));
            let chosen = if breach_column {
                let unoffered: Vec<&str> = breach_perks.iter().copied().filter(|id| !used.contains(id)).collect();
                unoffered.get(dice.pick(Purpose::Traits, index, unoffered.len())).copied()
            } else if let Some(faction) = own {
                faction_node = None;
                let perks = content.faction_perks(faction, item.kind);
                perks.get(dice.pick(Purpose::Traits, index, perks.len())).map(|found| found.id.as_str())
            } else {
                let taken = dice.pick(Purpose::Traits, index, pool.len());
                (taken < pool.len()).then(|| pool.remove(taken))
            };
            if let Some(chosen) = chosen {
                used.push(chosen);
                offered.push(chosen.to_owned());
            }
        }
        layout.push(offered);
    }
    layout
}

/// A named item made for a player at a faction's counter or the Test Ground: a faction's armour or weapon rolls its
/// traits from its kind's shared pools, one always its faction's own (`rolled_layout`); a weapon may roll an element.
#[must_use]
pub fn made_named(id: u32, named: &NamedDef, bucket: Slot, dice: &Dice) -> Item {
    let mut item = named_item(id, named, bucket);
    if let Some(faction) = named.faction.as_deref().filter(|_| named.kind != Kind::Cloak) {
        item.layout = rolled_layout(&item, Some(faction), dice);
    }
    item.element = element::rolled(item.kind, item.rarity, dice);
    item
}
