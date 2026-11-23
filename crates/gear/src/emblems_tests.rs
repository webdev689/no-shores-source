//! Emblems: the catalogue, the start, levels and deeds, the Tailor's day and wearing one.

use crate::asks::{Ask, Here, Refusal};
use crate::character::Character;
use crate::dice::Dice;
use crate::emblems::{Deed, SOLD_A_DAY, Source, emblems, number_of, sold_on, starting};
use std::collections::BTreeSet;

const DICE: Dice = Dice { seed: 1, tick: 2, player: 3 };
const AT_TAILOR: Here = Here { social: true, day: 20_400, pledge: 0, rank: 0, week: 0 };

#[test]
fn the_catalogue_reads_with_one_start_and_ids_of_its_own() {
    let ids: BTreeSet<&str> = emblems().iter().map(|emblem| emblem.id.as_str()).collect();
    assert_eq!(ids.len(), emblems().len(), "no two emblems share an id");
    let starts = emblems().iter().filter(|emblem| emblem.source == Source::Start).count();
    assert_eq!(starts, 1);
    let sold = emblems().iter().filter(|emblem| matches!(emblem.source, Source::Sold { .. })).count();
    assert!(sold > SOLD_A_DAY, "the Tailor's day is a choice among more than it shows");
}

#[test]
fn a_new_player_keeps_and_wears_the_starting_emblem_and_earns_by_level_and_deed() {
    let mut character = Character::starting();
    assert_eq!((character.emblems.clone(), character.emblem.clone()), (vec![starting()], starting()));
    character.earn_xp(u32::MAX, None);
    assert!(character.keeps_emblem("deckhand") && character.keeps_emblem("captain"), "levels 5 to 20 reached");
    assert!(!character.keeps_emblem("stormborn"));
    character.earn(Deed::AbyssFoe);
    character.earn(Deed::AbyssFoe);
    assert_eq!(character.emblems.iter().filter(|kept| *kept == "stormborn").count(), 1, "kept once");
}

#[test]
fn gilded_is_earned_by_a_legendary_or_atheric_piece_bought_whole_and_no_lesser_one() {
    let mut character = Character::starting();
    let (id, (item, _)) = character.items.iter_mut().next().expect("a starting piece");
    let id = *id;
    item.bought = (1_u32 << crate::grid::node_offsets(item.columns()).1) - 1;
    assert!(item.fully_upgraded());
    character.earn_due();
    assert!(!character.keeps_emblem("gilded"), "a Normal piece bought whole");
    let legendary = &mut character.items.get_mut(&id).expect("kept").0;
    legendary.rarity = crate::rarity::Rarity::Legendary;
    legendary.bought = (1_u32 << crate::grid::node_offsets(legendary.columns()).1) - 1;
    assert!(legendary.fully_upgraded());
    character.earn_due();
    assert!(character.keeps_emblem("gilded"));
}

#[test]
fn an_emblem_is_worn_only_once_kept() {
    let mut character = Character::starting();
    let captain = number_of("captain").expect("in the catalogue");
    let wear = Ask::WearEmblem { emblem: captain };
    assert_eq!(character.ask(wear, Here::default(), &DICE), Err(Refusal::NotKept));
    assert_eq!(character.ask(Ask::WearEmblem { emblem: 999 }, Here::default(), &DICE), Err(Refusal::NoSuchEmblem));
    character.earn_xp(u32::MAX, None);
    assert!(character.ask(wear, Here::default(), &DICE).is_ok(), "worn anywhere");
    assert_eq!(character.emblem, "captain");
}

#[test]
fn the_tailor_sells_the_days_emblems_at_the_counter_from_their_level_for_aurem() {
    let today = sold_on(AT_TAILOR.day);
    assert_eq!(today.len(), SOLD_A_DAY);
    assert_eq!(today, sold_on(AT_TAILOR.day), "the same for everyone that day");
    assert_ne!(today, sold_on(AT_TAILOR.day + 1), "another the next");
    let unsold = (0..emblems().len()).filter_map(|at| u16::try_from(at).ok()).find(|at| !today.contains(at));
    let mut character = Character::starting();
    let first = today[0];
    let buy = Ask::BuyEmblem { emblem: first };
    assert_eq!(character.ask(buy, Here { social: false, ..AT_TAILOR }, &DICE), Err(Refusal::NotHere));
    let not_today = Ask::BuyEmblem { emblem: unsold.expect("one not sold today") };
    assert_eq!(character.ask(not_today, AT_TAILOR, &DICE), Err(Refusal::NotSold));
    let Source::Sold { aurem, level } = emblems()[usize::from(first)].source else { panic!("sold") };
    if level > 1 {
        assert_eq!(character.ask(buy, AT_TAILOR, &DICE), Err(Refusal::TooLow));
    }
    character.earn_xp(u32::MAX, None);
    assert_eq!(character.ask(buy, AT_TAILOR, &DICE), Err(Refusal::Short));
    character.materials.aurem = aurem + 7;
    assert!(character.ask(buy, AT_TAILOR, &DICE).is_ok());
    assert_eq!(character.materials.aurem, 7);
    assert!(character.keeps_emblem(&emblems()[usize::from(first)].id));
    assert_eq!(character.ask(buy, AT_TAILOR, &DICE), Err(Refusal::Kept));
}

#[test]
fn a_character_kept_before_emblems_reads_with_the_starting_one_and_its_levels() {
    let mut character = Character::starting();
    character.earn_xp(u32::MAX, None);
    let mut kept: serde_json::Value = serde_json::from_str(&character.to_json()).expect("json");
    let object = kept.as_object_mut().expect("an object");
    object.remove("emblems");
    object.insert("emblem".to_owned(), serde_json::Value::String("no_such".to_owned()));
    let read = Character::from_json(&kept.to_string()).expect("read");
    assert_eq!(read.emblem, starting(), "an emblem it does not keep is not worn");
    assert!(read.keeps_emblem("captain"));
}

#[test]
fn a_kept_character_carries_what_others_see_and_reads_back_past_it() {
    let mut character = Character::kitted();
    character.earn_xp(u32::MAX, None);
    let kept = character.to_json();
    let shown: serde_json::Value = serde_json::from_str(&kept).expect("json");
    assert_eq!(shown["shown"]["level"], serde_json::json!(character.level()));
    assert_eq!(shown["shown"]["emblem"], serde_json::json!(starting()));
    assert_eq!(shown["shown"]["worn"].as_array().map(Vec::len), Some(5), "the sword and four armour pieces");
    assert_eq!(Character::from_json(&kept).expect("read").to_json(), kept);
}
