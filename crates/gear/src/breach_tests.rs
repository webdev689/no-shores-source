//! The Breaches' rules: their tiers, what each encounter's clear and each hidden chest pays once a week at each tier,
//! the banner, dye and horse of the last, the lore found on the way, the gate Hard keeps, and how far Normal's and
//! Hard's armour climb.

use crate::asks::{Ask, Done, Here};
use crate::breach::{DROWNED_VALE, Tier, rewards_chance};
use crate::character::{At, Character, Vestige};
use crate::dice::{Dice, Purpose};
use crate::gate::{Place, Shut, shut, shut_at};
use crate::grid::Column;
use crate::item::Item;
use crate::kinds::{Slot, Stock};
use crate::rarity::Rarity;
use crate::source::Source;
use crate::world::Difficulty;

const DICE: Dice = Dice { seed: 7, tick: 1, player: 1 };
const WEEK: u64 = 2_968;
const LAST: usize = 5;

const IN_TOWN: Here = Here { social: true, day: 0, pledge: 0, rank: 0, week: 0 };

fn essence(character: &Character) -> u16 {
    character.materials.essence(Stock::Weapon)
}

/// Wears a piece in its slot.
fn wear(character: &mut Character, item: Item) {
    let id = character.take_id();
    let slot = item.bucket;
    character.items.insert(id, (Item { id, ..item }, At::Worn(slot)));
}

#[test]
fn normal_stands_its_foes_at_26_and_hard_at_30_and_only_hard_counts_revives_and_keeps_the_fallen_down() {
    assert_eq!((Tier::Normal.foes_at(), Tier::Hard.foes_at()), (26, 30));
    assert_eq!((Tier::Normal.opens_at(), Tier::Hard.opens_at()), (25, 29));
    assert_eq!((Tier::Normal.revives(), Tier::Hard.revives()), (None, Some(5)));
    assert!(Tier::Normal.stands_again() && !Tier::Hard.stands_again());
    assert_eq!(Tier::of_key("hard"), Some(Tier::Hard));
    assert_eq!(DROWNED_VALE.encounters.len(), 6);
    assert!(DROWNED_VALE.encounters[0].outside, "the Waking is fought in the patrol zone");
    assert!(DROWNED_VALE.encounters[1..].iter().all(|encounter| !encounter.outside));
}

#[test]
fn an_encounters_first_clear_in_a_week_pays_a_legendary_breach_vestige_at_its_tier_once_and_again_next_week() {
    let mut character = Character::starting();
    let before = (character.xp, character.materials.aurem, essence(&character));
    let paid = character.breach_cleared(&DROWNED_VALE, Tier::Hard, WEEK, 1, &DICE);
    assert_eq!(paid.vestiges.len(), 1);
    let vestige = &paid.vestiges[0];
    assert_eq!(
        (vestige.rarity, vestige.source, vestige.hard, vestige.level),
        (Rarity::Legendary, Source::Breach, true, 30)
    );
    assert!(character.xp > before.0 && character.materials.aurem > before.1);
    assert_eq!(essence(&character), before.2 + 2);
    assert!(character.breach_paid(&DROWNED_VALE, Tier::Hard, WEEK, 1));
    let again = character.breach_cleared(&DROWNED_VALE, Tier::Hard, WEEK, 1, &DICE);
    assert!(again.vestiges.is_empty() && essence(&character) == before.2 + 2, "once a week");
    let normal = character.breach_cleared(&DROWNED_VALE, Tier::Normal, WEEK, 1, &DICE);
    assert_eq!(normal.vestiges.len(), 1, "Normal's is its own");
    assert!(!normal.vestiges[0].hard);
    assert_eq!(character.breach_cleared(&DROWNED_VALE, Tier::Hard, WEEK + 1, 1, &DICE).vestiges.len(), 1);
    assert!(character.breach_cleared(&DROWNED_VALE, Tier::Hard, WEEK, 2, &DICE).vestiges.is_empty(), "behind");
}

