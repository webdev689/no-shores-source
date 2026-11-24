//! What a player holds: every item, where each is (worn in a slot, carried, or in the vault), their Vestiges, their
//! materials, their mail and their XP; and what follows from it: their level, Prestige, Defense, each loadout's Attack, and the
//! traits their worn gear gives. Destiny 1's limits hold: nine carried in each slot beside the one worn, ten Vestiges,
//! and a vault of twenty weapons, twenty armour and twenty Vestiges.

use crate::catalogue::catalogue;
use crate::item::Item;
use crate::kinds::{Group, Kind, Slot, Stock};
use crate::power;
use crate::rarity::Rarity;
use crate::source::Source;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// How many items each slot carries beside the one worn.
pub const CARRIED_MOST: usize = 9;
/// How many Vestiges a player carries.
pub const VESTIGES_MOST: usize = 10;
/// How many weapons, armour (cloaks with it) and Vestiges the vault holds.
pub const VAULT_MOST: usize = 20;
/// The most Aurem held.
pub const AUREM_MOST: u32 = 25_000;
/// The most of any other material held.
pub const STOCK_MOST: u16 = 200;
/// The XP past level 20 that grows a Fruit of Dagon.
pub const FRUIT_XP: u64 = 20_000;

/// Where an item is.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub enum At {
    Worn(Slot),
    Carried,
    Vault,
}

/// A sealed drop: the colour it shows, the slot it holds an item for, and the level of that item.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub struct Vestige {
    pub id: u32,
    pub rarity: Rarity,
    pub slot: Slot,
    pub level: u8,
    /// The content it came from, which the item it opens to keeps; a save from before sources reads as the world's.
    #[serde(default, skip_serializing_if = "Source::is_world", deserialize_with = "crate::source::known_source")]
    pub source: Source,
    /// Keys this room does not know, from a later room's save, written back as read, so a room rolled back to
    /// this one or later keeps them.
    #[serde(flatten, default)]
    pub unknown: UnknownKeys,
}

impl Vestige {
    /// A Vestige of its own from the world, with nothing a later room wrote on it.
    #[must_use]
    pub fn new(id: u32, rarity: Rarity, slot: Slot, level: u8) -> Self {
        Vestige { id, rarity, slot, level, source: Source::World, unknown: UnknownKeys::new() }
    }

    /// The same Vestige from `source`.
    #[must_use]
    pub fn from(self, source: Source) -> Self {
        Vestige { source, ..self }
    }
}

/// Every material a player holds: Aurem, each stock's fragments and Essence, Fruit of Dagon, and each island's
/// resource in the catalogue's order.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
pub struct Materials {
    pub aurem: u32,
    pub weapon_fragments: u16,
    pub armor_fragments: u16,
    pub weapon_essence: u16,
    pub armor_essence: u16,
    pub fruit: u16,
    pub resources: Vec<u16>,
    /// Ammo crates carried (`ammo.rs`).
    #[serde(default)]
    pub crates: u16,
    /// The ship's own materials (`ship::materials`).
    #[serde(default)]
    pub ship: crate::ship::materials::ShipStock,
    /// Shapes, which only Shape takes (`shape.rs`).
    #[serde(default)]
    pub shapes: u16,
    /// Keys this room does not know, from a later room's save, written back as read, so a room rolled back to
    /// this one or later keeps them.
    #[serde(flatten)]
    pub unknown: crate::character::UnknownKeys,
}

impl Materials {
    #[must_use]
    pub fn fragments(&self, stock: Stock) -> u16 {
        match stock {
            Stock::Weapon => self.weapon_fragments,
            Stock::Armor => self.armor_fragments,
            Stock::Ship => 0,
        }
    }

    #[must_use]
    pub fn essence(&self, stock: Stock) -> u16 {
        match stock {
            Stock::Weapon => self.weapon_essence,
            Stock::Armor => self.armor_essence,
            Stock::Ship => 0,
        }
    }

    #[must_use]
    pub fn resource(&self, index: usize) -> u16 {
        self.resources.get(index).copied().unwrap_or(0)
    }

