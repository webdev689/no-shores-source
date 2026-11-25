use crate::character::{Character, Stuff, Vestige};
use crate::dive::{Dive, Route, Start};
use crate::kinds::{Slot, Stock};
use crate::mail::{Posted, Source as Mailed};
use crate::rarity::Rarity;
use crate::refusal::Refusal;

const ISLAND: &str = "continent-1";
const WEEK: u64 = 2_900;

fn start(zone: u16, lamp: Option<u8>) -> Start<'static> {
    Start { island: ISLAND, week: WEEK, route: Route::Public, mouth: 1, zone, depth: 1, lamp }
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
fn a_dive_begins_at_a_lamp_only_where_it_was_lit_this_week_on_that_island() {
    let mut character = Character::starting();
    assert_eq!(character.begin_dive(&start(30, Some(2))), Err(Refusal::NoLamp));
    character.activity.this_week(WEEK).passage_lamps.entry(ISLAND.to_owned()).or_default().insert(2);
    assert_eq!(character.begin_dive(&start(30, Some(2))), Ok(()));
    assert_eq!(character.passage.as_ref().map(|dive| dive.lamp), Some(2), "the lamp counted lit");
    let other = Start { island: "continent-2", ..start(30, Some(2)) };
    assert_eq!(character.begin_dive(&other), Err(Refusal::NoLamp), "another island's");
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
    let mut old = serde_json::to_value(Character::starting()).expect("written");
    old.as_object_mut().expect("an object").remove("passage");
    let read: Character = serde_json::from_value(old).expect("an old save reads");
    assert!(read.passage.is_none());
}
