//! What the passages pay: a deal's cache to each player who took part, once a dive, at the zone's level and depth; and
//! a lamp lit, which keeps the haul and pays the day's lamp (the day's first lamp lit on an island) and the week's (the
//! first time each week each lamp of an island is lit). Going home from a lit lamp keeps what was found since and ends
//! the dive. The table is the design's ([[Passages as Claude Builds Them]]).

use crate::activities::Weekly;
use crate::atheric_bounty::Toward;
use crate::character::{Character, Stuff};
use crate::dice::{Dice, Purpose};
use crate::kinds::Stock;
use crate::objectives::{Deed, Feat};
use crate::refusal::Refusal;
use crate::rewards::{Foe, worth};
use crate::source::Source;
use crate::vestige::{self, colours, of_colours};
use crate::world::Difficulty;

/// What a deal's cache is, as the gear pays it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cache {
    Skirmish,
    Mission,
    Vault,
    Vein,
    Reliquary,
    /// A lamp's zone's, by the lamp's number.
    Lamp(u8),
}

/// Each deal's cache at level 5, XP then Aurem. A passage zone holds at most nine foes and takes one player about two
/// and a half minutes (`band::PASSAGE_SECONDS`), so zones come quickly and their kills carry the hour; the cache is a
/// small token of the deal done, set so an hour in the passages stays inside the band (`band`).
pub const SKIRMISH_PAY: (u32, u32) = (70, 5);
pub const MISSION_PAY: (u32, u32) = (90, 7);
pub const VAULT_PAY: (u32, u32) = (140, 10);
pub const VEIN_PAY: (u32, u32) = (40, 3);
pub const RELIQUARY_PAY: (u32, u32) = (40, 3);
pub const LAMP_PAY: (u32, u32) = (140, 10);
/// A skirmish's, a mission's, a reliquary's and a lamp's chance of a Vestige, before depth raises it.
pub const SKIRMISH_VESTIGE: f64 = 0.01;
pub const MISSION_VESTIGE: f64 = 0.02;
pub const RELIQUARY_VESTIGE: f64 = 0.03;
/// A vault's chance of its Miniboss's item as itself.
pub const VAULT_ITEM: f64 = 0.25;
pub const LAMP_VESTIGE: f64 = 0.05;
/// A vein's fragments, and a reliquary's least and most.
pub const VEIN_FRAGMENTS: u16 = 2;
pub const RELIQUARY_FRAGMENTS: (u16, u16) = (2, 5);
/// The ranks whose colours a cache's Vestige takes: an Elite's, a vault's its Miniboss's; a lamp's day and week a
/// Boss's.
const ELITE: u8 = 3;
const MINIBOSS: u8 = 4;
const BOSS: u8 = 5;
/// A reliquary's fragments' stock is rolled at this index of `Purpose::Passage`, clear of its count's (0) and of the
/// Atheric bounties' finds (1 on, one a bounty).
const FRAGMENT_STOCK: u32 = 100;
/// The stream the week's lamp rolls on, apart from the day's.
const WEEK_LAMP_STREAM: u64 = 0x7765_656b;

/// Where a zone stands, as its room tells the gear: its island (a continent's id), the week of its web, its number and
/// depth, and its foes' level.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Zone<'a> {
    pub island: &'a str,
    pub week: u64,
    pub zone: u16,
    pub depth: u8,
    pub level: u8,
}

/// What a cache's XP and Aurem are times at a depth: 1 at the first, 1.25 at the twentieth.
#[must_use]
pub fn pay_times(depth: u8) -> f64 {
    1.0 + f64::from(depth.clamp(1, 20) - 1) / 76.0
}

/// What its chances of finds are times: 1 at the first, 2 at the twentieth.
#[must_use]
pub fn find_times(depth: u8) -> f64 {
    1.0 + f64::from(depth.clamp(1, 20) - 1) / 19.0
}

