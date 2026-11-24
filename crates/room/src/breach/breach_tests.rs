//! A Breach's run: its room, its stages and how its fallen stand again at each tier, raising and revives, wipes, its
//! seals and slabs (the room's blocks its plan's for the seals and tick its snapshot tells), and the Lodestone.

use super::*;
use crate::encounters::encounters_tests::{hardy, ticks};
use crate::{EventKind, PlayerId};

/// A run at `tier` with `count` hardy players, every event so far taken.
pub(crate) fn run(tier: Tier, count: usize) -> (Room, Vec<PlayerId>) {
    let mut room = Room::breach_run(tier, 29_000_000).expect("the run opens");
    let players = (0..count).map(|_| hardy(&mut room)).collect();
    room.take_events();
    (room, players)
}

/// Stands a player at a point, on the ground, measuring falls from there.
pub(crate) fn stand_at(room: &mut Room, player: PlayerId, [x, y, z]: [f64; 3]) {
    let found = room.players.get_mut(&player).expect("in the room");
    let body = &mut found.fighter.body;
    (body.x, body.y, body.z, body.vx, body.vy, body.vz) = (x, y, z, 0.0, 0.0, 0.0);
    body.mode = movement::Mode::Ground;
    found.stood = z;
}

/// A socket of a space in the run.
pub(crate) fn at(room: &Room, space: &str, socket: &str) -> [f64; 3] {
    room.breach.as_ref().expect("a run").plan.socket(space, socket).expect("its socket").0
}

/// Lays a player down as a blow kills.
pub(crate) fn fell(room: &mut Room, player: PlayerId) {
    room.harm_share(player, 1.0e3, 0);
}

pub(crate) fn breach(room: &Room) -> &Breach {
    room.breach.as_ref().expect("a run")
}

pub(crate) fn told(room: &mut Room, kind: EventKind) -> usize {
    room.take_events().iter().filter(|event| event.kind == kind).count()
}

#[test]
fn a_run_opens_at_the_descents_top_with_its_seals_shut_and_its_encounters_waiting() {
    for tier in Tier::ALL {
        let (room, players) = run(tier, 2);
        let arrival = at(&room, "descent", "arrival");
        let body = room.players[&players[0]].fighter.body;
        assert!(combat::sight::apart([body.x, body.y], [arrival[0], arrival[1]]) < 1.0, "{tier:?}: at the arrival");
        assert!((body.z - arrival[2]).abs() < 0.1);
        let breach = breach(&room);
        assert_eq!(breach.phases[MENDING..], [Phase::Waiting; 5]);
        assert!(breach.open_seals.is_empty());
        assert_eq!(breach.revives, tier.revives());
        assert_eq!(room.place, Some(gear::gate::Place::Breach(tier)));
    }
}

#[test]
fn an_encounter_begins_once_a_living_player_stands_in_its_space_and_its_stage_is_reached() {
    let (mut room, players) = run(Tier::Normal, 2);
    room.tick();
    assert_eq!(breach(&room).phases[MENDING], Phase::Waiting);
    let stage = at(&room, "mending", "checkpoint");
    stand_at(&mut room, players[0], stage);
    room.tick();
    assert_eq!(breach(&room).phases[MENDING], Phase::Waiting, "not at its stage");
    assert_eq!(breach(&room).reached, 1, "but the stage is reached");
    let inside = at(&room, "mending", "seam-west");
    stand_at(&mut room, players[0], inside);
    room.tick();
    assert!(matches!(breach(&room).phases[MENDING], Phase::Running(_)));
    assert_eq!(breach(&room).reached, 1);
    assert_eq!(told(&mut room, EventKind::BreachBegun), players.len(), "told to each player");
}

#[test]
fn no_encounter_begins_before_the_one_before_it_is_won_and_each_begins_with_its_revives_whole() {
    let (mut room, players) = run(Tier::Hard, 1);
    let font = at(&room, "choir", "font");
    stand_at(&mut room, players[0], font);
    room.tick();
    assert_eq!(breach(&room).phases[CHOIR], Phase::Waiting, "the Mending not yet won");
    let mut breach_box = room.breach.take().expect("run");
    breach_box.revives = Some(1);
    room.win_encounter(&mut breach_box, MENDING);
    room.breach = Some(breach_box);
    room.tick();
    assert!(matches!(breach(&room).phases[CHOIR], Phase::Running(_)), "won, the next begins");
    assert_eq!(breach(&room).revives, Tier::Hard.revives(), "its revives whole");
}

