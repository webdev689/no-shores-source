//! Answers to blows: a swordsman that sees a swing begin parries some in time, pressing its guard so the parry window
//! spans the landing, and ripostes at once after a parry; one waiting its turn holds its shield up; a skirmisher hops
//! aside; and none answers faster than its reaction time.

mod common;

use combat::fighter::Swing;
use combat::{Happening, Stroke, Verdict};
use common::{Room, standing_still};
use core::f64::consts::PI;
use foes::Kind;

const PLAYER: u32 = 1;
const SWINGS_AT: u64 = 5;

/// A player that swings once, at SWINGS_AT, looking north at a foe standing just in reach.
fn one_swing(room: &Room, _me: u32) -> combat::Intent {
    let mut intent = standing_still(0.0);
    if room.tick == SWINGS_AT {
        intent.combat.attack = Some(Stroke::Down);
    }
    intent
}

/// The room after one swing at a foe of `kind` 1.5 m north of the player: the verdict on the swing, the tick the foe
/// first pressed its guard or its dodge, and whether it then riposted.
fn answered(kind: Kind, seed: u64) -> (Option<Verdict>, Option<u64>, bool) {
    let mut room = Room::new(seed).player(PLAYER, 0.0, 0.0, 0.0).foe(10, kind, 0.0, -1.5, PI);
    room.run(120, &mut one_swing);
    let verdict =
        room.verdicts.iter().find(|(_, by, on, _)| *by == PLAYER && *on == 10).map(|(_, _, _, verdict)| *verdict);
    let pressed = room
        .foe_intents(10)
        .iter()
        .find(|(_, intent)| intent.combat.guard || intent.combat.dodge)
        .map(|(tick, _)| *tick);
    let riposted = room.happenings.iter().any(|(_, by, happening)| {
        *by == 10 && matches!(happening, Happening::Swung(attack) if attack.swing == Swing::Riposte(PLAYER))
    });
    (verdict, pressed, riposted)
}

#[test]
fn a_swordsman_parries_some_swings_in_time_never_sooner_than_it_could_and_ripostes_after() {
    let lands = SWINGS_AT + 24;
    let (mut parried, mut riposted) = (0, 0);
    for seed in 1..=60 {
        let (verdict, pressed, riposte) = answered(Kind::Swordsman, seed);
        if let Some(pressed) = pressed {
            assert!(pressed >= SWINGS_AT + 16, "never sooner than its reaction time: {pressed}");
        }
        if let Some(Verdict::Parried) = verdict {
            parried += 1;
            let pressed = pressed.expect("a parry was pressed");
            assert!(lands - pressed <= 12, "its window spans the landing: pressed {pressed}, lands {lands}");
            riposted += usize::from(riposte);
        }
        // Too late to raise a guard that would only block, it takes the blow rather than parry by accident.
        assert!(!matches!(verdict, Some(Verdict::Blocked { .. })), "seed {seed}: {verdict:?}");
    }
    assert!((2..=15).contains(&parried), "about one swing in eight: parried {parried} of 60");
    assert_eq!(riposted, parried, "a parry is answered at once with a riposte");
}

#[test]
fn a_swordsman_waiting_its_turn_holds_its_shield_up_and_blocks() {
    let mut room = Room::new(3)
        .player(PLAYER, 0.0, 0.0, 0.0)
        .foe(10, Kind::Swordsman, 0.0, -4.0, PI)
        .foe(11, Kind::Swordsman, 3.5, 2.0, -PI / 3.0)
        .foe(12, Kind::Swordsman, -3.5, 2.0, PI / 3.0);
    room.run(240, &mut |_, _| standing_still(0.0));
    let guarded_long = [10, 11, 12].iter().any(|foe| {
        let intents = room.foe_intents(*foe);
        intents.windows(60).any(|stretch| stretch.iter().all(|(_, intent)| intent.combat.guard))
    });
    assert!(guarded_long, "one without a turn waits on the ring behind its guard for a second at least");
}

#[test]
fn a_skirmisher_hops_aside_and_one_caught_by_the_blow_is_in_its_perfect_stretch() {
    let mut dodged = 0;
    for seed in 1..=30 {
        let (verdict, pressed, _) = answered(Kind::Skirmisher, seed);
        match verdict {
            Some(Verdict::Dodged { perfect }) => {
                dodged += 1;
                assert!(perfect, "pressed late enough to be perfect");
                assert!(pressed.is_some_and(|tick| tick >= SWINGS_AT + 15));
            }
            // Hopped clear of the blow's reach altogether: a dodge too.
            None if pressed.is_some() => dodged += 1,
            _ => {}
        }
    }
    assert!(dodged >= 8, "it dodges often: {dodged} of 30");
}

#[test]
fn a_brute_takes_the_blow() {
    for seed in 1..=10 {
        let (verdict, pressed, _) = answered(Kind::Brute, seed);
        assert_eq!(pressed, None);
        assert!(matches!(verdict, Some(Verdict::Hit { .. })), "{verdict:?}");
    }
}

#[test]
fn a_blow_from_behind_is_not_seen_coming() {
    for seed in 1..=20 {
        // The skirmisher faces north, away from the player south of it.
        let mut room = Room::new(seed).player(PLAYER, 0.0, 0.0, 0.0).foe(10, Kind::Skirmisher, 0.0, -1.5, 0.0);
        let mut swing_at_its_back = |room: &Room, _me: u32| {
            let mut intent = standing_still(0.0);
            if room.tick == 1 {
                intent.combat.attack = Some(Stroke::Down);
            }
            intent
        };
        room.run(26, &mut swing_at_its_back);
        let answered = room.foe_intents(10).iter().any(|(_, intent)| intent.combat.dodge || intent.combat.guard);
        assert!(!answered, "seed {seed}: it answered a blow at its back");
    }
}

#[test]
fn only_one_foe_at_a_time_strikes_an_opening_without_its_turn() {
    let mut board = foes::Board::default();
    assert!(board.opening(PLAYER, 10, true));
    assert!(!board.opening(PLAYER, 11, true), "the opening is 10's");
    assert!(board.opening(PLAYER, 10, true), "and stays 10's while it wants it");
    assert!(!board.opening(PLAYER, 10, false));
    assert!(board.opening(PLAYER, 11, true), "let go, 11 may take it");
    board.forget(11);
    assert!(board.opening(PLAYER, 12, true), "a foe gone frees it");
}
