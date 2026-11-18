//! One item a player holds: what it is, its level, its XP and the nodes bought and chosen; and the power it carries,
//! a weapon's Attack and armour's Defense and Prestige, each rising by equal steps as its upgrades are bought.

use crate::element::Element;
use crate::grid::{Column, Cost, column_xp, columns, cost, node_offsets};
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;

/// No node chosen in a column.
pub const NONE_CHOSEN: u8 = u8::MAX;
/// The level of every Legendary and Atheric: Destiny 1's legendaries and exotics were level 20 gear.
pub const NAMED_LEVEL: u8 = 20;
/// The most an item's level is.
pub const ITEM_LEVEL_MOST: u8 = 20;

/// An item as a player holds it. Its own number is the player's for it; a named item's traits are copied from the
/// catalogue when it is made, so the item stays what it was. `bucket` is the slot whose carried items it counts
/// among: a weapon found for the off hand is carried with the off hand's.
#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
pub struct Item {
    pub id: u32,
    pub kind: Kind,
    pub rarity: Rarity,
    pub level: u8,
    /// The named item it is, or none for a rolled one.
    pub named: Option<String>,
    /// A rolled item's name, among its kind's for its rarity.
    pub name: u8,
    /// The traits each of its trait columns offers, in order.
    pub layout: Vec<Vec<String>>,
    /// The island resource its nodes ask for, as its place in the catalogue's list.
    pub resource: Option<u8>,
    /// A Breach's Legendary armour, whose upgrades climb further in Prestige.
    pub breach: bool,
    pub xp: u32,
    /// The nodes bought, one bit each, column after column.
    pub bought: u32,
    /// The node chosen in each column, or `NONE_CHOSEN`.
    pub chosen: Vec<u8>,
    pub bucket: Slot,
    /// A weapon's element, if it was made with one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub element: Option<Element>,
}

impl Item {
    /// A new item: no XP, no nodes bought.
    #[must_use]
    pub fn new(id: u32, kind: Kind, rarity: Rarity, level: u8, bucket: Slot) -> Self {
        let mut item = Self {
            id,
            kind,
            rarity,
            level: level.clamp(1, ITEM_LEVEL_MOST),
            named: None,
            name: 0,
            layout: Vec::new(),
            resource: None,
            breach: false,
            xp: 0,
            bought: 0,
            chosen: Vec::new(),
            bucket,
            element: None,
        };
        item.chosen = vec![NONE_CHOSEN; item.columns().len()];
        item
    }

    /// The item as a kept character should hold it, whatever the keeping did to it: its number its key's, its level
    /// and XP within their bounds, a choice for each of its columns naming only a node bought, nodes only it has, and
    /// a resource the catalogue lists.
    #[must_use]
    pub fn kept(mut self, id: u32, resources: usize) -> Self {
        self.id = id;
        self.level = self.level.clamp(1, ITEM_LEVEL_MOST);
        self.xp = self.xp.min(self.xp_most());
        let columns = self.columns();
        let shown = &self;
        let every = columns
            .iter()
            .enumerate()
            .flat_map(|(column, kind)| (0..kind.nodes()).filter_map(move |node| shown.node_bit(column, node)))
            .fold(0, |all, bit| all | bit);
        self.bought &= every;
        self.chosen.resize(columns.len(), NONE_CHOSEN);
        for column in 0..columns.len() {
            let node = self.chosen[column];
            if node != NONE_CHOSEN && !self.has(column, node) {
                self.chosen[column] = NONE_CHOSEN;
            }
        }
        if self.resource.is_some_and(|resource| usize::from(resource) >= resources) {
            self.resource = None;
        }
        if !self.kind.weapon() {
            self.element = None;
        }
        self
    }

