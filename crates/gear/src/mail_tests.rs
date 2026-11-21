//! The game's mail keeps what a player would have lost, and hands it over at its counter as there is room.

use crate::asks::{Ask, Here, Refusal};
use crate::character::{At, CARRIED_MOST, Character, VESTIGES_MOST, Vestige};
use crate::dice::Dice;
use crate::item::Item;
use crate::kinds::{Kind, Slot};
use crate::mail::{MAIL_MOST, OLDEST_WENT, Posted, Source};
use crate::rarity::Rarity;
use crate::ship::found::Salvage;

const DICE: Dice = Dice { seed: 3, tick: 1, player: 1 };
const AFIELD: Here = Here { social: false, day: 0, pledge: 0, rank: 0, week: 0 };
const AT_THE_COUNTER: Here = Here { social: true, day: 0, pledge: 0, rank: 0, week: 0 };

fn vestige(rarity: Rarity) -> Vestige {
    Vestige::new(0, rarity, Slot::Head, 12)
}

/// A character carrying ten Vestiges already.
fn carrying_ten() -> Character {
    let mut character = Character::starting();
    for _ in 0..VESTIGES_MOST {
        assert!(character.pick_up(vestige(Rarity::Normal)));
    }
    character
}

fn module() -> Item {
    Item::new(0, Kind::Hull, Rarity::Rare, 5, Slot::Hull)
}

/// A character carrying nine hulls already.
fn carrying_nine_hulls() -> Character {
    let mut character = Character::starting();
    for _ in 0..CARRIED_MOST {
        let id = character.take_id();
        character.items.insert(id, (Item { id, ..module() }, At::Carried));
    }
    character
}

#[test]
fn a_vestige_without_room_in_the_carried_ten_goes_to_the_mail_with_words_of_where_it_came_from() {
    let mut character = Character::starting();
    assert!(character.carry_or_post(vestige(Rarity::Rare), Source::Clear), "carried while there is room");
    assert!(character.mail.is_empty());
    let mut character = carrying_ten();
    assert!(!character.carry_or_post(vestige(Rarity::Legendary), Source::Clear));
    assert_eq!(character.vestiges_held(false), VESTIGES_MOST, "the ten untouched");
    let letter = &character.mail[0];
    assert_eq!(letter.vestige.as_ref().map(|kept| kept.rarity), Some(Rarity::Legendary));
    assert!(!letter.words.is_empty());
    let mut words: Vec<&str> = [Source::LeftLying, Source::LeftBehind, Source::Clear, Source::Flotsam, Source::Salvage]
        .map(Source::words)
        .to_vec();
    words.sort_unstable();
    words.dedup();
    assert_eq!(words.len(), 5, "each source says its own");
}

#[test]
fn a_salvaged_module_whose_slot_carries_nine_goes_to_the_mail() {
    let mut character = carrying_nine_hulls();
    let taken = character.take_salvage(Salvage { module: Some(module()), ..Salvage::default() });
    assert_eq!(taken.module, None, "not carried");
    assert_eq!(character.carried_in(Slot::Hull), CARRIED_MOST);
    assert_eq!(character.mail[0].item.as_ref().map(|kept| kept.kind), Some(Kind::Hull));
}

#[test]
fn a_full_mailbox_lets_its_oldest_letter_go_and_the_new_letter_says_so() {
    let mut character = Character::starting();
    for _ in 0..MAIL_MOST {
        character.post(Source::LeftLying, Posted::Vestige(vestige(Rarity::Normal)));
    }
    assert!(character.mail.iter().all(|letter| !letter.words.ends_with(OLDEST_WENT)), "none went while there was room");
    let oldest = character.mail[0].id;
    character.post(Source::LeftBehind, Posted::Vestige(vestige(Rarity::Atheric)));
    assert_eq!(character.mail.len(), MAIL_MOST);
    assert!(character.mail.iter().all(|letter| letter.id != oldest), "the oldest went");
    let newest = character.mail.last().expect("a letter");
    assert_eq!(newest.vestige.as_ref().map(|kept| kept.rarity), Some(Rarity::Atheric));
    assert!(newest.words.ends_with(OLDEST_WENT), "the new letter tells of it");
}

