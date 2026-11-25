use crate::character::{Character, Stuff, Vestige};
use crate::dive::{Dive, Route, Start};
use crate::kinds::{Slot, Stock};
use crate::mail::{Posted, Source as Mailed};
use crate::rarity::Rarity;
use crate::refusal::Refusal;

const ISLAND: &str = "continent-1";
const WEEK: u64 = 2_900;

fn start(zone: u16, lamp: Option<u8>) -> Start<'static> {
    Start {
        island: ISLAND,
        week: WEEK,
        route: Route::Public,
        mouth: 1,
        zone,
        depth: 1,
        lamp,
        seas: crate::Difficulty::Elite,
    }
}

/// A character in the first zone of a dive, standing in its room.
pub(crate) fn diving() -> Character {
    let mut character = Character::starting();
    character.begin_dive(&start(0, None)).expect("begun");
    character.passage.as_mut().expect("diving").here = true;
    character
}

fn vestige() -> Vestige {
    Vestige::new(0, Rarity::Rare, Slot::Melee, 5)
}

#[test]
fn a_dive_begins_at_a_mouth_with_its_haul_empty_and_ends_losing_it() {
    let mut character = diving();
    assert!(character.pick_up(vestige()));
    let dive = character.passage.as_ref().expect("diving");
    assert_eq!((dive.zone, dive.mouth, dive.lamp, dive.haul.vestiges.len()), (0, 1, 0, 1));
    assert_eq!(character.vestiges.len(), Character::starting().vestiges.len(), "not the character's own yet");
    character.end_dive();
    assert!(character.passage.is_none());
}

#[test]
fn a_dive_begins_at_a_lamp_lit_this_week_on_that_island_or_one_whose_foes_stand_at_the_players_level() {
    // The second lamp stands at depth 10, its foes 7 to 10 on Saltmere.
    let second = Start { depth: 10, ..start(30, Some(2)) };
    let mut character = Character::starting();
    assert_eq!(character.begin_dive(&second), Err(Refusal::NoLamp), "never lit, its foes over the player");
    character.activity.this_week(WEEK).passage_lamps.entry(ISLAND.to_owned()).or_default().insert(2);
    assert_eq!(character.begin_dive(&second), Ok(()));
    assert_eq!(character.passage.as_ref().map(|dive| dive.lamp), Some(2), "the lamp counted lit");
    let other = Start { island: "continent-2", ..second };
    assert_eq!(character.begin_dive(&other), Err(Refusal::NoLamp), "another island's");
    let mut levelled = Character::starting();
    let xp = |level: u8| u32::try_from(crate::power::xp_for_level(level)).expect("fits");
    levelled.earn_xp(xp(9), None);
    assert_eq!(levelled.begin_dive(&second), Err(Refusal::NoLamp), "level 9, under its strongest");
    levelled.earn_xp(xp(10) - xp(9), None);
    assert_eq!(levelled.level(), 10);
    assert_eq!(levelled.begin_dive(&second), Ok(()), "never lit, its foes at the player's level");
    let dive = levelled.passage.as_ref().expect("begun");
    assert_eq!((dive.lamp, dive.began, dive.depth), (2, 10, 10), "begun at its depth");
    levelled.activity.this_week(WEEK).passage_lamps.entry(ISLAND.to_owned()).or_default().insert(4);
    let fourth = Start { depth: 20, ..start(31, Some(4)) };
    assert_eq!(levelled.begin_dive(&fourth), Err(Refusal::NoLamp), "the fourth lamp, lit or not");
}

#[test]
fn going_on_waits_for_the_deal_but_a_gauntlet_is_open_at_once() {
    let mut character = diving();
    let here = (ISLAND, WEEK, 0);
    assert_eq!(character.go_on(here, Some((4, 2)), false), Err(Refusal::DealNotDone));
    assert_eq!(character.go_on(here, None, true), Err(Refusal::NoSuchMouth));
    assert_eq!(character.go_on(here, Some((4, 2)), true), Ok(4), "a gauntlet's ways");
    character.dive_deal_done(3);
    assert_eq!(character.go_on((ISLAND, WEEK, 4), Some((9, 3)), false), Err(Refusal::DealNotDone), "another zone's");
    character.dive_deal_done(4);
    assert_eq!(character.go_on((ISLAND, WEEK, 4), Some((9, 3)), false), Ok(9));
    let dive = character.passage.as_ref().expect("diving");
    assert_eq!((dive.zone, dive.depth, dive.done), (9, 3, false));
    assert_eq!(character.go_on((ISLAND, WEEK, 4), Some((12, 4)), true), Err(Refusal::NoDive), "not the zone it is in");
}

