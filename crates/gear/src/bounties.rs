//! The bounty board: the town's six bounties a day and each faction's three, the same for everyone, drawn by the
//! clock's day (`crate::activities`). The town's are two on land, two at sea and two in dungeons and pay XP and Aurem;
//! a faction's are three of its own four, taken only by a player pledged to it, counting only while they wear its
//! cape, and pay XP and its reputation. Each is taken and turned in at the board by the day of the board shown, and
//! pays once at the character's level, more for a bigger task, as Destiny 1's bounties paid in three tiers.

use crate::activities::{BOUNTY_DRAWS, drawn};
use crate::activity::{BOUNTIES, BOUNTY_PLACES, FACTION_BOUNTIES, POSTING_FACTIONS};
use crate::asks::{Done, Here, Refusal};
use crate::character::Character;
use crate::factions::factions;
use crate::objectives::{ELITE_RANK, GREY_TITHE, MINIBOSS_RANK, Objective};
use crate::rewards::at_level;

/// A bounty on the board: what it counts, how many, its words, its name, where it counts and who posts it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Bounty {
    pub objective: Objective,
    pub target: u32,
    pub words: &'static str,
    /// Its short name, as its card heads it: content, never kept or matched.
    pub name: &'static str,
    /// Where it counts, by the board's pools: 0 on land, 1 at sea, 2 in dungeons.
    pub pool: u8,
    /// Its tier, 1 to 3, by how big a task it is: it pays once, half again or twice a first tier's
    /// (`bounty_pay`), as Destiny 1's paid 2,500, 3,750 or 5,000 XP.
    pub tier: u8,
    /// The faction that posts it, by its number; 0 for the town's.
    pub faction: u8,
}

/// What a first tier's bounty pays at level 5, raised as a kill is by (5 + the character's level) ÷ 10 when turned in.
pub const BOUNTY_XP: u32 = 1_000;
pub const BOUNTY_AUREM: u32 = 60;

/// The most characters a bounty's name holds, as its card heads it.
pub const BOUNTY_NAME_MOST: usize = 16;

/// A bounty as the board draws it: what it counts, how many, its words and name, where it counts and its tier.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Template {
    pub(crate) objective: fn() -> Objective,
    pub(crate) target: u32,
    pub(crate) words: &'static str,
    pub(crate) name: &'static str,
    pub(crate) pool: u8,
    pub(crate) tier: u8,
}

const fn posted(
    objective: fn() -> Objective,
    target: u32,
    words: &'static str,
    name: &'static str,
    pool: u8,
    tier: u8,
) -> Template {
    Template { objective, target, words, name, pool, tier }
}

const fn felled(faction: Option<u8>, rank: Option<u8>) -> Objective {
    Objective::Fell { faction, rank, island: None }
}

const fn sunk(rank: Option<u8>) -> Objective {
    Objective::Sink { water: None, rank }
}

const fn cleared() -> Objective {
    Objective::Clear { island: None, tier: None }
}

/// The town's bounties, on land, at sea and in dungeons. None names an island or a water: the board is the same for
/// every level, and the islands' bands run from 1 to 30.
pub(crate) static LAND: [Template; 4] = [
    posted(|| felled(Some(GREY_TITHE), None), 30, "Defeat 30 Grey Tithe foes.", "Tithe Collector", 0, 2),
    posted(|| felled(None, Some(ELITE_RANK)), 6, "Defeat 6 foes of Elite rank or higher.", "A Cut Above", 0, 2),
    posted(|| Objective::Gather { resource: None }, 6, "Gather 6 resource nodes.", "Honest Work", 0, 1),
    posted(|| felled(None, Some(MINIBOSS_RANK)), 2, "Defeat 2 foes of Miniboss rank or higher.", "Big Game", 0, 3),
];
pub(crate) static SEA: [Template; 3] = [
    posted(|| sunk(None), 3, "Sink or take 3 ships.", "Broadside", 1, 1),
    posted(|| sunk(Some(ELITE_RANK)), 1, "Sink or take a ship of Elite rank or higher.", "Bigger Fish", 1, 2),
    posted(|| sunk(None), 6, "Sink or take 6 ships.", "Sea Wolf", 1, 3),
];
pub(crate) static DUNGEONS: [Template; 3] = [
    posted(cleared, 1, "Clear a dungeon.", "Into the Dark", 2, 1),
    posted(cleared, 2, "Clear 2 dungeons.", "Deeper Still", 2, 2),
    posted(cleared, 3, "Clear 3 dungeons.", "Deep Delver", 2, 3),
];

