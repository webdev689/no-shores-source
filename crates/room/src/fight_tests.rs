use super::*;
use combat::arms::{OffHand, Stroke, WeaponClass};
use combat::fighter::Action;
use combat::{CombatInput, Intent};
use judging::{Check, How};
use movement::Controls;
use std::collections::BTreeMap;

const SWORD: u32 = 2;

fn room() -> Room {
    Room::new(Vec::new(), (0.0, 0.0))
}

/// A Major of the type numbered `number` standing at (x, y), facing south, put straight into the room.
fn stand(room: &mut Room, number: u8, x: f64, y: f64) -> FighterId {
    let id = room.next_id();
    let foe_type = ::foes::foe_type(number).expect("a type of the roster");
    let (fighter, brain) = ::foes::spawn(foe_type, ::foes::Rank::Major, x, y, core::f64::consts::PI);
    room.foes
        .insert(id, foes::Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
    id
}

/// A brute 1.5 m north of the origin: it never guards, parries or dodges.
fn stand_foe(room: &mut Room) -> FighterId {
    stand(room, 4, 0.0, -1.5)
}

/// A swordsman far out of sight, and a copy of it as though it stood 1.5 m north of the origin, to strike from.
fn far_foe(room: &mut Room) -> (FighterId, Fighter) {
    let id = stand(room, 2, 0.0, -60.0);
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
    let player = room.join().expect("a room with space");
    let foe = stand_foe(&mut room);
    assert_eq!(combat::Arms::from_code(SWORD).melee, WeaponClass::Sword);
    // The chain's first swing, the side cut, whatever the page asks (`chain.rs`).
    let chop = CombatInput { attack: Some(Stroke::Down), ..CombatInput::default() };
    for sequence in 1..=30 {
        let held = if sequence == 1 { chop } else { CombatInput::default() };
        room.input(player, asking(sequence, room.clock(), held)).unwrap();
        room.tick();
    }
    let events = room.take_events();
    let hit = events.iter().find(|event| event.kind == EventKind::Hit).expect("the chop lands");
    assert_eq!((hit.striker, hit.defender, hit.how, hit.stroke), (player, foe, Some(How::Swing), Some(Stroke::Left)));
    let chop = 14.0 * 0.85 * crate::power::PLAYER_HARM;
    assert!((hit.amount - chop).abs() < 1e-9);
    assert!((room.fighter(foe).unwrap().health - (130.0 - chop)).abs() < 1e-9);
    assert_eq!(room.fighter(player).unwrap().target, Some(foe), "the lock takes the foe it struck");
}

#[test]
fn nothing_is_fought_from_the_saddle() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    crate::gear_tests::horsed(&mut room, player);
    let held = [
        CombatInput { attack: Some(Stroke::Down), ..CombatInput::default() },
        CombatInput { guard: true, ..CombatInput::default() },
    ];
    for (sequence, combat) in (1..=30).zip(held.into_iter().cycle()) {
        let mut riding = asking(sequence, room.clock(), combat);
        riding.intent.controls.mounted = true;
        room.input(player, riding).unwrap();
        room.tick();
        let action = room.fighter(player).unwrap().action;
        assert!(!matches!(action, Action::Attack(_) | Action::Guard { .. }), "on horseback: {action:?}");
    }
}

#[test]
fn a_blow_on_a_player_waits_for_their_view_and_is_judged_as_they_stood_then() {
    let mut room = room();
    let player = room.join().expect("a room with space");
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
    let player = room.join().expect("a room with space");
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
    let player = room.join().expect("a room with space");
    let foe = stand_foe(&mut room);
    crate::power::hold(&mut room, player, gear::Kind::Pistolet);
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
    assert!(room.shots().next().is_none());
    // Two ticks before the snapshot, as a late timer runs them: the ball's line is kept for it, and sent once.
    let lines = room.take_lines();
    assert!(lines.len() == 1 && lines[0].last.owner == player, "{lines:?}");
    assert!(room.take_lines().is_empty());
}

