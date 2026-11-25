//! The Harbourmaster's ships in the rules: the shipyard and the dresses read whole, a new player keeps no ship until
//! the welcome's Harbourmaster hands over the Sloop, a save from before fleets keeps it, and each ask of the
//! Harbourmaster's is refused whole or done whole.

use super::super::fleet::{Fleet, KeptShip, NO_WORD, Part, SLOOP, built, dress_number, dresses, shipyard};
use super::ShipAsk;
use crate::asks::{Ask, Here, Refusal};
use crate::character::Character;
use crate::dice::Dice;
use crate::emblems::Source;
use crate::kinds::Slot;

const AT_COUNTER: Here = Here { social: true, day: 4, pledge: 0, rank: 0, week: 0 };
const DICE: Dice = Dice { seed: 3, tick: 1, player: 1 };
const SCHOONER: u8 = 1;
const BRIG: u8 = 2;
const FRIGATE: u8 = 3;

fn ask(character: &mut Character, asked: ShipAsk) -> Result<(), Refusal> {
    character.ask(Ask::Ship(asked), AT_COUNTER, &DICE).map(|_| ())
}

/// A player who keeps the Sloop, its ship at `level` by its experience (20 at most), as rich as a player may be in
/// Aurem and every ship material.
fn captain(level: u8) -> Character {
    let mut character = Character::starting();
    assert!(character.give_first_ship());
    character.ship_xp = (1..=u64::MAX).step_by(500).find(|xp| crate::power::level(*xp, 0) >= level).expect("a level");
    character.materials.aurem = crate::character::AUREM_MOST;
    let most = crate::character::STOCK_MOST;
    character.materials.ship =
        super::super::materials::ShipStock { timber: most, canvas: most, iron: most, heartwood: most };
    character
}

#[test]
fn the_shipyard_reads_whole_its_first_hull_given_and_the_rest_dearer_and_later() {
    let hulls = &shipyard().hulls;
    let keys: Vec<&str> = hulls.iter().map(|found| found.hull.as_str()).collect();
    assert_eq!(keys, ["sloop", "schooner", "brig", "frigate"], "sailing's hulls in their order");
    assert!(hulls[0].given && hulls[1..].iter().all(|found| !found.given));
    for pair in hulls[1..].windows(2) {
        assert!(
            pair[1].aurem > pair[0].aurem && pair[1].level > pair[0].level,
            "{} after {}",
            pair[1].hull,
            pair[0].hull
        );
    }
    let most = crate::character::STOCK_MOST;
    for found in hulls {
        assert!(found.aurem <= crate::character::AUREM_MOST, "{} costs no more than may be held", found.hull);
        assert!([found.timber, found.canvas, found.iron, found.heartwood].iter().all(|count| *count <= most));
    }
    for list in [&shipyard().first, &shipyard().second] {
        assert!(!list.is_empty() && list.len() < usize::from(NO_WORD));
        let mut words: Vec<&String> = list.iter().collect();
        words.sort_unstable();
        words.dedup();
        assert_eq!(words.len(), list.len(), "no word twice");
    }
}

#[test]
fn the_dresses_read_whole_with_one_start_a_part_and_a_price_on_every_one_sold() {
    for part in Part::ALL {
        let starts = dresses().iter().filter(|found| found.part == part && found.source == Source::Start).count();
        assert_eq!(starts, 1, "{part:?}");
        assert!(!built(part).is_empty());
    }
    let mut ids: Vec<&str> = dresses().iter().map(|found| found.id.as_str()).collect();
    ids.sort_unstable();
    ids.dedup();
    assert_eq!(ids.len(), dresses().len(), "no id twice");
    for found in dresses() {
        assert!(
            matches!(found.source, Source::Start | Source::Sold { aurem: 1.., .. } | Source::Faction { .. }),
            "{}: {:?}",
            found.id,
            found.source
        );
    }
}

#[test]
fn a_new_player_keeps_no_ship_and_no_modules_until_the_harbourmaster_hands_over_the_sloop() {
    let mut character = Character::starting();
    assert!(!character.has_ship() && character.sailed_hull().is_none());
    assert_eq!(character.all_fitted().count(), 0, "no modules for a ship not kept");
    assert!(character.give_first_ship());
    assert_eq!(character.sailed_hull(), Some(SLOOP));
    assert_eq!(character.all_fitted().count(), 4, "the Sloop's plain modules");
    assert!(!character.give_first_ship(), "never a second");
    let kept = Character::from_json(&character.to_json()).expect("read");
    assert_eq!(kept.fleet, character.fleet);
    assert_eq!(kept.all_fitted().count(), 4);
}

