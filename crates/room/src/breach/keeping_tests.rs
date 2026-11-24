//! What a Breach's run keeps as players fall, leave and come back: at Hard the fallen lie wherever they fell while an
//! encounter runs; a late join comes in at the furthest stage, on its floor; one back after leaving comes back as they
//! left, down at the stage if down (a fall into the dark among them), marked as they left, in a shore of the Two Shores
//! they left from, and whole once the attempt is won or wiped; the Lodestone falls where it was last carried if its
//! bearer leaves; a shore emptied of the living ends its taking; a mark goes with its player's fall; and a foe gone
//! from the room is forgotten.

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
fn a_mark_goes_with_its_players_fall_so_one_stood_again_is_not_unwritten_by_it() {
    let (mut room, players) = run(Tier::Normal, 2);
    let mut breach_box = room.breach.take().expect("run");
    room.rewrite(&mut breach_box, players[0]);
    room.breach = Some(breach_box);
    fell(&mut room, players[0]);
    room.tick();
    assert!(!breach(&room).marked.contains_key(&players[0]), "gone with the fall");
    let stage = at(&room, "descent", "start");
    room.stand_whole(players[0], stage);
    let mut breach_box = room.breach.take().expect("run");
    room.write(&mut breach_box, 0);
    room.breach = Some(breach_box);
    assert!(!room.players[&players[0]].fighter.dead(), "not unwritten at the next writing");
}

#[test]
fn one_who_left_down_comes_back_whole_once_the_attempt_is_won_or_wiped() {
    for wiped in [false, true] {
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
        let mut breach_box = room.breach.take().expect("run");
        if wiped {
            room.wipe(&mut breach_box, MENDING);
        } else {
            room.win_encounter(&mut breach_box, MENDING);
        }
        room.breach = Some(breach_box);
        let back = hardy(&mut room);
        assert!(room.own(back, "ben"));
        assert!(!room.players[&back].fighter.dead(), "wiped {wiped}: back whole, as the company stood again");
    }
}

#[test]
fn a_foe_gone_from_the_room_is_gone_from_its_encounter_and_its_spoils() {
    let (mut room, players) = run(Tier::Normal, 1);
    let inside = at(&room, "mending", "mender");
    stand_at(&mut room, players[0], inside);
    ticks(&mut room, 4 * 60);
    let foe = *breach(&room).foes.first().expect("the Mending stood its foes");
    room.foes.get_mut(&foe).expect("standing").fighter.action =
        combat::Action::Dead { elapsed: combat::tuning::FOE_GONE };
    room.tick();
    assert!(!room.foes.contains_key(&foe), "laid its time, gone from the room");
    assert!(!breach(&room).foes.contains(&foe), "and from the encounter's foes");
    let other = *breach(&room).foes.first().expect("another");
    room.gone(other);
    assert!(!room.quests.spoilless.contains(&other), "gone at once, its spoils forgotten");
}

#[test]
fn a_shore_emptied_of_the_living_ends_its_taking() {
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
    room.breach.as_mut().expect("run").fights.steward.next_taking = room.clock;
    room.tick();
    let away = breach(&room).fights.steward.away.clone().expect("taken");
    for &player in &away.taken {
        fell(&mut room, player);
    }
    room.tick();
    room.tick();
    assert!(breach(&room).fights.steward.away.is_none(), "the taking ends with every one taken fallen");
    assert!(away.bells.iter().all(|(_, id)| !room.standing_foe(*id)), "its bells gone with it");
}

#[test]
fn one_who_leaves_after_a_fall_into_the_dark_comes_back_down() {
    let (mut room, players) = run(Tier::Hard, 2);
    assert!(room.own(players[0], "ada") && room.own(players[1], "ben"));
    let inside = at(&room, "mending", "mender");
    for &player in &players {
        stand_at(&mut room, player, inside);
    }
    room.tick();
    room.players.get_mut(&players[1]).expect("in").standing = reach::Standing::Dead { ticks: 0, fell: true };
    room.part(players[1]);
    let back = hardy(&mut room);
    assert!(room.own(back, "ben"));
    assert!(!room.players[&back].living(), "down at the stage, not stood up whole by coming back");
}

