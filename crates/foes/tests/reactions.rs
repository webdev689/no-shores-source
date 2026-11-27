//! Answers to blows: a swordsman that sees a swing begin parries some in time, pressing its guard so the parry window
//! spans the landing, and ripostes at once after a parry; one waiting its turn holds its shield up; a skirmisher hops
//! aside, even out of its own swing; none answers faster than its reaction time, a swing's at the fight's pace; and so
//! even a Minor answers a swing, and the quickest still raise a guard that blocks a heavy blow.

mod common;

use combat::arms::{WeaponClass, swing_ticks};
use combat::fighter::{Action, Swing};
use combat::tuning::parry_window;
use combat::{Happening, Stroke, Verdict};
use common::{BRUTE, CAPTAIN, Room, SKIRMISHER, SWORDSMAN, standing_still};
use core::f64::consts::PI;
use foes::Rank::{self, Elite, Major, Minor};

const PLAYER: u32 = 1;
const COLLECTOR: u8 = 2;
const SWINGS_AT: u64 = 5;

/// A player that swings once, at SWINGS_AT, looking north at a foe standing just in reach.
fn one_swing(room: &Room, _me: u32) -> combat::Intent {
    let mut intent = standing_still(0.0);
    if room.tick == SWINGS_AT {
        intent.combat.attack = Some(Stroke::Down);
    }
    intent
}

/// The room after one swing at a foe of the type numbered `number`, a Major already alert, 1.5 m north of the player:
/// the verdict on the swing, the tick the foe first pressed its guard or its dodge, and whether it then riposted.
fn answered(number: u8, seed: u64) -> (Option<Verdict>, Option<u64>, bool) {
    answered_as(number, Major, seed)
}

fn answered_as(number: u8, rank: Rank, seed: u64) -> (Option<Verdict>, Option<u64>, bool) {
    answered_with(number, rank, "sword_steel", seed)
}

