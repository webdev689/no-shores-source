//! Shape: here from Friday 09:00 to Sunday 21:00 UTC, one place and six pieces a week of the clock's, from Tuesday
//! 09:00 UTC, sold for Shapes, which only the Elite and Abyss seas give.

use crate::asks::{Ask, Here, Refusal};
use crate::character::Character;
use crate::clock::week_of;
use crate::dice::Dice;
use crate::kinds::Slot;
use crate::rarity::Rarity;
use crate::shape::{PLACES, WARES, minutes_left, place, present, price, wares};

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
    assert_eq!(minutes_left(in_month(20, 9, 0)), 2 * 1_440 + 12 * 60, "as he comes");
    assert_eq!(minutes_left(in_month(22, 20, 59)), 1, "a minute before he goes");
    assert_eq!((minutes_left(in_month(22, 21, 0)), minutes_left(in_month(20, 8, 59))), (0, 0), "none while away");
}

#[test]
fn his_place_and_wares_hold_from_one_tuesday_nine_to_the_next() {
    let week = week_of(in_month(20, 9, 0));
    for moment in [in_month(17, 9, 0), in_month(23, 0, 0), in_month(24, 8, 59)] {
        assert_eq!((place(week_of(moment)), wares(week_of(moment))), (place(week), wares(week)), "the visit's week");
    }
    let next = week_of(in_month(24, 9, 0));
    assert_eq!(next, week + 1, "the week turns at Tuesday 09:00");
    assert_eq!(week_of(in_month(17, 8, 59)), week - 1, "a minute before it is the week before");
    assert_ne!(wares(next), wares(week));
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

/// The named piece Shape shows at a place in the tests' week, as a page names it.
fn shown(ware: u8) -> u32 {
    crate::shape::shown(5_000, ware)
}

#[test]
fn a_piece_is_bought_with_shapes_at_his_place() {
    let mut character = Character::starting();
    character.xp = crate::power::xp_for_level(20);
    let here = Here { social: true, day: 0, pledge: 0, rank: 0, week: 5_000 };
    assert_eq!(character.ask(Ask::BuyFromShape { ware: 4, shown: shown(4) }, here, &DICE), Err(Refusal::Short));
    character.add_shapes(500);
    assert_eq!(character.materials.shapes, 200, "held to the most");
    let afield = Here { social: false, ..here };
    assert_eq!(character.ask(Ask::BuyFromShape { ware: 4, shown: shown(4) }, afield, &DICE), Err(Refusal::NotHere));
    character.xp = crate::power::xp_for_level(19);
    assert_eq!(
        character.ask(Ask::BuyFromShape { ware: 4, shown: shown(4) }, here, &DICE),
        Err(Refusal::TooLow),
        "made at level 20"
    );
    character.xp = crate::power::xp_for_level(20);
    let another = shown(3);
    let stale = character.ask(Ask::BuyFromShape { ware: 4, shown: another }, here, &DICE);
    assert_eq!(stale, Err(Refusal::NotSold), "a page shown another piece at that place buys nothing");
    assert!(character.ask(Ask::BuyFromShape { ware: 4, shown: shown(4) }, here, &DICE).is_ok());
    assert_eq!(character.materials.shapes, 200 - price(Rarity::Atheric));
    let bought = character.items.values().map(|(item, _)| item).find(|item| item.rarity == Rarity::Atheric);
    assert_eq!(bought.map(|item| item.named.clone()), Some(wares(5_000)[4].named.clone()));
    assert_eq!(character.ask(Ask::BuyFromShape { ware: 9, shown: shown(9) }, here, &DICE), Err(Refusal::NoSuchItem));
}
