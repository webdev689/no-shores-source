//! The Lodestone's rules where a bearer could slip them: Hold True's rest kept through a set-down or a pass; and the
//! company unwritten losing its attempt, however its fallen stand again.

use super::breach_tests::{at, breach, run, stand_at};
use super::*;
use crate::encounters::encounters_tests::ticks;

/// Raises the bearer's guard, as Guard held does.
fn guard(room: &mut Room, player: PlayerId) {
    room.players.get_mut(&player).expect("in").fighter.action = combat::Action::Guard { elapsed: 0, window: 10_000 };
}

#[test]
fn hold_true_rests_after_it_ends_however_it_ends_a_set_down_or_a_pass_too() {
    let (mut room, players) = run(Tier::Normal, 2);
    let mut breach_box = room.breach.take().expect("run");
    room.set_on_plinth(&mut breach_box, "choir", false);
    room.breach = Some(breach_box);
    let plinth = at(&room, "choir", "plinth");
    stand_at(&mut room, players[0], plinth);
    stand_at(&mut room, players[1], [plinth[0] + 1.0, plinth[1], plinth[2]]);
    assert!(room.take_lodestone(players[0]));
    guard(&mut room, players[0]);
    room.tick();
    assert!(breach(&room).lodestone.held_from.is_some(), "Hold True raised");
    // Set down and taken up again at once, and guarded: no Hold True until its rest is over.
    assert!(room.drop_lodestone(players[0]));
    assert!(room.take_lodestone(players[0]));
    guard(&mut room, players[0]);
    room.tick();
    assert!(breach(&room).lodestone.held_from.is_none(), "a set-down ends it, and its rest follows");
    // Passed to another, who guards: the rest is the stone's.
    assert!(room.drop_lodestone(players[0]));
    assert!(room.take_lodestone(players[1]));
    guard(&mut room, players[1]);
    room.tick();
    assert!(breach(&room).lodestone.held_from.is_none(), "passed on, it still rests");
    ticks(&mut room, lodestone::HOLD_REST);
    guard(&mut room, players[1]);
    room.tick();
    assert!(breach(&room).lodestone.held_from.is_some(), "rested, it rises again");
}

#[test]
fn the_company_unwritten_loses_the_attempt_though_one_fallen_before_it_stands_again_in_time() {
    let (mut room, players) = super::fights_tests::won_to(Tier::Normal, 3, CHOIR);
    super::fights_tests::begin_at(&mut room, &players, "choir", "lectern-2");
    // One falls; eight seconds on, the company is unwritten, and the first stands again two seconds after.
    super::breach_tests::fell(&mut room, players[0]);
    ticks(&mut room, 8 * 60);
    let mut breach_box = room.breach.take().expect("run");
    room.unwrite_all(&mut breach_box);
    room.breach = Some(breach_box);
    ticks(&mut room, WIPE_TICKS + 60);
    assert_eq!(breach(&room).phases[CHOIR], Phase::Waiting, "the attempt is lost");
    assert!(breach(&room).lodestone.needed || breach(&room).lodestone == Lodestone::default(), "its rule whole again");
}
