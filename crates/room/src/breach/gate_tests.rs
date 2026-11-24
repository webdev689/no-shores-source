//! The Waking at a Breach's gate in its patrol zone: one company at a time holds it, its three moorings held by the
//! company's living players fill the Spire and fewer let it ebb, a Bulwark claims a mooring left empty, the gate opens
//! to that company alone once the Spire wakes, a lost Waking stands the company again at the gate, and the zone hears
//! of the companies inside.

use super::gate::{MOORINGS, SPIRE_TICKS};
use super::*;
use crate::encounters::encounters_tests::{hardy, ticks};
use crate::{EventKind, PlayerId};

/// A patrol's room on open ground standing the Sunken Gate at its middle, with `count` hardy players.
fn gate_room(count: usize) -> (Room, Vec<PlayerId>) {
    let module = city::modules::all().iter().find(|module| module.name == "breach-gate").expect("the gate's module");
    let blocks: Vec<Block> = module
        .parts
        .iter()
        .map(|&[x0, y0, z0, x1, y1, z1]| Block { min_x: x0, min_y: y0, max_x: x1, max_y: y1, bottom: z0, top: z1 })
        .collect();
    let ring = vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]];
    let section = Section { ring, spawns: vec![[0.0, 60.0]], falls_kill: false };
    let mut room = Room::node(Floor::Flat, blocks, section);
    room.open_breach_gate([0.0, 0.0, 0.0], 0);
    let players = (0..count).map(|_| hardy(&mut room)).collect();
    room.take_events();
    (room, players)
}

fn socket(room: &Room, name: &str) -> [f64; 3] {
    room.breach_gate.as_ref().expect("a gate").socket(name).expect("its socket")
}

fn stand(room: &mut Room, player: PlayerId, at: [f64; 3]) {
    let body = &mut room.players.get_mut(&player).expect("in").fighter.body;
    (body.x, body.y, body.z, body.vx, body.vy, body.vz) = (at[0], at[1], at[2], 0.0, 0.0, 0.0);
    body.mode = movement::Mode::Ground;
}

/// Each of the first three players on a mooring.
fn hold_moorings(room: &mut Room, players: &[PlayerId]) {
    for (player, mooring) in players.iter().zip(MOORINGS) {
        let at = socket(room, mooring);
        stand(room, *player, at);
    }
}

#[test]
fn a_company_launched_for_a_run_takes_the_gate_and_anyone_else_on_a_mooring_does_not() {
    let (mut room, players) = gate_room(4);
    assert!(room.breach_company(players[0], "run-a", Tier::Normal));
    let mooring = socket(&room, MOORINGS[0]);
    stand(&mut room, players[3], mooring);
    room.tick();
    assert!(room.breach_gate.as_ref().expect("gate").held_by.is_none(), "a player of no company holds nothing");
    stand(&mut room, players[0], mooring);
    room.tick();
    assert_eq!(room.breach_gate.as_ref().expect("gate").held_by.as_deref(), Some("run-a"));
    assert!(room.breach_company(players[1], "run-b", Tier::Hard));
    let other = socket(&room, MOORINGS[1]);
    stand(&mut room, players[1], other);
    room.tick();
    assert_eq!(room.breach_gate.as_ref().expect("gate").held_by.as_deref(), Some("run-a"), "one at a time");
}

