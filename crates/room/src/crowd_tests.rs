//! Melee foes in numbers round one player: how close they stand to each other, how many overlap, how often one swings
//! with an ally's body between it and its target, how many hold a turn at once, and whether the waiting keep to their
//! ring. Each crowd is measured over a few runs, each from its own seed and its own places round the player, on open
//! ground, on the Test Ground's course, and on a node's land.

use super::garrison_tests::node;
use super::*;
use crate::{Fighter, Input};
use ::foes::Rank;
use ::foes::brain::Plan;
use ::foes::roster::{COLLECTOR, ENFORCER, RUNNER};
use ::foes::tuning::RING_SLACK;
use combat::sight::{apart, bearing};
use combat::tuning::BODY_RADIUS;
use core::f64::consts::TAU;
use movement::Controls;
use std::collections::BTreeMap;

/// What a crowd's fight measured over its foes alive each tick, averaged over its runs.
#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct Crowd {
    /// The mean distance from each foe to its nearest ally, and from each foe waiting its turn.
    pub nearest: f64,
    pub waiting_nearest: f64,
    /// The least distance between two foes in any run.
    pub closest: f64,
    /// Pairs standing within a body's width of each other, on average a tick.
    pub overlapping: f64,
    /// The share of swings begun with an ally's body across the line to the target, nearer than it.
    pub through_ally: f64,
    /// Swings begun a minute outside the player's breaths (`Board::breathing`), when no foe may begin one.
    pub swings: f64,
    /// The melee turns out, on average and at most.
    pub turns: f64,
    pub turns_most: usize,
    /// Waiting foes standing inside their ring's near edge, on average a tick.
    pub inside_ring: f64,
}

/// Where a crowd fights.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Ground {
    Open,
    Course,
    Node,
}

const RUNS: u32 = 4;
const SECONDS: u32 = 30;

/// The Test Ground's course, as its rooms stand on it: its start and its blocks.
fn course() -> ((f64, f64), Vec<movement::Block>) {
    let json: serde_json::Value =
        serde_json::from_str(include_str!("../../../content/testground/course.json")).unwrap();
    let number = |value: &serde_json::Value, key: &str| value[key].as_f64().unwrap();
    let blocks = json["blocks"].as_array().unwrap().iter().map(|block| movement::Block {
        min_x: number(block, "minX"),
        min_y: number(block, "minY"),
        max_x: number(block, "maxX"),
        max_y: number(block, "maxY"),
        top: number(block, "top"),
        bottom: 0.0,
    });
    ((number(&json["start"], "x"), number(&json["start"], "y")), blocks.collect())
}

/// A room of the ground, empty of foes, with a player standing where the crowd fights.
fn ground(ground: Ground) -> (Room, crate::PlayerId) {
    let mut room = match ground {
        Ground::Open => Room::new(Vec::new(), (0.0, 0.0)),
        Ground::Course => {
            let (start, blocks) = course();
            Room::new(blocks, start)
        }
        Ground::Node => {
            let mut room = node(NodeKind::Patrol, "glade");
            let at = room.garrison[0].at;
            room.foes.clear();
            room.garrison.clear();
            room.spawn_points = vec![(at[0], at[1])];
            room
        }
    };
    let player = room.join().unwrap();
    (room, player)
}

/// Stands `count` melee foes of the land's types 9 m round a player on `ground`, the player kept whole and still or
/// walking slowly round a wide circle, the room's heat held at `heat`, for SECONDS a run; measures the last two thirds.
pub(crate) fn crowd(on: Ground, count: usize, heat: f64, walking: bool) -> Crowd {
    let mut total = Crowd { closest: f64::INFINITY, ..Crowd::default() };
    for run in 0..RUNS {
        let measured = crowd_run(on, count, heat, walking, run);
        total.nearest += measured.nearest / f64::from(RUNS);
        total.waiting_nearest += measured.waiting_nearest / f64::from(RUNS);
        total.closest = total.closest.min(measured.closest);
        total.overlapping += measured.overlapping / f64::from(RUNS);
        total.through_ally += measured.through_ally / f64::from(RUNS);
        total.swings += measured.swings / f64::from(RUNS);
        total.turns += measured.turns / f64::from(RUNS);
        total.turns_most = total.turns_most.max(measured.turns_most);
        total.inside_ring += measured.inside_ring / f64::from(RUNS);
    }
    total
}

