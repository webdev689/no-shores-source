use super::*;
use crate::Floor;
use movement::blocks::ground_at;
use movement::{Body, Controls, Mode, TICK_SECONDS, step_body};

/// Each of the 18 Elite Dungeons as its room lays it, and its plan.
fn elite_plans() -> Vec<(String, Dungeon, EncounterPlan)> {
    gear::activities::elite_dungeons()
        .map(|elite| {
            let (seed, style) = crate::elite_laid(elite.id).expect("an Elite Dungeon's seed and style");
            let laid = Dungeon::forge_within(seed, style, dungeon::ELITE_BLOCKS);
            let plan = plan_encounters(&laid);
            (elite.id.to_owned(), laid, plan)
        })
        .collect()
}

#[test]
fn every_elite_dungeon_holds_its_seals_each_in_a_room_of_its_own_and_never_two_alike() {
    let plans = elite_plans();
    assert_eq!(plans.len(), 18);
    let mut kinds_seen = std::collections::BTreeSet::new();
    for (place, laid, plan) in &plans {
        assert_eq!(plan.seals.len(), seals_for(laid.squares.len()), "{place}: its seals");
        let landmarked: Vec<usize> = laid.landmarks.iter().map(|placed| placed.room).collect();
        for (at, seal) in plan.seals.iter().enumerate() {
            kinds_seen.insert(seal.kind as u8);
            assert!(seal.room != laid.end() && seal.room != laid.way_in.room, "{place}: never the way in or the end");
            assert!(!landmarked.contains(&seal.room), "{place}: never a landmark's room");
            for other in &plan.seals[at + 1..] {
                assert_ne!(seal.kind, other.kind, "{place}: never two alike");
                assert_ne!(seal.room, other.room, "{place}: a room each");
            }
            for piece in &seal.pieces {
                let cell = plan.cell_at(*piece).expect("a piece in the dungeon");
                assert_eq!(laid.room_at(cell), Some(seal.room), "{place}: its pieces in its room");
                let clear = laid.boxes().iter().all(|&[min_x, min_y, max_x, max_y, _, _]| {
                    let (east, south) =
                        ((min_x - piece[0]).max(piece[0] - max_x), (min_y - piece[1]).max(piece[1] - max_y));
                    libm::hypot(east.max(0.0), south.max(0.0)) >= SPOT_CLEAR_M - 1e-9
                });
                if seal.kind != SealKind::Ascent {
                    assert!(clear, "{place}: a piece clear of every solid");
                    let furnished = (laid.props.iter().map(|prop| prop.at))
                        .chain(laid.fixtures.iter().map(|fixture| fixture.at))
                        .all(|at| libm::hypot(at[0] - piece[0], at[1] - piece[1]) >= PROP_CLEAR_M - 1e-9);
                    assert!(furnished, "{place}: no prop or fixture on a piece");
                }
            }
            let pieces = seal.pieces.len();
            match seal.kind {
                SealKind::Litany => assert!((4..=6).contains(&pieces), "{place}: four to six runes"),
                SealKind::Weighing => assert_eq!(pieces, 3, "{place}: three plates"),
                SealKind::Holdfast | SealKind::Ascent => assert_eq!(pieces, 1),
            }
        }
        // Walk order: each seal no farther along than the next.
        let walks: Vec<u32> = plan.seals.iter().map(|seal| laid.rooms[seal.room].walk).collect();
        assert!(walks.windows(2).all(|pair| pair[0] <= pair[1]), "{place}: seals along the walk");
        assert_eq!(plan.anchors.len(), ANCHORS, "{place}: three anchors");
        for anchor in &plan.anchors {
            let cell = plan.cell_at(*anchor).expect("an anchor in the dungeon");
            assert_eq!(laid.room_at(cell), Some(laid.end()), "{place}: anchors in the end room");
        }
    }
    assert_eq!(kinds_seen.len(), 4, "every kind is laid somewhere among the 18");
}

#[test]
fn a_dungeon_of_four_blocks_holds_two_seals_and_one_of_five_three() {
    assert_eq!((seals_for(4), seals_for(5)), (2, 3));
}

#[test]
fn each_seal_is_laid_nearest_the_middle_of_its_stretch_of_the_walk_not_at_its_start() {
    for (place, laid, plan) in elite_plans() {
        let end = laid.end();
        let landmarked: Vec<usize> = laid.landmarks.iter().map(|placed| placed.room).collect();
        let mut rooms: Vec<usize> = (0..laid.rooms.len())
            .filter(|room| *room != end && *room != laid.way_in.room && !landmarked.contains(room))
            .collect();
        rooms.sort_by_key(|&room| (laid.rooms[room].walk, room));
        if rooms.len() >= 4 {
            assert_ne!(plan.seals[0].room, rooms[0], "{place}: the first seal is not the first room on the walk");
        }
    }
}