    /// Adds Aurem, up to its most.
    pub fn add_aurem(&mut self, aurem: u32) {
        self.aurem = self.aurem.saturating_add(aurem).min(AUREM_MOST);
    }

    /// Adds fragments, Essence or a resource to a stock, up to its most; how much was taken.
    pub fn add(&mut self, what: Stuff, count: u16) -> u16 {
        let held = match what {
            Stuff::Fragments(Stock::Weapon) => &mut self.weapon_fragments,
            Stuff::Fragments(Stock::Armor) => &mut self.armor_fragments,
            Stuff::Essence(Stock::Weapon) => &mut self.weapon_essence,
            Stuff::Essence(Stock::Armor) => &mut self.armor_essence,
            // A ship's materials are its own stock's.
            Stuff::Fragments(Stock::Ship) | Stuff::Essence(Stock::Ship) => return 0,
            Stuff::Fruit => &mut self.fruit,
            Stuff::Resource(index) => {
                if self.resources.len() <= index {
                    self.resources.resize(index + 1, 0);
                }
                &mut self.resources[index]
            }
        };
        let taken = count.min(STOCK_MOST.saturating_sub(*held));
        *held += taken;
        taken
    }
}

/// A stock of material other than Aurem.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Stuff {
    Fragments(Stock),
    Essence(Stock),
    Fruit,
    Resource(usize),
}

/// The keys of a kept object that this room's rules do not read.
pub type UnknownKeys = serde_json::Map<String, serde_json::Value>;

/// A player's gear and progress.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub struct Character {
    pub xp: u64,
    /// The Fruit of Dagon XP past level 20 has grown so far.
    pub fruit_grown: u64,
    pub items: BTreeMap<u32, (Item, At)>,
    /// Vestiges, each carried or in the vault.
    pub vestiges: BTreeMap<u32, (Vestige, bool)>,
    pub materials: Materials,
    /// The number the next item or Vestige takes.
    pub next_id: u32,
    /// The emblems the player keeps, by id, and the one they wear (`emblems.rs`).
    #[serde(default)]
    pub emblems: Vec<String>,
    #[serde(default)]
    pub emblem: String,
    /// The Art they wear and each Art's Core (`arts.rs`).
    #[serde(default)]
    pub arts: crate::arts::WornArts,
    /// The Ranged loadout's ammunition, as a share of its capacity in `ammo::AMMO_FULL` parts.
    #[serde(default = "crate::ammo::full")]
    pub ammo: u16,
    /// What they have done this day and this week (`activity.rs`).
    #[serde(default)]
    pub activity: crate::activity::Activity,
    /// How far they are through the story (`story.rs`).
    #[serde(default = "crate::story::Story::kept_before")]
    pub story: crate::story::Story,
    /// Their ship's hull, canvas and men, each in ten-thousandths of whole, kept until it is repaired (the sea
    /// room's).
    #[serde(default = "whole_ship")]
    pub ship: [u16; 3],
    /// Where the sea last kept their ship, to the whole metre; none before it first put to sea.
    #[serde(default)]
    pub ship_at: Option<[i64; 2]>,
    /// The experience the ship has earned in sea fights, which raises it to level 20 (`ship.rs`).
    #[serde(default)]
    pub ship_xp: u64,
    /// Whether the ship has been fitted with its first modules; a ship never fitted is, as it is read.
    #[serde(default)]
    pub ship_fitted: bool,
    /// Its named officers (`crew.rs`).
    #[serde(default)]
    pub crew: crate::crew::Crew,
    /// The sea islands' wrecks they have scavenged: each island by its seed with its wrecks' numbers, the latest
    /// `SCAVENGED_KEPT` islands kept, so an island's room opened again pays them nothing again.
    #[serde(default)]
    pub scavenged: Vec<(u64, Vec<u8>)>,
    /// The faction pledged to, and the reputation earned with each (`factions.rs`).
    #[serde(default)]
    pub allegiance: crate::factions::Allegiance,
    /// The dyes and bardings kept, and the one of each worn (`cosmetics.rs`).
    #[serde(default)]
    pub cosmetics: crate::cosmetics::Cosmetics,
    /// Their place in every quest, and the fragment choices their roads gave (`quests.rs`).
    #[serde(default, deserialize_with = "crate::quests::lenient")]
    pub quests: crate::quests::QuestLog,
    /// The game's letters waiting at the mail counter, oldest first (`mail.rs`).
    #[serde(default)]
    pub mail: Vec<crate::mail::Letter>,
    /// The lore's chapters found, by their keys (`lore.rs`), in the order found; one the file no longer holds kept.
    #[serde(default)]
    pub lore: Vec<String>,
    /// Their part in their guild's week (`guild.rs`).
    #[serde(default)]
    pub guild: crate::guild::GuildWeek,
    /// What their guild's outposts give them, as the room was last told (`guild.rs`); never kept.
    #[serde(skip)]
    pub boons: crate::guild::Boons,
    /// The body as it last left a room, given back on a return (`left.rs`); none before it first leaves one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub left: Option<crate::left::Left>,
    /// The outpost's errand it carries while the accounts have not answered it (`errand.rs`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub errand: Option<crate::errand::Carried>,
    /// Where they last left the overworld or a social space, to log back in there (`last.rs`); none before either.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last: Option<crate::last::Last>,
    /// Keys this room does not know, from a later room's save, written back as read, so a room rolled back to
    /// this one or later keeps them.
    #[serde(flatten)]
    pub unknown: crate::character::UnknownKeys,
}

