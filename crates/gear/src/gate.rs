//! The gates: what a character may enter, judged by the rooms, so no kept character passes a gate it has not opened.
//! A player the accounts do not hand over plays unkept, as a new character, and keeps nothing. A social space is open
//! to everyone; a patrol, its dungeons and the Elite Dungeons open after the prologue; the week's two open at their own
//! levels, 24 and 28; a playlist's run at its own, 10 or 20, to a character of its band; and the seas open by level,
//! Elite from 10 and Abyss from 20. Each shut says why, in a line the page shows the player.

use crate::activities::Weekly;
use crate::breach::{DROWNED_VALE, Tier};
use crate::character::Character;
use crate::playlist::Playlist;
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
    /// A playlist's run for the band whose foes stand at this level.
    Playlist(Playlist, u8),
    /// A Breach's run, or its gate in its patrol zone, at a tier (`crate::breach`).
    Breach(Tier),
    /// A mission's or a boss's node, the sea, a sea island, or a sea island's dungeon: shut by its seas alone.
    Node,
    /// A zone of an island's passages: gated as its patrol zone is.
    Passage,
}

/// Why a gate shuts.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Shut {
    Prologue,
    Seas(Difficulty),
    /// A dungeon that opens at its own level, whatever the seas.
    Level(u8),
    /// A playlist below the level it opens at.
    Playlist(Playlist),
    /// A playlist's run for another band than the character's, by the band's first and last level.
    Band(u8, u8),
    /// The sea, to a character who keeps no ship yet: the Harbourmaster hands over the first (`ship::fleet`).
    NoShip,
    /// A Breach below the level its tier opens at.
    BreachLevel(Tier),
    /// A Breach's Hard before its Normal is won.
    BreachHard,
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
            Shut::Playlist(playlist) => format!("The {} opens at level {}.", playlist.name(), playlist.opens_at()),
            Shut::Band(first, last) if first == last => format!("This run is for level {first}."),
            Shut::Band(first, last) => format!("This run is for levels {first} to {last}."),
            Shut::NoShip => NO_SHIP.to_owned(),
            Shut::BreachLevel(tier) => format!("A Breach at {} opens at level {}.", tier.name(), tier.opens_at()),
            Shut::BreachHard => "A Breach at Hard opens once you have won it at Normal.".to_owned(),
        }
    }
}

/// What a player who keeps no ship is told when they would go to sea.
pub const NO_SHIP: &str = "You have no ship yet. The Harbourmaster in Overlook's market has one for you.";

/// Whether a character may enter a place at these seas, and if not why (`shut_at`).
#[must_use]
pub fn shut(character: &Character, place: Place, tier: Difficulty) -> Option<Shut> {
    let shut = shut_at(character.level(), character.story.prologue, place, tier);
    if shut.is_none() && place == Place::Breach(Tier::Hard) && !character.breach_won(&DROWNED_VALE, Tier::Normal) {
        return Some(Shut::BreachHard);
    }
    shut
}

/// As `shut` judges, from a level and whether the prologue was played: a social space never shuts; a patrol, its
/// dungeons, an Elite Dungeon, the week's two and the playlists need the prologue first, which stands in for the
/// campaign's end until the missions exist; then the week's two need their own level, and a playlist's run its level
/// and the character in its band; then the seas need theirs.
#[must_use]
pub fn shut_at(level: u8, prologue: bool, place: Place, tier: Difficulty) -> Option<Shut> {
    if place == Place::Social {
        return None;
    }
    let after_prologue = !matches!(place, Place::Node);
    if after_prologue && !prologue {
        return Some(Shut::Prologue);
    }
    if let Place::Week(weekly) = place
        && level < weekly.opens_at()
    {
        return Some(Shut::Level(weekly.opens_at()));
    }
    if let Place::Breach(breach) = place {
        return (level < breach.opens_at()).then_some(Shut::BreachLevel(breach));
    }
    if let Place::Playlist(playlist, foes_at) = place {
        if level < playlist.opens_at() {
            return Some(Shut::Playlist(playlist));
        }
        let band = playlist.band_at(foes_at);
        if band != playlist.band_of(level) {
            let (first, last) = band.unwrap_or((u8::MAX, u8::MAX));
            return Some(Shut::Band(first, last));
        }
    }
    (level < tier.opens_at()).then_some(Shut::Seas(tier))
}
