//! Shape: here from Friday 09:00 to Sunday 21:00 UTC, one place and six pieces a week, sold for Shapes, which only
//! the Elite and Abyss seas give.

use crate::asks::{Ask, Here, Refusal};
use crate::character::Character;
use crate::dice::Dice;
use crate::kinds::Slot;
use crate::rarity::Rarity;
use crate::shape::{PLACES, WARES, found, place, present, price, wares, week_of};
use crate::world::Difficulty;

const DICE: Dice = Dice { seed: 5, tick: 9, player: 1 };

/// Minutes since 1970 at a UTC day and time of a month that starts 1,793,491,200 s after 1970, a Sunday, so its
/// 20th is a Friday.
fn in_month(day: u64, hour: u64, minute: u64) -> u64 {
    1_793_491_200 / 60 + (day - 1) * 1_440 + hour * 60 + minute
}

#[test]
fn shape_comes_friday_morning_and_goes_sunday_evening() {
    assert!(!present(in_month(20, 8, 59)), "Friday before nine");
    assert!(present(in_month(20, 9, 0)), "Friday at nine");
    assert!(present(in_month(22, 20, 59)), "Sunday evening");
    assert!(!present(in_month(22, 21, 0)), "gone at nine on Sunday");
    assert!(!present(in_month(24, 12, 0)), "Tuesday");
    assert_eq!(week_of(in_month(16, 0, 0)), week_of(in_month(22, 23, 59)), "one week from Monday");
    assert_ne!(week_of(in_month(22, 23, 59)), week_of(in_month(23, 0, 0)));
}

#[test]
fn each_week_has_its_place_and_its_six_pieces() {
    let week = week_of(in_month(20, 12, 0));
    assert!(place(week) < PLACES);
    assert_eq!(place(week), place(week), "the same all week");
    assert!((0..40).map(place).collect::<std::collections::BTreeSet<_>>().len() > 3, "the place moves");
    let pieces = wares(week);
    assert_eq!(pieces.len(), WARES);
    let rarities: Vec<Rarity> = pieces.iter().map(|piece| piece.rarity).collect();
    assert_eq!(&rarities[..4], [Rarity::Legendary; 4]);
    assert_eq!(&rarities[4..], [Rarity::Atheric; 2]);
    for piece in &pieces {
        assert_eq!(piece.level, 20);
        assert!(piece.named.is_some() && piece.bucket != Slot::Cloak);
    }
    assert_eq!(wares(week), pieces);
}

#[test]
fn no_week_sells_one_piece_twice() {
    for week in 2_900..3_420 {
        let named: std::collections::BTreeSet<_> = wares(week).into_iter().filter_map(|piece| piece.named).collect();
        assert_eq!(named.len(), WARES, "week {week}");
    }
}

#[test]
fn a_piece_is_bought_with_shapes_at_his_place() {
    let mut character = Character::starting();
    character.xp = crate::power::xp_for_level(20);
    let here = Here { social: true, day: 0, week: 5_000 };
    assert_eq!(character.ask(Ask::BuyFromShape { ware: 4 }, here, &DICE), Err(Refusal::Short));
    character.add_shapes(500);
    assert_eq!(character.materials.shapes, 200, "held to the most");
    let afield = Here { social: false, ..here };
    assert_eq!(character.ask(Ask::BuyFromShape { ware: 4 }, afield, &DICE), Err(Refusal::NotHere));
    character.xp = crate::power::xp_for_level(19);
    assert_eq!(character.ask(Ask::BuyFromShape { ware: 4 }, here, &DICE), Err(Refusal::TooLow), "made at level 20");
    character.xp = crate::power::xp_for_level(20);
    assert!(character.ask(Ask::BuyFromShape { ware: 4 }, here, &DICE).is_ok());
    assert_eq!(character.materials.shapes, 200 - price(Rarity::Atheric));
    let bought = character.items.values().map(|(item, _)| item).find(|item| item.rarity == Rarity::Atheric);
    assert_eq!(bought.map(|item| item.named.clone()), Some(wares(5_000)[4].named.clone()));
    assert_eq!(character.ask(Ask::BuyFromShape { ware: 9 }, here, &DICE), Err(Refusal::NoSuchItem));
}

#[test]
fn shapes_come_only_from_the_elite_and_abyss_seas() {
    let dice = |tick| Dice { seed: 11, tick, player: 2 };
    assert_eq!((0..2_000).map(|tick| found(false, Difficulty::Normal, &dice(tick))).sum::<u16>(), 0);
    assert_eq!(found(true, Difficulty::Normal, &dice(0)), 0, "not even a Boss at Normal");
    assert_eq!((found(true, Difficulty::Elite, &dice(0)), found(true, Difficulty::Abyss, &dice(0))), (2, 4));
    let elite: u16 = (0..4_000).map(|tick| found(false, Difficulty::Elite, &dice(tick))).sum();
    let abyss: u16 = (0..4_000).map(|tick| found(false, Difficulty::Abyss, &dice(tick))).sum();
    assert!((80..160).contains(&elite) && (180..300).contains(&abyss), "{elite} {abyss}");
}