/// How many islands' scavenged wrecks a character keeps: far more than stand round one ship before they fade.
pub const SCAVENGED_KEPT: usize = 16;

/// A ship's hull, canvas or men whole, in ten-thousandths.
pub const SHIP_WHOLE: u16 = 10_000;

/// A ship as sound as it was built.
fn whole_ship() -> [u16; 3] {
    [SHIP_WHOLE; 3]
}

impl Character {
    /// The wrecks they have scavenged on the island of `seed`.
    #[must_use]
    pub fn scavenged_on(&self, seed: u64) -> &[u8] {
        self.scavenged.iter().find(|(island, _)| *island == seed).map_or(&[], |(_, wrecks)| wrecks.as_slice())
    }

    /// Notes a wreck of the island of `seed` scavenged; that island becomes the latest kept.
    pub fn scavenge(&mut self, seed: u64, wreck: u8) {
        let mut wrecks = match self.scavenged.iter().position(|(island, _)| *island == seed) {
            Some(at) => self.scavenged.remove(at).1,
            None => Vec::new(),
        };
        if !wrecks.contains(&wreck) {
            wrecks.push(wreck);
        }
        self.scavenged.push((seed, wrecks));
        if self.scavenged.len() > SCAVENGED_KEPT {
            self.scavenged.remove(0);
        }
    }

    /// A new player, arriving with no weapon and no armour: only their ship's first modules.
    #[must_use]
    pub fn starting() -> Self {
        Self::new_player(false)
    }

    /// A new player wearing a level 1 Normal sword for Melee and level 1 Normal armour: the Test Ground's, whose
    /// fights are tried at once, and the scripted players'.
    #[must_use]
    pub fn kitted() -> Self {
        Self::new_player(true)
    }

    /// The Test Ground's player: kitted, every Art mastered, and at a quest's `kept` task, as a character kept before:
    /// no stranger stands on the Test Ground, and its stall serves the houses.
    #[must_use]
    pub fn test_grounds() -> Self {
        let mut character = Self::kitted();
        character.arts = crate::arts::WornArts::mastered();
        for quest in crate::quests::quests().quests.iter() {
            if let Some(kept) = &quest.kept {
                let road = crate::quests::Road { task: kept.clone(), ..crate::quests::Road::default() };
                character.quests.roads.insert(quest.id.clone(), road);
            }
        }
        character.quests = std::mem::take(&mut character.quests).kept();
        character
    }

