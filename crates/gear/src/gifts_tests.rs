//! The keepers' gifts on the opening's round: each keeper gives theirs as they are spoken with, once a character; the
//! Weaponsmith's is a choice of one Melee and one Ranged piece of her starter stock, free at her counter; a save kept
//! partway round is paid for the keepers it heard, one that pledged first is given what the round still held, and one
//! past the round is owed nothing new.

use crate::asks::{Ask, Here, Refusal};
use crate::character::{At, Character};
use crate::dice::Dice;
use crate::gifts::{GIFT_VESTIGE, Gift, MAGES_SLOT, POSTMASTERS_SLOT, TAILORS_DYE};
use crate::kinds::{Kind, Slot};
use crate::mail::Source;
use crate::quests::{Goal, keeper_key, quests};
use crate::rarity::Rarity;
use crate::vendor::{self, STARTER_PRICE, Vendor, WARES};

const SOCIAL: Here = Here { social: true, day: 4, pledge: 0, rank: 0, week: 0 };
const DICE: Dice = Dice { seed: 3, tick: 1, player: 1 };
const ROUND: [&str; 7] = ["weaponsmith", "armorsmith", "mage", "vault", "tailor", "tack", "mail"];

fn keeper(key: &str) -> u8 {
    (1..=u8::MAX).find(|number| keeper_key(*number) == Some(key)).expect("a keeper")
}

/// A word with a keeper: Acquire where they offer the quest walked, as the round's first word is.
fn speak(character: &mut Character, key: &str) {
    let keeper = keeper(key);
    let word = if character.quest_offered() == Some(keeper) { Ask::Acquire { keeper } } else { Ask::Speak { keeper } };
    assert!(character.ask(word, SOCIAL, &DICE).is_ok(), "{key}");
}

/// A new character in Overlook: the stranger heard.
fn welcomed() -> Character {
    let mut character = Character::starting();
    speak(&mut character, "stranger");
    character
}

/// The ware number of the Weaponsmith's starter piece of a kind, at a level.
fn starter(kind: Kind, level: u8) -> u8 {
    let stock = vendor::stock(Vendor::Weaponsmith, SOCIAL.day, level);
    let at = stock.iter().position(|item| item.kind == kind && item.rarity == Rarity::Normal).expect("sold");
    u8::try_from(at).expect("a ware number")
}

fn buy(character: &mut Character, kind: Kind) -> Result<(), Refusal> {
    let ware = starter(kind, character.level());
    character.ask(Ask::Vend { vendor: Vendor::Weaponsmith, ware, day: 4 }, SOCIAL, &DICE).map(|_| ())
}

fn task(character: &Character) -> Option<&'static str> {
    character.quest_now().map(|(quest, task)| quests().quests[quest].tasks[task].id.as_str())
}

fn count(character: &Character, kind: Kind, at: At) -> usize {
    character.items.values().filter(|(item, place)| item.kind == kind && *place == at).count()
}

