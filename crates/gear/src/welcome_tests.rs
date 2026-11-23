//! The welcome to Overlook in the rules: a new character arrives with nothing, the smiths' starter stock is sold at
//! the buyer's level for its price, a ware bought and a piece worn each meet their goals, and the opening's first
//! task, the stranger heard, gives its Aurem once.

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
    assert_eq!(kinds(Vendor::Weaponsmith, 7), [Kind::SwordAndShield, Kind::Bow].map(normal));
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
fn the_opening_hears_the_stranger_then_walks_round_the_counters_arms_and_dresses_then_hears_the_houses() {
    assert_eq!(
        opening_tasks(),
        ["hear-the-stranger", "find-your-way", "arm-yourself", "wear-them", "hear-three-houses", "choose-house"]
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
    assert_eq!(counters, ["weaponsmith", "armorsmith", "mage", "vault", "tailor", "tack", "mail", "harbourmaster"]);
    assert!(talks(1).iter().all(|(_, scene)| scene.is_some()), "each keeper says what their counter is for");
    assert_eq!(opening.tasks[0].reward.aurem, 400, "the stranger's gift");
}

/// A new character in Overlook: the stranger heard.
fn welcomed() -> Character {
    let mut character = Character::starting();
    assert!(character.ask(Ask::Speak { keeper: keeper("stranger") }, SOCIAL, &DICE).is_ok());
    character
}

#[test]
fn the_strangers_gift_is_given_once_however_often_she_is_heard() {
    let mut character = Character::starting();
    assert_eq!(character.materials.aurem, 0);
    assert_eq!(character.ask(Ask::Speak { keeper: keeper("stranger") }, AFIELD, &DICE), Err(Refusal::NotHere));
    let mut character = welcomed();
    assert_eq!(character.materials.aurem, 400);
    // A second hearing, from a rejoin or a second tab, finds her task done.
    let again = character.ask(Ask::Speak { keeper: keeper("stranger") }, SOCIAL, &DICE);
    assert_eq!(again, Err(Refusal::NothingToSay));
    assert_eq!(character.materials.aurem, 400);
    // Kept and read back, the gift stays given.
    let kept: Character = serde_json::from_value(serde_json::to_value(&character).expect("kept")).expect("read");
    let mut kept = kept;
    assert_eq!(kept.ask(Ask::Speak { keeper: keeper("stranger") }, SOCIAL, &DICE), Err(Refusal::NothingToSay));
}

#[test]
fn the_round_of_the_counters_then_the_gift_spent_on_starter_gear_worn_reaches_the_houses() {
    let mut character = welcomed();
    for key in ["weaponsmith", "armorsmith", "mage", "vault", "tailor", "tack", "mail", "harbourmaster"] {
        assert!(character.ask(Ask::Speak { keeper: keeper(key) }, SOCIAL, &DICE).is_ok(), "{key}");
    }
    let level = character.level();
    let sword = starter(Vendor::Weaponsmith, Kind::SwordAndShield, level);
    assert!(character.ask(Ask::Vend { vendor: Vendor::Weaponsmith, ware: sword, day: 4 }, SOCIAL, &DICE).is_ok());
    // A piece worn before its task is reached counts once the task is: the last buy reaches it.
    let sword_id = character.items.iter().find(|(_, (item, _))| item.kind == Kind::SwordAndShield).map(|(id, _)| *id);
    let worn = Ask::Wear { item: sword_id.expect("bought"), slot: Slot::Melee };
    assert!(character.ask(worn, SOCIAL, &DICE).is_ok());
    for kind in [Kind::Head, Kind::Torso, Kind::Arms, Kind::Legs] {
        let ware = starter(Vendor::Armorsmith, kind, level);
        assert!(character.ask(Ask::Vend { vendor: Vendor::Armorsmith, ware, day: 4 }, SOCIAL, &DICE).is_ok());
    }
    assert_eq!(character.materials.aurem, 400 - 5 * 50);
    let task = |character: &Character| {
        character.quest_now().map(|(quest, task)| quests().quests[quest].tasks[task].id.as_str())
    };
    assert_eq!(task(&character), Some("wear-them"));
    let pieces: Vec<(u32, Slot)> = character
        .items
        .values()
        .filter(|(item, _)| item.kind.armour())
        .map(|(item, _)| (item.id, item.kind.slot()))
        .collect();
    for (item, slot) in pieces {
        assert!(character.ask(Ask::Wear { item, slot }, SOCIAL, &DICE).is_ok());
    }
    assert_eq!(task(&character), Some("hear-three-houses"));
}

#[test]
fn a_character_already_on_the_houses_is_not_walked_round_again() {
    let mut character = Character::starting();
    let opening = quests().quests.iter().position(|quest| quest.faction == 0).expect("the opening");
    let houses = quests().quests[opening].tasks.iter().position(|task| task.id == "hear-three-houses").expect("there");
    character.quests.set_task(opening, houses);
    let kept: Character = serde_json::from_value(serde_json::to_value(&character).expect("kept")).expect("read");
    assert_eq!(kept.quest_now(), Some((opening, houses)));
    let mut kept = kept;
    assert_eq!(kept.ask(Ask::Speak { keeper: keeper("stranger") }, SOCIAL, &DICE), Err(Refusal::NothingToSay));
    assert_eq!(kept.materials.aurem, 0, "no gift past her task");
}

#[test]
fn starter_gear_bought_during_the_round_counts_once_its_task_is_reached() {
    let mut character = welcomed();
    let level = character.level();
    let buy = |character: &mut Character, vendor, kind| {
        let ware = starter(vendor, kind, level);
        assert!(character.ask(Ask::Vend { vendor, ware, day: 4 }, SOCIAL, &DICE).is_ok());
    };
    buy(&mut character, Vendor::Weaponsmith, Kind::SwordAndShield);
    for kind in [Kind::Head, Kind::Torso, Kind::Arms, Kind::Legs] {
        buy(&mut character, Vendor::Armorsmith, kind);
    }
    for key in ["weaponsmith", "armorsmith", "mage", "vault", "tailor", "tack", "mail", "harbourmaster"] {
        assert!(character.ask(Ask::Speak { keeper: keeper(key) }, SOCIAL, &DICE).is_ok(), "{key}");
    }
    let task = character.quest_now().map(|(quest, task)| quests().quests[quest].tasks[task].id.as_str());
    assert_eq!(task, Some("wear-them"), "the pieces already owned arm the player: nothing more to buy");
    assert_eq!(character.materials.aurem, 400 - 5 * 50);
    // Carried, not worn: another answered ask leaves every piece still to put on.
    buy(&mut character, Vendor::Weaponsmith, Kind::Bow);
    let task = character.quest_now().map(|(quest, task)| quests().quests[quest].tasks[task].id.as_str());
    assert_eq!(task, Some("wear-them"));
    assert_eq!(character.quest_counts(), vec![0; 5]);
}

#[test]
fn starter_gear_bought_and_worn_during_the_round_dresses_the_player_as_its_last_keeper_is_heard() {
    let mut character = welcomed();
    let level = character.level();
    let buy = |character: &mut Character, vendor, kind| {
        let ware = starter(vendor, kind, level);
        assert!(character.ask(Ask::Vend { vendor, ware, day: 4 }, SOCIAL, &DICE).is_ok());
    };
    buy(&mut character, Vendor::Weaponsmith, Kind::SwordAndShield);
    for kind in [Kind::Head, Kind::Torso, Kind::Arms, Kind::Legs] {
        buy(&mut character, Vendor::Armorsmith, kind);
    }
    let pieces: Vec<(u32, Slot)> = character.items.values().map(|(item, _)| (item.id, item.kind.slot())).collect();
    for (item, slot) in pieces {
        assert!(character.ask(Ask::Wear { item, slot }, SOCIAL, &DICE).is_ok());
    }
    for key in ["weaponsmith", "armorsmith", "mage", "vault", "tailor", "tack", "mail", "harbourmaster"] {
        assert!(character.ask(Ask::Speak { keeper: keeper(key) }, SOCIAL, &DICE).is_ok(), "{key}");
    }
    let task = character.quest_now().map(|(quest, task)| quests().quests[quest].tasks[task].id.as_str());
    assert_eq!(task, Some("hear-three-houses"), "armed and dressed by the pieces already worn");
}

#[test]
fn pieces_never_bought_from_a_smith_do_not_arm_the_player() {
    let mut character = welcomed();
    for key in ["weaponsmith", "armorsmith", "mage", "vault", "tailor", "tack", "mail", "harbourmaster"] {
        assert!(character.ask(Ask::Speak { keeper: keeper(key) }, SOCIAL, &DICE).is_ok(), "{key}");
    }
    // Five Magic pieces looted, one for each slot the task asks.
    for (kind, slot) in [(Kind::Sword, Slot::Melee), (Kind::Head, Slot::Head), (Kind::Torso, Slot::Torso)]
        .into_iter()
        .chain([(Kind::Arms, Slot::Arms), (Kind::Legs, Slot::Legs)])
    {
        let id = character.take_id();
        character
            .items
            .insert(id, (crate::item::Item::new(id, kind, Rarity::Magic, 1, slot), crate::character::At::Carried));
    }
    // An ask answered, after which the quest hears what is held: one of the looted pieces put on.
    let looted = character.items.values().find(|(item, _)| item.kind == Kind::Head).map(|(item, _)| item.id);
    assert!(character.ask(Ask::Wear { item: looted.expect("looted"), slot: Slot::Head }, SOCIAL, &DICE).is_ok());
    let task = character.quest_now().map(|(quest, task)| quests().quests[quest].tasks[task].id.as_str());
    assert_eq!(task, Some("arm-yourself"), "nothing was bought");
    assert_eq!(character.quest_counts(), vec![0; 5]);
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
        let mut read: Character = serde_json::from_value(kept).expect("read");
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
fn the_openings_purchases_are_let_go_once_it_is_armed_so_a_later_buy_goal_counts_only_its_own() {
    let mut character = welcomed();
    for key in ["weaponsmith", "armorsmith", "mage", "vault", "tailor", "tack", "mail", "harbourmaster"] {
        assert!(character.ask(Ask::Speak { keeper: keeper(key) }, SOCIAL, &DICE).is_ok(), "{key}");
    }
    let level = character.level();
    let buy = |character: &mut Character, vendor, kind| {
        let ware = starter(vendor, kind, level);
        assert!(character.ask(Ask::Vend { vendor, ware, day: 4 }, SOCIAL, &DICE).is_ok());
    };
    buy(&mut character, Vendor::Weaponsmith, Kind::SwordAndShield);
    assert_eq!(character.quests.bought, vec![Slot::Melee], "kept while the opening asks");
    for kind in [Kind::Head, Kind::Torso, Kind::Arms, Kind::Legs] {
        buy(&mut character, Vendor::Armorsmith, kind);
    }
    assert!(character.quests.bought.is_empty(), "let go once its buy task is met");
    buy(&mut character, Vendor::Weaponsmith, Kind::Bow);
    assert_eq!(character.quests.bought, vec![Slot::Ranged], "a later purchase is a later goal's own");
}
