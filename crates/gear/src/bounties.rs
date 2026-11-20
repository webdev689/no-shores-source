//! The bounty board: six bounties a day, the same for everyone, drawn by the clock's day (`crate::activities`), two on
//! land, two at sea and two in dungeons, each taken and turned in at the board by the day of the board shown, and
//! paying XP and Aurem once at the character's level.

use crate::activities::{BOUNTY_DRAWS, drawn};
use crate::activity::BOUNTIES;
use crate::asks::{Done, Here, Refusal};
use crate::character::Character;
use crate::objectives::{ELITE_RANK, GREY_TITHE, MINIBOSS_RANK, Objective};
use crate::rewards::at_level;

/// A bounty on the board: what it counts, how many, its words, its name and where it counts.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Bounty {
    pub objective: Objective,
    pub target: u32,
    pub words: &'static str,
    /// Its short name, as its card heads it: content, never kept or matched.
    pub name: &'static str,
    /// Where it counts, by the board's pools: 0 on land, 1 at sea, 2 in dungeons.
    pub pool: u8,
}

/// What a bounty pays at level 5, raised as a kill is by (5 + the character's level) ÷ 10 when turned in.
pub const BOUNTY_XP: u32 = 1_000;
pub const BOUNTY_AUREM: u32 = 60;

/// The most characters a bounty's name holds, as its card heads it.
pub const BOUNTY_NAME_MOST: usize = 16;

/// A bounty of a pool: its objective, target, words and name.
pub(crate) type Template = (fn() -> Objective, u32, &'static str, &'static str);

const fn felled(faction: Option<u8>, rank: Option<u8>) -> Objective {
    Objective::Fell { faction, rank, island: None }
}

const fn sunk(rank: Option<u8>) -> Objective {
    Objective::Sink { water: None, rank }
}

const fn cleared() -> Objective {
    Objective::Clear { island: None, tier: None }
}

/// The bounties the board draws from, on land, at sea and in dungeons. None names an island or a water: the board is
/// the same for every level, and the islands' bands run from 1 to 30.
pub(crate) static LAND: [Template; 4] = [
    (|| felled(Some(GREY_TITHE), None), 30, "Defeat 30 Grey Tithe foes.", "Tithe Collector"),
    (|| felled(None, Some(ELITE_RANK)), 6, "Defeat 6 foes of Elite rank or higher.", "A Cut Above"),
    (|| Objective::Gather { resource: None }, 6, "Gather 6 resource nodes.", "Honest Work"),
    (|| felled(None, Some(MINIBOSS_RANK)), 2, "Defeat 2 foes of Miniboss rank or higher.", "Big Game"),
];
pub(crate) static SEA: [Template; 3] = [
    (|| sunk(None), 3, "Sink or take 3 ships.", "Broadside"),
    (|| sunk(Some(ELITE_RANK)), 1, "Sink or take a ship of Elite rank or higher.", "Bigger Fish"),
    (|| sunk(None), 6, "Sink or take 6 ships.", "Sea Wolf"),
];
pub(crate) static DUNGEONS: [Template; 3] = [
    (cleared, 1, "Clear a dungeon.", "Into the Dark"),
    (cleared, 2, "Clear 2 dungeons.", "Deeper Still"),
    (cleared, 3, "Clear 3 dungeons.", "Deep Delver"),
];

/// The day's six: places 0 and 1 on land, 2 and 3 at sea, 4 and 5 in dungeons, each pair two of its pool.
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
        let (objective, target, words, name) = pool[index];
        Bounty { objective: objective(), target, words, name, pool: u8::try_from(place / 2).unwrap_or(u8::MAX) }
    };
    std::array::from_fn(pick)
}

/// What a bounty pays a character at its level when turned in: XP, then Aurem.
#[must_use]
pub fn bounty_pay(level: u8) -> (u32, u32) {
    (at_level(BOUNTY_XP, level), at_level(BOUNTY_AUREM, level))
}

impl Character {
    /// Takes a bounty of the board shown on `day`: at the board, after the prologue, at a count of 0.
    pub(crate) fn take_bounty(&mut self, place: u8, day: u64, here: Here) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        if !self.story.prologue {
            return Err(Refusal::BoardShut);
        }
        self.on_the_board(place, day, here)?;
        let today = self.activity.today(here.day);
        if today.bounties.contains_key(&place) {
            return Err(Refusal::BountyHeld);
        }
        today.bounties.insert(place, 0);
        Ok(None)
    }

    /// Turns in a bounty of the board shown on `day` whose count reached its target, paying it once.
    pub(crate) fn turn_in_bounty(&mut self, place: u8, day: u64, here: Here) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        self.on_the_board(place, day, here)?;
        let target = board(here.day)[usize::from(place)].target;
        let today = self.activity.today(here.day);
        if today.turned_in.contains(&place) {
            return Err(Refusal::BountyPaid);
        }
        if today.bounties.get(&place).is_none_or(|count| *count < target) {
            return Err(Refusal::BountyNotDone);
        }
        today.turned_in.insert(place);
        let (xp, aurem) = bounty_pay(self.level());
        self.earn_xp(xp, None);
        self.materials.add_aurem(aurem);
        Ok(None)
    }

    /// Whether a place stands on the room's board as the page showed it: a page showing another day's board, or a room
    /// whose day is behind the record, would ask of a bounty that is not there.
    fn on_the_board(&self, place: u8, day: u64, here: Here) -> Result<(), Refusal> {
        if place >= BOUNTIES || day != here.day || here.day < self.activity.today.day {
            return Err(Refusal::NoSuchBounty);
        }
        Ok(())
    }
}
