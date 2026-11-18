//! Factions in a room: foes of two factions find, fight and answer each other with no player near, while two of one
//! faction never strike each other; a telegraphed blow lands on a foe of another side and never on an ally; a spawn
//! ask is a type and a rank, falling back to the type's first; and a Boss in its last stand calls two Minor Deckhands
//! to its side, counted against the room's limit.

use super::*;
use ::foes::Rank;
use combat::shapes::{Shape, Telegraph, TelegraphOrder};
use core::f64::consts::PI;

const COLLECTOR: u8 = 2;
const PISTOLEER: u8 = 9;
const DECKHAND: u8 = 7;
const THULE: u8 = 12;
const PIRATE_SKIRMISHER: u8 = 13;
const PIRATE_SWORDSMAN: u8 = 14;

/// A foe of a type at a rank standing at (x, y) facing `facing`, put straight into the room.
fn stand(room: &mut Room, number: u8, rank: Rank, x: f64, y: f64, facing: f64) -> FighterId {
    let id = room.next_id();
    let (fighter, brain) = ::foes::spawn(::foes::foe_type(number).unwrap(), rank, x, y, facing);
    room.foes.insert(id, foes::Foe { fighter, brain, caller: None });
    id
}

/// Ticks the room, gathering every event.
fn run(room: &mut Room, ticks: u32) -> Vec<Event> {
    let mut events = Vec::new();
    for _ in 0..ticks {
        room.tick();
        events.extend(room.take_events());
    }
    events
}

/// Events between a striker and a defender.
fn between(events: &[Event], striker: FighterId, defender: FighterId) -> impl Iterator<Item = &Event> {
    events.iter().filter(move |event| event.striker == striker && event.defender == defender)
}

#[test]
fn a_grey_tithe_foe_and_a_pirate_engage_strike_and_answer_each_other() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let tithe = stand(&mut room, COLLECTOR, Rank::Major, 0.0, -4.0, PI);
    let pirate = stand(&mut room, PIRATE_SWORDSMAN, Rank::Major, 0.0, 4.0, 0.0);
    let factions: Vec<(FighterId, u8)> = room.foes_seen().map(|foe| (foe.foe, foe.faction)).collect();
    assert_eq!(factions, [(tithe, 1), (pirate, 2)]);
    let events = run(&mut room, 1800);
    let hits = |striker, defender| between(&events, striker, defender).filter(|event| event.kind == EventKind::Hit);
    assert!(hits(tithe, pirate).count() > 0 && hits(pirate, tithe).count() > 0, "{events:?}");
    let answered = [(tithe, pirate), (pirate, tithe)].into_iter().any(|(striker, defender)| {
        between(&events, striker, defender).any(|event| {
            matches!(event.kind, EventKind::Blocked | EventKind::Parried | EventKind::Dodged | EventKind::PerfectDodge)
        })
    });
    assert!(answered, "they answer each other's blows as they answer a player's: {events:?}");
}

#[test]
fn two_pirates_fight_a_grey_tithe_foe_together_and_never_strike_each_other() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let tithe = stand(&mut room, COLLECTOR, Rank::Major, 0.0, -4.0, PI);
    let pirate = stand(&mut room, PIRATE_SWORDSMAN, Rank::Major, 0.0, 4.0, 0.0);
    let ally = stand(&mut room, PIRATE_SKIRMISHER, Rank::Major, 2.0, 4.0, 0.0);
    let events = run(&mut room, 1800);
    assert!(events.iter().any(|event| event.kind == EventKind::Killed && event.defender == tithe), "{events:?}");
    let among = between(&events, pirate, ally).count() + between(&events, ally, pirate).count();
    assert_eq!(among, 0, "allies never strike each other");
}

#[test]
fn two_of_one_faction_never_take_each_other_for_a_target() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let first = stand(&mut room, PIRATE_SWORDSMAN, Rank::Major, 0.0, -2.0, PI);
    let second = stand(&mut room, PIRATE_SKIRMISHER, Rank::Major, 0.0, 2.0, 0.0);
    for _ in 0..300 {
        room.tick();
        assert_eq!((room.foes[&first].brain.target(), room.foes[&second].brain.target()), (None, None));
    }
    assert!(room.take_events().is_empty());
}

#[test]
fn a_telegraphed_blow_lands_on_a_foe_of_another_side_and_never_on_an_ally() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let enforcer = stand(&mut room, 4, Rank::Major, 0.0, 0.0, 0.0);
    let pirate = stand(&mut room, PIRATE_SKIRMISHER, Rank::Major, 0.0, -1.0, PI);
    let ally = stand(&mut room, COLLECTOR, Rank::Major, 0.8, -1.2, PI);
    let brute = *room.fighter(enforcer).unwrap();
    let slam = TelegraphOrder { shape: Shape::Slam, windup: 54, iron: true, feint_at: None, bearing: 0.0, ahead: 0.0 };
    room.telegraph_lands(enforcer, &brute, &Telegraph::begin(&slam, [0.0, 0.0, 0.0]));
    let events = room.take_events();
    let struck: Vec<FighterId> =
        events.iter().filter(|event| event.kind == EventKind::Hit).map(|event| event.defender).collect();
    assert_eq!(struck, [pirate], "{events:?}");
    assert!(!matches!(room.fighter(enforcer).unwrap().action, combat::fighter::Action::Overreach { .. }));
    assert_eq!(room.ended_telegraphs, [(enforcer, false, false)], "found");
    assert!((room.fighter(ally).unwrap().health - room.fighter(ally).unwrap().health_max).abs() < 1e-12);
}

