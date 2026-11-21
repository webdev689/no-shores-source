//! Where officers come from: three offered each day at each faction's counter in a social space, to the players
//! pledged to it, the better grades as their reputation with it rises; and now and then the officer of a captain whose
//! deck was boarded and won, joining the winner. Each is rolled whole: their post, name and the perks their grid
//! offers, from `content/gear/crew.json` and the catalogue's officers' traits.

use super::officer::{GRADES, Officer, Post};
use crate::catalogue::{TraitColumn, catalogue};
use crate::dice::{Dice, Purpose};
use crate::item::NAMED_LEVEL;
use crate::rarity::Rarity;
use serde::Deserialize;
use std::sync::OnceLock;

/// The names officers are given.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct CrewNames {
    pub given: Vec<String>,
    pub family: Vec<String>,
}

/// The crew's file built into the rules, read once.
///
/// # Panics
///
/// Never for the file in the repository, which `the_crews_names_read_whole` reads.
#[must_use]
pub fn names() -> &'static CrewNames {
    static READ: OnceLock<CrewNames> = OnceLock::new();
    READ.get_or_init(|| {
        serde_json::from_str(include_str!("../../../../content/gear/crew.json"))
            .expect("content/gear/crew.json reads: its test says so")
    })
}

/// How many officers a counter offers a day.
pub const OFFERS: usize = 3;
/// The reputation ranks from which a faction offers a Seasoned officer, and a Veteran.
pub const SEASONED_RANK: u32 = 2;
pub const VETERAN_RANK: u32 = 4;

/// What an officer of each grade costs to sign on, in Aurem.
#[must_use]
pub fn wage(grade: Rarity) -> u32 {
    match grade {
        Rarity::Legendary => 9_000,
        Rarity::Rare => 4_000,
        _ => 1_500,
    }
}

/// The traits an officer of a post may be offered: their post's own perks and every officer's.
#[must_use]
pub fn pool(post: Post) -> Vec<&'static str> {
    let content = catalogue();
    let fits = |found: &&crate::catalogue::TraitDef| found.fits == post.key() || found.fits == "officer";
    content
        .traits
        .iter()
        .filter(|found| found.column == TraitColumn::Perk)
        .filter(fits)
        .map(|found| found.id.as_str())
        .collect()
}

/// An officer of this post and grade, rolled whole at `level` (to 20) by `dice`, the `nth` of its kind of roll.
#[must_use]
pub fn rolled(post: Post, grade: Rarity, level: u8, dice: &Dice, purpose: Purpose, nth: u32) -> Officer {
    let mut officer = Officer::new(0, post, grade, level.clamp(1, NAMED_LEVEL));
    let names = names();
    officer.given = u8::try_from(dice.pick(purpose, nth + 1, names.given.len())).unwrap_or_default();
    officer.family = u8::try_from(dice.pick(purpose, nth + 2, names.family.len())).unwrap_or_default();
    let mut pool = pool(post);
    for (place, column) in officer.columns().iter().filter(|column| column.traits()).enumerate() {
        let mut offered = Vec::new();
        for node in 0..column.nodes() {
            let roll = nth + 3 + 2 * place as u32 + u32::from(node);
            let taken = dice.pick(purpose, roll, pool.len());
            if taken < pool.len() {
                offered.push(pool.remove(taken).to_owned());
            }
        }
        officer.layout.push(offered);
    }
    officer
}

/// The officers a faction's counter offers on a day to a player of `level` at `rank` with it: the first Able, the
/// second Seasoned from rank 2, the third Veteran from rank 4, each as good as the rank allows below that. Their
/// numbers are none until signed on.
#[must_use]
pub fn offers(faction: u8, day: u64, level: u8, rank: u32) -> Vec<Officer> {
    let best = if rank >= VETERAN_RANK { 2 } else { usize::from(rank >= SEASONED_RANK) };
    (0..OFFERS)
        .map(|offer| {
            let dice =
                Dice { seed: day.wrapping_mul(37).wrapping_add(u64::from(faction)), tick: offer as u64, player: 0 };
            let post = Post::ALL[dice.pick(Purpose::Recruit, 0, Post::ALL.len())];
            rolled(post, GRADES[offer.min(best)], level, &dice, Purpose::Recruit, 0)
        })
        .collect()
}

/// The chance a won deck's officer joins the winner, by its captain's rank (1 Minor to 5 Boss), and the grade they
/// come in.
#[must_use]
pub fn taken_odds(rank: u8) -> (f64, Rarity) {
    match rank {
        5 => (0.3, Rarity::Legendary),
        4 => (0.18, Rarity::Legendary),
        3 => (0.1, Rarity::Rare),
        2 => (0.05, Rarity::Magic),
        _ => (0.03, Rarity::Magic),
    }
}

/// The officer a won deck gives its winner, if one joins: rarely, at the deck's level, more often from a higher rank.
#[must_use]
pub fn taken(rank: u8, level: u8, dice: &Dice) -> Option<Officer> {
    let (chance, grade) = taken_odds(rank);
    if dice.roll(Purpose::Taken, 0) >= chance {
        return None;
    }
    let post = Post::ALL[dice.pick(Purpose::Taken, 1, Post::ALL.len())];
    Some(rolled(post, grade, level, dice, Purpose::Taken, 8))
}
