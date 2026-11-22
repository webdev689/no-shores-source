//! The playlists: their bands and levels, their modifiers for a day, their gates, their records and what they pay once
//! a day and once a week.

use crate::activities::{Modifier, modifier_of_the_day};
use crate::activity::Activity;
use crate::character::Character;
use crate::dice::Dice;
use crate::gate::{Place, Shut, shut_at};
use crate::playlist::Playlist;
use crate::world::Difficulty;

const DICE: Dice = Dice { seed: 7, tick: 1, player: 1 };
const DAY: u64 = 20_778;
const WEEK: u64 = 2_968;

#[test]
fn each_playlist_opens_at_its_seas_level_in_bands_of_five_with_its_foes_over_the_bands_first_never_past_32() {
    let elite = Playlist::Elite;
    assert_eq!(elite.bands(), [(10, 14), (15, 19), (20, 24), (25, 29), (30, 30)]);
    assert_eq!(elite.bands().into_iter().map(|band| elite.foes_at(band)).collect::<Vec<_>>(), [12, 17, 22, 27, 32]);
    let abyss = Playlist::Abyss;
    assert_eq!(abyss.bands(), [(20, 24), (25, 29), (30, 30)]);
    assert_eq!(abyss.bands().into_iter().map(|band| abyss.foes_at(band)).collect::<Vec<_>>(), [23, 28, 32]);
    assert_eq!((elite.tier(), abyss.tier()), (Difficulty::Elite, Difficulty::Abyss));
    assert_eq!((elite.band_of(9), elite.band_of(14), elite.band_of(30)), (None, Some((10, 14)), Some((30, 30))));
    assert_eq!((abyss.band_at(28), abyss.band_at(27)), (Some((25, 29)), None));
    assert_eq!(Playlist::of_key("abyss"), Some(abyss));
}

#[test]
fn the_elite_playlist_carries_the_days_modifier_and_the_abyss_one_more_of_another_kind() {
    let mut kinds_seen = std::collections::BTreeSet::new();
    for day in DAY..DAY + 60 {
        assert_eq!(Playlist::Elite.modifiers(day), [modifier_of_the_day(day)]);
        let abyss = Playlist::Abyss.modifiers(day);
        assert_eq!(abyss.len(), 2);
        assert_eq!(abyss[0], modifier_of_the_day(day));
        assert_ne!(abyss[0].kind(), abyss[1].kind(), "day {day}: never two of a kind");
        if let Modifier::Burn(art) = abyss[1] {
            assert!(crate::arts::arts().art(art).is_some(), "its Burn names an Art");
        }
        kinds_seen.insert(abyss[1].kind());
        assert_eq!(Playlist::Abyss.modifiers(day), abyss, "the same all day");
    }
    assert!(kinds_seen.len() >= 6, "the second is drawn, not fixed: {kinds_seen:?}");
}

#[test]
fn a_playlists_run_opens_after_the_prologue_at_its_level_to_its_band_alone() {
    let elite_at = |level, prologue, foes_at| {
        shut_at(level, prologue, Place::Playlist(Playlist::Elite, foes_at), Difficulty::Elite)
    };
    assert_eq!(elite_at(30, false, 32), Some(Shut::Prologue));
    assert_eq!(elite_at(9, true, 12), Some(Shut::Playlist(Playlist::Elite)));
    assert_eq!(elite_at(10, true, 12), None);
    assert_eq!(elite_at(14, true, 12), None);
    assert_eq!(elite_at(15, true, 12), Some(Shut::Band(10, 14)), "above the band");
    assert_eq!(elite_at(12, true, 17), Some(Shut::Band(15, 19)), "below the band");
    assert_eq!(elite_at(29, true, 32), Some(Shut::Band(30, 30)), "the last band is 30 alone");
    assert_eq!(elite_at(30, true, 32), None);
    let abyss = shut_at(19, true, Place::Playlist(Playlist::Abyss, 23), Difficulty::Abyss);
    assert_eq!(abyss, Some(Shut::Playlist(Playlist::Abyss)));
    assert_eq!(Shut::Playlist(Playlist::Abyss).reason(), "The Abyss Playlist opens at level 20.");
    assert_eq!(Shut::Band(15, 19).reason(), "This run is for levels 15 to 19.");
    assert_eq!(Shut::Band(30, 30).reason(), "This run is for level 30.");
}

