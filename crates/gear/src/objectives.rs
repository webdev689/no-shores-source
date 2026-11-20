//! The one engine the bounties and the side quests share: an objective is a count of something a room sees happen, and
//! each feat a room sees counts toward the bounties a character holds today and the side quests it holds.

use crate::bounties::board;
use crate::character::Character;
use crate::quests::{Quest, quests};
use crate::world::Difficulty;
use serde::Deserialize;

/// The faction and ranks the board names, as `foes` and `naval` number them.
pub const GREY_TITHE: u8 = 1;
pub const ELITE_RANK: u8 = 3;
pub const MINIBOSS_RANK: u8 = 4;

/// What an objective counts: one each time the room sees its feat. Each none is any; a rank counts it and every rank
/// above. Read from the board's table and the quests' data, never kept with a character.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Objective {
    Fell {
        #[serde(default)]
        faction: Option<u8>,
        #[serde(default)]
        rank: Option<u8>,
        #[serde(default)]
        island: Option<String>,
    },
    Gather {
        #[serde(default)]
        resource: Option<u8>,
    },
    Sink {
        #[serde(default)]
        water: Option<String>,
        #[serde(default)]
        rank: Option<u8>,
    },
    Clear {
        #[serde(default)]
        island: Option<String>,
        #[serde(default)]
        tier: Option<Difficulty>,
    },
}

/// What a room saw happen: a foe felled, by each player who shares its kill, by its faction, rank and island (a
/// continent's id; none where the room knows none); a resource node gathered, by its resource's place in the
/// catalogue; a ship sunk or taken, by her water and rank; a dungeon cleared, by its island and tier.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Feat<'a> {
    Felled { faction: u8, rank: u8, island: Option<&'a str> },
    Gathered { resource: u8 },
    Sunk { water: Option<&'a str>, rank: u8 },
    Cleared { island: Option<&'a str>, tier: Difficulty },
}

/// Whether a place the objective names, if it names one, is the feat's: a feat whose place is unknown matches none.
fn same_place(named: Option<&String>, seen: Option<&str>) -> bool {
    named.is_none_or(|named| seen == Some(named.as_str()))
}

impl Objective {
    /// Whether a feat counts toward it: one of its own kind, of its faction or resource, of its rank or tier or
    /// higher, and in its island or water.
    #[must_use]
    pub fn counts(&self, feat: &Feat<'_>) -> bool {
        match (self, *feat) {
            (Objective::Fell { faction, rank, island }, Feat::Felled { faction: felled, rank: of, island: on }) => {
                faction.is_none_or(|faction| faction == felled)
                    && rank.is_none_or(|rank| of >= rank)
                    && same_place(island.as_ref(), on)
            }
            (Objective::Gather { resource }, Feat::Gathered { resource: gathered }) => {
                resource.is_none_or(|resource| resource == gathered)
            }
            (Objective::Sink { water, rank }, Feat::Sunk { water: sunk_in, rank: of }) => {
                rank.is_none_or(|rank| of >= rank) && same_place(water.as_ref(), sunk_in)
            }
            (Objective::Clear { island, tier }, Feat::Cleared { island: on, tier: at }) => {
                tier.is_none_or(|tier| at >= tier) && same_place(island.as_ref(), on)
            }
            _ => false,
        }
    }
}

impl Character {
    /// Counts a feat toward each bounty held today, up to its target, and each side quest held: whether a count moved.
    /// A room whose day is not the record's counts no bounty: before it the board was another, after it they ended.
    pub fn saw(&mut self, feat: &Feat<'_>, day: u64) -> bool {
        self.saw_with(feat, day, &quests().quests)
    }

    /// `saw`, over the side quests given.
    pub(crate) fn saw_with(&mut self, feat: &Feat<'_>, day: u64, written: &[Quest]) -> bool {
        let mut moved = false;
        if day == self.activity.today.day {
            let on = board(day);
            for (place, count) in &mut self.activity.today.bounties {
                let Some(bounty) = on.get(usize::from(*place)) else { continue };
                if *count < bounty.target && bounty.objective.counts(feat) {
                    *count += 1;
                    moved = true;
                }
            }
        }
        for (id, count) in &mut self.story.quests {
            let Some(quest) = written.iter().find(|quest| quest.id == *id) else { continue };
            if *count < quest.target && quest.objective.counts(feat) {
                *count += 1;
                moved = true;
            }
        }
        moved
    }
}
