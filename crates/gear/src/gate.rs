//! The gates: what a character may enter, judged by the rooms, so no kept character passes a gate it has not opened.
//! A player the accounts do not hand over plays unkept, as a new character, and keeps nothing. A social space is open
//! to everyone; a patrol, its dungeons and the Elite Dungeons open after the prologue; the week's two open at their own
//! levels, 24 and 28; and the seas open by level, Elite from 10 and Abyss from 20. Each shut says why, in a line the
//! page shows the player.

use crate::activities::Weekly;
use crate::character::Character;
use crate::world::Difficulty;

/// What a room is, as the gates know it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Place {
    Social,
    Patrol,
    PatrolDungeon,
    /// An Elite Dungeon: its node, its approach and its run at Normal.
    EliteDungeon,
    /// The week's Elite or Abyss Dungeon's run.
    Week(Weekly),
    /// A mission's or a boss's node, the sea, a sea island, or a sea island's dungeon: shut by its seas alone.
    Node,
}

/// Why a gate shuts.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Shut {
    Prologue,
    Seas(Difficulty),
    /// A dungeon that opens at its own level, whatever the seas.
    Level(u8),
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
            Shut::Level(level) => format!("This dungeon opens at level {level}."),
        }
    }
}

/// Whether a character may enter a place at these seas, and if not why (`shut_at`).
#[must_use]
pub fn shut(character: &Character, place: Place, tier: Difficulty) -> Option<Shut> {
    shut_at(character.level(), character.story.prologue, place, tier)
}

/// As `shut` judges, from a level and whether the prologue was played: a social space never shuts; a patrol, its
/// dungeons, an Elite Dungeon and the week's two need the prologue first, which stands in for the campaign's end
/// until the missions exist; then the week's two need their own level; then the seas need theirs.
#[must_use]
pub fn shut_at(level: u8, prologue: bool, place: Place, tier: Difficulty) -> Option<Shut> {
    if place == Place::Social {
        return None;
    }
    let after_prologue = matches!(place, Place::Patrol | Place::PatrolDungeon | Place::EliteDungeon | Place::Week(_));
    if after_prologue && !prologue {
        return Some(Shut::Prologue);
    }
    if let Place::Week(weekly) = place
        && level < weekly.opens_at()
    {
        return Some(Shut::Level(weekly.opens_at()));
    }
    (level < tier.opens_at()).then_some(Shut::Seas(tier))
}
