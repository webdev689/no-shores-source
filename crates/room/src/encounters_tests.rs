//! An Elite Dungeon's encounters in its run's room: its Boss held back until every seal is broken, then woken; a
//! wipe at Abyss keeping the broken seals and starting the Court over; and leaving and coming back keeping them.

use super::*;
use crate::encounter_plan::SealKind;
use crate::{Event, RunOf};
use combat::Action;

/// A Friday's 09:00 UTC: day 20,778, in week 2,968, whose Abyss Dungeon is the Saltworm Warrens.
pub(crate) const FRIDAY_NINE: u64 = 29_919_420;

/// An Elite Dungeon's run at Normal, its garrison sent away so a test's players fight only what it stands.
pub(crate) fn elite_room(place: &str) -> Room {
    let of = RunOf::Elite { place: place.into() };
    let mut room = Room::dungeon_run(&of, gear::Difficulty::Normal, FRIDAY_NINE).expect("an Elite Dungeon's run");
    room.send_foes_away();
    room
}

/// A player joined, too hardy to fall to anything a test stands.
pub(crate) fn hardy(room: &mut Room) -> PlayerId {
    let player = room.join().expect("in");
    let fighter = &mut room.players.get_mut(&player).expect("joined").fighter;
    (fighter.health_max, fighter.health) = (1.0e9, 1.0e9);
    player
}

/// Stands a player at a point, on the ground.
pub(crate) fn put(room: &mut Room, player: PlayerId, [x, y, z]: [f64; 3]) {
    let body = &mut room.players.get_mut(&player).expect("in the room").fighter.body;
    (body.x, body.y, body.z, body.vx, body.vy, body.vz) = (x, y, z, 0.0, 0.0, 0.0);
    body.mode = movement::Mode::Ground;
}

/// The number of the room's seal of `kind`.
pub(crate) fn seal_of(room: &Room, kind: SealKind) -> usize {
    let plan = &room.encounters.as_ref().expect("encounters").plan;
    plan.seals.iter().position(|seal| seal.kind == kind).expect("a seal of that kind")
}

/// A cell's middle, by the plan's columns.
pub(crate) fn middle_of(room: &Room, cell: usize) -> [f64; 2] {
    let columns = room.encounters.as_ref().expect("encounters").plan.columns;
    [((cell % columns) as f64 + 0.5) * dungeon::CELL_M, ((cell / columns) as f64 + 0.5) * dungeon::CELL_M]
}

/// An Elite Dungeon as its run lays it.
pub(crate) fn laid_dungeon(place: &str) -> dungeon::Dungeon {
    let (seed, style) = crate::elite_laid(place).expect("an Elite Dungeon's seed and style");
    dungeon::Dungeon::forge_within(seed, style, dungeon::ELITE_BLOCKS)
}

pub(crate) fn told(events: &[Event], kind: EventKind) -> usize {
    events.iter().filter(|event| event.kind == kind).count()
}

pub(crate) fn ticks(room: &mut Room, count: u64) {
    for _ in 0..count {
        room.tick();
    }
}

/// Breaks every seal of a room that has them, and wakes its Boss.
pub(crate) fn unseal(room: &mut Room) {
    let Some(encounters) = room.encounters.as_mut() else { return };
    for seal in &mut encounters.seals {
        seal.state = SealState::Broken;
    }
    room.tick();
}

#[test]
fn every_elite_dungeon_run_lays_its_encounters_and_no_other_dungeon_does() {
    for elite in gear::activities::elite_dungeons() {
        let room = Room::dungeon_run(&RunOf::Elite { place: elite.id.into() }, gear::Difficulty::Normal, FRIDAY_NINE)
            .expect("its run");
        let seen = room.encounter_seen().expect("its encounters");
        assert!((2..=3).contains(&seen.seals.len()), "{}", elite.id);
        assert!(!seen.woken && seen.boss == 0, "{}: its Boss held back", elite.id);
    }
    let patrol = RunOf::Patrol { patrol: "gullwing-vale".into(), number: 1 };
    let room = Room::dungeon_run(&patrol, gear::Difficulty::Elite, FRIDAY_NINE).expect("a patrol's run");
    assert!(room.encounter_seen().is_none(), "a patrol's dungeon has none");
}

#[test]
fn the_boss_stands_only_once_every_seal_is_broken_and_its_cache_stays_shut_meanwhile() {
    let mut room = elite_room("krakens-grotto");
    let boss = room.garrison[0].members[0].0;
    let player = hardy(&mut room);
    ticks(&mut room, 600);
    assert!(room.garrison[0].standing.is_empty(), "held back");
    assert!(room.foes.values().all(|foe| foe.brain.rank != ::foes::Rank::Boss));
    assert_eq!(room.cache().map(|cache| cache[4]), Some(0.0), "never cleared while held");
    room.take_events();
    unseal(&mut room);
    assert_eq!(told(&room.take_events(), EventKind::BossWoke), 1);
    let id = room.garrison[0].standing[0];
    assert_eq!(room.foes[&id].brain.rank, ::foes::Rank::Boss);
    assert_eq!(room.garrison[0].members[0].0, boss);
    assert_eq!(room.encounter_seen().expect("seen").boss, id);
    assert!(room.players.contains_key(&player));
}

