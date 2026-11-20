//! A garrison's groups as Bungie leads them: each led by its highest rank, broken by its fall, one of them raging;
//! defending its ground once half of it has fallen; a Grey Tithe leader screened by its followers until they are gone;
//! and a mission's or a dungeon's garrison giving ground as one encounter, falling back halfway to its last stand, then
//! gathering there, a mission's reserve coming in waves.

use super::garrison_tests::{node, run, stand_player};
use super::groups::Stage;
use super::leash_tests::whole;
use super::*;
use crate::PlayerId;
use ::foes::roles::Role;
use ::foes::{Mood, Seen, notice};
use combat::fighter::Action;

const KINDS: [NodeKind; 4] = [NodeKind::Patrol, NodeKind::Mission, NodeKind::Dungeon, NodeKind::Boss];
const NODES: [&str; 4] = ["glade", "pass", "keep", "ford"];

fn kill(room: &mut Room, id: FighterId) {
    let found = room.foes.get_mut(&id).unwrap();
    found.fighter.health = 0.0;
    found.fighter.action = Action::Dead { elapsed: 0 };
}

fn living(room: &Room, post: usize) -> Vec<FighterId> {
    let alive = |id: &&FighterId| room.foes.get(id).is_some_and(|foe| !foe.fighter.dead());
    room.garrison[post].standing.iter().filter(alive).copied().collect()
}

fn mood(room: &Room, id: FighterId) -> Mood {
    room.foes[&id].brain.mood(room.clock)
}

/// Every living foe of the room woken toward a player's feet, as an ally's shout beside it would.
fn wake_all(room: &mut Room, player: PlayerId) {
    let body = room.players[&player].fighter.body;
    let clock = room.clock;
    for (id, foe) in &mut room.foes {
        let feet = [foe.fighter.body.x, foe.fighter.body.y, foe.fighter.body.z];
        let seen = Seen::Shouted { from: feet, at: [body.x, body.y, body.z] };
        notice(&mut foe.brain, *id, &seen, clock);
    }
}

/// Stands the player 6 m before a post's first foe and runs until each of its living foes fights them.
fn provoke(room: &mut Room, post: usize, player: PlayerId) {
    let (_, _, place, facing) = room.garrison[post].members[0];
    stand_player(room, player, [place[0] + libm::sin(facing) * 6.0, place[1] - libm::cos(facing) * 6.0]);
    for _ in 0..900 {
        if living(room, post).iter().all(|id| room.foes[id].brain.fights() == Some(player)) {
            return;
        }
        whole(room, player);
        run(room, 1);
    }
    panic!("the group never turned on the player");
}

#[test]
fn every_group_is_led_by_its_highest_rank_a_captain_first_among_equals() {
    for kind in KINDS {
        for id in NODES {
            let room = node(kind, id);
            for post in &room.garrison {
                let leader = &room.foes[&post.leader.expect("every group has a leader")].brain;
                for other in &post.standing {
                    let brain = &room.foes[other].brain;
                    assert!(brain.rank <= leader.rank, "{kind:?} {id}: none outranks its leader");
                    if brain.rank == leader.rank && brain.role() == Role::Captain {
                        assert_eq!(leader.role(), Role::Captain, "{kind:?} {id}: a captain first among equals");
                    }
                }
            }
        }
    }
    // A mission's Elites: its Reeve leads its Enforcer.
    let room = node(NodeKind::Mission, "glade");
    let elites = room.garrison.iter().find(|post| post.members.iter().all(|(_, rank, ..)| *rank == Rank::Elite));
    let leader = elites.and_then(|post| post.leader).map(|id| room.foes[&id].brain.foe_type.name);
    assert_eq!(leader, Some("Reeve"));
}