#[test]
fn what_is_found_in_a_passage_zone_goes_into_the_haul_and_a_respawn_loses_it() {
    let mut character = diving();
    let before = character.materials.clone();
    character.gather(2);
    character.post(Mailed::LeftBehind, Posted::Vestige(vestige()));
    let item = crate::vestige::rolled(
        0,
        crate::Kind::Sword,
        Rarity::Magic,
        Slot::Melee,
        5,
        &crate::dice::Dice { seed: 1, tick: 0, player: 0 },
    );
    assert_eq!(character.keep_found(item, 5), None);
    let haul = &character.passage.as_ref().expect("diving").haul;
    assert_eq!((haul.vestiges.len(), haul.items.len(), haul.materials.resource(2)), (1, 1, 3));
    assert_eq!(character.materials, before, "nothing of the character's own");
    assert!(character.mail.is_empty(), "a Vestige left lying goes into the haul");
    character.lose_haul();
    assert!(character.passage.as_ref().expect("still diving").haul.is_empty());
}

#[test]
fn outside_a_passage_zone_finds_are_the_characters_own() {
    let mut character = diving();
    character.passage.as_mut().expect("diving").here = false;
    character.gather(2);
    assert_eq!(character.materials.resource(2), 3);
    assert!(character.passage.as_ref().expect("diving").haul.is_empty());
    assert_eq!(character.find_material(Stuff::Fragments(Stock::Weapon), 2), 2);
    assert_eq!(character.materials.fragments(Stock::Weapon), 2);
}

#[test]
fn an_old_save_reads_with_no_dive_and_a_later_builds_keys_are_kept() {
    let mut character = diving();
    character.pick_up(vestige());
    let mut json: serde_json::Value = serde_json::to_value(&character).expect("written");
    json["passage"]["later"] = serde_json::json!(7);
    json["passage"]["haul"]["later"] = serde_json::json!("kept");
    let read: Character = serde_json::from_value(json).expect("read");
    let dive: &Dive = read.passage.as_ref().expect("kept");
    assert_eq!(dive.unknown.get("later"), Some(&serde_json::json!(7)));
    assert_eq!(dive.haul.unknown.get("later"), Some(&serde_json::json!("kept")));
    assert!(!dive.here, "standing in a zone is never kept");
    assert_eq!(dive.seas, crate::Difficulty::Elite, "the seas it began at are kept");
    let mut old = serde_json::to_value(Character::starting()).expect("written");
    old.as_object_mut().expect("an object").remove("passage");
    let read: Character = serde_json::from_value(old).expect("an old save reads");
    assert!(read.passage.is_none());
    let mut unseasoned = serde_json::to_value(diving()).expect("written");
    unseasoned["passage"].as_object_mut().expect("a dive").remove("seas");
    let read: Character = serde_json::from_value(unseasoned).expect("a dive kept before its seas reads");
    assert_eq!(read.passage.map(|dive| dive.seas), Some(crate::Difficulty::Normal));
}

#[test]
fn a_dive_begun_at_a_lamp_is_never_paid_that_lamps_cache_again() {
    let mut character = Character::starting();
    character.activity.this_week(WEEK).passage_lamps.entry(ISLAND.to_owned()).or_default().insert(2);
    character.begin_dive(&start(30, Some(2))).expect("begun");
    character.passage.as_mut().expect("diving").here = true;
    let at = crate::lamps::Zone { island: ISLAND, week: WEEK, zone: 30, depth: 10, level: 10 };
    let dice = crate::dice::Dice { seed: 1, tick: 0, player: 0 };
    let paid =
        character.pay_cache(at, crate::lamps::Cache::Lamp(2), crate::Difficulty::Normal, crate::Source::World, &dice);
    assert!(!paid, "its cache was paid the dive that lit it");
}

