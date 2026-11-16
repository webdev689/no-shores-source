use super::*;
use combat::arms::{OffHand, Stroke, WeaponClass};
use combat::{CombatInput, Intent};
use judging::{Check, How};
use movement::Controls;

const SWORD: u32 = 2;

fn room() -> Room {
    Room::new(Vec::new(), (0.0, 0.0))
}

/// A foe of a kind standing at (x, y), facing south, put straight into the room.
fn stand(room: &mut Room, kind: ::foes::Kind, x: f64, y: f64) -> FighterId {
    let id = room.next_id();
    let (fighter, brain) = ::foes::spawn(kind, x, y, core::f64::consts::PI);
    room.foes.insert(id, Foe { fighter, kind: kind as u8, brain });
    id
}

/// A brute 1.5 m north of the origin: it never guards, parries or dodges.
fn stand_foe(room: &mut Room) -> FighterId {
    stand(room, ::foes::Kind::Brute, 0.0, -1.5)
}

/// A swordsman far out of sight, and a copy of it as though it stood 1.5 m north of the origin, to strike from.
fn far_foe(room: &mut Room) -> (FighterId, Fighter) {
    let id = stand(room, ::foes::Kind::Swordsman, 0.0, -60.0);
    let mut near = *room.fighter(id).unwrap();
    near.body = standing(0.0, -1.5);
    near.aim = core::f64::consts::PI;
    (id, near)
}

fn asking(sequence: u32, seen: u64, combat: CombatInput) -> Input {
    let controls = Controls { yaw: 0.0, ..Controls::default() };
    Input { sequence, intent: Intent { controls, combat }, arms: SWORD, seen, ..Input::default() }
}

#[test]
fn a_players_swing_lands_on_a_foe_in_reach_and_everyone_is_told() {
    let mut room = room();
    let player = room.join();
    let foe = stand_foe(&mut room);
    assert_eq!(combat::Arms::from_code(SWORD).melee, WeaponClass::Sword);
    let chop = CombatInput { attack: Some(Stroke::Down), ..CombatInput::default() };
    for sequence in 1..=30 {
        let held = if sequence == 1 { chop } else { CombatInput::default() };
        room.input(player, asking(sequence, room.clock(), held)).unwrap();
        room.tick();
    }
    let events = room.take_events();
    let hit = events.iter().find(|event| event.kind == EventKind::Hit).expect("the chop lands");
    assert_eq!((hit.striker, hit.defender, hit.how), (player, foe, Some(How::Swing)));
    assert!((hit.amount - 14.0 * 1.15).abs() < 1e-9);
    assert!((room.fighter(foe).unwrap().health - (130.0 - 14.0 * 1.15)).abs() < 1e-9);
    assert_eq!(room.fighter(player).unwrap().target, Some(foe), "the lock takes the foe it struck");
}

#[test]
fn a_blow_on_a_player_waits_for_their_view_and_is_judged_as_they_stood_then() {
    let mut room = room();
    let player = room.join();
    let (foe, striker) = far_foe(&mut room);
    // The player's screen lags: every input sees the room 6 ticks behind its clock.
    let lag = 6;
    for sequence in 1..=10 {
        room.input(player, asking(sequence, room.clock().saturating_sub(lag), CombatInput::default())).unwrap();
        room.tick();
    }
    let attack = combat::fighter::Attack {
        stroke: Stroke::Down,
        elapsed: 24,
        strike: 24,
        end: 60,
        swing: combat::fighter::Swing::Plain,
        left_hand: false,
    };
    let blow = combat::judge::swing_blow(foe, &striker, &attack, player);
    room.blow_lands(&blow, How::Swing, player, Check::Swing { striker: Box::new(striker), attack });
    let landed = room.clock();
    // The player sees the blow coming only when their view reaches it, and raises their guard then: parried.
    let guard = CombatInput { guard: true, ..CombatInput::default() };
    let mut sequence = 11;
    while room.pending.len() == 1 {
        let seen = room.clock().saturating_sub(lag);
        room.input(player, asking(sequence, seen, if seen + 1 >= landed { guard } else { CombatInput::default() }))
            .unwrap();
        sequence += 1;
        room.tick();
    }
    let events = room.take_events();
    assert!(events.iter().any(|event| event.kind == EventKind::Parried && event.defender == player), "{events:?}");
    assert!(matches!(room.fighter(foe).unwrap().action, Action::Staggered { .. }));
    assert!((room.fighter(player).unwrap().health - 100.0).abs() < 1e-9);
}

#[test]
fn a_blow_waits_no_longer_than_a_view_may_lag() {
    let mut room = room();
    let player = room.join();
    let (foe, striker) = far_foe(&mut room);
    let attack = combat::fighter::Attack {
        stroke: Stroke::Down,
        elapsed: 24,
        strike: 24,
        end: 60,
        swing: combat::fighter::Swing::Plain,
        left_hand: false,
    };
    let blow = combat::judge::swing_blow(foe, &striker, &attack, player);
    room.blow_lands(&blow, How::Swing, player, Check::Swing { striker: Box::new(striker), attack });
    for _ in 0..VIEW_LAG {
        room.tick();
    }
    assert!(room.pending.is_empty(), "a player who sends nothing is judged as they stand");
    assert!(room.fighter(player).unwrap().health < 100.0);
}

#[test]
fn a_shot_strikes_the_first_foe_on_its_line_and_never_a_player() {
    let mut room = room();
    let player = room.join();
    let foe = stand_foe(&mut room);
    let mut archer = *room.fighter(player).unwrap();
    archer.arms =
        combat::Arms { melee: WeaponClass::Fists, ranged: Some(combat::Ranged::Pistolet), off_hand: OffHand::Empty };
    room.set_fighter(player, archer);
    let shoot = CombatInput { shoot: true, ..CombatInput::default() };
    let pistolet = combat::Arms { ranged: Some(combat::Ranged::Pistolet), ..combat::arms::BARE_HANDS }.code();
    room.input(player, Input { arms: pistolet, ..asking(1, 0, shoot) }).unwrap();
    room.tick();
    room.tick();
    let events = room.take_events();
    assert!(
        events
            .iter()
            .any(|event| event.kind == EventKind::Hit && event.how == Some(How::Shot) && event.defender == foe)
    );
    assert!(room.shots().is_empty());
}

#[test]
fn a_dead_player_stands_again_at_the_spawn_whole() {
    let mut room = room();
    let player = room.join();
    let mut dead = *room.fighter(player).unwrap();
    dead.health = 0.0;
    dead.action = Action::Dead { elapsed: 0 };
    room.set_fighter(player, dead);
    for sequence in 1..=combat::tuning::RESPAWN + 1 {
        room.input(player, asking(sequence, room.clock(), CombatInput::default())).unwrap();
        room.tick();
    }
    let raised = room.fighter(player).unwrap();
    assert!(!raised.dead() && (raised.health - 100.0).abs() < 1e-9);
    assert!(room.take_events().iter().any(|event| event.kind == EventKind::Respawned));
}
