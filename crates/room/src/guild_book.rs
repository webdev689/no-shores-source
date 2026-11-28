//! What a room knows of each player's guild, as the accounts told it (`gear::guild`): which guild, which of the week's
//! bounties it has done, and whether the player was in it before the week turned. The room gives each member's guild a
//! tenth of the XP they gain, measured from a mark it keeps, so XP gained before joining or in another room gives
//! nothing twice; counts what members do toward the week's guild bounties, together when another member of the same
//! guild is in the room; and answers a member's claim.

use crate::PlayerId;
use gear::Character;
use gear::asks::Refusal;
use gear::dice::Dice;
use gear::guild::{Boons, Standing};
use gear::objectives::Feat;
use std::collections::BTreeMap;

/// A player's guild as the accounts last told the room.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GuildSeen {
    pub id: String,
    pub standing: Standing,
    pub boons: Boons,
}

/// One player's guild in the room, the XP they held when it last gave their guild its share, and whether their kept
/// character had been given them by then.
#[derive(Debug, Default)]
struct Held {
    seen: Option<GuildSeen>,
    mark: u64,
    claimed: bool,
}

/// More XP than any one tick pays: a jump past it is a character given back or replaced, measured afresh.
const MOST_A_TICK: u64 = 50_000;
/// How many ticks after the week turns a member whose record is still the week before's neither gives nor counts nor
/// claims: ten seconds, past the save that keeps that week's last count, which their record begun afresh would lose.
const TURN_WAIT_TICKS: u32 = 600;

/// Each player's guild in a room, and the week it last gave in with the ticks since it turned.
#[derive(Debug, Default)]
pub struct Guilds {
    held: BTreeMap<PlayerId, Held>,
    turn: Option<(u64, u32)>,
}

impl Guilds {
    /// Notes what the accounts say of a player's guild, none for no guild; `xp`, what they hold now, is the mark their
    /// next gains are measured from, unless they stay in the guild they were in.
    pub fn set(&mut self, player: PlayerId, seen: Option<GuildSeen>, xp: u64) {
        let held = self.held.entry(player).or_insert(Held { seen: None, mark: xp, claimed: false });
        let same = held.seen.as_ref().map(|kept| &kept.id) == seen.as_ref().map(|told| &told.id);
        if !same {
            held.mark = xp;
        }
        held.seen = seen;
    }

    /// The guild a player is in, as the room was told.
    #[must_use]
    pub fn of(&self, player: PlayerId) -> Option<&GuildSeen> {
        self.held.get(&player).and_then(|held| held.seen.as_ref())
    }

    /// Gives each member's guild a tenth of the XP they gained since the mark, for `week`, and each member their
    /// guild's boons; a player in no guild gives nothing, their mark moved on all the same. Each is given with whether
    /// their kept character is theirs yet: the character given them in its place is measured afresh, not counted as
    /// gained. Players gone are let go. Answers those whose record moved.
    pub fn give<'kept>(
        &mut self,
        week: u64,
        characters: impl Iterator<Item = (PlayerId, &'kept mut Character, bool)>,
    ) -> Vec<PlayerId> {
        let mut moved = Vec::new();
        let mut present = Vec::new();
        self.turn = Some(match self.turn {
            Some((was, ticks)) if was == week => (week, ticks.saturating_add(1)),
            Some(_) => (week, 0),
            None => (week, TURN_WAIT_TICKS),
        });
        for (player, character, claimed) in characters {
            present.push(player);
            let turning = self.turning(character, week);
            let Some(held) = self.held.get_mut(&player) else { continue };
            // A character given back or replaced holds no boons of its own: they are the guild's, given each tick.
            character.boons = held.seen.as_ref().map(|seen| seen.boons).unwrap_or_default();
            if turning {
                // Its gains wait, measured from the mark still, for the new week's record.
                continue;
            }
            let gained = character.xp.saturating_sub(held.mark);
            held.mark = character.xp;
            let given_back = claimed && !held.claimed;
            held.claimed = claimed;
            if gained > 0 && gained <= MOST_A_TICK && !given_back && held.seen.is_some() {
                let gained = u32::try_from(gained).unwrap_or(u32::MAX);
                if character.give_guild(week, gained) > 0 {
                    moved.push(player);
                }
            }
        }
        self.held.retain(|player, _| present.contains(player));
        moved
    }

    /// Whether a character's guild record is of the week before `week` while the week has only just turned
    /// (`TURN_WAIT_TICKS`): touched now, it would begin afresh before that week's last count is saved.
    fn turning(&self, character: &Character, week: u64) -> bool {
        character.guild.week < week && self.turn.is_some_and(|(at, ticks)| at == week && ticks < TURN_WAIT_TICKS)
    }

    /// Counts a feat toward a member's guild bounties, together when another of `present` is in their guild; none
    /// while their record waits on the week's turn.
    pub fn saw(&self, player: PlayerId, character: &mut Character, week: u64, feat: &Feat<'_>, present: &[PlayerId]) {
        let Some(own) = self.of(player).filter(|_| !self.turning(character, week)) else { return };
        let together =
            present.iter().any(|other| *other != player && self.of(*other).is_some_and(|theirs| theirs.id == own.id));
        character.guild_saw(week, feat, together);
    }

    /// A member's claim of a guild bounty their guild finished this week (`Character::claim_guild_bounty`).
    ///
    /// # Errors
    /// Why not: in no guild, the week only just turned over their record, or the character's own refusal.
    pub fn claim(
        &self,
        player: PlayerId,
        character: &mut Character,
        week: u64,
        slot: u8,
        dice: &Dice,
    ) -> Result<(), Refusal> {
        let seen = self.of(player).ok_or(Refusal::NotInGuild)?;
        if self.turning(character, week) {
            return Err(Refusal::OutpostTrouble);
        }
        character.claim_guild_bounty(week, slot, seen.standing, dice)
    }
}

#[cfg(test)]
#[path = "guild_book_tests.rs"]
mod tests;