#[test]
fn a_module_worn_before_the_sloop_is_handed_over_keeps_its_slot_and_the_others_are_fitted_plain() {
    let mut character = Character::starting();
    let id = 900;
    let bought = crate::item::Item::new(id, crate::kinds::Kind::Sails, crate::rarity::Rarity::Rare, 3, Slot::Sails);
    character.items.insert(id, (bought, crate::character::At::Worn(Slot::Sails)));
    assert!(character.give_first_ship());
    assert_eq!(character.worn(Slot::Sails).map(|item| item.id), Some(id));
    assert_eq!(character.all_fitted().count(), 4, "one in each slot, never two");
}

#[test]
fn a_save_from_before_fleets_keeps_and_sails_the_sloop() {
    let mut kept = serde_json::to_value(Character::starting()).expect("kept");
    kept.as_object_mut().expect("an object").remove("fleet");
    let read = Character::from_json(&kept.to_string()).expect("read");
    assert_eq!(read.fleet, Fleet::kept_before());
    assert_eq!(read.sailed_hull(), Some(SLOOP));
    assert_eq!(read.all_fitted().count(), 4, "fitted as every kept ship was");
}

#[test]
fn a_save_holding_a_hull_twice_one_the_yard_lacks_or_sailing_one_not_kept_is_read_whole() {
    let mut character = captain(1);
    character.fleet.ships = vec![KeptShip::new(BRIG), KeptShip::new(SLOOP), KeptShip::new(BRIG), KeptShip::new(9)];
    character.fleet.sailed = FRIGATE;
    let read = Character::from_json(&character.to_json()).expect("read");
    let hulls: Vec<u8> = read.fleet.ships.iter().map(|ship| ship.hull).collect();
    assert_eq!(hulls, [SLOOP, BRIG]);
    assert_eq!(read.sailed_hull(), Some(SLOOP), "the first kept, for one not kept");
}

#[test]
fn a_hull_is_bought_at_its_level_for_its_aurem_and_materials_and_sailed_from_then_on() {
    let mut character = captain(7);
    let before = character.clone();
    let afield = Here { social: false, ..AT_COUNTER };
    assert_eq!(character.ask(Ask::Ship(ShipAsk::Buy { hull: SCHOONER }), afield, &DICE), Err(Refusal::NotHere));
    assert_eq!(ask(&mut character, ShipAsk::Buy { hull: SLOOP }), Err(Refusal::NotSold), "the Sloop is given");
    assert_eq!(ask(&mut character, ShipAsk::Buy { hull: 4 }), Err(Refusal::NoSuchShip));
    assert_eq!(ask(&mut character, ShipAsk::Buy { hull: BRIG }), Err(Refusal::TooLow), "the Brig from 13");
    assert_eq!(character, before, "a refusal changes nothing");
    assert!(ask(&mut character, ShipAsk::Buy { hull: SCHOONER }).is_ok());
    let schooner = &shipyard().hulls[usize::from(SCHOONER)];
    assert_eq!(character.materials.aurem, before.materials.aurem - schooner.aurem);
    assert_eq!(character.materials.ship.timber, before.materials.ship.timber - schooner.timber);
    assert_eq!(character.materials.ship.canvas, before.materials.ship.canvas - schooner.canvas);
    assert_eq!(character.materials.ship.iron, before.materials.ship.iron - schooner.iron);
    assert_eq!(character.sailed_hull(), Some(SCHOONER), "sailed once bought");
    assert!(character.fleet.kept(SLOOP).is_some(), "the Sloop kept at the harbour");
    assert_eq!(ask(&mut character, ShipAsk::Buy { hull: SCHOONER }), Err(Refusal::Kept));
    assert_eq!(character.all_fitted().count(), 4, "the ship's modules go with whatever hull it sails");
}

#[test]
fn a_hull_is_refused_to_one_short_of_any_price_or_who_keeps_no_ship() {
    let mut poor = captain(20);
    poor.materials.ship.heartwood = shipyard().hulls[usize::from(FRIGATE)].heartwood - 1;
    assert_eq!(ask(&mut poor, ShipAsk::Buy { hull: FRIGATE }), Err(Refusal::Short), "a Heartwood short");
    poor.materials.ship.heartwood = crate::character::STOCK_MOST;
    poor.materials.aurem = shipyard().hulls[usize::from(FRIGATE)].aurem - 1;
    assert_eq!(ask(&mut poor, ShipAsk::Buy { hull: FRIGATE }), Err(Refusal::Short), "an Aurem short");
    let mut shipless = Character::starting();
    shipless.materials.aurem = crate::character::AUREM_MOST;
    assert_eq!(ask(&mut shipless, ShipAsk::Buy { hull: SCHOONER }), Err(Refusal::NoShip));
}

