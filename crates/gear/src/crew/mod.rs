//! A ship's crew: its hands, a headcount that works its guns and sails (the men the sea keeps as a share of its
//! complement, filled again at a port), and its named officers. An officer holds a post aboard that changes how its
//! plays, or goes ashore beside the player as a companion; each has experience, a grid of nodes and perks of their
//! own, as an item does (`grid.rs`). Officers are recruited at the player's faction's counter (`recruit.rs`), or
//! taken rarely when a boarded deck is won.

mod duties;
pub mod officer;
pub mod recruit;

#[cfg(test)]
mod crew_tests;

use crate::character::Character;
pub use officer::{Duty, Officer, Post};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// How many officers a player keeps; how many go ashore at once.
pub const OFFICERS_MOST: usize = 8;
pub const ASHORE_MOST: usize = 2;

/// A player's officers, by number.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Crew {
    pub officers: BTreeMap<u32, Officer>,
}

impl Crew {
    /// The officer holding a post aboard, if any.
    #[must_use]
    pub fn posted(&self, post: Post) -> Option<&Officer> {
        self.officers.values().find(|officer| officer.duty == Duty::Posted && officer.post == post)
    }

    /// The officers ashore with the player, in their numbers' order.
    pub fn ashore(&self) -> impl Iterator<Item = &Officer> {
        self.officers.values().filter(|officer| officer.duty == Duty::Ashore)
    }

    /// The crew as a kept character should hold it: at most the officers kept, each made whole, one holding each
    /// post and two ashore at most, the rest aboard.
    #[must_use]
    pub fn kept(self) -> Self {
        let mut officers = BTreeMap::new();
        let (mut posts, mut ashore) = (Vec::new(), 0);
        for (id, officer) in self.officers.into_iter().take(OFFICERS_MOST) {
            let mut officer = officer.kept(id);
            match officer.duty {
                Duty::Posted if posts.contains(&officer.post) => officer.duty = Duty::Aboard,
                Duty::Posted => posts.push(officer.post),
                Duty::Ashore if ashore >= ASHORE_MOST => officer.duty = Duty::Aboard,
                Duty::Ashore => ashore += 1,
                Duty::Aboard => {}
            }
            officers.insert(id, officer);
        }
        Self { officers }
    }
}

impl Character {
    /// Adds experience to the officers who earned it: those posted or aboard for a fight at sea, those ashore for a
    /// fight on land; each to their grid's most.
    pub fn earn_officer_xp(&mut self, xp: u32, at_sea: bool) {
        for officer in self.crew.officers.values_mut() {
            let earns = if at_sea { officer.duty != Duty::Ashore } else { officer.duty == Duty::Ashore };
            if earns {
                officer.earn(xp);
            }
        }
    }
}
