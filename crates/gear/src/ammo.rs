//! Ammunition for the Ranged loadout: each kind's capacity, kept on the character as a share of the full one so a
//! different Ranged weapon worn keeps the same share; a shot spends one; an Ammo box taken gives back a quarter, an Ammo
//! crate used fills it. Crates are carried five at most and sold by the Quartermaster. A kill drops a box by the foe's
//! rank, and a Miniboss or a Boss a crate.

use crate::asks::{Done, Here, Refusal};
use crate::character::Character;
use crate::kinds::{Kind, Slot};

/// The whole share, in parts every capacity divides, so a shot of any kind is a whole number of them.
pub const AMMO_FULL: u16 = 720;
/// What an Ammo box gives back: a quarter of the capacity, at least one shot of any kind.
pub const BOX_SHARE: u16 = AMMO_FULL / 4;
/// The most Ammo crates carried, and what the Quartermaster asks for one, in Aurem.
pub const CRATES_MOST: u16 = 5;
pub const CRATE_PRICE: u32 = 250;

/// A share of none spent: what a character kept before ammunition reads with.
#[must_use]
pub fn full() -> u16 {
    AMMO_FULL
}

/// The shots a Ranged kind carries; none for any other kind.
#[must_use]
pub fn capacity(kind: Kind) -> Option<u16> {
    match kind {
        Kind::Bow => Some(60),
        Kind::Crossbow => Some(30),
        Kind::Pistolet => Some(24),
        Kind::DoublePistolet => Some(36),
        Kind::Thunderlock => Some(16),
        _ => None,
    }
}

/// The chance a foe of a rank (the foes crate's numbers, 1 Minor to 5 Boss) drops an Ammo box for each player who
/// earned its kill: a Miniboss or a Boss always does.
#[must_use]
pub fn box_chance(rank: u8) -> f64 {
    match rank {
        1 => 0.2,
        2 => 0.35,
        3 => 0.6,
        4 | 5 => 1.0,
        _ => 0.0,
    }
}

/// Whether a foe of a rank drops an Ammo crate for each player who earned its kill: a Miniboss or a Boss.
#[must_use]
pub fn drops_crate(rank: u8) -> bool {
    rank >= 4
}

impl Character {
    /// The shots the Ranged weapon worn carries full, if one is worn.
    #[must_use]
    pub fn ammo_most(&self) -> Option<u16> {
        self.worn(Slot::Ranged).and_then(|item| capacity(item.kind))
    }

    /// The whole shots left in the Ranged weapon worn: its share of the capacity; none with no Ranged worn.
    #[must_use]
    pub fn shots(&self) -> u16 {
        self.ammo_most().map_or(0, |most| self.ammo / (AMMO_FULL / most))
    }

    /// One shot of the Ranged weapon worn spent.
    pub fn spend_shot(&mut self) {
        if let Some(most) = self.ammo_most() {
            self.ammo = self.ammo.saturating_sub(AMMO_FULL / most);
        }
    }

    /// An Ammo box taken off the ground: a quarter of the capacity back. Refused, leaving it lying, when full.
    pub fn take_ammo_box(&mut self) -> bool {
        if self.ammo >= AMMO_FULL {
            return false;
        }
        self.ammo = self.ammo.saturating_add(BOX_SHARE).min(AMMO_FULL);
        true
    }

    /// An Ammo crate into the Consumables; refused, leaving it lying, at five.
    pub fn take_crate(&mut self) -> bool {
        if self.materials.crates >= CRATES_MOST {
            return false;
        }
        self.materials.crates += 1;
        true
    }

    /// An Ammo crate used, anywhere: the Ranged weapon's ammunition filled. Refused, kept, with none worn.
    pub(crate) fn use_crate(&mut self) -> Result<Option<Done>, Refusal> {
        if self.materials.crates == 0 {
            return Err(Refusal::NoCrate);
        }
        if self.ammo_most().is_none() {
            return Err(Refusal::NoRanged);
        }
        if self.ammo >= AMMO_FULL {
            return Err(Refusal::AmmoFull);
        }
        self.materials.crates -= 1;
        self.ammo = AMMO_FULL;
        Ok(None)
    }

    /// An Ammo crate bought from the Quartermaster: at the counter only.
    pub(crate) fn buy_crate(&mut self, here: Here) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        if self.materials.aurem < CRATE_PRICE {
            return Err(Refusal::Short);
        }
        if self.materials.crates >= CRATES_MOST {
            return Err(Refusal::CratesFull);
        }
        self.materials.aurem -= CRATE_PRICE;
        self.materials.crates += 1;
        Ok(None)
    }
}