#[test]
fn one_back_after_leaving_keeps_their_rewritten_mark_and_its_time() {
    let (mut room, players) = run(Tier::Normal, 2);
    assert!(room.own(players[0], "ada") && room.own(players[1], "ben"));
    room.tick();
    let mut breach_box = room.breach.take().expect("run");
    room.rewrite(&mut breach_box, players[1]);
    room.breach = Some(breach_box);
    let marked = breach(&room).marked[&players[1]];
    room.tick();
    room.part(players[1]);
    let back = hardy(&mut room);
    assert!(room.own(back, "ben"));
    room.tick();
    assert_eq!(breach(&room).marked.get(&back), Some(&marked), "Rewritten still, since the same tick");
}

#[test]
fn one_who_leaves_from_a_shore_of_the_two_shores_comes_back_there() {
    let (mut room, players) = super::fights_tests::won_to(Tier::Normal, 2, SHORES);
    assert!(room.own(players[0], "ada") && room.own(players[1], "ben"));
    super::fights_tests::begin_at(&mut room, &players, "hall", "plinth");
    let warden = breach(&room).fights.shores.warden.expect("the Warden stands");
    super::fights_tests::kill(&mut room, warden);
    room.tick();
    super::fights_tests::put_at(&mut room, players[1], "hall-was", "arrival");
    room.tick();
    room.part(players[1]);
    let back = hardy(&mut room);
    assert!(room.own(back, "ben"));
    assert!(room.in_space(breach(&room), "hall-was").contains(&back), "back in what was");
}

#[test]
fn one_who_left_fallen_into_the_dark_comes_back_so_and_no_revive_raises_them() {
    let (mut room, players) = run(Tier::Hard, 2);
    for (player, account) in players.iter().zip(["ada", "ben"]) {
        assert!(room.own(*player, account));
    }
    let inside = at(&room, "mending", "mender");
    for &player in &players {
        stand_at(&mut room, player, inside);
    }
    room.tick();
    let found = room.players.get_mut(&players[1]).expect("in");
    found.fighter.health = 0.0;
    found.fighter.action = combat::Action::Dead { elapsed: 0 };
    found.standing = crate::Standing::Dead { ticks: 0, fell: true };
    room.part(players[1]);
    let back = crate::encounters::encounters_tests::hardy(&mut room);
    assert!(room.own(back, "ben"));
    assert!(matches!(room.players[&back].standing, crate::Standing::Dead { fell: true, .. }), "fallen still");
    let body = room.players[&back].fighter.body;
    stand_at(&mut room, players[0], [body.x + 1.0, body.y, body.z]);
    super::breach_tests::hold_revive(&mut room, players[0], 1);
    assert!(room.players[&back].fighter.dead(), "no revive raises one fallen into the dark");
    assert_eq!(breach(&room).revives, Some(5), "and none is spent");
}

#[test]
fn two_revives_finished_on_one_tick_spend_no_revive_the_attempt_has_not_left() {
    let (mut room, players) = run(Tier::Hard, 4);
    let inside = at(&room, "mending", "mender");
    for (nth, &player) in players.iter().enumerate() {
        stand_at(&mut room, player, [inside[0] + nth as f64 * 6.0, inside[1], inside[2]]);
    }
    room.tick();
    fell(&mut room, players[2]);
    fell(&mut room, players[3]);
    for (reviver, fallen) in [(players[0], players[2]), (players[1], players[3])] {
        let body = room.players[&fallen].fighter.body;
        stand_at(&mut room, reviver, [body.x + 1.0, body.y, body.z]);
    }
    room.breach.as_mut().expect("run").revives = Some(1);
    for sequence in 1..=crate::revive::REVIVE_TICKS + 1 {
        for reviver in [players[0], players[1]] {
            room.input(reviver, crate::Input { sequence, revive: true, ..crate::Input::default() }).expect("taken");
        }
        room.tick();
    }
    let stood = [players[2], players[3]].iter().filter(|fallen| !room.players[fallen].fighter.dead()).count();
    assert_eq!(stood, 1, "one revive left, one raised");
    assert_eq!(breach(&room).revives, Some(0));
}
