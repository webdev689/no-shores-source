//! The gates: what a character may enter, judged by the rooms, so no kept character passes a gate it has not opened.
//! A player the accounts do not hand over plays unkept, as a new character, and keeps nothing. A social space is open
//! to everyone; a patrol and its dungeons open after the prologue; and the seas open by level, Elite from 10 and Abyss
//! from 20. Each shut says why, in a line the page shows the player.

use crate::character::Character;
use crate::world::Difficulty;

/// What a room is, as the gates know it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Place {
    Social,
    Patrol,
    PatrolDungeon,
    /// A mission's, a boss's or a named dungeon's node.
    Node,
}

/// Why a gate shuts.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Shut {
    Prologue,
    Seas(Difficulty),
}

impl Shut {
    /// Why, in a short plain line for the player.
    #[must_use]
    pub fn reason(self) -> String {
        match self {
            Shut::Prologue => "This place opens after the prologue.".to_owned(),
            Shut::Seas(tier) => {
                let named = match tier {
                    Difficulty::Normal => "Normal",
                    Difficulty::Elite => "Elite",
                    Difficulty::Abyss => "Abyss",
                };
                format!("{named} seas open at level {}.", tier.opens_at())
            }
        }
    }
}

/// Whether a character may enter a place at these seas, and if not why: a social space never shuts; a patrol and
/// its dungeons need the prologue first; then the seas need their level.
#[must_use]
pub fn shut(character: &Character, place: Place, tier: Difficulty) -> Option<Shut> {
    if place == Place::Social {
        return None;
    }
    if matches!(place, Place::Patrol | Place::PatrolDungeon) && !character.story.prologue {
        return Some(Shut::Prologue);
    }
    (character.level() < tier.opens_at()).then_some(Shut::Seas(tier))
}
