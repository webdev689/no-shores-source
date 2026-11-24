//! Destiny's revive: an ally's hold of Use beside a fallen player stands them where they lay, whole; a hold let go of
//! or carried out of reach starts again; the fallen lie until they ask to respawn, once they have lain four seconds;
//! an Abyss run's revives pay for every stand; and the Court's darkness takes no ask, its company all down falling
//! back to its checkpoint.

use super::*;
use crate::encounters::encounters_tests::{elite_room, hardy, unseal};
use crate::{Event, EventKind, Floor, Input, PlayerId, Room, RunOf, Section, Standing};
use combat::Action;
use combat::tuning::{CHARGES, RESPAWN};

/// An open node's room with one spawn, foes standing nowhere.
fn node() -> Room {
    let ring = vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]];
    Room::node(Floor::Flat, Vec::new(), Section { ring, spawns: vec![[0.0, 150.0]], falls_kill: false })
}

/// A player's page: each tick it sends one input, holding Use to revive or asking to respawn as it is told.
struct Page {
    player: PlayerId,
    sequence: u32,
}

impl Page {
    fn join(room: &mut Room) -> Self {
        Page { player: room.join().expect("in"), sequence: 0 }
    }

    fn send(&mut self, room: &mut Room, revive: bool, respawn: bool) {
        self.sequence += 1;
        room.input(self.player, Input { sequence: self.sequence, revive, respawn, ..Input::default() }).expect("taken");
    }
}

/// One tick of the room, each page sending its input: the first `holding` hold Use, the rest hold nothing.
fn tick(room: &mut Room, pages: &mut [&mut Page], holding: usize) {
    for (nth, page) in pages.iter_mut().enumerate() {
        page.send(room, nth < holding, false);
    }
    room.tick();
}

fn put(room: &mut Room, player: PlayerId, [x, y]: [f64; 2]) {
    let body = &mut room.players.get_mut(&player).expect("in").fighter.body;
    (body.x, body.y, body.z) = (x, y, 0.0);
}

fn fell(room: &mut Room, player: PlayerId, elapsed: u32) {
    let fighter = &mut room.players.get_mut(&player).expect("in").fighter;
    (fighter.health, fighter.action) = (0.0, Action::Dead { elapsed });
}

fn told(events: &[Event], kind: EventKind) -> Vec<(PlayerId, PlayerId)> {
    events.iter().filter(|event| event.kind == kind).map(|event| (event.striker, event.defender)).collect()
}

#[test]
fn an_ally_holding_use_beside_a_fallen_player_two_seconds_stands_them_where_they_lay_whole() {
    let mut room = node();
    let (mut ally, mut fallen) = (Page::join(&mut room), Page::join(&mut room));
    put(&mut room, ally.player, [10.0, 10.0]);
    put(&mut room, fallen.player, [12.0, 10.0]);
    fell(&mut room, fallen.player, 0);
    room.take_events();
    for held in 1..REVIVE_TICKS {
        tick(&mut room, &mut [&mut ally, &mut fallen], 1);
        assert!(room.players[&fallen.player].fighter.dead(), "still down at {held}");
        let progress = u32::from(room.reviving_seen()[0].progress);
        assert_eq!(progress, held * 1000 / REVIVE_TICKS, "the hold's share");
    }
    tick(&mut room, &mut [&mut ally, &mut fallen], 1);
    let found = &room.players[&fallen.player];
    assert!(!found.fighter.dead() && found.fighter.health == found.fighter.health_max, "whole");
    assert_eq!(found.fighter.charges, CHARGES, "every healing charge");
    assert_eq!([found.fighter.body.x, found.fighter.body.y], [12.0, 10.0], "where they lay");
    assert_eq!(found.graced, room.clock + crate::GRACE, "the foes leave them be a while");
    assert_eq!(told(&room.take_events(), EventKind::Revived), [(ally.player, fallen.player)], "told, by whom");
    assert!(room.reviving_seen().is_empty());
}

#[test]
fn a_hold_let_go_or_carried_out_of_reach_starts_again_from_nothing() {
    let mut room = node();
    let (mut ally, mut fallen) = (Page::join(&mut room), Page::join(&mut room));
    put(&mut room, ally.player, [10.0, 10.0]);
    put(&mut room, fallen.player, [12.0, 10.0]);
    fell(&mut room, fallen.player, 0);
    for _ in 0..REVIVE_TICKS - 1 {
        tick(&mut room, &mut [&mut ally, &mut fallen], 1);
    }
    tick(&mut room, &mut [&mut ally, &mut fallen], 0);
    assert!(room.reviving_seen().is_empty(), "let go");
    tick(&mut room, &mut [&mut ally, &mut fallen], 1);
    assert!(room.players[&fallen.player].fighter.dead(), "begun again, not finished");
    assert_eq!(room.reviving_seen()[0].progress, u16::try_from(1000 / REVIVE_TICKS).unwrap_or(0));
    put(&mut room, ally.player, [10.0 - REVIVE_REACH_M, 10.0]);
    tick(&mut room, &mut [&mut ally, &mut fallen], 1);
    assert!(room.reviving_seen().is_empty(), "out of reach");
    assert!(room.players[&fallen.player].fighter.dead());
}

