//! A player's part in their guild's week, after Destiny 2's clan XP and weekly clan engrams: a tenth of the XP they earn
//! given to the guild, at most so much a week; what they did toward each of the week's four guild bounties; and which
//! of those the guild finished they have claimed. The rooms count it; the accounts add each member's to their guild's
//! as they save it, and say which bounties the guild has done. The numbers are `content/guilds/guilds.json`, which the
//! accounts and the page read too.

use crate::asks::Refusal;
use crate::character::{Character, UnknownKeys};
use crate::dice::{Dice, Purpose};
use crate::objectives::{Feat, Objective};
use crate::world::Difficulty;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

/// How many guild bounties a week draws, as Destiny 2's four weekly clan engrams.
pub const SLOTS: usize = 4;

/// An objective as the guilds' file writes it: its kind, and what narrows it.
#[derive(Deserialize)]
struct Written {
    kind: String,
    faction: Option<u8>,
    rank: Option<u8>,
    island: Option<String>,
    resource: Option<u8>,
    water: Option<String>,
    tier: Option<String>,
}

#[derive(Deserialize)]
struct WrittenBounty {
    objective: Written,
    target: u32,
    #[serde(default)]
    together: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Contribution {
    tenths: u32,
    week_most: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WrittenFile {
    contribution: Contribution,
    bounties_a_week: usize,
    bounties: Vec<WrittenBounty>,
}

/// A guild bounty: what it counts, how many the guild needs, and whether a feat counts only with another of the guild
/// there.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GuildBounty {
    pub objective: Objective,
    pub target: u32,
    pub together: bool,
}

/// The guilds' numbers as the rules use them.
#[derive(Debug)]
pub struct Numbers {
    /// So many tenths of the XP a member earns go to the guild...
    pub tenths: u32,
    /// ...at most this much a week.
    pub week_most: u32,
    pub bounties: Vec<GuildBounty>,
}

fn objective_of(written: Written) -> Objective {
    let tier = match written.tier.as_deref() {
        Some("elite") => Some(Difficulty::Elite),
        Some("abyss") => Some(Difficulty::Abyss),
        Some(_) => Some(Difficulty::Normal),
        None => None,
    };
    match written.kind.as_str() {
        "gather" => Objective::Gather { resource: written.resource },
        "sink" => Objective::Sink { water: written.water, rank: written.rank },
        "clear" => Objective::Clear { island: written.island, tier },
        _ => Objective::Fell { faction: written.faction, rank: written.rank, island: written.island },
    }
}

/// The guilds' numbers, read once.
///
/// # Panics
/// If `content/guilds/guilds.json` is not the guilds' file, or draws a week other than four.
#[must_use]
pub fn numbers() -> &'static Numbers {
    static NUMBERS: OnceLock<Numbers> = OnceLock::new();
    NUMBERS.get_or_init(|| {
        let written: WrittenFile = serde_json::from_str(include_str!("../../../content/guilds/guilds.json"))
            .expect("content/guilds/guilds.json is the guilds' file");
        assert_eq!(written.bounties_a_week, SLOTS, "a week draws four guild bounties");
        Numbers {
            tenths: written.contribution.tenths,
            week_most: written.contribution.week_most,
            bounties: written
                .bounties
                .into_iter()
                .map(|bounty| GuildBounty {
                    objective: objective_of(bounty.objective),
                    target: bounty.target,
                    together: bounty.together,
                })
                .collect(),
        }
    })
}

/// One step of a 32-bit xorshift, the page's `stepped`.
fn stepped(seed: u32) -> u32 {
    let mut next = seed;
    next ^= next << 13;
    next ^= next >> 17;
    next ^ (next << 5)
}

/// The places of the guild bounties drawn for a week: the whole list shuffled by a seed from the week, its first four,
/// as the page's `bountiesOf` draws them to the bit.
#[must_use]
pub fn bounties_of(week: u64) -> [usize; SLOTS] {
    let count = numbers().bounties.len();
    let mut places: Vec<usize> = (0..count).collect();
    let low = week as u32;
    let seeded = low.wrapping_mul(2_654_435_761).wrapping_add(12_345);
    let mut seed = if seeded == 0 { 1 } else { seeded };
    for last in (1..count).rev() {
        seed = stepped(seed);
        let other = seed as usize % (last + 1);
        places.swap(last, other);
    }
    std::array::from_fn(|slot| places.get(slot).copied().unwrap_or_default())
}

