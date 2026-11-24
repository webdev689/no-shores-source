//! The Steward's court played through its rules: the way back opened by the court that is left, or by its bells alone
//! with none left there, the Lodestone taken to the shore from its bearer, a bell broken out of order, its measure kept
//! whoever is away, its laying bare once a taking, its last takings unwriting the company, and its fall, which wins the
//! Drowned Vale and brings back any still in a shore; and the Choir's ring, which reaches the whole company.

use super::breach_tests::{breach, stand_at, told};
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

#[test]
fn the_steward_keeps_its_measure_losing_those_still_away_and_takes_from_the_company_wherever_it_stands() {
    let (mut room, players) = won_to(Tier::Normal, 2, STEWARD);
    begin_at(&mut room, &players, "court", "chest");
    let away = taken_now(&mut room);
    let fight = &breach(&room).fights.steward;
    assert_eq!(fight.next_taking - fight.next_toll, steward::TAKING_EVERY.0 - steward::TOLL_EVERY, "a toll 20 s on");
    let taken = away.taken[0];
    let other = players.iter().copied().find(|player| *player != taken).expect("one left");
    // Cleansed in the shore and staying there, as one who keeps the Lodestone's light about them.
    room.breach.as_mut().expect("run").marked.clear();
    put_at(&mut room, other, "hall", "checkpoint");
    taken_now(&mut room);
    assert!(room.players[&taken].fighter.dead(), "the one still away lost as the next taking came");
    let again = breach(&room).fights.steward.away.clone().expect("taken again");
    assert_eq!((breach(&room).fights.steward.takings, again.taken), (2, vec![other]), "from the hall too");
}

#[test]
fn the_ring_of_the_choir_rewrites_the_company_wherever_it_stands() {
    let (mut room, players) = won_to(Tier::Normal, 2, CHOIR);
    begin_at(&mut room, &players, "choir", "lectern-2");
    put_at(&mut room, players[1], "mending", "checkpoint");
    ticks(&mut room, 2 * 60 + 3 * choir::WAKE_APART.0);
    let fight = &breach(&room).fights.choir;
    let last = fight.order[fight.order.len() - 1];
    let (_, bell) = *fight.bells.iter().find(|(place, _)| *place == last).expect("its bell");
    kill(&mut room, bell);
    room.tick();
    assert!(breach(&room).marked.contains_key(&players[1]), "Rewritten outside the chapel");
}

#[test]
fn a_company_taken_whole_comes_back_on_the_bells_alone() {
    let (mut room, players) = won_to(Tier::Normal, 1, STEWARD);
    begin_at(&mut room, &players, "court", "chest");
    let away = taken_now(&mut room);
    assert_eq!(away.taken, players, "the one of one");
    broken_in_order(&mut room, &away);
    put_at(&mut room, players[0], "court-was", "rift");
    room.tick();
    assert!(room.in_space(breach(&room), "court").contains(&players[0]), "home with no one to hold the mooring");
}

#[test]
fn the_steward_lies_bare_once_between_takings() {
    let (mut room, players) = won_to(Tier::Normal, 2, STEWARD);
    begin_at(&mut room, &players, "court", "chest");
    let boss = breach(&room).fights.steward.boss.expect("the Steward stands");
    let ground = |room: &mut Room| {
        let body = room.foes[&boss].fighter.body;
        stand_at(room, players[0], [body.x + 2.0, body.y, body.z]);
        let breach = room.breach.as_mut().expect("run");
        (breach.fights.steward.away, breach.lodestone.grounded_at) = (None, None);
        breach.lodestone.stone = lodestone::Stone::Borne(players[0]);
        room.ground_lodestone(players[0]);
        room.breach.as_ref().expect("run").fights.steward.bare_until
    };
    taken_now(&mut room);
    let first = ground(&mut room);
    assert!(first > room.clock, "laid bare");
    room.clock += 1;
    assert_eq!(ground(&mut room), first, "not again before the next taking");
    taken_now(&mut room);
    assert!(ground(&mut room) > first, "again once it has taken");
}
