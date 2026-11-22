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
    let character = &found.character;
    let prestige = u16::try_from(character.prestige()).unwrap_or(u16::MAX);
    Plate { name: found.plate.name.clone(), level: character.level(), prestige, menu: found.plate.menu }
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
            let plate = plate_of(found);
            if found.plate.sent.as_ref() != Some(&plate) {
                found.plate.sent = Some(plate.clone());
                changed.push((player, plate));
            }
        }
        changed
    }

    /// Every plate is sent to everyone once more with the next changes, for one who joined with no welcome to carry
    /// them (a boarder come over a ship's side).
    pub fn announce_plates(&mut self) {
        for found in self.players.values_mut() {
            found.plate.sent = None;
        }
    }
}