#[test]
fn a_leaders_fall_breaks_the_rest_of_its_group_one_of_them_raging() {
    // Patrol "glade": its first group, a Runner Major leading two Collectors and a Crossbowman.
    let mut room = node(NodeKind::Patrol, "glade");
    let player = room.join().unwrap();
    provoke(&mut room, 0, player);
    let leader = room.garrison[0].leader.unwrap();
    kill(&mut room, leader);
    run(&mut room, 1);
    let followers = living(&room, 0);
    let raging: Vec<FighterId> = followers.iter().copied().filter(|id| mood(&room, *id) == Mood::Raging).collect();
    assert_eq!(raging.len(), 1, "one rages");
    assert_eq!(room.foes[&raging[0]].brain.role(), Role::Swordsman, "with no brute nor skirmisher left, a swordsman");
    for id in followers.iter().filter(|id| !raging.contains(id)) {
        assert_eq!(mood(&room, *id), Mood::Broken, "the rest break");
    }
    // The break lasts its time; the rage, its fight.
    whole(&mut room, player);
    run(&mut room, u64::from(combat::ticks(::foes::tuning::BREAK)));
    for id in living(&room, 0) {
        let expected = if raging.contains(&id) { Mood::Raging } else { Mood::Steady };
        assert_eq!(mood(&room, id), expected);
    }
}

#[test]
fn a_brute_rages_first_and_a_group_idle_as_its_leader_falls_does_not_break() {
    // Dungeon "keep": its second group, an Enforcer Elite leading a Collector and an Enforcer Major.
    let mut room = node(NodeKind::Dungeon, "keep");
    let player = room.join().unwrap();
    provoke(&mut room, 1, player);
    let leader = room.garrison[1].leader.unwrap();
    kill(&mut room, leader);
    run(&mut room, 1);
    let raging = living(&room, 1).into_iter().find(|id| mood(&room, *id) == Mood::Raging);
    assert_eq!(raging.map(|id| room.foes[&id].brain.role()), Some(Role::Brute), "the brute rages");
    // Its fourth group, idle far from the player, feels nothing of its leader's fall.
    stand_player(&mut room, player, [-190.0, -190.0]);
    run(&mut room, 1);
    let leader = room.garrison[3].leader.unwrap();
    kill(&mut room, leader);
    run(&mut room, 2);
    assert!(living(&room, 3).iter().all(|id| mood(&room, *id) == Mood::Steady));
    assert!(room.garrison[3].broken, "its break spent all the same");
}

#[test]
fn half_a_group_fallen_it_defends_its_ground_round_its_post_until_it_stands_again() {
    // Patrol "pass": its second group, a Crossbowman Major leading a Collector, a Runner and a Collector.
    let mut room = node(NodeKind::Patrol, "pass");
    let player = room.join().unwrap();
    provoke(&mut room, 1, player);
    let followers: Vec<FighterId> =
        living(&room, 1).into_iter().filter(|id| Some(*id) != room.garrison[1].leader).collect();
    kill(&mut room, followers[0]);
    run(&mut room, 1);
    assert!(!room.garrison[1].defending, "one of four fallen, it fights on as it was");
    kill(&mut room, followers[1]);
    run(&mut room, 1);
    assert!(room.garrison[1].defending, "two of four fallen, it defends");
    let post = &room.garrison[1];
    for id in living(&room, 1) {
        let at = post.standing.iter().position(|stood| *stood == id).unwrap();
        let brain = &room.foes[&id].brain;
        assert_eq!(brain.home().unwrap().at, post.members[at].2, "its place back at its post");
        assert!(brain.orders().defend);
    }
    super::garrison_tests::clear(&mut room, 1);
    stand_player(&mut room, player, [-190.0, -190.0]);
    run(&mut room, STAND_AGAIN + 2);
    assert!(!room.garrison[1].defending, "stood again, it is whole");
    assert!(living(&room, 1).iter().all(|id| !room.foes[id].brain.orders().defend));
}