/// Each faction's own four, by its number less one: the Stormcallers' fights, the Lamplighters' lamps and sea lanes,
/// and the Veiled's quiet work against the strong.
pub(crate) static FACTION_POOLS: [[Template; 4]; POSTING_FACTIONS as usize] = [
    [
        posted(|| felled(None, None), 40, "Defeat 40 foes.", "Storm Front", 0, 1),
        posted(|| felled(None, Some(ELITE_RANK)), 8, "Defeat 8 foes of Elite rank or higher.", "Thunderhead", 0, 2),
        posted(|| sunk(None), 4, "Sink or take 4 ships.", "Squall Line", 1, 2),
        posted(
            || felled(None, Some(MINIBOSS_RANK)),
            3,
            "Defeat 3 foes of Miniboss rank or higher.",
            "Eye of the Storm",
            0,
            3,
        ),
    ],
    [
        posted(|| Objective::Gather { resource: None }, 8, "Gather 8 resource nodes.", "Lamp Oil", 0, 1),
        posted(|| sunk(None), 3, "Sink or take 3 ships.", "Calm Waters", 1, 1),
        posted(cleared, 2, "Clear 2 dungeons.", "Light the Way", 2, 2),
        posted(|| sunk(Some(ELITE_RANK)), 2, "Sink or take 2 ships of Elite rank or higher.", "Harbour Light", 1, 3),
    ],
    [
        posted(|| felled(Some(GREY_TITHE), None), 25, "Defeat 25 Grey Tithe foes.", "Quiet Knives", 0, 1),
        posted(cleared, 1, "Clear a dungeon.", "Below Stairs", 2, 1),
        posted(|| felled(None, Some(ELITE_RANK)), 10, "Defeat 10 foes of Elite rank or higher.", "Night Work", 0, 2),
        posted(
            || felled(None, Some(MINIBOSS_RANK)),
            2,
            "Defeat 2 foes of Miniboss rank or higher.",
            "No Witnesses",
            0,
            3,
        ),
    ],
];

/// A template as the board posts it, by the faction that posts it.
fn bounty_of(template: &Template, faction: u8) -> Bounty {
    let Template { objective, target, words, name, pool, tier } = *template;
    Bounty { objective: objective(), target, words, name, pool, tier, faction }
}

/// The town's six: places 0 and 1 on land, 2 and 3 at sea, 4 and 5 in dungeons, each pair two of its pool.
#[must_use]
pub fn board(day: u64) -> [Bounty; 6] {
    let pools: [&[Template]; 3] = [&LAND, &SEA, &DUNGEONS];
    let pick = |place: usize| {
        let pool = pools[place / 2];
        let pair = u32::try_from(place / 2 * 2).unwrap_or(0);
        let first = drawn(day, BOUNTY_DRAWS, pair, pool.len());
        let index = if place.is_multiple_of(2) {
            first
        } else {
            let other = drawn(day, BOUNTY_DRAWS, pair + 1, pool.len() - 1);
            if other >= first { other + 1 } else { other }
        };
        bounty_of(&pool[index], 0)
    };
    std::array::from_fn(pick)
}

/// The draws a faction's day is rolled at, clear of the town's pairs (0 to 5).
const FACTION_DRAWS_FROM: u32 = 16;

/// A faction's three of the day, by its number: its four in their order, less the one the day leaves out; none for a
/// faction that posts none.
#[must_use]
pub fn faction_board(day: u64, faction: u8) -> Option<[Bounty; FACTION_BOUNTIES as usize]> {
    let pool = FACTION_POOLS.get(usize::from(faction).checked_sub(1)?)?;
    let left_out = drawn(day, BOUNTY_DRAWS, FACTION_DRAWS_FROM + u32::from(faction), pool.len());
    let mut kept = (0..pool.len()).filter(|index| *index != left_out);
    Some(std::array::from_fn(|_| bounty_of(&pool[kept.next().unwrap_or(0)], faction)))
}