#[test]
fn two_allies_hold_one_revive_and_neither_the_fallen_nor_a_body_the_section_killed_is_revived_otherwise() {
    let mut room = node();
    let (mut one, mut two, mut fallen) = (Page::join(&mut room), Page::join(&mut room), Page::join(&mut room));
    for (page, x) in [(&one, 10.0), (&two, 11.0), (&fallen, 12.0)] {
        put(&mut room, page.player, [x, 10.0]);
    }
    fell(&mut room, fallen.player, 0);
    tick(&mut room, &mut [&mut one, &mut two, &mut fallen], 3);
    let seen = room.reviving_seen();
    assert_eq!(seen.len(), 1, "one hold on one fallen player");
    assert_eq!(seen[0].reviver, one.player, "the first to take it up");
    for _ in 1..REVIVE_TICKS - 1 {
        tick(&mut room, &mut [&mut one, &mut two, &mut fallen], 3);
    }
    assert!(room.players[&fallen.player].fighter.dead(), "two hands hold no faster");
    let mut strayed = node();
    let (mut ally, mut lost) = (Page::join(&mut strayed), Page::join(&mut strayed));
    put(&mut strayed, ally.player, [10.0, 10.0]);
    put(&mut strayed, lost.player, [12.0, 10.0]);
    fell(&mut strayed, lost.player, 0);
    strayed.players.get_mut(&lost.player).expect("in").standing = Standing::Dead { ticks: 0, fell: false };
    tick(&mut strayed, &mut [&mut ally, &mut lost], 1);
    assert!(strayed.reviving_seen().is_empty(), "a body the section killed stands only by its own respawn");
}

#[test]
fn the_fallen_lie_until_they_ask_to_respawn_and_may_once_they_have_lain_four_seconds() {
    let mut room = node();
    let mut fallen = Page::join(&mut room);
    put(&mut room, fallen.player, [50.0, 50.0]);
    fell(&mut room, fallen.player, 0);
    for _ in 0..RESPAWN * 2 {
        fallen.send(&mut room, false, false);
        room.tick();
    }
    assert!(room.players[&fallen.player].fighter.dead(), "no one stands a page's player up unasked");
    let mut early = node();
    let mut asking = Page::join(&mut early);
    fell(&mut early, asking.player, RESPAWN - 2);
    asking.send(&mut early, false, true);
    early.tick();
    assert!(early.players[&asking.player].fighter.dead(), "asked too soon: refused, not kept");
    asking.send(&mut early, false, false);
    early.tick();
    assert!(early.players[&asking.player].fighter.dead());
    room.take_events();
    fallen.send(&mut room, false, true);
    room.tick();
    let body = room.players[&fallen.player].fighter.body;
    assert_eq!([body.x, body.y], [0.0, 150.0], "at the spawn, in a node that lays no other place");
    assert_eq!(told(&room.take_events(), EventKind::Respawned), [(fallen.player, fallen.player)]);
    let mut ground = Room::new(Vec::new(), (0.0, 0.0));
    let tried = ground.join().expect("in");
    fell(&mut ground, tried, RESPAWN);
    ground.tick();
    assert!(!ground.players[&tried].fighter.dead(), "a course's room, whose page never asks, stands them unasked");
}

