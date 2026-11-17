//! What a player holds: every item, where each is (worn in a slot, carried, or in the vault), their Vestiges, their
//! materials and their XP; and what follows from it: their level, Prestige, Defense, each hand's Attack, and the traits
//! their worn gear gives. Destiny 1's limits hold: nine carried in each slot beside the one worn, ten Vestiges, and a
//! vault of twenty weapons, twenty armour and twenty Vestiges.

use crate::catalogue::catalogue;
use crate::item::Item;
use crate::kinds::{Kind, Slot, Stock};
use crate::power;
use crate::rarity::Rarity;
use std::collections::BTreeMap;

/// How many items each slot carries beside the one worn.
pub const CARRIED_MOST: usize = 9;
/// How many Vestiges a player carries.
pub const VESTIGES_MOST: usize = 10;
/// How many weapons, armour (cloaks and shields with it) and Vestiges the vault holds.
pub const VAULT_MOST: usize = 20;
/// The most Aurem held.
pub const AUREM_MOST: u32 = 25_000;
/// The most of any other material held.
pub const STOCK_MOST: u16 = 200;
/// The XP past level 20 that grows a Fruit of Dagon.
pub const FRUIT_XP: u64 = 20_000;

/// Where an item is.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum At {
    Worn(Slot),
    Carried,
    Vault,
}

/// A sealed drop: the colour it shows, the slot it holds an item for, and the level of that item.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Vestige {
    pub id: u32,
    pub rarity: Rarity,
    pub slot: Slot,
    pub level: u8,
}

/// Every material a player holds: Aurem, each stock's fragments and Essence, Fruit of Dagon, and each island's
/// resource in the catalogue's order.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Materials {
    pub aurem: u32,
    pub weapon_fragments: u16,
    pub armor_fragments: u16,
    pub weapon_essence: u16,
    pub armor_essence: u16,
    pub fruit: u16,
    pub resources: Vec<u16>,
}

impl Materials {
    #[must_use]
    pub fn fragments(&self, stock: Stock) -> u16 {
        match stock {
            Stock::Weapon => self.weapon_fragments,
            Stock::Armor => self.armor_fragments,
        }
    }

    #[must_use]
    pub fn essence(&self, stock: Stock) -> u16 {
        match stock {
            Stock::Weapon => self.weapon_essence,
            Stock::Armor => self.armor_essence,
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

/// A player's gear and progress.
#[derive(Clone, Debug, PartialEq, Eq)]
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
}

impl Character {
    /// A new player, as Destiny 1 starts a Guardian: a level 1 Normal sword in hand and level 1 Normal armour.
    #[must_use]
    pub fn starting() -> Self {
        let mut character = Self {
            xp: 0,
            fruit_grown: 0,
            items: BTreeMap::new(),
            vestiges: BTreeMap::new(),
            materials: Materials { resources: vec![0; catalogue().resources.len()], ..Materials::default() },
            next_id: 1,
        };
        for (kind, slot) in [
            (Kind::Sword, Slot::MainHand),
            (Kind::Head, Slot::Head),
            (Kind::Torso, Slot::Torso),
            (Kind::Arms, Slot::Arms),
            (Kind::Legs, Slot::Legs),
        ] {
            let id = character.take_id();
            character.items.insert(id, (Item::new(id, kind, Rarity::Normal, 1, slot), At::Worn(slot)));
        }
        character
    }

    /// A fresh number for an item or Vestige.
    pub fn take_id(&mut self) -> u32 {
        let id = self.next_id;
        self.next_id = self.next_id.wrapping_add(1).max(1);
        id
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

    /// How many items of this stock the vault holds: weapons, or armour with cloaks and shields.
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
        self.all_worn().map(|(_, item)| item.prestige()).sum()
    }

    /// The player's level, 1 to 30.
    #[must_use]
    pub fn level(&self) -> u8 {
        power::level(self.xp, self.prestige())
    }

    /// The Defense of everything worn: the four armour pieces and a shield.
    #[must_use]
    pub fn defense(&self) -> u32 {
        self.all_worn().filter_map(|(_, item)| item.defense()).sum()
    }

    /// The Attack of the weapon in a hand, if it holds one.
    #[must_use]
    pub fn attack(&self, hand: Slot) -> Option<u32> {
        self.worn(hand).and_then(Item::attack)
    }

    /// The traits the gear worn gives, each once however many items give it.
    #[must_use]
    pub fn traits(&self) -> Vec<&str> {
        let mut traits: Vec<&str> = self.all_worn().flat_map(|(_, item)| item.active_traits()).collect();
        traits.sort_unstable();
        traits.dedup();
        traits
    }

    /// Whether the gear worn gives a trait.
    #[must_use]
    pub fn has_trait(&self, id: &str) -> bool {
        self.all_worn().any(|(_, item)| item.active_traits().any(|active| active == id))
    }

    /// Adds XP to the player and to the items that earn it, a tenth more with Scholar worn. Past level 20 every
    /// 20,000 grows a Fruit of Dagon. `weapon` is the hand whose blow earned it, if one did: that weapon earns it, and
    /// every armour piece and shield worn does.
    pub fn earn_xp(&mut self, xp: u32, weapon: Option<Slot>) {
        let xp = if self.has_trait("scholar") { xp + xp / 10 } else { xp };
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
                At::Worn(slot) => item.kind.defends() || Some(*slot) == weapon,
                _ => false,
            };
            if earns {
                item.xp = item.xp.saturating_add(xp).min(item.xp_most());
            }
        }
    }
}
