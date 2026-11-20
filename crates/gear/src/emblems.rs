//! Emblems, after Destiny's: a square sign and the nameplate it heads, shown beside a player's name wherever others see
//! it. A player keeps every emblem they have earned or bought, as Destiny's kiosks kept them, and wears one. Each comes
//! from one place: the start, a level reached, a deed done, or the Tailor, who sells a few each day for Aurem, as
//! Destiny's Outfitter did. Their art is the page's; here are what they are and how they are had.

use crate::asks::{Done, Here, Refusal};
use crate::character::Character;
use crate::dice::{Dice, Purpose};
use crate::rarity::Rarity;
use serde::Deserialize;
use std::sync::OnceLock;

/// How many emblems the Tailor shows a day.
pub const SOLD_A_DAY: usize = 6;

/// A deed that earns an emblem.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Deed {
    FullyUpgraded,
    OpenedLegendary,
    OpenedAtheric,
    ShieldBroken,
    AbyssFoe,
    Gathered,
}

/// Where an emblem comes from.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Source {
    Start,
    Level { level: u8 },
    Deed { deed: Deed },
    Sold { aurem: u32, level: u8 },
}

/// An emblem as the catalogue holds it.
#[derive(Clone, Debug, Deserialize)]
pub struct EmblemDef {
    pub id: String,
    pub name: String,
    pub rarity: Rarity,
    pub source: Source,
}

#[derive(Deserialize)]
struct EmblemsFile {
    emblems: Vec<EmblemDef>,
}

/// Every emblem, in `content/gear/emblems.json`'s order, which the wire numbers them by.
///
/// # Panics
/// Never for the file in the repository: its test reads it.
#[must_use]
pub fn emblems() -> &'static [EmblemDef] {
    static EMBLEMS: OnceLock<Vec<EmblemDef>> = OnceLock::new();
    EMBLEMS.get_or_init(|| {
        let file: EmblemsFile = serde_json::from_str(include_str!("../../../content/gear/emblems.json"))
            .expect("content/gear/emblems.json reads: its test says so");
        file.emblems
    })
}

/// An emblem's number, from its id.
#[must_use]
pub fn number_of(id: &str) -> Option<u16> {
    emblems().iter().position(|emblem| emblem.id == id).and_then(|at| u16::try_from(at).ok())
}

/// The emblem every player starts with and wears.
#[must_use]
pub fn starting() -> String {
    emblems().iter().find(|emblem| emblem.source == Source::Start).map(|emblem| emblem.id.clone()).unwrap_or_default()
}

/// The emblems the Tailor sells on a day, by number: six of those sold, the same for everyone that day.
#[must_use]
pub fn sold_on(day: u64) -> Vec<u16> {
    let mut sold: Vec<u16> = (0..emblems().len())
        .filter(|&at| matches!(emblems()[at].source, Source::Sold { .. }))
        .filter_map(|at| u16::try_from(at).ok())
        .collect();
    // Each day shuffles the list by its own dice and shows its first few.
    let dice = Dice { seed: day, tick: 0, player: 0 };
    for at in (1..sold.len()).rev() {
        let nth = u32::try_from(at).unwrap_or_default();
        sold.swap(at, dice.pick(Purpose::Emblem, nth, at + 1));
    }
    sold.truncate(SOLD_A_DAY);
    sold.sort_unstable();
    sold
}

impl Character {
    /// Whether the player keeps an emblem.
    #[must_use]
    pub fn keeps_emblem(&self, id: &str) -> bool {
        self.emblems.iter().any(|kept| kept == id)
    }

    /// Keeps an emblem, once; answers whether it is new.
    pub fn keep_emblem(&mut self, id: &str) -> bool {
        if self.keeps_emblem(id) || number_of(id).is_none() {
            return false;
        }
        self.emblems.push(id.to_owned());
        self.emblems.sort_unstable();
        true
    }

    /// Keeps the emblems a deed earns.
    pub fn earn(&mut self, deed: Deed) {
        let earned: Vec<String> = emblems()
            .iter()
            .filter(|emblem| emblem.source == Source::Deed { deed })
            .map(|emblem| emblem.id.clone())
            .collect();
        for id in earned {
            self.keep_emblem(&id);
        }
    }

    /// Keeps every emblem the player's level and their gear have earned so far: the starting one, each level
    /// reached, and a piece fully upgraded.
    pub fn earn_due(&mut self) {
        let level = self.level();
        let due: Vec<String> = emblems()
            .iter()
            .filter(|emblem| match emblem.source {
                Source::Start => true,
                Source::Level { level: wanted } => level >= wanted,
                _ => false,
            })
            .map(|emblem| emblem.id.clone())
            .collect();
        for id in due {
            self.keep_emblem(&id);
        }
        if self.items.values().any(|(item, _)| item.rarity >= Rarity::Legendary && item.fully_upgraded()) {
            self.earn(Deed::FullyUpgraded);
        }
        if !self.keeps_emblem(&self.emblem) {
            self.emblem = starting();
        }
    }

    /// Wears an emblem the player keeps.
    pub(crate) fn wear_emblem(&mut self, number: u16) -> Result<Option<Done>, Refusal> {
        let emblem = emblems().get(usize::from(number)).ok_or(Refusal::NoSuchEmblem)?;
        if !self.keeps_emblem(&emblem.id) {
            return Err(Refusal::NotKept);
        }
        self.emblem.clone_from(&emblem.id);
        Ok(None)
    }

    /// Buys an emblem the Tailor sells today, at its price in Aurem, from the level it is sold at.
    pub(crate) fn buy_emblem(&mut self, number: u16, here: Here) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        let emblem = emblems().get(usize::from(number)).ok_or(Refusal::NoSuchEmblem)?;
        let Source::Sold { aurem, level } = emblem.source else { return Err(Refusal::NotSold) };
        if !sold_on(here.day).contains(&number) {
            return Err(Refusal::NotSold);
        }
        if self.keeps_emblem(&emblem.id) {
            return Err(Refusal::Kept);
        }
        if self.level() < level {
            return Err(Refusal::TooLow);
        }
        if self.materials.aurem < aurem {
            return Err(Refusal::Short);
        }
        self.materials.aurem -= aurem;
        self.keep_emblem(&emblem.id);
        Ok(None)
    }
}
