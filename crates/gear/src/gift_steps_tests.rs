//! The pledged house's gift and the steps that teach the keepers' gifts: the house pledged to gives its own torso
//! piece at Magic as the pledge is taken, once a character for each house, kept by name; and "Use your gifts", after
//! "Put them on", asks the Mage to open a Vestige, a piece taken from the vault, a dye worn and a letter taken, each
//! ticked as the room answers.

use crate::asks::{Ask, Here};
use crate::character::{At, CARRIED_MOST, Character, VAULT_MOST};
use crate::dice::Dice;
use crate::factions::factions;
use crate::gifts::TAILORS_DYE;
use crate::item::Item;
use crate::kinds::{Kind, Slot};
use crate::quests::{keeper_key, quests};
use crate::rarity::Rarity;
use crate::vendor::{self, Vendor};

const SOCIAL: Here = Here { social: true, day: 4, pledge: 0, rank: 0, week: 0 };
const DICE: Dice = Dice { seed: 3, tick: 1, player: 1 };
const ROUND: [&str; 7] = ["weaponsmith", "armorsmith", "mage", "vault", "tailor", "tack", "mail"];

fn speak(character: &mut Character, key: &str) {
    let keeper = (1..=u8::MAX).find(|number| keeper_key(*number) == Some(key)).expect("a keeper");
    let word = if character.quest_offered() == Some(keeper) { Ask::Acquire { keeper } } else { Ask::Speak { keeper } };
    assert!(character.ask(word, SOCIAL, &DICE).is_ok(), "{key}");
}

fn task(character: &Character) -> Option<&'static str> {
    character.quest_now().map(|(quest, task)| quests().quests[quest].tasks[task].id.as_str())
}

/// The house's own torso piece, by its catalogue id.
fn torso(faction: u8) -> &'static str {
    let key = &factions().faction(faction).expect("a house").key;
    let wares = crate::factions::wares(faction);
    let found = wares.iter().find(|named| named.kind == Kind::Torso && named.faction.as_ref() == Some(key));
    found.expect("its torso").id.as_str()
}

/// The house's Magic torso pieces held or posted.
fn given(character: &Character, faction: u8) -> usize {
    let id = torso(faction);
    let gift = |item: &Item| item.named.as_deref() == Some(id) && item.rarity == Rarity::Magic;
    let held = character.items.values().filter(|(item, _)| gift(item)).count();
    held + character.mail.iter().filter(|letter| letter.item.as_ref().is_some_and(gift)).count()
}

fn pledge(character: &mut Character, faction: u8) {
    character.materials.aurem += factions().pledge_switch_aurem;
    assert!(character.ask(Ask::Pledge { faction }, SOCIAL, &DICE).is_ok(), "{faction}");
}

/// A new character in Overlook, round heard, ridden and sailed, its gifts worn: at "Use your gifts".
fn dressed() -> Character {
    let mut character = Character::starting();
    speak(&mut character, "stranger");
    for key in ROUND {
        speak(&mut character, key);
    }
    character.ride_the_lesson();
    speak(&mut character, "harbourmaster");
    character.sail_the_lesson();
    for kind in [Kind::DoubleSwords, Kind::Crossbow] {
        let stock = vendor::stock(Vendor::Weaponsmith, SOCIAL.day, character.level());
        let at = stock.iter().position(|item| item.kind == kind && item.rarity == Rarity::Normal).expect("sold");
        let ware = u8::try_from(at).expect("a ware");
        assert!(character.ask(Ask::Vend { vendor: Vendor::Weaponsmith, ware, day: 4 }, SOCIAL, &DICE).is_ok());
    }
    let carried: Vec<_> = character
        .items
        .values()
        .filter(|(item, at)| {
            *at == At::Carried
                && matches!(
                    item.kind.slot(),
                    Slot::Melee | Slot::Ranged | Slot::Head | Slot::Torso | Slot::Arms | Slot::Legs
                )
        })
        .map(|(item, _)| (item.id, item.kind.slot()))
        .collect();
    for (item, slot) in carried {
        assert!(character.ask(Ask::Wear { item, slot }, SOCIAL, &DICE).is_ok());
    }
    character
}

#[test]
fn the_house_pledged_to_gives_its_torso_at_magic_once_and_a_switch_gives_the_new_houses_own() {
    let mut character = Character::starting();
    speak(&mut character, "stranger");
    let wares_before: Vec<_> = (1..=3).map(|house| crate::factions::wares(house).len()).collect();
    pledge(&mut character, 1);
    assert_eq!(given(&character, 1), 1, "the Stormcaller Hauberk at Magic, given as the pledge is taken");
    let (piece, at) = character.items.values().find(|(item, _)| item.named.as_deref() == Some(torso(1))).expect("held");
    assert_eq!(
        (piece.kind, piece.rarity, piece.level, *at),
        (Kind::Torso, Rarity::Magic, character.level(), At::Carried)
    );
    assert!(!piece.layout.is_empty(), "rolled as a Magic piece is");
    assert!(character.quests.gifts.iter().any(|gift| gift == torso(1)), "kept given by name");
    assert_eq!((given(&character, 2), given(&character, 3)), (0, 0), "no other house gives one");
    pledge(&mut character, 2);
    assert_eq!(given(&character, 2), 1, "a switch: the new house's own");
    let mut back = Character::from_json(&character.to_json()).expect("read as a rejoin");
    pledge(&mut back, 1);
    assert_eq!(given(&back, 1), 1, "never a second of one given, across a reload");
    // Nothing a house sells changes, and its Legendary piece is still the one it sells.
    let wares_after: Vec<_> = (1..=3).map(|house| crate::factions::wares(house).len()).collect();
    assert_eq!(wares_before, wares_after);
    let sold = crate::catalogue::catalogue().named(torso(1)).expect("named");
    assert_eq!(sold.rarity, Rarity::Legendary);
    assert!(crate::factions::sold_by_faction(torso(1)));
}

