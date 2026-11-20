//! The enemy factions: who a foe fights for. Each is a side of its own in a fight, so factions fight the players and
//! each other alike, and each has a presence in the world (on land, at sea, or both), its types by domain, and its
//! ships.

use crate::roster::{Domain, FoeType, ROSTER};
use combat::fighter::Side;

/// Where a faction is found.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Presence {
    Land,
    Sea,
    Both,
}

/// A faction: its number (its side's, 1 and up, on the wire), its name, its presence, its ships by name, and whether
/// its groups' leaders fight screened: behind their followers' front, holding the line before their target as its
/// shield-bearers do, until none of them stands unbroken, then going in at once.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Faction {
    pub number: u8,
    pub name: &'static str,
    pub presence: Presence,
    pub ships: &'static [&'static str],
    pub screens: bool,
}

pub const GREY_TITHE: u8 = 1;
pub const PIRATES: u8 = 2;
/// The number the Brig's crew carry for a faction: none, as they fight on the players' side.
pub const CREW: u8 = 0;

pub const FACTIONS: [Faction; 2] = [
    Faction {
        number: GREY_TITHE,
        name: "The Grey Tithe",
        presence: Presence::Both,
        ships: &["Tithe Sloop"],
        screens: true,
    },
    Faction { number: PIRATES, name: "Pirates", presence: Presence::Sea, ships: &["Pirate Sloop"], screens: false },
];

/// The faction a number names, or none.
#[must_use]
pub fn faction(number: u8) -> Option<&'static Faction> {
    FACTIONS.iter().find(|faction| faction.number == number)
}

impl Faction {
    /// The side its foes fight on.
    #[must_use]
    pub fn side(&self) -> Side {
        Side::Faction(self.number)
    }

    /// Its enemy types in a domain, in the roster's order.
    pub fn types(&self, domain: Domain) -> impl Iterator<Item = &'static FoeType> + use<> {
        let number = self.number;
        ROSTER.iter().filter(move |foe_type| foe_type.faction == number && foe_type.domain == domain)
    }
}
