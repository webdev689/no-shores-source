use crate::character::{Character, Vestige};
use crate::dice::Dice;
use crate::dive::dive_tests::diving;
use crate::kinds::{Slot, Stock};
use crate::lamps::{Cache, Zone, find_times, pay_times};
use crate::rarity::Rarity;
use crate::refusal::Refusal;
use crate::source::Source;
use crate::world::Difficulty;

const ISLAND: &str = "continent-1";

fn zone(depth: u8) -> Zone<'static> {
    Zone { island: ISLAND, week: 2_900, zone: 0, depth, level: 10 }
}

fn dice(seed: u64) -> Dice {
    Dice { seed, tick: 3, player: 1 }
}

#[test]
fn a_caches_pay_and_finds_grow_with_depth_as_the_design_says() {
    assert_eq!((pay_times(1), pay_times(20)), (1.0, 1.25));
    assert_eq!((find_times(1), find_times(20)), (1.0, 2.0));
    assert!((pay_times(11) - passage_like(11)).abs() < 1e-12);
}

/// The passage crate's own sum, written out: the gear keeps its table without depending on the passages' crate.
fn passage_like(depth: u8) -> f64 {
    1.0 + f64::from(depth - 1) / 76.0
}

#[test]
fn a_cache_pays_once_a_dive_and_its_finds_go_into_the_haul() {
    let mut character = diving();
    let (xp, aurem) = (character.xp, character.materials.aurem);
    assert!(character.pay_cache(zone(1), Cache::Reliquary, Difficulty::Normal, Source::Dungeon, &dice(1)));
    assert!(character.xp > xp && character.materials.aurem > aurem, "a reliquary pays its XP and Aurem");
    let haul = &character.passage.as_ref().expect("diving").haul;
    let fragments = haul.materials.fragments(Stock::Weapon) + haul.materials.fragments(Stock::Armor);
    assert!((2..=5).contains(&fragments), "{fragments}");
    assert!(haul.vestiges.len() + haul.items.len() >= 1, "a sure Vestige");
    assert!(!character.pay_cache(zone(1), Cache::Reliquary, Difficulty::Normal, Source::Dungeon, &dice(2)), "once");
}

#[test]
fn a_deeper_skirmish_pays_more() {
    let paid = |depth: u8| {
        let mut character = diving();
        character.pay_cache(zone(depth), Cache::Skirmish, Difficulty::Normal, Source::World, &dice(5));
        character.xp
    };
    assert!(paid(20) > paid(1));
    assert_eq!(paid(1), u64::from(crate::rewards::at_level(crate::lamps::SKIRMISH_PAY.0, 10)));
}

#[test]
fn a_lamp_keeps_the_haul_and_pays_the_day_and_the_week_once() {
    let mut character = diving();
    character.pick_up(Vestige::new(0, Rarity::Rare, Slot::Head, 10));
    character.gather(1);
    let held = character.vestiges.len();
    character.light_lamp(zone(5), 1, (100, 14), &dice(1)).expect("lit");
    assert!(character.passage.as_ref().expect("diving").haul.is_empty());
    assert_eq!(character.materials.resource(1), 3, "materials added");
    // The haul's Vestige, the day's lamp's and the week's first lamp's.
    assert_eq!(character.vestiges.len() + character.mail.len(), held + 3);
    assert!(character.activity.today.passage_lamp.contains(ISLAND));
    assert!(character.activity.this_week.passage_lamps[ISLAND].contains(&1));
    let (xp, count) = (character.xp, character.vestiges.len() + character.mail.len());
    character.light_lamp(zone(5), 1, (100, 14), &dice(2)).expect("lit again");
    assert_eq!((character.xp, character.vestiges.len() + character.mail.len()), (xp, count), "nothing twice");
    assert_eq!(character.passage.as_ref().map(|dive| dive.lamp), Some(1));
}

#[test]
fn the_weeks_lamps_pay_essence_from_the_second_and_a_weekly_roll_at_the_fourth() {
    let mut character = diving();
    let essence = |character: &Character| character.materials.essence(Stock::Weapon);
    let mut seen = Vec::new();
    for number in 1..=4 {
        character.light_lamp(zone(number * 5), number, (100, 14), &dice(u64::from(number))).expect("lit");
        seen.push(essence(&character));
    }
    assert_eq!(seen, [0, 1, 3, 5]);
    assert_eq!(character.materials.shapes, 0, "no Shapes");
}

#[test]
fn going_home_needs_the_lamp_lit_and_ends_the_dive_keeping_the_haul() {
    let mut character = diving();
    assert_eq!(character.go_home(0, None), Err(Refusal::NoLamp));
    assert_eq!(character.go_home(0, Some(1)), Err(Refusal::LampNotLit));
    character.light_lamp(zone(5), 1, (100, 14), &dice(1)).expect("lit");
    character.gather(4);
    assert_eq!(character.go_home(0, Some(1)), Ok(()));
    assert!(character.passage.is_none());
    assert_eq!(character.materials.resource(4), 3);
}