#[test]
fn a_letter_is_taken_at_the_mail_counter_only_and_only_with_room() {
    let mut character = carrying_ten();
    character.post(Source::LeftLying, Posted::Vestige(vestige(Rarity::Rare)));
    let letter = character.mail[0].id;
    let take = Ask::TakeLetter { letter };
    assert_eq!(character.ask(take, AFIELD, &DICE), Err(Refusal::NotHere));
    assert_eq!(character.ask(take, AT_THE_COUNTER, &DICE), Err(Refusal::VestigesFull));
    assert_eq!(character.mail.len(), 1, "refused, it waits");
    assert_eq!(
        character.ask(Ask::TakeLetter { letter: letter + 1 }, AT_THE_COUNTER, &DICE),
        Err(Refusal::NoSuchLetter)
    );
    let carried = *character.vestiges.keys().next().expect("a Vestige");
    character.vestiges.remove(&carried);
    assert!(character.ask(take, AT_THE_COUNTER, &DICE).is_ok());
    assert!(character.mail.is_empty());
    assert_eq!(character.vestiges_held(false), VESTIGES_MOST);
    assert!(character.vestiges.values().any(|(kept, _)| kept.rarity == Rarity::Rare), "carried");
    assert!(character.vestiges.iter().all(|(id, (kept, _))| *id == kept.id), "numbered as it is taken");
}

#[test]
fn a_letters_item_goes_into_its_slots_nine_once_there_is_room() {
    let mut character = carrying_nine_hulls();
    character.post(Source::Salvage, Posted::Item(module()));
    let take = Ask::TakeLetter { letter: character.mail[0].id };
    assert_eq!(character.ask(take, AT_THE_COUNTER, &DICE), Err(Refusal::CarriedFull));
    let carried = |(_, (item, at)): &(&u32, &(Item, At))| item.kind == Kind::Hull && *at == At::Carried;
    let one = *character.items.iter().find(carried).expect("a hull carried").0;
    character.items.remove(&one);
    assert!(character.ask(take, AT_THE_COUNTER, &DICE).is_ok());
    assert_eq!(character.carried_in(Slot::Hull), CARRIED_MOST);
    assert!(character.mail.is_empty());
}

#[test]
fn take_all_takes_every_letter_with_room_and_leaves_the_rest() {
    let mut character = carrying_ten();
    let carried = *character.vestiges.keys().next().expect("a Vestige");
    character.vestiges.remove(&carried);
    for rarity in [Rarity::Magic, Rarity::Rare] {
        character.post(Source::LeftLying, Posted::Vestige(vestige(rarity)));
    }
    character.post(Source::Salvage, Posted::Item(module()));
    assert!(character.ask(Ask::TakeAllLetters, AT_THE_COUNTER, &DICE).is_ok());
    assert_eq!(character.vestiges_held(false), VESTIGES_MOST);
    assert_eq!(character.carried_in(Slot::Hull), 1, "the module taken");
    assert_eq!(character.mail.len(), 1, "the one without room waits");
    assert_eq!(character.mail[0].vestige.as_ref().map(|kept| kept.rarity), Some(Rarity::Rare), "oldest first");
    assert_eq!(character.ask(Ask::TakeAllLetters, AT_THE_COUNTER, &DICE), Err(Refusal::VestigesFull));
    assert_eq!(character.ask(Ask::TakeAllLetters, AFIELD, &DICE), Err(Refusal::NotHere));
    let mut empty = Character::starting();
    assert_eq!(empty.ask(Ask::TakeAllLetters, AT_THE_COUNTER, &DICE), Err(Refusal::NoSuchLetter));
}

#[test]
fn the_mail_is_kept_with_the_character_and_no_number_is_given_twice() {
    let mut character = carrying_nine_hulls();
    character.post(Source::Salvage, Posted::Item(module()));
    character.post(Source::Clear, Posted::Vestige(vestige(Rarity::Legendary)));
    let mut text: serde_json::Value = serde_json::from_str(&character.to_json()).expect("json");
    text["mail"][0]["later"] = serde_json::json!("kept");
    let letters: Vec<u32> = character.mail.iter().map(|letter| letter.id).collect();
    text["next_id"] = serde_json::json!(1);
    let back = Character::from_json(&text.to_string()).expect("a character");
    assert_eq!(back.mail.len(), 2);
    assert_eq!(back.mail[0].item, character.mail[0].item);
    assert_eq!(back.mail[1].vestige, character.mail[1].vestige);
    assert!(back.to_json().contains("\"later\":\"kept\""), "a later room's key kept");
    assert!(back.take_id_clear_of(&letters), "a letter's number never given again");
}
