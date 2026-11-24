//! A garrison group walks its beat: every group but a Boss's or a Miniboss's has one, drawn from its node's seed, over
//! the navmesh and clear of the spawns; it walks it round and round at a stroll, its foes round its leader, pausing at
//! each point; and a fight halts it where it began, its foes leashing back to their places there before it walks on.

use super::beat::{APART, LEG, PACE, PAUSE, POINTS};
use super::garrison_tests::{node, run, section, stand_player};
use super::leash_tests::{alert, feet, place_of, point_at, whole};
use super::*;
use crate::Input;
use ::foes::tuning::LEASH;
use movement::{TICK_SECONDS, TUNING};

const KINDS: [NodeKind; 4] = [NodeKind::Patrol, NodeKind::Mission, NodeKind::Dungeon, NodeKind::Boss];

fn flat(point: [f64; 3]) -> [f64; 2] {
    [point[0], point[1]]
}

fn beats(room: &Room) -> Vec<Vec<[f64; 3]>> {
    room.garrison.iter().filter_map(|post| post.beat.as_ref().map(beat::Beat::points)).collect()
}

#[test]
fn every_group_but_a_boss_s_or_a_miniboss_s_walks_a_beat_over_the_navmesh_drawn_from_its_node_s_seed() {
    for kind in KINDS {
        let room = node(kind, "glade");
        for post in &room.garrison {
            let holds = post.members[0].1 >= Miniboss;
            assert_eq!(post.beat.is_none(), holds, "{kind:?}: only a Boss's or a Miniboss's group holds its post");
            let Some(beat) = &post.beat else { continue };
            let points = beat.points();
            assert!((2..=POINTS).contains(&points.len()) && points[0] == post.at, "{kind:?}: from its post");
            for (index, point) in points.iter().enumerate() {
                let next = points[(index + 1) % points.len()];
                assert!(room.nav.find_path(*point, next).is_some(), "{kind:?}: the navmesh walks it on");
                let mesh = room.nav.nearest_point(*point).unwrap();
                assert!(apart(flat(mesh), flat(*point)) < 1e-6, "{kind:?}: on the navmesh");
                if index + 1 < points.len() {
                    let leg = apart(flat(*point), flat(next));
                    assert!((LEG.0..=LEG.1).contains(&leg), "{kind:?}: a leg of {leg} m");
                }
                let mut others = points.iter().filter(|other| *other != point);
                assert!(others.all(|other| apart(flat(*other), flat(*point)) >= APART), "{kind:?}: a round");
            }
        }
    }
    let walked = beats(&node(NodeKind::Patrol, "glade"));
    assert!(walked.iter().any(|points| points.len() == POINTS), "{walked:?}");
    assert_eq!(walked, beats(&node(NodeKind::Patrol, "glade")), "the same node walks the same beats");
    assert_ne!(walked, beats(&node(NodeKind::Patrol, "meadow")), "and another node its own");
}

#[test]
fn a_group_walks_its_beat_round_at_a_stroll_round_its_leader_pausing_at_each_point_and_clear_of_every_spawn() {
    let mut room = node(NodeKind::Patrol, "glade");
    let points = room.garrison[0].beat.as_ref().unwrap().points();
    let (leader, followers) = (room.garrison[0].standing[0], room.garrison[0].standing[1..].to_vec());
    // The points the leader came to, in turn, and how long it was at each.
    let mut visits: Vec<(usize, u64)> = Vec::new();
    let (mut walked, mut walking, mut farthest) = (0.0, 0_u32, 0.0_f64);
    for _ in 0..360 * 60 {
        let before = feet(&room, leader);
        run(&mut room, 1);
        let at = feet(&room, leader);
        let step = apart(before, at);
        if step > 1e-3 {
            (walked, walking) = (walked + step, walking + 1);
        }
        let near = points.iter().position(|point| apart(flat(*point), at) < 0.5);
        match (near, visits.last_mut()) {
            (Some(point), Some((last, ticks))) if *last == point => *ticks += 1,
            (Some(point), _) => visits.push((point, 1)),
            _ => {}
        }
        for id in &followers {
            farthest = farthest.max(apart(feet(&room, *id), at));
        }
        for post in &room.garrison {
            for id in &post.standing {
                let spawns = section().spawns;
                assert!(spawns.iter().all(|spawn| apart(feet(&room, *id), *spawn) >= SPAWN_CLEAR), "clear of spawns");
            }
        }
    }
    let order: Vec<usize> = visits.iter().map(|(point, _)| *point).collect();
    let round: Vec<usize> = (0..points.len()).cycle().take(order.len()).collect();
    assert!(order.len() > 2 * points.len() && order == round, "round and round its points in turn: {order:?}");
    let ended = &visits[..visits.len() - 1];
    assert!(ended.iter().all(|(_, ticks)| *ticks >= PAUSE), "pausing at each: {visits:?}");
    let pace = walked / f64::from(walking) / TICK_SECONDS / TUNING.walk;
    assert!((pace - PACE).abs() < 0.1 * PACE, "at a stroll: {pace} of a walk");
    assert!(farthest <= 2.0 * SPREAD + 1.0, "its foes round its leader: {farthest} m at most from it");
    for kind in [NodeKind::Dungeon, NodeKind::Boss] {
        let mut room = node(kind, "glade");
        let post = room.garrison.iter().position(|post| post.beat.is_none()).unwrap();
        let posted: Vec<(FighterId, [f64; 3])> = room.garrison[post]
            .standing
            .iter()
            .zip(&room.garrison[post].members)
            .map(|(id, member)| (*id, member.2))
            .collect();
        run(&mut room, 60 * 60);
        for (id, place) in posted {
            assert!(
                apart(feet(&room, id), flat(place)) < 0.35,
                "{kind:?}: a Boss's or a Miniboss's group holds its post"
            );
        }
    }
}

