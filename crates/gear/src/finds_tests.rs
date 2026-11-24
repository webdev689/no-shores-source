//! A chest holds Aurem by its level, two to four of the island's resource and a Vestige one time in four; a search
//! holds less; a harder voyage raises both as it raises a kill.

use crate::character::{Character, STOCK_MOST, Stuff};
use crate::dice::Dice;
use crate::finds::{CHEST, Find, SEARCH};
use crate::source::Source;
use crate::world::Difficulty;

const DICE: Dice = Dice { seed: 11, tick: 1, player: 1 };

/// Opens `count` finds of a kind for fresh characters, each on dice of its own: what each gave.
fn opened(find: Find, level: u8, difficulty: Difficulty, count: u64) -> Vec<crate::finds::Found> {
    (0..count)
        .map(|tick| {
            Character::starting().find(find, (level, difficulty), Some(0), Source::World, &Dice { tick, ..DICE })
        })
        .collect()
}

#[test]
fn a_chest_pays_aurem_grown_with_its_level_as_a_kill_does_and_no_xp() {
    let at = |level: u8, difficulty: Difficulty| {
        let mut character = Character::starting();
        let (aurem, xp) = (character.materials.aurem, character.xp);
        let found = character.find(Find::Chest, (level, difficulty), None, Source::World, &DICE);
        assert_eq!(character.materials.aurem, aurem + found.aurem, "kept");
        assert_eq!(character.xp, xp, "a find pays no XP");
        found.aurem
    };
    assert_eq!(at(5, Difficulty::Normal), CHEST.aurem);
    assert_eq!(at(20, Difficulty::Normal), CHEST.aurem * 25 / 10, "times (5 + its level) / 10");
    assert_eq!(at(20, Difficulty::Abyss), CHEST.aurem * 25 / 10 * 2, "the Abyss pays twice");
    assert!(at(5, Difficulty::Normal) > SEARCH.aurem, "a chest holds more than a search");
}

#[test]
fn a_chest_always_holds_two_to_four_of_the_islands_resource_and_each_count_comes() {
    let counts: Vec<u16> = opened(Find::Chest, 5, Difficulty::Normal, 300).iter().map(|found| found.resource).collect();
    for count in 2..=4 {
        assert!(counts.contains(&count), "{count} of the resource comes");
    }
    assert!(counts.iter().all(|count| (2..=4).contains(count)), "{counts:?}");
    let mut character = Character::starting();
    let found = character.find(Find::Chest, (5, Difficulty::Normal), Some(3), Source::World, &DICE);
    assert_eq!(character.materials.resource(3), Character::starting().materials.resource(3) + found.resource);
    let nowhere = Character::starting().find(Find::Chest, (5, Difficulty::Normal), None, Source::World, &DICE);
    assert_eq!(nowhere.resource, 0, "land with no resource gives none");
}

#[test]
fn a_full_stock_takes_none_of_the_resource_and_the_chest_still_pays_its_aurem() {
    let mut character = Character::starting();
    character.materials.add(Stuff::Resource(0), STOCK_MOST);
    let found = character.find(Find::Chest, (5, Difficulty::Normal), Some(0), Source::World, &DICE);
    assert_eq!((found.resource, found.aurem), (0, CHEST.aurem));
    assert_eq!(character.materials.resource(0), STOCK_MOST);
}

#[test]
fn a_chest_holds_a_vestige_about_one_time_in_four_and_a_search_about_one_in_twenty() {
    let share = |find: Find, difficulty: Difficulty| {
        let found = opened(find, 10, difficulty, 4_000);
        found.iter().map(|each| each.vestiges.len()).sum::<usize>() as f64 / found.len() as f64
    };
    let chest = share(Find::Chest, Difficulty::Normal);
    assert!((chest - CHEST.vestige).abs() < 0.03, "a chest's {chest}");
    let search = share(Find::Search, Difficulty::Normal);
    assert!((search - SEARCH.vestige).abs() < 0.015, "a search's {search}");
    let raised = share(Find::Chest, Difficulty::Abyss);
    assert!((raised - CHEST.vestige * 2.0).abs() < 0.04, "the Abyss doubles it: {raised}");
}

#[test]
fn a_chests_vestige_is_of_its_level_and_its_source_and_a_search_finds_one_of_the_resource_one_time_in_two() {
    let found = opened(Find::Chest, 12, Difficulty::Normal, 200);
    let vestige = found.iter().flat_map(|each| &each.vestiges).next().expect("one of 200 chests holds a Vestige");
    assert_eq!(vestige.level, 12);
    let dungeon = (0..200)
        .map(|tick| {
            let dice = Dice { tick, ..DICE };
            Character::starting().find(Find::Chest, (12, Difficulty::Normal), None, Source::Dungeon, &dice)
        })
        .flat_map(|each| each.vestiges)
        .next()
        .expect("a Vestige");
    assert_eq!(dungeon.source, Source::Dungeon, "of the content it was found in");
    let searched = opened(Find::Search, 5, Difficulty::Normal, 2_000);
    let with = searched.iter().filter(|each| each.resource > 0).count() as f64 / 2_000.0;
    assert!((with - SEARCH.resource_chance).abs() < 0.05, "{with}");
    assert!(searched.iter().all(|each| each.resource <= 1 && each.aurem == SEARCH.aurem));
}
