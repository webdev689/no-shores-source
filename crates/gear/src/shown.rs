//! What others see of a character, kept beside it so the accounts can show it without the rules: their level, their
//! Defense and Melee loadout's Attack (the Ranged one's without one), the emblem they wear, and each piece they wear,
//! numbered as the gear message numbers them; and for another player's Inspect, their Prestige and the Art they wear
//! at its level (0 for none).

use crate::character::Character;
use crate::kinds::Slot;
use serde::Serialize;

/// A worn piece as others see it, by its own id, which the page draws its look's choices by as on its figure.
#[derive(Debug, Serialize)]
pub struct ShownPiece {
    pub id: u32,
    pub slot: u8,
    pub kind: u8,
    pub rarity: u8,
    pub level: u8,
    pub name: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub named: Option<String>,
    pub element: u8,
    pub attack: u32,
    pub defense: u32,
    pub gilded: bool,
    /// The content it came from (`Source`'s number), which its look follows.
    pub source: u8,
    /// Plain clothes, which have no stats (`Item::plain`).
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub plain: bool,
}

/// A character as others see it.
#[derive(Debug, Serialize)]
pub struct Shown {
    pub level: u8,
    pub defense: u32,
    pub attack: u32,
    pub emblem: String,
    pub worn: Vec<ShownPiece>,
    pub prestige: u32,
    pub art: u8,
    pub art_level: u8,
}

impl Character {
    /// What others see of the character.
    #[must_use]
    pub fn shown(&self) -> Shown {
        let worn = self
            .all_worn()
            .filter(|(slot, _)| !slot.ship())
            .map(|(slot, item)| ShownPiece {
                id: item.id,
                slot: slot as u8,
                kind: item.kind as u8,
                rarity: item.rarity as u8,
                level: item.level,
                name: item.name,
                named: item.named.clone(),
                element: item.element.map_or(0, |element| element as u8),
                attack: item.attack().unwrap_or_default(),
                defense: item.defense().unwrap_or_default(),
                gilded: item.fully_upgraded(),
                source: item.source as u8,
                plain: item.plain,
            })
            .collect();
        Shown {
            level: self.level(),
            defense: self.defense(),
            attack: self.attack(Slot::Melee).or_else(|| self.attack(Slot::Ranged)).unwrap_or_default(),
            emblem: self.emblem.clone(),
            worn,
            prestige: self.prestige(),
            art: self.arts.worn,
            art_level: if self.arts.worn == 0 { 0 } else { self.art_level(self.arts.worn) },
        }
    }
}