/// The same, the player's swing made with the weapon of a forge layer.
fn answered_with(number: u8, rank: Rank, layer: &str, seed: u64) -> (Option<Verdict>, Option<u64>, bool) {
    let room = Room::new(seed).player(PLAYER, 0.0, 0.0, 0.0).foe(10, number, rank, 0.0, -1.5, PI);
    let mut room = room.alert(10, PLAYER);
    room.set(PLAYER, |fighter| fighter.arms = combat::arms_of(layer, "", true));
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
    let lands = SWINGS_AT + u64::from(swing_ticks(WeaponClass::Sword).0);
    let reading = swing_reaction(SWORDSMAN, Major);
    let (mut parried, mut riposted) = (0, 0);
    for seed in 1..=60 {
        let (verdict, pressed, riposte) = answered(SWORDSMAN, seed);
        if let Some(pressed) = pressed {
            assert!(pressed >= SWINGS_AT + reading, "never sooner than its reaction time: {pressed}");
        }
        if let Some(Verdict::Parried) = verdict {
            parried += 1;
            let pressed = pressed.expect("a parry was pressed");
            let window = u64::from(parry_window(false));
            assert!(lands - pressed < window, "its window spans the landing: pressed {pressed}, lands {lands}");
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
        .foe(10, SWORDSMAN, Major, 0.0, -4.0, PI)
        .foe(11, SWORDSMAN, Major, 3.5, 2.0, -PI / 3.0)
        .foe(12, SWORDSMAN, Major, -3.5, 2.0, PI / 3.0);
    room.run(240, &mut |_, _| standing_still(0.0));
    let guarded_long = [10, 11, 12].iter().any(|foe| {
        let intents = room.foe_intents(*foe);
        intents.windows(60).any(|stretch| stretch.iter().all(|(_, intent)| intent.combat.guard))
    });
    assert!(guarded_long, "one without a turn waits on the ring behind its guard for a second at least");
}

#[test]
fn a_swordsman_waiting_on_its_answer_winds_up_no_blow_of_its_own() {
    // From seeing the swing begin to deciding its answer, its reaction time on.
    let reaction = swing_reaction(SWORDSMAN, Major);
    let (mut before, mut decided) = (0, 0);
    for seed in 1..=60 {
        let room = Room::new(seed).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -1.5, PI);
        let mut room = room.alert(10, PLAYER);
        room.run(SWINGS_AT + reaction + 1, &mut one_swing);
        let orders = room.orders(10);
        before += orders.iter().filter(|(tick, _)| *tick > SWINGS_AT && *tick < SWINGS_AT + reaction).count();
        decided += orders.len();
    }
    assert_eq!(before, 0, "no wind-up begun while it waits on its answer ({decided} after it decided)");
}

#[test]
fn a_skirmisher_hops_aside_and_one_caught_by_the_blow_is_in_its_perfect_stretch() {
    let mut dodged = 0;
    for seed in 1..=30 {
        let (verdict, pressed, _) = answered(SKIRMISHER, seed);
        match verdict {
            Some(Verdict::Dodged { perfect }) => {
                dodged += 1;
                assert!(perfect, "pressed late enough to be perfect");
                assert!(pressed.is_some_and(|tick| tick >= SWINGS_AT + swing_reaction(SKIRMISHER, Major)));
            }
            // Hopped clear of the blow's reach altogether: a dodge too.
            None if pressed.is_some() => dodged += 1,
            _ => {}
        }
    }
    assert!(dodged >= 8, "it dodges often: {dodged} of 30");
}

/// The ticks a foe of a type and rank takes to read a swing.
fn swing_reaction(number: u8, rank: Rank) -> u64 {
    foes::foe_type(number).expect("a type of the roster").numbers(rank, 1).swing_reaction()
}

#[test]
fn a_minor_reads_a_swing_at_the_fights_pace_and_hops_aside_from_some() {
    // A Minor skirmisher's reaction, 19 ticks, is longer than a sword's swing takes to land: read at the swings' own
    // pace, 14, it is in time.
    let reaction = foes::foe_type(SKIRMISHER).expect("a type of the roster").numbers(Minor, 1).reaction;
    assert!(reaction > u64::from(swing_ticks(WeaponClass::Sword).0));
    let dodged = (1..=60).filter(|seed| answered_as(SKIRMISHER, Minor, *seed).1.is_some()).count();
    assert!(dodged >= 4, "about one swing in five: {dodged} of 60");
}

#[test]
fn the_quickest_still_block_a_heavy_blow_at_the_fights_pace() {
    // A captain as an Elite reads a swing in 10 ticks; a warhammer's lands 20 after it begins: time to raise a guard
    // whose window, a foe's three quarters of a player's, closes before the blow, so it blocks rather than parries.
    let blocked = (1..=60)
        .filter(|seed| {
            matches!(answered_with(CAPTAIN, Elite, "warhammer_iron", *seed).0, Some(Verdict::Blocked { .. }))
        })
        .count();
    assert!(blocked >= 10, "a block share of 0.3, and parries pressed early: {blocked} of 60");
}

#[test]
fn a_skirmisher_in_its_own_swing_still_dodges_a_blow_at_it() {
    // A crew skirmisher standing as a foe and a Grey Tithe collector fight each other; neither flinches, so each swings
    // into the other's swing, and the skirmisher weighs the collector's blows while its own is under way.
    let mut dodged = 0;
    for seed in 1..=100 {
        let room = Room::new(seed).foe(10, SKIRMISHER, Major, 0.0, -1.5, PI).foe(11, COLLECTOR, Major, 0.0, 0.0, 0.0);
        let mut room = room.alert(10, 11).alert(11, 10);
        let mut swinging = Vec::new();
        for _ in 0..600 {
            if matches!(room.fighter(10).action, Action::Attack(_)) {
                swinging.push(room.tick);
            }
            room.step(&mut |_, _| standing_still(0.0));
        }
        let mid_swing = |tick: &u64| swinging.contains(tick);
        dodged += room.foe_intents(10).iter().filter(|(tick, intent)| intent.combat.dodge && mid_swing(tick)).count();
    }
    assert!(dodged >= 3, "it hops out of its own swing at times: {dodged} in 100 fights");
}

#[test]
fn a_brute_takes_the_blow() {
    for seed in 1..=10 {
        let (verdict, pressed, _) = answered(BRUTE, seed);
        assert_eq!(pressed, None);
        assert!(matches!(verdict, Some(Verdict::Hit { .. })), "{verdict:?}");
    }
}

#[test]
fn a_blow_from_behind_is_not_seen_coming() {
    for seed in 1..=20 {
        // The skirmisher faces north, away from the player south of it.
        let mut room = Room::new(seed).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SKIRMISHER, Major, 0.0, -1.5, 0.0);
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

/// The tick a crew skirmisher standing as a foe, alert and fighting a Grey Tithe runner before it, presses a dodge from
/// a bolt loosed at it from 40 m on tick 10, told to fly at `speed` (0: not told), if it dodges at all.
fn dodge_pressed(seed: u64, speed: f64) -> Option<u64> {
    let foe = |number: u8, y: f64, facing: f64| {
        foes::spawn(foes::foe_type(number).expect("a type of the roster"), Major, 0.0, y, facing)
    };
    let (skirmisher, mut brain) = foe(13, 0.0, 0.0);
    let (runner, _) = foe(1, -2.0, PI);
    let (bowman, _) = foe(3, -40.0, PI);
    let fighters = [(1, skirmisher), (2, runner), (3, bowman)];
    let mut board = foes::Board::default();
    let shout = foes::Seen::Shouted { from: [0.0, 0.0, 0.0], at: [0.0, -2.0, 0.0] };
    foes::notice(&mut brain, 1, &shout, 0);
    for tick in 1..60 {
        if tick == 10 {
            foes::notice(&mut brain, 1, &foes::Seen::Loosed { by: 3, speed }, tick);
        }
        let world = foes::World {
            tick,
            seed,
            fighters: &fighters,
            blocks: &[],
            terrain: &movement::Flat,
            routes: &foes::Straight,
            spots: &foes::NoSpots,
            director: foes::Director::default(),
        };
        let (next, intent) = foes::think(1, &brain, &mut board, &world);
        brain = next;
        if intent.combat.dodge && tick > 10 {
            return Some(tick);
        }
    }
    None
}

#[test]
fn a_foe_times_a_shot_at_it_by_the_speed_the_room_tells_so_an_aimed_one_is_met_in_time() {
    // A crossbow's aimed bolt flies at 71.5 m/s, a third again its plain one's 55: from 40 m it lands on tick 44.
    let lands = 10 + combat::ticks(40.0 / 71.5);
    let pressed: Vec<u64> = (0..60).filter_map(|seed| dodge_pressed(seed, 71.5)).collect();
    assert!(pressed.len() >= 10, "it dodges some: {pressed:?}");
    assert!(pressed.iter().all(|tick| *tick + 2 <= u64::from(lands)), "each before the bolt lands: {pressed:?}");
}