    /// Its columns of nodes; a cloak has none.
    #[must_use]
    pub fn columns(&self) -> &'static [Column] {
        if self.kind == Kind::Cloak { &[] } else { columns(self.rarity, self.kind.weapon()) }
    }

    /// The XP that unlocks its last column; it earns no more.
    #[must_use]
    pub fn xp_most(&self) -> u32 {
        self.columns().len().checked_sub(1).map_or(0, |last| column_xp(self.rarity, last))
    }

    /// Whether its XP has reached a column.
    #[must_use]
    pub fn unlocked(&self, column: usize) -> bool {
        column < self.columns().len() && self.xp >= column_xp(self.rarity, column)
    }

    /// The bit a node keeps in `bought`, if the column holds it.
    #[must_use]
    pub fn node_bit(&self, column: usize, node: u8) -> Option<u32> {
        let layout = self.columns();
        let kind = layout.get(column)?;
        (node < kind.nodes()).then(|| {
            let (offsets, _) = node_offsets(layout);
            1 << (offsets[column] + node)
        })
    }

    #[must_use]
    pub fn has(&self, column: usize, node: u8) -> bool {
        self.node_bit(column, node).is_some_and(|bit| self.bought & bit != 0)
    }

    /// Whether every node of every column is bought: it is fully upgraded, as Destiny 1's weapon was once every node
    /// was lit. A piece with no nodes never is.
    #[must_use]
    pub fn fully_upgraded(&self) -> bool {
        let (_, nodes) = node_offsets(self.columns());
        nodes > 0 && self.bought == (1_u32 << nodes) - 1
    }

    /// The upgrades bought, and how many it has.
    #[must_use]
    pub fn upgrades(&self) -> (u32, u32) {
        let upgrades = self.columns().iter().enumerate().filter(|(_, column)| **column == Column::Upgrade);
        upgrades.fold((0, 0), |(bought, total), (index, _)| (bought + u32::from(self.has(index, 0)), total + 1))
    }

    /// The traits a column offers: none for an upgrade.
    #[must_use]
    pub fn traits_of(&self, column: usize) -> &[String] {
        let layout = self.columns();
        if !layout.get(column).is_some_and(|kind| kind.traits()) {
            return &[];
        }
        let place = layout[..column].iter().filter(|kind| kind.traits()).count();
        self.layout.get(place).map_or(&[], Vec::as_slice)
    }

    /// The traits it gives while worn: the one chosen in each trait column, if bought.
    pub fn active_traits(&self) -> impl Iterator<Item = &str> {
        self.chosen.iter().enumerate().filter_map(|(column, &node)| {
            (node != NONE_CHOSEN && self.has(column, node))
                .then(|| self.traits_of(column).get(usize::from(node)).map(String::as_str))
                .flatten()
        })
    }

    /// What a column's node costs.
    #[must_use]
    pub fn cost_of(&self, column: usize) -> Cost {
        cost(self.rarity, self.columns(), column)
    }

    /// The Essence its bought nodes cost.
    #[must_use]
    pub fn essence_spent(&self) -> u32 {
        let layout = self.columns();
        let bought = |column: usize| (0..layout[column].nodes()).filter(|node| self.has(column, *node)).count();
        (0..layout.len()).map(|column| u32::from(self.cost_of(column).essence) * bought(column) as u32).sum()
    }

    /// Its Attack, if it is a weapon: a Legendary 248 to 300, an Atheric 260 to 300, a lesser one 15 times its level
    /// times its rarity's share at its most and 0.85 of that before its upgrades.
    #[must_use]
    pub fn attack(&self) -> Option<u32> {
        if !self.kind.weapon() {
            return None;
        }
        let (start, most) = match self.rarity {
            Rarity::Legendary => (248, 300),
            Rarity::Atheric => (260, 300),
            lesser => lesser_range(15.0 * f64::from(self.level) * lesser.share()),
        };
        Some(self.stepped(start, most))
    }

    /// Its Prestige, if it is armour of level 20: a Rare 13 to 15, a Legendary 18 to 27 (a Breach's to 30), an
    /// Atheric 21 to 30.
    #[must_use]
    pub fn prestige(&self) -> u32 {
        if !self.kind.armour() {
            return 0;
        }
        let (bought, _) = self.upgrades();
        match self.rarity {
            Rarity::Rare if self.level >= NAMED_LEVEL => 13 + bought,
            Rarity::Legendary => 18 + bought * if self.breach { 4 } else { 3 },
            Rarity::Atheric => 21 + 3 * bought,
            _ => 0,
        }
    }

    /// Its Defense, if it is armour or a shield: 45 times its slot's share times its defense level, which is 20 plus a
    /// third of its Prestige when it carries some, and otherwise rises as a lesser weapon's Attack does.
    #[must_use]
    pub fn defense(&self) -> Option<u32> {
        if !self.kind.defends() {
            return None;
        }
        let full = 45.0 * self.kind.defense_share();
        let prestige = self.prestige();
        if prestige > 0 {
            return Some((full * (20.0 + f64::from(prestige) / 3.0)).round() as u32);
        }
        let (start, most) = lesser_range(full * f64::from(self.level) * self.rarity.share());
        Some(self.stepped(start, most))
    }

    /// A number that climbs from `start` to `most` by equal steps as its upgrades are bought.
    fn stepped(&self, start: u32, most: u32) -> u32 {
        let (bought, total) = self.upgrades();
        if total == 0 {
            return most;
        }
        start + ((most - start) * bought * 2 + total) / (2 * total)
    }
}

/// A lesser item's power before and after its upgrades: its most, rounded, and 0.85 of that.
fn lesser_range(most: f64) -> (u32, u32) {
    let most = most.round().max(1.0) as u32;
    ((f64::from(most) * 0.85).round() as u32, most)
}