#[test]
fn a_playlists_first_clear_each_day_pays_a_boss_captains_worth_at_its_tier_and_a_sure_vestige_once() {
    let mut character = Character::starting();
    let (xp, aurem) = (character.xp, character.materials.aurem);
    let boss = Character::starting().reward_kill(crate::rewards::Foe::Captain, 5, 23, None, Difficulty::Abyss);
    let vestige = character.playlist_of_the_day(DAY, Playlist::Abyss, 23, &DICE).expect("the first today");
    assert_eq!((character.xp, character.materials.aurem), (xp + u64::from(boss.xp), aurem + boss.aurem));
    assert_eq!(vestige.level, 20, "a Vestige at most at the named pieces' level");
    assert!(character.playlist_taken(DAY, Playlist::Abyss));
    assert!(!character.playlist_taken(DAY, Playlist::Elite), "each playlist its own");
    assert_eq!(character.playlist_of_the_day(DAY, Playlist::Abyss, 23, &DICE), None, "once a day");
    assert!(character.playlist_of_the_day(DAY, Playlist::Elite, 12, &DICE).is_some());
    assert_eq!(character.playlist_of_the_day(DAY - 1, Playlist::Elite, 12, &DICE), None, "never a day behind");
    let mut fresh = Character::starting();
    fresh.activity.today(DAY);
    assert_eq!(fresh.playlist_of_the_day(DAY - 1, Playlist::Elite, 12, &DICE), None, "nothing taken, still behind");
    assert!(!fresh.activity.today.elite_playlist, "and nothing written");
    assert!(!character.playlist_taken(DAY + 1, Playlist::Abyss), "the next day reads not taken");
    assert!(character.playlist_of_the_day(DAY + 1, Playlist::Abyss, 23, &DICE).is_some(), "the next day anew");
}

#[test]
fn a_playlists_third_clear_each_week_pays_essence_and_its_vestiges_once() {
    let mut character = Character::starting();
    let essence = |character: &Character| (character.materials.weapon_essence, character.materials.armor_essence);
    let before = essence(&character);
    assert!(character.playlist_of_the_week(WEEK, Playlist::Abyss, 28, &DICE).is_empty());
    assert!(character.playlist_of_the_week(WEEK, Playlist::Abyss, 28, &DICE).is_empty());
    assert_eq!(character.playlist_clears(WEEK, Playlist::Abyss), 2);
    assert_eq!(essence(&character), before, "nothing before the third");
    let paid = character.playlist_of_the_week(WEEK, Playlist::Abyss, 28, &DICE);
    assert_eq!(paid.len(), 2, "the Abyss pays two Vestiges");
    assert_ne!(paid[0].id, paid[1].id);
    assert!(paid.iter().all(|vestige| vestige.level == 20));
    assert_eq!(essence(&character), (before.0 + 3, before.1 + 3));
    assert!(character.playlist_of_the_week(WEEK, Playlist::Abyss, 28, &DICE).is_empty(), "once a week");
    assert_eq!(character.playlist_clears(WEEK, Playlist::Abyss), 3);
    assert_eq!(character.playlist_clears(WEEK + 1, Playlist::Abyss), 0, "a new week reads none");
    assert!(character.playlist_of_the_week(WEEK - 1, Playlist::Elite, 12, &DICE).is_empty(), "never a week behind");
    for _ in 0..2 {
        assert!(character.playlist_of_the_week(WEEK, Playlist::Elite, 12, &DICE).is_empty());
    }
    assert_eq!(character.playlist_of_the_week(WEEK, Playlist::Elite, 12, &DICE).len(), 1, "the Elite pays one");
    assert_eq!(essence(&character), (before.0 + 5, before.1 + 5), "and 2 of each");
}

#[test]
fn the_playlists_records_are_written_only_once_touched_and_read_from_a_save_that_has_none() {
    let mut activity = Activity::default();
    activity.today(DAY);
    activity.this_week(WEEK);
    let plain = serde_json::to_value(&activity).expect("written");
    assert!(plain["today"].get("elite_playlist").is_none() && plain["this_week"].get("abyss_playlist").is_none());
    activity.today(DAY).abyss_playlist = true;
    activity.this_week(WEEK).elite_playlist = 2;
    let written = serde_json::to_value(&activity).expect("written");
    assert_eq!(
        (&written["today"]["abyss_playlist"], &written["this_week"]["elite_playlist"]),
        (&serde_json::json!(true), &serde_json::json!(2))
    );
    let read: Activity = serde_json::from_value(written).expect("read");
    assert_eq!(read, activity);
    let old: Activity = serde_json::from_value(plain).expect("an older save reads");
    assert_eq!((old.today.abyss_playlist, old.this_week.elite_playlist), (false, 0));
}

#[test]
fn a_clear_paying_the_daily_and_the_weekly_at_once_pays_vestiges_on_dice_of_their_own() {
    let mut character = Character::starting();
    character.activity.this_week(WEEK).abyss_playlist = 2;
    let daily = character.playlist_of_the_day(DAY, Playlist::Abyss, 23, &DICE).expect("the daily");
    let weekly = character.playlist_of_the_week(WEEK, Playlist::Abyss, 23, &DICE);
    let drawn = |vestige: &crate::character::Vestige| (vestige.rarity, vestige.slot);
    assert_eq!(weekly.len(), 2);
    assert!(weekly.iter().all(|vestige| drawn(vestige) != drawn(&daily)), "{daily:?} {weekly:?}");
}
