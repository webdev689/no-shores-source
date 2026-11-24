//! The Drowned Vale's plan: it reads, every space stands a module the manifest holds, each space's way in meets the
//! last one's way out to the millimetre, every piece the rules stand on has its socket, its seals and slabs stand,
//! and a body walks its spaces' floors to their pieces.

use super::*;
use crate::floor::Floor;
use movement::{Blocks, Body, Controls, TICK_SECONDS, standing, step_body};

/// The pieces the rules name, by space and socket, and how many of each numbered kind.
const NAMED: [(&str, &str); 22] = [
    ("descent", "arrival"),
    ("descent", "start"),
    ("descent", "chest-descent"),
    ("mending", "checkpoint"),
    ("mending", "seam-north"),
    ("mending", "seam-west"),
    ("mending", "seam-east"),
    ("mending", "mender"),
    ("choir", "checkpoint"),
    ("choir", "font"),
    ("choir", "plinth"),
    ("choir", "chest-page"),
    ("ways", "checkpoint"),
    ("ways", "heart"),
    ("stair", "start"),
    ("stair", "chest-stair"),
    ("hall", "checkpoint"),
    ("hall", "warden"),
    ("hall", "plinth"),
    ("hall", "seam"),
    ("court", "checkpoint"),
    ("court", "steward"),
];
const NUMBERED: [(&str, &str, usize); 10] = [
    ("mending", "mouth", 4),
    ("choir", "bell", 7),
    ("choir", "lectern", 5),
    ("choir", "mouth", 4),
    ("ways", "watcher", 6),
    ("ways", "mouth", 3),
    ("hall", "mouth", 4),
    ("court", "mouth", 4),
    ("hall-was", "bell", 5),
    ("court-is", "bell", 5),
];

#[test]
fn every_space_stands_a_module_and_each_way_in_meets_the_last_way_out() {
    let plan = drowned_vale();
    assert_eq!(plan.id, "drowned-vale");
    for space in &plan.spaces {
        assert!(module(&space.module).is_some(), "{} stands {}, which the manifest holds", space.key, space.module);
    }
    for pair in ["descent", "mending", "choir", "ways", "stair", "hall", "court"].windows(2) {
        let (out, _) = plan.socket(pair[0], "exit").expect("a way out");
        let (into, _) = plan.socket(pair[1], "entry").expect("a way in");
        for axis in 0..3 {
            assert!((out[axis] - into[axis]).abs() < 1e-3, "{} meets {}: {out:?} and {into:?}", pair[0], pair[1]);
        }
    }
}

/// How far two spaces joined at a door may share the edge of their grounds, metres: each module's box ends a few
/// centimetres past its door.
const TOUCH_M: f64 = 0.1;

#[test]
fn no_two_spaces_share_ground_and_each_spaces_mouths_lie_in_it_alone() {
    let plan = drowned_vale();
    let grounds: Vec<(&str, navmesh::Bounds)> = plan
        .spaces
        .iter()
        .map(|space| (space.key.as_str(), plan.space_bounds(&space.key, 0.0).expect("its ground")))
        .collect();
    for (nth, (one, first)) in grounds.iter().enumerate() {
        for (two, second) in &grounds[nth + 1..] {
            let across = first.max_x.min(second.max_x) - first.min_x.max(second.min_x);
            let along = first.max_y.min(second.max_y) - first.min_y.max(second.min_y);
            assert!(across <= TOUCH_M || along <= TOUCH_M, "{one} and {two} share {across:.2} by {along:.2} m");
        }
    }
    let inside = |ground: &navmesh::Bounds, at: [f64; 3]| {
        at[0] >= ground.min_x && at[0] <= ground.max_x && at[1] >= ground.min_y && at[1] <= ground.max_y
    };
    for (key, own) in &grounds {
        for (mouth, _) in plan.numbered(key, "mouth") {
            assert!(inside(own, mouth), "{key}'s mouth at {mouth:?} lies in its own space");
            for (other, ground) in grounds.iter().filter(|(other, _)| other != key) {
                assert!(!inside(ground, mouth), "{key}'s mouth at {mouth:?} lies in {other}");
            }
        }
    }
}

#[test]
fn every_mouth_stands_on_its_spaces_floor_clear_of_every_part() {
    let plan = drowned_vale();
    let blocks = plan.standing();
    for space in &plan.spaces {
        for (at, _) in plan.numbered(&space.key, "mouth") {
            let under: Vec<&movement::Block> = blocks
                .iter()
                .filter(|block| {
                    block.min_x <= at[0] && at[0] <= block.max_x && block.min_y <= at[1] && at[1] <= block.max_y
                })
                .collect();
            assert!(
                under.iter().any(|block| (block.top - at[2]).abs() < 0.05),
                "{}'s mouth {at:?}: a floor",
                space.key
            );
            assert!(under.iter().all(|block| block.top < at[2] + 0.05), "{}'s mouth {at:?}: in a part", space.key);
        }
    }
}

