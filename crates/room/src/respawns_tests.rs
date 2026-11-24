//! A patrol zone's fallen stand again near where they fell: at the point along its ways nearest them with no foe near,
//! facing where they fell; never by the edge or under a block; at the landing where foes stand near every point; and
//! on Saltmere's zones as the bake makes them, within NEAR_M of where they fell, on clear ground.

use super::*;
use crate::{Floor, NodeKind, PlayerId, Room, Section};
use combat::Action;
use combat::tuning::RESPAWN;
use movement::Block;
use std::path::Path;

fn section() -> Section {
    let ring = vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]];
    Section { ring, spawns: vec![[0.0, 180.0]], falls_kill: false }
}

/// A patrol zone's room on open ground with one way across it, west to east, and none of its foes.
fn patrol(blocks: Vec<Block>) -> Room {
    let mut room = Room::garrisoned(Floor::Flat, blocks, section(), NodeKind::Patrol, ("downs", None));
    room.send_foes_away();
    room.set_paths(vec![vec![[-250.0, 0.0], [250.0, 0.0]]]);
    room
}

/// Where a player who fell at (x, y) and asked stands again.
fn stands_again(room: &mut Room, player: PlayerId, [x, y]: [f64; 2]) -> movement::Body {
    let found = room.players.get_mut(&player).expect("in");
    (found.fighter.body.x, found.fighter.body.y) = (x, y);
    (found.fighter.health, found.fighter.action, found.respawn_asked) = (0.0, Action::Dead { elapsed: RESPAWN }, true);
    room.tick();
    assert!(!room.players[&player].fighter.dead(), "stood again");
    room.players[&player].fighter.body
}

#[test]
fn along_a_way_the_points_lie_every_twenty_five_metres_and_at_its_end() {
    assert_eq!(along(&[[0.0, 0.0], [60.0, 0.0]]), [[0.0, 0.0], [25.0, 0.0], [50.0, 0.0], [60.0, 0.0]]);
    assert_eq!(along(&[[0.0, 0.0], [10.0, 0.0], [10.0, 40.0]]), [[0.0, 0.0], [10.0, 15.0], [10.0, 40.0]]);
    assert_eq!(along(&[[5.0, 5.0]]), [[5.0, 5.0]], "a way of one point is that point");
}

#[test]
fn a_patrol_s_fallen_stand_at_the_point_nearest_where_they_fell_facing_there_and_none_by_the_edge() {
    let mut room = patrol(Vec::new());
    let player = room.join().expect("in");
    let body = stands_again(&mut room, player, [104.0, 30.0]);
    assert_eq!([body.x, body.y], [100.0, 0.0], "the nearest point along the way");
    assert!((body.facing - combat::sight::bearing([100.0, 0.0], [104.0, 30.0])).abs() < 1e-9, "facing where they fell");
    let near = &room.respawning.near;
    assert!(near.contains(&[0.0, 180.0]), "the landing among them");
    let edge = reach::distance_to_ring;
    assert!(near.iter().all(|&[x, y]| edge(&section().ring, x, y) >= FROM_EDGE_M), "{near:?}");
    assert!(!near.contains(&[-200.0, 0.0]) && !near.contains(&[200.0, 0.0]), "none on the edge");
}

