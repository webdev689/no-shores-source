//! The opening's riding and sailing lessons, as goals: each step a thing the body, the horse or the ship does, which
//! the rooms judge from what they step and tell the quest log of (`Event::Ride`, `Event::Sail`); the page names its
//! keys as bound now.

use serde::Deserialize;

/// What a rider does for a riding goal: gets up, rides at a walk, at a gallop, boosts, gets down, or rides up to a
/// keeper's counter.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RideAct {
    Mount,
    Walk,
    Gallop,
    Boost,
    Dismount,
    Arrive,
}

/// What a captain does for a sailing goal: comes aboard their ship at sea, sets sail, steers, trims its canvas on the
/// pace dial, strikes the Harbourmaster's hulk with a ball, or raises the held map at the helm.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SailAct {
    Board,
    Sail,
    Steer,
    Trim,
    Fire,
    Map,
}

/// A riding goal: its act, and for an arrival the counter ridden up to, by its keeper's key (`talk`'s `to`).
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Ride {
    pub act: RideAct,
    pub to: Option<String>,
}

/// A sailing goal: its act.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Sail {
    pub act: SailAct,
}

impl Ride {
    /// Whether a rider's act meets it: the same act, and for an arrival at the same counter.
    #[must_use]
    pub fn met_by(&self, act: RideAct, at: Option<&str>) -> bool {
        self.act == act && (act != RideAct::Arrive || self.to.as_deref() == at)
    }

    /// Whether its fields fit its act: a counter named for an arrival alone.
    #[must_use]
    pub fn fits(&self) -> bool {
        (self.act == RideAct::Arrive) == self.to.is_some()
    }
}

#[cfg(test)]
impl crate::character::Character {
    /// Tells it every act of the Tack's riding lesson, as a rider taking it does, arriving at the Harbourmaster's.
    pub(crate) fn ride_the_lesson(&mut self) {
        use crate::quests::Event;
        for act in [RideAct::Mount, RideAct::Walk, RideAct::Gallop, RideAct::Boost, RideAct::Dismount] {
            self.tell(&Event::Ride { act, at: None });
        }
        self.tell(&Event::Ride { act: RideAct::Arrive, at: Some("harbourmaster") });
    }

    /// Tells it every act of the Harbourmaster's sailing lesson, then its docking at Overlook.
    pub(crate) fn sail_the_lesson(&mut self) {
        use crate::quests::Event;
        for act in [SailAct::Board, SailAct::Sail, SailAct::Steer, SailAct::Trim, SailAct::Map, SailAct::Fire] {
            self.tell(&Event::Sail(act));
        }
        self.tell(&Event::Enter("overlook-social"));
    }
}
