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
    // A Normal Vestige paid is kept as its item.
    let kept = |character: &Character| character.vestiges.len() + character.mail.len() + character.items.len();
    let held = kept(&character);
    character.light_lamp(zone(5), 1, (100, 14), &dice(1)).expect("lit");
    assert!(character.passage.as_ref().expect("diving").haul.is_empty());
    assert_eq!(character.materials.resource(1), 3, "materials added");
    // The haul's Vestige, the day's lamp's and the week's first lamp's.
    assert_eq!(kept(&character), held + 3);
    assert!(character.activity.today.passage_lamp.contains(ISLAND));
    assert!(character.activity.this_week.passage_lamps[ISLAND].contains(&1));
    let (xp, count) = (character.xp, kept(&character));
    character.light_lamp(zone(5), 1, (100, 14), &dice(2)).expect("lit again");
    assert_eq!((character.xp, kept(&character)), (xp, count), "nothing twice");
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
fn going_home_needs_the_lamp_lit_and_keeps_the_haul_to_the_patrol_zone_before_its_mouth() {
    let mut character = diving();
    assert_eq!(character.go_home(0, None), Err(Refusal::NoLamp));
    assert_eq!(character.go_home(0, Some(1)), Err(Refusal::LampNotLit));
    character.light_lamp(zone(5), 1, (100, 14), &dice(1)).expect("lit");
    character.gather(4);
    assert_eq!(character.go_home(0, Some(1)), Ok(()));
    assert_eq!(character.materials.resource(4), 3, "what was found since the lamp is kept");
    assert!(character.passage.as_ref().is_some_and(|dive| dive.homeward), "the dive goes home");
    assert_eq!(character.go_on(("continent-1", 2_900, 0), Some((3, 2)), true), Err(Refusal::NoDive), "and no further");
    character.gather(4);
    let mouth = character.passage.as_ref().map(|dive| dive.mouth);
    assert_eq!(character.leave_passages(Some(ISLAND)), mouth, "into the patrol zone before the mouth it began at");
    assert!(character.passage.is_none());
    assert_eq!(character.materials.resource(4), 6, "a find on the way out is kept with it");
}

#[test]
fn leaving_the_passages_any_other_way_loses_the_haul() {
    let mut character = diving();
    character.gather(4);
    assert_eq!(character.leave_passages(Some(ISLAND)), None);
    assert!(character.passage.is_none());
    assert_eq!(character.materials.resource(4), 0);
}

/// What `light` added to the character's Vestiges and items, by colour and slot.
fn new_finds(character: &mut Character, light: impl FnOnce(&mut Character)) -> Vec<(Rarity, Slot)> {
    let (vestiges, items): (Vec<u32>, Vec<u32>) =
        (character.vestiges.keys().copied().collect(), character.items.keys().copied().collect());
    light(character);
    let found = character
        .vestiges
        .iter()
        .filter(|(id, _)| !vestiges.contains(id))
        .map(|(_, (vestige, _))| (vestige.rarity, vestige.slot));
    let made = character
        .items
        .iter()
        .filter(|(id, _)| !items.contains(id))
        .map(|(_, (item, _))| (item.rarity, item.kind.slot()));
    found.chain(made).collect()
}

#[test]
fn the_days_lamp_and_the_weeks_lamp_roll_their_vestiges_apart() {
    let alike = (1..24)
        .filter(|&seed| {
            let mut character = diving();
            let paid = new_finds(&mut character, |character| {
                character.light_lamp(zone(5), 1, (100, 14), &dice(seed)).expect("lit");
            });
            assert_eq!(paid.len(), 2, "the day's and the week's");
            paid[0] == paid[1]
        })
        .count();
    assert!(alike < 12, "{alike} of 23 lamps paid two alike");
}

#[test]
fn a_reliquarys_fragments_stock_is_rolled_apart_from_their_count() {
    let mut seen = std::collections::BTreeSet::new();
    for seed in 0..64 {
        let mut character = diving();
        character.pay_cache(zone(1), Cache::Reliquary, Difficulty::Normal, Source::Dungeon, &dice(seed));
        let haul = &character.passage.as_ref().expect("diving").haul.materials;
        let (weapon, armor) = (haul.fragments(Stock::Weapon), haul.fragments(Stock::Armor));
        seen.insert((weapon.max(armor) <= 3, weapon > 0));
    }
    assert_eq!(seen.len(), 4, "every count with every stock: {seen:?}");
}

/// A character of the top level in the first zone of a dive.
fn diving_at_the_top() -> Character {
    let mut character = crate::dive::dive_tests::at_the_top();
    character.passage = diving().passage;
    character
}

#[test]
fn the_days_lamp_goes_to_the_first_lamp_lit_whose_zone_is_within_three_levels() {
    let mut character = diving_at_the_top();
    character.light_lamp(Zone { level: 5, ..zone(5) }, 1, (100, 14), &dice(1)).expect("lit");
    assert!(!character.activity.today.passage_lamp.contains(ISLAND), "a lamp far under them pays no day's lamp");
    character.light_lamp(Zone { level: 27, ..zone(20) }, 4, (100, 14), &dice(2)).expect("lit");
    assert!(character.activity.today.passage_lamp.contains(ISLAND));
}

#[test]
fn the_fourth_lamp_rolls_as_the_elite_dungeons_first_clear() {
    let mut atheric = 0;
    for seed in 0..80 {
        let mut character = diving_at_the_top();
        character.activity.today(100).passage_lamp.insert(ISLAND.to_owned());
        let paid = new_finds(&mut character, |character| {
            character.light_lamp(Zone { level: 28, ..zone(20) }, 4, (100, 14), &dice(seed)).expect("lit");
        });
        assert_eq!(paid.len(), 2, "the week's Boss Vestige and the Elite's roll");
        assert!(paid.iter().any(|(rarity, _)| *rarity == Rarity::Legendary), "the Elite's is Legendary");
        atheric += paid.iter().filter(|(rarity, _)| *rarity == Rarity::Atheric).count();
    }
    assert!(atheric < 8, "the Abyss's roll would give an Atheric about one time in five: {atheric} of 80");
}

#[test]
fn the_first_lamp_a_character_lights_gives_the_passages_lore() {
    let mut character = diving();
    let chapters = |character: &Character| character.lore.len();
    let before = chapters(&character);
    character.light_lamp(zone(5), 1, (100, 14), &dice(1)).expect("lit");
    assert_eq!(chapters(&character), before + 1);
    assert!(character.finds_lore("longer-than-the-chart/the-first-lamp"));
    character.light_lamp(zone(10), 2, (100, 14), &dice(2)).expect("lit");
    assert_eq!(chapters(&character), before + 1, "once");
}