#[test]
fn in_an_abyss_run_a_revive_spends_one_of_the_company_s_revives_and_with_none_left_no_one_stands() {
    let of = RunOf::Patrol { patrol: "gullwing-vale".into(), number: 1 };
    let mut room = Room::dungeon_run(&of, gear::Difficulty::Abyss, 29_919_420).expect("an Abyss run");
    room.send_foes_away();
    let (mut ally, mut fallen) = (Page::join(&mut room), Page::join(&mut room));
    let at = room.players[&ally.player].fighter.body;
    put(&mut room, fallen.player, [at.x + 1.0, at.y]);
    room.run.as_mut().expect("a run").revives = Some(2);
    fell(&mut room, fallen.player, 0);
    for _ in 0..REVIVE_TICKS {
        tick(&mut room, &mut [&mut ally, &mut fallen], 1);
    }
    assert!(!room.players[&fallen.player].fighter.dead(), "revived");
    assert_eq!(room.revives(), Some(1), "and one revive spent");
    room.run.as_mut().expect("a run").revives = Some(0);
    assert!(room.darkness_for(fallen.player), "none left: darkness");
    fell(&mut room, fallen.player, RESPAWN);
    for _ in 0..REVIVE_TICKS * 2 {
        tick(&mut room, &mut [&mut ally, &mut fallen], 1);
    }
    fallen.send(&mut room, false, true);
    ally.send(&mut room, false, false);
    room.tick();
    assert!(room.players[&fallen.player].fighter.dead(), "neither a revive nor a respawn stands them");
    assert!(room.reviving_seen().is_empty(), "no hold is taken up");
}

#[test]
fn in_the_court_while_its_boss_stands_no_one_respawns_by_their_ask_but_an_ally_revives_them() {
    let mut room = elite_room("krakens-grotto");
    let mut ally = Page { player: hardy(&mut room), sequence: 0 };
    let mut fallen = Page::join(&mut room);
    unseal(&mut room);
    assert!(room.boss().is_some(), "the Boss awake");
    // Both in the Court, where it holds.
    let cell = room.encounters.as_ref().expect("encounters").court_cells[0];
    let [x, y] = crate::encounters::encounters_tests::middle_of(&room, cell);
    put(&mut room, ally.player, [x, y]);
    put(&mut room, fallen.player, [x + 1.0, y]);
    assert!(room.darkness_for(fallen.player), "darkness in the Court");
    fell(&mut room, fallen.player, RESPAWN);
    fallen.send(&mut room, false, true);
    ally.send(&mut room, false, false);
    room.tick();
    assert!(room.players[&fallen.player].fighter.dead(), "no ask is taken in the dark");
    for _ in 0..REVIVE_TICKS {
        tick(&mut room, &mut [&mut ally, &mut fallen], 1);
    }
    assert!(!room.players[&fallen.player].fighter.dead(), "an ally still revives them");
}

#[test]
fn a_company_all_down_in_the_court_falls_back_to_its_checkpoint_as_the_court_starts_over() {
    let mut room = elite_room("krakens-grotto");
    let players = [room.join().expect("in"), room.join().expect("in")];
    unseal(&mut room);
    let boss = room.boss().expect("awake");
    let found = room.foes.get_mut(&boss).expect("the Boss");
    found.fighter.health = found.fighter.health_max / 2.0;
    let court = room.checkpoint().expect("the Court's checkpoint, won as the Boss woke");
    let door = room.respawning.checkpoints[court].at;
    room.take_events();
    for player in players {
        fell(&mut room, player, 0);
    }
    room.tick();
    assert!(told(&room.take_events(), EventKind::FellBack).is_empty(), "the company sees itself fall first");
    assert!(players.iter().all(|player| room.players[player].fighter.dead()));
    let mut events = Vec::new();
    for _ in 0..RESPAWN * 2 {
        if !told(&events, EventKind::FellBack).is_empty() {
            break;
        }
        let lain = players.iter().map(|player| room.players[player].fighter.action).collect::<Vec<_>>();
        room.tick();
        events.extend(room.take_events());
        if !told(&events, EventKind::FellBack).is_empty() {
            let elapsed = |action: &Action| if let Action::Dead { elapsed } = action { *elapsed } else { 0 };
            assert!(lain.iter().all(|action| elapsed(action) + 1 >= RESPAWN), "not before the last has lain RESPAWN");
        }
    }
    assert_eq!(told(&events, EventKind::FellBack).len(), 2, "each is told");
    assert_eq!(told(&events, EventKind::Wiped).len(), 0, "below Abyss no wipe ends the run");
    for player in players {
        let fighter = room.players[&player].fighter;
        assert!(!fighter.dead() && [fighter.body.x, fighter.body.y] == door, "whole at the Court's door");
    }
    let boss = room.boss().expect("awake again");
    let fighter = room.foes[&boss].fighter;
    assert_eq!(fighter.health, fighter.health_max, "the Boss whole");
    let seals = &room.encounters.as_ref().expect("encounters").seals;
    assert!(seals.iter().all(|seal| seal.state == crate::encounters::SealState::Broken), "every seal still broken");
    assert_eq!(room.checkpoint(), Some(court));
}

