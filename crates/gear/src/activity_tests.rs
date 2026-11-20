//! Each character's day and week of activities, turned over by the clock and never back, and kept as JSON; and the
//! prologue's end, marked by its ask.

use crate::activities::Weekly;
use crate::activity::{Activity, ThisWeek, Today};
use crate::asks::{Ask, Done, Here};
use crate::character::Character;
use crate::dice::Dice;
use crate::rarity::Rarity;
use crate::world::Difficulty;
use std::collections::BTreeSet;

#[test]
fn the_days_record_turns_over_when_the_clocks_day_moves_on_and_the_weeks_with_its_week() {
    let mut activity = Activity::default();
    activity.today(20_777).cleared.insert(Difficulty::Elite);
    activity.today(20_777).bounties.insert(2, 5);
    activity.this_week(2_968).abyss = true;
    assert_eq!(activity.today(20_777).cleared, BTreeSet::from([Difficulty::Elite]), "the same day keeps it");
    assert_eq!(*activity.today(20_778), Today { day: 20_778, ..Today::default() });
    assert!(activity.this_week(2_968).abyss, "the week holds across its days");
    assert_eq!(*activity.this_week(2_969), ThisWeek { week: 2_969, ..ThisWeek::default() });
}

#[test]
fn a_day_never_turns_back_for_a_room_whose_clock_is_behind() {
    let mut activity = Activity::default();
    activity.today(20_778).cleared.insert(Difficulty::Abyss);
    activity.this_week(2_969).elite = true;
    assert!(activity.today(20_777).cleared.contains(&Difficulty::Abyss), "taken stays taken");
    assert_eq!(activity.today(20_777).day, 20_778);
    assert!(activity.this_week(2_968).elite);
}

#[test]
fn the_records_are_kept_as_this_json() {
    let mut activity = Activity::default();
    activity.today(20_778).cleared.extend([Difficulty::Abyss, Difficulty::Normal]);
    activity.today(20_778).bounties.insert(2, 5);
    *activity.this_week(2_968) = ThisWeek { week: 2_968, elite: false, abyss: true, boon: true };
    assert_eq!(
        serde_json::to_value(&activity).expect("written"),
        serde_json::json!({
            "today": { "day": 20_778, "cleared": ["normal", "abyss"], "bounties": { "2": 5 } },
            "this_week": { "week": 2_968, "elite": false, "abyss": true, "boon": true }
        })
    );
}

#[test]
fn the_prologue_is_marked_played_by_its_ask_anywhere_and_again_changes_nothing() {
    let mut character = Character::starting();
    let afield = Here { social: false, day: 0, week: 0 };
    let dice = Dice { seed: 3, tick: 1, player: 1 };
    assert_eq!(character.ask(Ask::FinishPrologue, afield, &dice), Ok(Done::Done));
    assert!(character.story.prologue);
    let once = character.clone();
    assert_eq!(character.ask(Ask::FinishPrologue, afield, &dice), Ok(Done::Done));
    assert_eq!(character, once);
}

const DICE: Dice = Dice { seed: 7, tick: 1, player: 1 };

#[test]
fn the_first_clear_at_each_tier_of_a_day_pays_a_captains_worth_raised_by_the_tier_and_a_sure_vestige() {
    let mut character = Character::starting();
    let (xp, aurem) = (character.xp, character.materials.aurem);
    let paid = character.clear_of_the_day(20_778, Difficulty::Elite, 12, &DICE).expect("the first Elite clear today");
    assert_eq!((paid.xp, paid.aurem), (5_100, 306), "2,000 and 120 at level 12, times 1.5");
    assert_eq!((character.xp, character.materials.aurem), (xp + 5_100, aurem + 306));
    let vestige = paid.vestige.expect("sure");
    assert_eq!(vestige.level, 12);
    assert!(matches!(vestige.rarity, Rarity::Magic | Rarity::Rare), "no Legendary below 18");
    assert_eq!(character.clear_of_the_day(20_778, Difficulty::Elite, 12, &DICE), None, "once a day at a tier");
    assert!(character.clear_of_the_day(20_778, Difficulty::Normal, 10, &DICE).is_some());
    assert!(character.clear_of_the_day(20_778, Difficulty::Abyss, 13, &DICE).is_some());
    assert_eq!(character.activity.today(20_778).cleared.len(), 3, "three a day at most");
    assert!(character.clear_of_the_day(20_779, Difficulty::Elite, 12, &DICE).is_some(), "the next day anew");
}

#[test]
fn a_clear_in_a_room_whose_day_is_behind_the_record_pays_no_more() {
    let mut character = Character::starting();
    assert!(character.clear_of_the_day(20_778, Difficulty::Elite, 12, &DICE).is_some());
    assert_eq!(character.clear_of_the_day(20_777, Difficulty::Normal, 12, &DICE), None, "that day is over for it");
    assert_eq!(character.activity.today.cleared, BTreeSet::from([Difficulty::Elite]), "and nothing is written today");
    assert!(character.clear_of_the_week(2_968, Weekly::Elite, &DICE).is_some());
    assert_eq!(character.clear_of_the_week(2_967, Weekly::Abyss, &DICE), None);
    assert!(!character.activity.this_week.abyss);
}

#[test]
fn the_weeks_two_pay_once_a_legendary_vestige_and_essence_and_the_abyss_its_boon() {
    let mut character = Character::starting();
    let (weapon, armor) = (character.materials.weapon_essence, character.materials.armor_essence);
    let elite = character.clear_of_the_week(2_968, Weekly::Elite, &DICE).expect("once");
    assert_eq!((elite.rarity, elite.level), (Rarity::Legendary, 20));
    assert_eq!((character.materials.weapon_essence, character.materials.armor_essence), (weapon + 3, armor + 3));
    assert!(!character.activity.this_week(2_968).boon, "the Elite's gives no boon");
    assert_eq!(character.clear_of_the_week(2_968, Weekly::Elite, &DICE), None);
    let abyss = character.clear_of_the_week(2_968, Weekly::Abyss, &DICE).expect("once");
    assert!(matches!(abyss.rarity, Rarity::Legendary | Rarity::Atheric));
    assert!(character.activity.this_week(2_968).boon);
    assert_eq!(character.materials.weapon_essence, weapon + 8);
    let atheric = (0..1_000_u32)
        .filter(|&player| {
            let dice = Dice { seed: 7, tick: 1, player };
            Character::starting().clear_of_the_week(2_968, Weekly::Abyss, &dice).map(|found| found.rarity)
                == Some(Rarity::Atheric)
        })
        .count();
    assert!((150..=250).contains(&atheric), "about one in five: {atheric}");
}

#[test]
fn the_abyss_boon_gives_a_quarter_more_xp_until_the_week_turns() {
    let mut character = Character::starting();
    character.activity.this_week(2_968).boon = true;
    let before = character.xp;
    assert_eq!(character.boon_xp(2_968, 1_000, None), 250);
    assert_eq!(character.boon_xp(2_968, 3, None), 0, "a quarter, rounded down");
    assert_eq!(character.boon_xp(2_969, 1_000, None), 0, "the week turned");
    assert_eq!(character.boon_xp(2_968, 1_000, None), 0, "and never turns back");
    assert_eq!(character.xp, before + 250);
}
