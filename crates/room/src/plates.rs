//! What others read over a player's head: their username, their level, the Prestige of what they wear, and whether a
//! menu is open on their screen. Sent to everyone once as it changes, as a dress is.

use crate::players::Player;
use crate::{PlayerId, Room};

/// The longest name a plate carries: a username's most, as the accounts keep it.
pub const NAME_MOST: usize = 20;

/// One player's plate as others read it. The name is empty for a guest, who has none.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Plate {
    pub name: String,
    pub level: u8,
    pub prestige: u16,
    pub menu: bool,
}

/// What the room keeps for a player's plate: their name, whether their last input had a menu open, and the plate as it
/// was last passed on (none before the first).
#[derive(Debug, Default)]
pub struct Plated {
    pub(crate) name: String,
    pub(crate) menu: bool,
    pub(crate) sent: Option<Plate>,
}

/// Whether a name is one a username may be: 1 to `NAME_MOST` ASCII letters, digits or underscores.
fn named(name: &str) -> bool {
    (1..=NAME_MOST).contains(&name.len()) && name.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}

fn plate_of(found: &Player) -> Plate {
    let (level, prestige) = numbers_of(found);
    Plate { name: found.plate.name.clone(), level, prestige, menu: found.plate.menu }
}

/// A player's level and Prestige, as their plate carries them.
fn numbers_of(found: &Player) -> (u8, u16) {
    let character = &found.character;
    (character.level(), u16::try_from(character.prestige()).unwrap_or(u16::MAX))
}

impl Room {
    /// Names a player by their account's username, as the accounts gave it; false, naming no one, for a player not in
    /// the room or a name no username could be.
    pub fn name_player(&mut self, player: PlayerId, name: &str) -> bool {
        let Some(found) = self.players.get_mut(&player).filter(|_| named(name)) else { return false };
        name.clone_into(&mut found.plate.name);
        true
    }

    /// Every player's plate, for one who joins.
    pub fn plates(&self) -> impl Iterator<Item = (PlayerId, Plate)> + '_ {
        self.players.iter().map(|(&player, found)| (player, plate_of(found)))
    }

    /// The plates that changed since this was last asked, to send to everyone once.
    pub fn take_plate_changes(&mut self) -> Vec<(PlayerId, Plate)> {
        let mut changed = Vec::new();
        for (&player, found) in &mut self.players {
            // Compared field by field, so a plate is made, its name copied, only when it changed.
            let numbers = numbers_of(found);
            let same = found.plate.sent.as_ref().is_some_and(|sent| {
                (sent.level, sent.prestige) == numbers && sent.menu == found.plate.menu && sent.name == found.plate.name
            });
            if !same {
                let plate = plate_of(found);
                found.plate.sent = Some(plate.clone());
                changed.push((player, plate));
            }
        }
        changed
    }
}