#[test]
fn at_least_nine_of_the_eighteen_lay_an_ascent() {
    let ascents =
        elite_plans().iter().filter(|(_, _, plan)| plan.seals.iter().any(|seal| seal.kind == SealKind::Ascent)).count();
    assert!(ascents >= 9, "{ascents} of 18 lay an Ascent");
}

#[test]
fn a_plan_is_the_same_every_time_it_is_laid() {
    for (place, laid, plan) in elite_plans() {
        assert_eq!(plan_encounters(&laid), plan, "{place}");
    }
}

#[test]
fn a_weighings_plates_stand_apart_and_its_first_two_farthest() {
    for (place, _, plan) in elite_plans() {
        for seal in plan.seals.iter().filter(|seal| seal.kind == SealKind::Weighing) {
            let apart = |a: [f64; 3], b: [f64; 3]| libm::hypot(a[0] - b[0], a[1] - b[1]);
            let [first, second, third] = [seal.pieces[0], seal.pieces[1], seal.pieces[2]];
            for (a, b) in [(first, second), (first, third), (second, third)] {
                assert!(apart(a, b) >= PLATES_APART_M - 1e-9, "{place}: plates apart");
            }
            assert!(apart(first, second) >= apart(first, third) && apart(first, second) >= apart(second, third));
        }
    }
}

#[test]
fn every_plate_of_a_weighing_is_in_plain_view_ahead_of_the_doorway_its_room_is_entered_by() {
    let mut weighings = 0;
    for (place, laid, plan) in elite_plans() {
        let walked = walks(&laid);
        let doorways: Vec<usize> = laid.frames.iter().map(|frame| frame.cell).collect();
        for seal in plan.seals.iter().filter(|seal| seal.kind == SealKind::Weighing) {
            weighings += 1;
            let door = seal.cells.iter().copied().filter(|cell| doorways.contains(cell));
            let door = laid.centre(door.min_by_key(|&cell| (walked[cell], cell)).expect("a doorway"));
            for plate in &seal.pieces {
                // Every 5 cm along the line from the doorway's middle to the plate, no solid stands.
                let seen = (0..=200).all(|step| {
                    let share = f64::from(step) / 200.0;
                    let [x, y] = [door[0] + (plate[0] - door[0]) * share, door[1] + (plate[1] - door[1]) * share];
                    laid.boxes()
                        .iter()
                        .all(|&[min_x, min_y, max_x, max_y, _, _]| x < min_x || x > max_x || y < min_y || y > max_y)
                });
                assert!(seen, "{place}: a plate at {plate:?} hidden from the doorway at {door:?}");
                // And ahead of a body coming in by the doorway from the open cell before it, within about 70 degrees
                // either side (cosine 0.35), none behind or beside it.
                let cell = plan.cell_at([door[0], door[1], 0.0]).expect("the doorway's cell");
                let before = dungeon::SIDES
                    .into_iter()
                    .filter_map(|side| laid.beside(cell, side))
                    .filter(|next| laid.cells[*next] != Cell::Rock && laid.room_at(*next) != Some(seal.room))
                    .min_by_key(|&next| (walked[next], next))
                    .expect("a way in");
                let from = laid.centre(before);
                let (inward, toward) =
                    ([door[0] - from[0], door[1] - from[1]], [plate[0] - door[0], plate[1] - door[1]]);
                let cosine = (inward[0] * toward[0] + inward[1] * toward[1])
                    / (libm::hypot(inward[0], inward[1]) * libm::hypot(toward[0], toward[1]));
                assert!(
                    cosine >= 0.35 - 1e-9,
                    "{place}: a plate at {plate:?} beside or behind the doorway at {door:?}"
                );
            }
        }
    }
    assert!(weighings >= 4, "{weighings} Weighings among the 18");
}

