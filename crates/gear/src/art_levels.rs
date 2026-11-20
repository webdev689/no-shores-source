//! How an Art grows, as gear does: every kill's XP fills the worn Art's bar, and once it is full the Art's faction
//! raises it a level at its counter for a price, the player choosing one of its Core fragments to own as it rises.
//! The faction also sells the fragments, from its first rank. An Art's level sets its spells' power and how long they
//! and what they give last; at the highest they are as `content/arts/arts.json` writes them.

use crate::arts::{FRAGMENTS, LEVEL_MOST, arts, bar};
use crate::asks::{Done, Here, Refusal};
use crate::character::Character;
use crate::factions::factions;
use crate::kinds::Stock;

/// An Art's place in the lists, by its number.
fn place(art: u8) -> Option<usize> {
    arts().arts.iter().position(|found| found.id == art)
}

impl Character {
    /// An Art's level, 1 to `LEVEL_MOST`.
    #[must_use]
    pub fn art_level(&self, art: u8) -> u8 {
        place(art).and_then(|at| self.arts.levels.get(at)).copied().unwrap_or(1).clamp(1, LEVEL_MOST)
    }

    /// The XP an Art has toward its next level.
    #[must_use]
    pub fn art_xp(&self, art: u8) -> u32 {
        place(art).and_then(|at| self.arts.xp.get(at)).copied().unwrap_or(0)
    }

    /// Whether an Art's bar is full, so its faction will raise it.
    #[must_use]
    pub fn art_ready(&self, art: u8) -> bool {
        let level = self.art_level(art);
        level < LEVEL_MOST && self.art_xp(art) >= bar(level)
    }

    /// Whether the player owns a fragment of an Art, by its place in the Art's list.
    #[must_use]
    pub fn owns_fragment(&self, art: u8, fragment: u8) -> bool {
        let owned = place(art).and_then(|at| self.arts.owned.as_ref()?.get(at).copied()).unwrap_or(0);
        usize::from(fragment) < FRAGMENTS && owned & 1 << fragment != 0
    }

    /// An Art's shares of its spells' harm and healing, and of how long they and what they give last, by its level.
    #[must_use]
    pub fn art_shares(&self, art: u8) -> (f64, f64) {
        let at = usize::from(self.art_level(art) - 1);
        let levels = &arts().levels;
        (levels.power.get(at).copied().unwrap_or(1.0), levels.lasting.get(at).copied().unwrap_or(1.0))
    }

    /// The worn Art's shares (`art_shares`).
    #[must_use]
    pub fn spell_shares(&self) -> (f64, f64) {
        self.art_shares(self.art().id)
    }

    /// A kill's XP to the worn Art, until its bar is full.
    pub(crate) fn earn_art_xp(&mut self, xp: u32) {
        let worn = self.art().id;
        let most = bar(self.art_level(worn));
        self.arts = std::mem::take(&mut self.arts).kept();
        if let Some(held) = place(worn).and_then(|at| self.arts.xp.get_mut(at)) {
            *held = held.saturating_add(xp).min(most);
        }
    }

    /// Raises an Art a level at its faction's counter, its bar full, for the rise's price, and the player takes one
    /// of its fragments they do not own; one who owns all six (bought before rising) takes none, and `fragment` is not
    /// read. The bar starts again.
    pub(crate) fn rise_art(&mut self, art: u8, fragment: u8, here: Here) -> Result<Option<Done>, Refusal> {
        let at = self.faction_ask(art, here)?;
        let level = self.art_level(art);
        if level >= LEVEL_MOST {
            return Err(Refusal::LevelMost);
        }
        if !self.art_ready(art) {
            return Err(Refusal::NotReady);
        }
        let every = (0..FRAGMENTS).all(|place| u8::try_from(place).is_ok_and(|place| self.owns_fragment(art, place)));
        if !every {
            self.fragment_free(art, fragment)?;
        }
        let rise = arts().levels.rise[usize::from(level - 1)];
        let held = &self.materials;
        let stocks = [Stock::Weapon, Stock::Armor];
        if held.aurem < rise.aurem
            || stocks.iter().any(|stock| held.fragments(*stock) < rise.fragments || held.essence(*stock) < rise.essence)
        {
            return Err(Refusal::Short);
        }
        let materials = &mut self.materials;
        materials.aurem -= rise.aurem;
        materials.weapon_fragments -= rise.fragments;
        materials.armor_fragments -= rise.fragments;
        materials.weapon_essence -= rise.essence;
        materials.armor_essence -= rise.essence;
        self.arts.levels[at] = level + 1;
        self.arts.xp[at] = 0;
        if !every {
            self.own_fragment(at, fragment);
        }
        Ok(None)
    }

    /// Buys a fragment of an Art at its faction's counter, from the faction's first rank.
    pub(crate) fn buy_fragment(&mut self, art: u8, fragment: u8, here: Here) -> Result<Option<Done>, Refusal> {
        let at = self.faction_ask(art, here)?;
        let faction = factions().of_art(art).ok_or(Refusal::NoSuchFaction)?;
        if self.rank(faction.id) < factions().fragment_rank {
            return Err(Refusal::RankTooLow);
        }
        self.fragment_free(art, fragment)?;
        if self.materials.aurem < factions().fragment_aurem {
            return Err(Refusal::Short);
        }
        self.materials.aurem -= factions().fragment_aurem;
        self.own_fragment(at, fragment);
        Ok(None)
    }

    /// An Art's place in the lists, if the ask is made at its faction's counter, with every list made whole.
    fn faction_ask(&mut self, art: u8, here: Here) -> Result<usize, Refusal> {
        let at = place(art).ok_or(Refusal::NoSuchFaction)?;
        if !here.social {
            return Err(Refusal::NotHere);
        }
        self.arts = std::mem::take(&mut self.arts).kept();
        Ok(at)
    }

    /// Refuses a fragment the Art has not, or one already owned.
    fn fragment_free(&self, art: u8, fragment: u8) -> Result<(), Refusal> {
        if usize::from(fragment) >= FRAGMENTS {
            return Err(Refusal::NoSuchNode);
        }
        if self.owns_fragment(art, fragment) {
            return Err(Refusal::Owned);
        }
        Ok(())
    }

    fn own_fragment(&mut self, at: usize, fragment: u8) {
        if let Some(owned) = self.arts.owned.as_mut().and_then(|owned| owned.get_mut(at)) {
            *owned |= 1 << fragment;
        }
    }
}
