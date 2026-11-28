//! The game's mail, after Destiny's Postmaster: letters only the game writes to a player, kept with their character and
//! handed over at the mail counter in Overlook's social space. A letter is where what it holds came from and, for
//! something the player would have lost, that thing: a Vestige left lying out its time or as they left, a Vestige a
//! first clear paid while the carried ten and the vault were full or flotsam paid while the carried ten were, a module
//! salvaged while its slot carried nine, or a Normal item found while its slot and the vault were full. A mailbox keeps
//! `MAIL_MOST` letters; one more lets go the letter holding the least, the oldest of those, and the newest letter kept
//! says so. The page words each letter by its source.

use crate::asks::{Done, Here, Refusal};
use crate::character::{At, CARRIED_MOST, Character, UnknownKeys, VAULT_MOST, VESTIGES_MOST, Vestige};
use crate::item::Item;
use crate::rarity::Rarity;
use serde::{Deserialize, Serialize};

/// How many letters a mailbox keeps: more than the carried ten and the vault's twenty Vestiges together, and few
/// enough that a character's save stays far under what the accounts keep.
pub const MAIL_MOST: usize = 50;

/// Where a letter's Vestige or item came from, kept and sent as its number (`Letter::from`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Source {
    /// A drop that lay where it fell until its time was out.
    LeftLying = 0,
    /// A drop still lying when its player left the place.
    LeftBehind = 1,
    /// A first clear's Vestige, paid while the carried ten and the vault were full.
    Clear = 2,
    /// A Vestige in flotsam gathered while the carried ten were full.
    Flotsam = 3,
    /// A module salvaged while its slot carried nine.
    Salvage = 4,
    /// A Normal item found as itself while its slot carried nine and the vault was full.
    Found = 5,
    /// A keeper's gift on the opening's round: the Postmaster's letter, or a gift with no room for it where it goes.
    Gift = 6,
}

/// What a letter holds.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Posted {
    Vestige(Vestige),
    Item(Item),
}

/// One letter: its number, which no item, Vestige or officer of the character shares, where what it holds came from
/// (a `Source`'s number, one a later room adds kept as read), whether it tells of a letter a full mailbox let go, and
/// what it holds.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub struct Letter {
    pub id: u32,
    pub from: u8,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub crowded: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vestige: Option<Vestige>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub item: Option<Item>,
    /// Keys this room does not know, from a later room's save, written back as read, so a room rolled back to
    /// this one or later keeps them.
    #[serde(flatten, default)]
    pub unknown: UnknownKeys,
}

impl Letter {
    /// What a full mailbox weighs to choose the letter it lets go: the rarity of what it holds, and one holding
    /// nothing this room knows above all, as a later room may have put in it what this one cannot see.
    fn worth(&self) -> (bool, Option<Rarity>) {
        let rarity = self.vestige.as_ref().map(|vestige| vestige.rarity);
        let rarity = rarity.or_else(|| self.item.as_ref().map(|item| item.rarity));
        (rarity.is_none(), rarity)
    }
}

impl Character {
    /// Posts a letter from the game. With the mailbox full the letter holding the least goes, the oldest of those
    /// and the new one among them, and the newest letter kept says so: the new one, or the one before it when the new
    /// one went. Only the new letter's room is made, so a mailbox a later build kept fuller loses no more.
    pub fn post(&mut self, source: Source, posted: Posted) {
        // A Vestige left lying in a passage zone goes into the dive's haul, not the mail.
        if let Posted::Vestige(vestige) = &posted
            && matches!(source, Source::LeftBehind | Source::LeftLying)
            && self.haul_vestige(vestige)
        {
            return;
        }
        let (vestige, item) = match posted {
            Posted::Vestige(vestige) => (Some(vestige), None),
            Posted::Item(item) => (None, Some(item)),
        };
        let id = self.take_id();
        let letter = Letter { id, from: source as u8, crowded: false, vestige, item, unknown: UnknownKeys::new() };
        self.mail.push(letter);
        if self.mail.len() > MAIL_MOST {
            let least = (0..self.mail.len()).min_by_key(|&at| self.mail[at].worth()).unwrap_or(0);
            self.mail.remove(least);
            if let Some(newest) = self.mail.last_mut() {
                newest.crowded = true;
            }
        }
    }

    /// Keeps a Vestige a first clear pays: in the carried ten, else in the vault, else posted, so it is never lost;
    /// never in a dive's haul, which a fall loses, wherever the player stands.
    pub fn keep_paid(&mut self, vestige: Vestige) {
        let vaulted = self.vestiges_held(false) >= VESTIGES_MOST;
        if vaulted && self.vestiges_held(true) >= VAULT_MOST {
            self.post(Source::Clear, Posted::Vestige(vestige));
            return;
        }
        let id = self.take_id();
        self.vestiges.insert(id, (Vestige { id, ..vestige }, vaulted));
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
            let letters = self.mail.len();
            // A letter whose Vestige and item were taken already (it stays for keys this room does not know) gives
            // none.
            let holds = self.mail[at].vestige.is_some() || self.mail[at].item.is_some();
            match self.open_letter(at) {
                Ok(_) => {
                    took |= holds;
                    // A letter that stays (holding what this room does not know) is passed over.
                    at += usize::from(self.mail.len() == letters);
                }
                Err(refusal) => {
                    refused.get_or_insert(refusal);
                    at += 1;
                }
            }
        }
        if took { Ok(None) } else { Err(refused.unwrap_or(Refusal::NoSuchLetter)) }
    }

    /// Opens the letter at `at` in the mailbox, if there is room for all it holds. A letter holding what this room
    /// does not know (a later room's keys) gives what it knows and stays with the rest, so a rollback loses nothing.
    fn open_letter(&mut self, at: usize) -> Result<Option<Done>, Refusal> {
        let letter = &self.mail[at];
        if letter.vestige.is_some() && self.vestiges_held(false) >= VESTIGES_MOST {
            return Err(Refusal::VestigesFull);
        }
        if letter.item.as_ref().is_some_and(|item| self.carried_in(item.bucket) >= CARRIED_MOST) {
            return Err(Refusal::CarriedFull);
        }
        let (vestige, item) = if self.mail[at].unknown.is_empty() {
            let letter = self.mail.remove(at);
            (letter.vestige, letter.item)
        } else {
            let kept = &mut self.mail[at];
            (kept.vestige.take(), kept.item.take())
        };
        if let Some(vestige) = vestige {
            self.pick_up(vestige);
        }
        if let Some(item) = item {
            let id = self.take_id();
            self.items.insert(id, (Item { id, ..item }, At::Carried));
        }
        Ok(None)
    }
}
