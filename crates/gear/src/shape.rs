//! Shape, after Destiny 1's Xur: a figure who comes to Overlook each week from Friday to Sunday evening, stands in one
//! place on the plaza all that week, and sells Legendary and Atheric gear for Shapes, a currency the Abyss Dungeon of
//! the week alone gives, as Destiny 1's weekly strikes gave Strange Coins; no kill gives any. When he comes, where he stands and what he sells are the same for everyone, from the clock.

use crate::asks::{Done, Here, Refusal};
use crate::catalogue::{NamedDef, catalogue};
use crate::character::{CARRIED_MOST, Character, STOCK_MOST};
use crate::clock::{DAY_MINUTES, WEEK_MINUTES, minutes_to_next_week};
use crate::dice::{Dice, Purpose};
use crate::element;
use crate::item::{ITEM_LEVEL_MOST, Item};
use crate::kinds::Slot;
use crate::rarity::Rarity;
use crate::source::Source;
use crate::vestige;

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

/// The number a page names the piece Shape shows at a place in a week by when it buys there (`Ask::BuyFromShape`),
/// which the room sends with his wares: an Atheric's place in the catalogue's items, a rolled Legendary's a hash of
/// the piece itself, so a page shown another piece there (another week's, or his wares drawn again since, as the
/// catalogue grew) buys nothing; `u32::MAX` past his six.
#[must_use]
pub fn shown(week: u64, ware: u8) -> u32 {
    wares(week).get(usize::from(ware)).map_or(u32::MAX, number_of)
}

fn number_of(item: &Item) -> u32 {
    let Some(named) = &item.named else {
        let mut hasher = std::hash::DefaultHasher::new();
        std::hash::Hash::hash(&serde_json::to_string(item).unwrap_or_default(), &mut hasher);
        // Kept to 32 bits, the width a page's ask carries.
        return std::hash::Hasher::finish(&hasher) as u32;
    };
    let place = catalogue().items.iter().position(|entry| &entry.id == named);
    place.and_then(|place| u32::try_from(place).ok()).unwrap_or(u32::MAX)
}

/// The contents a Legendary of his may come from, its set look and name its content's: never a faction's or a
/// Breach's.
const CONTENTS: [Source; 5] = [Source::World, Source::Dungeon, Source::Sea, Source::Elite, Source::Abyss];

/// What he sells in a week, by the week's dice: four Legendaries, one for each of four Vestige slots, each rolled as a
/// Vestige makes one at level 20 in a content drawn among `CONTENTS`, so it wears that content's set; then two
/// Atherics, no one twice. Their numbers are none until bought.
#[must_use]
pub fn wares(week: u64) -> Vec<Item> {
    let mut slots = Slot::VESTIGE.to_vec();
    shuffled(week, Rarity::Legendary, &mut slots);
    let mut wares: Vec<Item> = slots
        .into_iter()
        .take(LEGENDARIES)
        .enumerate()
        .filter_map(|(ware, slot)| {
            let dice = Dice { seed: week, tick: 1 + ware as u64, player: 0 };
            let content = CONTENTS[dice.pick(Purpose::Shape, 0, CONTENTS.len())];
            vestige::make(0, Rarity::Legendary, slot, ITEM_LEVEL_MOST, content, &dice)
        })
        .collect();
    let mut atherics: Vec<(&NamedDef, Slot)> = Slot::VESTIGE
        .into_iter()
        .flat_map(|slot| catalogue().vestige_pool(Rarity::Atheric, slot).map(move |named| (named, slot)))
        .collect();
    shuffled(week, Rarity::Atheric, &mut atherics);
    wares.extend(atherics.into_iter().take(WARES - LEGENDARIES).enumerate().map(|(at, (named, slot))| {
        let mut item = vestige::named_item(0, named, slot);
        let ware = LEGENDARIES + at;
        item.element = element::rolled(item.kind, item.rarity, &Dice { seed: week, tick: 1 + ware as u64, player: 0 });
        item
    }));
    wares
}

/// Shuffles a week's choices of a rarity by the week's dice, as `cosmetics::sold_on` shuffles a day's cosmetics.
fn shuffled<T>(week: u64, rarity: Rarity, pool: &mut [T]) {
    let dice = Dice { seed: week, tick: 1 + rarity as u64, player: 0 };
    for at in (1..pool.len()).rev() {
        pool.swap(at, dice.pick(Purpose::Shape, 1 + u32::try_from(at).unwrap_or_default(), at + 1));
    }
}

impl Character {
    /// Adds Shapes, up to the most held.
    pub fn add_shapes(&mut self, shapes: u16) {
        self.materials.shapes = self.materials.shapes.saturating_add(shapes).min(STOCK_MOST);
    }

    /// Buys one of Shape's pieces of the week, at his place, for Shapes, carried with its slot's: each made at its own
    /// level, as a faction's are, and sold to none who could not wear it yet. A page shown another piece at that place
    /// (his wares drawn again since, as the catalogue grew) is told it is not sold here, as a smith's ware of another day.
    pub(crate) fn buy_from_shape(&mut self, ware: u8, shown: u32, here: Here) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        let mut item = wares(here.week).into_iter().nth(usize::from(ware)).ok_or(Refusal::NoSuchItem)?;
        if number_of(&item) != shown {
            return Err(Refusal::NotSold);
        }
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