#[test]
fn a_hold_under_way_is_kept_by_its_ally_when_another_with_a_lower_number_comes_to_the_same_fallen_player() {
    let mut room = node();
    let (mut first, mut fallen, mut later) = (Page::join(&mut room), Page::join(&mut room), Page::join(&mut room));
    for (page, x) in [(&first, 10.0), (&fallen, 12.0), (&later, 13.0)] {
        put(&mut room, page.player, [x, 10.0]);
    }
    fell(&mut room, fallen.player, 0);
    // The third player holds first; the first, numbered lower, comes to the same body half way through.
    let hold = |room: &mut Room, first: &mut Page, fallen: &mut Page, later: &mut Page, both: bool| {
        first.send(room, both, false);
        fallen.send(room, false, false);
        later.send(room, true, false);
        room.tick();
    };
    for _ in 0..REVIVE_TICKS / 2 {
        hold(&mut room, &mut first, &mut fallen, &mut later, false);
    }
    for _ in REVIVE_TICKS / 2..REVIVE_TICKS - 1 {
        hold(&mut room, &mut first, &mut fallen, &mut later, true);
        assert_eq!(room.reviving_seen()[0].reviver, later.player, "the hold stays its ally's");
    }
    room.take_events();
    hold(&mut room, &mut first, &mut fallen, &mut later, true);
    assert!(!room.players[&fallen.player].fighter.dead(), "revived on time, not begun again");
    assert_eq!(told(&room.take_events(), EventKind::Revived), [(later.player, fallen.player)]);
}

#[test]
fn a_player_revived_on_a_ledge_stands_on_it_not_on_the_ground_under_it() {
    let ring = vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]];
    let ledge = movement::Block { min_x: 5.0, min_y: 5.0, max_x: 20.0, max_y: 20.0, top: 3.0, bottom: 0.0 };
    let section = Section { ring, spawns: vec![[0.0, 150.0]], falls_kill: false };
    let mut room = Room::node(Floor::Flat, vec![ledge], section);
    let (mut ally, mut fallen) = (Page::join(&mut room), Page::join(&mut room));
    for (page, x) in [(&ally, 10.0), (&fallen, 12.0)] {
        let body = &mut room.players.get_mut(&page.player).expect("in").fighter.body;
        (body.x, body.y, body.z) = (x, 10.0, 3.0);
    }
    fell(&mut room, fallen.player, 0);
    for _ in 0..REVIVE_TICKS {
        tick(&mut room, &mut [&mut ally, &mut fallen], 1);
    }
    let body = room.players[&fallen.player].fighter.body;
    assert!(!room.players[&fallen.player].fighter.dead() && body.z == 3.0, "on the ledge: {body:?}");
}

#[test]
fn the_courts_darkness_holds_those_lying_in_it_and_one_down_at_the_way_in_may_respawn_to_the_courts_door() {
    let mut room = elite_room("krakens-grotto");
    let _ally = hardy(&mut room);
    let mut outside = Page::join(&mut room);
    let mut inside = Page::join(&mut room);
    unseal(&mut room);
    let cell = room.encounters.as_ref().expect("encounters").court_cells[0];
    let court = crate::encounters::encounters_tests::middle_of(&room, cell);
    put(&mut room, inside.player, court);
    let door = room.respawning.checkpoints[room.checkpoint().expect("the Court's")].at;
    assert!(room.darkness_for(inside.player) && !room.darkness_for(outside.player), "dark in the Court alone");
    for page in [&outside, &inside] {
        fell(&mut room, page.player, RESPAWN);
    }
    outside.send(&mut room, false, true);
    inside.send(&mut room, false, true);
    room.tick();
    let stood = room.players[&outside.player].fighter;
    assert!(!stood.dead() && [stood.body.x, stood.body.y] == door, "come back down at the way in: to the Court's door");
    assert!(room.players[&inside.player].fighter.dead(), "fallen in the Court: only an ally raises them");
}

#[test]
fn a_body_past_the_dungeon_s_last_column_lies_in_no_court_cell_however_its_row_wraps() {
    let mut room = elite_room("krakens-grotto");
    let player = room.join().expect("in");
    unseal(&mut room);
    let encounters = room.encounters.as_ref().expect("encounters");
    let columns = encounters.plan.columns;
    let cell = *encounters.court_cells.iter().find(|&&cell| cell >= columns).expect("a Court cell past the first row");
    let (row, column) = (cell / columns, cell % columns);
    // One row up and a whole row's width east: the same cell's number, were the row not bounded.
    let past = [((column + columns) as f64 + 0.5) * dungeon::CELL_M, ((row - 1) as f64 + 0.5) * dungeon::CELL_M];
    put(&mut room, player, past);
    assert!(!room.darkness_for(player), "outside the dungeon's columns");
}