impl Character {
    /// Pays a deal's cache to a player who took part, once in their dive: its XP and Aurem at the zone's level times
    /// its depth's, its finds into the haul with their chances raised by depth, and a roll for an Atheric bounty's
    /// find. Whether it paid.
    pub fn pay_cache(
        &mut self,
        at: Zone<'_>,
        cache: Cache,
        difficulty: Difficulty,
        source: Source,
        dice: &Dice,
    ) -> bool {
        if !self.passage.as_ref().is_some_and(|dive| dive.zone == at.zone) || !self.first_cache(at.zone) {
            return false;
        }
        let (pays, finds) = (pay_times(at.depth), find_times(at.depth));
        let (worth, vestige, rank) = match cache {
            Cache::Skirmish => (SKIRMISH_PAY, SKIRMISH_VESTIGE, ELITE),
            Cache::Mission => (MISSION_PAY, MISSION_VESTIGE, ELITE),
            Cache::Vault => (VAULT_PAY, vestige::chance(MINIBOSS), MINIBOSS),
            Cache::Vein => (VEIN_PAY, 0.0, ELITE),
            Cache::Reliquary => (RELIQUARY_PAY, RELIQUARY_VESTIGE, ELITE),
            Cache::Lamp(_) => (LAMP_PAY, LAMP_VESTIGE, ELITE),
        };
        let raised = |amount: u32| libm::round(f64::from(amount) * pays) as u32;
        self.pay((raised(worth.0), raised(worth.1)), at.level, None, difficulty);
        // A sure find stays one; a chance grows with depth.
        let chance = if vestige >= 1.0 { 1.0 } else { (vestige * finds).min(1.0) };
        let items = if cache == Cache::Vault { VAULT_ITEM * difficulty.reward() } else { 0.0 };
        for found in self.loot((chance * difficulty.reward(), items), rank, at.level, source, dice) {
            self.pick_up(found);
        }
        let fragments = match cache {
            Cache::Vein => VEIN_FRAGMENTS,
            Cache::Reliquary => {
                let (least, most) = RELIQUARY_FRAGMENTS;
                least + u16::try_from(dice.pick(Purpose::Passage, 0, usize::from(most - least) + 1)).unwrap_or(0)
            }
            _ => 0,
        };
        if fragments > 0 {
            let stock = if dice.roll(Purpose::Passage, FRAGMENT_STOCK) < 0.5 { Stock::Weapon } else { Stock::Armor };
            self.find_material(Stuff::Fragments(stock), fragments);
        }
        let lamp = if let Cache::Lamp(number) = cache { Some(number) } else { None };
        self.roll_find(at.island, at.depth, lamp, dice);
        true
    }

    /// A material found: into the haul in a passage zone, else the character's own.
    pub fn find_material(&mut self, what: Stuff, count: u16) -> u16 {
        self.haul_material(what, count).unwrap_or_else(|| self.materials.add(what, count))
    }

    /// Lights a zone's lamp, by its number, for this player: the haul kept, the day's and the week's lamp paid where
    /// they are due (on `day` and in `week`, the clock's), the lamp noted lit this week and the deepest of the dive,
    /// and the passages' bounties and the Atheric bounties counted.
    pub fn light_lamp(
        &mut self,
        at: Zone<'_>,
        number: u8,
        (day, week): (u64, u64),
        dice: &Dice,
    ) -> Result<(), Refusal> {
        let dive = self.passage.as_mut().filter(|dive| dive.island == at.island && dive.zone == at.zone);
        let dive = dive.ok_or(Refusal::NoDive)?;
        dive.lamp = dive.lamp.max(number);
        self.keep_haul();
        // What the lamps pay is kept at once, never into the haul.
        let dive = self.passage.take();
        if day >= self.activity.today.day && self.activity.today(day).passage_lamp.insert(at.island.to_owned()) {
            let found = worth(Foe::Captain, BOSS);
            self.pay((found.xp, found.aurem), at.level, None, Difficulty::Normal);
            self.keep_rolled(of_colours(colours(BOSS), at.level, dice), dice);
        }
        let first = week >= self.activity.this_week.week
            && self.activity.this_week(week).passage_lamps.entry(at.island.to_owned()).or_default().insert(number);
        if first {
            self.pay_week_lamp(number, at.level, dice);
        }
        self.passage = dive;
        self.saw(&Feat::Passage(Deed::Lamp), day);
        self.toward_bounties(Toward::Lamp { island: at.island, lamp: number });
        Ok(())
    }

