//! Passengers: a player who travels aboard a company member's ship rather than their own. One who asks it as they join
//! the sea (`ask_aboard`) is let in with no ship of their own, and theirs, if they keep one, stays where it lies; once
//! their account is known they board the ship of the player of their company they named (`go_aboard`). Aboard, they
//! set no course and take no helm, and are sent what its captain is sent, its ship as their own. They get off by
//! leaving the sea, and are let off, told so (`LET_OFF`), as its captain leaves it.

use super::Sea;
use crate::PlayerId;
use std::collections::{BTreeMap, BTreeSet};

/// A passenger told they were let off, their captain gone from the sea: the code and the sea's tick.
pub const LET_OFF: f64 = 25.0;

/// Why boarding was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AboardRefused {
    /// The player did not ask to travel aboard as they joined, or is aboard already.
    NotAsked,
    /// No player of their company by that name sails here, their ship at sea and aboard no one else's.
    NoCaptain,
}

/// The players who asked to travel aboard and are not aboard yet, and each passenger's captain.
#[derive(Debug, Default)]
pub(crate) struct Passengers {
    asked: BTreeSet<PlayerId>,
    captains: BTreeMap<PlayerId, PlayerId>,
}

impl Sea {
    /// A player just joined asks to travel aboard another's ship: false for one not in the sea, or whose ship is at
    /// sea.
    pub fn ask_aboard(&mut self, player: PlayerId) -> bool {
        let at_sea = self.berths.get(&player).map(|berth| berth.sailing.is_some());
        let asks = at_sea == Some(false);
        if asks {
            self.passengers.asked.insert(player);
        }
        asks
    }

    /// A player who asked boards the ship of the player named `captain` whose account is one of `company`, the
    /// passenger's company as the accounts tell it: one at sea here, aboard no one else's ship. The captain's number.
    pub fn go_aboard(&mut self, player: PlayerId, captain: &str, company: &[&str]) -> Result<PlayerId, AboardRefused> {
        if !self.passengers.asked.contains(&player) {
            return Err(AboardRefused::NotAsked);
        }
        let sails = |each: &PlayerId| {
            let named = self.harbour.names.get(each).is_some_and(|name| name == captain);
            let kept = self.harbour.accounts.get(each).is_some_and(|account| company.contains(&account.as_str()));
            let at_sea = self.berths.get(each).is_some_and(|berth| berth.sailing.is_some());
            *each != player && named && kept && at_sea && !self.travels_aboard(*each)
        };
        let found = self.berths.keys().copied().find(sails).ok_or(AboardRefused::NoCaptain)?;
        self.passengers.asked.remove(&player);
        self.passengers.captains.insert(player, found);
        Ok(found)
    }

    /// The captain whose ship a passenger is aboard.
    #[must_use]
    pub fn captain_of(&self, player: PlayerId) -> Option<PlayerId> {
        self.passengers.captains.get(&player).copied()
    }

    /// Every passenger, with their captain.
    pub fn passengers(&self) -> impl Iterator<Item = (PlayerId, PlayerId)> + '_ {
        self.passengers.captains.iter().map(|(player, captain)| (*player, *captain))
    }

    /// Whether a player asked to travel aboard another's ship or is aboard one: they sail no ship of their own.
    #[must_use]
    pub fn travels_aboard(&self, player: PlayerId) -> bool {
        self.passengers.asked.contains(&player) || self.passengers.captains.contains_key(&player)
    }

    /// A player leaves the sea: they travel aboard no more, and every passenger aboard their ship is let off.
    pub(super) fn let_off(&mut self, player: PlayerId) {
        self.passengers.asked.remove(&player);
        self.passengers.captains.remove(&player);
        let aboard: Vec<PlayerId> =
            self.passengers.captains.iter().filter(|(_, captain)| **captain == player).map(|(each, _)| *each).collect();
        for passenger in aboard {
            self.passengers.captains.remove(&passenger);
            self.harbour.told.push((passenger, vec![LET_OFF, self.clock as f64]));
        }
    }
}

#[cfg(test)]
#[path = "sea_passengers_tests.rs"]
mod tests;
