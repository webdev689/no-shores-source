//! Horses, items worn in the Mount slot: one to each coat in `content/gear/cosmetics.json`, the coat its hide, its
//! name its coat's place among the coats (`content/gear/rolled.json` names them in that order). A horse is Normal, of
//! level 1, with no stats, nodes or perks; it is carried and kept in the vault as gear is, never upgraded or
//! dismantled. The Tack sells them as it sold coats; a character starts with none.

use crate::character::{At, Character};
use crate::cosmetics::{CosmeticDef, CosmeticKind, cosmetics};
use crate::item::Item;
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;

/// The horse a new player's first is: the tutorial gives none, so the Tack sells it every day at the cheapest coat's
/// price, always in reach once the tutorial is over.
pub const FIRST_HORSE: &str = "bay";

/// Every coat, in the order a horse's name counts them.
fn coats() -> impl Iterator<Item = &'static CosmeticDef> {
    cosmetics().iter().filter(|found| found.kind == CosmeticKind::Coat)
}

/// A new horse in the coat `coat`, by the coat's id; none for an id that is no coat.
#[must_use]
pub fn horse(id: u32, coat: &str) -> Option<Item> {
    let place = coats().position(|found| found.id == coat)?;
    let mut made = Item::new(id, Kind::Horse, Rarity::Normal, 1, Slot::Mount);
    made.name = u8::try_from(place).ok()?;
    Some(made)
}

/// The coat a horse wears; none for an item that is no horse.
#[must_use]
pub fn coat_of(item: &Item) -> Option<&'static CosmeticDef> {
    (item.kind == Kind::Horse).then(|| coats().nth(usize::from(item.name))).flatten()
}

impl Character {
    /// Whether the character has a horse to ride: one worn in the Mount slot.
    #[must_use]
    pub fn may_ride(&self) -> bool {
        self.worn(Slot::Mount).is_some()
    }

    /// The coat of the horse worn, by its id; none with no horse worn.
    #[must_use]
    pub fn coat_worn(&self) -> Option<&'static str> {
        self.worn(Slot::Mount).and_then(coat_of).map(|found| found.id.as_str())
    }

    /// Whether the character holds a horse in `coat`, wherever it is.
    #[must_use]
    pub fn keeps_horse(&self, coat: &str) -> bool {
        self.items.values().any(|(item, _)| coat_of(item).is_some_and(|found| found.id == coat))
    }

    /// Gives a horse in `coat` to the pack, or wears it when `worn`.
    pub(crate) fn give_horse(&mut self, coat: &str, worn: bool) {
        let id = self.take_id();
        if let Some(made) = horse(id, coat) {
            self.items.insert(id, (made, if worn { At::Worn(Slot::Mount) } else { At::Carried }));
        }
    }

    /// A character kept while coats were cosmetics: each coat it kept becomes a horse in the pack, and the coat it
    /// wore its horse in the Mount slot. The coats leave its cosmetics as they are read, and its cosmetics are marked
    /// as a room with horses keeps them, so this is done once; beside that mark, a coat is what a room from before
    /// horses wrote back as its own default, and is dropped.
    pub(crate) fn horses_from_coats(&mut self) {
        let worn = self.cosmetics.unknown.remove("coat");
        let marked = std::mem::replace(&mut self.cosmetics.horses, true);
        let worn = worn.as_ref().and_then(serde_json::Value::as_str).unwrap_or_default();
        let is_coat = |id: &str| coats().any(|found| found.id == id);
        let mut kept: Vec<String> = self.cosmetics.kept.iter().filter(|id| is_coat(id)).cloned().collect();
        if is_coat(worn) && !kept.iter().any(|id| id == worn) {
            kept.push(worn.to_owned());
        }
        self.cosmetics.kept.retain(|id| !is_coat(id));
        if marked {
            return;
        }
        for coat in kept {
            if !self.keeps_horse(&coat) {
                self.give_horse(&coat, coat == worn && !self.may_ride());
            }
        }
    }
}
