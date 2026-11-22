//! The lore: the file, a chapter's number and key, the chapters found as the story ends and as a quest's task is done,
//! and keeping them.

use crate::character::Character;
use crate::lore::{CategoryDef, Found, LoreDef, key_of, lore};

/// A category of the lore by its id.
fn gear_category(id: &str) -> CategoryDef {
    CategoryDef { id: id.to_owned() }
}
use crate::quests::Road;

/// Lore of two books, as a file might hold it: a chapter of the story's, one of a task's, one at a place.
fn sample() -> LoreDef {
    serde_json::from_str(
        r#"{
            "categories": [{ "id": "storm", "name": "Of the Storm" }],
            "books": [
                { "id": "first", "category": "storm", "name": "The First", "chapters": [
                    { "id": "wake", "title": "Waking", "found": { "kind": "story" } },
                    { "id": "beacon", "title": "The Beacon", "found": { "kind": "quest", "quest": "stormcallers", "task": "climb-old-beacon" } }
                ] },
                { "id": "second", "category": "storm", "chapters": [
                    { "id": "barns", "found": { "kind": "place", "node": "saltgrass-downs", "place": "The Tithe Barns", "bearing": 90, "at": 4 } }
                ] }
            ]
        }"#,
    )
    .expect("the sample reads")
}

#[test]
fn the_file_reads_and_holds_nothing_the_rules_cannot_keep() {
    assert_eq!(lore().problems(), Vec::<String>::new());
    assert_eq!(sample().problems(), Vec::<String>::new());
}

#[test]
fn chapters_are_numbered_book_by_book_in_the_files_order_and_keyed_by_book_and_chapter() {
    let sample = sample();
    let keys: Vec<String> = sample.chapters().map(|(key, _)| key).collect();
    assert_eq!(keys, ["first/wake", "first/beacon", "second/barns"]);
    assert_eq!(sample.number_of("second/barns"), Some(2));
    assert_eq!(sample.key_at(1).as_deref(), Some("first/beacon"));
    assert_eq!((sample.number_of("first/none"), sample.key_at(3)), (None, None));
    let place =
        Found::Place { node: "saltgrass-downs".into(), place: "The Tithe Barns".into(), bearing: 90.0, at: 4.0 };
    assert_eq!(sample.chapters().nth(2).map(|(_, found)| found.clone()), Some(place));
}

#[test]
fn a_file_that_names_what_is_not_there_says_so_line_by_line() {
    let mut file = sample();
    file.books[1].category = "none".into();
    file.books[0].chapters[1].found = Found::Quest { quest: "stormcallers".into(), task: "no-such-task".into() };
    let twice = file.books[0].chapters[0].clone();
    file.books[0].chapters.push(twice);
    let again = file.books[1].clone();
    file.books.push(again);
    file.books[2].chapters.clear();
    let category = file.categories[0].clone();
    file.categories.push(category);
    let problems = file.problems();
    assert!(problems.iter().any(|said| said.contains("category's id")), "{problems:?}");
    assert!(problems.iter().any(|said| said.contains("book's id")), "{problems:?}");
    assert!(problems.iter().any(|said| said.contains("second: its category none")), "{problems:?}");
    assert!(problems.iter().any(|said| said.contains("no-such-task, no task")), "{problems:?}");
    assert!(problems.iter().any(|said| said.contains("first: a chapter's id")), "{problems:?}");
    assert!(problems.iter().any(|said| said.contains("has no chapter")), "{problems:?}");
    let mut placed = sample();
    placed.books[1].chapters[0].found =
        Found::Place { node: "saltgrass-downs".into(), place: String::new(), bearing: 0.0, at: 1.0 };
    assert_eq!(placed.problems().len(), 1, "a place with no name");
    let mut empty = sample();
    empty.categories.push(gear_category("bare"));
    assert_eq!(empty.problems(), ["bare has no book"], "a category whose tile would open on nothing");
    let mut slashed = sample();
    slashed.books[0].id = "fir/st".into();
    assert_eq!(slashed.problems().len(), 1, "a / would make two keys one");
}

#[test]
fn the_storys_chapters_are_found_once_it_is_played_and_a_tasks_once_it_is_done_never_a_places() {
    let sample = sample();
    let mut character = Character::starting();
    character.lore.clear();
    character.find_lore_due(&sample);
    assert!(character.lore.is_empty(), "nothing played");
    character.story.prologue = true;
    character.find_lore_due(&sample);
    assert_eq!(character.lore, ["first/wake"]);
    let road = |task: &str, done| Road { task: task.into(), counts: Vec::new(), done, unknown: Default::default() };
    character.quests.roads.insert("stormcallers".into(), road("climb-old-beacon", false));
    character.find_lore_due(&sample);
    assert_eq!(character.lore, ["first/wake"], "on the task, not past it");
    character.quests.roads.insert("stormcallers".into(), road("take-back-storm", false));
    character.find_lore_due(&sample);
    assert_eq!(character.lore, ["first/wake", "first/beacon"], "walked past it");
    character.quests.roads.insert("stormcallers".into(), road("climb-old-beacon", true));
    character.lore.truncate(1);
    character.find_lore_due(&sample);
    assert_eq!(character.lore, ["first/wake", "first/beacon"], "its road done");
    character.find_lore_due(&sample);
    assert_eq!(character.lore.len(), 2, "each once");
    assert!(!character.finds_lore(&key_of("second", "barns")), "a place's is found where it lies");
}

#[test]
fn a_chapter_is_kept_once_and_kept_as_read_even_one_the_file_no_longer_holds() {
    let mut character = Character::starting();
    assert!(character.keep_lore("first/wake"));
    assert!(!character.keep_lore("first/wake"));
    character.lore.push("first/wake".into());
    character.lore.push("gone/chapter".into());
    let read = Character::from_json(&character.to_json()).expect("it reads");
    assert_eq!(read.lore, ["first/wake", "gone/chapter"], "kept once, the unknown one too");
}
