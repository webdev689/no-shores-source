//! The game's mail, after Destiny's Postmaster: letters only the game writes to a player, kept with their character
//! and handed over at the mail counter in Overlook's social space. A letter is its words and, for something the player
//! would have lost, that thing: a Vestige left lying out its time or as they left, a Vestige a first clear or flotsam
//! paid while the carried ten were full, or a module salvaged while its slot carried nine. A mailbox keeps
//! `MAIL_MOST` letters; one more lets the oldest go, and the new letter says so.

use crate::asks::{Done, Here, Refusal};
use crate::character::{At, CARRIED_MOST, Character, UnknownKeys, VESTIGES_MOST, Vestige};
use crate::item::Item;
use serde::{Deserialize, Serialize};

/// How many letters a mailbox keeps: more than the carried ten and the vault's twenty Vestiges together, and few
/// enough that a character's save stays far under what the accounts keep.
pub const MAIL_MOST: usize = 50;

/// What a letter says when the mailbox was full and its oldest letter went to make room for it.
pub const OLDEST_WENT: &str = "Your mailbox was full, so its oldest letter was let go.";

/// Where a letter's Vestige or item came from.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Source {
    /// A drop that lay where it fell until its time was out.
    LeftLying,
    /// A drop still lying when its player left the place.
    LeftBehind,
    /// A first clear's Vestige, paid while the carried ten were full.
    Clear,
    /// A Vestige in flotsam gathered while the carried ten were full.
    Flotsam,
    /// A module salvaged while its slot carried nine.
    Salvage,
}

impl Source {
    /// The letter's words: where what it holds came from, and why it came by mail.
    #[must_use]
    pub fn words(self) -> &'static str {
        match self {
            Source::LeftLying => "You left this lying where it fell. It was picked up before it was lost.",
            Source::LeftBehind => "You left before you picked this up, so it was sent on.",
            Source::Clear => "Your reward for a first clear. You carried ten Vestiges, so it came here.",
            Source::Flotsam => "Found in flotsam you gathered. You carried ten Vestiges, so it came here.",
            Source::Salvage => "Salvage you took. Its slot carried nine, so it came here.",
        }
    }
}

/// What a letter holds.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Posted {
    Vestige(Vestige),
    Item(Item),
}

/// One letter: its number, which no item, Vestige or officer of the character shares, its words, and what it holds.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub struct Letter {
    pub id: u32,
    pub words: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vestige: Option<Vestige>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub item: Option<Item>,
    /// Keys this room does not know, from a later room's save, written back as read, so a room rolled back to
    /// this one or later keeps them.
    #[serde(flatten, default)]
    pub unknown: UnknownKeys,
}

impl Character {
    /// Posts a letter from the game. With the mailbox full its oldest letter goes, and the new one says so.
    pub fn post(&mut self, source: Source, posted: Posted) {
        let mut words = source.words().to_owned();
        if self.mail.len() >= MAIL_MOST {
            self.mail.drain(..=self.mail.len() - MAIL_MOST);
            words = format!("{words} {OLDEST_WENT}");
        }
        let (vestige, item) = match posted {
            Posted::Vestige(vestige) => (Some(vestige), None),
            Posted::Item(item) => (None, Some(item)),
        };
        let id = self.take_id();
        self.mail.push(Letter { id, words, vestige, item, unknown: UnknownKeys::new() });
    }

    /// Takes a Vestige into the carried ten, or with them full posts it from `source`; whether it was carried.
    pub fn carry_or_post(&mut self, vestige: Vestige, source: Source) -> bool {
        let carried = self.pick_up(vestige.clone());
        if !carried {
            self.post(source, Posted::Vestige(vestige));
        }
        carried
    }

    /// Takes one letter by its number: its Vestige into the carried ten, its item into its slot's nine, each numbered
    /// anew. At the mail counter only, and refused while there is no room for what it holds.
    pub(crate) fn take_letter(&mut self, id: u32, here: Here) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        let at = self.mail.iter().position(|letter| letter.id == id).ok_or(Refusal::NoSuchLetter)?;
        self.open_letter(at)
    }

    /// Takes every letter there is room for, oldest first, leaving the rest; refused, taking none, when there is room
    /// for none of them, or no letter. At the mail counter only.
    pub(crate) fn take_all_letters(&mut self, here: Here) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        let (mut at, mut took, mut refused) = (0, false, None);
        while at < self.mail.len() {
            match self.open_letter(at) {
                Ok(_) => took = true,
                Err(refusal) => {
                    refused.get_or_insert(refusal);
                    at += 1;
                }
            }
        }
        if took { Ok(None) } else { Err(refused.unwrap_or(Refusal::NoSuchLetter)) }
    }

    /// Opens the letter at `at` in the mailbox, if there is room for all it holds.
    fn open_letter(&mut self, at: usize) -> Result<Option<Done>, Refusal> {
        let letter = &self.mail[at];
        if letter.vestige.is_some() && self.vestiges_held(false) >= VESTIGES_MOST {
            return Err(Refusal::VestigesFull);
        }
        if letter.item.as_ref().is_some_and(|item| self.carried_in(item.bucket) >= CARRIED_MOST) {
            return Err(Refusal::CarriedFull);
        }
        let letter = self.mail.remove(at);
        if let Some(vestige) = letter.vestige {
            self.pick_up(vestige);
        }
        if let Some(item) = letter.item {
            let id = self.take_id();
            self.items.insert(id, (Item { id, ..item }, At::Carried));
        }
        Ok(None)
    }
}
