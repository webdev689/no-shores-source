//! The Drowned Vale's plan: it reads, every space stands a module the manifest holds, each space's way in meets the
//! last one's way out to the millimetre, every piece the rules stand on has its socket, its seals and slabs stand,
//! a body walks its spaces' floors to their pieces, and on foot over the dark, every seal open and every slab
//! standing, every piece is reached from the Descent's top and the court from each, and in each shore from its
//! arrival and its rift from each.

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

/// The sockets no body or piece stands at: a slab's (it comes and goes), the Steward's order shown over the court,
/// the Seam's, inside its crystal, and a barricade's, on its top.
fn stood_at(name: &str) -> bool {
    !name.starts_with("slab-") && !name.starts_with("glyphs-") && !name.starts_with("bar-") && name != "seam"
}

#[test]
fn every_piece_stands_on_its_spaces_floor_clear_of_every_part() {
    let plan = drowned_vale();
    let blocks = plan.standing();
    for space in &plan.spaces {
        let sockets = module(&space.module).expect("its module").sockets;
        for name in sockets.iter().map(|socket| socket.name).filter(|name| stood_at(name)) {
            let (at, _) = plan.socket(&space.key, name).expect("its socket");
            let under: Vec<&movement::Block> = blocks
                .iter()
                .filter(|block| {
                    block.min_x <= at[0] && at[0] <= block.max_x && block.min_y <= at[1] && at[1] <= block.max_y
                })
                .collect();
            let key = &space.key;
            assert!(under.iter().any(|block| (block.top - at[2]).abs() < 0.05), "{key}'s {name} at {at:?}: a floor");
            let clear = |block: &&&movement::Block| block.top < at[2] + 0.05 || block.bottom > at[2] + 1.8;
            assert!(under.iter().all(|block| clear(&block)), "{key}'s {name} at {at:?}: in a part");
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
    let standing = plan.standing();
    for seal in &plan.seals {
        let blocks = plan.seal_blocks(seal);
        assert!(!blocks.is_empty(), "the seal at {}'s {}", seal.space, seal.socket);
        assert!(gear::breach::DROWNED_VALE.encounters.iter().any(|encounter| encounter.key == seal.opens));
        // Set into its doorway's walls: each end of it inside a wall's thickness, a body's height up.
        let jambs = standing
            .iter()
            .filter(|wall| {
                blocks.iter().any(|block| {
                    block.min_x < wall.max_x
                        && wall.min_x < block.max_x
                        && block.min_y < wall.max_y
                        && wall.min_y < block.max_y
                        && wall.top > block.bottom + 2.0
                })
            })
            .count();
        assert!(jambs >= 2, "the seal at {}'s {} meets {jambs} of its doorway's walls", seal.space, seal.socket);
    }
    // Its crystal drawn no wider than its part, so it hangs over no wall it is set in.
    let seal = module("breach-seal").expect("the seal");
    let wide = seal.parts.iter().map(|part| part[3] - part[0]).fold(0.0, f64::max);
    let deep = seal.parts.iter().map(|part| part[4] - part[1]).fold(0.0, f64::max);
    assert!(seal.size[0] <= wide + 1e-3, "the seal drawn {:.2} m wide over its part's {wide:.2}", seal.size[0]);
    assert!(seal.size[1] <= deep + 1e-3, "the seal drawn {:.2} m deep over its part's {deep:.2}", seal.size[1]);
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
        body = step_body(&body, &controls, blocks, &Floor::Dark, TICK_SECONDS);
    }
    (body, next)
}

/// A step of a walk: a socket, and how far aside of it, metres east and south, round what a body cannot climb.
type Step = (&'static str, [f64; 2]);

#[test]
fn a_body_walks_each_encounters_floor_from_its_way_in_to_its_pieces() {
    let plan = drowned_vale();
    let blocks: Blocks = plan.standing().into();
    let walks: [(&str, &[Step]); 4] = [
        (
            "mending",
            &[
                ("checkpoint", [0.0, 0.0]),
                ("seam-west", [0.0, 0.0]),
                ("mender", [0.0, 0.0]),
                ("mender", [3.0, -4.0]),
                ("seam-north", [0.0, 0.0]),
                ("seam-north", [12.0, 0.0]),
                ("seam-east", [0.0, 0.0]),
            ],
        ),
        (
            "choir",
            &[
                ("checkpoint", [0.0, 0.0]),
                ("font", [0.0, 0.0]),
                ("lectern-2", [-2.0, -2.5]),
                ("lectern-2", [0.0, 0.0]),
                ("lectern-2", [-2.5, 0.0]),
                ("lectern-4", [0.0, 0.0]),
            ],
        ),
        (
            "hall",
            &[
                ("checkpoint", [0.0, 0.0]),
                ("mooring-was", [0.0, 0.0]),
                ("plinth", [0.0, 0.0]),
                ("mooring-is", [0.0, 0.0]),
            ],
        ),
        (
            "court",
            &[
                ("checkpoint", [0.0, 0.0]),
                ("mooring-was", [0.0, 0.0]),
                ("chest", [0.0, 0.0]),
                ("mooring-is", [0.0, 0.0]),
            ],
        ),
    ];
    for (space, steps) in walks {
        let points: Vec<[f64; 3]> = steps
            .iter()
            .map(|(socket, [east, south])| {
                let (at, _) = plan.socket(space, socket).expect("its socket");
                [at[0] + east, at[1] + south, at[2]]
            })
            .collect();
        let (body, passed) = walked(&blocks, points[0], &points[1..], 90.0);
        assert_eq!(passed, points.len() - 1, "in {space} the body stops at {:.1},{:.1},{:.1}", body.x, body.y, body.z);
        assert!((body.z - points[points.len() - 1][2]).abs() < 0.4, "{space}: on its floor, {:.2}", body.z);
    }
}

/// Where a body stood at `from` ends after `seconds` pressing at bearing `yaw`, jumping as it goes if `jump`, and the
/// highest it got.
fn pressed(blocks: &Blocks, from: [f64; 3], yaw: f64, jump: bool, seconds: f64) -> (Body, f64) {
    let mut body = Body { z: from[2], ..standing(from[0], from[1]) };
    let mut highest = body.z;
    for _ in 0..(seconds / TICK_SECONDS) as usize {
        let controls = Controls { forward: 1.0, yaw, jump, ..Controls::default() };
        body = step_body(&body, &controls, blocks, &Floor::Dark, TICK_SECONDS);
        highest = highest.max(body.z);
    }
    (body, highest)
}

/// The bearing a body presses at to go `[east, south]`.
fn bearing_of([east, south]: [f64; 2]) -> f64 {
    libm::atan2(east, -south)
}

/// The Ways' barricades by their sockets on their tops: where each stands on the street, and the way the street runs.
fn bars(plan: &Plan) -> Vec<([f64; 3], [f64; 2])> {
    let bars = plan.numbered("ways", "bar");
    assert_eq!(bars.len(), 8, "the Ways' barricades");
    bars.into_iter().map(|(at, along)| ([at[0], at[1], at[2] - 2.4], along)).collect()
}

#[test]
fn a_body_pressing_or_jumping_into_the_ways_barricades_and_walls_never_gets_up_them() {
    let plan = drowned_vale();
    let blocks: Blocks = plan.standing().into();
    let (stage, _) = plan.socket("ways", "checkpoint").expect("its stage");
    // Into each barricade along its street from 3 m short of it on either side; north from the stage into the west
    // wall.
    let mut pressings: Vec<([f64; 3], f64, String)> = bars(plan)
        .into_iter()
        .enumerate()
        .flat_map(|(nth, (at, along))| {
            [1.0, -1.0].map(|sign| {
                let way = [along[0] * sign, along[1] * sign];
                ([at[0] - way[0] * 3.0, at[1] - way[1] * 3.0, at[2]], bearing_of(way), format!("bar-{}", nth + 1))
            })
        })
        .collect();
    pressings.push((stage, 0.0, "the west wall".into()));
    for (from, yaw, what) in pressings {
        for jump in [false, true] {
            let (_, highest) = pressed(&blocks, from, yaw, jump, 8.0);
            assert!(highest < from[2] + 2.0, "{what}, jumping {jump}: up to {:.2} m", highest - from[2]);
        }
    }
}

#[test]
fn each_of_the_ways_barricades_cuts_its_street_between_two_crossings() {
    let plan = drowned_vale();
    let standing = plan.standing();
    let blocks: Blocks = standing.clone().into();
    for (nth, (at, along)) in bars(plan).into_iter().enumerate() {
        // Toward its street's crossings 6 m either way, or the lane inside the town's wall, stopped short of a
        // Watcher's post standing in one.
        let crossing = |sign: f64| [at[0] + along[0] * sign * 4.5, at[1] + along[1] * sign * 4.5, at[2]];
        for (from, to) in [(crossing(-1.0), crossing(1.0)), (crossing(1.0), crossing(-1.0))] {
            assert!(!walks_to(&blocks, from, to, 0.8), "bar-{} lets a body down its street from {from:?}", nth + 1);
        }
        // A house stands past each of its ends, so no body goes round it.
        for sign in [-1.0, 1.0] {
            let end = [at[0] - along[1] * sign * 2.4, at[1] + along[0] * sign * 2.4];
            let housed = standing.iter().any(|block| {
                block.min_x <= end[0]
                    && end[0] <= block.max_x
                    && block.min_y <= end[1]
                    && end[1] <= block.max_y
                    && block.top >= at[2] + 2.0
            });
            assert!(housed, "past bar-{}'s end at {end:?} the street opens", nth + 1);
        }
    }
}

/// A point of a space's module as Blender builds it (x east, y north, z up), in the run's frame.
fn in_space(plan: &Plan, key: &str, [east, north, up]: [f64; 3]) -> [f64; 3] {
    let space = plan.space(key).expect("its space");
    let at = turned([east, -north, up], space.turn);
    [space.at[0] + at[0], space.at[1] + at[1], space.at[2] + at[2]]
}

#[test]
fn every_set_piece_a_body_meets_on_a_fight_floor_is_a_part() {
    let plan = drowned_vale();
    let standing = plan.standing();
    // Each piece by its space, a point inside it in its module's frame, and how high over the floor its part rises.
    let mut pieces: Vec<(&str, [f64; 2], f64)> = vec![
        ("court", [-24.0, 6.2], 3.0),
        ("court", [-24.0, -6.2], 3.0),
        ("court", [24.0, 6.2], 3.0),
        ("court", [24.0, -6.2], 3.0),
        ("court", [-2.8, 22.3], 7.0),
        ("court", [2.8, 22.3], 7.0),
        ("court", [0.0, 23.5], 13.0),
        ("mending", [-21.0, 14.0], 0.7),
        ("mending", [21.0, 14.0], 0.7),
        ("mending", [-26.0, 0.0], 0.7),
        ("mending", [14.0, -12.0], 1.0),
        ("mending", [-23.3, -11.6], 0.8),
        ("mending", [-1.2, -8.0], 3.0),
        ("mending", [1.2, -8.0], 3.0),
        ("mending", [-19.0, 22.5], 4.5),
        ("mending", [24.0, -18.5], 4.5),
        ("choir", [-3.6, -23.5], 0.45),
        ("choir", [4.0, -10.5], 0.45),
        ("choir", [-3.5, 15.0], 0.45),
    ];
    // The court's broken columns, 22.6 m out from its middle.
    for degrees in [30.0_f64, 60.0, 120.0, 150.0, 210.0, 240.0, 300.0, 330.0] {
        let angle = degrees.to_radians();
        pieces.push(("court", [22.6 * libm::cos(angle), 22.6 * libm::sin(angle)], 2.0));
    }
    for (space, [east, north], over) in pieces {
        let at = in_space(plan, space, [east, north, 0.0]);
        let rising = standing.iter().any(|block| {
            block.min_x <= at[0]
                && at[0] <= block.max_x
                && block.min_y <= at[1]
                && at[1] <= block.max_y
                && block.top >= at[2] + over
        });
        assert!(rising, "{space}'s piece at {east}, {north} stands {over} m high as a part");
    }
}

#[test]
fn a_body_walked_out_through_a_courts_shut_rift_stands_on_its_floor() {
    let plan = drowned_vale();
    let blocks: Blocks = plan.standing().into();
    for rift in ["rift-was", "rift-is"] {
        let (at, facing) = plan.socket("court", rift).expect("its rift");
        let (body, _) = pressed(&blocks, at, bearing_of([-facing[0], -facing[1]]), false, 4.0);
        let stood = body.mode == movement::Mode::Ground && (body.z - at[2]).abs() < 0.3;
        assert!(stood, "out through the court's {rift}: at {:.1}, {:.1}, {:.1}", body.x, body.y, body.z);
    }
}

/// Whether a body walked from one point toward another gets there, within `near` metres flat and on its floor: steered
/// at it each tick, running, jumping where its way half a metre ahead drops deeper than its goal or it stops getting
/// nearer, and dying, as the run kills, by a fall of reach::FALL_M or onto the dark.
fn walks_to(blocks: &Blocks, from: [f64; 3], to: [f64; 3], near: f64) -> bool {
    let mut body = Body { z: from[2], ..standing(from[0], from[1]) };
    let (mut stood, mut nearest, mut stalled) = (body.z, f64::INFINITY, 0);
    let flat = |body: &Body| combat::sight::apart([to[0], to[1]], [body.x, body.y]);
    for _ in 0..((flat(&body) / movement::TUNING.walk + 4.0) / TICK_SECONDS) as usize {
        let far = flat(&body);
        if far <= near && (body.z - to[2]).abs() < near.max(0.6) && body.mode == movement::Mode::Ground {
            return true;
        }
        (nearest, stalled) = if far < nearest - 0.3 { (far, 0) } else { (nearest, stalled + 1) };
        if stalled > 2 * 60 {
            return false;
        }
        let (east, south) = ((to[0] - body.x) / far.max(1e-9), (to[1] - body.y) / far.max(1e-9));
        let ahead =
            movement::blocks::ground_at(blocks, &Floor::Dark, body.x + east / 2.0, body.y + south / 2.0, body.z);
        let gap = ahead < body.z - movement::TUNING.step && ahead < to[2] - movement::TUNING.step;
        let jump = body.mode == movement::Mode::Ground && (gap || stalled > 30);
        let controls =
            Controls { forward: 1.0, yaw: libm::atan2(east, -south), run: true, jump, ..Controls::default() };
        body = step_body(&body, &controls, blocks, &Floor::Dark, TICK_SECONDS);
        if body.mode != movement::Mode::Air {
            stood = body.z;
        }
        if stood - body.z >= reach::FALL_M || body.z < 0.5 {
            return false;
        }
    }
    false
}

/// A spot a body walks to: its space, its name, where, how near a body must come (beside a plinth, within reach of
/// its stone), and whether it must be reached: a piece must, the middle of a floor only helps the way there.
struct Spot {
    space: String,
    name: String,
    at: [f64; 3],
    near: f64,
    piece: bool,
}

/// The points five metres out the way each of a space's pieces faces.
fn fronts(plan: &Plan, space: &str) -> Vec<[f64; 3]> {
    let found = plan.space(space).expect("its space");
    let sockets = module(&found.module).expect("its module").sockets;
    let named = sockets.iter().map(|socket| socket.name).filter(|name| stood_at(name));
    let front = |name: &str| {
        plan.socket(space, name).map(|(at, [east, south])| [at[0] + east * 5.0, at[1] + south * 5.0, at[2]])
    };
    named.filter_map(front).collect()
}

/// A space's spots: each piece a body stands at or beside, its slabs among them, and the middle of each floor in it
/// a body could stand on.
fn spots(plan: &Plan, blocks: &[Block], space: &str) -> Vec<Spot> {
    let found = plan.space(space).expect("its space");
    let ground = plan.space_bounds(space, 0.0).expect("its ground");
    let sockets = module(&found.module).expect("its module").sockets;
    let named = sockets.iter().map(|socket| socket.name).filter(|name| stood_at(name) || name.starts_with("slab-"));
    let near = |name: &str| if name == "plinth" { crate::breach::lodestone::TAKE_REACH_M - 0.5 } else { 0.8 };
    let at = |name: &str| plan.socket(space, name).expect("its socket").0;
    let pieces =
        named.map(|name| Spot { space: space.into(), name: name.into(), at: at(name), near: near(name), piece: true });
    let clear = |[x, y, z]: [f64; 3]| {
        let over = |block: &&Block| block.min_x <= x && x <= block.max_x && block.min_y <= y && y <= block.max_y;
        blocks.iter().filter(over).all(|block| block.top <= z + 0.05 || block.bottom >= z + 1.8)
    };
    let floors = blocks.iter().filter_map(|block| {
        let middle = [(block.min_x + block.max_x) / 2.0, (block.min_y + block.max_y) / 2.0, block.top];
        let inside = middle[0] >= ground.min_x
            && middle[0] <= ground.max_x
            && middle[1] >= ground.min_y
            && middle[1] <= ground.max_y;
        let wide = block.max_x - block.min_x >= 1.2 && block.max_y - block.min_y >= 1.2;
        (inside && wide && clear(middle)).then(|| Spot {
            space: space.into(),
            name: format!("floor {middle:.1?}"),
            at: middle,
            near: 0.8,
            piece: false,
        })
    });
    // Five metres out the way each piece faces, as a house's heart faces its door.
    let fronts = fronts(plan, space).into_iter().filter(|at| clear(*at)).map(|at| Spot {
        space: space.into(),
        name: format!("front {at:.1?}"),
        at,
        near: 0.8,
        piece: false,
    });
    pieces.chain(floors).chain(fronts).collect()
}

/// The pieces not reached from the first spot, walking the way asked (`toward` from the reached to the next, else
/// back): each tried in turn from the nearest spots already reached in its own space, or standing where it stands (as
/// a space's way out stands at the next one's way in), three at a time until every way is tried; a floor's middle
/// three times at most.
fn unreached(blocks: &Blocks, spots: &[Spot], toward: bool) -> Vec<String> {
    let apart = |one: [f64; 3], two: [f64; 3]| combat::sight::apart([one[0], one[1]], [two[0], two[1]]);
    let mut reached = vec![false; spots.len()];
    reached[0] = true;
    let (mut tried, mut tries) = (std::collections::BTreeSet::new(), vec![0; spots.len()]);
    let mut grew = true;
    while grew {
        grew = false;
        for next in 0..spots.len() {
            let goal = &spots[next];
            if reached[next] || (!goal.piece && tries[next] >= 9) {
                continue;
            }
            let mut from: Vec<usize> = (0..spots.len())
                .filter(|from| reached[*from] && !tried.contains(&(*from, next)))
                .filter(|from| spots[*from].space == goal.space || apart(spots[*from].at, goal.at) < 0.01)
                .collect();
            from.sort_by(|one, two| apart(spots[*one].at, goal.at).total_cmp(&apart(spots[*two].at, goal.at)));
            for one in from.into_iter().take(3) {
                (tries[next], grew) = (tries[next] + 1, true);
                tried.insert((one, next));
                let start = &spots[one];
                let walked = apart(start.at, goal.at) < 0.01
                    || if toward {
                        walks_to(blocks, start.at, goal.at, goal.near)
                    } else {
                        walks_to(blocks, goal.at, start.at, start.near)
                    };
                if walked {
                    reached[next] = true;
                    break;
                }
            }
        }
    }
    let left = spots.iter().zip(reached).filter(|(spot, reached)| spot.piece && !reached);
    left.map(|(spot, _)| format!("{}/{}", spot.space, spot.name)).collect()
}

#[test]
fn every_piece_is_reached_on_foot_from_the_descent_and_the_court_from_each() {
    let plan = drowned_vale();
    let mut standing = plan.standing();
    standing.extend(plan.slabs.iter().filter_map(|slab| plan.slab_block(slab)));
    let blocks: Blocks = standing.clone().into();
    let walked = ["descent", "mending", "choir", "ways", "stair", "hall", "court"];
    let mut all: Vec<Spot> = walked.iter().flat_map(|space| spots(plan, &standing, space)).collect();
    let first = |all: &[Spot], name: &str| all.iter().position(|spot| format!("{}/{}", spot.space, spot.name) == name);
    let arrival = first(&all, "descent/arrival").expect("its arrival");
    all.swap(0, arrival);
    assert_eq!(unreached(&blocks, &all, true), Vec::<String>::new(), "from the Descent's arrival");
    let court = first(&all, "court/checkpoint").expect("its stage");
    all.swap(0, court);
    assert_eq!(unreached(&blocks, &all, false), Vec::<String>::new(), "the court, from each");
    for shore in plan.shores.values().flatten() {
        let mut all = spots(plan, &standing, shore);
        let arrival = first(&all, &format!("{shore}/arrival")).expect("its arrival");
        all.swap(0, arrival);
        assert_eq!(unreached(&blocks, &all, true), Vec::<String>::new(), "{shore}, from its arrival");
        let rift = first(&all, &format!("{shore}/rift")).expect("its rift");
        all.swap(0, rift);
        assert_eq!(unreached(&blocks, &all, false), Vec::<String>::new(), "{shore}'s rift, from each");
    }
}