#[test]
fn a_spawn_ask_is_a_type_and_a_rank_and_a_rank_the_type_lacks_takes_its_first() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().unwrap();
    let asks = [(5, 1), (12, 2), (17, 3), (17, 0), (99, 2)];
    for (sequence, (foe_type, rank)) in (1..).zip(asks) {
        let spawn = Some(SpawnAsk::Foe { foe_type, rank });
        room.input(player, Input { sequence, seen: room.clock(), spawn, ..Input::default() }).unwrap();
        room.tick();
    }
    let stood: Vec<(u8, u8, u8, u8)> =
        room.foes_seen().map(|foe| (foe.foe_type, foe.rank, foe.faction, foe.kind)).collect();
    assert_eq!(stood, [(5, 3, 1, 4), (12, 5, 1, 5), (17, 3, 2, 5), (17, 3, 2, 5)], "no type 99");
}

#[test]
fn a_boss_in_its_last_stand_calls_two_minor_deckhands_to_its_side_within_the_rooms_limit() {
    for (others, crew) in [(0, 2), (FOES_MOST - 2, 1)] {
        let mut room = Room::new(Vec::new(), (0.0, 0.0));
        let boss = stand(&mut room, THULE, Rank::Boss, 0.0, 0.0, 0.0);
        for index in 0..others {
            stand(&mut room, DECKHAND, Rank::Major, 30.0 + 2.0 * index as f64, 30.0, 0.0);
        }
        if let Some(found) = room.foes.get_mut(&boss) {
            found.fighter.health = 0.3 * found.fighter.health_max;
        }
        let events = run(&mut room, 400);
        let called: Vec<FoeSeen> =
            room.foes_seen().filter(|foe| foe.foe > boss + u32::try_from(others).unwrap()).collect();
        assert_eq!(called.len(), crew, "{others} others");
        assert!(room.foes.len() <= FOES_MOST);
        for foe in &called {
            assert_eq!((foe.foe_type, foe.rank, foe.faction), (DECKHAND, Rank::Minor as u8, 1));
            let apart = combat::sight::apart([foe.fighter.body.x, foe.fighter.body.y], [0.0, 0.0]);
            assert!((apart - 1.5).abs() < 0.5, "at its side: {apart}");
            let spawned = |event: &Event| event.kind == EventKind::Spawned && event.defender == foe.foe;
            assert!(events.iter().any(|event| spawned(event) && event.striker == boss));
        }
        assert_eq!(room.foes_seen().find(|foe| foe.foe == boss).unwrap().phase, 3);
        run(&mut room, 600);
        assert_eq!(room.foes.len(), others + 1 + crew, "called once");
    }
}

#[test]
fn foes_of_two_factions_left_apart_beyond_sight_find_each_other_and_fight() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let tithe = stand(&mut room, COLLECTOR, Rank::Major, 0.0, -18.0, 0.0);
    let pirate = stand(&mut room, PIRATE_SWORDSMAN, Rank::Major, 0.0, 18.0, PI);
    let events = run(&mut room, 60 * 60);
    let fought = |striker, defender| between(&events, striker, defender).next().is_some();
    assert!(fought(tithe, pirate) || fought(pirate, tithe), "36 m apart, back to back, they meet in a minute");
}

#[test]
fn a_boss_killed_in_the_step_its_roar_began_calls_no_crew() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let boss = stand(&mut room, THULE, Rank::Boss, 0.0, 0.0, 0.0);
    if let Some(found) = room.foes.get_mut(&boss) {
        found.fighter.health = 0.0;
        found.fighter.action = Action::Dead { elapsed: 0 };
    }
    let crew = ::foes::Call { foe_type: DECKHAND, rank: Rank::Minor, count: 2, place: ::foes::Place::Beside };
    room.call(boss, crew);
    assert_eq!(room.foes.len(), 1, "its call died with it");
}

#[test]
fn a_foes_aimed_gunshot_is_heard_by_a_foe_of_another_side_across_the_room() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let pistoleer = stand(&mut room, PISTOLEER, Rank::Major, 0.0, 0.0, 0.0);
    let pirate = stand(&mut room, PIRATE_SWORDSMAN, Rank::Major, 0.0, 25.0, PI);
    let gunner = *room.fighter(pistoleer).unwrap();
    let aimed =
        TelegraphOrder { shape: Shape::Aimed, windup: 60, iron: false, feint_at: None, bearing: 0.0, ahead: 20.0 };
    room.telegraph_lands(pistoleer, &gunner, &Telegraph::begin(&aimed, [0.0, 0.0, 0.0]));
    room.tell_brains();
    let alert = |room: &Room| room.foes_seen().find(|seen| seen.foe == pirate).unwrap().alert;
    assert_eq!(alert(&room), 0, "heard, it stirs at its next thought");
    room.tick();
    assert!(alert(&room) >= 1, "the shot 25 m off, behind it, stirs it");
}
