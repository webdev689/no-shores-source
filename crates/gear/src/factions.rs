//! The factions, after Destiny 1's: three, each keeping one of the Arts. A player pledges to one at a time at its
//! counter, the first time freely and after that for Aurem; while pledged and wearing its cape, every kill earns the
//! faction reputation as well as XP, without end. Each rank of reputation earns something: the faction's emblem, its
//! dye, and from the third a package to collect at its counter. Like Destiny's, each sells gear of its own, armour
//! from the second rank and weapons from the third, Legendary and drawn in a colour no other gear wears. The faction of
//! an Art also raises it and sells its Core fragments (`art_levels.rs`). Its numbers are
//! `content/gear/factions.json`'s, which the client reads too.

use crate::asks::{Done, Here, Refusal};
use crate::catalogue::{NamedDef, catalogue};
use crate::character::{CARRIED_MOST, Character, VESTIGES_MOST, Vestige};
use crate::dice::{Dice, Purpose};
use crate::item::NAMED_LEVEL;
use crate::kinds::Slot;
use crate::rarity::Rarity;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

/// One faction: its number on the wire (from 1), key, name, the Art it keeps (by the Art's number), its cape (a named
/// item's id), and the emblem and dye its ranks earn.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct FactionDef {
    pub id: u8,
    pub key: String,
    pub name: String,
    pub art: u8,
    pub cape: String,
    pub emblem: String,
    pub dye: String,
}

/// Everything in `content/gear/factions.json` the rules read.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactionsDef {
    pub pledge_switch_aurem: u32,
    pub reputation_per_rank: u64,
    pub packages_from_rank: u32,
    pub package_aurem: u32,
    pub package_legendary_from_level: u8,
    pub package_legendary_share: f64,
    pub cape_aurem: u32,
    pub armour_rank: u32,
    pub armour_aurem: u32,
    pub weapon_rank: u32,
    pub weapon_aurem: u32,
    pub fragment_aurem: u32,
    pub fragment_rank: u32,
    pub factions: Vec<FactionDef>,
}

impl FactionsDef {
    /// A faction by its number.
    #[must_use]
    pub fn faction(&self, id: u8) -> Option<&FactionDef> {
        self.factions.iter().find(|faction| faction.id == id)
    }

    /// The faction that keeps an Art, by the Art's number.
    #[must_use]
    pub fn of_art(&self, art: u8) -> Option<&FactionDef> {
        self.factions.iter().find(|faction| faction.art == art)
    }

    /// The faction whose cape a named item is.
    #[must_use]
    pub fn of_cape(&self, named: &str) -> Option<&FactionDef> {
        self.factions.iter().find(|faction| faction.cape == named)
    }

    /// What a faction's piece costs in Aurem, and the rank it is sold from: the cape from none, to the pledged alone.
    #[must_use]
    pub fn terms(&self, named: &NamedDef) -> (u32, u32) {
        if named.kind.weapon() {
            (self.weapon_aurem, self.weapon_rank)
        } else if named.kind.armour() {
            (self.armour_aurem, self.armour_rank)
        } else {
            (self.cape_aurem, 0)
        }
    }
}

/// A faction's wares, by its number: the named items the catalogue says it sells, in the catalogue's order, which
/// numbers them on the wire; the cape first.
#[must_use]
pub fn wares(faction: u8) -> Vec<&'static NamedDef> {
    let Some(def) = factions().faction(faction) else { return Vec::new() };
    catalogue().items.iter().filter(|named| named.faction.as_deref() == Some(def.key.as_str())).collect()
}

/// The factions' file built into the rules, read once.
///
/// # Panics
///
/// Never for the file in the repository, which `the_factions_file_reads_whole` reads.
#[must_use]
pub fn factions() -> &'static FactionsDef {
    static READ: OnceLock<FactionsDef> = OnceLock::new();
    READ.get_or_init(|| {
        serde_json::from_str(include_str!("../../../content/gear/factions.json"))
            .expect("content/gear/factions.json reads: its test says so")
    })
}

/// Where a player stands with the factions: the one they are pledged to (0 none), and for each faction by its number
/// less one, the reputation earned with it and how many of its packages they have collected.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Allegiance {
    pub pledge: u8,
    pub reputation: Vec<u64>,
    pub collected: Vec<u32>,
    /// Keys this room does not know, from a later room's save, written back as read so a rollback loses nothing.
    #[serde(flatten)]
    pub unknown: crate::character::UnknownKeys,
}

impl Allegiance {
    /// As kept, made whole: a pledge to no faction the rules know is none, and a count for every faction.
    #[must_use]
    pub fn kept(mut self) -> Self {
        let count = factions().factions.len();
        if factions().faction(self.pledge).is_none() {
            self.pledge = 0;
        }
        self.reputation.resize(count, 0);
        self.collected.resize(count, 0);
        self
    }
}

/// A faction's place in the lists, by its number.
fn place(faction: u8) -> Option<usize> {
    factions().factions.iter().position(|found| found.id == faction)
}

impl Character {
    /// The reputation earned with a faction.
    #[must_use]
    pub fn reputation(&self, faction: u8) -> u64 {
        place(faction).and_then(|at| self.allegiance.reputation.get(at)).copied().unwrap_or(0)
    }

    /// The rank reached with a faction: one for each whole share of reputation, without end.
    #[must_use]
    pub fn rank(&self, faction: u8) -> u32 {
        u32::try_from(self.reputation(faction) / factions().reputation_per_rank.max(1)).unwrap_or(u32::MAX)
    }

