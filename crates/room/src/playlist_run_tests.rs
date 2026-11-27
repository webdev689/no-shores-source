//! A playlist's run: an Elite Dungeon at the playlist's tier with every foe at one of its bands' levels, the day's
//! modifiers and at Abyss its revives; its gate to the band; and its clear paying the day's reward once a day and
//! counting toward the week's once a run.

use crate::{PlayerId, Room, RunOf};
use gear::Difficulty;
use gear::gate::Place;
use gear::playlist::Playlist;

/// A Friday's 09:00 UTC: day 20,778, in week 2,968.
const FRIDAY_NINE: u64 = 29_919_420;

fn playlist_run(place: &str, tier: Difficulty, foes_at: u8) -> Option<Room> {
    Room::dungeon_run(&RunOf::Playlist { place: place.into(), foes_at }, tier, FRIDAY_NINE)
}

/// A character past the prologue at `level`, which XP alone reaches to 20.
fn at_level(level: u8) -> gear::Character {
    let mut character = gear::Character::starting();
    character.story.prologue = true;
    character.earn_xp(u32::try_from(gear::power::xp_for_level(level)).expect("small"), None);
    character
}

/// A character, kept in the room for an account; none if its gate shuts.
fn kept_in(room: &mut Room, character: &gear::Character, account: &str) -> Option<PlayerId> {
    let player = room.join().expect("a room with space");
    room.restore_character(player, &character.to_json()).then_some(())?;
    assert!(room.own(player, account));
    Some(player)
}

#[test]
fn a_playlist_run_opens_at_one_of_its_bands_levels_alone_with_the_days_modifiers_and_at_abyss_its_revives() {
    let elite = playlist_run("krakens-grotto", Difficulty::Elite, 17).expect("an Elite Playlist run");
    let run = elite.run.as_ref().expect("a run");
    assert_eq!((run.foes_at, run.revives), (Some(17), None));
    assert_eq!(run.modifiers, Playlist::Elite.modifiers(20_778));
    assert_eq!(elite.place, Some(Place::Playlist(Playlist::Elite, 17)));
    assert!(elite.foes.values().all(|foe| foe.level == 17), "every foe at the band's level");
    assert!(elite.encounter_seen().is_some(), "a playlist's run lays its encounters");
    let mut elite = elite;
    let mut encounters = elite.encounters.take().expect("encounters");
    let spot = encounters.plan.seals[0].doors.first().copied().expect("a doorway");
    let before: Vec<_> = elite.foes.keys().copied().collect();
    elite.stand_seal_wave(&mut encounters, Some(0), &[spot], 1);
    let stood: Vec<_> = elite.foes.iter().filter(|(id, _)| !before.contains(id)).map(|(_, foe)| foe.level).collect();
    assert!(!stood.is_empty() && stood.iter().all(|level| *level == 17), "a wave at the band's level: {stood:?}");
    let abyss = playlist_run("brine-catacombs", Difficulty::Abyss, 32).expect("an Abyss Playlist run");
    let run = abyss.run.as_ref().expect("a run");
    assert_eq!((run.foes_at, run.revives), (Some(32), Some(5)));
    assert_eq!(run.modifiers.len(), 2);
    assert!(playlist_run("krakens-grotto", Difficulty::Elite, 18).is_none(), "no band stands its foes at 18");
    assert!(playlist_run("krakens-grotto", Difficulty::Abyss, 17).is_none(), "17 is the Elite's, not the Abyss's");
    assert!(playlist_run("krakens-grotto", Difficulty::Normal, 12).is_none(), "no playlist at Normal");
    assert!(playlist_run("saltgrass-downs", Difficulty::Elite, 12).is_none(), "no Elite Dungeon");
}

