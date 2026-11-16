use super::*;
use ::foes::Kind;
use combat::shapes::{Shape, Telegraph, TelegraphOrder};
use combat::{CombatInput, Intent};
use movement::Controls;

fn room() -> Room {
    Room::new(Vec::new(), (0.0, 0.0))
}

/// A player's input looking north, seeing the room as it stands, asking for a foe or not.
fn asking(room: &Room, sequence: u32, spawn: Option<u8>, controls: Controls) -> Input {
    let arms = combat::arms_of("sword_iron", "", true).code();
    let intent = Intent { controls, combat: CombatInput::default() };
    Input { sequence, intent, arms, seen: room.clock(), spawn, ..Input::default() }
}

/// Runs the room `ticks` ticks with a player standing still, from input `first`; gives every event.
fn stand_still(room: &mut Room, player: PlayerId, first: u32, ticks: u32) -> Vec<Event> {
    let mut events = Vec::new();
    for sequence in first..first + ticks {
        let input = asking(room, sequence, None, Controls::default());
        room.input(player, input).unwrap();
        room.tick();
        events.extend(room.take_events());
    }
    events
}

#[test]
fn a_player_asks_for_foes_that_stand_before_them_and_sends_them_all_away() {
    let mut room = room();
    let player = room.join();
    room.input(player, asking(&room, 1, Some(Kind::Swordsman as u8), Controls::default())).unwrap();
    room.tick();
    let spawned: Vec<FoeSeen> = room.foes_seen().collect();
    assert_eq!(spawned.len(), 1);
    let foe = spawned[0];
    assert_eq!(foe.kind, Kind::Swordsman as u8);
    // The player faces south when they join: the foe stands 5 m south, facing them.
    assert!((foe.fighter.body.y - 5.0).abs() < 0.5 && foe.fighter.body.x.abs() < 0.5, "{:?}", foe.fighter.body);
    assert!(room.take_events().iter().any(|event| event.kind == EventKind::Spawned && event.defender == foe.foe));
    for sequence in 2..=20 {
        room.input(player, asking(&room, sequence, Some(Kind::Brute as u8), Controls::default())).unwrap();
        room.tick();
    }
    assert_eq!(room.foes_seen().count(), FOES_MOST, "never more than the most");
    room.input(player, asking(&room, 21, Some(CLEAR_FOES), Controls::default())).unwrap();
    room.tick();
    assert_eq!(room.foes_seen().count(), 0);
}

#[test]
fn a_foe_fights_a_player_who_stands_still_until_they_fall_and_they_stand_again() {
    let mut room = room();
    let player = room.join();
    room.input(player, asking(&room, 1, Some(Kind::Swordsman as u8), Controls::default())).unwrap();
    room.tick();
    let foe = room.foes_seen().next().unwrap().foe;
    let events = stand_still(&mut room, player, 2, 60 * 60);
    let hits: Vec<&Event> =
        events.iter().filter(|event| event.kind == EventKind::Hit && event.striker == foe).collect();
    assert!(hits.len() >= 4, "the swordsman walks in and strikes: {} hits", hits.len());
    assert!(events.iter().any(|event| event.kind == EventKind::Killed && event.defender == player));
    assert!(events.iter().any(|event| event.kind == EventKind::Respawned && event.defender == player));
}

#[test]
fn a_telegraphed_blow_found_by_no_one_overreaches_its_foe_and_one_on_a_player_waits_for_their_view() {
    let mut room = room();
    let player = room.join();
    room.input(player, asking(&room, 1, Some(Kind::Brute as u8), Controls::default())).unwrap();
    room.tick();
    let foe = room.foes_seen().next().unwrap().foe;
    let brute = *room.fighter(foe).unwrap();
    let far = TelegraphOrder { shape: Shape::Slam, windup: 54, iron: true, feint_at: None, bearing: 0.0, ahead: 0.0 };
    room.telegraph_lands(foe, &brute, &Telegraph::begin(&far, [40.0, 40.0, 0.0]));
    assert!(matches!(room.fighter(foe).unwrap().action, Action::Overreach { .. }));
    // A slam on the player's own feet waits for their view, then knocks them down.
    let on_them = Telegraph::begin(&TelegraphOrder { bearing: 0.0, ..far }, [0.0, 1.0, 0.0]);
    room.telegraph_lands(foe, &brute, &on_them);
    assert_eq!(room.pending.len(), 1);
    let events = stand_still(&mut room, player, 2, 2);
    assert!(room.pending.is_empty());
    assert!(events.iter().any(|event| event.kind == EventKind::Hit && event.how == Some(How::Iron)));
}

#[test]
fn the_same_inputs_play_the_same_fight() {
    let play = || {
        let mut room = room();
        let player = room.join();
        for kind in [Kind::Skirmisher, Kind::Swordsman, Kind::Archer] {
            let sequence = room.players[&player].received + 1;
            room.input(player, asking(&room, sequence, Some(kind as u8), Controls::default())).unwrap();
            room.tick();
        }
        stand_still(&mut room, player, 4, 600);
        room.fighters()
    };
    assert_eq!(play(), play());
}