#[test]
fn the_last_encounter_pays_two_vestiges_and_the_banner_once_ever_and_marks_the_tier_won() {
    let mut character = Character::starting();
    assert!(!character.breach_won(&DROWNED_VALE, Tier::Normal));
    let paid = character.breach_cleared(&DROWNED_VALE, Tier::Normal, WEEK, LAST, &DICE);
    assert_eq!(paid.vestiges.len(), 2);
    assert_eq!(paid.emblem.as_deref(), Some("drowned-vale"));
    assert!(character.keeps_emblem("drowned-vale") && character.breach_won(&DROWNED_VALE, Tier::Normal));
    assert_eq!(essence(&character), 4);
    let next_week = character.breach_cleared(&DROWNED_VALE, Tier::Normal, WEEK + 1, LAST, &DICE);
    assert_eq!((next_week.vestiges.len(), next_week.emblem), (2, None), "the banner once");
}

#[test]
fn the_dye_and_the_horse_come_by_chance_from_the_last_encounter_hards_likelier_and_each_once() {
    let (normal, hard) = (rewards_chance(Tier::Normal), rewards_chance(Tier::Hard));
    assert!(hard.0 > normal.0 && hard.1 > normal.1);
    let mut kept = (0, 0);
    let mut character = Character::starting();
    for week in WEEK..WEEK + 200 {
        let dice = Dice { seed: week, ..DICE };
        let paid = character.breach_cleared(&DROWNED_VALE, Tier::Hard, week, LAST, &dice);
        kept.0 += paid.cosmetics.iter().filter(|id| *id == "drowned-vale").count();
        kept.1 += paid.cosmetics.iter().filter(|id| *id == "drowned").count();
    }
    assert_eq!(kept, (1, 1), "each kept once, never paid again");
    let rolls = (0..2_000).filter(|seed| Dice { seed: *seed, ..DICE }.roll(Purpose::Breach, 9) < hard.1).count();
    assert!((180..320).contains(&rolls), "the horse about one Hard clear in eight: {rolls} in 2000");
}

#[test]
fn a_hidden_chest_pays_essence_alone_once_a_week_and_every_find_keeps_its_lore_chapter_the_first_time() {
    let mut character = Character::starting();
    let chests = DROWNED_VALE.encounters.len();
    let paid = character.breach_cleared(&DROWNED_VALE, Tier::Normal, WEEK, chests + 2, &DICE);
    assert!(paid.vestiges.is_empty());
    assert_eq!(paid.lore, ["drowned-vale/the-heart-of-the-ways"]);
    assert_eq!(essence(&character), 1);
    let again = character.breach_cleared(&DROWNED_VALE, Tier::Hard, WEEK, chests + 2, &DICE);
    assert!(again.lore.is_empty(), "a chapter is found once");
    assert_eq!(essence(&character), 2, "each tier's chest pays");
    for find in 0..chests + DROWNED_VALE.chests.len() {
        character.breach_cleared(&DROWNED_VALE, Tier::Normal, WEEK + 1, find, &DICE);
    }
    let book = crate::lore::lore().books.iter().find(|book| book.id == "drowned-vale").expect("its book");
    assert_eq!(book.chapters.len(), 10);
    for chapter in &book.chapters {
        assert!(character.finds_lore(&format!("drowned-vale/{}", chapter.id)), "{} is found", chapter.id);
    }
}