#[test]
fn the_stranger_gives_no_aurem_and_each_keeper_on_the_round_gives_a_gift_as_spoken_with() {
    let mut character = welcomed();
    assert_eq!(character.materials.aurem, 0, "her Aurem is gone");
    let level = character.level();
    speak(&mut character, "weaponsmith");
    assert_eq!(character.quests.free, [Slot::Melee, Slot::Ranged], "one of each, chosen at her counter");
    speak(&mut character, "armorsmith");
    for kind in [Kind::Head, Kind::Torso, Kind::Arms, Kind::Legs] {
        let given: Vec<_> = character.items.values().filter(|(item, _)| item.kind == kind).collect();
        assert_eq!(given.len(), 1, "{kind:?}");
        assert_eq!((given[0].0.rarity, given[0].0.level, given[0].1), (Rarity::Normal, level, At::Carried));
    }
    speak(&mut character, "mage");
    let sealed: Vec<_> =
        character.vestiges.values().map(|(vestige, vaulted)| (vestige.rarity, vestige.slot, *vaulted)).collect();
    assert_eq!(sealed, [(GIFT_VESTIGE, MAGES_SLOT, false)], "a sealed Vestige carried, for her to open");
    speak(&mut character, "vault");
    assert_eq!(count(&character, Kind::Cloak, At::Vault), 1, "a cloak laid in the vault");
    assert!(!character.keeps_cosmetic(TAILORS_DYE));
    speak(&mut character, "tailor");
    assert!(character.keeps_cosmetic(TAILORS_DYE), "a dye kept to wear");
    speak(&mut character, "tack");
    assert!(character.may_ride(), "the Bay, as before");
    assert!(character.mail.is_empty());
    speak(&mut character, "mail");
    let letter = character.mail.first().expect("a letter");
    assert_eq!(letter.from, Source::Gift as u8);
    let held = letter.vestige.as_ref().map(|vestige| (vestige.rarity, vestige.slot, vestige.level));
    assert_eq!(held, Some((GIFT_VESTIGE, POSTMASTERS_SLOT, level)));
    speak(&mut character, "harbourmaster");
    assert!(character.has_ship(), "the Sloop, as before");
    assert_eq!(character.materials.aurem, 0, "every gift given, nothing sold");
    let gifts = [Gift::Weapons, Gift::Armour, Gift::Vestige, Gift::Cloak, Gift::Dye, Gift::Letter];
    assert!(gifts.iter().all(|gift| character.given(*gift)));
}

#[test]
fn each_keeper_on_the_round_names_a_gift_and_the_stranger_none() {
    let opening = quests().quests.iter().find(|quest| quest.faction == 0).expect("the opening");
    assert_eq!(opening.tasks[0].reward, crate::quests::RewardDef::default(), "the stranger's task gives nothing");
    let round = &opening.tasks[1];
    let gifts: Vec<(&str, Option<Gift>, bool)> = round
        .goals
        .iter()
        .map(|goal| match &goal.goal {
            Goal::Talk(talk) => (talk.to.as_str(), goal.reward.gift, goal.reward.horse),
            _ => ("", None, false),
        })
        .collect();
    assert_eq!(
        gifts,
        [
            ("weaponsmith", Some(Gift::Weapons), false),
            ("armorsmith", Some(Gift::Armour), false),
            ("mage", Some(Gift::Vestige), false),
            ("vault", Some(Gift::Cloak), false),
            ("tailor", Some(Gift::Dye), false),
            ("tack", None, true),
            ("mail", Some(Gift::Letter), false),
        ]
    );
}

#[test]
fn the_weaponsmith_sells_every_melee_and_ranged_kind_to_start_and_gives_one_of_each_free_while_owed() {
    let stock = vendor::stock(Vendor::Weaponsmith, 4, 7);
    let starters: Vec<Kind> = stock[WARES..].iter().map(|item| item.kind).collect();
    let melee: Vec<&Kind> = starters.iter().filter(|kind| kind.slot() == Slot::Melee).collect();
    let ranged: Vec<&Kind> = starters.iter().filter(|kind| kind.slot() == Slot::Ranged).collect();
    let every = |slot| Kind::ALL.iter().filter(|kind| kind.slot() == slot).count();
    assert_eq!((melee.len(), ranged.len()), (13, 5));
    assert_eq!((every(Slot::Melee), every(Slot::Ranged)), (13, 5), "every kind of each slot");
    assert!(stock[WARES..].iter().all(|item| item.rarity == Rarity::Normal && item.level == 7));
    // Sold to anyone at 50 Aurem while nothing is owed.
    let mut stranger = welcomed();
    assert_eq!(buy(&mut stranger, Kind::Greatsword), Err(Refusal::Short));
    stranger.materials.aurem = STARTER_PRICE;
    assert_eq!(buy(&mut stranger, Kind::Greatsword), Ok(()));
    assert_eq!(stranger.materials.aurem, 0);
    // Owed, one of each slot is free, and only one.
    let mut character = welcomed();
    speak(&mut character, "weaponsmith");
    let item = &vendor::stock(Vendor::Weaponsmith, 4, 1)[usize::from(starter(Kind::Flail, 1))];
    assert_eq!(character.ware_price(Vendor::Weaponsmith, item), 0, "shown free");
    assert_eq!(buy(&mut character, Kind::Flail), Ok(()));
    assert_eq!(character.quests.free, [Slot::Ranged]);
    assert_eq!(character.ware_price(Vendor::Weaponsmith, item), STARTER_PRICE, "the Melee gift spent");
    assert_eq!(buy(&mut character, Kind::Staff), Err(Refusal::Short), "a second Melee piece is sold");
    assert_eq!(buy(&mut character, Kind::Thunderlock), Ok(()));
    assert!(character.quests.free.is_empty());
    assert_eq!(buy(&mut character, Kind::Bow), Err(Refusal::Short));
    assert_eq!(count(&character, Kind::Flail, At::Carried) + count(&character, Kind::Thunderlock, At::Carried), 2);
    assert!(character.quests.bought.is_empty(), "a gift is never a piece bought");
    // The day's wares are never the gift.
    let rare = &vendor::stock(Vendor::Weaponsmith, 4, 1)[0];
    let mut owed = welcomed();
    speak(&mut owed, "weaponsmith");
    assert_eq!(owed.ware_price(Vendor::Weaponsmith, rare), vendor::price(rare.rarity));
}

