//! What a Breach's run keeps as players fall, leave and come back: at Hard the fallen lie wherever they fell while an
//! encounter runs; a late join comes in at the furthest stage, on its floor; one back after leaving comes back as they
//! left, down at the stage if down; the Lodestone falls where it was last carried if its bearer leaves; and the
//! Steward takes no one from an empty court, and a shore emptied of the living ends its taking.

use super::breach_tests::{at, breach, fell, run, stand_at};
use super::*;
use crate::encounters::encounters_tests::{hardy, ticks};

#[test]
fn at_hard_the_fallen_lie_until_raised_wherever_they_fall_while_an_encounter_runs() {
    let (mut room, players) = run(Tier::Hard, 2);
    let inside = at(&room, "mending", "mender");
    stand_at(&mut room, players[0], inside);
    room.tick();
    assert!(matches!(breach(&room).phases[MENDING], Phase::Running(_)));
    let back = at(&room, "descent", "start");
    stand_at(&mut room, players[1], back);
    fell(&mut room, players[1]);
    ticks(&mut room, u64::from(fallen::STANDS_INSIDE) + crate::VIEW_LAG + 2);
    assert!(room.players[&players[1]].fighter.dead(), "down at the Descent while the Mending runs");
}

#[test]
fn a_late_join_comes_in_at_the_furthest_stage_on_its_floor() {
    let (mut room, players) = run(Tier::Normal, 1);
    let stage = at(&room, "mending", "checkpoint");
    stand_at(&mut room, players[0], stage);
    room.tick();
    assert_eq!(breach(&room).reached, 1);
    let late = hardy(&mut room);
    let body = room.players[&late].fighter.body;
    assert!(combat::sight::apart([body.x, body.y], [stage[0], stage[1]]) < 1.0, "at the Mending's stage");
    assert!((body.z - stage[2]).abs() < 0.2, "on its floor, not in the dark: {:.2}", body.z);
}

#[test]
fn one_back_after_leaving_comes_back_as_they_left_and_down_lies_at_the_stage() {
    let (mut room, players) = run(Tier::Hard, 2);
    assert!(room.own(players[0], "ada") && room.own(players[1], "ben"));
    let inside = at(&room, "mending", "mender");
    for &player in &players {
        stand_at(&mut room, player, inside);
    }
    room.tick();
    fell(&mut room, players[1]);
    room.tick();
    room.part(players[1]);
    let back = hardy(&mut room);
    assert!(room.own(back, "ben"));
    let found = &room.players[&back];
    assert!(found.fighter.dead(), "not stood up whole by coming back");
    let stage = at(&room, "mending", "checkpoint");
    let body = found.fighter.body;
    assert!(combat::sight::apart([body.x, body.y], [stage[0], stage[1]]) < 1.0, "lying where the company can raise");
    let health = room.players[&players[0]].fighter.health_max / 2.0;
    room.players.get_mut(&players[0]).expect("in").fighter.health = health;
    room.part(players[0]);
    let again = hardy(&mut room);
    assert!(room.own(again, "ada"));
    let fighter = room.players[&again].fighter;
    assert!((fighter.health / fighter.health_max - 0.5).abs() < 1e-9, "with the share they left with");
}

#[test]
fn the_lodestone_falls_where_it_was_last_carried_when_its_bearer_leaves() {
    let (mut room, players) = run(Tier::Normal, 2);
    let mut breach_box = room.breach.take().expect("run");
    room.set_on_plinth(&mut breach_box, "choir", false);
    room.breach = Some(breach_box);
    let plinth = at(&room, "choir", "plinth");
    stand_at(&mut room, players[0], plinth);
    assert!(room.take_lodestone(players[0]));
    room.tick();
    room.part(players[0]);
    room.tick();
    let lodestone::Stone::Lying(lying, _) = breach(&room).lodestone.stone else { panic!("lying") };
    assert!(combat::sight::apart([lying[0], lying[1]], [plinth[0], plinth[1]]) < 1.0, "by the plinth: {lying:?}");
    assert!((lying[2] - plinth[2]).abs() < 1.5, "at its height, in reach");
}

#[test]
fn the_steward_takes_no_one_from_an_empty_court_and_a_shore_emptied_of_the_living_ends_its_taking() {
    let (mut room, players) = run(Tier::Normal, 4);
    let mut breach_box = room.breach.take().expect("run");
    for before in MENDING..STEWARD {
        room.win_encounter(&mut breach_box, before);
    }
    room.breach = Some(breach_box);
    let court = at(&room, "court", "chest");
    for (nth, &player) in players.iter().enumerate() {
        stand_at(&mut room, player, [court[0] + nth as f64 * 0.5, court[1], court[2]]);
    }
    room.tick();
    let hall = at(&room, "hall", "checkpoint");
    for &player in &players {
        stand_at(&mut room, player, hall);
    }
    room.breach.as_mut().expect("run").fights.steward.next_taking = room.clock;
    room.tick();
    assert!(breach(&room).fights.steward.away.is_none(), "no one in the court to take");
    for (nth, &player) in players.iter().enumerate() {
        stand_at(&mut room, player, [court[0] + nth as f64 * 0.5, court[1], court[2]]);
    }
    room.tick();
    let away = breach(&room).fights.steward.away.clone().expect("taken once there are some to take");
    for &player in &away.taken {
        fell(&mut room, player);
    }
    room.tick();
    room.tick();
    assert!(breach(&room).fights.steward.away.is_none(), "the taking ends with every one taken fallen");
    assert!(away.bells.iter().all(|(_, id)| !room.standing_foe(*id)), "its bells gone with it");
}