#[test]
fn no_point_lies_under_a_block_and_one_with_a_foe_near_is_passed_over_for_the_next() {
    let shed = Block { min_x: 95.0, min_y: -5.0, max_x: 105.0, max_y: 5.0, top: 3.0, bottom: 1.0 };
    let mut room = patrol(vec![shed]);
    assert!(!room.respawning.near.contains(&[100.0, 0.0]), "a body stands under nothing");
    let player = room.join().expect("in");
    let body = stands_again(&mut room, player, [100.0, 10.0]);
    assert!([[75.0, 0.0], [125.0, 0.0]].contains(&[body.x, body.y]), "the next along: {body:?}");
    let mut guarded = patrol(Vec::new());
    let player = guarded.join().expect("in");
    crate::arts::arts_tests::stand_foe(&mut guarded, 100.0, 5.0, 1.0e9);
    let body = stands_again(&mut guarded, player, [100.0, 10.0]);
    assert!(combat::sight::apart([body.x, body.y], [100.0, 5.0]) >= FOES_CLEAR_M, "clear of the foe: {body:?}");
    assert!([[125.0, 0.0], [75.0, 0.0]].contains(&[body.x, body.y]), "the nearest clear of it: {body:?}");
    let mut beset = patrol(Vec::new());
    let alone = beset.join().expect("in");
    for at in beset.respawning.near.clone() {
        crate::arts::arts_tests::stand_foe(&mut beset, at[0], at[1], 1.0e9);
    }
    let body = stands_again(&mut beset, alone, [100.0, 10.0]);
    assert_eq!([body.x, body.y], [0.0, 180.0], "a foe by every point: the landing, as ever");
}

#[test]
fn a_room_that_is_no_patrol_zone_lays_none_and_stands_its_fallen_at_the_nearest_spawn() {
    let mut room = Room::node(Floor::Flat, Vec::new(), section());
    room.set_paths(vec![vec![[-150.0, 0.0], [150.0, 0.0]]]);
    assert!(room.respawning.near.is_empty());
    let player = room.join().expect("in");
    let body = stands_again(&mut room, player, [100.0, 10.0]);
    assert_eq!([body.x, body.y], [0.0, 180.0]);
}

/// How near where they fell a player in one of Saltmere's zones stands again at most, metres.
const NEAR_M: f64 = 50.0;

/// Continent 1's nodes as the bake makes them.
fn baked() -> Vec<bake::NodeFile> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let layout = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let found = layout.continents.iter().find(|each| each.id == "continent-1").expect("the continent is drawn");
    let edits = land::edits::parse(&read("content/world/land/continent-1.json")).expect("its edits parse");
    let blocks = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
    let builders = bake::builders(&root).expect("the builders read");
    bake::nodes_of(found, edits, &blocks, &builders).expect("the continent bakes")
}

#[test]
fn on_saltmere_s_zones_the_fallen_stand_within_fifty_metres_of_where_they_fell_on_clear_ground_inside() {
    for node in baked().iter().filter(|node| node.kind == NodeKind::Patrol) {
        let blocks = node.boxes.iter().map(Block::from_floats).collect();
        let section = Section { ring: node.ring.clone(), spawns: node.spawns.clone(), falls_kill: false };
        let floor = Floor::Land(Box::new(node.ground.clone()));
        let mut room = Room::garrisoned(floor, blocks, section.clone(), node.kind, (&node.id, None));
        room.set_paths(node.paths.clone());
        room.send_foes_away();
        assert!(room.respawning.near.len() > 20, "{}: {} points", node.id, room.respawning.near.len());
        let player = room.join().expect("in");
        for place in &node.places {
            let landing = reach::respawn_point(&section, place.at[0], place.at[1]).expect("a spawn");
            let body = stands_again(&mut room, player, place.at);
            let (from_landing, from_here) =
                (combat::sight::apart(landing, place.at), combat::sight::apart([body.x, body.y], place.at));
            // Measured: 43 m at most, where the landing stands 0.4 to 1.5 km off.
            let named = format!("{} at {}: {from_here:.0} m, the landing {from_landing:.0} m", node.id, place.name);
            assert!(from_here <= from_landing && from_here <= NEAR_M, "{named}");
            room.tick();
            assert_eq!(room.players[&player].standing, reach::Standing::Inside, "{}: inside", node.id);
            let feet = room.players[&player].fighter.body;
            assert!(movement::blocks::room_at(&room.blocks, feet.x, feet.y, feet.z, combat::tuning::BODY_HEIGHT));
        }
    }
}