#[test]
fn a_breach_opens_at_its_tiers_level_and_hard_once_normal_is_won() {
    let at = |level, tier| shut_at(level, true, Place::Breach(tier), Difficulty::Normal);
    assert_eq!(at(24, Tier::Normal), Some(Shut::BreachLevel(Tier::Normal)));
    assert_eq!(at(25, Tier::Normal), None);
    assert_eq!(at(28, Tier::Hard), Some(Shut::BreachLevel(Tier::Hard)));
    assert_eq!(shut_at(30, false, Place::Breach(Tier::Normal), Difficulty::Normal), Some(Shut::Prologue));
    let mut character = Character { xp: 1 << 40, ..Character::starting() };
    character.story.prologue = true;
    for slot in [Slot::Head, Slot::Torso, Slot::Arms, Slot::Legs] {
        let piece = upgraded(
            crate::vestige::make(0, Rarity::Legendary, slot, 20, Source::Breach, &DICE).expect("a piece"),
            true,
        );
        wear(&mut character, piece);
    }
    assert_eq!(character.level(), 30);
    assert_eq!(shut(&character, Place::Breach(Tier::Hard), Difficulty::Normal), Some(Shut::BreachHard));
    character.breach_cleared(&DROWNED_VALE, Tier::Normal, WEEK, LAST, &DICE);
    assert_eq!(shut(&character, Place::Breach(Tier::Hard), Difficulty::Normal), None);
    assert!(Shut::BreachHard.reason().contains("Normal"));
}

/// A Breach piece of its tier with every upgrade bought.
fn upgraded(mut item: Item, hard: bool) -> Item {
    item.hard = hard;
    let upgrades: Vec<usize> =
        item.columns().iter().enumerate().filter(|(_, column)| **column == Column::Upgrade).map(|(at, _)| at).collect();
    for column in upgrades {
        item.bought |= item.node_bit(column, 0).expect("an upgrade's node");
    }
    item
}

#[test]
fn normal_breach_armour_climbs_to_28_prestige_and_hards_to_30_so_only_hard_reaches_level_30() {
    let make = |slot, hard| {
        upgraded(crate::vestige::make(0, Rarity::Legendary, slot, 20, Source::Breach, &DICE).expect("a piece"), hard)
    };
    let helm = |hard| make(Slot::Head, hard);
    assert!(helm(false).breach && helm(false).kind.armour());
    assert_eq!((helm(false).prestige(), helm(true).prestige()), (28, 30));
    let level = |hard| {
        let mut character = Character { xp: 1 << 40, ..Character::starting() };
        for slot in [Slot::Head, Slot::Torso, Slot::Arms, Slot::Legs] {
            wear(&mut character, make(slot, hard));
        }
        character.level()
    };
    assert_eq!((level(false), level(true)), (29, 30));
}

#[test]
fn a_breach_weapon_opened_at_normal_never_carries_an_element_and_one_opened_at_hard_always_does() {
    for (tier, carries) in [(Tier::Normal, false), (Tier::Hard, true)] {
        let mut judged = 0;
        for seed in 0..40 {
            let mut character = Character::starting();
            let vestige = Vestige::new(900, Rarity::Legendary, Slot::Melee, 26).from(Source::Breach).at_tier(tier);
            character.vestiges.insert(vestige.id, (vestige.clone(), false));
            let dice = Dice { seed, ..DICE };
            let Ok(Done::Identified(opened)) = character.ask(Ask::Identify { vestige: vestige.id }, IN_TOWN, &dice)
            else {
                panic!("it opens")
            };
            let (item, _) = &character.items[&opened];
            // One opened up to an Atheric is a named piece of its own, no Breach's.
            if !item.breach {
                continue;
            }
            assert!(item.kind.weapon(), "{item:?}");
            assert_eq!(item.element.is_some(), carries, "{tier:?}, seed {seed}");
            judged += 1;
        }
        assert!(judged >= 30, "{judged} Breach weapons opened at {tier:?}");
    }
}

#[test]
fn a_hard_breach_vestige_opens_to_a_hard_piece_and_a_normal_one_to_a_normal() {
    for hard in [false, true] {
        let mut character = Character::starting();
        let tier = if hard { Tier::Hard } else { Tier::Normal };
        let paid = character.breach_cleared(&DROWNED_VALE, tier, WEEK, 0, &DICE);
        let vestige = paid.vestiges[0].clone();
        character.vestiges.insert(vestige.id, (vestige.clone(), false));
        let Ok(Done::Identified(opened)) = character.ask(Ask::Identify { vestige: vestige.id }, IN_TOWN, &DICE) else {
            panic!("it opens")
        };
        let (item, _) = &character.items[&opened];
        assert_eq!(item.hard, hard && item.breach, "{item:?}");
    }
}
