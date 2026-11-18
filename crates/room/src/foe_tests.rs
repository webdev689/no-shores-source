use super::*;
use ::foes::Kind;
use combat::shapes::{Shape, Telegraph, TelegraphOrder};
use combat::{CombatInput, Intent};
use core::f64::consts::{FRAC_PI_2, PI};
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
    let player = room.join().expect("a room with space");
    room.input(player, asking(&room, 1, Some(Kind::Swordsman as u8), Controls::default())).unwrap();
    room.tick();
    let spawned: Vec<FoeSeen> = room.foes_seen().collect();
    assert_eq!(spawned.len(), 1);
    let foe = spawned[0];
    assert_eq!(foe.kind, Kind::Swordsman as u8);
    // The player looks north, though their body, never walked, faces south: the foe stands 5 m north, facing them.
    assert!((foe.fighter.body.y + 5.0).abs() < 0.5 && foe.fighter.body.x.abs() < 0.5, "{:?}", foe.fighter.body);
    assert!((foe.fighter.body.facing - PI).abs() < 1e-9, "it faces the player");
    assert!(room.take_events().iter().any(|event| event.kind == EventKind::Spawned && event.defender == foe.foe));
    room.input(player, asking(&room, 2, Some(CLEAR_FOES), Controls::default())).unwrap();
    room.tick();
    let east = Controls { yaw: FRAC_PI_2, ..Controls::default() };
    room.input(player, asking(&room, 3, Some(Kind::Swordsman as u8), east)).unwrap();
    room.tick();
    let foe = room.foes_seen().next().unwrap();
    assert!((foe.fighter.body.x - 5.0).abs() < 0.5 && foe.fighter.body.y.abs() < 0.5, "{:?}", foe.fighter.body);
    for sequence in 4..=22 {
        room.input(player, asking(&room, sequence, Some(Kind::Brute as u8), Controls::default())).unwrap();
        room.tick();
    }
    assert_eq!(room.foes_seen().count(), FOES_MOST, "never more than the most");
    room.input(player, asking(&room, 23, Some(CLEAR_FOES), Controls::default())).unwrap();
    room.tick();
    assert_eq!(room.foes_seen().count(), 0);
}

#[test]
fn a_foe_fights_a_player_who_stands_still_until_they_fall_and_they_stand_again() {
    let mut room = room();
    let player = room.join().expect("a room with space");
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
    let player = room.join().expect("a room with space");
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
        let player = room.join().expect("a room with space");
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

#[test]
fn the_room_answers_the_firing_spots_near_a_point_on_its_course() {
    use ::foes::Spots;
    let wall = Block { min_x: -4.0, min_y: -3.0, max_x: 4.0, max_y: -2.5, top: 3.0 };
    let room = Room::new(vec![wall], (0.0, 6.0));
    let (centre, radius) = ([0.0, -1.0, 0.0], 3.0);
    let spots = room.spots().near(centre, radius);
    for spot in &spots {
        let (east, south) = (spot.point[0] - centre[0], spot.point[1] - centre[1]);
        assert!(east * east + south * south <= radius * radius, "{spot:?} is within {radius} m");
    }
    let beside: Vec<_> = spots.iter().filter(|spot| spot.point[1] > -2.5 && spot.point[1] < -0.5).collect();
    assert!(!beside.is_empty(), "spots just south of the wall: {spots:?}");
    assert!(beside.iter().all(|spot| spot.cover & 1 != 0), "covered from the north: {beside:?}");
    assert_eq!(spots, room.spots().near(centre, radius), "the same spots in the same order");
}