#[test]
fn every_piece_the_rules_stand_on_has_its_socket() {
    let plan = drowned_vale();
    for (space, socket) in NAMED {
        assert!(plan.socket(space, socket).is_some(), "{space}'s {socket}");
    }
    for (space, prefix, count) in NUMBERED {
        assert_eq!(plan.numbered(space, prefix).len(), count, "{space}'s {prefix}s");
    }
    for encounter in ["mending", "choir", "ways", "shores", "steward"] {
        let space = plan.encounters.get(encounter).expect("its space");
        assert!(plan.space(space).is_some(), "{encounter} is fought in {space}");
    }
    for shores in plan.shores.values() {
        assert_eq!(shores.len(), 2);
        for shore in shores {
            for socket in ["arrival", "rift", "keeper", "plinth"] {
                assert!(plan.socket(shore, socket).is_some(), "{shore}'s {socket}");
            }
        }
    }
}

#[test]
fn the_builds_tables_hold_each_module_as_the_manifest_does() {
    for table in MODULES {
        let found = city::modules::all().iter().find(|each| each.name == table.name).expect("in the manifest");
        assert_eq!(found.size, table.size, "{}", table.name);
        assert_eq!(found.parts, table.parts, "{}", table.name);
        let sockets: Vec<_> =
            found.sockets.iter().map(|socket| (socket.name.as_str(), socket.at, socket.facing)).collect();
        let tables: Vec<_> = table.sockets.iter().map(|socket| (socket.name, socket.at, socket.facing)).collect();
        assert_eq!(sockets, tables, "{}", table.name);
    }
    assert!(module("breach-gate").is_some() && module("breach-seal").is_some() && module("breach-slab").is_some());
}

#[test]
fn its_seals_stand_across_their_doors_and_its_slabs_come_and_go_on_their_measure() {
    let plan = drowned_vale();
    assert_eq!(plan.seals.len(), 3);
    for seal in &plan.seals {
        assert!(!plan.seal_blocks(seal).is_empty(), "the seal at {}'s {}", seal.space, seal.socket);
        assert!(gear::breach::DROWNED_VALE.encounters.iter().any(|encounter| encounter.key == seal.opens));
    }
    assert_eq!(plan.slabs.len(), 6);
    for slab in &plan.slabs {
        assert!(plan.slab_block(slab).is_some());
        let standing = (0..SLAB_CYCLE_TEST).filter(|tick| slab_stands(slab, *tick)).count() as u64;
        assert_eq!(standing, SLAB_STANDS, "each slab stands its share of every cycle");
    }
    let phases: std::collections::BTreeSet<u64> = plan.slabs.iter().map(|slab| slab.phase).collect();
    assert_eq!(phases.len(), plan.slabs.len(), "no two slabs keep one time");
    let patterns: std::collections::BTreeSet<Vec<bool>> =
        (0..SLAB_CYCLE).map(|tick| plan.slabs.iter().map(|slab| slab_stands(slab, tick)).collect()).collect();
    assert!(patterns.len() > 2, "slabs come and go at their own ticks, not all at once");
}

const SLAB_CYCLE_TEST: u64 = SLAB_CYCLE;

/// A body walked over the plan's blocks from `from` through each waypoint, steering at the next each tick.
fn walked(blocks: &Blocks, from: [f64; 3], waypoints: &[[f64; 3]], seconds: f64) -> (Body, usize) {
    let mut body = Body { z: from[2], ..standing(from[0], from[1]) };
    let mut next = 0;
    for _ in 0..(seconds / TICK_SECONDS) as usize {
        let Some(target) = waypoints.get(next) else { break };
        let (east, south) = (target[0] - body.x, target[1] - body.y);
        if (east * east + south * south).sqrt() < 1.0 {
            next += 1;
            continue;
        }
        let controls = Controls { forward: 1.0, yaw: libm::atan2(east, -south), ..Controls::default() };
        body = step_body(&body, &controls, blocks, &Floor::Flat, TICK_SECONDS);
    }
    (body, next)
}

#[test]
fn a_body_walks_each_encounters_floor_from_its_way_in_to_its_pieces() {
    let plan = drowned_vale();
    let blocks: Blocks = plan.standing().into();
    let walks: [(&str, &[&str]); 4] = [
        ("mending", &["checkpoint", "seam-west", "seam-north", "seam-east"]),
        ("choir", &["checkpoint", "font", "lectern-2", "lectern-4"]),
        ("hall", &["checkpoint", "mooring-was", "plinth", "mooring-is"]),
        ("court", &["checkpoint", "mooring-was", "chest", "mooring-is"]),
    ];
    for (space, sockets) in walks {
        let points: Vec<[f64; 3]> =
            sockets.iter().map(|socket| plan.socket(space, socket).expect("its socket").0).collect();
        let (body, passed) = walked(&blocks, points[0], &points[1..], 90.0);
        assert_eq!(passed, points.len() - 1, "in {space} the body stops at {:.1},{:.1},{:.1}", body.x, body.y, body.z);
        assert!((body.z - points[points.len() - 1][2]).abs() < 0.4, "{space}: on its floor, {:.2}", body.z);
    }
}
