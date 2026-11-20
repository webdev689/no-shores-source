//! Shape, after Destiny 1's Xur: a figure who comes to Overlook each week from Friday to Sunday evening, stands in one
//! place on the plaza all that week, and sells Legendary and Atheric gear for Shapes, a currency found only at the
//! Elite and Abyss seas. When he comes, where he stands and what he sells are the same for everyone, from the clock.

use crate::asks::{Done, Here, Refusal};
use crate::catalogue::{NamedDef, catalogue};
use crate::character::{CARRIED_MOST, Character, STOCK_MOST};
use crate::clock::{DAY_MINUTES, WEEK_MINUTES, minutes_to_next_week};
use crate::dice::{Dice, Purpose};
use crate::element;
use crate::item::Item;
use crate::kinds::Slot;
use crate::rarity::Rarity;
use crate::vestige;
use crate::world::Difficulty;

/// When in the clock's week (from Tuesday 09:00 UTC) he comes and goes: Friday 09:00, Xur's Friday, to Sunday 21:00.
pub const COMES_AT: u64 = 3 * DAY_MINUTES;
pub const GOES_AT: u64 = 5 * DAY_MINUTES + 12 * 60;
/// How many places on the plaza he may stand at (the city's `visitor_spots`, which reach the room as its
/// `shape_spots`), and how many pieces he sells a week, the first `LEGENDARIES` of them Legendary and the rest Atheric.
pub const PLACES: usize = 8;
pub const WARES: usize = 6;
const LEGENDARIES: usize = 4;

/// Whether Shape is in Overlook at a moment.
#[must_use]
pub fn present(unix_minutes: u64) -> bool {
    minutes_left(unix_minutes) > 0
}

/// The minutes until Shape leaves Overlook, none while he is away.
#[must_use]
pub fn minutes_left(unix_minutes: u64) -> u64 {
    let into = WEEK_MINUTES - minutes_to_next_week(unix_minutes);
    if (COMES_AT..GOES_AT).contains(&into) { GOES_AT - into } else { 0 }
}

/// Where he stands in a week of the clock's (`clock::week_of`): one of the plaza's `PLACES`, by the week's dice.
#[must_use]
pub fn place(week: u64) -> usize {
    Dice { seed: week, tick: 0, player: 0 }.pick(Purpose::Shape, 0, PLACES)
}

/// What a piece costs, in Shapes.
#[must_use]
pub fn price(rarity: Rarity) -> u16 {
    if rarity == Rarity::Atheric { 15 } else { 7 }
}

/// What he sells in a week: Legendary then Atheric pieces at level 20, no piece twice, by the week's dice. Their
/// numbers are none until bought.
#[must_use]
pub fn wares(week: u64) -> Vec<Item> {
    let mut wares = drawn(week, Rarity::Legendary, LEGENDARIES);
    wares.extend(drawn(week, Rarity::Atheric, WARES - LEGENDARIES));
    wares
        .into_iter()
        .enumerate()
        .map(|(ware, (named, slot))| {
            let mut item = vestige::named_item(0, named, slot);
            item.element =
                element::rolled(item.kind, item.rarity, &Dice { seed: week, tick: 1 + ware as u64, player: 0 });
            item
        })
        .collect()
}

/// `count` named pieces of a rarity from every Vestige slot's pool, each at most once, shuffled by the week's dice as
/// `cosmetics::sold_on` shuffles a day's cosmetics.
fn drawn(week: u64, rarity: Rarity, count: usize) -> Vec<(&'static NamedDef, Slot)> {
    let mut pool: Vec<(&NamedDef, Slot)> = Slot::VESTIGE
        .into_iter()
        .flat_map(|slot| catalogue().vestige_pool(rarity, slot).map(move |named| (named, slot)))
        .collect();
    let dice = Dice { seed: week, tick: 1 + rarity as u64, player: 0 };
    for at in (1..pool.len()).rev() {
        pool.swap(at, dice.pick(Purpose::Shape, 1 + u32::try_from(at).unwrap_or_default(), at + 1));
    }
    pool.truncate(count);
    pool
}

/// The Shapes a kill gives at the seas it was made at: none at Normal; at Elite and Abyss a few in a hundred kills
/// give one, and a Boss or a Miniboss (`great`) gives two or four.
#[must_use]
pub fn found(great: bool, difficulty: Difficulty, dice: &Dice) -> u16 {
    let (chance, sure) = match difficulty {
        Difficulty::Normal => return 0,
        Difficulty::Elite => (0.03, 2),
        Difficulty::Abyss => (0.06, 4),
    };
    if great { sure } else { u16::from(dice.roll(Purpose::Shape, 2) < chance) }
}

impl Character {
    /// Adds Shapes, up to the most held.
    pub fn add_shapes(&mut self, shapes: u16) {
        self.materials.shapes = self.materials.shapes.saturating_add(shapes).min(STOCK_MOST);
    }

    /// Buys one of Shape's pieces of the week, at his place, for Shapes, carried with its slot's: each made at its own
    /// level, as a faction's are, and sold to none who could not wear it yet.
    pub(crate) fn buy_from_shape(&mut self, ware: u8, here: Here) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        let mut item = wares(here.week).into_iter().nth(usize::from(ware)).ok_or(Refusal::NoSuchItem)?;
        if self.level() < item.level {
            return Err(Refusal::TooLow);
        }
        let cost = price(item.rarity);
        if self.materials.shapes < cost {
            return Err(Refusal::Short);
        }
        if self.carried_in(item.bucket) >= CARRIED_MOST {
            return Err(Refusal::CarriedFull);
        }
        item.id = self.take_id();
        self.materials.shapes -= cost;
        self.items.insert(item.id, (item, crate::character::At::Carried));
        Ok(None)
    }
}