#[test]
fn the_houses_piece_with_no_room_is_vaulted_or_posted_as_itself_never_lost() {
    let mut character = Character::starting();
    speak(&mut character, "stranger");
    let fill = |character: &mut Character, at: At, most: usize| {
        let held = |character: &Character| match at {
            At::Vault => character.vaulted(Kind::Torso.stock()),
            _ => character.carried_in(Slot::Torso),
        };
        while held(character) < most {
            let id = character.take_id();
            character.items.insert(id, (Item::new(id, Kind::Torso, Rarity::Normal, 1, Slot::Torso), at));
        }
    };
    fill(&mut character, At::Carried, CARRIED_MOST);
    let mut full = character.clone();
    pledge(&mut character, 3);
    let at = character.items.values().find(|(item, _)| item.named.as_deref() == Some(torso(3))).map(|(_, at)| *at);
    assert_eq!(at, Some(At::Vault), "vaulted, the bag full");
    fill(&mut full, At::Vault, VAULT_MOST);
    pledge(&mut full, 3);
    assert_eq!(given(&full, 3), 1, "posted as itself");
}

#[test]
fn use_your_gifts_follows_put_them_on_and_each_step_ticks_as_the_room_answers_it() {
    let mut character = dressed();
    assert_eq!(task(&character), Some("use-your-gifts"));
    assert_eq!(character.quest_counts(), [0, 0, 0, 0], "nothing done before it counts");
    let counts = |character: &Character| character.quest_counts();
    let vestige = *character.vestiges.keys().next().expect("the Mage's Vestige");
    assert!(character.ask(Ask::Identify { vestige }, SOCIAL, &DICE).is_ok());
    assert_eq!(counts(&character), [1, 0, 0, 0]);
    let cloak = character.items.iter().find(|(_, (item, at))| item.kind == Kind::Cloak && *at == At::Vault);
    let item = *cloak.expect("the Vault Keeper's cloak").0;
    assert!(character.ask(Ask::Withdraw { item }, SOCIAL, &DICE).is_ok());
    assert_eq!(counts(&character), [1, 1, 0, 0]);
    let cosmetic = crate::cosmetics::number_of(TAILORS_DYE).expect("a dye");
    assert!(character.ask(Ask::WearCosmetic { cosmetic }, SOCIAL, &DICE).is_ok());
    assert_eq!(counts(&character), [1, 1, 1, 0]);
    let letter = character.mail[0].id;
    assert!(character.ask(Ask::TakeLetter { letter }, SOCIAL, &DICE).is_ok());
    assert_eq!(task(&character), Some("hear-three-houses"));
}

#[test]
fn a_save_on_put_them_on_with_nothing_left_to_open_or_take_walks_on_with_those_steps_met() {
    let mut character = dressed();
    // As a save before the gifts: nothing sealed, no letter.
    character.vestiges.clear();
    character.mail.clear();
    let opening = quests().quests.iter().position(|quest| quest.faction == 0).expect("the opening");
    let wear = quests().quests[opening].tasks.iter().position(|task| task.id == "wear-them").expect("a task");
    character.quests.set_task(opening, wear);
    let mut read = Character::from_json(&character.to_json()).expect("read");
    assert!(read.ask(Ask::TakeOff { slot: Slot::Head }, SOCIAL, &DICE).is_ok());
    let head = read.items.iter().find(|(_, (item, at))| item.kind == Kind::Head && *at == At::Carried);
    let item = *head.expect("taken off").0;
    assert!(read.ask(Ask::Wear { item, slot: Slot::Head }, SOCIAL, &DICE).is_ok());
    assert_eq!(task(&read), Some("use-your-gifts"), "walked on into the new task");
    assert_eq!(read.quest_counts(), [1, 0, 0, 1], "nothing left to open or take: those steps met");
}

#[test]
fn a_save_past_the_new_task_is_not_sent_back() {
    let opening = quests().quests.iter().position(|quest| quest.faction == 0).expect("the opening");
    let tasks = &quests().quests[opening].tasks;
    let houses = tasks.iter().position(|task| task.id == "hear-three-houses").expect("a task");
    let mut character = Character::starting();
    character.quests.set_task(opening, houses);
    let read = Character::from_json(&character.to_json()).expect("read");
    assert_eq!(task(&read), Some("hear-three-houses"));
}

#[test]
fn a_refused_pledge_gives_no_houses_piece() {
    let mut character = Character::starting();
    speak(&mut character, "stranger");
    pledge(&mut character, 1);
    character.materials.aurem = factions().pledge_switch_aurem - 1;
    assert!(character.ask(Ask::Pledge { faction: 2 }, SOCIAL, &DICE).is_err(), "short of the switch");
    let afield = Here { social: false, ..SOCIAL };
    character.materials.aurem += 1;
    assert!(character.ask(Ask::Pledge { faction: 3 }, afield, &DICE).is_err(), "not at its counter");
    assert_eq!((given(&character, 2), given(&character, 3)), (0, 0));
}
