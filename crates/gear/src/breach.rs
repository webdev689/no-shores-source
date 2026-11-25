//! The Breaches, the raids: the hardest content, for a company of up to eight.
//! Each is fought at Normal or Hard: Hard stands
//! its foes higher, takes the fallen's own standing again away and leaves the company a few revives, and only its
//! armour climbs to the most Prestige. Its opening is fought in its patrol zone and the rest in its own run.
//! Each encounter's first clear in a week,
//! at each tier, pays each character once; the Breach's own rewards (its banner, its dye and its horse) come from its
//! last. The numbers are Claude's.

use crate::character::{Character, Stuff, Vestige};
use crate::dice::{Dice, Purpose};
use crate::kinds::{Slot, Stock};
use crate::rarity::Rarity;
use crate::rewards::{Foe, at_level, worth};
use crate::source::Source;

/// The most a company and a Breach's run hold.
pub const COMPANY_MOST: usize = 8;
/// A Boss's rank, whose kill each encounter's clear pays as.
const BOSS: u8 = 5;
/// The Essence of each stock an encounter's clear pays, and the last's.
const ESSENCE: u16 = 2;
const LAST_ESSENCE: u16 = 4;
/// A hidden chest's Essence of each stock.
const CHEST_ESSENCE: u16 = 1;
/// The slots a Breach's Vestiges hold: its armour and weapons, never a cloak or a ship's.
const SLOTS: [Slot; 6] = [Slot::Melee, Slot::Ranged, Slot::Head, Slot::Torso, Slot::Arms, Slot::Legs];

/// A Breach's difficulty.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Tier {
    Normal,
    Hard,
}

impl Tier {
    pub const ALL: [Tier; 2] = [Tier::Normal, Tier::Hard];

    /// Its key, in rooms' names and records: "normal" or "hard".
    #[must_use]
    pub const fn key(self) -> &'static str {
        match self {
            Tier::Normal => "normal",
            Tier::Hard => "hard",
        }
    }

    /// Its name on screen.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Tier::Normal => "Normal",
            Tier::Hard => "Hard",
        }
    }

    /// The level every foe stands at, as Destiny 1's Vault of Glass stood at 26 and 30.
    #[must_use]
    pub const fn foes_at(self) -> u8 {
        match self {
            Tier::Normal => 26,
            Tier::Hard => 30,
        }
    }

    /// The level a character may launch it from: one under its foes', so a company at the door can still fell its
    /// last great foe in the time its rules give (`room::breach::steward::HEALTH_TIMES`).
    #[must_use]
    pub const fn opens_at(self) -> u8 {
        self.foes_at() - 1
    }

    /// The revives a company shares in each attempt at an encounter, where they are counted: Hard's alone.
    #[must_use]
    pub const fn revives(self) -> Option<u8> {
        match self {
            Tier::Normal => None,
            Tier::Hard => Some(5),
        }
    }

    /// Whether a fallen player stands again of themselves during an encounter: at Normal, after a while at its
    /// checkpoint; at Hard never, only by a revive.
    #[must_use]
    pub const fn stands_again(self) -> bool {
        matches!(self, Tier::Normal)
    }

    /// What its clears' XP and Aurem are times.
    #[must_use]
    pub const fn reward(self) -> f64 {
        match self {
            Tier::Normal => 1.0,
            Tier::Hard => 1.5,
        }
    }
}

/// One of a Breach's encounters: its key, its name, and whether it is fought in the patrol zone.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Encounter {
    pub key: &'static str,
    pub name: &'static str,
    pub outside: bool,
}

/// A Breach: its id and name, the patrol zone and area its gate stands in, its encounters in order and its hidden
/// chests, each by key.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Breach {
    pub id: &'static str,
    pub name: &'static str,
    pub zone: &'static str,
    pub area: &'static str,
    pub encounters: &'static [Encounter],
    pub chests: &'static [&'static str],
    /// The emblem its last encounter's first clear keeps, its banner; its dye and its horse's barding.
    pub banner: &'static str,
    pub dye: &'static str,
    pub horse: &'static str,
}

/// The first Breach: the Drowned Vale, under the Gullwing Vale.
pub const DROWNED_VALE: Breach = Breach {
    id: "drowned-vale",
    name: "The Drowned Vale",
    zone: "gullwing-vale",
    area: "The Sunken Gate",
    encounters: &[
        Encounter { key: "waking", name: "The Waking", outside: true },
        Encounter { key: "mending", name: "The Mending", outside: false },
        Encounter { key: "choir", name: "The Choir", outside: false },
        Encounter { key: "ways", name: "The Unlit Ways", outside: false },
        Encounter { key: "shores", name: "The Two Shores", outside: false },
        Encounter { key: "steward", name: "The Steward", outside: false },
    ],
    chests: &["descent", "page", "heart", "stair"],
    banner: "drowned-vale",
    dye: "drowned-vale",
    horse: "drowned",
};

/// Every Breach, in the order the wire numbers them.
pub const BREACHES: [Breach; 1] = [DROWNED_VALE];

/// A Breach by its id.
#[must_use]
pub fn breach(id: &str) -> Option<&'static Breach> {
    BREACHES.iter().find(|breach| breach.id == id)
}