#[test]
fn the_gifts_dress_the_player_and_put_them_on_asks_both_weapons_and_the_armour() {
    let mut character = welcomed();
    for key in ROUND.into_iter().chain(["harbourmaster"]) {
        speak(&mut character, key);
    }
    assert_eq!(task(&character), Some("wear-them"), "nothing to buy: the gifts arm the player");
    buy(&mut character, Kind::DoubleSwords).expect("her Melee gift");
    buy(&mut character, Kind::Crossbow).expect("her Ranged gift");
    let pieces: Vec<(u32, Slot)> = character
        .items
        .values()
        .filter(|(item, at)| *at == At::Carried && item.kind.slot() != Slot::Mount)
        .map(|(item, _)| (item.id, item.kind.slot()))
        .collect();
    assert_eq!(pieces.len(), 6);
    let slots: Vec<Slot> = pieces.iter().map(|(_, slot)| *slot).collect();
    for (item, slot) in pieces {
        assert_eq!(task(&character), Some("wear-them"), "{slots:?}");
        assert!(character.ask(Ask::Wear { item, slot }, SOCIAL, &DICE).is_ok());
    }
    assert_eq!(task(&character), Some("hear-three-houses"));
}

#[test]
fn a_gift_is_given_once_across_a_reload_and_never_again() {
    let mut character = welcomed();
    for key in ROUND {
        speak(&mut character, key);
    }
    let mut kept = Character::from_json(&character.to_json()).expect("read as a room reads a rejoin");
    assert_eq!(kept.quests.gifts, character.quests.gifts);
    let before = (kept.items.len(), kept.vestiges.len(), kept.mail.len());
    for gift in [Gift::Weapons, Gift::Armour, Gift::Vestige, Gift::Cloak, Gift::Dye, Gift::Letter] {
        kept.give_gift(gift);
    }
    kept.give_gifts_due();
    kept.give_gifts_ahead();
    assert_eq!((kept.items.len(), kept.vestiges.len(), kept.mail.len()), before);
    assert_eq!(kept.ask(Ask::Speak { keeper: keeper("armorsmith") }, SOCIAL, &DICE), Err(Refusal::NothingToSay));
    // The Weaponsmith's choice, once taken, is not owed again after a reload.
    buy(&mut kept, Kind::Sword).expect("given");
    let mut again = Character::from_json(&kept.to_json()).expect("read");
    again.give_gift(Gift::Weapons);
    assert_eq!(again.quests.free, [Slot::Ranged]);
}

