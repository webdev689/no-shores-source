//! The Unlit Ways at their edges: no Watcher hears a company before it has had time to read what the Ways ask; at Hard
//! the unwriting a sighting calls comes, whoever reaches the Stair meanwhile; and the Heart's chest shuts once anyone
//! is seen.

use super::breach_tests::{breach, stand_at};
use super::fights_tests::{begin_at, put_at, won_to};
use super::*;
use crate::PlayerId;
use crate::encounters::encounters_tests::ticks;

/// A point `metres` ahead of the first Watcher, in its light.
fn ahead_of_first(room: &Room, metres: f64) -> [f64; 3] {
    let (id, post, _) = breach(room).fights.ways.watchers[0];
    let watcher = room.foes[&id].fighter.body;
    [watcher.x + libm::sin(post) * metres, watcher.y - libm::cos(post) * metres, watcher.z - 0.5]
}

/// A player sprinting where they stand, as a body running hard.
fn sprinting(room: &mut Room, player: PlayerId, at: [f64; 3]) {
    stand_at(room, player, at);
    room.players.get_mut(&player).expect("in").fighter.body.vx = 7.0;
}

#[test]
fn no_watcher_hears_a_runner_before_the_ways_have_run_long_enough_to_read_what_they_ask() {
    let (mut room, players) = won_to(Tier::Normal, 2, WAYS);
    begin_at(&mut room, &players, "ways", "heart");
    put_at(&mut room, players[0], "ways", "checkpoint");
    // Behind the first Watcher, out of its light, near enough to be heard.
    // The Breach's rules alone each tick, so the run set here is the one the Watchers hear.
    let behind = ahead_of_first(&room, -6.0);
    let listen = |room: &mut Room| {
        room.clock += 1;
        sprinting(room, players[1], behind);
        room.keep_breach();
    };
    let Phase::Running(since) = breach(&room).phases[WAYS] else { panic!("the Ways run") };
    while room.clock + 1 < since + ways::HEAR_AFTER {
        listen(&mut room);
    }
    assert!(!breach(&room).fights.ways.seen, "not heard while the Ways are new");
    listen(&mut room);
    listen(&mut room);
    assert!(breach(&room).fights.ways.seen, "heard once they have run their while");
}

#[test]
fn at_hard_a_sighting_unwrites_the_company_though_it_reaches_the_stair_and_the_hearts_chest_shuts() {
    let (mut room, players) = won_to(Tier::Hard, 2, WAYS);
    begin_at(&mut room, &players, "ways", "heart");
    room.tick();
    assert!(breach(&room).chests.contains(&2), "the Heart's chest opens to an unseen company");
    ticks(&mut room, ways::HEAR_AFTER);
    put_at(&mut room, players[0], "ways", "checkpoint");
    let ahead = ahead_of_first(&room, 5.0);
    for _ in 0..ways::SEEN_TICKS + 5 {
        stand_at(&mut room, players[1], ahead);
        room.breach.as_mut().expect("run").fights.ways.watchers[0].2 = -1.0;
        room.tick();
    }
    assert!(breach(&room).fights.ways.seen, "seen");
    assert!(!breach(&room).chests.contains(&2), "and the Heart's chest shut again");
    for &player in &players {
        put_at(&mut room, player, "stair", "start");
    }
    ticks(&mut room, ways::SEEN_TO_WIPE + 1);
    assert_ne!(breach(&room).phases[WAYS], Phase::Won, "the Stair reached does not outrun the unwriting");
}
