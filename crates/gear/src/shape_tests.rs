//! Shape: here from Friday 09:00 to Sunday 21:00 UTC, one place and six pieces a week of the clock's, from Tuesday
//! 09:00 UTC, sold for Shapes, which only the Elite and Abyss seas give.

use crate::asks::{Ask, Here, Refusal};
use crate::character::Character;
use crate::clock::week_of;
use crate::dice::Dice;
use crate::kinds::Slot;
use crate::rarity::Rarity;
use crate::shape::{LEGENDARY_TICKS, PLACES, WARES, minutes_left, place, present, price, wares};
use crate::source::Source;

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
        assert!(piece.bucket != Slot::Cloak);
    }
    assert_eq!(wares(week), pieces);
}

#[test]
fn his_legendaries_are_rolled_in_their_contents_set_one_per_slot() {
    let sold = [Source::World, Source::Dungeon, Source::Sea, Source::Elite, Source::Abyss];
    let mut contents = std::collections::BTreeSet::new();
    for week in 2_900..3_000 {
        let pieces = wares(week);
        let slots: std::collections::BTreeSet<_> = pieces[..4].iter().map(|piece| piece.bucket).collect();
        assert_eq!(slots.len(), 4, "one Legendary per Vestige slot drawn, week {week}");
        for piece in &pieces[..4] {
            assert_eq!(piece.named, None, "a rolled Legendary, never a named one, week {week}");
            assert!(Slot::VESTIGE.contains(&piece.bucket) && sold.contains(&piece.source), "week {week}");
            assert!(!piece.layout.is_empty() && !piece.breach, "its traits rolled, week {week}");
            contents.insert(piece.source as u8);
        }
        for piece in &pieces[4..] {
            assert!(piece.named.is_some() && piece.source != Source::Faction, "an Atheric keeps its name");
        }
    }
    assert_eq!(contents.len(), sold.len(), "each of the five contents comes some week");
}

#[test]
fn no_week_sells_one_atheric_twice() {
    for week in 2_900..3_420 {
        let named: std::collections::BTreeSet<_> = wares(week).into_iter().filter_map(|piece| piece.named).collect();
        assert_eq!(named.len(), WARES - 4, "week {week}");
    }
}

#[test]
fn an_atheric_is_shown_by_its_place_in_the_catalogue() {
    let atheric = wares(5_000)[4].named.clone();
    let place = crate::catalogue::catalogue().items.iter().position(|entry| Some(&entry.id) == atheric.as_ref());
    assert_eq!(place.and_then(|place| u32::try_from(place).ok()), Some(shown(4)));
}

#[test]
fn a_rolled_legendary_is_bought_by_its_weeks_number_and_last_weeks_page_is_refused() {
    let mut character = Character::starting();
    character.xp = crate::power::xp_for_level(20);
    character.add_shapes(100);
    let here = Here { social: true, day: 0, pledge: 0, rank: 0, week: 5_000 };
    let stale = crate::shape::shown(4_999, 0);
    assert_ne!(stale, shown(0), "another week's piece has another number");
    assert_eq!(character.ask(Ask::BuyFromShape { ware: 0, shown: stale }, here, &DICE), Err(Refusal::NotSold));
    assert!(character.ask(Ask::BuyFromShape { ware: 0, shown: shown(0) }, here, &DICE).is_ok());
    let bought = character.items.values().map(|(item, _)| item).find(|item| item.rarity == Rarity::Legendary);
    let mut sold = wares(5_000)[0].clone();
    sold.id = bought.map_or(0, |item| item.id);
    assert_eq!(bought, Some(&sold), "the piece shown, rolled as the week rolled it");
}

/// The number of the piece Shape shows at a place in the tests' week, as a page names it.
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

#[test]
fn a_weeks_legendaries_roll_on_ticks_no_other_roll_of_his_week_takes() {
    // The shuffles take ticks 1 + rarity and the wares' elements 1 + ware: all below the Legendaries' own.
    let taken = [1 + Rarity::Legendary as u64, 1 + Rarity::Atheric as u64, WARES as u64];
    assert!(taken.iter().all(|tick| *tick < LEGENDARY_TICKS));
}
