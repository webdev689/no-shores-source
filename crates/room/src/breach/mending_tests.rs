//! The Mending's rules at their edges: a vale closed by its fusions waits for its wipe with its clock stopped, and a
//! walker never fuses into a seam that has shut.

use super::breach_tests::{at, breach, run};
use super::*;
use crate::encounters::encounters_tests::ticks;

#[test]
fn a_vale_closed_by_its_fusions_stops_its_clock_and_loses_the_attempt() {
    let (mut room, players) = run(Tier::Normal, 2);
    super::fights_tests::begin_at(&mut room, &players, "mending", "mender");
    room.breach.as_mut().expect("run").fights.mending.fused = [2, 1, 1];
    room.tick();
    assert!(breach(&room).lost.is_some(), "four fusions unwrite the company");
    assert_eq!(room.breach_seen().expect("seen").stage_ticks, 0, "its clock stopped, never counting from nothing");
    ticks(&mut room, WIPE_TICKS + 1);
    assert_eq!(breach(&room).phases[MENDING], Phase::Waiting, "and the attempt lost");
}

#[test]
fn a_walker_bound_for_a_seam_that_shuts_turns_to_an_open_one_or_falls_apart() {
    let (mut room, players) = run(Tier::Normal, 2);
    super::fights_tests::begin_at(&mut room, &players, "mending", "mender");
    for &player in &players {
        super::fights_tests::put_at(&mut room, player, "mending", "checkpoint");
    }
    // Walkers come until one walks for the north seam, the first stage's.
    while breach(&room).fights.mending.walkers.is_empty() {
        room.tick();
    }
    let (walker, seam) = breach(&room).fights.mending.walkers[0];
    assert_eq!(seam, 0, "bound north");
    let north = at(&room, "mending", "seam-north");
    let fight = &mut room.breach.as_mut().expect("run").fights.mending;
    fight.stage = 3;
    fight.next_walker = u64::MAX;
    let foe = room.foes.get_mut(&walker).expect("walking");
    (foe.fighter.body.x, foe.fighter.body.y) = (north[0], north[1]);
    ticks(&mut room, 60);
    assert_eq!(breach(&room).fights.mending.fusions(), 0, "no seam open, no fusion");
    assert!(!room.foes.get(&walker).is_some_and(|foe| !foe.fighter.dead()), "it fell apart");
}

#[test]
fn the_penitents_come_as_much_more_often_as_the_living_company_is_larger_than_four() {
    assert_eq!([2, 4, 6, 8].map(mending::walk_every), [300, 300, 200, 150]);
    let walkers = |count: usize| {
        let (mut room, players) = run(Tier::Normal, count);
        super::fights_tests::begin_at(&mut room, &players, "mending", "mender");
        for &player in &players {
            super::fights_tests::put_at(&mut room, player, "mending", "checkpoint");
        }
        let mut stood = std::collections::BTreeSet::new();
        for _ in 0..40 * 60 {
            room.tick();
            stood.extend(breach(&room).fights.mending.walkers.iter().map(|(id, _)| *id));
        }
        stood.len()
    };
    let (four, eight) = (walkers(4), walkers(8));
    assert!(eight >= four * 2 - 1, "eight see about twice four's walkers: {eight} against {four}");
}

#[test]
fn in_a_test_room_what_unwrites_the_company_loses_nothing() {
    let (mut room, players) = run(Tier::Hard, 1);
    room.make_test();
    super::fights_tests::begin_at(&mut room, &players, "mending", "mender");
    room.breach.as_mut().expect("run").fights.mending.fused = [2, 1, 1];
    room.tick();
    assert!(breach(&room).lost.is_none(), "the fusions harm the tester but lose no attempt");
    assert!(room.players[&players[0]].living(), "who still stands");
}