#[test]
fn a_ship_kept_is_sailed_again_and_the_choice_is_kept() {
    let mut character = captain(13);
    assert_eq!(ask(&mut character, ShipAsk::Sail { hull: SLOOP }), Err(Refusal::Sailed));
    assert_eq!(ask(&mut character, ShipAsk::Sail { hull: BRIG }), Err(Refusal::NoShip), "not kept");
    assert_eq!(ask(&mut character, ShipAsk::Sail { hull: 7 }), Err(Refusal::NoSuchShip));
    assert!(ask(&mut character, ShipAsk::Buy { hull: BRIG }).is_ok());
    assert!(ask(&mut character, ShipAsk::Sail { hull: SLOOP }).is_ok());
    let kept = Character::from_json(&character.to_json()).expect("read");
    assert_eq!(kept.sailed_hull(), Some(SLOOP));
}

#[test]
fn a_dress_is_bought_once_at_its_level_and_laid_on_its_part_of_any_ship_kept() {
    let mut character = captain(1);
    let number = |id: &str| dress_number(id).expect("a dress");
    let blue = number("harbour_blue");
    assert_eq!(ask(&mut character, ShipAsk::Dress { hull: SLOOP, dress: blue }), Err(Refusal::NotKept));
    assert_eq!(ask(&mut character, ShipAsk::BuyDress { dress: number("bone") }), Err(Refusal::TooLow), "from 5");
    assert_eq!(ask(&mut character, ShipAsk::BuyDress { dress: number("bare_timber") }), Err(Refusal::NotSold));
    assert_eq!(ask(&mut character, ShipAsk::BuyDress { dress: number("storm_flag") }), Err(Refusal::NotSold));
    assert_eq!(ask(&mut character, ShipAsk::BuyDress { dress: u16::MAX }), Err(Refusal::NoSuchDress));
    let aurem = character.materials.aurem;
    assert!(ask(&mut character, ShipAsk::BuyDress { dress: blue }).is_ok());
    assert_eq!(character.materials.aurem, aurem - 1000);
    assert_eq!(ask(&mut character, ShipAsk::BuyDress { dress: blue }), Err(Refusal::Kept));
    assert!(ask(&mut character, ShipAsk::Dress { hull: SLOOP, dress: blue }).is_ok());
    assert_eq!(ask(&mut character, ShipAsk::Dress { hull: BRIG, dress: blue }), Err(Refusal::NoShip));
    let sloop = character.fleet.kept(SLOOP).expect("kept");
    assert_eq!((sloop.dress.paint.as_str(), sloop.dress.canvas.as_str()), ("harbour_blue", built(Part::Canvas)));
    assert_eq!(sloop.dress.numbers()[0], blue);
    // Laid back as built, its part's start entry kept by everyone.
    assert!(ask(&mut character, ShipAsk::Dress { hull: SLOOP, dress: number("bare_timber") }).is_ok());
    let kept = Character::from_json(&character.to_json()).expect("read");
    assert_eq!(kept.fleet, character.fleet);
}

#[test]
fn a_factions_dress_is_kept_at_its_rank_and_never_sold() {
    let mut character = captain(1);
    let flag = dress_number("lamp_flag").expect("a dress");
    assert_eq!(ask(&mut character, ShipAsk::Dress { hull: SLOOP, dress: flag }), Err(Refusal::NotKept));
    character.allegiance.reputation[1] = 2 * crate::factions::factions().reputation_per_rank;
    assert!(character.keeps_dress("lamp_flag") && !character.keeps_dress("storm_flag"));
    assert!(ask(&mut character, ShipAsk::Dress { hull: SLOOP, dress: flag }).is_ok());
}

#[test]
fn a_ship_is_named_free_the_first_time_and_at_the_yards_price_after() {
    let mut character = captain(1);
    let place =
        |list: &[String], word: &str| u8::try_from(list.iter().position(|found| found == word).expect("a word"));
    let (grey, gull) =
        (place(&shipyard().first, "Grey").expect("a place"), place(&shipyard().second, "Gull").expect("a place"));
    assert_eq!(character.fleet.kept(SLOOP).and_then(KeptShip::called), None, "unnamed as built");
    let aurem = character.materials.aurem;
    let named = |first: u8, second: u8, renaming: bool| ShipAsk::Name { hull: SLOOP, first, second, renaming };
    assert!(ask(&mut character, named(grey, gull, false)).is_ok());
    assert_eq!(character.materials.aurem, aurem, "the first name is free");
    let sloop = character.fleet.kept(SLOOP).expect("kept");
    assert_eq!(sloop.called().as_deref(), Some("the Grey Gull"));
    assert_eq!(sloop.name_numbers(), [grey, gull]);
    assert_eq!(ask(&mut character, named(grey, gull, false)), Err(Refusal::Called), "the free name sent twice");
    assert_eq!(ask(&mut character, named(grey, gull, true)), Err(Refusal::Called), "no price for the name it bears");
    assert_eq!(ask(&mut character, named(NO_WORD, gull, false)), Err(Refusal::Named), "a new name is a renaming");
    assert_eq!(character.materials.aurem, aurem, "nothing paid for any of them");
    assert!(ask(&mut character, named(NO_WORD, gull, true)).is_ok());
    assert_eq!(character.materials.aurem, aurem - shipyard().renaming);
    assert_eq!(character.fleet.kept(SLOOP).and_then(KeptShip::called).as_deref(), Some("the Gull"));
    let none = u8::try_from(shipyard().second.len()).expect("a place");
    assert_eq!(ask(&mut character, named(grey, none, true)), Err(Refusal::NoSuchName));
    let brig = ShipAsk::Name { hull: BRIG, first: grey, second: gull, renaming: false };
    assert_eq!(ask(&mut character, brig), Err(Refusal::NoShip));
    character.materials.aurem = shipyard().renaming - 1;
    assert_eq!(ask(&mut character, named(grey, gull, true)), Err(Refusal::Short));
}

