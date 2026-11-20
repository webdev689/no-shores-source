//! Each character's day and week of activities, turned over by the clock and never back, and kept as JSON; and the
//! prologue's end, marked by its ask.

use crate::activity::{Activity, ThisWeek, Today};
use crate::asks::{Ask, Done, Here};
use crate::character::Character;
use crate::dice::Dice;
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
