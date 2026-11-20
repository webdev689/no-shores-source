//! What a character has done this day and this week, kept with the account: the tiers of the dungeon of the day it
//! has cleared, its bounties and the places it turned in, the week's two dungeons it has cleared and the Abyss boon.
//! Each record begins anew at its first touch in a later day or week (`crate::clock`), and never turns back, so a room
//! whose clock is a few seconds behind another's cannot give a reward twice.

use crate::world::Difficulty;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

/// How many places the bounty board has.
pub const BOUNTIES: u8 = 6;

/// A character's day and week.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Activity {
    pub today: Today,
    pub this_week: ThisWeek,
}

/// The day's record: the tiers of the dungeon of the day cleared, and each bounty held, by its board place, with its
/// count so far.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Today {
    pub day: u64,
    pub cleared: BTreeSet<Difficulty>,
    pub bounties: BTreeMap<u8, u32>,
    /// The board's places turned in today: each pays once.
    #[serde(skip_serializing_if = "BTreeSet::is_empty")]
    pub turned_in: BTreeSet<u8>,
    /// What a later build kept here, kept as it was through a rollback.
    #[serde(flatten)]
    pub unknown: crate::character::UnknownKeys,
}

/// The week's record: whether the Elite and the Abyss Dungeon of the week were cleared, and whether the Abyss boon is
/// held.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct ThisWeek {
    pub week: u64,
    pub elite: bool,
    pub abyss: bool,
    pub boon: bool,
}

impl Activity {
    /// The day's record, begun anew first when `day` is later than the one it holds; never turned back.
    pub fn today(&mut self, day: u64) -> &mut Today {
        if day > self.today.day {
            self.today = Today { day, ..Today::default() };
        }
        &mut self.today
    }

    /// The week's record, begun anew first when `week` is later than the one it holds; never turned back.
    pub fn this_week(&mut self, week: u64) -> &mut ThisWeek {
        if week > self.this_week.week {
            self.this_week = ThisWeek { week, ..ThisWeek::default() };
        }
        &mut self.this_week
    }

    /// Made whole as read: no bounty held or turned in past the board's six places.
    #[must_use]
    pub fn kept(mut self) -> Self {
        self.today.bounties.retain(|place, _| *place < BOUNTIES);
        self.today.turned_in.retain(|place| *place < BOUNTIES);
        self
    }
}
