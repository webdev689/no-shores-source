//! The refusals of the factions', the Arts', the cosmetics' and Shape's asks that their own tests leave out, each
//! at its branch: the wrong place, an unknown faction or Art, too little of one price alone, and the package's
//! Legendary gate.

use crate::arts::bar;
use crate::asks::{Ask, Here, Refusal};
use crate::character::{CARRIED_MOST, Character};
use crate::cosmetics::{Seller, cosmetics, number_of, sold_on};
use crate::dice::Dice;
use crate::emblems::Source;
use crate::factions::factions;
use crate::power::xp_for_level;
use crate::rarity::Rarity;

const AT_COUNTER: Here = Here { social: true, day: 0, pledge: 0, rank: 0, week: 0 };
const AFIELD: Here = Here { social: false, day: 0, pledge: 0, rank: 0, week: 0 };
const DICE: Dice = Dice { seed: 13, tick: 4, player: 2 };

/// A character with `ranks` whole ranks with faction 1, the Stormcallers, and much Aurem.
fn ranked(ranks: u64) -> Character {
    let mut character = Character::starting();
    character.materials.aurem = 1_000_000;
    character.allegiance = std::mem::take(&mut character.allegiance).kept();
    character.allegiance.reputation[0] = ranks * factions().reputation_per_rank;
    character
}

#[test]
fn a_factions_ware_is_refused_for_an_unknown_faction_afield_and_short() {
    let mut character = ranked(3);
    let helm = Ask::BuyFactionWare { faction: 1, ware: 1 };
    let unknown = Ask::BuyFactionWare { faction: 9, ware: 1 };
    assert_eq!(character.ask(unknown, AT_COUNTER, &DICE), Err(Refusal::NoSuchFaction));
    assert_eq!(character.ask(helm, AFIELD, &DICE), Err(Refusal::NotHere));
    assert!(character.ask(Ask::Pledge { faction: 1 }, AT_COUNTER, &DICE).is_ok());
    character.materials.aurem = factions().cape_aurem - 1;
    let before = character.clone();
    let cape = Ask::BuyFactionWare { faction: 1, ware: 0 };
    assert_eq!(character.ask(cape, AT_COUNTER, &DICE), Err(Refusal::Short), "the cape, pledged");
    assert_eq!(character, before, "a refusal changes nothing");
}

#[test]
fn a_package_is_refused_for_an_unknown_faction_and_afield() {
    let mut character = ranked(5);
    assert_eq!(character.ask(Ask::CollectPackage { faction: 9 }, AT_COUNTER, &DICE), Err(Refusal::NoSuchFaction));
    assert_eq!(character.ask(Ask::CollectPackage { faction: 1 }, AFIELD, &DICE), Err(Refusal::NotHere));
    assert!(character.ask(Ask::CollectPackage { faction: 1 }, AT_COUNTER, &DICE).is_ok());
}

/// The rarities of `count` packages collected at a level, each by a dice of its own.
fn packages_at(level: u8, count: u64) -> Vec<Rarity> {
    let mut character = ranked(count + 10);
    character.xp = xp_for_level(level);
    (0..count)
        .map(|tick| {
            character.vestiges.clear();
            let dice = Dice { seed: 21, tick, player: 3 };
            assert!(character.ask(Ask::CollectPackage { faction: 1 }, AT_COUNTER, &dice).is_ok());
            character.vestiges.values().next().map(|(vestige, _)| vestige.rarity).expect("the package's Vestige")
        })
        .collect()
}

#[test]
fn a_package_is_rare_below_level_18_and_legendary_one_time_in_four_from_it() {
    let numbers = factions();
    let below = packages_at(numbers.package_legendary_from_level - 1, 400);
    assert!(below.iter().all(|rarity| *rarity == Rarity::Rare), "only Rare below its level");
    let from = packages_at(numbers.package_legendary_from_level, 400);
    assert!(from.iter().all(|rarity| matches!(rarity, Rarity::Rare | Rarity::Legendary)));
    let legendary = from.iter().filter(|rarity| **rarity == Rarity::Legendary).count();
    assert!((70..130).contains(&legendary), "{legendary} Legendary in 400, about one in four");
}

#[test]
fn the_rank_holds_at_its_most_for_the_most_reputation() {
    let mut character = ranked(0);
    character.allegiance.reputation[0] = u64::MAX;
    assert_eq!(character.rank(1), u32::MAX);
    assert_eq!(character.packages(1), u32::MAX - (factions().packages_from_rank - 1));
}

