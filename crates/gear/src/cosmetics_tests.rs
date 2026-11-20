//! Cosmetics: the catalogue read whole, the start's kept and worn, each seller's wares of the day, buying and wearing.

use crate::asks::{Ask, Here, Refusal};
use crate::character::Character;
use crate::cosmetics::{CosmeticKind, SOLD_A_DAY, Seller, cosmetics, number_of, sold_on};
use crate::dice::Dice;
use crate::emblems::Source;

const AT_COUNTER: Here = Here { social: true, day: 20_400, week: 0 };
const DICE: Dice = Dice { seed: 1, tick: 1, player: 1 };

#[test]
fn the_catalogue_reads_whole_with_one_start_of_each_kind() {
    for kind in [CosmeticKind::Dye, CosmeticKind::Coat, CosmeticKind::Barding] {
        let starts = cosmetics().iter().filter(|found| found.kind == kind && found.source == Source::Start).count();
        assert_eq!(starts, 1, "{kind:?}");
    }
    let mut ids: Vec<&str> = cosmetics().iter().map(|found| found.id.as_str()).collect();
    ids.sort_unstable();
    ids.dedup();
    assert_eq!(ids.len(), cosmetics().len(), "no id twice");
}

#[test]
fn a_new_player_keeps_and_wears_the_starts() {
    let character = Character::starting();
    let worn = &character.cosmetics;
    assert_eq!((worn.dye.as_str(), worn.coat.as_str(), worn.barding.as_str()), ("own_colours", "bay", "bare"));
    assert!(character.keeps_cosmetic("bay") && !character.keeps_cosmetic("ember_plate"));
}

#[test]
fn each_seller_shows_a_few_of_its_own_the_same_all_day() {
    for seller in [Seller::Tailor, Seller::Tack] {
        let today = sold_on(seller, 20_400);
        assert_eq!(today.len(), SOLD_A_DAY);
        assert_eq!(today, sold_on(seller, 20_400));
        for number in &today {
            let found = &cosmetics()[usize::from(*number)];
            assert_eq!(found.kind.seller(), seller);
            assert!(matches!(found.source, Source::Sold { .. }));
        }
    }
    let days: Vec<Vec<u16>> = (0..20).map(|day| sold_on(Seller::Tack, day)).collect();
    assert!(days.windows(2).any(|pair| pair[0] != pair[1]), "the wares turn with the days");
}

#[test]
fn a_cosmetic_is_bought_at_its_counter_once_and_worn_in_its_kind() {
    let mut character = Character::starting();
    character.materials.aurem = 25_000;
    let sold = sold_on(Seller::Tack, AT_COUNTER.day);
    let cheap = sold
        .iter()
        .copied()
        .find(|number| matches!(cosmetics()[usize::from(*number)].source, Source::Sold { level: 1, .. }));
    let number = cheap.expect("a mount piece for any level that day");
    let found = &cosmetics()[usize::from(number)];
    assert_eq!(character.ask(Ask::WearCosmetic { cosmetic: number }, AT_COUNTER, &DICE), Err(Refusal::NotKept));
    let afield = Here { social: false, ..AT_COUNTER };
    assert_eq!(character.ask(Ask::BuyCosmetic { cosmetic: number }, afield, &DICE), Err(Refusal::NotHere));
    assert!(character.ask(Ask::BuyCosmetic { cosmetic: number }, AT_COUNTER, &DICE).is_ok());
    assert!(character.keeps_cosmetic(&found.id));
    assert_eq!(character.ask(Ask::BuyCosmetic { cosmetic: number }, AT_COUNTER, &DICE), Err(Refusal::Kept));
    assert!(character.ask(Ask::WearCosmetic { cosmetic: number }, Here::default(), &DICE).is_ok(), "worn anywhere");
    assert_eq!(character.cosmetics.worn(found.kind), found.id);
    let unsold = (0..cosmetics().len()).filter_map(|at| u16::try_from(at).ok()).find(|at| !sold.contains(at));
    let unsold = unsold.expect("one not sold today");
    assert_eq!(character.ask(Ask::BuyCosmetic { cosmetic: unsold }, AT_COUNTER, &DICE), Err(Refusal::NotSold));
    let back = Character::from_json(&character.to_json()).expect("a character");
    assert_eq!(back.cosmetics, character.cosmetics);
}

#[test]
fn a_worn_cosmetic_not_kept_or_of_the_wrong_kind_is_the_start_once_read() {
    let mut character = Character::starting();
    character.cosmetics.dye = "ember_plate".to_owned();
    character.cosmetics.coat = "palomino".to_owned();
    let back = Character::from_json(&character.to_json()).expect("a character");
    assert_eq!((back.cosmetics.dye.as_str(), back.cosmetics.coat.as_str()), ("own_colours", "bay"));
    assert_eq!(number_of("own_colours"), Some(0));
}
