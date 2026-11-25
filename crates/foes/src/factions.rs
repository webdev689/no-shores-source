//! The enemy factions: who a foe fights for. Each is a side of its own in a fight, so factions fight the players and
//! each other alike, and each has its types by domain.

use crate::roster::{Domain, FoeType, ROSTER};
use combat::fighter::Side;

/// A faction: its number (its side's, 1 and up, on the wire), its name, and whether its groups' leaders fight
/// screened: behind their followers' front, holding the line before their target as its shield-bearers do, until none
/// of them stands unbroken, then going in at once.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Faction {
    pub number: u8,
    pub name: &'static str,
    pub screens: bool,
}

pub const GREY_TITHE: u8 = 1;
/// The Lattice: the ruined ports' people, overtaken by the crystal; met on land only, and never screened.
pub const LATTICE: u8 = 3;
/// The number the Brig's crew carry for a faction: none, as they fight on the players' side.
pub const CREW: u8 = 0;

pub const FACTIONS: [Faction; 2] = [
    Faction { number: GREY_TITHE, name: "The Grey Tithe", screens: true },
    Faction { number: LATTICE, name: "The Lattice", screens: false },
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
