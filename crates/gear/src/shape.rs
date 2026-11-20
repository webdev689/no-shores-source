//! Shape, after Destiny 1's Xur: a figure who comes to Overlook each week from Friday to Sunday evening, stands in one
//! place on the plaza all that week, and sells Legendary and Atheric gear for Shapes, a currency found only at the
//! Elite and Abyss seas. When he comes, where he stands and what he sells are the same for everyone, from the clock.

use crate::asks::{Done, Here, Refusal};
use crate::character::{CARRIED_MOST, Character, STOCK_MOST};
use crate::dice::{Dice, Purpose};
use crate::item::{Item, NAMED_LEVEL};
use crate::kinds::Slot;
use crate::rarity::Rarity;
use crate::vestige;
use crate::world::Difficulty;

/// Minutes in a day and a week, and how far Thursday 1 January 1970, where Unix time starts, lies past a Monday.
pub const DAY_MINUTES: u64 = 1_440;
pub const WEEK_MINUTES: u64 = 7 * DAY_MINUTES;
const EPOCH_PAST_MONDAY: u64 = 3 * DAY_MINUTES;
/// When in the week (from Monday 00:00 UTC) he comes and goes: Friday 09:00, Xur's Friday, to Sunday 21:00.
pub const COMES_AT: u64 = 4 * DAY_MINUTES + 9 * 60;
pub const GOES_AT: u64 = 6 * DAY_MINUTES + 21 * 60;
/// How many places on the plaza he may stand at (the city's `wander_spots`), and how many pieces he sells a week, the
/// first `LEGENDARIES` of them Legendary and the rest Atheric.
pub const PLACES: usize = 8;
pub const WARES: usize = 6;
const LEGENDARIES: usize = 4;

/// The week a moment falls in, counted in whole weeks from Monday 00:00 UTC.
#[must_use]
pub fn week_of(unix_minutes: u64) -> u64 {
    (unix_minutes + EPOCH_PAST_MONDAY) / WEEK_MINUTES
}

/// Whether Shape is in Overlook at a moment.
#[must_use]
pub fn present(unix_minutes: u64) -> bool {
    let into = (unix_minutes + EPOCH_PAST_MONDAY) % WEEK_MINUTES;
    (COMES_AT..GOES_AT).contains(&into)
}

/// Minutes until he goes, while he is here; until he comes, while he is away.
#[must_use]
pub fn minutes_left(unix_minutes: u64) -> u64 {
    let into = (unix_minutes + EPOCH_PAST_MONDAY) % WEEK_MINUTES;
    if into < COMES_AT {
        COMES_AT - into
    } else if into < GOES_AT {
        GOES_AT - into
    } else {
        WEEK_MINUTES - into + COMES_AT
    }
}

/// Where he stands in a week: one of the plaza's `PLACES`, by the week's dice.
#[must_use]
pub fn place(week: u64) -> usize {
    Dice { seed: week, tick: 0, player: 0 }.pick(Purpose::Shape, 0, PLACES)
}

/// What a piece costs, in Shapes.
#[must_use]
pub fn price(rarity: Rarity) -> u16 {
    if rarity == Rarity::Atheric { 15 } else { 7 }
}

/// What he sells in a week: Legendary then Atheric pieces at level 20, each for a slot of the week's dice. Their
/// numbers are none until bought.
#[must_use]
pub fn wares(week: u64) -> Vec<Item> {
    (0..WARES)
        .filter_map(|ware| {
            let dice = Dice { seed: week, tick: 1 + ware as u64, player: 0 };
            let rarity = if ware < LEGENDARIES { Rarity::Legendary } else { Rarity::Atheric };
            let slot = Slot::VESTIGE[dice.pick(Purpose::Shape, 1, Slot::VESTIGE.len())];
            vestige::make(0, rarity, slot, NAMED_LEVEL, &dice)
        })
        .collect()
}

/// The Shapes a kill gives at the seas it was made at: none at Normal; at Elite and Abyss a few in a hundred kills
/// give one, and a Boss or a Miniboss (`great`) gives two or four.
#[must_use]
pub fn found(great: bool, difficulty: Difficulty, dice: &Dice) -> u16 {
    let (chance, sure) = match difficulty {
        Difficulty::Calm => return 0,
        Difficulty::Rough => (0.03, 2),
        Difficulty::Storm => (0.06, 4),
    };
    if great { sure } else { u16::from(dice.roll(Purpose::Shape, 2) < chance) }
}

impl Character {
    /// Adds Shapes, up to the most held.
    pub fn add_shapes(&mut self, shapes: u16) {
        self.materials.shapes = self.materials.shapes.saturating_add(shapes).min(STOCK_MOST);
    }

    /// Buys one of Shape's pieces of the week, at his place, for Shapes, carried with its slot's.
    pub(crate) fn buy_from_shape(&mut self, ware: u8, here: Here) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        let mut item = wares(here.week).into_iter().nth(usize::from(ware)).ok_or(Refusal::NoSuchItem)?;
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
