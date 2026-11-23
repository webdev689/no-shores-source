//! Factions in a room: foes of two factions find, fight and answer each other with no player near, while two of one
//! faction never strike each other; a telegraphed blow lands on a foe of another side and never on an ally; a spawn
//! ask is a type and a rank, falling back to the type's first; and a Boss in its last stand calls two Minor Deckhands
//! to its side, counted against the room's limit.

use super::*;
use ::foes::Rank;
use combat::fighter::Action;
use combat::shapes::{Shape, Telegraph, TelegraphOrder};
use core::f64::consts::PI;

const COLLECTOR: u8 = 2;
const PISTOLEER: u8 = 9;
const DECKHAND: u8 = 7;
const THULE: u8 = 12;
const HUSK: u8 = ::foes::roster::HUSK;
const FLICKER: u8 = ::foes::roster::FLICKER;

/// A foe of a type at a rank standing at (x, y) facing `facing`, put straight into the room.
fn stand(room: &mut Room, number: u8, rank: Rank, x: f64, y: f64, facing: f64) -> FighterId {
    let id = room.next_id();
    let (fighter, brain) = ::foes::spawn(::foes::foe_type(number).unwrap(), rank, x, y, facing);
    room.foes
        .insert(id, foes::Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
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
fn a_grey_tithe_foe_and_a_lattice_foe_engage_strike_and_answer_each_other() {
    // An answer is a chance a quick swing seldom leaves time for, so the fight is fought from a few seeds.
    let mut answered = false;
    for seed in 0..4_u64 {
        let mut room = Room::new(Vec::new(), (0.0, 0.0));
        room.world_seed ^= seed.wrapping_mul(0x9e37_79b9_7f4a_7c15);
        let tithe = stand(&mut room, COLLECTOR, Rank::Major, 0.0, -4.0, PI);
        let hostile = stand(&mut room, HUSK, Rank::Major, 0.0, 4.0, 0.0);
        let factions: Vec<(FighterId, u8)> = room.foes_seen().map(|foe| (foe.foe, foe.faction)).collect();
        assert_eq!(factions, [(tithe, 1), (hostile, 3)]);
        let events = run(&mut room, 1800);
        let hits = |striker, defender| between(&events, striker, defender).filter(|event| event.kind == EventKind::Hit);
        assert!(hits(tithe, hostile).count() > 0 && hits(hostile, tithe).count() > 0, "{events:?}");
        answered |= [(tithe, hostile), (hostile, tithe)].into_iter().any(|(striker, defender)| {
            between(&events, striker, defender).any(|event| {
                matches!(
                    event.kind,
                    EventKind::Blocked | EventKind::Parried | EventKind::Dodged | EventKind::PerfectDodge
                )
            })
        });
    }
    assert!(answered, "they answer each other's blows as they answer a player's");
}

#[test]
fn two_lattice_foes_fight_a_grey_tithe_foe_together_and_never_strike_each_other() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let tithe = stand(&mut room, COLLECTOR, Rank::Major, 0.0, -4.0, PI);
    let hostile = stand(&mut room, HUSK, Rank::Major, 0.0, 4.0, 0.0);
    let ally = stand(&mut room, FLICKER, Rank::Major, 2.0, 4.0, 0.0);
    let events = run(&mut room, 1800);
    assert!(events.iter().any(|event| event.kind == EventKind::Killed && event.defender == tithe), "{events:?}");
    let among = between(&events, hostile, ally).count() + between(&events, ally, hostile).count();
    assert_eq!(among, 0, "allies never strike each other");
}

#[test]
fn two_of_one_faction_never_take_each_other_for_a_target() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let first = stand(&mut room, HUSK, Rank::Major, 0.0, -2.0, PI);
    let second = stand(&mut room, FLICKER, Rank::Major, 0.0, 2.0, 0.0);
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
    let hostile = stand(&mut room, FLICKER, Rank::Major, 0.0, -1.0, PI);
    let ally = stand(&mut room, COLLECTOR, Rank::Major, 0.8, -1.2, PI);
    let brute = *room.fighter(enforcer).unwrap();
    let slam = TelegraphOrder { shape: Shape::Slam, windup: 54, iron: true, feint_at: None, bearing: 0.0, ahead: 0.0 };
    room.telegraph_lands(enforcer, &brute, &Telegraph::begin(&slam, [0.0, 0.0, 0.0]));
    let events = room.take_events();
    let struck: Vec<FighterId> =
        events.iter().filter(|event| event.kind == EventKind::Hit).map(|event| event.defender).collect();
    assert_eq!(struck, [hostile], "{events:?}");
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
        let spawn = Some(SpawnAsk::Foe { foe_type, rank, shield: 0 });
        room.input(player, Input { sequence, seen: room.clock(), spawn, ..Input::default() }).unwrap();
        room.tick();
    }
    let stood: Vec<(u8, u8, u8, u8)> =
        room.foes_seen().map(|foe| (foe.foe_type, foe.rank, foe.faction, foe.kind)).collect();
    assert_eq!(
        stood,
        [(5, 3, 1, 4), (12, 5, 1, 5), (17, 3, 0, 5), (17, 3, 0, 5)],
        "no type 99; the crew's on the players' side"
    );
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
    let hostile = stand(&mut room, HUSK, Rank::Major, 0.0, 18.0, PI);
    let events = run(&mut room, 60 * 60);
    let fought = |striker, defender| between(&events, striker, defender).next().is_some();
    assert!(fought(tithe, hostile) || fought(hostile, tithe), "36 m apart, back to back, they meet in a minute");
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
    let hostile = stand(&mut room, HUSK, Rank::Major, 0.0, 25.0, PI);
    let gunner = *room.fighter(pistoleer).unwrap();
    let aimed =
        TelegraphOrder { shape: Shape::Aimed, windup: 60, iron: false, feint_at: None, bearing: 0.0, ahead: 20.0 };
    room.telegraph_lands(pistoleer, &gunner, &Telegraph::begin(&aimed, [0.0, 0.0, 0.0]));
    room.tell_brains();
    let alert = |room: &Room| room.foes_seen().find(|seen| seen.foe == hostile).unwrap().alert;
    assert_eq!(alert(&room), 0, "heard, it stirs at its next thought");
    room.tick();
    assert!(alert(&room) >= 1, "the shot 25 m off, behind it, stirs it");
}