/// A Breach's key in a character's records at a tier: "drowned-vale/hard".
#[must_use]
pub fn record_key(breach: &Breach, tier: Tier) -> String {
    format!("{}/{}", breach.id, tier.key())
}

/// What a clear paid a character, for the room to keep and tell: its Vestiges (kept as a clear's are), the cosmetics
/// and the emblem it kept, and its lore chapters' keys.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Paid {
    pub vestiges: Vec<Vestige>,
    pub cosmetics: Vec<String>,
    pub emblem: Option<String>,
    pub lore: Vec<String>,
}

impl Character {
    /// Whether a Breach's encounter (or, past its encounters, its hidden chest) has paid this character at `tier` in
    /// `week`.
    #[must_use]
    pub fn breach_paid(&self, breach: &Breach, tier: Tier, week: u64, find: usize) -> bool {
        let this_week = &self.activity.this_week;
        this_week.week == week
            && this_week.breaches.get(&record_key(breach, tier)).is_some_and(|bits| bits & (1 << find) != 0)
    }

    /// Whether the character has seen a Breach's last encounter fall at `tier`, ever.
    #[must_use]
    pub fn breach_won(&self, breach: &Breach, tier: Tier) -> bool {
        self.story.breaches.contains(&record_key(breach, tier))
    }

    /// An encounter's clear at `tier` in `week` (`find` its place; past the encounters, a hidden chest's). Its first
    /// in the week pays: an encounter a Boss Captain's kill at the tier's level times its reward, Essence and a Breach
    /// Vestige (the last, two and more Essence, and a chance at the dye and the horse); a chest Essence alone. The
    /// lore chapter of its find is kept the first time ever, and the banner at the last encounter's first fall.
    /// Nothing more for one paid this week, or a week behind the record's.
    pub fn breach_cleared(&mut self, breach: &Breach, tier: Tier, week: u64, find: usize, dice: &Dice) -> Paid {
        let mut paid = Paid::default();
        let last = breach.encounters.len().saturating_sub(1);
        let key = find_key(breach, find);
        if find == last && self.story.breaches.insert(record_key(breach, tier)) && self.keep_emblem(breach.banner) {
            paid.emblem = Some(breach.banner.to_owned());
        }
        let chapters: Vec<String> = crate::lore::lore()
            .chapters()
            .filter(|(_, found)| {
                matches!(found, crate::lore::Found::Breach { breach: of, find } if of == breach.id && Some(find.as_str()) == key)
            })
            .map(|(chapter, _)| chapter)
            .collect();
        for chapter in chapters {
            if self.keep_lore(&chapter) {
                paid.lore.push(chapter);
            }
        }
        if week < self.activity.this_week.week || self.breach_paid(breach, tier, week, find) {
            return paid;
        }
        *self.activity.this_week(week).breaches.entry(record_key(breach, tier)).or_insert(0) |= 1 << find;
        if find >= breach.encounters.len() {
            for stock in [Stock::Weapon, Stock::Armor] {
                self.materials.add(Stuff::Essence(stock), CHEST_ESSENCE);
            }
            return paid;
        }
        let worth = worth(Foe::Captain, BOSS);
        let times = |amount: u32| {
            let raised = libm::round(f64::from(at_level(amount, tier.foes_at())) * tier.reward());
            u32::try_from(raised as u64).unwrap_or(u32::MAX)
        };
        self.earn_xp(times(worth.xp), None);
        self.materials.add_aurem(times(worth.aurem));
        let essence = if find == last { LAST_ESSENCE } else { ESSENCE };
        for stock in [Stock::Weapon, Stock::Armor] {
            self.materials.add(Stuff::Essence(stock), essence);
        }
        for nth in 0..if find == last { 2 } else { 1 } {
            let slot = SLOTS[dice.pick(Purpose::Breach, nth, SLOTS.len())];
            let vestige = Vestige::new(self.take_id(), Rarity::Legendary, slot, tier.foes_at());
            paid.vestiges.push(vestige.from(Source::Breach).at_tier(tier));
        }
        if find == last {
            let (dye, horse) = rewards_chance(tier);
            if dice.roll(Purpose::Breach, 8) < dye && !self.keeps_cosmetic(breach.dye) {
                self.keep_cosmetic(breach.dye);
                paid.cosmetics.push(breach.dye.to_owned());
            }
            if dice.roll(Purpose::Breach, 9) < horse && !self.keeps_cosmetic(breach.horse) {
                self.keep_cosmetic(breach.horse);
                paid.cosmetics.push(breach.horse.to_owned());
            }
        }
        paid
    }
}

/// The key of a find: an encounter's, then a hidden chest's.
#[must_use]
pub fn find_key(breach: &Breach, find: usize) -> Option<&'static str> {
    match breach.encounters.get(find) {
        Some(encounter) => Some(encounter.key),
        None => breach.chests.get(find - breach.encounters.len()).copied(),
    }
}

/// The chance at the last encounter's first clear in a week of the dye and of the horse: Hard's better.
#[must_use]
pub const fn rewards_chance(tier: Tier) -> (f64, f64) {
    match tier {
        Tier::Normal => (0.2, 0.05),
        Tier::Hard => (1.0 / 3.0, 0.125),
    }
}

#[cfg(test)]
#[path = "breach_tests.rs"]
mod breach_tests;