/// A character's part in their guild's week: the week, the XP given, the count toward each of its four bounties, and
/// which they have claimed.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct GuildWeek {
    pub week: u64,
    pub given: u32,
    /// The XP they earned in the guild this week, of which the guild is given its share.
    #[serde(default)]
    pub gained: u32,
    pub counts: [u32; SLOTS],
    pub claimed: [bool; SLOTS],
    /// Whether they took the guild package the War Horn's foe gives this week.
    #[serde(default)]
    pub horn: bool,
    /// Whether they took the guild package their guild dungeon's first clear gives this week.
    #[serde(default)]
    pub delve: bool,
    /// What a later build kept here, kept as it was through a rollback.
    #[serde(flatten)]
    pub unknown: UnknownKeys,
}

/// What the accounts say of a player's guild this week, as the room holds it: which of the week's bounties the guild has
/// done, and whether the player was in it before the week turned.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Standing {
    pub done: [bool; SLOTS],
    pub before_the_week: bool,
}

/// What a member's guild's outposts give them wherever they play, each a percent more of what kills and clears pay:
/// the highest of each standing at any of the guild's outposts, as the accounts tell the room (`outpostLaw.ts`
/// `boonsOf`). Never kept: the room is told them afresh.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Boons {
    pub xp: u8,
    pub aurem: u8,
    pub reputation: u8,
}

impl Boons {
    /// `amount` and a share of it more.
    #[must_use]
    pub fn more(amount: u32, percent: u8) -> u32 {
        amount.saturating_add(amount.saturating_mul(u32::from(percent)) / 100)
    }
}

impl Character {
    /// Their record for `week`, begun afresh when it is a new one.
    fn guild_week(&mut self, week: u64) -> &mut GuildWeek {
        if self.guild.week != week {
            self.guild = GuildWeek { week, ..GuildWeek::default() };
        }
        &mut self.guild
    }

    /// Gives a member's guild its share of XP they earned, up to the week's most; answers what it gave.
    /// The share is of the week's whole gain, less what was given of it, so many small gains give as one large one.
    pub fn give_guild(&mut self, week: u64, xp: u32) -> u32 {
        let numbers = numbers();
        let record = self.guild_week(week);
        record.gained = record.gained.saturating_add(xp);
        let share = u64::from(record.gained) * u64::from(numbers.tenths) / 10;
        let owed = u32::try_from(share).unwrap_or(u32::MAX).min(numbers.week_most);
        let given = owed.saturating_sub(record.given);
        record.given += given;
        given
    }

    /// Counts a feat toward each of the week's guild bounties it serves; one that needs two of the guild counts it only
    /// `together`. A count stops at its target.
    pub fn guild_saw(&mut self, week: u64, feat: &Feat<'_>, together: bool) {
        let drawn = bounties_of(week);
        let record = self.guild_week(week);
        for (slot, place) in drawn.into_iter().enumerate() {
            let Some(bounty) = numbers().bounties.get(place) else { continue };
            if (together || !bounty.together) && bounty.objective.counts(feat) {
                record.counts[slot] = (record.counts[slot] + 1).min(bounty.target);
            }
        }
    }

    /// Claims a guild bounty the guild finished this week, once: a guild package, as a faction's is.
    ///
    /// # Errors
    /// Why not: no such bounty, not done yet, claimed already, in the guild only since the week turned, or ten
    /// Vestiges carried.
    pub fn claim_guild_bounty(&mut self, week: u64, slot: u8, standing: Standing, dice: &Dice) -> Result<(), Refusal> {
        let slot = usize::from(slot);
        if slot >= SLOTS {
            return Err(Refusal::NoSuchGuildBounty);
        }
        if !standing.done[slot] {
            return Err(Refusal::GuildBountyNotDone);
        }
        if self.guild_week(week).claimed[slot] {
            return Err(Refusal::GuildBountyClaimed);
        }
        if !standing.before_the_week {
            return Err(Refusal::JoinedThisWeek);
        }
        self.give_package(Purpose::GuildPackage, dice)?;
        self.guild.claimed[slot] = true;
        Ok(())
    }

    /// Takes the guild package the War Horn's foe gives a member who fought it, once a week.
    ///
    /// # Errors
    /// Taken already this week, or ten Vestiges carried.
    pub fn claim_horn_package(&mut self, week: u64, dice: &Dice) -> Result<(), Refusal> {
        if self.guild_week(week).horn {
            return Err(Refusal::GuildBountyClaimed);
        }
        self.give_package(Purpose::GuildPackage, dice)?;
        self.guild.horn = true;
        Ok(())
    }

    /// Takes the guild package a member's first clear of their guild dungeon gives, once a week.
    ///
    /// # Errors
    /// Taken already this week, or ten Vestiges carried.
    pub fn claim_delve_package(&mut self, week: u64, dice: &Dice) -> Result<(), Refusal> {
        if self.guild_week(week).delve {
            return Err(Refusal::GuildBountyClaimed);
        }
        self.give_package(Purpose::GuildPackage, dice)?;
        self.guild.delve = true;
        Ok(())
    }
}

#[cfg(test)]
#[path = "guild_tests.rs"]
mod tests;