#[test]
fn a_seal_stands_until_its_encounter_is_won_and_a_slab_stands_only_in_its_cycle() {
    let (mut room, players) = run(Tier::Normal, 1);
    let seal = room.breach.as_ref().map(|breach| breach.plan.seal_blocks(&breach.plan.seals[0])).expect("a seal");
    let standing = |room: &Room| room.breach.as_ref().expect("run").standing.clone();
    assert!(seal.iter().all(|block| standing(&room).contains(block)), "shut");
    let inside = at(&room, "mending", "mender");
    stand_at(&mut room, players[0], inside);
    room.tick();
    let mut breach_box = room.breach.take().expect("run");
    room.win_encounter(&mut breach_box, MENDING);
    room.breach = Some(breach_box);
    room.tick();
    assert!(seal.iter().all(|block| !standing(&room).contains(block)), "open once the Mending is won");
    let slab = drowned_vale().slabs[0].clone();
    let block = drowned_vale().slab_block(&slab).expect("its block");
    let stands = |room: &Room| standing(room).contains(&block);
    for _ in 0..plan::SLAB_CYCLE {
        assert_eq!(stands(&room), plan::slab_stands(&slab, room.clock), "tick {}", room.clock);
        room.tick();
    }
}

#[test]
fn at_hard_the_fallen_in_a_running_encounter_never_stand_again_of_themselves_but_are_raised_for_a_revive() {
    let (mut room, players) = run(Tier::Hard, 2);
    let inside = at(&room, "mending", "mender");
    for &player in &players {
        stand_at(&mut room, player, inside);
    }
    room.tick();
    fell(&mut room, players[1]);
    ticks(&mut room, 20 * 60);
    assert!(room.players[&players[1]].fighter.dead(), "still down after twenty seconds");
    let body = room.players[&players[1]].fighter.body;
    stand_at(&mut room, players[0], [body.x + 1.0, body.y, body.z]);
    room.take_events();
    assert_eq!(room.ask_raise(players[0], players[1]), 0);
    ticks(&mut room, fallen::RAISE_TICKS + 1);
    assert!(!room.players[&players[1]].fighter.dead(), "raised");
    assert_eq!(breach(&room).revives, Some(4), "for one of the attempt's five");
    assert_eq!(told(&mut room, EventKind::Revived), 1);
    room.breach.as_mut().expect("run").revives = Some(0);
    fell(&mut room, players[1]);
    room.tick();
    assert_eq!(room.ask_raise(players[0], players[1]), fallen::NO_REVIVES);
}

#[test]
fn at_normal_the_fallen_in_a_running_encounter_stand_again_after_ten_seconds_at_its_stage() {
    let (mut room, players) = run(Tier::Normal, 2);
    let inside = at(&room, "mending", "mender");
    for &player in &players {
        stand_at(&mut room, player, inside);
    }
    room.tick();
    let seam = at(&room, "mending", "seam-north");
    stand_at(&mut room, players[1], seam);
    fell(&mut room, players[1]);
    ticks(&mut room, u64::from(fallen::STANDS_INSIDE) - 30);
    assert!(room.players[&players[1]].fighter.dead());
    ticks(&mut room, 30 + crate::VIEW_LAG + 2);
    let body = room.players[&players[1]].fighter.body;
    let stage = at(&room, "mending", "checkpoint");
    assert!(!room.players[&players[1]].fighter.dead(), "stood again");
    assert!(combat::sight::apart([body.x, body.y], [stage[0], stage[1]]) < 1.0, "at the Mending's stage");
}

#[test]
fn outside_a_running_encounter_the_fallen_stand_again_after_six_seconds_at_either_tier() {
    let (mut room, players) = run(Tier::Hard, 1);
    room.tick();
    fell(&mut room, players[0]);
    // A body down counts its time as its inputs step it, a view's lag behind the room when none come.
    ticks(&mut room, u64::from(fallen::STANDS_OUTSIDE) + crate::VIEW_LAG + 2);
    assert!(!room.players[&players[0]].fighter.dead());
}

#[test]
fn a_fall_into_the_dark_stands_again_no_sooner_than_a_fights_dead_would() {
    let (mut room, players) = run(Tier::Normal, 1);
    room.tick();
    room.players.get_mut(&players[0]).expect("in").standing = reach::Standing::Dead { ticks: 0, fell: true };
    let lies = fallen::STANDS_OUTSIDE;
    for sequence in 1..=lies + 2 {
        room.input(players[0], crate::Input { sequence, respawn: true, ..crate::Input::default() }).expect("taken");
        room.tick();
        let down = matches!(room.players[&players[0]].standing, reach::Standing::Dead { .. });
        assert!(down || sequence + 2 >= lies, "asked at {sequence} ticks, still down");
    }
    assert_eq!(room.players[&players[0]].standing, reach::Standing::Inside, "stood again after six seconds");
}

