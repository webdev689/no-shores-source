//! The factions' bounties: each faction's three of its own four a day at its places after the town's six, taken only
//! pledged to it, counted only while its cape is worn, and paid in XP and its reputation.

use crate::activity::{Activity, BOUNTIES, BOUNTY_PLACES, FACTION_BOUNTIES, POSTING_FACTIONS};
use crate::bounties::{
    BOUNTY_NAME_MOST, DUNGEONS, FACTION_POOLS, LAND, SEA, bounty_at, bounty_pay, faction_at, faction_board,
    faction_bounty_reputation, faction_places,
};
use crate::dice::Dice;
use crate::factions::factions;
use crate::factions_tests::caped;
use crate::kinds::Slot;
use crate::objectives::Feat;
use crate::{Ask, Character, Done, Here, Refusal};
use std::collections::{BTreeMap, BTreeSet};

const DICE: Dice = Dice { seed: 3, tick: 1, player: 1 };
const DAY: u64 = 20_778;
/// Any foe felled, of Elite rank, on Saltmere.
const ELITE_FOE: Feat<'static> = Feat::Felled { faction: 1, rank: 3, island: Some("continent-1") };

fn at_board(day: u64) -> Here {
    Here { social: true, day, week: 2_968, ..Here::default() }
}

/// A character past the prologue, pledged to `faction` and wearing its cape.
fn serving(faction: u8) -> Character {
    let mut character = caped(faction);
    character.story.prologue = true;
    character
}

/// The place of the faction's bounty that a felled Elite foe counts toward today, and its target.
fn felling_place(faction: u8) -> Option<(u8, u32)> {
    let board = faction_board(DAY, faction)?;
    faction_places(faction)
        .zip(board)
        .find(|(_, bounty)| bounty.objective.counts(&ELITE_FOE))
        .map(|(place, bounty)| (place, bounty.target))
}

#[test]
fn each_faction_posts_three_of_its_own_four_a_day_at_its_places_after_the_towns_six() {
    let ids: Vec<u8> = factions().factions.iter().map(|faction| faction.id).collect();
    assert_eq!(ids, (1..=POSTING_FACTIONS).collect::<Vec<_>>(), "the pools follow the factions' numbers");
    assert_eq!(BOUNTY_PLACES, 15);
    assert_eq!([faction_places(1), faction_places(2), faction_places(3)], [6..9, 9..12, 12..15]);
    let owners: Vec<Option<u8>> = (0..=BOUNTY_PLACES).map(faction_at).collect();
    let mut expected = vec![Some(0); 6];
    expected.extend([1, 1, 1, 2, 2, 2, 3, 3, 3].map(Some));
    expected.push(None);
    assert_eq!(owners, expected);
    assert_eq!((faction_board(DAY, 0), faction_board(DAY, 4)), (None, None), "the town and no faction post none here");
    for faction in 1..=POSTING_FACTIONS {
        let mut seen = BTreeSet::new();
        for day in 20_000..20_400 {
            let board = faction_board(day, faction).expect("a faction posts");
            let names: BTreeSet<&str> = board.iter().map(|bounty| bounty.name).collect();
            assert_eq!(names.len(), usize::from(FACTION_BOUNTIES), "day {day}: three apart");
            assert!(board.iter().all(|bounty| bounty.faction == faction));
            for (place, bounty) in faction_places(faction).zip(&board) {
                assert_eq!(bounty_at(day, place).as_ref(), Some(bounty), "found again by its place");
            }
            seen.extend(names);
        }
        assert_eq!(seen.len(), 4, "each of its four comes up");
    }
    assert_eq!(bounty_at(DAY, BOUNTY_PLACES), None);
    assert!(bounty_at(DAY, BOUNTIES - 1).is_some_and(|bounty| bounty.faction == 0));
}

#[test]
fn every_bounty_of_the_town_and_the_factions_has_a_short_plain_name_of_its_own() {
    let towns = LAND.iter().chain(&SEA).chain(&DUNGEONS);
    let names: Vec<&str> = towns.chain(FACTION_POOLS.iter().flatten()).map(|template| template.name).collect();
    let unique: BTreeSet<&str> = names.iter().copied().collect();
    assert_eq!((names.len(), unique.len()), (22, 22), "each its own name");
    for name in names {
        let plain = !name.is_empty() && name.chars().count() <= BOUNTY_NAME_MOST && !name.contains('\u{2014}');
        assert!(plain, "{name:?} is short and plain");
    }
    let tiers: BTreeSet<u8> = FACTION_POOLS.iter().flatten().map(|template| template.tier).collect();
    assert_eq!(tiers, BTreeSet::from([1, 2, 3]));
}