#[test]
fn one_past_the_harbourmasters_task_with_no_ship_is_handed_the_sloop_as_read() {
    let mut character = Character::starting();
    let opening = crate::quests::quests().quests.iter().position(|quest| quest.faction == 0).expect("the opening");
    let tasks = &crate::quests::quests().quests[opening].tasks;
    let ship = tasks.iter().position(|task| task.reward.ship).expect("a task gives the Sloop");
    character.quests.set_task(opening, ship + 1);
    let read = Character::from_json(&character.to_json()).expect("read");
    assert_eq!(read.sailed_hull(), Some(SLOOP));
    assert!(read.fitted(Slot::Guns).is_some());
}

#[test]
fn one_who_pledged_before_the_harbourmasters_task_takes_the_sloop_at_the_counter_and_no_one_else_does() {
    let mut character = Character::starting();
    assert_eq!(ask(&mut character, ShipAsk::Buy { hull: SLOOP }), Err(Refusal::NotSold), "the welcome hands it over");
    assert!(character.ask(Ask::Pledge { faction: 1 }, AT_COUNTER, &DICE).is_ok(), "a house pledged early");
    assert!(!character.has_ship(), "the opening's task is off their road, and no ship came with the pledge");
    assert!(ask(&mut character, ShipAsk::Buy { hull: SLOOP }).is_ok());
    assert_eq!(character.sailed_hull(), Some(SLOOP));
    assert_eq!(character.all_fitted().count(), 4, "fitted as the welcome's Sloop is");
    assert_eq!(ask(&mut character, ShipAsk::Buy { hull: SLOOP }), Err(Refusal::NotSold), "never a second");
}

#[test]
fn a_save_whose_fleet_cannot_be_read_is_still_read_and_its_quests_say_whether_the_sloop_is_due() {
    let fresh = Character::starting();
    let mut past = Character::starting();
    let opening = crate::quests::quests().quests.iter().position(|quest| quest.faction == 0).expect("the opening");
    let ship = crate::quests::quests().quests[opening].tasks.iter().position(|task| task.reward.ship).expect("a task");
    past.quests.set_task(opening, ship + 1);
    for broken in [
        serde_json::json!(null),
        serde_json::json!({ "ships": [{ "named": true }] }),
        serde_json::json!({ "sailed": 300 }),
    ] {
        for (character, due) in [(&fresh, false), (&past, true)] {
            let mut kept: serde_json::Value = serde_json::from_str(&character.to_json()).expect("json");
            kept["fleet"] = broken.clone();
            let read = Character::from_json(&kept.to_string()).expect("read whatever its fleet");
            assert_eq!(read.has_ship(), due, "{broken}: the Sloop only past the Harbourmaster's task");
            let written: serde_json::Value = serde_json::from_str(&read.to_json()).expect("json");
            assert_eq!(written["fleet"]["unread"], broken, "what could not be read is written back as it was");
        }
    }
}

#[test]
fn a_dress_laid_but_not_kept_or_on_another_part_is_read_as_the_parts_start() {
    let mut character = captain(1);
    let sloop = character.fleet.kept_mut(SLOOP).expect("the Sloop");
    sloop.dress.paint = "lacquer_crimson".to_owned();
    sloop.dress.flag = "harbour_blue".to_owned();
    sloop.dress.stripe = "gold_leaf".to_owned();
    character.fleet.dress.push("gold_leaf".to_owned());
    let read = Character::from_json(&character.to_json()).expect("read");
    let dress = &read.fleet.kept(SLOOP).expect("the Sloop").dress;
    assert_eq!(dress.on(Part::Paint), built(Part::Paint), "a paint never bought");
    assert_eq!(dress.on(Part::Flag), built(Part::Flag), "a paint laid as a flag");
    assert_eq!(dress.on(Part::Stripe), "gold_leaf", "a stripe bought stays");
}
