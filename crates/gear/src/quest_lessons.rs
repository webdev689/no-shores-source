//! The opening's riding and sailing lessons, as goals: each step a thing the body, the horse or the ship does, which
//! the rooms judge from what they step and tell the quest log of (`Event::Ride`, `Event::Sail`); the page names its
//! keys as bound now. And the steps that teach the keepers' gifts (`Use`): each an ask the room answered
//! (`Event::Used`).

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

/// What a player does with a keeper's gift for a use goal: has the Mage open a Vestige, takes a piece out of the vault,
/// wears a dye, or takes a letter from the mail.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UseAct {
    Identify,
    Withdraw,
    Dye,
    Letter,
}

impl UseAct {
    /// The act an ask the room answered was: any Vestige opened, any piece taken from the vault, any dye worn, any
    /// letter taken; none for any other ask.
    #[must_use]
    pub fn of(ask: &crate::asks::Ask) -> Option<Self> {
        use crate::asks::Ask;
        match ask {
            Ask::Identify { .. } => Some(Self::Identify),
            Ask::Withdraw { .. } => Some(Self::Withdraw),
            Ask::TakeLetter { .. } | Ask::TakeAllLetters => Some(Self::Letter),
            Ask::WearCosmetic { cosmetic } => crate::cosmetics::cosmetics()
                .get(usize::from(*cosmetic))
                .is_some_and(|found| found.kind == crate::cosmetics::CosmeticKind::Dye)
                .then_some(Self::Dye),
            _ => None,
        }
    }

    /// The keeper's counter it is done at, by their key (`talk`'s `to`): none for a dye, worn anywhere.
    #[must_use]
    pub fn counter(self) -> Option<&'static str> {
        match self {
            Self::Identify => Some("mage"),
            Self::Withdraw => Some("vault"),
            Self::Dye => None,
            Self::Letter => Some("mail"),
        }
    }
}

/// A use goal: its act, and the counter it is done at, which the page points at (`UseAct::counter`).
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Use {
    pub act: UseAct,
    pub to: Option<String>,
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