fn crowd_run(on: Ground, count: usize, heat: f64, walking: bool, run: u32) -> Crowd {
    let (mut room, player) = ground(on);
    room.world_seed ^= u64::from(run).wrapping_mul(0x9e37_79b9_7f4a_7c15);
    let start = room.players[&player].fighter.body;
    let types = [COLLECTOR, RUNNER, ENFORCER];
    let foes: Vec<FighterId> = (0..count)
        .map(|index| {
            let turn = TAU * index as f64 / count as f64 + 0.3 + f64::from(run) * 0.7;
            let (x, y) = (start.x + 9.0 * libm::sin(turn), start.y - 9.0 * libm::cos(turn));
            let at = room.nav.nearest_point([x, y, room.floor.height_at(x, y)]).unwrap_or([x, y, start.z]);
            let found = ::foes::foe_type(types[index % types.len()]).unwrap();
            room.stand_foe(found, Rank::Major, at, bearing([at[0], at[1]], [start.x, start.y]), None)
        })
        .collect();
    let ticks = SECONDS * 60;
    let mut measured = Crowd { closest: f64::INFINITY, ..Crowd::default() };
    let (mut samples, mut swings, mut through, mut open) = (0_u32, 0_u32, 0_u32, 0_u32);
    let mut swinging: BTreeMap<FighterId, bool> = BTreeMap::new();
    for sequence in 1..=ticks {
        room.director.heat = heat;
        let yaw = if walking { f64::from(sequence) * 0.004 } else { 0.0 };
        let controls = Controls { forward: if walking { 0.3 } else { 0.0 }, yaw, ..Controls::default() };
        let intent = combat::Intent { controls, ..combat::Intent::default() };
        room.input(player, Input { sequence, intent, seen: room.clock(), ..Input::default() }).unwrap();
        room.tick();
        let whole = room.players[&player].fighter.health_max;
        room.players.get_mut(&player).unwrap().fighter.health = whole;
        let body = room.players[&player].fighter.body;
        let target = [body.x, body.y];
        let alive: Vec<(FighterId, Fighter)> = foes
            .iter()
            .filter_map(|id| room.foes.get(id).map(|foe| (*id, foe.fighter)))
            .filter(|(_, fighter)| !fighter.dead())
            .collect();
        let counted = sequence > ticks / 3 && alive.len() >= 2;
        for (id, fighter) in &alive {
            let now = matches!(fighter.action, combat::fighter::Action::Attack(_));
            let began = now && !swinging.get(id).copied().unwrap_or(false);
            swinging.insert(*id, now);
            if began && counted {
                swings += 1;
                let from = [fighter.body.x, fighter.body.y];
                let blocked =
                    alive.iter().any(|(other, ally)| other != id && across([ally.body.x, ally.body.y], from, target));
                through += u32::from(blocked);
            }
        }
        open += u32::from(counted && !room.board.breathing(player, room.clock()));
        if !counted {
            continue;
        }
        samples += 1;
        let place = |fighter: &Fighter| [fighter.body.x, fighter.body.y];
        let (mut nearest_sum, mut waiting_sum, mut waiting) = (0.0, 0.0, 0_u32);
        for (id, fighter) in &alive {
            let others = alive.iter().filter(|(other, _)| other != id);
            let nearest = others.map(|(_, other)| apart(place(fighter), place(other))).fold(f64::INFINITY, f64::min);
            nearest_sum += nearest;
            measured.closest = measured.closest.min(nearest);
            if room.foes[id].brain.plan() == Plan::Wait {
                (waiting_sum, waiting) = (waiting_sum + nearest, waiting + 1);
            }
        }
        measured.nearest += nearest_sum / alive.len() as f64;
        measured.waiting_nearest += waiting_sum / f64::from(waiting.max(1));
        let mut overlapping = 0;
        for (index, (_, first)) in alive.iter().enumerate() {
            for (_, second) in &alive[index + 1..] {
                overlapping += usize::from(apart(place(first), place(second)) < 2.0 * BODY_RADIUS);
            }
        }
        measured.overlapping += overlapping as f64;
        let (melee, _) = room.board.tokens_out(player);
        measured.turns += melee as f64;
        measured.turns_most = measured.turns_most.max(melee);
        let pressed = room.director.pressed();
        let inside = alive
            .iter()
            .filter(|(id, _)| room.foes[id].brain.plan() == Plan::Wait)
            .filter(|(_, other)| {
                let ring = combat::arms::weapon(other.arms.melee).reach + pressed.ring_gap;
                apart(target, place(other)) < ring - RING_SLACK
            })
            .count();
        measured.inside_ring += inside as f64;
    }
    let samples = f64::from(samples.max(1));
    measured.nearest /= samples;
    measured.waiting_nearest /= samples;
    measured.overlapping /= samples;
    measured.turns /= samples;
    measured.inside_ring /= samples;
    measured.through_ally = f64::from(through) / f64::from(swings.max(1));
    measured.swings = f64::from(swings) / f64::from(open.max(1)) * 3600.0;
    measured
}

/// Whether a body at `ally` stands across the line from a striker at `from` to its target at `to`, nearer than it.
fn across(ally: [f64; 2], from: [f64; 2], to: [f64; 2]) -> bool {
    let (line_x, line_y) = (to[0] - from[0], to[1] - from[1]);
    let length = libm::sqrt(line_x * line_x + line_y * line_y);
    if length < 1e-9 {
        return false;
    }
    let along = ((ally[0] - from[0]) * line_x + (ally[1] - from[1]) * line_y) / length;
    let aside = ((ally[0] - from[0]) * line_y - (ally[1] - from[1]) * line_x).abs() / length;
    along > 0.0 && along < length - BODY_RADIUS && aside < 2.0 * BODY_RADIUS
}

#[test]
fn sixteen_melee_foes_round_a_player_stand_apart_take_their_turns_and_keep_fighting() {
    for (on, walking, heat) in [(Ground::Open, false, 0.9), (Ground::Course, true, 0.35), (Ground::Node, true, 0.9)] {
        let crowd = crowd(on, 16, heat, walking);
        let cap = ::foes::Director { heat }.caps().melee;
        assert!(crowd.overlapping < 0.15 && crowd.through_ally < 0.25, "{on:?}: no ally in another's way: {crowd:?}");
        assert!(crowd.waiting_nearest >= 1.25 && crowd.inside_ring < 0.5, "{on:?}: the waiting apart, on their rings");
        assert!(crowd.turns_most <= cap + 1, "{on:?}: at most one past the turns' cap: {}", crowd.turns_most);
        // One blow at a time lands at a target, a beat apart, and one foe goes in at a time: they keep swinging at
        // least once in 2.4 beats.
        let beat = ::foes::Director { heat }.pressed().beat;
        let swings = crowd.swings;
        assert!(swings >= 25.0 / beat, "{on:?}: and they keep fighting: {swings} swings a minute, a beat {beat} s");
    }
}
