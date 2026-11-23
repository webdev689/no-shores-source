//! Horses: items worn in the Mount slot, one to each coat, bought at the Tack, never upgraded or dismantled; none for a
//! new character; and a character kept before them given a horse for each coat it kept.

use crate::asks::{Ask, Here, Refusal};
use crate::character::{At, Character};
use crate::cosmetics::{CosmeticKind, Seller, cosmetics, number_of, sold_on};
use crate::dice::Dice;
use crate::horses::{coat_of, horse};
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;

const AT_COUNTER: Here = Here { social: true, day: 20_400, pledge: 0, rank: 0, week: 0 };
const DICE: Dice = Dice { seed: 1, tick: 1, player: 1 };

/// A character carrying a horse in `coat`, and that horse's number.
fn carrying(coat: &str) -> (Character, u32) {
    let mut character = Character::starting();
    let id = character.take_id();
    character.items.insert(id, (horse(id, coat).expect("a coat"), At::Carried));
    (character, id)
}

#[test]
fn a_horse_is_an_item_of_its_own_kind_worn_in_the_mount_slot_alone() {
    let found = horse(1, "chestnut").expect("a coat");
    assert_eq!((found.kind, found.bucket, found.rarity, found.level), (Kind::Horse, Slot::Mount, Rarity::Normal, 1));
    assert_eq!(coat_of(&found).map(|coat| coat.id.as_str()), Some("chestnut"));
    assert!(horse(1, "harbour_blue").is_none(), "a dye is no hide");
    assert_eq!((found.attack(), found.defense(), found.prestige()), (None, None, 0), "no stats");
    assert!(found.columns().is_empty() && found.active_traits().next().is_none(), "no nodes, no perks");
    let (mut character, id) = carrying("chestnut");
    assert_eq!(
        character.ask(Ask::Wear { item: id, slot: Slot::Head }, Here::default(), &DICE),
        Err(Refusal::DoesNotFit)
    );
    assert_eq!(character.ask(Ask::Wear { item: id, slot: Slot::Mount }, Here::default(), &DICE).map(|_| ()), Ok(()));
    assert_eq!(character.worn(Slot::Mount).map(|worn| worn.id), Some(id));
    assert_eq!(character.coat_worn(), Some("chestnut"));
}

#[test]
fn riding_needs_a_horse_worn_in_the_mount_slot() {
    let (mut character, id) = carrying("dun");
    assert!(!character.may_ride(), "a horse carried is not ridden");
    character.ask(Ask::Wear { item: id, slot: Slot::Mount }, Here::default(), &DICE).expect("worn");
    assert!(character.may_ride());
    character.ask(Ask::TakeOff { slot: Slot::Mount }, Here::default(), &DICE).expect("taken off");
    assert!(!character.may_ride());
}

#[test]
fn a_horse_is_never_upgraded_or_dismantled_but_goes_to_the_vault() {
    let (mut character, id) = carrying("grey");
    character.materials.fruit = 1;
    assert_eq!(character.ask(Ask::Dismantle { item: id }, Here::default(), &DICE), Err(Refusal::DoesNotFit));
    assert_eq!(
        character.ask(Ask::Buy { item: id, column: 0, node: 0 }, Here::default(), &DICE),
        Err(Refusal::NoSuchNode)
    );
    assert_eq!(character.ask(Ask::Feed { item: id }, Here::default(), &DICE), Err(Refusal::FullOfXp));
    assert_eq!(character.ask(Ask::Store { item: id }, AT_COUNTER, &DICE).map(|_| ()), Ok(()));
    assert_eq!(character.at(id), Some(At::Vault));
}

#[test]
fn a_new_character_has_no_horse() {
    let character = Character::starting();
    assert!(character.items.values().all(|(item, _)| item.kind != Kind::Horse));
    assert!(!character.may_ride() && character.coat_worn().is_none());
    assert!(!character.keeps_cosmetic("bay"), "a coat is no cosmetic kept");
}

#[test]
fn the_tack_sells_horses_into_the_pack_at_their_coats_prices() {
    let day = (0..400).find(|day| {
        sold_on(Seller::Tack, *day).iter().any(|at| cosmetics()[usize::from(*at)].kind == CosmeticKind::Coat)
    });
    let here = Here { day: day.expect("a day the Tack sells a horse"), ..AT_COUNTER };
    let number = sold_on(Seller::Tack, here.day)
        .into_iter()
        .find(|at| cosmetics()[usize::from(*at)].kind == CosmeticKind::Coat)
        .expect("a horse sold");
    let coat = &cosmetics()[usize::from(number)];
    let mut character = Character::starting();
    character.xp = crate::power::xp_for_level(20);
    character.materials.aurem = 20_000;
    assert_eq!(character.ask(Ask::BuyCosmetic { cosmetic: number }, here, &DICE).map(|_| ()), Ok(()));
    let crate::emblems::Source::Sold { aurem, .. } = coat.source else { panic!("sold") };
    assert_eq!(character.materials.aurem, 20_000 - aurem);
    let bought: Vec<_> = character.items.values().filter(|(item, _)| item.kind == Kind::Horse).collect();
    assert_eq!(bought.len(), 1);
    assert_eq!(
        (coat_of(&bought[0].0).map(|found| found.id.as_str()), bought[0].1),
        (Some(coat.id.as_str()), At::Carried)
    );
    assert!(!character.keeps_cosmetic(&coat.id), "kept as a horse, not a cosmetic");
    assert_eq!(character.ask(Ask::BuyCosmetic { cosmetic: number }, here, &DICE), Err(Refusal::Kept), "one of each");
    assert_eq!(character.ask(Ask::WearCosmetic { cosmetic: number }, here, &DICE), Err(Refusal::NotKept));
}

