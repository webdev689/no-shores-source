use crate::atheric_bounty::{StepKind, Toward, bounties, is_bounty_item, problems};
use crate::catalogue::catalogue;
use crate::dice::Dice;
use crate::dive::dive_tests::diving;
use crate::kinds::{Kind, Slot};
use crate::lamps::Zone;
use crate::rarity::Rarity;

const SALTMERE: &str = "continent-1";

fn at_twenty() -> crate::Character {
    let mut character = diving();
    character.earn_xp(10_000_000, None);
    character
}

#[test]
fn lanternfall_is_the_first_atheric_bounty_as_the_design_says() {
    assert!(problems().is_empty(), "{:?}", problems());
    let lanternfall = &bounties()[0];
    assert_eq!(
        (lanternfall.item.as_str(), lanternfall.island.as_str(), lanternfall.level),
        ("lanternfall", SALTMERE, 20)
    );
    assert_eq!(lanternfall.words, "Cold, and heavier than it looks. Something in it still wants to burn.");
    let steps: Vec<(StepKind, u32)> = lanternfall.steps.iter().map(|step| (step.kind, step.count)).collect();
    assert_eq!(steps, [(StepKind::Lamp, 1), (StepKind::Kindle, 5), (StepKind::Fell, 100), (StepKind::Lamp, 1)]);
    assert_eq!((lanternfall.steps[2].weapon, lanternfall.steps[3].lamp), (Some(Kind::Thunderlock), Some(4)));
}

#[test]
fn lanternfall_comes_from_no_vestige_and_no_shape() {
    assert!(is_bounty_item("lanternfall"));
    for slot in Slot::VESTIGE {
        assert!(catalogue().vestige_pool(Rarity::Atheric, slot).all(|named| named.id != "lanternfall"), "{slot:?}");
    }
    assert!(catalogue().problems().is_empty(), "{:?}", catalogue().problems());
}

#[test]
fn the_cold_lantern_drops_past_depth_fourteen_for_a_level_twenty_who_holds_none() {
    let rate = |depth: u8, lamp: Option<u8>| {
        let found = (0..4_000)
            .filter(|&seed| at_twenty().roll_find(SALTMERE, depth, lamp, &Dice { seed, tick: 0, player: 0 }))
            .count();
        found as f64 / 4_000.0
    };
    assert_eq!(rate(14, None), 0.0);
    assert!((rate(15, None) - 0.03).abs() < 0.01, "{}", rate(15, None));
    assert!((rate(20, Some(4)) - 0.12).abs() < 0.02, "{}", rate(20, Some(4)));
    let mut low = diving();
    assert!(!(0..400).any(|seed| low.roll_find(SALTMERE, 20, Some(4), &Dice { seed, tick: 0, player: 0 })), "below 20");
    let mut elsewhere = at_twenty();
    assert!(!(0..400).any(|seed| elsewhere.roll_find("continent-2", 20, Some(4), &Dice { seed, tick: 0, player: 0 })));
}

#[test]
fn the_lantern_kept_at_a_lamp_begins_the_bounty_and_its_last_step_gives_lanternfall_as_found() {
    let mut character = at_twenty();
    let seed = (0..).find(|&seed| at_twenty().roll_find(SALTMERE, 20, Some(4), &Dice { seed, tick: 0, player: 0 }));
    assert!(character.roll_find(SALTMERE, 20, Some(4), &Dice { seed: seed.expect("found"), tick: 0, player: 0 }));
    let zone = |depth: u8| Zone { island: SALTMERE, week: 9, zone: 0, depth, level: 28 };
    let dice = Dice { seed: 7, tick: 0, player: 0 };
    character.light_lamp(zone(5), 1, (60, 9), &dice).expect("lit");
    assert_eq!(character.atheric_bounties.held.get("lanternfall"), Some(&(1, 0)), "brought to a lamp");
    for _ in 0..5 {
        character.toward_bounties(Toward::Kindled { island: SALTMERE });
    }
    assert!(!character.toward_bounties(Toward::Felled { island: SALTMERE, weapon: Some(Kind::Sword) }));
    for _ in 0..100 {
        character.toward_bounties(Toward::Felled { island: SALTMERE, weapon: Some(Kind::Thunderlock) });
    }
    assert_eq!(character.atheric_bounties.held.get("lanternfall"), Some(&(3, 0)));
    character.light_lamp(zone(15), 3, (60, 9), &dice).expect("lit");
    assert_eq!(character.atheric_bounties.held.get("lanternfall"), Some(&(3, 0)), "the fourth lamp alone");
    let owned = |character: &crate::Character| {
        character.items.values().any(|(item, _)| item.named.as_deref() == Some("lanternfall"))
    };
    assert!(!owned(&character));
    character.light_lamp(zone(20), 4, (60, 9), &dice).expect("lit");
    assert!(owned(&character), "kept as found");
    assert!(character.atheric_bounties.finished.contains("lanternfall"));
    assert!(
        !character.roll_find(SALTMERE, 20, Some(4), &Dice { seed: seed.expect("found"), tick: 0, player: 0 }),
        "finished"
    );
}

#[test]
fn a_death_loses_the_lantern_with_the_haul() {
    let mut character = at_twenty();
    let seed = (0..).find(|&seed| at_twenty().roll_find(SALTMERE, 20, Some(4), &Dice { seed, tick: 0, player: 0 }));
    character.roll_find(SALTMERE, 20, Some(4), &Dice { seed: seed.expect("found"), tick: 0, player: 0 });
    character.lose_haul();
    character
        .light_lamp(
            Zone { island: SALTMERE, week: 9, zone: 0, depth: 20, level: 28 },
            4,
            (60, 9),
            &Dice { seed: 1, tick: 0, player: 0 },
        )
        .expect("lit");
    assert!(character.atheric_bounties.held.is_empty());
}

#[test]
fn the_lantern_banked_by_a_lamps_home_has_its_first_step_done() {
    let mut character = at_twenty();
    character.passage.as_mut().expect("diving").lamp = 1;
    let seed = (0..).find(|&seed| at_twenty().roll_find(SALTMERE, 20, Some(4), &Dice { seed, tick: 0, player: 0 }));
    assert!(character.roll_find(SALTMERE, 20, Some(4), &Dice { seed: seed.expect("found"), tick: 0, player: 0 }));
    character.go_home(0, Some(1)).expect("home");
    assert_eq!(character.atheric_bounties.held.get("lanternfall"), Some(&(1, 0)), "brought to a lamp");

    let mut character = at_twenty();
    character.go_home(0, Some(0)).expect("home");
    assert!(character.roll_find(SALTMERE, 20, Some(4), &Dice { seed: seed.expect("found"), tick: 0, player: 0 }));
    character.leave_passages(Some(SALTMERE));
    assert_eq!(character.atheric_bounties.held.get("lanternfall"), Some(&(1, 0)), "found on the way out, kept home");
}