    /// A new player, `kit` wearing the sword and armour, numbered before the ship's modules.
    fn new_player(kit: bool) -> Self {
        let mut character = Self {
            xp: 0,
            fruit_grown: 0,
            items: BTreeMap::new(),
            vestiges: BTreeMap::new(),
            materials: Materials { resources: vec![0; catalogue().resources.len()], ..Materials::default() },
            next_id: 1,
            emblems: Vec::new(),
            emblem: crate::emblems::starting(),
            arts: crate::arts::WornArts::unearned(),
            ammo: crate::ammo::AMMO_FULL,
            activity: crate::activity::Activity::default(),
            story: crate::story::Story::default(),
            ship: whole_ship(),
            ship_at: None,
            ship_xp: 0,
            ship_fitted: false,
            crew: crate::crew::Crew::default(),
            scavenged: Vec::new(),
            allegiance: crate::factions::Allegiance::default().kept(),
            cosmetics: crate::cosmetics::Cosmetics::default(),
            quests: crate::quests::QuestLog::begun(),
            mail: Vec::new(),
            lore: Vec::new(),
            guild: crate::guild::GuildWeek::default(),
            boons: crate::guild::Boons::default(),
            left: None,
            errand: None,
            last: None,
            unknown: UnknownKeys::new(),
        };
        let pieces = [
            (Kind::Sword, Slot::Melee),
            (Kind::Head, Slot::Head),
            (Kind::Torso, Slot::Torso),
            (Kind::Arms, Slot::Arms),
            (Kind::Legs, Slot::Legs),
        ];
        for (kind, slot) in pieces.into_iter().filter(|_| kit) {
            let id = character.take_id();
            character.items.insert(id, (Item::new(id, kind, Rarity::Normal, 1, slot), At::Worn(slot)));
        }
        character.fit_first_modules();
        character.earn_due();
        character
    }

    /// A fresh number for an item, Vestige or letter, never one it already holds.
    pub fn take_id(&mut self) -> u32 {
        let id = self.id_to_take();
        self.next_id = id.wrapping_add(1).max(1);
        id
    }

    /// The number `take_id` gives next: a smith's ware is drawn by it before it is bought.
    #[must_use]
    pub fn id_to_take(&self) -> u32 {
        let mut id = self.next_id;
        while self.items.contains_key(&id)
            || self.vestiges.contains_key(&id)
            || self.crew.officers.contains_key(&id)
            || self.mail.iter().any(|letter| letter.id == id)
        {
            id = id.wrapping_add(1).max(1);
        }
        id
    }

    /// Whether the next number taken would be clear of these.
    #[cfg(test)]
    pub(crate) fn take_id_clear_of(&self, ids: &[u32]) -> bool {
        !ids.contains(&self.id_to_take())
    }

    #[must_use]
    pub fn item(&self, id: u32) -> Option<&Item> {
        self.items.get(&id).map(|(item, _)| item)
    }

    #[must_use]
    pub fn at(&self, id: u32) -> Option<At> {
        self.items.get(&id).map(|(_, at)| *at)
    }

    /// The item worn in a slot.
    #[must_use]
    pub fn worn(&self, slot: Slot) -> Option<&Item> {
        self.items.values().find(|(_, at)| *at == At::Worn(slot)).map(|(item, _)| item)
    }

    /// Everything worn, slot by slot.
    pub fn all_worn(&self) -> impl Iterator<Item = (Slot, &Item)> {
        self.items.values().filter_map(|(item, at)| match at {
            At::Worn(slot) => Some((*slot, item)),
            _ => None,
        })
    }

    /// How many items a slot carries beside the one worn.
    #[must_use]
    pub fn carried_in(&self, bucket: Slot) -> usize {
        self.items.values().filter(|(item, at)| *at == At::Carried && item.bucket == bucket).count()
    }

    /// How many items of this stock the vault holds: weapons, or armour with cloaks.
    #[must_use]
    pub fn vaulted(&self, stock: Stock) -> usize {
        self.items.values().filter(|(item, at)| *at == At::Vault && item.kind.stock() == stock).count()
    }

    /// How many Vestiges are carried, or in the vault.
    #[must_use]
    pub fn vestiges_held(&self, vaulted: bool) -> usize {
        self.vestiges.values().filter(|(_, in_vault)| *in_vault == vaulted).count()
    }

    /// The Prestige of the armour worn.
    #[must_use]
    pub fn prestige(&self) -> u32 {
        self.all_worn().filter(|(slot, _)| !slot.ship()).map(|(_, item)| item.prestige()).sum()
    }