    /// The week's lamp of a number: a sure Vestige in a Boss's colours; from the second one Essence of each stock, from
    /// the third two; and at the fourth a roll as the week's Abyss Dungeon's first clear, Legendary or Atheric. No
    /// Shapes, which the week's Abyss alone gives.
    fn pay_week_lamp(&mut self, number: u8, level: u8, dice: &Dice) {
        // Its own dice, so the day's lamp lit with it never pays the same Vestige twice.
        let dice = &Dice { seed: dice.seed ^ WEEK_LAMP_STREAM, ..*dice };
        self.keep_rolled(of_colours(colours(BOSS), level, dice), dice);
        let essence = match number {
            0 | 1 => 0,
            2 => 1,
            _ => 2,
        };
        for stock in [Stock::Weapon, Stock::Armor] {
            self.materials.add(Stuff::Essence(stock), essence);
        }
        if number >= 4 {
            let abyss = Dice { seed: dice.seed ^ 0x6c61_6d70, ..*dice };
            self.keep_rolled(of_colours(Weekly::Abyss.colours(), level, &abyss), &abyss);
        }
    }

    /// A Vestige the lamps pay, kept as a first clear's is: carried, else the vault, else the mail; a Normal one as its
    /// item.
    fn keep_rolled(&mut self, rolled: (crate::Rarity, crate::Slot, u8), dice: &Dice) {
        if let Some(found) = self.unsealed(rolled, Source::Dungeon, dice) {
            self.keep_paid(found);
        }
    }

    /// Keeps the haul: items as found are kept, Vestiges carried or sent on as found Vestiges go, materials added, and
    /// an Atheric bounty's find held as its bounty. The dive goes on, its haul empty. Whether a find was held so.
    pub(crate) fn keep_haul(&mut self) -> bool {
        let Some(mut dive) = self.passage.take() else { return false };
        let haul = std::mem::take(&mut dive.haul);
        for item in haul.items {
            let level = item.level;
            if let Some(found) = self.keep_found(item, level) {
                self.keep_paid(found);
            }
        }
        for found in haul.vestiges {
            self.keep_paid(found);
        }
        let held = &haul.materials;
        for stock in [Stock::Weapon, Stock::Armor] {
            self.materials.add(Stuff::Fragments(stock), held.fragments(stock));
            self.materials.add(Stuff::Essence(stock), held.essence(stock));
        }
        for (resource, &count) in held.resources.iter().enumerate() {
            self.materials.add(Stuff::Resource(resource), count);
        }
        let held = haul.lantern.inspect(|bounty| self.hold_bounty(bounty)).is_some();
        self.passage = Some(dive);
        held
    }

    /// Keeps the haul at a lamp's Home: a find held as its bounty was brought to a lamp, its first step.
    pub(crate) fn keep_haul_home(&mut self) {
        let Some((island, lamp)) = self.passage.as_ref().map(|dive| (dive.island.clone(), dive.lamp)) else { return };
        if self.keep_haul() {
            self.toward_bounties(Toward::Lamp { island: &island, lamp });
        }
    }

    /// Goes home from a zone's lamp, by its number, lit this dive: what was found since it was lit is kept, and the
    /// dive goes home, to end as the player comes into the patrol zone (`leave_passages`).
    pub fn go_home(&mut self, zone: u16, lamp: Option<u8>) -> Result<(), Refusal> {
        let dive = self.passage.as_ref().filter(|dive| dive.zone == zone).ok_or(Refusal::NoDive)?;
        let number = lamp.ok_or(Refusal::NoLamp)?;
        if dive.lamp < number {
            return Err(Refusal::LampNotLit);
        }
        self.keep_haul_home();
        if let Some(dive) = self.passage.as_mut() {
            dive.homeward = true;
        }
        Ok(())
    }
}

#[cfg(test)]
#[path = "lamps_tests.rs"]
mod lamps_tests;