#[test]
fn every_living_player_down_three_seconds_wipes_the_attempt_and_stands_them_at_its_stage() {
    let (mut room, players) = run(Tier::Hard, 2);
    let inside = at(&room, "mending", "mender");
    for &player in &players {
        stand_at(&mut room, player, inside);
    }
    ticks(&mut room, 5 * 60);
    assert!(!breach(&room).foes.is_empty(), "the Mending stood its foes");
    room.breach.as_mut().expect("run").revives = Some(2);
    for &player in &players {
        fell(&mut room, player);
    }
    ticks(&mut room, WIPE_TICKS - 2);
    assert!(matches!(breach(&room).phases[MENDING], Phase::Running(_)));
    ticks(&mut room, 4);
    assert_eq!(breach(&room).phases[MENDING], Phase::Waiting, "waiting until the company walks in again");
    assert_eq!(breach(&room).revives, Some(5), "whole again");
    assert!(players.iter().all(|player| !room.players[player].fighter.dead()));
    assert!(breach(&room).foes.is_empty());
    assert_eq!(told(&mut room, EventKind::BreachWiped), players.len(), "told to each player");
}

#[test]
fn the_lodestone_is_taken_in_reach_held_bare_handed_set_down_and_left_lying_unwrites_the_company() {
    let (mut room, players) = run(Tier::Hard, 2);
    let mut breach_box = room.breach.take().expect("run");
    room.set_on_plinth(&mut breach_box, "choir", true);
    room.breach = Some(breach_box);
    let plinth = at(&room, "choir", "plinth");
    stand_at(&mut room, players[0], [plinth[0] + 5.0, plinth[1], plinth[2]]);
    assert!(!room.take_lodestone(players[0]), "out of reach");
    stand_at(&mut room, players[0], [plinth[0] + 1.5, plinth[1], plinth[2]]);
    assert!(room.take_lodestone(players[0]));
    assert!(room.bears_lodestone(players[0]));
    assert!(room.drop_lodestone(players[0]));
    stand_at(&mut room, players[1], plinth);
    ticks(&mut room, lodestone::LYING_MOST.1 + 1);
    assert!(players.iter().all(|player| room.players[player].fighter.dead()), "left lying at Hard, unwritten");
}

#[test]
fn hold_true_cleanses_the_rewritten_round_its_bearer_and_halves_a_foes_blow_there() {
    let (mut room, players) = run(Tier::Normal, 2);
    let mut breach_box = room.breach.take().expect("run");
    room.set_on_plinth(&mut breach_box, "choir", false);
    room.rewrite(&mut breach_box, players[1]);
    room.breach = Some(breach_box);
    let plinth = at(&room, "choir", "plinth");
    stand_at(&mut room, players[0], plinth);
    stand_at(&mut room, players[1], [plinth[0] + 2.0, plinth[1], plinth[2]]);
    assert!(room.take_lodestone(players[0]));
    room.players.get_mut(&players[0]).expect("in").fighter.action =
        combat::Action::Guard { elapsed: 0, window: 10_000 };
    room.tick();
    assert!(breach(&room).lodestone.held_from.is_some(), "Hold True raised");
    assert!(breach(&room).marked.is_empty(), "the mark cleansed");
    assert_eq!(room.held_times(players[1]), lodestone::HELD_TIMES);
}

/// Blocks' edges to the bit.
fn bits(blocks: &[Block]) -> Vec<[u64; 6]> {
    let edges = |block: &Block| [block.min_x, block.min_y, block.max_x, block.max_y, block.bottom, block.top];
    blocks.iter().map(|block| edges(block).map(f64::to_bits)).collect()
}

#[test]
fn the_room_stands_its_plans_blocks_for_the_seals_and_the_tick_its_snapshot_tells() {
    use movement::Near;
    let (mut room, _) = run(Tier::Normal, 1);
    for opened in [None, Some(0), Some(1), Some(2)] {
        // Each seal opened as its encounter's win opens it, with no space walked into to bake.
        room.breach.as_mut().expect("run").open_seals.extend(opened);
        for _ in 0..plan::SLAB_CYCLE / 6 {
            room.clock += 5;
            room.tick();
            let seals = room.breach_seen().expect("a run's").seals;
            let planned = drowned_vale().blocks_at(seals, room.clock());
            assert_eq!(bits(room.blocks.all()), bits(&planned), "seals {seals:b} at {}", room.clock());
        }
    }
}