#[test]
fn a_grey_tithe_leader_waits_behind_its_lower_ranks_shield_bearer_and_goes_in_once_none_stands_unbroken() {
    // Patrol "ford": its second group, a Collector Major leading a Runner Major and a Collector Minor.
    let mut room = node(NodeKind::Patrol, "ford");
    let player = room.join().unwrap();
    provoke(&mut room, 1, player);
    let leader = room.garrison[1].leader.unwrap();
    let minor = living(&room, 1).into_iter().find(|id| room.foes[id].brain.rank == Rank::Minor).unwrap();
    let orders = room.foes[&leader].brain.orders();
    assert!(orders.screened && !orders.push, "screened while its Minor fights");
    assert_eq!(orders.behind, Some(minor), "standing behind its shield");
    // The Runner, a Major as its leader is, screens nothing: with the Minor fallen, the leader goes in.
    kill(&mut room, minor);
    run(&mut room, 1);
    let orders = room.foes[&leader].brain.orders();
    assert!(!orders.screened && orders.push, "its screen gone, it goes in");
    assert_eq!(orders.behind, None);
}

#[test]
fn a_dungeon_falls_back_halfway_to_its_last_stand_then_gathers_there_led_by_its_highest_rank() {
    let mut room = node(NodeKind::Dungeon, "glade");
    let player = room.join().unwrap();
    stand_player(&mut room, player, [-190.0, -190.0]);
    let encounter = room.encounter.as_ref().unwrap();
    let last = encounter.last_stand;
    assert_eq!(last, room.garrison[0].at, "its last stand at its Miniboss's post, the farthest from the spawns");
    for post in &room.garrison {
        let to_last = |at: [f64; 3]| apart([at[0], at[1]], [last[0], last[1]]);
        assert!(
            post.fallback == post.at || to_last(post.fallback) < to_last(post.at),
            "a fallback nearer the last stand"
        );
    }
    let stood: usize = room.garrison.iter().map(|post| post.standing.len()).sum();
    // Fallen from the back of its last group until three quarters stand, then half.
    let order: Vec<FighterId> = room.garrison.iter().rev().flat_map(|post| post.standing.clone()).collect();
    let mut fallen = 0;
    while (stood - fallen) * 4 > stood * 3 {
        kill(&mut room, order[fallen]);
        fallen += 1;
    }
    run(&mut room, 1);
    assert_eq!(room.encounter.as_ref().unwrap().stage, Stage::Fallback);
    for post in 0..room.garrison.len() {
        let fallback = room.garrison[post].fallback;
        assert_eq!(room.garrison[post].anchor, Some(fallback));
        for id in living(&room, post) {
            let home = room.foes[&id].brain.home().unwrap().at;
            assert!(
                apart([home[0], home[1]], [fallback[0], fallback[1]]) <= SPREAD + 0.5,
                "its place round its fallback"
            );
        }
    }
    while (stood - fallen) * 2 > stood {
        kill(&mut room, order[fallen]);
        fallen += 1;
    }
    run(&mut room, 1);
    let encounter = room.encounter.as_ref().unwrap();
    assert_eq!(encounter.stage, Stage::LastStand);
    let leader = encounter.leader.unwrap();
    assert_eq!(room.foes[&leader].brain.rank, Rank::Miniboss, "the last stand led by its Miniboss");
    for post in 0..room.garrison.len() {
        for id in living(&room, post) {
            let home = room.foes[&id].brain.home().unwrap().at;
            assert!(apart([home[0], home[1]], [last[0], last[1]]) <= 2.0 * SPREAD + 0.5, "gathered at the last stand");
            assert!(room.foes[&id].brain.orders().defend, "defending it");
        }
    }
    // The Miniboss falling, every foe at the last stand breaks.
    wake_all(&mut room, player);
    run(&mut room, 1);
    kill(&mut room, leader);
    run(&mut room, 1);
    let standing: Vec<FighterId> = (0..room.garrison.len()).flat_map(|post| living(&room, post)).collect();
    assert!(!standing.is_empty());
    assert!(standing.iter().all(|id| mood(&room, *id) != Mood::Steady), "all of them break");
}

