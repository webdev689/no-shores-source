//! The welcome to Overlook in the rules: a new character arrives with nothing, the smiths' starter stock is sold at
//! the buyer's level for its price, a ware bought and a piece worn each meet their goals, and the stranger, heard
//! once, gives nothing: the keepers on the round give the gifts (`gifts_tests.rs`).

use crate::asks::{Ask, Here, Refusal};
use crate::character::Character;
use crate::dice::Dice;
use crate::kinds::{Kind, Slot};
use crate::quests::{Event, Goal, GoalDef, keeper_key, quests};
use crate::rarity::Rarity;
use crate::vendor::{self, STARTER_PRICE, Vendor, WARES};

const SOCIAL: Here = Here { social: true, day: 4, pledge: 0, rank: 0, week: 0 };
const AFIELD: Here = Here { social: false, day: 4, pledge: 0, rank: 0, week: 0 };
const DICE: Dice = Dice { seed: 3, tick: 1, player: 1 };

fn goal(text: &str) -> GoalDef {
    serde_json::from_str(text).expect("a goal")
}

/// The number ask 64 sends for a keeper's key.
fn keeper(key: &str) -> u8 {
    (1..=u8::MAX).find(|number| keeper_key(*number) == Some(key)).expect("a keeper")
}

/// The ware number of a smith's starter piece of a kind.
fn starter(vendor: Vendor, kind: Kind, level: u8) -> u8 {
    let stock = vendor::stock(vendor, SOCIAL.day, level);
    let at = stock.iter().position(|item| item.kind == kind && item.rarity == Rarity::Normal).expect("sold");
    u8::try_from(at).expect("a ware number")
}

#[test]
fn each_smith_sells_a_starter_stock_beside_the_days_wares_normal_at_the_buyers_level() {
    let kinds = |vendor, level| -> Vec<(Kind, Rarity, u8)> {
        let stock = vendor::stock(vendor, 4, level);
        assert_eq!(stock[..WARES], vendor::wares(vendor, 4, level)[..], "the day's wares first, as numbered before");
        stock[WARES..].iter().map(|item| (item.kind, item.rarity, item.level)).collect()
    };
    let normal = |kind| (kind, Rarity::Normal, 7);
    assert_eq!(kinds(Vendor::Armorsmith, 7), [Kind::Head, Kind::Torso, Kind::Arms, Kind::Legs].map(normal));
    let weapons: Vec<_> = Vendor::Weaponsmith.starter_kinds().iter().map(|kind| normal(*kind)).collect();
    assert_eq!(kinds(Vendor::Weaponsmith, 7), weapons);
    assert_eq!(weapons.len(), 18, "every Melee loadout and every Ranged one");
    assert!(kinds(Vendor::Shipwright, 7).is_empty(), "the Shipwright keeps no starter stock");
    assert_eq!(STARTER_PRICE, 50);
}

#[test]
fn a_starter_piece_is_bought_for_its_price_and_carried() {
    let mut character = Character::starting();
    character.materials.aurem = 120;
    let sword = starter(Vendor::Weaponsmith, Kind::SwordAndShield, character.level());
    let ask = Ask::Vend { vendor: Vendor::Weaponsmith, ware: sword, day: 4 };
    assert_eq!(character.ask(ask, AFIELD, &DICE), Err(Refusal::NotHere));
    assert!(character.ask(ask, SOCIAL, &DICE).is_ok());
    assert_eq!(character.materials.aurem, 70, "50 Aurem a piece");
    assert!(character.items.values().any(|(item, _)| item.kind == Kind::SwordAndShield), "carried");
    character.materials.aurem = 49;
    assert_eq!(character.ask(ask, SOCIAL, &DICE), Err(Refusal::Short));
}