#[test]
fn an_ascents_pads_rise_under_the_ceiling_clear_of_every_solid_and_doorway() {
    for (place, laid, plan) in elite_plans() {
        let boxes = laid.boxes();
        for seal in plan.seals.iter().filter(|seal| seal.kind == SealKind::Ascent) {
            assert!((ASCENT_PADS.0..=ASCENT_PADS.1).contains(&seal.pads.len()), "{place}: its pads");
            let lowest = seal.cells.iter().map(|&cell| laid.ceilings[cell]).fold(f64::INFINITY, f64::min);
            assert!(seal.pads[0].top <= TUNING.reach, "{place}: the first pad mantled from the floor");
            for pair in seal.pads.windows(2) {
                let rise = pair[1].top - pair[0].top;
                assert!((0.0..=0.4 + 1e-12).contains(&rise), "{place}: rising tops, 0.4 m at the most");
            }
            for (at, pad) in seal.pads.iter().enumerate() {
                if at > 0 {
                    assert!(pad.top > TUNING.reach, "{place}: pad {at} over a mantle's reach from the floor");
                }
                let room = if at + 1 == seal.pads.len() { HEAD_ROOM_M } else { JUMP_ROOM_M };
                assert!(pad.top + TUNING.height + room <= lowest + 1e-9, "{place}: under the ceiling");
                for corner in [[pad.min_x, pad.min_y], [pad.max_x, pad.max_y]] {
                    let cell = plan.cell_at([corner[0], corner[1], pad.bottom]).expect("a pad in the dungeon");
                    assert_eq!(laid.cells[cell], Cell::Room(u16::try_from(seal.room).unwrap()), "{place}: no rock");
                }
                let middle = [(pad.min_x + pad.max_x) / 2.0, (pad.min_y + pad.max_y) / 2.0];
                let cell = plan.cell_at([middle[0], middle[1], pad.bottom]).expect("its cell");
                assert!(!laid.frames.iter().any(|frame| frame.cell == cell), "{place}: no doorway");
                assert!(cell != laid.way_in.cell && cell != laid.portal.cell);
                let clear = boxes.iter().all(|&[min_x, min_y, max_x, max_y, _, _]| {
                    max_x <= pad.min_x || min_x >= pad.max_x || max_y <= pad.min_y || min_y >= pad.max_y
                });
                assert!(clear, "{place}: a pad meets no solid");
            }
            for (at, pad) in seal.pads.iter().enumerate() {
                for other in &seal.pads[at + 1..] {
                    let east = (pad.min_x - other.max_x).max(other.min_x - pad.max_x).max(0.0);
                    let south = (pad.min_y - other.max_y).max(other.min_y - pad.max_y).max(0.0);
                    assert!(libm::hypot(east, south) >= LEAP_M.0 - 1e-9, "{place}: every two pads a leap apart");
                }
            }
            assert_eq!(seal.pieces[0][2], seal.pads.last().expect("a top pad").top, "{place}: the stone on top");
            assert!(seal.drowned.iter().all(|cell| !laid.frames.iter().any(|frame| frame.cell == *cell)));
        }
    }
}

/// A body run from the Ascent's doorway pad to pad as a player would: facing the next pad, running, jumping at the
/// edge of what it stands on. Answers whether it stood on the top pad by the stone, never once on a drowned cell's
/// floor.
fn climbed(laid: &Dungeon, plan: &EncounterPlan, seal: &SealPlan) -> bool {
    let floor = Floor::of_dungeon(laid).expect("its ground");
    let pads = seal.pads.clone();
    let first = &pads[0];
    let start_cell = laid.rooms[seal.room]
        .cells
        .iter()
        .copied()
        .filter(|cell| laid.frames.iter().any(|frame| frame.cell == *cell))
        .min_by(|a, b| {
            let near = |cell: usize| {
                let [x, y] = laid.centre(cell);
                let (mid_x, mid_y) = ((first.min_x + first.max_x) / 2.0, (first.min_y + first.max_y) / 2.0);
                libm::hypot(x - mid_x, y - mid_y)
            };
            near(*a).total_cmp(&near(*b))
        })
        .expect("a doorway");
    let [x, y] = laid.centre(start_cell);
    let mut body = Body { x, y, ..movement::standing(x, y) };
    let mut target = 0;
    // Standing on the pad before the target at its run-up spot, ready to take the leap.
    let mut set = false;
    for _ in 0..(30.0 / TICK_SECONDS) as usize {
        let pad = &pads[target];
        let on = |pad: &Block| {
            body.mode == Mode::Ground
                && (body.z - pad.top).abs() < 1e-6
                && (pad.min_x..=pad.max_x).contains(&body.x)
                && (pad.min_y..=pad.max_y).contains(&body.y)
        };
        if on(pad) {
            if target + 1 == pads.len() {
                let stone = seal.pieces[0];
                if libm::hypot(body.x - stone[0], body.y - stone[1]) < 0.6 {
                    return true;
                }
            } else {
                (target, set) = (target + 1, false);
                continue;
            }
        }
        let wet = plan.cell_at([body.x, body.y, body.z]).is_some_and(|cell| seal.drowned.contains(&cell));
        if wet && body.z < 0.05 {
            return false;
        }
        let [aim_x, aim_y] = if target > 0 && !set { run_up(&pads, target - 1) } else { middle(pad) };
        if target > 0 && !set && libm::hypot(aim_x - body.x, aim_y - body.y) < 0.15 {
            set = true;
            continue;
        }
        let yaw = libm::atan2(aim_x - body.x, -(aim_y - body.y));
        let ahead = |reach: f64| {
            ground_at(&pads, &floor, body.x + libm::sin(yaw) * reach, body.y - libm::cos(yaw) * reach, body.z)
        };
        // At the edge of a pad, or before the first pad's side, mantled from the floor.
        let (front_x, front_y) = (body.x + libm::sin(yaw) * 0.6, body.y - libm::cos(yaw) * 0.6);
        let side = pads.iter().any(|pad| {
            let over = (pad.min_x..=pad.max_x).contains(&front_x) && (pad.min_y..=pad.max_y).contains(&front_y);
            over && pad.top > body.z + 0.5
        });
        let ready = target == 0 || set;
        let edge = ready && body.mode == Mode::Ground && (ahead(0.45) < body.z - 0.05 || side);
        let near = libm::hypot(aim_x - body.x, aim_y - body.y);
        let forward = if ready && target + 1 == pads.len() && near < 0.6 { 0.0 } else { 1.0 };
        let controls = Controls { forward, yaw, run: ready, jump: edge, ..Controls::default() };
        body = step_body(&body, &controls, &pads, &floor, TICK_SECONDS);
    }
    false
}