#[test]
fn a_factions_bounty_is_taken_only_pledged_to_it() {
    let mut bare = Character::starting();
    bare.story.prologue = true;
    let take = |place| Ask::TakeBounty { place, day: DAY };
    assert_eq!(bare.ask(take(6), at_board(DAY), &DICE), Err(Refusal::NotPledged), "pledged to none");
    let mut stormcaller = serving(1);
    assert_eq!(stormcaller.ask(take(9), at_board(DAY), &DICE), Err(Refusal::NotPledged), "another's");
    assert_eq!(stormcaller.ask(take(6), at_board(DAY), &DICE), Ok(Done::Done));
    assert_eq!(stormcaller.ask(take(6), at_board(DAY), &DICE), Err(Refusal::BountyHeld));
    assert_eq!(stormcaller.ask(take(15), at_board(DAY), &DICE), Err(Refusal::NoSuchBounty), "past the board");
    let mut shut = serving(1);
    shut.story.prologue = false;
    assert_eq!(shut.ask(take(6), at_board(DAY), &DICE), Err(Refusal::BoardShut));
}

#[test]
fn a_factions_bounty_counts_only_while_its_cape_is_worn_and_pays_xp_and_its_reputation() {
    let faction = (1..=POSTING_FACTIONS).find(|&faction| felling_place(faction).is_some()).expect("one fells Elites");
    let (place, target) = felling_place(faction).expect("found");
    let mut character = serving(faction);
    character.ask(Ask::TakeBounty { place, day: DAY }, at_board(DAY), &DICE).expect("taken");
    let cape = character.items.iter().find(|(_, (item, _))| item.kind.slot() == Slot::Cloak).map(|(id, _)| *id);
    character.items.remove(&cape.expect("the cape kept"));
    assert_eq!(character.cape_worn(), None);
    assert!(!character.saw(&ELITE_FOE, DAY), "no cape, no count");
    let mut caped_again = serving(faction);
    caped_again.activity = character.activity.clone();
    for _ in 0..target + 2 {
        caped_again.saw(&ELITE_FOE, DAY);
    }
    assert_eq!(caped_again.activity.today.bounties, BTreeMap::from([(place, target)]), "up to its target");
    let tier = bounty_at(DAY, place).expect("on the board").tier;
    let (xp, aurem, reputation) = (caped_again.xp, caped_again.materials.aurem, caped_again.reputation(faction));
    let turn_in = Ask::TurnInBounty { place, day: DAY };
    assert_eq!(caped_again.ask(turn_in, at_board(DAY), &DICE), Ok(Done::Done));
    let (paid_xp, _) = bounty_pay(caped_again.level(), tier);
    assert_eq!(caped_again.xp, xp + u64::from(paid_xp));
    assert_eq!(caped_again.materials.aurem, aurem, "no Aurem");
    // Its XP earns reputation as every deed's does with the cape worn, and the bounty its own besides.
    let own = faction_bounty_reputation(tier);
    assert_eq!(caped_again.reputation(faction), reputation + u64::from(paid_xp) + own);
    assert_eq!(caped_again.ask(turn_in, at_board(DAY), &DICE), Err(Refusal::BountyPaid));
    assert_eq!([1, 2, 3].map(faction_bounty_reputation), [2_500, 3_750, 5_000]);
}

#[test]
fn a_switch_of_pledge_stops_a_held_bounty_counting_but_it_still_turns_in_to_its_faction() {
    let faction = (1..=POSTING_FACTIONS).find(|&faction| felling_place(faction).is_some()).expect("one fells Elites");
    let (place, target) = felling_place(faction).expect("found");
    let mut character = serving(faction);
    character.ask(Ask::TakeBounty { place, day: DAY }, at_board(DAY), &DICE).expect("taken");
    for _ in 0..target {
        character.saw(&ELITE_FOE, DAY);
    }
    let other = faction % POSTING_FACTIONS + 1;
    character.allegiance.pledge = other;
    let before = character.reputation(faction);
    assert!(character.ask(Ask::TurnInBounty { place, day: DAY }, at_board(DAY), &DICE).is_ok());
    let tier = bounty_at(DAY, place).expect("on the board").tier;
    assert_eq!(
        character.reputation(faction),
        before + faction_bounty_reputation(tier),
        "to the faction that posted it"
    );
    let mut held = serving(faction);
    held.activity.today(DAY).bounties.insert(place, 0);
    held.allegiance.pledge = other;
    assert!(!held.saw(&ELITE_FOE, DAY), "pledged to another, it counts no more");
}

#[test]
fn the_record_keeps_every_place_on_the_board_and_none_past_it() {
    let mut activity = Activity::default();
    activity.today.bounties.extend([(0, 3), (14, 1), (15, 2)]);
    activity.today.turned_in.extend([5, 12, 40]);
    let kept = activity.kept();
    assert_eq!(kept.today.bounties, BTreeMap::from([(0, 3), (14, 1)]));
    assert_eq!(kept.today.turned_in, BTreeSet::from([5, 12]));
}

#[test]
fn a_factions_day_of_bounties_pays_about_a_tenth_of_a_rank_as_destiny_1s_did() {
    // Destiny 1's bounties paid 50 reputation against ranks 2,000 to 2,500 apart: a day's handful about a tenth.
    let per_rank = factions().reputation_per_rank;
    for faction in 1..=POSTING_FACTIONS {
        for day in 20_000..20_200 {
            let board = faction_board(day, faction).expect("a faction posts");
            let paid: u64 = board.iter().map(|bounty| faction_bounty_reputation(bounty.tier)).sum();
            assert!(per_rank / 20 <= paid && paid <= per_rank * 3 / 20, "{paid} of {per_rank} on day {day}");
        }
    }
}
