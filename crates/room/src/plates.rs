//! What others read over a player's head: their username, their guild's tag, their level, and whether a menu is open
//! on their screen. Sent to everyone once as it changes, as a dress is.

use crate::players::Player;
use crate::{PlayerId, Room};

/// The longest name a plate carries: a username's most, as the accounts keep it.
const NAME_MOST: usize = 20;
/// The longest guild tag a plate carries, as the accounts keep one.
const TAG_MOST: usize = 4;

/// One player's plate as others read it. The name is empty for a guest, who has none; the tag for one in no guild.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Plate {
    pub name: String,
    pub level: u8,
    pub menu: bool,
    pub tag: String,
}

/// What the room keeps for a player's plate: their name, whether their last input had a menu open, and the plate as it
/// was last passed on (none before the first).
#[derive(Debug, Default)]
pub struct Plated {
    pub(crate) name: String,
    pub(crate) tag: String,
    pub(crate) menu: bool,
    pub(crate) sent: Option<Plate>,
}

/// Whether a name is one a username may be: 1 to `NAME_MOST` ASCII letters, digits or underscores.
pub(crate) fn named(name: &str) -> bool {
    (1..=NAME_MOST).contains(&name.len()) && name.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}

/// Whether a tag is one a guild's may be: 2 to `TAG_MOST` capital letters or digits, or none.
fn tagged(tag: &str) -> bool {
    tag.is_empty()
        || ((2..=TAG_MOST).contains(&tag.len())
            && tag.bytes().all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit()))
}

fn plate_of(found: &Player) -> Plate {
    let plate = &found.plate;
    Plate { name: plate.name.clone(), level: found.character.level(), menu: plate.menu, tag: plate.tag.clone() }
}

impl Room {
    /// Names a player by their account's username, as the accounts gave it; false, naming no one, for a player not in
    /// the room or a name no username could be.
    pub fn name_player(&mut self, player: PlayerId, name: &str) -> bool {
        let Some(found) = self.players.get_mut(&player).filter(|_| named(name)) else { return false };
        name.clone_into(&mut found.plate.name);
        true
    }

    /// Gives a player their guild's tag, as the accounts gave it, or takes it away with none; false, changing nothing,
    /// for a player not in the room or a tag no guild's could be.
    pub fn tag_player(&mut self, player: PlayerId, tag: &str) -> bool {
        let Some(found) = self.players.get_mut(&player).filter(|_| tagged(tag)) else { return false };
        tag.clone_into(&mut found.plate.tag);
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
            let level = found.character.level();
            let same = found.plate.sent.as_ref().is_some_and(|sent| {
                sent.level == level
                    && sent.menu == found.plate.menu
                    && sent.name == found.plate.name
                    && sent.tag == found.plate.tag
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