/// A pad's middle.
fn middle(pad: &Block) -> [f64; 2] {
    [(pad.min_x + pad.max_x) / 2.0, (pad.min_y + pad.max_y) / 2.0]
}

/// Where a player takes a run at the leap from pad `from` to the next: on its side away from the next.
fn run_up(pads: &[Block], from: usize) -> [f64; 2] {
    let ([x, y], [to_x, to_y]) = (middle(&pads[from]), middle(&pads[from + 1]));
    let yaw = libm::atan2(to_x - x, -(to_y - y));
    let pad = pads[from];
    let (half_x, half_y) = ((pad.max_x - pad.min_x) / 2.0, (pad.max_y - pad.min_y) / 2.0);
    [x - half_x * 0.7 * libm::sin(yaw), y + half_y * 0.7 * libm::cos(yaw)]
}

#[test]
fn every_ascent_is_climbed_by_a_body_running_and_jumping_pad_to_pad() {
    let mut ascents = 0;
    for (place, laid, plan) in elite_plans() {
        for seal in plan.seals.iter().filter(|seal| seal.kind == SealKind::Ascent) {
            ascents += 1;
            assert!(climbed(&laid, &plan, seal), "{place}: its Ascent is climbed");
            for from in 0..seal.pads.len() - 1 {
                assert!(reached(&laid, seal, from, true), "{place}: pad {} reached by a running jump", from + 1);
                assert!(!reached(&laid, seal, from, false), "{place}: pad {} reached with no jump", from + 1);
            }
        }
    }
    assert!(ascents > 0, "some Elite Dungeon has an Ascent");
}

/// A body standing on the middle of pad `from`, running at the next and, if `jumps`, jumping at the edge: whether it
/// ever stands on the next pad's top, never once touching the drowned floor.
fn reached(laid: &Dungeon, seal: &SealPlan, from: usize, jumps: bool) -> bool {
    let floor = Floor::of_dungeon(laid).expect("its ground");
    let ([x, y], [to_x, to_y]) = (run_up(&seal.pads, from), middle(&seal.pads[from + 1]));
    let yaw = libm::atan2(to_x - x, -(to_y - y));
    let next = seal.pads[from + 1];
    let mut body = Body { z: seal.pads[from].top, ..movement::standing(x, y) };
    for _ in 0..(4.0 / TICK_SECONDS) as usize {
        let on = (next.min_x..=next.max_x).contains(&body.x) && (next.min_y..=next.max_y).contains(&body.y);
        if body.mode == Mode::Ground && (body.z - next.top).abs() < 1e-6 && on {
            return true;
        }
        if body.z < 0.05 {
            return false;
        }
        let ahead =
            ground_at(&seal.pads, &floor, body.x + libm::sin(yaw) * 0.45, body.y - libm::cos(yaw) * 0.45, body.z);
        let edge = jumps && body.mode == Mode::Ground && body.z > 0.1 && ahead < body.z - 0.05;
        let controls = Controls { forward: 1.0, yaw, run: true, jump: edge, ..Controls::default() };
        body = step_body(&body, &controls, &seal.pads, &floor, TICK_SECONDS);
    }
    false
}

#[test]
fn every_two_runes_of_a_litany_stand_two_metres_apart_at_the_least() {
    for (place, _, plan) in elite_plans() {
        for seal in plan.seals.iter().filter(|seal| seal.kind == SealKind::Litany) {
            for (at, first) in seal.pieces.iter().enumerate() {
                for second in &seal.pieces[at + 1..] {
                    let apart = libm::hypot(first[0] - second[0], first[1] - second[1]);
                    assert!(apart >= 2.0 - 1e-9, "{place}: runes {apart} m apart");
                }
            }
        }
    }
}