#[test]
fn a_foes_ball_that_stops_is_sent_once_as_its_last_segment_and_its_muzzle() {
    let mut room = room();
    let foe = stand(&mut room, 9, 0.0, 0.0);
    let muzzle = [0.5, -0.5, 1.3];
    let aimed = combat::shots::loose(foe, combat::Ranged::Pistolet, [0.5, -0.1, 1.3], 0.0, 0.0, 1.0);
    room.shots.push((combat::shots::by_foe(&combat::Shot { at: muzzle, ..aimed }), None));
    let mut ticks = 0;
    while room.shots().next().is_some() {
        assert!(room.take_lines().is_empty(), "a ball still flying has no line");
        room.tick();
        ticks += 1;
    }
    let lines = room.take_lines();
    assert_eq!(lines.len(), 1, "{lines:?}");
    let line = lines[0];
    assert_eq!((line.last.owner, line.last.age), (foe, ticks - 1));
    line.muzzle.iter().zip(muzzle).for_each(|(sent, true_muzzle)| assert!((sent - true_muzzle).abs() < 1e-9));
    // It flew north its whole reach, and its last segment ends past it.
    let end = line.last.at[1] + line.last.velocity[1] * movement::TICK_SECONDS;
    assert!(end <= muzzle[1] - combat::shots::BALL_REACH, "{end}");
}

#[test]
fn a_dead_player_stands_again_at_the_spawn_whole() {
    let mut room = room();
    let player = room.join().expect("a room with space");
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

#[test]
fn the_room_keeps_the_swings_chain_side_cut_overhead_thrust_whatever_stroke_the_page_asks() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    // Asks a swing once the last has ended, and answers the stroke it took.
    let swing = |room: &mut Room, sequence: &mut u32, asked: Stroke| {
        let step = |room: &mut Room, sequence: &mut u32, attack: Option<Stroke>| {
            *sequence += 1;
            room.input(player, asking(*sequence, room.clock(), CombatInput { attack, ..CombatInput::default() }))
                .unwrap();
            room.tick();
            room.fighter(player).unwrap().action
        };
        while matches!(room.fighter(player).unwrap().action, Action::Attack(_)) {
            step(room, sequence, None);
        }
        match step(room, sequence, Some(asked)) {
            Action::Attack(attack) => attack.stroke,
            other => panic!("a swing, not {other:?}"),
        }
    };
    let mut sequence = 0;
    assert_eq!(swing(&mut room, &mut sequence, Stroke::Down), Stroke::Left, "the chain's first, the side cut");
    assert_eq!(swing(&mut room, &mut sequence, Stroke::Down), Stroke::Down, "then the overhead, as asked");
    assert_eq!(swing(&mut room, &mut sequence, Stroke::Down), Stroke::Up, "never the overhead twice: the thrust");
    assert_eq!(swing(&mut room, &mut sequence, Stroke::DownLeft), Stroke::Left, "and round again");
    let mut rested = 0;
    while rested <= 60 {
        sequence += 1;
        room.input(player, asking(sequence, room.clock(), CombatInput::default())).unwrap();
        room.tick();
        let swinging = matches!(room.fighter(player).unwrap().action, Action::Attack(_));
        rested = if swinging { 0 } else { rested + 1 };
    }
    assert_eq!(swing(&mut room, &mut sequence, Stroke::Up), Stroke::Left, "a second's rest starts it over");
}

