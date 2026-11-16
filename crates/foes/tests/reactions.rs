//! Answers to blows: a swordsman that sees a swing begin raises its guard in time, pressing it so the parry window
//! spans the landing when it parries, and ripostes at once after a parry; a skirmisher hops aside in a dodge's perfect
//! stretch; and none answers faster than its reaction time.

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
fn a_swordsman_guards_or_parries_a_swing_in_time_and_ripostes_after_a_parry() {
    let lands = SWINGS_AT + 24;
    let (mut parried, mut blocked, mut riposted) = (0, 0, 0);
    for seed in 1..=40 {
        let (verdict, pressed, riposte) = answered(Kind::Swordsman, seed);
        let Some(pressed) = pressed else { continue };
        assert!(pressed >= SWINGS_AT + 12, "never sooner than its reaction time: {pressed}");
        match verdict {
            Some(Verdict::Parried) => {
                parried += 1;
                assert!(lands - pressed < 12, "its window spans the landing: pressed {pressed}, lands {lands}");
                riposted += usize::from(riposte);
            }
            Some(Verdict::Blocked { .. }) => blocked += 1,
            // A hop aside may take it out of the blow's reach altogether.
            Some(Verdict::Dodged { .. }) | None => {}
            other => panic!("it answered in time, yet the blow came to {other:?}"),
        }
    }
    assert!(parried >= 4 && blocked >= 4, "parried {parried}, blocked {blocked} of 40");
    assert_eq!(riposted, parried, "a parry is answered at once with a riposte");
}

#[test]
fn a_skirmisher_hops_aside_in_its_dodges_perfect_stretch() {
    let mut dodged = 0;
    for seed in 1..=30 {
        let (verdict, pressed, _) = answered(Kind::Skirmisher, seed);
        if let Some(Verdict::Dodged { perfect }) = verdict {
            dodged += 1;
            assert!(perfect, "pressed just before the landing");
            assert!(pressed.is_some_and(|tick| tick >= SWINGS_AT + 10));
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