const CREW_SWORDSMAN: u8 = 19;

#[test]
fn a_crewman_and_a_grey_tithe_foe_fight_each_other_until_one_falls() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let crew = stand(&mut room, CREW_SWORDSMAN, Rank::Minor, 0.0, -4.0, PI);
    let tithe = stand(&mut room, COLLECTOR, Rank::Minor, 0.0, 4.0, 0.0);
    assert_eq!(room.fighter(crew).unwrap().side, combat::Side::Players, "the crew fight on the players' side");
    let events = run(&mut room, 60 * 120);
    let hits = |striker, defender| between(&events, striker, defender).filter(|event| event.kind == EventKind::Hit);
    assert!(hits(crew, tithe).count() > 0 && hits(tithe, crew).count() > 0, "{events:?}");
    let killed = |defender| events.iter().any(|event| event.kind == EventKind::Killed && event.defender == defender);
    assert!(killed(crew) || killed(tithe), "one of them falls");
}

#[test]
fn a_players_blow_never_lands_on_the_crew_and_the_crew_never_strike_a_player() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().unwrap();
    let crew = stand(&mut room, CREW_SWORDSMAN, Rank::Minor, 0.0, -1.5, PI);
    let tithe = stand(&mut room, COLLECTOR, Rank::Minor, 1.0, -3.0, PI);
    let chop = combat::CombatInput { attack: Some(combat::arms::Stroke::Down), ..combat::CombatInput::default() };
    for sequence in 1..=600 {
        let combat = if sequence % 40 == 1 { chop } else { combat::CombatInput::default() };
        let intent = combat::Intent { controls: movement::Controls::default(), combat };
        room.input(player, Input { sequence, intent, arms: 2, seen: room.clock(), ..Input::default() }).unwrap();
        room.tick();
    }
    let events = room.take_events();
    assert_eq!(between(&events, player, crew).count(), 0, "{events:?}");
    assert_eq!(between(&events, crew, player).count(), 0, "{events:?}");
    assert!(between(&events, crew, tithe).next().is_some(), "the crewman fights the boarder: {events:?}");
}

#[test]
fn a_crewmans_telegraphed_blow_lands_on_a_boarder_in_its_shape_and_never_on_a_player() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().unwrap();
    room.put_player(player, 0.8, -1.2);
    let crew = stand(&mut room, CREW_SWORDSMAN, Rank::Major, 0.0, 0.0, 0.0);
    let tithe = stand(&mut room, COLLECTOR, Rank::Major, 0.0, -1.0, PI);
    let swordsman = *room.fighter(crew).unwrap();
    let slam = TelegraphOrder { shape: Shape::Slam, windup: 54, iron: false, feint_at: None, bearing: 0.0, ahead: 0.0 };
    room.telegraph_lands(crew, &swordsman, &Telegraph::begin(&slam, [0.0, 0.0, 0.0]));
    for sequence in 1..=30 {
        room.input(player, Input { sequence, seen: room.clock(), ..Input::default() }).unwrap();
        room.tick();
    }
    let events = room.take_events();
    let hit = |defender| between(&events, crew, defender).any(|event| event.kind == EventKind::Hit);
    assert!(hit(tithe) && !hit(player), "{events:?}");
}