/// The places of a faction's bounties on the board: after the town's six, each faction's three in their order.
#[must_use]
pub fn faction_places(faction: u8) -> std::ops::Range<u8> {
    let first = BOUNTIES + faction.saturating_sub(1).saturating_mul(FACTION_BOUNTIES);
    first..first.saturating_add(FACTION_BOUNTIES)
}

/// The faction whose bounty stands at a place, by its number; 0 for the town's; none past the board.
#[must_use]
pub fn faction_at(place: u8) -> Option<u8> {
    match place {
        _ if place < BOUNTIES => Some(0),
        _ if place < BOUNTY_PLACES => Some((place - BOUNTIES) / FACTION_BOUNTIES + 1),
        _ => None,
    }
}

/// The bounty at a place of the day's board, the town's or a faction's; none past the board.
#[must_use]
pub fn bounty_at(day: u64, place: u8) -> Option<Bounty> {
    match faction_at(place)? {
        0 => board(day).into_iter().nth(usize::from(place)),
        faction => {
            let first = faction_places(faction).start;
            faction_board(day, faction)?.into_iter().nth(usize::from(place - first))
        }
    }
}

/// What a bounty of a tier (1 to 3) pays a character at its level when turned in, XP then Aurem: a first tier's at
/// the level, the second's half again, the third's twice, each rounded down. A faction's pays the XP alone, and its
/// reputation (`faction_bounty_reputation`) in the Aurem's place.
#[must_use]
pub fn bounty_pay(level: u8, tier: u8) -> (u32, u32) {
    (by_tier(at_level(BOUNTY_XP, level), tier), by_tier(at_level(BOUNTY_AUREM, level), tier))
}

/// What a faction's bounty of a tier pays in its reputation, whatever the level, raised by tier as its XP is.
#[must_use]
pub fn faction_bounty_reputation(tier: u8) -> u32 {
    by_tier(factions().bounty_reputation, tier)
}

/// A first tier's amount at a tier: once, half again or twice, rounded down.
fn by_tier(amount: u32, tier: u8) -> u32 {
    amount * (u32::from(tier.clamp(1, 3)) + 1) / 2
}

impl Character {
    /// Takes a bounty of the board shown on `day`: at the board, after the prologue, a faction's only while pledged
    /// to it, at a count of 0.
    pub(crate) fn take_bounty(&mut self, place: u8, day: u64, here: Here) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        if !self.story.prologue {
            return Err(Refusal::BoardShut);
        }
        let bounty = self.on_the_board(place, day, here)?;
        if bounty.faction != 0 && self.allegiance.pledge != bounty.faction {
            return Err(Refusal::NotPledged);
        }
        let today = self.activity.today(here.day);
        if today.held(place).contains_key(&place) {
            return Err(Refusal::BountyHeld);
        }
        today.held_mut(place).insert(place, 0);
        Ok(None)
    }

    /// Turns in a bounty of the board shown on `day` whose count reached its target, paying it once: the town's in
    /// XP and Aurem, a faction's in XP and that faction's reputation, pledged to it still or not.
    pub(crate) fn turn_in_bounty(&mut self, place: u8, day: u64, here: Here) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        let bounty = self.on_the_board(place, day, here)?;
        let today = self.activity.today(here.day);
        if today.paid(place).contains(&place) {
            return Err(Refusal::BountyPaid);
        }
        if today.held(place).get(&place).is_none_or(|count| *count < bounty.target) {
            return Err(Refusal::BountyNotDone);
        }
        today.paid_mut(place).insert(place);
        let (xp, aurem) = bounty_pay(self.level(), bounty.tier);
        self.earn_play_xp(xp, None);
        if bounty.faction == 0 {
            self.materials.add_aurem(aurem);
        } else {
            self.add_reputation(bounty.faction, faction_bounty_reputation(bounty.tier));
        }
        Ok(None)
    }

    /// The bounty at a place of the room's board as the page showed it: a page showing another day's board, or a room
    /// whose day is behind the record, would ask of a bounty that is not there.
    fn on_the_board(&self, place: u8, day: u64, here: Here) -> Result<Bounty, Refusal> {
        if day != here.day || here.day < self.activity.today.day {
            return Err(Refusal::NoSuchBounty);
        }
        bounty_at(here.day, place).ok_or(Refusal::NoSuchBounty)
    }
}
