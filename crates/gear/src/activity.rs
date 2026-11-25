//! What a character has done this day and this week, kept with the account: the tiers of the dungeon of the day it
//! has cleared, its bounties and the places it turned in, the week's two dungeons it has cleared and the Abyss boon.
//! Each record begins anew at its first touch in a later day or week (`crate::clock`), and never turns back, so a room
//! whose clock is a few seconds behind another's cannot give a reward twice.

use crate::world::Difficulty;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

/// How many of the bounty board's places are the town's on land, at sea and in dungeons.
pub const BOUNTIES: u8 = 6;
/// How many bounties each faction posts a day, and how many factions post them (`content/gear/factions.json`'s).
pub const FACTION_BOUNTIES: u8 = 3;
pub const POSTING_FACTIONS: u8 = 3;
/// How many of the town's bounties are in the passages, and the first of their places: after the factions', so no
/// place kept before them changes meaning.
pub const PASSAGE_BOUNTIES: u8 = 2;
pub const PASSAGE_PLACES_FROM: u8 = BOUNTIES + POSTING_FACTIONS * FACTION_BOUNTIES;
/// Every place a bounty stands at: the town's six, then each faction's three in the factions' order, then the
/// passages' two, which are the town's.
pub const BOUNTY_PLACES: u8 = PASSAGE_PLACES_FROM + PASSAGE_BOUNTIES;

/// Whether a place is the town's: its six, or the passages' two.
#[must_use]
pub const fn is_town_place(place: u8) -> bool {
    place < BOUNTIES || (place >= PASSAGE_PLACES_FROM && place < BOUNTY_PLACES)
}

/// A character's day and week.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Activity {
    pub today: Today,
    pub this_week: ThisWeek,
    /// What a later build kept here, kept as it was through a rollback.
    #[serde(flatten)]
    pub unknown: crate::character::UnknownKeys,
}

/// How many islands' nodes gathered today a character keeps.
pub const ISLES_GATHERED_KEPT: usize = 16;

/// The day's record: the tiers of the dungeon of the day cleared, and each bounty held, by its board place, with its
/// count so far.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Today {
    pub day: u64,
    #[serde(deserialize_with = "known_tiers")]
    pub cleared: BTreeSet<Difficulty>,
    pub bounties: BTreeMap<u8, u32>,
    /// The board's places turned in today: each pays once.
    #[serde(skip_serializing_if = "BTreeSet::is_empty")]
    pub turned_in: BTreeSet<u8>,
    /// The factions' bounties held and turned in today, by their places (6 to 14), kept apart from the town's: a room
    /// built before them keeps only the town's six under `bounties`, and carries a key it does not know as it was.
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub faction_bounties: BTreeMap<u8, u32>,
    #[serde(skip_serializing_if = "BTreeSet::is_empty")]
    pub faction_turned_in: BTreeSet<u8>,
    /// The sea islands' resource nodes gathered today, each island by its seed with its nodes' numbers, the latest
    /// `ISLES_GATHERED_KEPT` islands kept: spent for the character until the day turns
    /// ([[The Audit's Leftovers Are Fixed as Claude Suggested]]).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub gathered: Vec<(u64, Vec<u8>)>,
    /// Whether the Elite and the Abyss Playlist's daily rewards are taken today (`crate::playlist`).
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub elite_playlist: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub abyss_playlist: bool,
    /// Whether a heroic chest has paid its Essence today (`chests::FIRST_HEROIC_ESSENCE`).
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub heroic_chest: bool,
    /// The islands whose passages' day's lamp has paid today (`lamps.rs`): the day's first lamp lit on each.
    #[serde(skip_serializing_if = "BTreeSet::is_empty")]
    pub passage_lamp: BTreeSet<String>,
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
    /// The Elite and the Abyss Playlist's clears counted this week, to three: the third pays the weekly reward
    /// (`crate::playlist`), so three means it is paid.
    #[serde(skip_serializing_if = "is_zero")]
    pub elite_playlist: u8,
    #[serde(skip_serializing_if = "is_zero")]
    pub abyss_playlist: u8,
    /// The lamps lit this week on each island's passages, by the island's continent's id and each lamp's number (1 to
    /// 4): each pays the week's lamp once, and is offered as a place to begin a dive (`lamps.rs`).
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub passage_lamps: BTreeMap<String, BTreeSet<u8>>,
    /// The passage zones whose cache has rolled for an Atheric bounty's find this week, by island and each zone's
    /// number in the week's web: each rolls once a week (`atheric_bounty.rs`).
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub passage_finds: BTreeMap<String, BTreeSet<u16>>,
    /// What a later build kept here, kept as it was through a rollback.
    #[serde(flatten)]
    pub unknown: crate::character::UnknownKeys,
}

