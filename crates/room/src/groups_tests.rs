//! A garrison's groups as Bungie leads them: each led by its highest rank, broken by its fall, one of them raging;
//! defending its ground once half of it has fallen; a Grey Tithe leader screened by its followers until they are gone;
//! and a mission's or a dungeon's garrison giving ground as one encounter, falling back halfway to its last stand, then
//! gathering there, a mission's reserve coming in waves.

use super::garrison_tests::{node, run, section, sloped, stand_player};
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
    // On the room's navmesh, at the middle of its square, a moment settled.
    stand_player(&mut room, player, [0.0, 160.0]);
    run(&mut room, 200);
    let stood: usize = room.garrison.iter().map(|post| post.standing.len()).sum();
    let order: Vec<FighterId> = room.garrison.iter().rev().flat_map(|post| post.standing.clone()).collect();
    let waves = |room: &Room| room.garrison.iter().filter(|post| post.arrival).count();
    let mut fallen = 0;
    while (stood - fallen) * 4 > stood * 3 {
        kill(&mut room, order[fallen]);
        fallen += 1;
    }
    run(&mut room, 1);
    assert_eq!(waves(&room), 1, "a wave as it falls back");
    let wave = room.garrison.iter().find(|post| post.arrival).unwrap();
    assert!((2..=4).contains(&wave.standing.len()));
    let body = room.players[&player].fighter.body;
    assert!(apart([wave.at[0], wave.at[1]], [body.x, body.y]) >= super::SPAWN_CLEAR, "standing well off the player");
    for id in &wave.standing {
        let foe = &room.foes[id];
        assert_eq!(foe.brain.fights(), Some(player), "and hunting them");
        let home = foe.brain.home().unwrap().at;
        assert!(apart([home[0], home[1]], [wave.at[0], wave.at[1]]) <= SPREAD + 0.5, "holding where it came");
    }
    // It comes by airship (`arrivals.rs`), and once landed comes for the player and fights.
    let first: Vec<FighterId> = wave.standing.clone();
    assert!(first.iter().all(|id| room.arriving(*id)), "brought by airship");
    while first.iter().any(|id| room.arriving(*id)) {
        whole(&mut room, player);
        run(&mut room, 1);
    }
    let mut reached = false;
    for _ in 0..600 {
        whole(&mut room, player);
        run(&mut room, 1);
        let body = room.players[&player].fighter.body;
        reached |= first.iter().any(|id| {
            let foe = &room.foes[id].fighter.body;
            apart([foe.x, foe.y], [body.x, body.y]) <= 6.0
        });
    }
    assert!(reached, "a wave reaches the player it hunts");
    while (stood - fallen) * 2 > stood {
        kill(&mut room, order[fallen]);
        fallen += 1;
    }
    run(&mut room, 1);
    assert_eq!(waves(&room), 2, "and another for its last stand");
    let second = room.garrison.iter().filter(|post| post.arrival).nth(1).unwrap();
    let apart_waves = apart(
        [second.at[0], second.at[1]],
        [
            room.garrison.iter().find(|post| post.arrival).unwrap().at[0],
            room.garrison.iter().find(|post| post.arrival).unwrap().at[1],
        ],
    );
    assert!(apart_waves >= super::POSTS_APART, "the second well apart from the first");
    for id in first {
        kill(&mut room, id);
    }
    run(&mut room, 1);
    assert_eq!(waves(&room), 1, "a fallen wave is gone, never to stand again");
}

