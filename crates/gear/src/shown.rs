//! What others see of a character, kept beside it so the accounts can show it without the rules: their level, their
//! Defense and Melee loadout's Attack (the Ranged one's without one), the emblem they wear, and each piece they wear,
//! numbered as the gear message numbers them.

use crate::character::Character;
use crate::kinds::Slot;
use serde::Serialize;

/// A worn piece as others see it.
#[derive(Debug, Serialize)]
pub struct ShownPiece {
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
}

/// A character as others see it.
#[derive(Debug, Serialize)]
pub struct Shown {
    pub level: u8,
    pub defense: u32,
    pub attack: u32,
    pub emblem: String,
    pub worn: Vec<ShownPiece>,
}

impl Character {
    /// What others see of the character.
    #[must_use]
    pub fn shown(&self) -> Shown {
        let worn = self
            .all_worn()
            .filter(|(slot, _)| !slot.ship())
            .map(|(slot, item)| ShownPiece {
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
            })
            .collect();
        Shown {
            level: self.level(),
            defense: self.defense(),
            attack: self.attack(Slot::Melee).or_else(|| self.attack(Slot::Ranged)).unwrap_or_default(),
            emblem: self.emblem.clone(),
            worn,
        }
    }
}