#[allow(clippy::trivially_copy_pass_by_ref, reason = "serde hands a reference")]
fn is_zero(count: &u8) -> bool {
    *count == 0
}

/// The tiers cleared as read: one this build does not know (a later build's) is left out rather than failing the
/// whole character's read.
fn known_tiers<'de, D: serde::Deserializer<'de>>(reader: D) -> Result<BTreeSet<Difficulty>, D::Error> {
    let read = Vec::<serde_json::Value>::deserialize(reader)?;
    Ok(read.into_iter().filter_map(|tier| serde_json::from_value(tier).ok()).collect())
}

impl Today {
    /// The counts held under a place's keys: the town's places (the passages' among them) in `bounties`, a faction's
    /// in `faction_bounties`.
    #[must_use]
    pub fn held(&self, place: u8) -> &BTreeMap<u8, u32> {
        if is_town_place(place) { &self.bounties } else { &self.faction_bounties }
    }

    pub fn held_mut(&mut self, place: u8) -> &mut BTreeMap<u8, u32> {
        if is_town_place(place) { &mut self.bounties } else { &mut self.faction_bounties }
    }

    /// The places turned in under a place's keys, the town's or the factions'.
    #[must_use]
    pub fn paid(&self, place: u8) -> &BTreeSet<u8> {
        if is_town_place(place) { &self.turned_in } else { &self.faction_turned_in }
    }

    pub fn paid_mut(&mut self, place: u8) -> &mut BTreeSet<u8> {
        if is_town_place(place) { &mut self.turned_in } else { &mut self.faction_turned_in }
    }
}

impl Activity {
    /// The nodes of the island of `seed` gathered on `day`, none on another day.
    #[must_use]
    pub fn gathered_on(&self, day: u64, seed: u64) -> &[u8] {
        let today = (self.today.day == day).then_some(&self.today.gathered);
        today.and_then(|isles| isles.iter().find(|(isle, _)| *isle == seed)).map_or(&[], |(_, nodes)| nodes)
    }

    /// Notes a node of the island of `seed` gathered on `day`, that island now the latest touched: the island touched
    /// least lately is let go past `ISLES_GATHERED_KEPT`.
    pub fn gather_on(&mut self, day: u64, seed: u64, node: u8) {
        let isles = &mut self.today(day).gathered;
        let mut nodes = isles.iter().position(|(isle, _)| *isle == seed).map_or_else(Vec::new, |at| isles.remove(at).1);
        if !nodes.contains(&node) {
            nodes.push(node);
        }
        isles.push((seed, nodes));
        if isles.len() > ISLES_GATHERED_KEPT {
            isles.remove(0);
        }
    }

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

    /// Made whole as read: the town's places (the passages' among them) under the town's keys and the factions' under
    /// theirs, none past the board.
    #[must_use]
    pub fn kept(mut self) -> Self {
        let factions = |place: &u8| !is_town_place(*place) && *place < BOUNTY_PLACES;
        self.today.bounties.retain(|place, _| is_town_place(*place));
        self.today.turned_in.retain(|place| is_town_place(*place));
        self.today.faction_bounties.retain(|place, _| factions(place));
        self.today.faction_turned_in.retain(factions);
        self
    }
}
