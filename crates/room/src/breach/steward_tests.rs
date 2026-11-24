//! The Steward's court played through its rules: the way back opened by the court that is left, the Lodestone taken
//! to the shore from its bearer, a bell broken out of order, its last takings unwriting the company, and its fall,
//! which wins the Drowned Vale and brings back any still in a shore.

use super::breach_tests::{breach, told};
use super::fights_tests::{begin_at, kill, put_at, won_to};
use super::*;
use crate::encounters::encounters_tests::ticks;
use crate::{EventKind, PlayerId};

/// The court's Steward made to take now; answers who it took.
fn taken_now(room: &mut Room) -> steward::Away {
    room.breach.as_mut().expect("run").fights.steward.next_taking = room.clock;
    room.tick();
    breach(room).fights.steward.away.clone().expect("taken")
}

/// Every bell of a taking broken in its order.
fn broken_in_order(room: &mut Room, away: &steward::Away) {
    for place in &away.order {
        let (_, id) = away.bells.iter().find(|(at, _)| at == place).expect("its bell");
        kill(room, *id);
        room.tick();
    }
}

#[test]
fn at_hard_the_way_back_opens_to_the_one_the_taking_left_in_the_court() {
    let (mut room, players) = won_to(Tier::Hard, 3, STEWARD);
    begin_at(&mut room, &players, "court", "chest");
    let away = taken_now(&mut room);
    assert_eq!(away.taken.len(), 2, "two of three");
    broken_in_order(&mut room, &away);
    let left: Vec<PlayerId> = players.iter().copied().filter(|player| !away.taken.contains(player)).collect();
    put_at(&mut room, left[0], "court", "mooring-was");
    for &player in &away.taken {
        put_at(&mut room, player, "court-was", "rift");
    }
    room.tick();
    assert!(!room.someone_in(breach(&room), "court-was"), "home, though only one held the mooring");
}

#[test]
fn a_taking_takes_the_lodestone_to_the_shore_from_whoever_bears_it_and_says_so() {
    let (mut room, players) = won_to(Tier::Normal, 2, STEWARD);
    begin_at(&mut room, &players, "court", "chest");
    room.breach.as_mut().expect("run").lodestone.stone = lodestone::Stone::Borne(players[0]);
    room.take_events();
    let away = taken_now(&mut room);
    assert!(breach(&room).lodestone.bearer().is_none(), "on the shore's plinth");
    assert!(told(&mut room, EventKind::LodestoneDropped) >= 1, "its bearer told it is gone");
    assert_eq!(away.taken.len(), 1);
}

#[test]
fn a_shore_bell_broken_out_of_order_stands_all_five_again_and_rewrites_the_shore() {
    let (mut room, players) = won_to(Tier::Normal, 2, STEWARD);
    begin_at(&mut room, &players, "court", "chest");
    let away = taken_now(&mut room);
    let taken = away.taken[0];
    room.breach.as_mut().expect("run").marked.clear();
    let (_, last) = away.bells.iter().find(|(at, _)| *at == away.order[4]).expect("the last bell");
    kill(&mut room, *last);
    room.tick();
    let again = breach(&room).fights.steward.away.clone().expect("still away");
    assert_eq!(again.bells.len(), 5, "all five stand again");
    assert_eq!(again.broken, 0);
    assert!(breach(&room).marked.contains_key(&taken), "the shore Rewritten");
}

#[test]
fn after_its_fourth_taking_the_steward_unwrites_the_company_when_the_next_would_come() {
    let (mut room, players) = won_to(Tier::Normal, 2, STEWARD);
    begin_at(&mut room, &players, "court", "chest");
    room.breach.as_mut().expect("run").fights.steward.takings = steward::TAKINGS_MOST;
    room.breach.as_mut().expect("run").fights.steward.next_taking = room.clock + 30;
    ticks(&mut room, 20);
    assert!(players.iter().all(|player| !room.players[player].fighter.dead()), "not before its time");
    ticks(&mut room, 20);
    assert!(breach(&room).fights.steward.away.is_none(), "no fifth taking");
    assert!(players.iter().all(|player| room.players[player].fighter.dead()), "the company unwritten");
}

#[test]
fn the_stewards_fall_wins_the_drowned_vale_and_brings_back_those_still_in_a_shore() {
    let (mut room, players) = won_to(Tier::Normal, 2, STEWARD);
    begin_at(&mut room, &players, "court", "chest");
    let boss = breach(&room).fights.steward.boss.expect("the Steward stands");
    let away = taken_now(&mut room);
    room.take_events();
    kill(&mut room, boss);
    room.tick();
    assert_eq!(breach(&room).phases[STEWARD], Phase::Won);
    assert_eq!(told(&mut room, EventKind::BreachWon), players.len(), "told to each player");
    assert_eq!(room.breach_progress(), Some((Tier::Normal, gear::breach::DROWNED_VALE.encounters.len())));
    for player in &away.taken {
        assert!(room.in_space(breach(&room), "court").contains(player), "brought back to the court");
    }
}
