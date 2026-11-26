//! What an account's characters share: the vault (its items and Vestiges) and Aurem. The accounts keep it apart from
//! every character; a room holding a character joins it in, so every rule sees one whole character, and parts it out
//! again for each save.

use serde::{Deserialize, Serialize};

use crate::character::{At, Character, UnknownKeys, Vestige};
use crate::item::Item;

/// The key a character holds a shared part's unknown keys under while it is joined, so parting gives them back.
const SHARED_UNKNOWN: &str = "shared_unknown";

/// The vault's items and Vestiges and the Aurem, as the accounts keep them for an account.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
pub struct Shared {
    #[serde(default)]
    pub items: Vec<Item>,
    #[serde(default)]
    pub vestiges: Vec<Vestige>,
    #[serde(default)]
    pub aurem: u32,
    /// Keys this room does not know, from a later room's save, written back as read, so a room rolled back to
    /// this one or later keeps them.
    #[serde(flatten)]
    pub unknown: UnknownKeys,
}

impl Shared {
    /// The shared part kept as JSON; none when it is not one.
    #[must_use]
    pub fn from_json(text: &str) -> Option<Self> {
        serde_json::from_str(text).ok()
    }

    /// The shared part as JSON, as the accounts keep it.
    #[must_use]
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }
}

impl Character {
    /// Takes every vaulted item and Vestige and all Aurem out of the character, as the account's to keep apart.
    pub fn part_shared(&mut self) -> Shared {
        let vaulted: Vec<u32> = self.items.iter().filter(|(_, (_, at))| *at == At::Vault).map(|(id, _)| *id).collect();
        let items = vaulted.iter().filter_map(|id| self.items.remove(id)).map(|(item, _)| item).collect();
        let sealed: Vec<u32> = self.vestiges.iter().filter(|(_, (_, vaulted))| *vaulted).map(|(id, _)| *id).collect();
        let vestiges = sealed.iter().filter_map(|id| self.vestiges.remove(id)).map(|(vestige, _)| vestige).collect();
        let aurem = std::mem::take(&mut self.materials.aurem);
        let unknown = match self.unknown.remove(SHARED_UNKNOWN) {
            Some(serde_json::Value::Object(kept)) => kept,
            _ => UnknownKeys::new(),
        };
        Shared { items, vestiges, aurem, unknown }
    }

    /// Puts the account's shared part into the character: each item and Vestige into the vault, one whose number the
    /// character already holds (an item, Vestige, officer or letter) under a new one, and the Aurem within its most.
    /// Nothing is dropped, however full the vault, and `next_id` stays past every number held.
    pub fn join_shared(&mut self, shared: Shared) {
        for mut item in shared.items {
            if self.holds_id(item.id) {
                item.id = self.take_id();
            }
            self.next_id = self.next_id.max(item.id.saturating_add(1));
            self.items.insert(item.id, (item, At::Vault));
        }
        for mut vestige in shared.vestiges {
            if self.holds_id(vestige.id) {
                vestige.id = self.take_id();
            }
            self.next_id = self.next_id.max(vestige.id.saturating_add(1));
            self.vestiges.insert(vestige.id, (vestige, true));
        }
        self.materials.add_aurem(shared.aurem);
        if !shared.unknown.is_empty() {
            self.unknown.insert(SHARED_UNKNOWN.to_owned(), serde_json::Value::Object(shared.unknown));
        }
    }

    /// Whether a number is one the character holds already, or none (0, which no item takes).
    fn holds_id(&self, id: u32) -> bool {
        id == 0
            || self.items.contains_key(&id)
            || self.vestiges.contains_key(&id)
            || self.crew.officers.contains_key(&id)
            || self.mail.iter().any(|letter| letter.id == id)
    }
}
