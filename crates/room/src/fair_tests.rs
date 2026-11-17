//! What keeps a room fair whatever a browser sends or however its line stalls: no banked time spent as speed, no
//! dodge frozen open, no weapon swapped mid-swing, a view that cannot leap, a full room, a gun judged as its shooter
//! saw, a foe's answers that count the same at any lag, and the grace a player stands again with.

use super::*;
use combat::arms::{OffHand, Ranged, Stroke, WeaponClass};
use combat::{CombatInput, Intent};
use movement::Controls;
use std::collections::BTreeMap;

const FISTS: u32 = 0;
const WARHAMMER: u32 = 6;

fn room() -> Room {
    Room::new(Vec::new(), (0.0, 0.0))
}

fn asking(sequence: u32, seen: u64, arms: u32, combat: CombatInput, forward: f64) -> Input {
    let controls = Controls { yaw: 0.0, forward, ..Controls::default() };
    Input { sequence, intent: Intent { controls, combat }, arms, seen, ..Input::default() }
}

fn stand(room: &mut Room, kind: ::foes::Kind, x: f64, y: f64) -> FighterId {
    let id = room.next_id();
    let (fighter, brain) = ::foes::spawn(kind, x, y, core::f64::consts::PI);
    room.foes.insert(id, Foe { fighter, kind: kind as u8, brain, level: 0, struck_by: BTreeMap::new() });
    id
}

#[test]
fn time_spent_away_is_not_banked_and_spent_as_speed() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    for _ in 0..600 {
        room.tick();
    }
    for sequence in 1..=30 {
        room.input(player, asking(sequence, room.clock(), FISTS, CombatInput::default(), 1.0)).unwrap();
    }
    let before = room.fighter(player).expect("in the room").body;
    room.tick();
    let after = room.fighter(player).expect("in the room").body;
    let moved = (after.y - before.y).abs();
    assert!(moved < 0.1 * 4.0, "three ticks of walking at most, not thirty: {moved} m");
}

#[test]
fn a_player_who_stops_sending_mid_dodge_does_not_stay_in_its_safe_stretch() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let dodge = CombatInput { dodge: true, ..CombatInput::default() };
    room.input(player, asking(1, room.clock(), FISTS, dodge, 0.0)).unwrap();
    room.tick();
    assert!(matches!(room.fighter(player).expect("in").action, Action::Dodge { .. }));
    for _ in 0..80 {
        room.tick();
    }
    let fighter = room.fighter(player).expect("in");
    assert_eq!(fighter.action, Action::Idle, "stepped standing once a view's lag behind");
    assert!(fighter.dodging().is_none());
}

#[test]
fn a_weapon_changes_only_at_rest_never_in_the_middle_of_a_swing() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    crate::power::hold(&mut room, player, gear::Kind::Warhammer);
    let jab = CombatInput { attack: Some(Stroke::Down), ..CombatInput::default() };
    room.input(player, asking(1, room.clock(), FISTS, jab, 0.0)).unwrap();
    room.tick();
    for sequence in 2..=10 {
        room.input(player, asking(sequence, room.clock(), WARHAMMER, CombatInput::default(), 0.0)).unwrap();
        room.tick();
    }
    let swinging = room.fighter(player).expect("in");
    assert!(matches!(swinging.action, Action::Attack(_)));
    assert_eq!(swinging.arms.melee, WeaponClass::Fists, "the fists' swing is the fists' to the end");
    for sequence in 11..=80 {
        room.input(player, asking(sequence, room.clock(), WARHAMMER, CombatInput::default(), 0.0)).unwrap();
        room.tick();
    }
    assert_eq!(room.fighter(player).expect("in").arms.melee, WeaponClass::Warhammer);
}

#[test]
fn the_tick_a_player_says_they_saw_moves_on_a_few_at_a_time_and_a_full_room_turns_others_away() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    for _ in 0..30 {
        room.tick();
    }
    let behind = room.clock() - 20;
    room.input(player, asking(1, behind, FISTS, CombatInput::default(), 0.0)).unwrap();
    room.tick();
    let first = room.players[&player].seen;
    room.input(player, asking(2, room.clock(), FISTS, CombatInput::default(), 0.0)).unwrap();
    room.tick();
    assert_eq!(room.players[&player].seen, first + players::SEEN_STEP, "it may not leap to now");
    while room.players.len() < PLAYERS_MOST {
        room.join().expect("room to spare");
    }
    assert_eq!(room.join(), None);
}

