//! What a room knows of each player's guild, as the accounts told it (`gear::guild`): which guild, which of the week's
//! bounties it has done, and whether the player was in it before the week turned. The room gives each member's guild a
//! tenth of the XP they gain, measured from a mark it keeps, so XP gained before joining or in another room gives
//! nothing twice; counts what members do toward the week's guild bounties, together when another member of the same
//! guild is in the room; and answers a member's claim.

use crate::PlayerId;
use gear::Character;
use gear::asks::Refusal;
use gear::dice::Dice;
use gear::guild::Standing;
use gear::objectives::Feat;
use std::collections::BTreeMap;

/// A player's guild as the accounts last told the room.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GuildSeen {
    pub id: String,
    pub standing: Standing,
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

/// Each player's guild in a room.
#[derive(Debug, Default)]
pub struct Guilds {
    held: BTreeMap<PlayerId, Held>,
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

    /// Gives each member's guild a tenth of the XP they gained since the mark, for `week`; a player in no guild gives
    /// nothing, their mark moved on all the same. Each is given with whether their kept character is theirs yet: the
    /// character given them in its place is measured afresh, not counted as gained. Players gone are let go. Answers
    /// those whose record moved.
    pub fn give<'kept>(
        &mut self,
        week: u64,
        characters: impl Iterator<Item = (PlayerId, &'kept mut Character, bool)>,
    ) -> Vec<PlayerId> {
        let mut moved = Vec::new();
        let mut present = Vec::new();
        for (player, character, claimed) in characters {
            present.push(player);
            let Some(held) = self.held.get_mut(&player) else { continue };
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

    /// Counts a feat toward a member's guild bounties, together when another of `present` is in their guild.
    pub fn saw(&self, player: PlayerId, character: &mut Character, week: u64, feat: &Feat<'_>, present: &[PlayerId]) {
        let Some(own) = self.of(player) else { return };
        let together =
            present.iter().any(|other| *other != player && self.of(*other).is_some_and(|theirs| theirs.id == own.id));
        character.guild_saw(week, feat, together);
    }

    /// A member's claim of a guild bounty their guild finished this week (`Character::claim_guild_bounty`).
    ///
    /// # Errors
    /// Why not: in no guild, or the character's own refusal.
    pub fn claim(
        &self,
        player: PlayerId,
        character: &mut Character,
        week: u64,
        slot: u8,
        dice: &Dice,
    ) -> Result<(), Refusal> {
        let seen = self.of(player).ok_or(Refusal::NotInGuild)?;
        character.claim_guild_bounty(week, slot, seen.standing, dice)
    }
}

#[cfg(test)]
#[path = "guild_book_tests.rs"]
mod tests;