#[test]
fn a_seal_runs_once_a_living_player_stands_in_its_room() {
    let mut room = elite_room("krakens-grotto");
    let player = hardy(&mut room);
    let seal = seal_of(&room, SealKind::Litany);
    room.tick();
    assert_eq!(room.encounters.as_ref().expect("encounters").seals[seal].state, SealState::Waiting);
    let rune = room.encounters.as_ref().expect("encounters").plan.seals[seal].pieces[0];
    let first = room.encounters.as_ref().expect("encounters").plan.seals[seal].cells[0];
    let [x, y] = middle_of(&room, first);
    put(&mut room, player, [x, y, 0.0]);
    room.tick();
    assert_eq!(room.encounters.as_ref().expect("encounters").seals[seal].state, SealState::Running);
    assert!(rune[2].abs() < 1e-9);
}

#[test]
fn a_wipe_at_abyss_keeps_the_broken_seals_and_starts_the_court_over() {
    let of = RunOf::Elite { place: "saltworm-warrens".into() };
    let mut room = Room::dungeon_run(&of, gear::Difficulty::Abyss, FRIDAY_NINE).expect("the week's Abyss run");
    let players = [room.join().expect("in"), room.join().expect("in")];
    let (x, y) = room.spawn_points[0];
    let wave = crate::encounters::seals::seals_tests::stand_one(&mut room, [x, y]);
    {
        let encounters = room.encounters.as_mut().expect("encounters");
        encounters.seals[0].state = SealState::Broken;
        (encounters.seals[1].state, encounters.seals[1].held) = (SealState::Running, 90);
        (encounters.court.wards_broken, encounters.court.reckoning_from) = (1, Some(5));
    }
    for player in players {
        let found = room.players.get_mut(&player).expect("in");
        (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: combat::tuning::RESPAWN });
    }
    room.tick();
    let encounters = room.encounters.as_ref().expect("encounters");
    assert_eq!(encounters.seals[0].state, SealState::Broken, "a broken seal stays broken");
    assert_eq!((encounters.seals[1].state, encounters.seals[1].held), (SealState::Waiting, 0), "the rest wait again");
    assert_eq!(encounters.court.wards_broken, 0, "the Court starts over");
    assert_eq!(encounters.court.reckoning_from, None);
    assert!(room.garrison[0].standing.is_empty(), "its Boss held back again while a seal holds");
    assert!(room.garrison.iter().all(|post| !post.arrival), "no wave stands again");
    assert!(!room.foes.contains_key(&wave), "its foes gone");
}

#[test]
fn a_wipe_with_every_seal_broken_stands_the_boss_again_with_its_court_whole() {
    let of = RunOf::Elite { place: "saltworm-warrens".into() };
    let mut room = Room::dungeon_run(&of, gear::Difficulty::Abyss, FRIDAY_NINE).expect("the week's Abyss run");
    let player = room.join().expect("in");
    unseal(&mut room);
    room.encounters.as_mut().expect("encounters").court.wards_broken = 2;
    let found = room.players.get_mut(&player).expect("in");
    (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: combat::tuning::RESPAWN });
    room.tick();
    let boss = room.boss().expect("the Boss stands again");
    assert_eq!(room.foes[&boss].fighter.health, room.foes[&boss].fighter.health_max);
    assert_eq!(room.encounters.as_ref().expect("encounters").court.wards_broken, 0);
}

#[test]
fn leaving_and_coming_back_keeps_the_seals_as_they_stand() {
    let mut room = elite_room("krakens-grotto");
    let player = room.join().expect("in");
    room.encounters.as_mut().expect("encounters").seals[0].state = SealState::Broken;
    room.leave(player);
    room.tick();
    let _back = room.join().expect("in again");
    room.tick();
    assert_eq!(room.encounters.as_ref().expect("encounters").seals[0].state, SealState::Broken);
}

#[test]
fn with_no_seal_the_boss_its_garrison_stood_is_awake_and_stands_alone() {
    let of = RunOf::Elite { place: "pearl-tomb".into() };
    let mut room = Room::dungeon_run(&of, gear::Difficulty::Normal, FRIDAY_NINE).expect("a run");
    // As a garrison stands its Boss before any encounter is laid.
    room.stand_post(0);
    let standing = room.living_foes();
    let mut plan = room.encounters.as_ref().expect("encounters").plan.clone();
    plan.seals.clear();
    room.lay_encounters(plan, None);
    assert_eq!((room.living_foes(), room.garrison[0].standing.len()), (standing, 1), "no second Boss");
    assert!(room.boss().is_some(), "awake");
}