#[test]
fn a_ball_is_judged_against_the_foe_where_the_shooters_screen_showed_it() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let foe = stand(&mut room, ::foes::Kind::Brute, 3.0, -5.0);
    let mut shooter = *room.fighter(player).expect("in");
    shooter.arms = combat::Arms { melee: WeaponClass::Fists, ranged: Some(Ranged::Pistolet), off_hand: OffHand::Empty };
    let mut seen_then = *room.fighter(foe).expect("in");
    seen_then.body = standing(0.0, -5.0);
    let view = vec![(player, shooter), (foe, seen_then)];
    let ball = combat::shots::loose(player, Ranged::Pistolet, shooter.chest(), 0.0, 0.0, 1.0);
    room.shoot_seen(&ball, &view);
    let events = room.take_events();
    assert!(events.iter().any(|event| event.kind == EventKind::Hit && event.defender == foe), "{events:?}");
}

#[test]
fn a_foes_guard_counts_as_it_stands_now_and_its_body_where_the_striker_saw_it() {
    let mut room = room();
    let foe = stand(&mut room, ::foes::Kind::Swordsman, 5.0, -5.0);
    room.foes.get_mut(&foe).expect("stood").fighter.action = Action::Guard { elapsed: 2, window: 12 };
    let mut then = *room.fighter(foe).expect("stood");
    then.body = standing(0.0, -1.5);
    then.action = Action::Idle;
    let seen = room.as_seen(foe, &[(foe, then)]).expect("seen");
    assert_eq!((seen.body.x, seen.body.y), (0.0, -1.5));
    assert_eq!(seen.guarding(), Some(true), "its parry window, raised since, counts");
}

#[test]
fn a_player_who_stands_again_is_left_be_until_they_strike() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    stand(&mut room, ::foes::Kind::Swordsman, 0.0, -1.5);
    room.players.get_mut(&player).expect("in").fighter.action = Action::Dead { elapsed: combat::tuning::RESPAWN };
    for sequence in 1..=150 {
        room.input(player, asking(sequence, room.clock(), FISTS, CombatInput::default(), 0.0)).unwrap();
        room.tick();
    }
    let struck = room.take_events().iter().any(|event| event.defender == player && event.kind == EventKind::Hit);
    assert!(!struck, "no blow in its first two and a half seconds back");
    assert!(room.players[&player].graced > room.clock());
    let jab = CombatInput { attack: Some(Stroke::Down), ..CombatInput::default() };
    room.input(player, asking(151, room.clock(), FISTS, jab, 0.0)).unwrap();
    room.tick();
    assert_eq!(room.players[&player].graced, 0, "striking ends it");
}

#[test]
fn an_aimed_shot_is_aimed_up_for_its_fall_and_carries_its_whole_line() {
    for ahead in [20.0, 45.0] {
        let mut room = room();
        let archer = stand(&mut room, ::foes::Kind::Archer, 0.0, -ahead);
        let foe = *room.fighter(archer).expect("stood");
        let order = combat::shapes::TelegraphOrder {
            shape: combat::shapes::Shape::Aimed,
            windup: 36,
            iron: false,
            feint_at: None,
            bearing: core::f64::consts::PI,
            ahead,
        };
        let aimed = combat::shapes::Telegraph::begin(&order, [0.0, -ahead, 0.0]);
        room.telegraph_lands(archer, &foe, &aimed);
        let mut shot = room.shots.pop().expect("an arrow leaves");
        let landed = loop {
            match combat::shots::fly(&shot, &[], &[]) {
                combat::shots::Flight::Flying(next) => shot = next,
                combat::shots::Flight::Stopped { at, .. } => break at,
            }
        };
        assert!(landed[1] >= -0.5, "at {ahead} m it carries to the end of its line: came down at {landed:?}");
    }
}
