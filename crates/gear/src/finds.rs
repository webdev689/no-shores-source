//! What a chest found in a patrol or a dungeon holds, and what searching a container turns up, after Destiny 1's loot
//! chests, which held Glimmer, a planetary material and now and then an engram: Aurem, which grows with the level as a
//! kill's worth does; the island's resource; and a chance of a Vestige. A chest holds more than a search finds. Both
//! are raised by a harder voyage as a kill is, and neither pays XP.

use crate::character::{Character, Stuff, Vestige};
use crate::dice::{Dice, Purpose};
use crate::source::Source;
use crate::world::Difficulty;

/// What is opened: a chest standing in a patrol or a dungeon, or a container searched.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Find {
    Chest,
    Search,
}

/// What a find holds: its Aurem at level 5, the island's resource (from the first count to the second, each as
/// likely) one time in `resource_chance`, and its chance of a Vestige, coloured as a drop of foes of `rank` is.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Holds {
    pub aurem: u32,
    pub resource: [u16; 2],
    pub resource_chance: f64,
    pub vestige: f64,
    pub rank: u8,
}

/// A chest: about four Major kills' Aurem, a node's worth of the resource give or take one, and a Vestige one time in
/// four, coloured as a Major's (a Major's own is 4 in 100).
pub const CHEST: Holds = Holds { aurem: 30, resource: [2, 4], resource_chance: 1.0, vestige: 0.25, rank: 2 };
/// A container searched: a Major kill's Aurem, one of the resource one time in two, and a Vestige one time in twenty,
/// coloured as a Minor's.
pub const SEARCH: Holds = Holds { aurem: 8, resource: [1, 1], resource_chance: 0.5, vestige: 0.05, rank: 1 };

impl Find {
    #[must_use]
    pub fn holds(self) -> Holds {
        match self {
            Find::Chest => CHEST,
            Find::Search => SEARCH,
        }
    }
}

/// What one find gave its player: its Aurem, how much of the resource was taken under the stock's most, and its
/// Vestige, returned to be thrown out before it as a kill's drops are.
#[derive(Clone, Debug, PartialEq)]
pub struct Found {
    pub aurem: u32,
    pub resource: u16,
    pub vestiges: Vec<Vestige>,
}

impl Character {
    /// Opens a chest or searches a container at `level`, on a voyage of `difficulty`, in a place of island
    /// `resource` (its place in the catalogue's list, if any), its Vestige from `source`.
    pub fn find(
        &mut self,
        find: Find,
        (level, difficulty): (u8, Difficulty),
        resource: Option<usize>,
        source: Source,
        dice: &Dice,
    ) -> Found {
        let holds = find.holds();
        let raised = libm::round(f64::from(crate::rewards::at_level(holds.aurem, level)) * difficulty.reward());
        let aurem = u32::try_from(raised as u64).unwrap_or(u32::MAX);
        self.materials.add_aurem(aurem);
        let [least, most] = holds.resource;
        let holds_resource = dice.roll(Purpose::Find, 0) < holds.resource_chance;
        let count = least + u16::try_from(dice.pick(Purpose::Find, 1, usize::from(most - least) + 1)).unwrap_or(0);
        let resource = match resource.filter(|_| holds_resource) {
            Some(resource) => self.materials.add(Stuff::Resource(resource), count),
            None => 0,
        };
        let vestiges = self.loot((holds.vestige * difficulty.reward(), 0.0), holds.rank, level, source, dice);
        Found { aurem, resource, vestiges }
    }
}

#[cfg(test)]
#[path = "finds_tests.rs"]
mod finds_tests;