#[test]
fn a_character_kept_before_horses_keeps_a_horse_for_each_coat_and_rides_the_one_it_wore() {
    let mut kept: serde_json::Value = serde_json::from_str(&Character::starting().to_json()).expect("json");
    kept["cosmetics"]["kept"] = serde_json::json!(["bare", "bay", "chestnut", "own_colours", "palomino"]);
    kept["cosmetics"]["coat"] = serde_json::json!("chestnut");
    let character = Character::from_json(&kept.to_string()).expect("a character");
    let horses: Vec<(&str, At)> =
        character.items.values().filter_map(|(item, at)| Some((coat_of(item)?.id.as_str(), *at))).collect();
    assert_eq!(horses.len(), 3);
    for (coat, at) in &horses {
        let worn = *coat == "chestnut";
        assert_eq!(*at, if worn { At::Worn(Slot::Mount) } else { At::Carried }, "{coat}");
    }
    assert!(character.may_ride());
    assert!(
        character
            .cosmetics
            .kept
            .iter()
            .all(|id| number_of(id).is_some_and(|at| cosmetics()[usize::from(at)].kind != CosmeticKind::Coat))
    );
    assert!(character.cosmetics.unknown.get("coat").is_none(), "the old coat key is read once and dropped");
    let again = Character::from_json(&character.to_json()).expect("read again");
    assert_eq!(again.items, character.items, "given once");
}

#[test]
fn others_see_the_coat_of_the_horse_worn() {
    let sent = r#"{"outfit":{"armour":{},"right":null,"left":null,"dyes":{}}}"#;
    let coat = |character: &Character| {
        let dressed: serde_json::Value =
            serde_json::from_str(&crate::cosmetics::dressed(sent, character).expect("dressed")).expect("json");
        dressed["outfit"].get("coat").cloned()
    };
    let (mut character, id) = carrying("black");
    assert_eq!(coat(&character), None, "no horse worn, no coat");
    character.ask(Ask::Wear { item: id, slot: Slot::Mount }, Here::default(), &DICE).expect("worn");
    assert_eq!(coat(&character), Some(serde_json::json!("black")));
}

#[test]
fn a_horse_is_not_bought_with_nine_horses_carried() {
    let (number, here) = horse_sold_today();
    let mut character = Character::starting();
    character.materials.aurem = 20_000;
    for coat in ["bay", "dun", "grey", "black", "white", "palomino", "bay", "dun", "grey"] {
        character.give_horse(coat, false);
    }
    let before = character.clone();
    assert_eq!(character.ask(Ask::BuyCosmetic { cosmetic: number }, here, &DICE), Err(Refusal::CarriedFull));
    assert_eq!(character, before, "nothing paid, nothing given");
}

#[test]
fn a_worn_coat_never_kept_still_becomes_the_horse_worn_and_a_horse_worn_already_stays() {
    let mut kept: serde_json::Value = serde_json::from_str(&Character::starting().to_json()).expect("json");
    kept["cosmetics"]["kept"] = serde_json::json!(["bay"]);
    kept["cosmetics"]["coat"] = serde_json::json!("grey");
    let character = Character::from_json(&kept.to_string()).expect("a character");
    assert_eq!(character.coat_worn(), Some("grey"));
    assert!(character.keeps_horse("bay"));
    let mut riding = Character::starting();
    riding.give_horse("dun", true);
    let mut kept: serde_json::Value = serde_json::from_str(&riding.to_json()).expect("json");
    kept["cosmetics"]["coat"] = serde_json::json!("black");
    let read = Character::from_json(&kept.to_string()).expect("a character");
    assert_eq!(read.coat_worn(), Some("dun"), "the horse worn keeps the saddle");
    assert!(read.keeps_horse("black"), "the old coat's horse is carried");
}

#[test]
fn the_bay_worn_shows_others_the_bay_as_the_page_draws_it_unnamed() {
    let sent = r#"{"outfit":{"armour":{},"right":null,"left":null,"dyes":{}}}"#;
    let (mut character, id) = carrying("bay");
    character.ask(Ask::Wear { item: id, slot: Slot::Mount }, Here::default(), &DICE).expect("worn");
    let dressed: serde_json::Value =
        serde_json::from_str(&crate::cosmetics::dressed(sent, &character).expect("dressed")).expect("json");
    assert!(dressed["outfit"].get("coat").is_none());
}

/// A coat the Tack sells on some day, and that day at its counter.
fn horse_sold_today() -> (u16, Here) {
    let coat = |at: &u16| cosmetics()[usize::from(*at)].kind == CosmeticKind::Coat;
    let day = (0..400).find(|day| sold_on(Seller::Tack, *day).iter().any(coat)).expect("a day the Tack sells a horse");
    let number = sold_on(Seller::Tack, day).into_iter().find(|at| coat(at)).expect("a horse sold");
    (number, Here { day, ..AT_COUNTER })
}
