//! A player's part in their guild's week: the week's draw, the XP they give, what they did toward its bounties, and
//! their claims.

use crate::asks::Refusal;
use crate::character::{Character, VESTIGES_MOST, Vestige};
use crate::dice::Dice;
use crate::guild::{SLOTS, Standing, bounties_of, numbers};
use crate::kinds::Slot;
use crate::objectives::{Feat, Objective};
use crate::rarity::Rarity;
use crate::world::Difficulty;

const DICE: Dice = Dice { seed: 7, tick: 1, player: 1 };
const WEEK: u64 = 2_916;
const DONE: Standing = Standing { done: [true; SLOTS], before_the_week: true };

#[test]
fn the_week_draws_the_page_s_guild_bounties() {
    // The page's test `the draw is the rules' own` holds the same table.
    let drawn: Vec<[usize; SLOTS]> = [0, 1, 2, 2900, 2901, 3000].into_iter().map(bounties_of).collect();
    assert_eq!(drawn, vec![[8, 10, 1, 9], [1, 11, 2, 6], [6, 0, 9, 10], [5, 10, 1, 8], [9, 0, 1, 3], [10, 11, 9, 2]]);
}

#[test]
fn every_week_draws_four_different_guild_bounties() {
    for week in 0..2_000 {
        let mut drawn = bounties_of(week).to_vec();
        drawn.sort_unstable();
        drawn.dedup();
        assert_eq!(drawn.len(), SLOTS, "week {week}");
        assert!(drawn.iter().all(|place| *place < numbers().bounties.len()));
    }
}

#[test]
fn a_member_gives_a_tenth_of_their_xp_at_most_five_thousand_a_week_and_afresh_each_week() {
    let mut character = Character::starting();
    assert_eq!(character.give_guild(WEEK, 1_234), 123, "a tenth, rounded down");
    assert_eq!(character.give_guild(WEEK, 49_000), 4_877, "up to the week's most");
    assert_eq!(character.give_guild(WEEK, 10_000), 0, "and no more that week");
    assert_eq!(character.guild.given, 5_000);
    assert_eq!(character.give_guild(WEEK + 1, 2_000), 200, "the next week starts afresh");
    assert_eq!(character.guild.week, WEEK + 1);
}

/// The slot the week drew a bounty of this objective into, if it drew one.
fn slot_of(week: u64, wanted: impl Fn(&Objective, bool) -> bool) -> Option<usize> {
    bounties_of(week).into_iter().position(|place| {
        let bounty = &numbers().bounties[place];
        wanted(&bounty.objective, bounty.together)
    })
}

/// A week that drew a bounty of this objective, and its slot.
fn week_with(wanted: impl Fn(&Objective, bool) -> bool + Copy) -> (u64, usize) {
    (0..500).find_map(|week| slot_of(week, wanted).map(|slot| (week, slot))).expect("some week draws one")
}

#[test]
fn a_feat_counts_toward_the_bounty_it_serves_and_stops_at_its_target() {
    let (week, slot) =
        week_with(|objective, together| !together && matches!(objective, Objective::Gather { resource: None }));
    let target = numbers().bounties[bounties_of(week)[slot]].target;
    let mut character = Character::starting();
    for _ in 0..target + 5 {
        character.guild_saw(week, &Feat::Gathered { resource: 2 }, false);
    }
    assert_eq!(character.guild.counts[slot], target);
    character.guild_saw(week, &Feat::Sunk { water: None, rank: 1 }, false);
    assert_eq!(character.guild.counts[slot], target, "a feat of another kind counts nothing toward it");
}

#[test]
fn a_bounty_for_two_of_the_guild_counts_a_feat_only_done_together() {
    let (week, slot) = week_with(|objective, together| {
        together && matches!(objective, Objective::Clear { tier: Some(Difficulty::Abyss), .. })
    });
    let mut character = Character::starting();
    let cleared = Feat::Cleared { island: Some("continent-1"), tier: Difficulty::Abyss };
    character.guild_saw(week, &cleared, false);
    assert_eq!(character.guild.counts[slot], 0, "alone, it does not count");
    character.guild_saw(week, &cleared, true);
    assert_eq!(character.guild.counts[slot], 1);
}

#[test]
fn a_claim_pays_a_guild_package_once_a_week_for_a_bounty_the_guild_finished() {
    let mut character = Character::starting();
    character.xp = crate::power::xp_for_level(12);
    let aurem = character.materials.aurem;
    assert_eq!(character.claim_guild_bounty(WEEK, 2, DONE, &DICE), Ok(()));
    assert_eq!(character.vestiges.len(), 1, "a Vestige");
    assert!(character.materials.aurem > aurem, "and Aurem");
    assert_eq!(character.claim_guild_bounty(WEEK, 2, DONE, &DICE), Err(Refusal::GuildBountyClaimed));
    assert_eq!(character.claim_guild_bounty(WEEK + 1, 2, DONE, &DICE), Ok(()), "again the next week");
}

#[test]
fn a_claim_is_refused_for_a_bounty_not_done_one_not_drawn_or_a_member_who_joined_this_week() {
    let mut character = Character::starting();
    let undone = Standing { done: [false; SLOTS], before_the_week: true };
    assert_eq!(character.claim_guild_bounty(WEEK, 0, undone, &DICE), Err(Refusal::GuildBountyNotDone));
    assert_eq!(character.claim_guild_bounty(WEEK, 4, DONE, &DICE), Err(Refusal::NoSuchGuildBounty));
    let joined = Standing { before_the_week: false, ..DONE };
    assert_eq!(character.claim_guild_bounty(WEEK, 0, joined, &DICE), Err(Refusal::JoinedThisWeek));
    assert!(character.vestiges.is_empty());
}

#[test]
fn a_claim_waits_while_ten_vestiges_are_carried_and_is_not_spent() {
    let mut character = Character::starting();
    for _ in 0..VESTIGES_MOST {
        let id = character.next_id;
        character.next_id += 1;
        character.vestiges.insert(id, (Vestige::new(id, Rarity::Rare, Slot::Head, 1), false));
    }
    assert_eq!(character.claim_guild_bounty(WEEK, 1, DONE, &DICE), Err(Refusal::VestigesFull));
    assert!(!character.guild.claimed[1], "still to be claimed");
}

#[test]
fn a_week_kept_by_a_later_build_keeps_what_this_one_does_not_know() {
    let kept = r#"{"week":7,"given":40,"counts":[1,2,3,4],"claimed":[true,false,false,false],"streak":3}"#;
    let week: crate::guild::GuildWeek = serde_json::from_str(kept).unwrap();
    assert_eq!(week.given, 40);
    let written = serde_json::to_value(&week).unwrap();
    assert_eq!(written["streak"], 3);
}