#[test]
fn all_three_moorings_held_fill_the_spire_and_fewer_let_it_ebb_until_it_wakes_and_opens_the_gate_to_its_company() {
    let (mut room, players) = gate_room(4);
    for &player in &players[..3] {
        room.breach_company(player, "run-a", Tier::Normal);
    }
    room.breach_company(players[3], "run-b", Tier::Normal);
    hold_moorings(&mut room, &players[..3]);
    ticks(&mut room, 600);
    let filled = room.breach_gate.as_ref().expect("gate").fill;
    assert!(filled >= 590, "filling while all three are held: {filled}");
    let away = socket(&room, "arrival");
    stand(&mut room, players[2], away);
    ticks(&mut room, 400);
    assert!(room.breach_gate.as_ref().expect("gate").fill < filled, "ebbing while one is left");
    room.breach_gate.as_mut().expect("gate").fill = SPIRE_TICKS - 1;
    room.breach_gate.as_mut().expect("gate").claims = [None; 3];
    hold_moorings(&mut room, &players[..3]);
    room.tick();
    let gate = room.breach_gate.as_ref().expect("gate");
    assert!(gate.woken.is_some() && room.breach_opened("run-a") && !room.breach_opened("run-b"));
    let door = socket(&room, "gate");
    stand(&mut room, players[0], door);
    stand(&mut room, players[3], door);
    assert_eq!(room.ask_enter_breach(players[0]), 0, "open to the company that woke it");
    assert_eq!(room.ask_enter_breach(players[3]), gate::GATE_SHUT, "shut to any other");
    assert_eq!(room.take_events().iter().filter(|event| event.kind == EventKind::BreachWon).count(), players.len());
}

#[test]
fn a_bulwark_sent_out_claims_a_mooring_left_empty_and_while_it_stands_the_spire_does_not_fill() {
    let (mut room, players) = gate_room(3);
    for &player in &players {
        room.breach_company(player, "run-a", Tier::Normal);
    }
    hold_moorings(&mut room, &players);
    room.tick();
    let claimers = room.breach_gate.as_ref().expect("gate").claimers.clone();
    assert!(!claimers.is_empty(), "a Bulwark sent as the Waking begins");
    let (bulwark, mooring) = claimers[0];
    let elsewhere = socket(&room, "arrival");
    stand(&mut room, players[mooring], elsewhere);
    for _ in 0..90 * 60 {
        room.tick();
        if room.breach_gate.as_ref().expect("gate").claims[mooring].is_some() {
            break;
        }
    }
    assert_eq!(room.breach_gate.as_ref().expect("gate").claims[mooring], Some(bulwark), "it claimed the empty one");
    hold_moorings(&mut room, &players);
    let before = room.breach_gate.as_ref().expect("gate").fill;
    ticks(&mut room, 120);
    assert!(room.breach_gate.as_ref().expect("gate").fill <= before, "a claimed mooring holds nothing");
}

#[test]
fn a_hard_companys_fallen_do_not_stand_again_and_its_wipe_stands_it_whole_at_the_gate() {
    let (mut room, players) = gate_room(2);
    for &player in &players {
        room.breach_company(player, "run-a", Tier::Hard);
    }
    hold_moorings(&mut room, &players);
    room.tick();
    assert_eq!(room.breach_gate.as_ref().expect("gate").revives, Some(5));
    room.harm_share(players[0], 1.0e3, 0);
    ticks(&mut room, 20 * 60);
    assert!(room.players[&players[0]].fighter.dead(), "down for good while the Waking runs");
    room.harm_share(players[1], 1.0e3, 0);
    ticks(&mut room, WIPE_TICKS + 2);
    let gate = room.breach_gate.as_ref().expect("gate");
    assert!(gate.held_by.is_none() && gate.fill == 0, "the gate free again");
    let arrival = socket(&room, "arrival");
    for player in &players {
        let body = room.players[player].fighter.body;
        assert!(!room.players[player].fighter.dead());
        assert!(combat::sight::apart([body.x, body.y], [arrival[0], arrival[1]]) < 1.0);
    }
}

#[test]
fn the_zone_hears_of_the_companies_inside_until_they_are_done_or_silent() {
    let (mut room, _) = gate_room(1);
    room.breach_inside("run-a", "Wenna", Tier::Hard, 2);
    let seen = room.breach_seen().expect("the gate's");
    assert_eq!(seen.inside, [("Wenna".to_owned(), Tier::Hard as u8, 2)]);
    room.breach_inside("run-a", "Wenna", Tier::Hard, 6);
    assert!(room.breach_seen().expect("the gate's").inside.is_empty(), "done");
    room.breach_inside("run-b", "Ossery", Tier::Normal, 1);
    ticks(&mut room, gate::INSIDE_LASTS + 1);
    assert!(room.breach_seen().expect("the gate's").inside.is_empty(), "silent too long");
}
