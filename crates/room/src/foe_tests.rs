use super::*;
use ::foes::Kind;
use combat::shapes::{Shape, Telegraph, TelegraphOrder};
use combat::{Blow, BlowKind, CombatInput, Intent, Stroke, Verdict};
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

/// A player who stands still among five brutes, kept whole; `dominating`, they land a blow on one brute after another
/// ten times a second, each brute kept whole too. Answers the most brutes holding a turn at the player at once, and
/// how many on average, over the fight's last ten seconds; and the heat it ends at.
fn turns_at(dominating: bool) -> (usize, f64, f64) {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let brutes: Vec<FighterId> = (0..5_u32)
        .map(|index| {
            let bearing = (f64::from(index) * 30.0 - 60.0).to_radians();
            let (x, y) = (6.0 * libm::sin(bearing), -6.0 * libm::cos(bearing));
            let (fighter, brain) = ::foes::spawn(Kind::Brute, x, y, combat::sight::bearing([x, y], [0.0, 0.0]));
            let id = room.next_id();
            room.foes.insert(id, Foe { fighter, kind: Kind::Brute as u8, brain });
            id
        })
        .collect();
    let (mut most, mut total) = (0, 0);
    for sequence in 1..=1500_u32 {
        room.input(player, asking(&room, sequence, None, Controls::default())).unwrap();
        room.tick();
        if dominating && sequence.is_multiple_of(6) {
            let brute = brutes[(sequence / 6) as usize % brutes.len()];
            let blow = Blow {
                striker: player,
                kind: BlowKind::Swing(Stroke::Down),
                from: [0.0, 0.0],
                damage: 25.0,
                poise: 0.0,
                guard: 0.0,
                parryable: true,
                blockable: true,
                knocks_down: false,
            };
            room.settle(&blow, How::Swing, brute, Verdict::Hit { damage: 25.0, poise: 0.0 });
            room.foes.get_mut(&brute).unwrap().fighter.health = room.foes[&brute].fighter.health_max;
        }
        let whole = room.players[&player].fighter.health_max;
        room.players.get_mut(&player).unwrap().fighter.health = whole;
        if sequence > 900 {
            let (melee, _) = room.board.tokens_out(player);
            most = most.max(melee);
            total += melee;
        }
    }
    (most, total as f64 / 600.0, room.director.heat)
}

#[test]
fn a_dominating_player_meets_more_foes_in_their_turn_at_once_than_one_being_beaten() {
    let (dominating, beaten) = (turns_at(true), turns_at(false));
    assert!(dominating.2 >= 0.6 && beaten.2 < 0.25, "hot against cold: {dominating:?} against {beaten:?}");
    assert!(dominating.0 >= 3, "three brutes at once on the dominating player: {dominating:?}");
    assert!(dominating.1 > beaten.1, "more in their turn than on the beaten player: {dominating:?} {beaten:?}");
}

#[test]
fn the_same_inputs_give_the_same_heat_to_the_bit() {
    let heat = || turns_at(true).2.to_bits();
    assert_eq!(heat(), heat());
}