#[test]
fn a_foe_holds_the_swing_begun_at_it_though_a_quicker_one_begins_far_off() {
    let mut room = room();
    let (near, far) = (room.join().unwrap(), room.join().unwrap());
    let foe = stand(&mut room, ::foes::roster::COLLECTOR, 0.0, -2.0);
    let swing = |strike: u32| combat::fighter::Attack {
        stroke: Stroke::Down,
        elapsed: 0,
        strike,
        end: 60,
        swing: combat::fighter::Swing::Plain,
        left_hand: false,
    };
    // Two metres south of the foe, facing it, a slow swing begun at it.
    let mut striker = *room.fighter(near).unwrap();
    (striker.body, striker.aim, striker.target) = (standing(0.0, 0.0), 0.0, Some(foe));
    striker.action = Action::Attack(swing(30));
    room.set_fighter(near, striker);
    // Fifteen metres south, facing away, a quicker swing at no one near it.
    let mut other = *room.fighter(far).unwrap();
    (other.body, other.aim, other.action) = (standing(0.0, 15.0), core::f64::consts::PI, Action::Attack(swing(10)));
    room.set_fighter(far, other);
    let clock = room.clock();
    room.foes.get_mut(&foe).unwrap().brain.hunt(near, [0.0, 0.0, 0.0], clock);
    room.swings.push((near, swing(30)));
    room.tell_brains();
    assert_eq!(room.foes[&foe].brain.seen_coming(), Some(near), "the swing at it");
    room.swings.push((far, swing(10)));
    room.tell_brains();
    assert_eq!(room.foes[&foe].brain.seen_coming(), Some(near), "still the swing at it, not the quicker one far off");
}

#[test]
fn a_foe_lets_go_of_a_player_the_section_killed() {
    let mut room = room();
    let player = room.join().unwrap();
    let foe = stand(&mut room, ::foes::roster::COLLECTOR, 0.0, -3.0);
    let clock = room.clock();
    room.foes.get_mut(&foe).unwrap().brain.hunt(player, [0.0, 0.0, 0.0], clock);
    room.tick();
    assert_eq!(room.foes[&foe].brain.fights(), Some(player), "fighting them");
    // Killed by the section, as past its edge: their fighter keeps its health, but they lie dead until they respawn.
    room.players.get_mut(&player).unwrap().standing = crate::Standing::Dead { ticks: 0, fell: false };
    room.tick();
    assert_eq!(room.foes[&foe].brain.fights(), None, "let go once the section killed them");
}

#[test]
fn a_player_the_foes_leave_be_is_struck_by_no_sweep_or_shot_aimed_at_another() {
    let mut room = room();
    let (fought, spared) = (room.join().unwrap(), room.join().unwrap());
    // A brute 1.5 m north of the origin facing south, fighting the player at the origin; beside them, the other just
    // stood again.
    let foe = stand_foe(&mut room);
    let clock = room.clock();
    room.foes.get_mut(&foe).unwrap().brain.hunt(fought, [0.0, 0.0, 0.0], clock);
    for (player, x) in [(fought, 0.0), (spared, 0.4)] {
        let mut stood = *room.fighter(player).unwrap();
        stood.body = standing(x, 0.0);
        room.set_fighter(player, stood);
    }
    room.players.get_mut(&spared).unwrap().graced = room.clock() + crate::players::GRACE;
    let brute = *room.fighter(foe).unwrap();
    let attack = combat::fighter::Attack {
        stroke: Stroke::Left,
        elapsed: 0,
        strike: 1,
        end: 30,
        swing: combat::fighter::Swing::Plain,
        left_hand: false,
    };
    let view = room.fighters();
    room.happened(foe, &brute, Some(combat::Happening::Struck(attack)), &view);
    let struck: Vec<FighterId> = room.pending.iter().map(|pending| pending.defender).collect();
    assert!(struck.contains(&fought), "the one it fights is struck: {struck:?}");
    assert!(!struck.contains(&spared), "the one left be is not");
    // A bolt at the one it fights passes by the one left be standing on its line, in front of them.
    room.pending.clear();
    let mut ahead = *room.fighter(spared).unwrap();
    ahead.body = standing(0.0, -0.7);
    room.set_fighter(spared, ahead);
    let shot = ::foes::aimed_shot(foe, &brute, core::f64::consts::PI, 3.0);
    room.shots.push((shot, None));
    for _ in 0..30 {
        room.fly_shots();
    }
    let shot_at: Vec<FighterId> = room.pending.iter().map(|pending| pending.defender).collect();
    assert!(shot_at.contains(&fought), "the bolt struck the one it was loosed at: {shot_at:?}");
    assert!(!shot_at.contains(&spared), "and passed the one left be by");
}
