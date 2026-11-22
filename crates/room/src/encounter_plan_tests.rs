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
                let cell = plan.cell_at([piece[0], piece[1]]).expect("a piece in the dungeon");
                assert_eq!(laid.room_at(cell), Some(seal.room), "{place}: its pieces in its room");
                let clear = laid.boxes().iter().all(|&[min_x, min_y, max_x, max_y, _]| {
                    let (east, south) =
                        ((min_x - piece[0]).max(piece[0] - max_x), (min_y - piece[1]).max(piece[1] - max_y));
                    libm::hypot(east.max(0.0), south.max(0.0)) >= SPOT_CLEAR_M - 1e-9
                });
                if seal.kind != SealKind::Ascent {
                    assert!(clear, "{place}: a piece clear of every solid");
                }
            }
            let pieces = seal.pieces.len();
            match seal.kind {
                SealKind::Litany => assert!((LITANY_RUNES.0..=LITANY_RUNES.1).contains(&pieces)),
                SealKind::Weighing => assert_eq!(pieces, PLATES),
                SealKind::Holdfast | SealKind::Ascent => assert_eq!(pieces, 1),
            }
        }
        // Walk order: each seal no farther along than the next.
        let walks: Vec<u32> = plan.seals.iter().map(|seal| laid.rooms[seal.room].walk).collect();
        assert!(walks.windows(2).all(|pair| pair[0] <= pair[1]), "{place}: seals along the walk");
        assert_eq!(plan.anchors.len(), ANCHORS, "{place}: three anchors");
        for anchor in &plan.anchors {
            let cell = plan.cell_at([anchor[0], anchor[1]]).expect("an anchor in the dungeon");
            assert_eq!(laid.room_at(cell), Some(laid.end()), "{place}: anchors in the end room");
        }
    }
    assert_eq!(kinds_seen.len(), 4, "every kind is laid somewhere among the 18");
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
fn an_ascents_pads_rise_under_the_ceiling_clear_of_every_solid_and_doorway() {
    for (place, laid, plan) in elite_plans() {
        let boxes = laid.boxes();
        for seal in plan.seals.iter().filter(|seal| seal.kind == SealKind::Ascent) {
            assert!((ASCENT_PADS.0..=ASCENT_PADS.1).contains(&seal.pads.len()), "{place}: its pads");
            let lowest = seal.cells.iter().map(|&cell| laid.ceilings[cell]).fold(f64::INFINITY, f64::min);
            for (nth, pad) in seal.pads.iter().enumerate() {
                assert!((pad.top - (nth + 1) as f64 * PAD_RISE_M).abs() < 1e-12, "{place}: rising tops");
                assert!(pad.top + TUNING.height + HEAD_ROOM_M <= lowest, "{place}: under the ceiling");
                for corner in [[pad.min_x, pad.min_y], [pad.max_x, pad.max_y]] {
                    let cell = plan.cell_at(corner).expect("a pad in the dungeon");
                    assert_eq!(laid.cells[cell], Cell::Room(u16::try_from(seal.room).unwrap()), "{place}: no rock");
                }
                let middle = [(pad.min_x + pad.max_x) / 2.0, (pad.min_y + pad.max_y) / 2.0];
                let cell = plan.cell_at(middle).expect("its cell");
                assert!(!laid.frames.iter().any(|frame| frame.cell == cell), "{place}: no doorway");
                assert!(cell != laid.way_in.cell && cell != laid.portal.cell);
                let clear = boxes.iter().all(|&[min_x, min_y, max_x, max_y, _]| {
                    max_x <= pad.min_x || min_x >= pad.max_x || max_y <= pad.min_y || min_y >= pad.max_y
                });
                assert!(clear, "{place}: a pad meets no solid");
            }
            assert_eq!(seal.pieces[0][2], seal.pads.last().expect("a top pad").top, "{place}: the stone on top");
            assert!(seal.drowned.iter().all(|cell| !laid.frames.iter().any(|frame| frame.cell == *cell)));
        }
    }
}

/// A body run from the Ascent's doorway pad to pad as a player would: facing the next pad, running, jumping at the
/// edge of what it stands on. Answers whether it stood on the top pad by the stone, and never once on the floor
/// after it first left it.
fn climbed(laid: &Dungeon, seal: &SealPlan) -> bool {
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
    let mut left_floor = false;
    for _ in 0..(30.0 / TICK_SECONDS) as usize {
        let pad = &pads[target];
        let (mid_x, mid_y) = ((pad.min_x + pad.max_x) / 2.0, (pad.min_y + pad.max_y) / 2.0);
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
                target += 1;
                continue;
            }
        }
        left_floor |= body.z > 0.1;
        if left_floor && body.mode == Mode::Ground && body.z < 0.05 {
            return false;
        }
        let yaw = libm::atan2(mid_x - body.x, -(mid_y - body.y));
        let ahead = |reach: f64| {
            ground_at(&pads, &floor, body.x + libm::sin(yaw) * reach, body.y - libm::cos(yaw) * reach, body.z)
        };
        let edge = body.mode == Mode::Ground && body.z > 0.1 && ahead(0.45) < body.z - 0.05;
        let near = libm::hypot(mid_x - body.x, mid_y - body.y);
        let forward = if target + 1 == pads.len() && near < 0.6 { 0.0 } else { 1.0 };
        let controls = Controls { forward, yaw, run: true, jump: edge, ..Controls::default() };
        body = step_body(&body, &controls, &pads, &floor, TICK_SECONDS);
    }
    false
}

#[test]
fn every_ascent_is_climbed_by_a_body_running_and_jumping_pad_to_pad() {
    let mut ascents = 0;
    for (place, laid, plan) in elite_plans() {
        for seal in plan.seals.iter().filter(|seal| seal.kind == SealKind::Ascent) {
            ascents += 1;
            assert!(climbed(&laid, seal), "{place}: its Ascent is climbed");
        }
    }
    assert!(ascents > 0, "some Elite Dungeon has an Ascent");
}