#[test]
fn a_playlist_run_takes_a_character_of_its_band_alone() {
    let mut room = playlist_run("pearl-tomb", Difficulty::Elite, 17).expect("a run for 15 to 19");
    assert!(kept_in(&mut room, &at_level(14), "young").is_none(), "below the band");
    assert!(kept_in(&mut room, &at_level(20), "old").is_none(), "above the band");
    assert!(kept_in(&mut room, &at_level(15), "in").is_some());
    let mut last = playlist_run("pearl-tomb", Difficulty::Elite, 32).expect("a run for 30");
    assert!(kept_in(&mut last, &at_level(29), "short").is_none(), "the last band is 30 alone");
}

#[test]
fn a_playlist_clear_pays_the_daily_once_a_day_and_counts_toward_the_weekly_once_a_run() {
    let character = at_level(20);
    let mut room = playlist_run("coral-halls", Difficulty::Abyss, 23).expect("an Abyss run for 20 to 24");
    let player = kept_in(&mut room, &character, "one").expect("in its band");
    room.pay_clear(player, 23);
    let paid = &room.players[&player].character;
    assert!(paid.playlist_taken(20_778, Playlist::Abyss));
    assert_eq!(paid.playlist_clears(2_968, Playlist::Abyss), 1);
    // A Normal roll is kept as its item, where its Vestige would have been.
    let held = |kept: &gear::Character| kept.vestiges.len() + kept.items.len() - character.items.len();
    assert_eq!(held(paid), 1, "the daily's Vestige kept");
    room.pay_clear(player, 23);
    assert_eq!(room.players[&player].character.playlist_clears(2_968, Playlist::Abyss), 1, "once a run");
    let mut kept = room.players[&player].character.clone();
    for clear in 2..=3 {
        let mut again = playlist_run("mire-hollows", Difficulty::Abyss, 23).expect("another run");
        let player = kept_in(&mut again, &kept, "one").expect("in");
        again.pay_clear(player, 23);
        kept = again.players[&player].character.clone();
        assert_eq!(kept.playlist_clears(2_968, Playlist::Abyss), clear);
    }
    assert_eq!(held(&kept), 3, "the daily's once, then the weekly's two at the third");
}

#[test]
fn a_run_opened_before_the_day_turns_pays_no_daily_after_it_but_still_counts_toward_the_week() {
    let of = RunOf::Playlist { place: "coral-halls".into(), foes_at: 23 };
    let mut room =
        Room::dungeon_run(&of, Difficulty::Abyss, FRIDAY_NINE - 1).expect("opened on Thursday's last minute");
    let player = kept_in(&mut room, &at_level(20), "one").expect("in its band");
    room.set_minute(FRIDAY_NINE);
    room.pay_clear(player, 23);
    let paid = &room.players[&player].character;
    assert!(!paid.playlist_taken(20_777, Playlist::Abyss) && !paid.playlist_taken(20_778, Playlist::Abyss));
    assert_eq!(paid.playlist_clears(2_968, Playlist::Abyss), 1, "the same week");
    assert!(paid.vestiges.is_empty());
}

#[test]
fn a_run_opened_before_the_week_turns_counts_toward_neither_week_after_it() {
    let turns = FRIDAY_NINE + gear::clock::minutes_to_next_week(FRIDAY_NINE);
    let of = RunOf::Playlist { place: "coral-halls".into(), foes_at: 23 };
    let mut room = Room::dungeon_run(&of, Difficulty::Abyss, turns - 1).expect("opened in the week's last minute");
    let player = kept_in(&mut room, &at_level(20), "one").expect("in its band");
    room.set_minute(turns);
    room.pay_clear(player, 23);
    let paid = &room.players[&player].character;
    let (last, this) = (gear::clock::week_of(turns - 1), gear::clock::week_of(turns));
    assert_eq!(this, last + 1);
    assert_eq!(paid.playlist_clears(this, Playlist::Abyss), 0, "not toward the new week's weekly");
    assert_eq!(paid.playlist_clears(last, Playlist::Abyss), 0, "nor the old one's, which is gone");
}