#[test]
fn a_save_kept_partway_round_before_the_gifts_is_paid_for_the_keepers_it_heard() {
    let mut character = welcomed();
    speak(&mut character, "weaponsmith");
    speak(&mut character, "armorsmith");
    // As a room before the gifts kept it: those two heard, nothing given.
    character.items.clear();
    (character.quests.gifts, character.quests.free) = (Vec::new(), Vec::new());
    let mut read = Character::from_json(&character.to_json()).expect("read");
    assert!(read.given(Gift::Weapons) && read.given(Gift::Armour), "paid as it is read");
    assert!(!read.given(Gift::Vestige));
    speak(&mut read, "mage");
    assert!(read.given(Gift::Vestige));
    assert!(!read.given(Gift::Cloak), "the keepers it has not heard give theirs as they are");
    assert_eq!(count(&read, Kind::Head, At::Carried), 1);
}

#[test]
fn one_who_pledged_before_the_round_is_given_its_gifts_as_they_pledge_and_the_weapons_free_at_her_counter() {
    let mut character = welcomed();
    speak(&mut character, "weaponsmith");
    speak(&mut character, "armorsmith");
    assert!(character.ask(Ask::Pledge { faction: 2 }, SOCIAL, &DICE).is_ok());
    for gift in [Gift::Weapons, Gift::Armour, Gift::Vestige, Gift::Cloak, Gift::Dye, Gift::Letter] {
        assert!(character.given(gift), "{gift:?}");
    }
    assert_eq!(count(&character, Kind::Head, At::Carried), 1, "the Armorsmith's given once, on the round");
    assert_eq!(count(&character, Kind::Cloak, At::Vault), 1);
    assert_eq!(character.mail.len(), 1);
    assert_eq!(buy(&mut character, Kind::Mace), Ok(()), "her choice stays free at her counter");
    assert_eq!(buy(&mut character, Kind::Pistolet), Ok(()));
    assert_eq!(character.materials.aurem, 0);
}

#[test]
fn a_character_past_the_round_before_the_gifts_is_owed_nothing_new() {
    let opening = quests().quests.iter().position(|quest| quest.faction == 0).expect("the opening");
    for past in ["wear-them", "hear-three-houses", "choose-house"] {
        let mut character = Character::starting();
        let at = quests().quests[opening].tasks.iter().position(|task| task.id == past).expect("a task");
        character.quests.set_task(opening, at);
        let mut read = Character::from_json(&character.to_json()).expect("read");
        read.earn_due();
        assert!(read.quests.gifts.is_empty() && read.quests.free.is_empty(), "{past}");
        assert!(read.ask(Ask::Pledge { faction: 1 }, SOCIAL, &DICE).is_ok());
        let gifted = read.items.values().any(|(item, _)| matches!(item.kind, Kind::Head | Kind::Cloak));
        assert!(read.quests.gifts.is_empty() && !gifted && read.mail.is_empty(), "{past}");
    }
}

#[test]
fn a_save_on_the_old_buy_task_reads_on_put_them_on_its_counts_at_nothing() {
    let mut kept = serde_json::to_value(welcomed()).expect("kept");
    let opening = quests().quests.iter().find(|quest| quest.faction == 0).expect("the opening");
    kept["quests"]["roads"][&opening.id]["task"] = serde_json::json!("arm-yourself");
    kept["quests"]["roads"][&opening.id]["counts"] = serde_json::json!([1, 1, 0, 0, 0]);
    let read = Character::from_json(&kept.to_string()).expect("read");
    assert_eq!(task(&read), Some("wear-them"));
    assert_eq!(read.quest_counts(), vec![0; 6]);
}

#[test]
fn a_gift_with_no_room_where_it_goes_is_kept_elsewhere_never_lost() {
    let mut character = welcomed();
    for _ in 0..crate::character::VESTIGES_MOST {
        character.pick_up(crate::character::Vestige::new(0, Rarity::Rare, Slot::Torso, 1));
    }
    speak(&mut character, "weaponsmith");
    speak(&mut character, "armorsmith");
    speak(&mut character, "mage");
    let posted = character.mail.iter().filter(|letter| letter.from == Source::Gift as u8 && letter.vestige.is_some());
    assert_eq!(posted.count(), 1, "the Mage's Vestige goes to the mail with the ten full");
}