#[test]
fn a_mission_calls_a_wave_as_it_falls_back_and_another_for_its_last_stand_and_a_fallen_wave_is_gone() {
    let mut room = node(NodeKind::Mission, "keep");
    let player = room.join().unwrap();
    stand_player(&mut room, player, [-30.0, 110.0]);
    let last = room.encounter.as_ref().unwrap().last_stand;
    let stood: usize = room.garrison.iter().map(|post| post.standing.len()).sum();
    let order: Vec<FighterId> = room.garrison.iter().rev().flat_map(|post| post.standing.clone()).collect();
    let waves = |room: &Room| room.garrison.iter().filter(|post| post.arrival).count();
    let mut fallen = 0;
    while (stood - fallen) * 4 > stood * 3 {
        kill(&mut room, order[fallen]);
        fallen += 1;
    }
    // It stands as the garrison steps, and hears its call as it next thinks.
    run(&mut room, 2);
    assert_eq!(waves(&room), 1, "a wave as it falls back");
    let wave = room.garrison.iter().find(|post| post.arrival).unwrap();
    assert!((2..=4).contains(&wave.standing.len()));
    let body = room.players[&player].fighter.body;
    for id in &wave.standing {
        let foe = &room.foes[id];
        let feet = [foe.fighter.body.x, foe.fighter.body.y];
        assert!(apart(feet, [body.x, body.y]) >= super::SPAWN_CLEAR - 0.5, "standing well off the player");
        assert_ne!(foe.brain.alertness(), ::foes::Alertness::Idle, "and coming for them");
        let home = foe.brain.home().unwrap().at;
        assert!(apart([home[0], home[1]], [last[0], last[1]]) <= 2.0 * SPREAD + 0.5, "its place at the last stand");
    }
    while (stood - fallen) * 2 > stood {
        kill(&mut room, order[fallen]);
        fallen += 1;
    }
    run(&mut room, 1);
    assert_eq!(waves(&room), 2, "and another for its last stand");
    let first: Vec<FighterId> = room.garrison.iter().find(|post| post.arrival).unwrap().standing.clone();
    for id in first {
        kill(&mut room, id);
    }
    run(&mut room, 1);
    assert_eq!(waves(&room), 1, "a fallen wave is gone, never to stand again");
}

#[test]
fn falling_back_a_fighting_group_runs_to_its_new_places_and_fights_on() {
    // Dungeon "glade": its second group fights; enough of the others fall for the dungeon to fall back.
    let mut room = node(NodeKind::Dungeon, "glade");
    let player = room.join().unwrap();
    provoke(&mut room, 1, player);
    let stood: usize = room.garrison.iter().map(|post| post.standing.len()).sum();
    let others: Vec<FighterId> = room.garrison.iter().skip(2).flat_map(|post| post.standing.clone()).collect();
    let mut fallen = 0;
    while (stood - fallen) * 4 > stood * 3 {
        kill(&mut room, others[fallen]);
        fallen += 1;
    }
    let fighting = living(&room, 1);
    let mut reached = vec![false; fighting.len()];
    for _ in 0..900 {
        whole(&mut room, player);
        run(&mut room, 1);
        for (at, id) in fighting.iter().enumerate() {
            let Some(foe) = room.foes.get(id).filter(|foe| !foe.fighter.dead()) else { continue };
            let home = foe.brain.home().unwrap().at;
            let feet = [foe.fighter.body.x, foe.fighter.body.y];
            reached[at] |= apart(feet, [home[0], home[1]]) <= 2.0;
        }
    }
    assert!(reached.iter().all(|reached| *reached), "each ran to its new place: {reached:?}");
    let still = fighting.iter().filter(|id| room.foes[id].brain.fights() == Some(player)).count();
    assert!(still > 0, "and fights on from there");
}

#[test]
fn a_mission_falling_straight_to_its_last_stand_calls_both_its_waves() {
    let mut room = node(NodeKind::Mission, "keep");
    let player = room.join().unwrap();
    stand_player(&mut room, player, [-30.0, 110.0]);
    let stood: usize = room.garrison.iter().map(|post| post.standing.len()).sum();
    let order: Vec<FighterId> = room.garrison.iter().rev().flat_map(|post| post.standing.clone()).collect();
    let mut fallen = 0;
    while (stood - fallen) * 2 > stood {
        kill(&mut room, order[fallen]);
        fallen += 1;
    }
    run(&mut room, 1);
    assert_eq!(room.encounter.as_ref().unwrap().stage, Stage::LastStand);
    assert_eq!(room.garrison.iter().filter(|post| post.arrival).count(), 2, "both its waves");
}
