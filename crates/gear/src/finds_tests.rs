//! A chest holds Aurem by its level, two to four of the island's resource and a Vestige one time in four; a search
//! holds less, a dungeon's chest more and its vault's the most; a harder voyage raises each as it raises a kill.

use crate::character::{Character, STOCK_MOST, Stuff};
use crate::dice::Dice;
use crate::finds::{CHEST, DUNGEON_CHEST, Find, SEARCH, VAULT_CHEST};
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
    // A Normal roll comes as its item rather than a Vestige, so either counts.
    let share = |find: Find, difficulty: Difficulty| {
        let rolled: usize = (0..4_000)
            .map(|tick| {
                let mut character = Character::starting();
                let items = character.items.len();
                let found = character.find(find, (10, difficulty), Some(0), Source::World, &Dice { tick, ..DICE });
                found.vestiges.len() + character.items.len() - items
            })
            .sum();
        rolled as f64 / 4_000.0
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

#[test]
fn a_dungeons_chest_pays_more_than_a_patrols_and_a_vaults_the_most() {
    let aurem =
        |find: Find| Character::starting().find(find, (5, Difficulty::Normal), None, Source::Dungeon, &DICE).aurem;
    assert_eq!([aurem(Find::Chest), aurem(Find::DungeonChest), aurem(Find::VaultChest)], [30, 60, 150]);
    let counts = |find: Find| -> Vec<u16> {
        opened(find, 5, Difficulty::Normal, 300).iter().map(|found| found.resource).collect()
    };
    for (find, [least, most]) in [(Find::DungeonChest, [3, 5]), (Find::VaultChest, [4, 6])] {
        let counts = counts(find);
        assert!((least..=most).all(|count| counts.contains(&count)), "{find:?}: every count comes");
        assert!(counts.iter().all(|count| (least..=most).contains(count)), "{find:?}: {counts:?}");
    }
    assert_eq!((DUNGEON_CHEST.vestige, DUNGEON_CHEST.rank), (crate::vestige::chance(3), 3), "an Elite's");
    assert_eq!((VAULT_CHEST.vestige, VAULT_CHEST.item, VAULT_CHEST.rank), (1.0, 0.25, 4), "a Miniboss's colours");
}

#[test]
fn a_dungeons_chest_holds_a_vestige_two_times_in_five_and_a_vaults_always_with_an_item_one_time_in_four() {
    let rolled = |find: Find| -> (f64, f64) {
        let (mut vestiges, mut items) = (0, 0);
        for tick in 0..4_000 {
            let mut character = Character::starting();
            let before = character.items.len();
            let dice = Dice { tick, ..DICE };
            let found = character.find(find, (10, Difficulty::Normal), Some(0), Source::Dungeon, &dice);
            vestiges += found.vestiges.len();
            items += character.items.len() - before;
        }
        (vestiges as f64 / 4_000.0, items as f64 / 4_000.0)
    };
    // A Normal Vestige comes as its item, so a dungeon's chest counts both; a vault's lays a Vestige every time.
    let (vestiges, items) = rolled(Find::DungeonChest);
    assert!((vestiges + items - 0.40).abs() < 0.03, "a dungeon's chest's {vestiges} and {items}");
    let (vestiges, items) = rolled(Find::VaultChest);
    assert!(vestiges + items >= 1.0 && (vestiges + items - 1.25).abs() < 0.03, "a vault's {vestiges} and {items}");
}

#[test]
fn a_vault_stays_under_a_bosss_drop_and_no_chest_holds_essence() {
    use crate::vestige::{chance, colours, item_chance};
    assert!(VAULT_CHEST.rank < 5 && VAULT_CHEST.item < item_chance(5) && VAULT_CHEST.vestige <= chance(5));
    assert!(colours(VAULT_CHEST.rank)[4] < colours(5)[4], "a Boss's Atheric is likelier");
    const { assert!(CHEST.aurem < DUNGEON_CHEST.aurem && DUNGEON_CHEST.aurem < VAULT_CHEST.aurem) };
    const { assert!(CHEST.vestige < DUNGEON_CHEST.vestige && DUNGEON_CHEST.vestige < VAULT_CHEST.vestige) };
    for find in [Find::Chest, Find::DungeonChest, Find::VaultChest, Find::Search] {
        let mut character = Character::starting();
        let essence = |character: &Character| (character.materials.weapon_essence, character.materials.armor_essence);
        let before = essence(&character);
        character.find(find, (20, Difficulty::Abyss), Some(0), Source::Dungeon, &DICE);
        assert_eq!(essence(&character), before, "{find:?} holds no Essence");
    }
}

#[test]
fn an_abyss_vault_lays_two_vestiges_as_its_reward_doubles_a_sure_one() {
    for tick in 0..50 {
        let mut character = Character::starting();
        let before = character.items.len();
        let dice = Dice { tick, ..DICE };
        let found = character.find(Find::VaultChest, (10, Difficulty::Abyss), None, Source::Dungeon, &dice);
        // A Normal Vestige comes as its item, so the Vestiges and the items kept count together, the item's own on top.
        assert!(found.vestiges.len() + character.items.len() - before >= 2, "tick {tick}");
    }
}