#[test]
fn a_ware_bought_meets_its_slots_goal_and_a_piece_worn_its_own() {
    let buy = goal(r#"{ "kind": "buy", "slot": "melee", "text": "t" }"#);
    let wear = goal(r#"{ "kind": "wear", "slot": "head", "text": "t" }"#);
    assert!(buy.met_by(&Event::Bought(Slot::Melee)) && !buy.met_by(&Event::Bought(Slot::Ranged)));
    assert!(!buy.met_by(&Event::Worn(Slot::Melee)));
    assert!(wear.met_by(&Event::Worn(Slot::Head)) && !wear.met_by(&Event::Worn(Slot::Torso)));
    assert!(!wear.met_by(&Event::Bought(Slot::Head)));
    assert!(matches!(buy.goal, Goal::Buy(_)) && matches!(wear.goal, Goal::Wear(_)));
}

/// The opening's tasks in turn, by id.
fn opening_tasks() -> Vec<&'static str> {
    let opening = quests().quests.iter().find(|quest| quest.faction == 0).expect("the opening");
    opening.tasks.iter().map(|task| task.id.as_str()).collect()
}

#[test]
fn the_opening_hears_the_stranger_walks_round_rides_takes_its_ship_sails_dresses_uses_its_gifts_then_hears_the_houses()
{
    assert_eq!(
        opening_tasks(),
        [
            "hear-the-stranger",
            "find-your-way",
            "ride-the-bay",
            "your-ship",
            "learn-the-helm",
            "bring-it-home",
            "wear-them",
            "use-your-gifts",
            "hear-three-houses",
            "choose-house"
        ]
    );
    let opening = quests().quests.iter().find(|quest| quest.faction == 0).expect("the opening");
    let talks = |task: usize| -> Vec<(&str, Option<&str>)> {
        let goals = opening.tasks[task].goals.iter();
        goals
            .filter_map(|goal| match &goal.goal {
                Goal::Talk(talk) => Some((talk.to.as_str(), goal.scene.as_deref())),
                _ => None,
            })
            .collect()
    };
    assert_eq!(talks(0), [("stranger", None)]);
    let counters: Vec<&str> = talks(1).iter().map(|(to, _)| *to).collect();
    assert_eq!(counters, ["weaponsmith", "armorsmith", "mage", "vault", "tailor", "tack", "mail"]);
    assert!(talks(1).iter().all(|(_, scene)| scene.is_some()), "each keeper says what their counter is for");
    assert_eq!(talks(3), [("harbourmaster", Some("roundHarbour"))], "then the Harbourmaster, alone");
    assert!(opening.tasks[3].reward.ship && opening.tasks.iter().filter(|task| task.reward.ship).count() == 1);
    assert_eq!(opening.tasks[0].reward.aurem, 0, "the stranger gives no Aurem");
}

/// The ask that has a word with a keeper: Acquire where they offer the quest walked, as the round's first word is.
fn word(character: &Character, key: &str) -> Ask {
    let keeper = keeper(key);
    if character.quest_offered() == Some(keeper) { Ask::Acquire { keeper } } else { Ask::Speak { keeper } }
}

/// A new character in Overlook: the stranger heard.
fn welcomed() -> Character {
    let mut character = Character::starting();
    assert!(character.ask(word(&character, "stranger"), SOCIAL, &DICE).is_ok());
    character
}

#[test]
fn the_stranger_is_heard_once_and_gives_no_aurem() {
    let mut character = Character::starting();
    assert_eq!(character.materials.aurem, 0);
    assert_eq!(character.ask(Ask::Speak { keeper: keeper("stranger") }, AFIELD, &DICE), Err(Refusal::NotHere));
    let mut character = welcomed();
    assert_eq!(character.materials.aurem, 0);
    // A second hearing finds her task done.
    let again = character.ask(word(&character, "stranger"), SOCIAL, &DICE);
    assert_eq!(again, Err(Refusal::NothingToSay));
    assert_eq!(character.materials.aurem, 0);
    // Kept and read back as a room reads a character that joins, she is heard already.
    let mut kept = Character::from_json(&character.to_json()).expect("read");
    assert_eq!(kept.ask(Ask::Speak { keeper: keeper("stranger") }, SOCIAL, &DICE), Err(Refusal::NothingToSay));
}

#[test]
fn the_tack_gives_the_bay_worn_on_the_round_once_and_never_a_second_and_the_stranger_none() {
    let horses = |character: &Character| character.items.values().filter(|(item, _)| item.kind == Kind::Horse).count();
    let mut character = welcomed();
    assert_eq!(horses(&character), 0, "the stranger gives nothing");
    assert!(!character.may_ride());
    let opening = quests().quests.iter().find(|quest| quest.faction == 0).expect("the opening");
    let tack = opening.tasks[1].goals.iter().find(|goal| matches!(&goal.goal, Goal::Talk(talk) if talk.to == "tack"));
    assert!(tack.is_some_and(|goal| goal.reward.horse), "the round's Tack gives the horse");
    assert!(!opening.tasks[0].reward.horse, "her task gives none");
    assert!(character.ask(word(&character, "weaponsmith"), SOCIAL, &DICE).is_ok(), "the round acquired");
    assert!(character.ask(word(&character, "tack"), SOCIAL, &DICE).is_ok());
    assert!(character.may_ride(), "the Bay worn in the Mount slot as she is spoken with");
    assert_eq!(character.coat_worn(), Some(crate::horses::FIRST_HORSE));
    assert_eq!((horses(&character), character.materials.aurem), (1, 0), "given, not sold");
    // Spoken with again, she has nothing more to give.
    let again = character.ask(word(&character, "tack"), SOCIAL, &DICE);
    assert_eq!(again, Err(Refusal::NothingToSay));
    assert_eq!(horses(&character), 1);
    // One who keeps a Bay already (a save that rode one) is given none: one horse of each coat.
    let mut riding = welcomed();
    riding.give_horse(crate::horses::FIRST_HORSE, false);
    assert!(riding.ask(word(&riding, "weaponsmith"), SOCIAL, &DICE).is_ok());
    assert!(riding.ask(word(&riding, "tack"), SOCIAL, &DICE).is_ok());
    assert_eq!(horses(&riding), 1, "no second Bay");
}

#[test]
fn one_who_pledged_before_the_round_reached_the_tack_takes_the_bay_from_her_for_nothing_once() {
    let horses = |character: &Character| character.items.values().filter(|(item, _)| item.kind == Kind::Horse).count();
    let bay = crate::cosmetics::number_of(crate::horses::FIRST_HORSE).expect("the Bay");
    let buy = Ask::BuyCosmetic { cosmetic: bay };
    // On the round, the Bay is sold at its price, as every day; the Tack's goal gives it for nothing.
    let mut walking = welcomed();
    walking.materials.aurem = 0;
    assert_eq!(walking.ask(buy, SOCIAL, &DICE), Err(Refusal::Short));
    // Pledged first, the round's Tack is never reached: she gives the Bay for nothing instead, worn.
    let mut pledged = welcomed();
    assert!(pledged.ask(Ask::Pledge { faction: 1 }, SOCIAL, &DICE).is_ok());
    assert_eq!(pledged.ask(Ask::Speak { keeper: keeper("tack") }, SOCIAL, &DICE), Err(Refusal::NothingToSay));
    let aurem = pledged.materials.aurem;
    assert!(pledged.ask(buy, SOCIAL, &DICE).is_ok());
    assert!(pledged.may_ride(), "worn, as she gives it on the round");
    assert_eq!((horses(&pledged), pledged.materials.aurem), (1, aurem), "given, not sold");
    assert_eq!(pledged.ask(buy, SOCIAL, &DICE), Err(Refusal::Kept), "once: a horse is never dismantled");
}

#[test]
fn a_goal_gives_aurem_the_horse_or_a_gift_and_nothing_of_a_house_s_nor_the_ship() {
    let given = goal(r#"{ "kind": "talk", "to": "tack", "text": "t", "reward": { "horse": true, "aurem": 5 } }"#);
    assert!(given.reward.horse && given.reward.aurem == 5 && given.problem().is_none());
    let gift = goal(r#"{ "kind": "talk", "to": "mage", "text": "t", "reward": { "gift": "vestige" } }"#);
    assert!(gift.reward.gift == Some(crate::gifts::Gift::Vestige) && gift.problem().is_none());
    let unknown: Result<GoalDef, _> =
        serde_json::from_str(r#"{ "kind": "talk", "to": "mage", "text": "t", "reward": { "gift": "a-sword" } }"#);
    assert!(unknown.is_err(), "a gift none of the keepers gives");
    assert!(goal(r#"{ "kind": "talk", "to": "tack", "text": "t" }"#).reward == crate::quests::RewardDef::default());
    for house in [r#"{ "art": true }"#, r#"{ "tenet": 1 }"#, r#"{ "fragments": 1 }"#, r#"{ "ship": true }"#] {
        let text = format!(r#"{{ "kind": "talk", "to": "tack", "text": "t", "reward": {house} }}"#);
        assert!(goal(&text).problem().is_some(), "{house}");
    }
}

#[test]
fn a_character_already_on_the_houses_is_not_walked_round_again() {
    let mut character = Character::starting();
    let opening = quests().quests.iter().position(|quest| quest.faction == 0).expect("the opening");
    let houses = quests().quests[opening].tasks.iter().position(|task| task.id == "hear-three-houses").expect("there");
    character.quests.set_task(opening, houses);
    let mut kept = Character::from_json(&character.to_json()).expect("read");
    assert_eq!(kept.quest_now(), Some((opening, houses)));
    assert_eq!(kept.ask(Ask::Speak { keeper: keeper("stranger") }, SOCIAL, &DICE), Err(Refusal::NothingToSay));
    assert_eq!(kept.materials.aurem, 0, "no gift past her task");
}

#[test]
fn a_character_kept_on_an_opening_task_this_room_does_not_know_reads_on_the_houses_owed_no_gift() {
    // As a later room might keep it, then a room of this build read it: a task past the stranger's it never had.
    let mut kept = serde_json::to_value(welcomed()).expect("kept");
    let opening = quests().quests.iter().find(|quest| quest.faction == 0).expect("the opening");
    kept["quests"]["roads"][&opening.id]["task"] = serde_json::json!("a-later-task");
    let mut read = Character::from_json(&kept.to_string()).expect("read");
    let task = read.quest_now().map(|(quest, task)| quests().quests[quest].tasks[task].id.as_str());
    assert_eq!(task, Some("hear-three-houses"), "read as one kept before the round");
    assert_eq!(read.ask(Ask::Speak { keeper: keeper("stranger") }, SOCIAL, &DICE), Err(Refusal::NothingToSay));
    assert!(read.quests.gifts.is_empty() && read.quests.free.is_empty(), "past the round: owed nothing");
}

#[test]
fn a_character_kept_before_the_quest_log_reads_on_the_houses_with_no_gift_and_a_new_one_on_the_stranger() {
    let task = |character: &Character| {
        character.quest_now().map(|(quest, task)| quests().quests[quest].tasks[task].id.clone())
    };
    assert_eq!(task(&Character::starting()).as_deref(), Some("hear-the-stranger"), "a new character");
    for log in [Some(serde_json::json!({ "roads": {} })), None] {
        let mut kept = serde_json::to_value(Character::starting()).expect("kept");
        let object = kept.as_object_mut().expect("an object");
        match log {
            Some(log) => object.insert("quests".to_owned(), log),
            None => object.remove("quests"),
        };
        let mut read = Character::from_json(&kept.to_string()).expect("read as a room reads it");
        assert_eq!(task(&read).as_deref(), Some("hear-three-houses"), "kept before: {:?}", object_keys(&read));
        let refused = read.ask(Ask::Speak { keeper: keeper("stranger") }, SOCIAL, &DICE);
        assert_eq!(refused, Err(Refusal::NothingToSay));
        assert_eq!(read.materials.aurem, 0, "no gift");
    }
}

fn object_keys(character: &Character) -> Vec<String> {
    character.quests.roads.keys().cloned().collect()
}

#[test]
fn plain_clothes_worn_meet_no_goal_to_put_armour_on_and_the_gifts_worn_do() {
    let mut character = Character::starting();
    character.story.prologue = false;
    assert!(character.ask(Ask::FinishPrologue, SOCIAL, &DICE).is_ok());
    assert!(character.worn(Slot::Torso).is_some_and(|item| item.plain), "dressed in plain clothes");
    assert!(character.worn(Slot::Legs).is_some_and(|item| item.plain));
    assert!(character.ask(word(&character, "stranger"), SOCIAL, &DICE).is_ok());
    for key in ["weaponsmith", "armorsmith", "mage", "vault", "tailor", "tack", "mail"] {
        assert!(character.ask(word(&character, key), SOCIAL, &DICE).is_ok(), "{key}");
    }
    character.ride_the_lesson();
    assert!(character.ask(word(&character, "harbourmaster"), SOCIAL, &DICE).is_ok());
    character.sail_the_lesson();
    // The lessons send the player out, so each pays a mission's clear; the weapons cost nothing of it.
    let (level, paid) = (character.level(), character.materials.aurem);
    for kind in [Kind::SwordAndShield, Kind::Bow] {
        let ware = starter(Vendor::Weaponsmith, kind, level);
        assert!(character.ask(Ask::Vend { vendor: Vendor::Weaponsmith, ware, day: 4 }, SOCIAL, &DICE).is_ok());
    }
    assert_eq!(character.materials.aurem, paid, "the Weaponsmith's gift, chosen free");
    let task = |character: &Character| {
        character.quest_now().map(|(quest, task)| quests().quests[quest].tasks[task].id.as_str())
    };
    assert_eq!(task(&character), Some("wear-them"));
    assert!(character.quest_counts().iter().all(|count| *count == 0), "the plain shirt and breeches count for none");
    let given: Vec<(u32, Slot)> = character
        .items
        .values()
        .filter(|(item, at)| !item.plain && *at == crate::character::At::Carried && item.kind != Kind::Horse)
        .map(|(item, _)| (item.id, item.kind.slot()))
        .collect();
    assert_eq!(given.len(), 6, "two weapons and four armour pieces");
    for (item, slot) in given {
        assert!(character.ask(Ask::Wear { item, slot }, SOCIAL, &DICE).is_ok());
    }
    assert_eq!(task(&character), Some("use-your-gifts"));
}

#[test]
fn pieces_put_on_during_the_round_dress_the_player_as_its_last_keeper_is_heard() {
    let mut character = welcomed();
    for key in ["weaponsmith", "armorsmith"] {
        assert!(character.ask(word(&character, key), SOCIAL, &DICE).is_ok(), "{key}");
    }
    let level = character.level();
    for kind in [Kind::Warhammer, Kind::DoublePistolet] {
        let ware = starter(Vendor::Weaponsmith, kind, level);
        assert!(character.ask(Ask::Vend { vendor: Vendor::Weaponsmith, ware, day: 4 }, SOCIAL, &DICE).is_ok());
    }
    let pieces: Vec<(u32, Slot)> = character.items.values().map(|(item, _)| (item.id, item.kind.slot())).collect();
    for (item, slot) in pieces {
        assert!(character.ask(Ask::Wear { item, slot }, SOCIAL, &DICE).is_ok());
    }
    for key in ["mage", "vault", "tailor", "tack", "mail"] {
        assert!(character.ask(word(&character, key), SOCIAL, &DICE).is_ok(), "{key}");
    }
    character.ride_the_lesson();
    assert!(character.ask(word(&character, "harbourmaster"), SOCIAL, &DICE).is_ok());
    character.sail_the_lesson();
    let task = character.quest_now().map(|(quest, task)| quests().quests[quest].tasks[task].id.as_str());
    assert_eq!(task, Some("use-your-gifts"), "dressed by the pieces already worn");
}

#[test]
fn the_lessons_hold_no_save_back_and_stop_no_pledge() {
    let opening = quests().quests.iter().position(|quest| quest.faction == 0).expect("the opening");
    let at = |id: &str| quests().quests[opening].tasks.iter().position(|task| task.id == id).expect("a task");
    let task = |character: &Character| {
        character.quest_now().map(|(quest, task)| quests().quests[quest].tasks[task].id.as_str())
    };
    // A save on the Harbourmaster's task or later keeps its place by its task's id, never sent back to a lesson.
    for past in ["your-ship", "wear-them", "hear-three-houses"] {
        let mut character = welcomed();
        character.quests.set_task(opening, at(past));
        let read = Character::from_json(&character.to_json()).expect("read");
        assert_eq!(task(&read), Some(past), "{past} is not sent back to a lesson");
    }
    // One on the round rides once it is done, and takes the ship once the ride is.
    let mut character = welcomed();
    for key in ["weaponsmith", "armorsmith", "mage", "vault", "tailor", "tack", "mail"] {
        assert!(character.ask(word(&character, key), SOCIAL, &DICE).is_ok(), "{key}");
    }
    assert_eq!(task(&character), Some("ride-the-bay"));
    let early = character.ask(Ask::Speak { keeper: keeper("harbourmaster") }, SOCIAL, &DICE);
    assert_eq!(early, Err(Refusal::NothingToSay), "the ship waits for the ride");
    character.ride_the_lesson();
    assert_eq!(task(&character), Some("your-ship"));
    assert!(character.ask(word(&character, "harbourmaster"), SOCIAL, &DICE).is_ok());
    assert_eq!(task(&character), Some("learn-the-helm"));
    // A pledge midway through a lesson is taken: the houses' roads are walked from then on.
    assert!(character.ask(Ask::Pledge { faction: 1 }, SOCIAL, &DICE).is_ok());
    assert!(character.quest_now().is_some_and(|(quest, _)| quest != opening));
}