#[test]
fn a_fragment_is_refused_afield_out_of_range_and_short() {
    let mut character = ranked(u64::from(factions().fragment_rank));
    let free = (0..6).find(|place| !character.owns_fragment(1, *place)).expect("a fragment not owned");
    let buy = |fragment| Ask::BuyFragment { art: 1, fragment };
    assert_eq!(character.ask(buy(free), AFIELD, &DICE), Err(Refusal::NotHere));
    assert_eq!(character.ask(buy(6), AT_COUNTER, &DICE), Err(Refusal::NoSuchFragment));
    character.materials.aurem = factions().fragment_aurem - 1;
    assert_eq!(character.ask(buy(free), AT_COUNTER, &DICE), Err(Refusal::Short));
    assert!(!character.owns_fragment(1, free), "nothing bought");
}

/// A character whose Storm Art stands at `level` with its bar full, holding Aurem enough for any rise.
fn ready_at(level: u8) -> Character {
    let mut character = ranked(0);
    character.arts = std::mem::take(&mut character.arts).kept();
    character.arts.levels[0] = level;
    character.arts.xp[0] = bar(level);
    character
}

#[test]
fn a_rise_is_refused_for_an_unknown_art_and_short_of_fragments_or_essence_alone() {
    let free = |character: &Character| (0..6).find(|place| !character.owns_fragment(1, *place)).unwrap_or(0);
    let mut character = ready_at(1);
    assert_eq!(character.ask(Ask::RiseArt { art: 9, fragment: 0 }, AT_COUNTER, &DICE), Err(Refusal::NoSuchFaction));
    let mut short_of_fragments = ready_at(3);
    short_of_fragments.materials.weapon_essence = 50;
    short_of_fragments.materials.armor_essence = 50;
    let rise = Ask::RiseArt { art: 1, fragment: free(&short_of_fragments) };
    assert_eq!(short_of_fragments.ask(rise, AT_COUNTER, &DICE), Err(Refusal::Short), "no fragments for the rise to 4");
    let mut short_of_essence = ready_at(4);
    short_of_essence.materials.weapon_fragments = 50;
    short_of_essence.materials.armor_fragments = 50;
    let rise = Ask::RiseArt { art: 1, fragment: free(&short_of_essence) };
    assert_eq!(short_of_essence.ask(rise, AT_COUNTER, &DICE), Err(Refusal::Short), "no Essence for the rise to 5");
    assert_eq!(short_of_essence.art_level(1), 4, "nothing risen");
}

/// A day the Tailor shows a cosmetic sold from `level`, and that cosmetic's number.
fn tailor_day_selling_from(level: u8) -> (u64, u16) {
    (0..400)
        .find_map(|day| {
            let shown = sold_on(Seller::Tailor, day);
            let sold_from = |number: &u16| {
                matches!(cosmetics()[usize::from(*number)].source, Source::Sold { level: from, .. } if from == level)
            };
            shown.into_iter().find(sold_from).map(|number| (day, number))
        })
        .expect("a day the Tailor sells one")
}

#[test]
fn a_cosmetic_is_refused_unknown_never_sold_too_high_and_short() {
    let mut character = Character::starting();
    assert_eq!(character.ask(Ask::WearCosmetic { cosmetic: 9_999 }, AFIELD, &DICE), Err(Refusal::NoSuchCosmetic));
    for never_sold in ["own_colours", "stormcaller_blue"] {
        let cosmetic = number_of(never_sold).expect("in the catalogue");
        assert_eq!(character.ask(Ask::BuyCosmetic { cosmetic }, AT_COUNTER, &DICE), Err(Refusal::NotSold));
    }
    let (day, cosmetic) = tailor_day_selling_from(20);
    character.materials.aurem = 1_000_000;
    let there = Here { day, ..AT_COUNTER };
    assert_eq!(character.ask(Ask::BuyCosmetic { cosmetic }, there, &DICE), Err(Refusal::TooLow));
    let (day, cosmetic) = tailor_day_selling_from(1);
    character.materials.aurem = 0;
    let there = Here { day, ..AT_COUNTER };
    assert_eq!(character.ask(Ask::BuyCosmetic { cosmetic }, there, &DICE), Err(Refusal::Short));
}

#[test]
fn shapes_piece_is_refused_with_its_slot_full() {
    let mut character = Character::starting();
    character.xp = crate::power::xp_for_level(20);
    let here = Here { social: true, day: 0, pledge: 0, rank: 0, week: 5_000 };
    let bucket = crate::shape::wares(here.week)[0].bucket;
    while character.carried_in(bucket) < CARRIED_MOST {
        character.add_shapes(200);
        assert!(
            character.ask(Ask::BuyFromShape { ware: 0, shown: crate::shape::shown(here.week, 0) }, here, &DICE).is_ok()
        );
    }
    let shapes = character.materials.shapes;
    assert_eq!(
        character.ask(Ask::BuyFromShape { ware: 0, shown: crate::shape::shown(here.week, 0) }, here, &DICE),
        Err(Refusal::CarriedFull)
    );
    assert_eq!(character.materials.shapes, shapes, "nothing spent");
}