/// A patrol's first group, walked on until its leader is `out` metres from its post, still walking.
fn walked_out(out: f64) -> Room {
    let mut room = node(NodeKind::Patrol, "glade");
    let leader = room.garrison[0].standing[0];
    let post = room.garrison[0].at;
    while apart(feet(&room, leader), flat(post)) < out {
        run(&mut room, 1);
        assert!(room.clock() < 120 * 60, "it walks out");
    }
    room
}

#[test]
fn a_fight_halts_a_group_where_it_began_its_foes_leash_back_to_their_places_there_and_it_walks_on() {
    let mut room = walked_out(8.0);
    let standing = room.garrison[0].standing.clone();
    let leader = standing[0];
    let player = room.join().unwrap();
    let facing = room.foes[&leader].fighter.body.facing;
    let [x, y] = feet(&room, leader);
    stand_player(&mut room, player, [x + libm::sin(facing) * 6.0, y - libm::cos(facing) * 6.0]);
    while standing.iter().any(|id| room.foes[id].brain.target() != Some(player)) {
        whole(&mut room, player);
        run(&mut room, 1);
        assert!(room.clock() < 150 * 60, "the group turns on the player in its way");
    }
    let halted: Vec<[f64; 3]> = standing.iter().map(|id| place_of(&room, *id)).collect();
    assert!(apart(flat(halted[0]), flat(room.garrison[0].at)) > 6.0, "halted on its way, not at its post");
    let away = point_at(&room, halted[0], LEASH + 6.0, true);
    let mut sequence = 0;
    while standing.iter().any(|id| !room.foes[id].brain.returning()) {
        sequence += 1;
        assert!(sequence < 1500, "the group gives the player up");
        let body = room.players[&player].fighter.body;
        let at = [body.x, body.y];
        let yaw = bearing(at, away);
        let running = apart(at, away) > 1.0;
        let controls =
            movement::Controls { forward: if running { 1.0 } else { 0.0 }, run: true, yaw, ..Default::default() };
        let intent = combat::Intent { controls, ..combat::Intent::default() };
        room.input(player, Input { sequence, intent, seen: room.clock(), ..Input::default() }).unwrap();
        whole(&mut room, player);
        run(&mut room, 1);
        let places: Vec<[f64; 3]> = standing.iter().map(|id| place_of(&room, *id)).collect();
        assert_eq!(places, halted, "its places hold where the fight began");
    }
    room.leave(player);
    while standing.iter().any(|id| room.foes[id].brain.returning()) {
        run(&mut room, 1);
        assert!(room.clock() < 300 * 60, "they walk back");
    }
    for (id, place) in standing.iter().zip(&halted) {
        assert!(apart(feet(&room, *id), flat(*place)) < 0.35 && alert(&room, *id) == 0, "back in its place there");
    }
    let from = feet(&room, leader);
    run(&mut room, 600);
    assert!(apart(feet(&room, leader), from) > 5.0, "then the group walks its beat on");
}

#[test]
fn a_cleared_group_stands_again_at_its_post_and_walks_its_beat_from_there() {
    let mut room = walked_out(8.0);
    let posted: Vec<[f64; 3]> = room.garrison[0].members.iter().map(|member| member.2).collect();
    for id in room.garrison[0].standing.clone() {
        let found = room.foes.get_mut(&id).unwrap();
        found.fighter.health = 0.0;
        found.fighter.action = combat::fighter::Action::Dead { elapsed: 0 };
    }
    run(&mut room, STAND_AGAIN + 2);
    assert_eq!(room.garrison[0].cleared_at, None, "it stood again");
    let standing = room.garrison[0].standing.clone();
    let places: Vec<[f64; 3]> = standing.iter().map(|id| place_of(&room, *id)).collect();
    assert_eq!(places, posted, "its places those at its post");
    let leader = standing[0];
    run(&mut room, PAUSE + 600);
    assert!(apart(feet(&room, leader), flat(room.garrison[0].at)) > 5.0, "and it walks its beat from there");
}

#[test]
fn a_follower_beside_its_leader_on_a_raised_floor_keeps_a_place_of_its_own_on_it() {
    // A platform 40 m square and 6 m high on open ground: no ground within 4 m of its middle on the ground's level.
    let platform = movement::Block { min_x: -20.0, min_y: -20.0, max_x: 20.0, max_y: 20.0, top: 6.0, bottom: -1.0 };
    let bounds = navmesh::Bounds { min_x: -40.0, min_y: -40.0, max_x: 40.0, max_y: 40.0 };
    let nav = navmesh::NavMesh::bake(&[platform], bounds, &navmesh::AGENT);
    let lead = nav.nearest_point([0.0, 0.0, 6.0]).expect("the platform's top is on the mesh");
    let place = beat::near_on((&nav, &Floor::Flat), lead, (SPREAD, 0.0));
    assert!((place[2] - 6.0).abs() < 0.1, "on the platform's top: {place:?}");
    assert!(apart(flat(place), [SPREAD, 0.0]) < 0.5, "its own place, not its leader's: {place:?}");
    let ground = beat::near_on((&nav, &Floor::Flat), [30.0, 0.0, 0.0], (30.0 + SPREAD, 0.0));
    assert!(ground[2].abs() < 0.1 && apart(flat(ground), [30.0 + SPREAD, 0.0]) < 0.5, "on the ground: {ground:?}");
}