    /// The player's level, 1 to 30.
    #[must_use]
    pub fn level(&self) -> u8 {
        power::level(self.xp, self.prestige())
    }

    /// How far the player is to their next level, 0 to 1, and what it still takes: XP below level 20, Prestige past
    /// it; at the highest, full and nothing.
    #[must_use]
    pub fn to_next(&self) -> (f64, u32) {
        power::to_next(self.xp, self.prestige())
    }

    /// How far the next Fruit of Dagon has grown, 0 to 1; none until the player's XP reaches level 20's.
    #[must_use]
    pub fn fruit_growing(&self) -> Option<f64> {
        let past = self.xp.checked_sub(power::xp_for_level(power::XP_LEVEL_MOST))?;
        Some((past % FRUIT_XP) as f64 / FRUIT_XP as f64)
    }

    /// The Defense of everything worn: the four armour pieces.
    #[must_use]
    pub fn defense(&self) -> u32 {
        self.all_worn().filter(|(slot, _)| !slot.ship()).filter_map(|(_, item)| item.defense()).sum()
    }

    /// The Attack of the loadout worn in a slot, if one is.
    #[must_use]
    pub fn attack(&self, loadout: Slot) -> Option<u32> {
        self.worn(loadout).and_then(Item::attack)
    }

    /// The traits the gear worn gives while a loadout is drawn (`Slot::Melee` or `Slot::Ranged`), each once however
    /// many items give it: the armour's and that loadout's. A loadout is one item with one set of perks, so the other
    /// one's wait until it is drawn.
    #[must_use]
    pub fn traits(&self, drawn: Slot) -> Vec<&str> {
        let mut traits: Vec<&str> = self.drawing(drawn).flat_map(Item::active_traits).collect();
        traits.sort_unstable();
        traits.dedup();
        traits
    }

    /// Whether the gear worn gives a trait while a loadout is drawn.
    #[must_use]
    pub fn has_drawn_trait(&self, id: &str, drawn: Slot) -> bool {
        self.drawing(drawn).any(|item| item.active_traits().any(|active| active == id))
    }

    /// Whether the armour worn gives a trait, whichever loadout is drawn.
    #[must_use]
    pub fn has_trait(&self, id: &str) -> bool {
        self.all_worn()
            .any(|(slot, item)| slot.group() == Group::Armour && item.active_traits().any(|active| active == id))
    }

    /// Everything worn that gives its traits while a loadout is drawn: the armour and that loadout; never the ship's
    /// modules, whose traits are the ship's (`ship_traits`).
    fn drawing(&self, drawn: Slot) -> impl Iterator<Item = &Item> {
        let gives = move |slot: &Slot| slot.group() == Group::Armour || *slot == drawn;
        self.all_worn().filter(move |(slot, _)| gives(slot)).map(|(_, item)| item)
    }

    /// Adds XP to the player and to the items that earn it, a tenth more with Scholar worn. Past level 20 every
    /// 20,000 grows a Fruit of Dagon. `weapon` is the loadout whose blow earned it, if one did: that loadout earns it,
    /// and every armour piece worn does.
    pub fn earn_xp(&mut self, xp: u32, weapon: Option<Slot>) {
        let xp = if self.has_trait("scholar") { xp.saturating_add(xp / 10) } else { xp };
        self.xp = self.xp.saturating_add(u64::from(xp));
        let past = self.xp.saturating_sub(power::xp_for_level(power::XP_LEVEL_MOST));
        let grown = past / FRUIT_XP;
        if grown > self.fruit_grown {
            let new = u16::try_from(grown - self.fruit_grown).unwrap_or(u16::MAX);
            self.materials.add(Stuff::Fruit, new);
            self.fruit_grown = grown;
        }
        for (item, at) in self.items.values_mut() {
            let earns = match at {
                At::Worn(slot) => item.kind.armour() || Some(*slot) == weapon,
                _ => false,
            };
            if earns {
                item.xp = item.xp.saturating_add(xp).min(item.xp_most());
            }
        }
        self.earn_due();
    }
}