    /// The packages a faction holds for the player to collect: one for each rank from the first that gives one, less
    /// those collected.
    #[must_use]
    pub fn packages(&self, faction: u8) -> u32 {
        let earned = self.rank(faction).saturating_sub(factions().packages_from_rank.saturating_sub(1));
        let collected = place(faction).and_then(|at| self.allegiance.collected.get(at)).copied().unwrap_or(0);
        earned.saturating_sub(collected)
    }

    /// The faction whose cape the player wears, if any.
    #[must_use]
    pub fn cape_worn(&self) -> Option<u8> {
        let cloak = self.worn(Slot::Cloak)?;
        factions().of_cape(cloak.named.as_deref()?).map(|faction| faction.id)
    }

    /// A kill's reputation: as much as its XP, to the faction pledged, while its cape is worn.
    pub(crate) fn earn_reputation(&mut self, xp: u32) {
        let pledge = self.allegiance.pledge;
        if pledge == 0 || self.cape_worn() != Some(pledge) {
            return;
        }
        self.allegiance = std::mem::take(&mut self.allegiance).kept();
        if let Some(reputation) = place(pledge).and_then(|at| self.allegiance.reputation.get_mut(at)) {
            *reputation = reputation.saturating_add(u64::from(xp));
        }
    }

    /// Pledges to a faction at its counter: freely the first time, for Aurem after; reputation with each is kept.
    pub(crate) fn pledge(&mut self, faction: u8, here: Here) -> Result<Option<Done>, Refusal> {
        factions().faction(faction).ok_or(Refusal::NoSuchFaction)?;
        if !here.social {
            return Err(Refusal::NotHere);
        }
        if self.allegiance.pledge == faction {
            return Err(Refusal::Pledged);
        }
        let cost = if self.allegiance.pledge == 0 { 0 } else { factions().pledge_switch_aurem };
        if self.materials.aurem < cost {
            return Err(Refusal::Short);
        }
        self.materials.aurem -= cost;
        self.allegiance = std::mem::take(&mut self.allegiance).kept();
        self.allegiance.pledge = faction;
        Ok(None)
    }

    /// Buys one of a faction's wares at its counter, by its place among them, carried with its slot's items: the cape
    /// pledged to it, one kept at a time, at any level; its armour and weapons from their ranks, pledged or not, as a
    /// switch keeps the reputation earned, and from level 20, the level they are made at. A weapon may roll an
    /// element, as every weapon made does.
    pub(crate) fn buy_faction_ware(
        &mut self,
        faction: u8,
        ware: u8,
        here: Here,
        dice: &Dice,
    ) -> Result<Option<Done>, Refusal> {
        factions().faction(faction).ok_or(Refusal::NoSuchFaction)?;
        if !here.social {
            return Err(Refusal::NotHere);
        }
        let named = *wares(faction).get(usize::from(ware)).ok_or(Refusal::NoSuchItem)?;
        let (aurem, rank) = factions().terms(named);
        let slot = named.kind.slot();
        if slot == Slot::Cloak {
            if self.allegiance.pledge != faction {
                return Err(Refusal::NotPledged);
            }
            if self.items.values().any(|(item, _)| item.named.as_deref() == Some(named.id.as_str())) {
                return Err(Refusal::Kept);
            }
        } else if self.rank(faction) < rank {
            return Err(Refusal::RankTooLow);
        } else if self.level() < NAMED_LEVEL {
            return Err(Refusal::TooLow);
        }
        if self.carried_in(slot) >= CARRIED_MOST {
            return Err(Refusal::CarriedFull);
        }
        if self.materials.aurem < aurem {
            return Err(Refusal::Short);
        }
        self.materials.aurem -= aurem;
        let id = self.take_id();
        let mut item = crate::vestige::named_item(id, named, slot);
        item.element = crate::element::rolled(item.kind, item.rarity, dice);
        self.items.insert(id, (item, crate::character::At::Carried));
        Ok(None)
    }

    /// Collects one of a faction's packages at its counter: a Vestige at the player's level for a slot of the dice's,
    /// Rare or now and then Legendary, and Aurem.
    pub(crate) fn collect_package(&mut self, faction: u8, here: Here, dice: &Dice) -> Result<Option<Done>, Refusal> {
        let at = place(faction).ok_or(Refusal::NoSuchFaction)?;
        if !here.social {
            return Err(Refusal::NotHere);
        }
        if self.packages(faction) == 0 {
            return Err(Refusal::NoPackage);
        }
        if self.vestiges_held(false) >= VESTIGES_MOST {
            return Err(Refusal::VestigesFull);
        }
        let numbers = factions();
        let level = self.level().clamp(1, NAMED_LEVEL);
        let legendary = level >= numbers.package_legendary_from_level
            && dice.roll(Purpose::Package, 0) < numbers.package_legendary_share;
        let rarity = if legendary { Rarity::Legendary } else { Rarity::Rare };
        let slot = Slot::VESTIGE[dice.pick(Purpose::Package, 1, Slot::VESTIGE.len())];
        let id = self.take_id();
        self.vestiges.insert(id, (Vestige { id, rarity, slot, level }, false));
        self.materials.add_aurem(numbers.package_aurem);
        self.allegiance = std::mem::take(&mut self.allegiance).kept();
        self.allegiance.collected[at] += 1;
        Ok(None)
    }
}

/// Whether a named item is one a faction sells, which no Vestige or Shape offers.
#[must_use]
pub fn sold_by_faction(named: &str) -> bool {
    catalogue().named(named).is_some_and(|found| found.faction.is_some())
}