#[test]
fn every_foe_gathered_at_the_last_stand_has_a_place_of_its_own() {
    for (kind, id) in [(NodeKind::Dungeon, "glade"), (NodeKind::Mission, "keep"), (NodeKind::Mission, "ford")] {
        let mut room = node(kind, id);
        let player = room.join().unwrap();
        stand_player(&mut room, player, [-190.0, -190.0]);
        let stood: usize = room.garrison.iter().map(|post| post.standing.len()).sum();
        let order: Vec<FighterId> = room.garrison.iter().rev().flat_map(|post| post.standing.clone()).collect();
        let mut fallen = 0;
        while (stood - fallen) * 2 > stood {
            kill(&mut room, order[fallen]);
            fallen += 1;
        }
        run(&mut room, 1);
        let homes: Vec<[f64; 3]> = (0..room.garrison.len())
            .flat_map(|post| living(&room, post))
            .map(|id| room.foes[&id].brain.home().unwrap().at)
            .collect();
        for (at, one) in homes.iter().enumerate() {
            for two in &homes[at + 1..] {
                assert!(apart([one[0], one[1]], [two[0], two[1]]) >= 1.0, "{kind:?} {id}: two places on one spot");
            }
        }
    }
}

#[test]
fn a_last_stand_stood_again_takes_a_new_leader_and_a_garrison_sent_away_calls_no_wave() {
    let mut room = node(NodeKind::Dungeon, "glade");
    let player = room.join().unwrap();
    stand_player(&mut room, player, [-190.0, -190.0]);
    for post in 0..room.garrison.len() {
        super::garrison_tests::clear(&mut room, post);
    }
    run(&mut room, 1);
    assert_eq!(room.encounter.as_ref().unwrap().leader, None, "no one stands to lead it");
    // One group standing again, the garrison still under half: its last stand takes that group's leader.
    room.stand_post(2);
    run(&mut room, 1);
    assert_eq!(room.encounter.as_ref().unwrap().stage, Stage::LastStand);
    let leader = room.encounter.as_ref().unwrap().leader;
    assert_eq!(leader, room.garrison[2].leader, "stood again, its last stand has a leader");
    let mut mission = node(NodeKind::Mission, "keep");
    let player = mission.join().unwrap();
    stand_player(&mut mission, player, [-30.0, 110.0]);
    mission.send_foes_away();
    run(&mut mission, 2);
    assert!(mission.garrison.iter().all(|post| !post.arrival), "sent away, not beaten: no wave");
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
fn a_foe_whose_group_gives_ground_to_a_place_off_its_ground_keeps_its_own_and_fights_on() {
    // Dungeon "glade": its second group fights, its fallback laid far off the navmesh, where no route reaches.
    let mut room = node(NodeKind::Dungeon, "glade");
    let player = room.join().unwrap();
    let at = room.garrison[1].at;
    room.garrison[1].fallback = [at[0] + 500.0, at[1] + 500.0, at[2]];
    provoke(&mut room, 1, player);
    let homes: Vec<(FighterId, [f64; 3])> =
        living(&room, 1).iter().map(|id| (*id, room.foes[id].brain.home().unwrap().at)).collect();
    let stood: usize = room.garrison.iter().map(|post| post.standing.len()).sum();
    let others: Vec<FighterId> = room.garrison.iter().skip(2).flat_map(|post| post.standing.clone()).collect();
    let mut fallen = 0;
    while (stood - fallen) * 4 > stood * 3 {
        kill(&mut room, others[fallen]);
        fallen += 1;
    }
    for _ in 0..120 {
        whole(&mut room, player);
        run(&mut room, 1);
    }
    assert_eq!(room.encounter.as_ref().unwrap().stage, Stage::Fallback);
    for (id, home) in homes {
        let brain = &room.foes[&id].brain;
        assert_eq!(brain.home().unwrap().at, home, "its own place kept");
        assert_eq!(brain.fights(), Some(player), "and it fights on");
    }
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

#[test]
fn a_mission_holding_its_territory_again_calls_waves_again_once_the_last_wave_has_fallen() {
    let mut room = node(NodeKind::Mission, "keep");
    let player = room.join().unwrap();
    stand_player(&mut room, player, [0.0, 160.0]);
    run(&mut room, 200);
    // Whole groups fall, from the last, until the garrison falls back; the groups cleared.
    let fall_back = |room: &mut Room| {
        let own: Vec<usize> = (0..room.garrison.len()).filter(|post| !room.garrison[*post].arrival).collect();
        let stood: usize = own.iter().map(|post| room.garrison[*post].standing.len()).sum();
        let (mut fallen, mut cleared) = (0, Vec::new());
        for &post in own.iter().rev() {
            if (stood - fallen) * 4 <= stood * 3 {
                break;
            }
            fallen += room.garrison[post].standing.len();
            super::garrison_tests::clear(room, post);
            cleared.push(post);
        }
        run(room, 1);
        cleared
    };
    let waves = |room: &Room| room.garrison.iter().filter(|post| post.arrival).count();
    let cleared = fall_back(&mut room);
    assert_eq!(waves(&room), 1);
    // Its cleared groups stand again while the wave still stands: it holds its territory, and calls no wave yet.
    for post in cleared {
        room.stand_post(post);
    }
    run(&mut room, 1);
    assert_eq!(room.encounter.as_ref().unwrap().stage, Stage::Territory);
    // The wave falls; the garrison gives ground again, and a new wave comes.
    let wave: Vec<FighterId> =
        room.garrison.iter().filter(|post| post.arrival).flat_map(|post| post.standing.clone()).collect();
    for id in wave {
        kill(&mut room, id);
    }
    run(&mut room, 1);
    assert_eq!(waves(&room), 0);
    fall_back(&mut room);
    assert_eq!(waves(&room), 1, "a new wave for the new fall back");
}

#[test]
fn a_boss_fights_from_the_start_its_escort_screening_nothing() {
    let mut room = node(NodeKind::Boss, "ford");
    let player = room.join().unwrap();
    provoke(&mut room, 0, player);
    let boss = room.garrison[0].leader.unwrap();
    assert_eq!(room.foes[&boss].brain.rank, Rank::Boss);
    let orders = room.foes[&boss].brain.orders();
    assert!(!orders.screened && !orders.push, "never held back behind its escort");
}

#[test]
fn a_wave_hunts_the_nearest_player_standing_and_none_comes_with_no_one_to_hunt() {
    let mut room = node(NodeKind::Mission, "keep");
    let (fallen, standing) = (room.join().unwrap(), room.join().unwrap());
    stand_player(&mut room, fallen, [0.0, 160.0]);
    stand_player(&mut room, standing, [12.0, 160.0]);
    run(&mut room, 200);
    room.players.get_mut(&fallen).unwrap().fighter.health = 0.0;
    room.players.get_mut(&fallen).unwrap().fighter.action = Action::Dead { elapsed: 0 };
    let stood: usize = room.garrison.iter().map(|post| post.standing.len()).sum();
    let order: Vec<FighterId> = room.garrison.iter().rev().flat_map(|post| post.standing.clone()).collect();
    let mut fallen_foes = 0;
    while (stood - fallen_foes) * 4 > stood * 3 {
        kill(&mut room, order[fallen_foes]);
        fallen_foes += 1;
    }
    run(&mut room, 1);
    let wave = room.garrison.iter().find(|post| post.arrival).expect("a wave");
    assert!(wave.standing.iter().all(|id| room.foes[id].brain.fights() == Some(standing)), "the player standing");
    // With no one in the room, no wave.
    let mut empty = node(NodeKind::Mission, "keep");
    let order: Vec<FighterId> = empty.garrison.iter().rev().flat_map(|post| post.standing.clone()).collect();
    for id in order.iter().take(stood / 2 + 1) {
        kill(&mut empty, *id);
    }
    run(&mut empty, 1);
    assert!(empty.garrison.iter().all(|post| !post.arrival), "no one to hunt, no wave");
}

#[test]
fn no_two_foes_of_a_garrison_giving_ground_share_a_place_nor_move_as_others_fall() {
    for at in 0..40 {
        for kind in [NodeKind::Mission, NodeKind::Dungeon] {
            let id = format!("node{at}");
            let mut room = node(kind, &id);
            let player = room.join().unwrap();
            stand_player(&mut room, player, [0.0, 160.0]);
            let stood: usize = room.garrison.iter().map(|post| post.standing.len()).sum();
            let order: Vec<FighterId> = room.garrison.iter().rev().flat_map(|post| post.standing.clone()).collect();
            let homes = |room: &Room| -> Vec<(FighterId, [f64; 3])> {
                room.foes
                    .iter()
                    .filter(|(_, foe)| !foe.fighter.dead())
                    .map(|(id, foe)| (*id, foe.brain.home().unwrap().at))
                    .collect()
            };
            let mut fallen = 0;
            for share in [3, 2] {
                while (stood - fallen) * 4 > stood * share {
                    kill(&mut room, order[fallen]);
                    fallen += 1;
                }
                run(&mut room, 1);
                let placed = homes(&room);
                for (nth, (one, first)) in placed.iter().enumerate() {
                    for (two, second) in &placed[nth + 1..] {
                        let apart = apart([first[0], first[1]], [second[0], second[1]]);
                        assert!(apart >= 0.99, "{kind:?} {id}: foes {one} and {two} {apart:.2} m apart");
                    }
                }
            }
            // One more falls at the last stand: every other keeps its place.
            let before = homes(&room);
            let Some(&victim) = order.get(fallen) else { continue };
            kill(&mut room, victim);
            run(&mut room, 1);
            for (one, place) in before.iter().filter(|(one, _)| *one != victim) {
                assert_eq!(room.foes[one].brain.home().unwrap().at, *place, "{kind:?} {id}: a place moved as one fell");
            }
        }
    }
}

#[test]
fn a_wave_comes_on_whatever_it_loses_and_a_shooter_leader_stands_behind_no_screen() {
    let mut room = node(NodeKind::Mission, "keep");
    let player = room.join().unwrap();
    stand_player(&mut room, player, [0.0, 160.0]);
    run(&mut room, 200);
    let stood: usize = room.garrison.iter().map(|post| post.standing.len()).sum();
    let order: Vec<FighterId> = room.garrison.iter().rev().flat_map(|post| post.standing.clone()).collect();
    let mut fallen = 0;
    while (stood - fallen) * 4 > stood * 3 {
        kill(&mut room, order[fallen]);
        fallen += 1;
    }
    run(&mut room, 1);
    let wave = room.garrison.iter().position(|post| post.arrival).unwrap();
    let foes = room.garrison[wave].standing.clone();
    for id in foes.iter().take(foes.len().div_ceil(2)) {
        kill(&mut room, *id);
    }
    run(&mut room, 1);
    assert!(!room.garrison[wave].defending, "half of it fallen, a wave still comes on");
    assert!(living(&room, wave).iter().all(|id| !room.foes[id].brain.orders().defend));
    // Dungeon "pass": its third group, a Marksman Elite leading a Runner and two Crossbowmen Major.
    let mut dungeon = node(NodeKind::Dungeon, "pass");
    let player = dungeon.join().unwrap();
    provoke(&mut dungeon, 2, player);
    let leader = dungeon.garrison[2].leader.unwrap();
    assert_eq!(dungeon.foes[&leader].brain.role(), Role::Archer);
    assert!(!dungeon.foes[&leader].brain.orders().screened, "a shooter leads from where it shoots");
}

#[test]
fn a_last_stand_walled_into_a_corridor_still_gives_every_foe_a_place_of_its_own() {
    for id in NODES {
        let open = node(NodeKind::Dungeon, id);
        let stand = open.encounter.as_ref().unwrap().last_stand;
        // Two walls 2.5 m apart along the last stand's east-west line, so the rings round it fall on a narrow floor.
        let wall = |south: f64, north: f64| movement::Block {
            min_x: stand[0] - 30.0,
            min_y: south,
            max_x: stand[0] + 30.0,
            max_y: north,
            top: stand[2] + 40.0,
            bottom: stand[2] - 60.0,
        };
        let blocks = vec![wall(stand[1] - 9.0, stand[1] - 1.25), wall(stand[1] + 1.25, stand[1] + 9.0)];
        let mut room = Room::garrisoned(sloped(), blocks, section(), NodeKind::Dungeon, (id, None));
        let player = room.join().unwrap();
        stand_player(&mut room, player, [0.0, 160.0]);
        let stood: usize = room.garrison.iter().map(|post| post.standing.len()).sum();
        let order: Vec<FighterId> = room.garrison.iter().rev().flat_map(|post| post.standing.clone()).collect();
        let mut fallen = 0;
        while (stood - fallen) * 2 > stood {
            kill(&mut room, order[fallen]);
            fallen += 1;
        }
        run(&mut room, 1);
        let placed: Vec<[f64; 3]> =
            room.foes.values().filter(|foe| !foe.fighter.dead()).map(|foe| foe.brain.home().unwrap().at).collect();
        for (nth, first) in placed.iter().enumerate() {
            for second in &placed[nth + 1..] {
                let apart = apart([first[0], first[1]], [second[0], second[1]]);
                assert!(apart >= 0.99, "{id}: two of {} places {apart:.2} m apart", placed.len());
            }
        }
    }
}

#[test]
fn a_half_fallen_patrol_group_is_made_whole_once_no_player_has_come_within_40_m_of_its_post_for_two_minutes() {
    // Patrol "glade": its first group, four foes walking a beat.
    let mut room = node(NodeKind::Patrol, "glade");
    let player = room.join().unwrap();
    provoke(&mut room, 0, player);
    let followers: Vec<FighterId> =
        living(&room, 0).into_iter().filter(|id| Some(*id) != room.garrison[0].leader).collect();
    kill(&mut room, followers[0]);
    kill(&mut room, followers[1]);
    run(&mut room, 1);
    assert!(room.garrison[0].defending, "two of four fallen, it defends");
    stand_player(&mut room, player, [-190.0, -190.0]);
    run(&mut room, STAND_AGAIN - 60);
    let at = room.garrison[0].at;
    stand_player(&mut room, player, [at[0] + CLEAR_AROUND - 1.0, at[1]]);
    run(&mut room, 1);
    stand_player(&mut room, player, [-190.0, -190.0]);
    run(&mut room, STAND_AGAIN - 1);
    assert_eq!(living(&room, 0).len(), 2, "a player within 40 m begins its wait again");
    run(&mut room, 3);
    let post = &room.garrison[0];
    assert!(!post.defending && post.anchor.is_none(), "whole again, it defends no more");
    assert_eq!(living(&room, 0).len(), 4, "its fallen stand at their places again");
    let brought: Vec<FighterId> =
        living(&room, 0).into_iter().filter(|id| !followers[2..].contains(id) && Some(*id) != post.leader).collect();
    assert_eq!(brought.len(), 2, "two come back");
    assert!(brought.iter().all(|id| room.arriving(*id)), "its fallen come back by airship");
    for id in living(&room, 0) {
        assert!(!room.foes[&id].brain.orders().defend);
    }
    let homes: Vec<[f64; 3]> = living(&room, 0).iter().map(|id| room.foes[id].brain.home().unwrap().at).collect();
    assert!(room.garrison[0].beat.is_some(), "it walks a beat");
    run(&mut room, 900);
    let moved = living(&room, 0).iter().zip(&homes).any(|(id, was)| {
        let now = room.foes[id].brain.home().unwrap().at;
        apart([now[0], now[1]], [was[0], was[1]]) > 1.0
    });
    assert!(moved, "and walks its beat again");
}

#[test]
fn followers_still_arriving_do_not_break_as_their_leader_falls() {
    let mut room = node(NodeKind::Patrol, "glade");
    let player = room.join().unwrap();
    provoke(&mut room, 0, player);
    let leader = room.garrison[0].leader.unwrap();
    let followers: Vec<FighterId> = living(&room, 0).into_iter().filter(|id| *id != leader).collect();
    room.by_airship(&followers);
    kill(&mut room, leader);
    run(&mut room, 1);
    assert!(followers.iter().all(|id| mood(&room, *id) == Mood::Steady), "not yet in the fight, none breaks");
}