#[test]
fn a_homeward_dive_keeps_its_haul_only_in_its_islands_patrol_zone() {
    for (room, kept) in [(Some(ISLAND), 3), (Some("continent-2"), 0), (None, 0)] {
        let mut character = diving();
        character.passage.as_mut().expect("diving").homeward = true;
        character.gather(4);
        let answered = character.leave_passages(room);
        assert_eq!((answered.is_some(), character.materials.resource(4)), (kept > 0, kept), "{room:?}");
        assert!(character.passage.is_none());
    }
}

/// A character of level 30: level 20 by XP, the rest by four Breach Legendary armour pieces won at Hard worn, each at
/// its most Prestige.
pub(crate) fn at_the_top() -> Character {
    let mut character = Character::starting();
    character.earn_xp(10_000_000, None);
    let dice = crate::dice::Dice { seed: 9, tick: 3, player: 1 };
    for (id, slot) in (900..).zip([Slot::Head, Slot::Torso, Slot::Arms, Slot::Legs]) {
        let mut piece = crate::vestige::make(id, Rarity::Legendary, slot, 20, crate::Source::Breach, &dice);
        let mut piece = piece.take().expect("a piece");
        piece.hard = true;
        (piece.xp, piece.bought) = (piece.xp_most(), u32::MAX);
        character.items.insert(id, (piece, crate::character::At::Worn(slot)));
    }
    assert_eq!(character.level(), 30);
    character
}

#[test]
fn a_dive_begun_at_a_lamp_has_that_zones_deal_done_and_the_fourth_lamp_is_no_begin() {
    let mut character = Character::starting();
    let lit = character.activity.this_week(WEEK).passage_lamps.entry(ISLAND.to_owned()).or_default();
    lit.extend([2, 4]);
    character.begin_dive(&start(30, Some(2))).expect("begun");
    assert!(character.passage.as_ref().is_some_and(|dive| dive.done), "its guard and its ways on stand for nothing");
    assert_eq!(character.begin_dive(&start(60, Some(4))), Err(Refusal::NoLamp), "depth 20 leads nowhere further");
}

#[test]
fn a_player_begins_at_any_lamp_whose_foes_they_match_with_no_weeks_lamp_paid_for_it() {
    let at = |lamp: u8| Start { depth: lamp * 5, ..start(30, Some(lamp)) };
    let mut low = Character::starting();
    assert_eq!(low.begin_dive(&at(1)), Err(Refusal::NoLamp), "the first lamp's foes stand over a new character");
    let mut high = at_the_top();
    assert_eq!(high.begin_dive(&at(3)), Ok(()), "foes 15 to 18 are under level 30");
    assert!(high.activity.this_week.passage_lamps.is_empty(), "no lamp counted lit this week for it");
    assert_eq!(high.passage.as_ref().map(|dive| (dive.lamp, dive.began)), Some((3, 15)));
}

#[test]
fn a_dive_counts_the_zones_it_went_through_from_where_it_began() {
    let mut character = Character::starting();
    character.begin_dive(&start(0, None)).expect("begun");
    character.dive_deal_done(0);
    character.go_on((ISLAND, WEEK, 0), Some((4, 2)), false).expect("on");
    assert_eq!(character.passage.as_ref().map(Dive::zones_deep), Some(2));
    let mut high = at_the_top();
    high.begin_dive(&Start { depth: 10, ..start(30, Some(2)) }).expect("begun at the second lamp");
    high.go_on((ISLAND, WEEK, 30), Some((33, 11)), false).expect("on, its deal done");
    assert_eq!(high.passage.as_ref().map(Dive::zones_deep), Some(2), "two zones in, not eleven");
}

#[test]
fn a_homeward_dive_kept_by_the_sea_keeps_its_haul_home_but_stands_where_it_landed() {
    let mut character = diving();
    let dive = character.passage.as_mut().expect("diving");
    (dive.homeward, dive.sailed) = (true, true);
    character.gather(4);
    assert_eq!(character.leave_passages(Some(ISLAND)), None, "not moved to the mouth");
    assert_eq!(character.materials.resource(4), 3, "its haul kept");
    assert!(character.passage.is_none());
}
