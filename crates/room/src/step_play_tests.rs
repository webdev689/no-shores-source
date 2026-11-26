//! The roads' defences and puzzles in a room, each the file's own goal on places a test lays: a ward and its waves,
//! won, lost and tried again (longer each time, its foes then dropping nothing); a wave that stands nobody passed
//! over; wards, waves and ambushes only within the room's cap on foes, each player's waves standing apart; a puzzle's
//! points used in order, a wrong one stopping uses longer each time, in any order where it gives none, and nudged off a
//! box; and a place's mesh, the node's own where its square holds it, one baked a tick.

use super::*;
use crate::asks::{Asked, NOT_YET, OUT_OF_REACH};
use crate::garrison::garrison_tests::{baked_ground, run_baked};
use crate::quests::foes_of;
use crate::quests::quests_tests::{counted, joined, living, node_room, on_goal, run, shoot_dead, stand_at};
use crate::steps::steps_tests::{changed, met, riding, step_of};
use gear::quests::{Defend, GoalKind, Puzzle};

/// The file's first defence, a room of its node with its place at the middle, and a player on it standing at a point.
fn defence(at: [f64; 2]) -> (Room, PlayerId, [usize; 3], &'static Defend) {
    let (key, goal) = step_of(GoalKind::Defend, |_| true);
    let Goal::Defend(defend) = &goal.goal else { unreachable!("a defence") };
    let mut room = node_room(&defend.node, &[(defend.place.as_str(), [0.0, 0.0], 60.0)]);
    let player = joined(&mut room, &on_goal(key), at);
    (room, player, key, defend)
}

/// The foes standing in a player's defence's wave.
fn wave(room: &Room, player: PlayerId) -> Vec<FighterId> {
    let Some(Step { kind: Stepping::Defence(defence), .. }) = room.quests.steps.get(&player) else { return Vec::new() };
    defence.standing.clone()
}

#[test]
fn a_defences_ward_stands_with_its_first_wave_coming_at_it_and_the_last_wave_fallen_meets_it() {
    let (mut room, player, key, defend) = defence([0.0, 100.0]);
    run(&mut room, 2);
    assert!(room.foes.is_empty() && room.step_seen(player).ward.is_empty(), "past its reach, nothing stands");
    stand_at(&mut room, player, [0.0, 20.0]);
    run_baked(&mut room, 1);
    let ward = room.quests.wards.iter().next().copied().expect("its ward stands");
    assert!(room.foes_seen().all(|foe| foe.foe != ward), "in no snapshot");
    assert_eq!(room.step_seen(player).ward, [0.0, 0.0, 1.0], "sent its player whole");
    for members in &defend.waves {
        let standing = wave(&room, player);
        assert_eq!(standing.len(), foes_of(members.iter()).len(), "a wave stands");
        assert_eq!(room.living_foes(), standing.len(), "its ward counts against no cap");
        for id in &standing {
            let body = room.foes[id].fighter.body;
            let out = libm::hypot(body.x, body.y);
            assert!((22.0..33.0).contains(&out), "25 to 30 m out: {out:.1}");
            assert_eq!(room.foes[id].brain.target(), Some(ward), "coming at the ward");
            assert!(!room.quests.spoilless.contains(id), "never failed: its foes drop as any do");
        }
        for id in &standing {
            shoot_dead(&mut room, player, *id);
        }
        run(&mut room, 1);
    }
    assert!(met(&room, player, key), "the ward held: the goal met");
    assert!(room.quests.wards.is_empty() && !room.foes.contains_key(&ward), "its ward gone with it");
}

/// Ticks until the player's ward falls, standing them far off: how many.
fn left_to_fall(room: &mut Room, player: PlayerId) -> u32 {
    let ward = room.quests.wards.iter().next().copied().expect("its ward stands");
    stand_at(room, player, [0.0, 150.0]);
    let mut ticks = 0;
    while room.quests.wards.contains(&ward) && ticks < 60 * 300 {
        run(room, 1);
        ticks += 1;
    }
    ticks
}

#[test]
fn a_ward_left_alone_falls_and_is_tried_again_10_then_20_s_on_its_foes_then_dropping_nothing() {
    assert_eq!(
        [1, 2, 3, 4].map(|times| super::kinds::doubled(RETRY_TICKS, RETRY_MOST, times)),
        [600, 1200, 2400, 2400]
    );
    let (mut room, player, key, defend) = defence([0.0, 20.0]);
    run_baked(&mut room, 2);
    let ticks = left_to_fall(&mut room, player);
    eprintln!("a ward left alone falls in {:.0} s", f64::from(ticks) / 60.0);
    assert!((60 * 30..60 * 300).contains(&ticks), "the first wave alone fells it in {} s", ticks / 60);
    let seen = room.step_seen(player);
    assert_eq!((seen.fails, (seen.clock * 10.0).round()), (counted(key, 1), 100.0), "a failure, 10 s to wait");
    assert!(living(&room).is_empty(), "the waves leave");
    stand_at(&mut room, player, [0.0, 20.0]);
    run(&mut room, 590);
    assert!(room.quests.wards.is_empty(), "it waits");
    run(&mut room, 11);
    let first = foes_of(defend.waves[0].iter()).len();
    assert_eq!(
        (room.quests.wards.len(), living(&room).len()),
        (1, first + 1),
        "tried again: a ward and its first wave"
    );
    let standing = wave(&room, player);
    assert!(standing.iter().all(|id| room.quests.spoilless.contains(id)), "after a failure, its foes drop nothing");
    let drops = room.drops.len();
    for id in &standing {
        shoot_dead(&mut room, player, *id);
    }
    assert_eq!(room.drops.len(), drops, "nor did they");
    run(&mut room, 1);
    left_to_fall(&mut room, player);
    let seen = room.step_seen(player);
    assert_eq!((seen.fails, (seen.clock * 10.0).round()), (counted(key, 2), 200.0), "a second: 20 s to wait");
}

#[test]
fn a_wave_that_stands_nobody_counts_as_fallen_and_the_next_stands() {
    let (mut room, player, key, defend) = defence([0.0, 20.0]);
    let none = vec![("Nobody".to_owned(), "Minor".to_owned())];
    let goal = changed(gear_goal(key), |goal| {
        if let Goal::Defend(it) = goal {
            it.waves.insert(0, none.clone());
        }
    });
    let kind = Stepping::Defence(Defence::default());
    room.quests.steps.insert(player, Step { key, goal, fails: 0, kind });
    run_baked(&mut room, 1);
    assert_eq!(wave(&room, player).len(), foes_of(defend.waves[0].iter()).len(), "the wave after it stands");
    let goal = changed(gear_goal(key), |goal| {
        if let Goal::Defend(it) = goal {
            it.waves = vec![none.clone(), none];
        }
    });
    let (mut room, player, key, _) = defence([0.0, 20.0]);
    let kind = Stepping::Defence(Defence::default());
    room.quests.steps.insert(player, Step { key, goal, fails: 0, kind });
    run_baked(&mut room, 2);
    assert!(met(&room, player, key), "none stood: the goal met, not waiting forever");
}

fn gear_goal([quest, task, goal]: [usize; 3]) -> &'static GoalDef {
    &gear::quests::quests().quests[quest].tasks[task].goals[goal]
}

#[test]
fn a_ward_and_its_wave_and_an_ambush_stand_only_within_the_rooms_cap_on_foes() {
    let (mut room, _, _, defend) = defence([0.0, 20.0]);
    let first = foes_of(defend.waves[0].iter()).len();
    room.foes_most = first - 1;
    run(&mut room, 60);
    assert!(room.quests.wards.is_empty() && room.foes.is_empty(), "no room for its first wave: nothing stands");
    room.foes_most = first;
    run_baked(&mut room, 1);
    assert_eq!(room.quests.wards.len(), 1, "room for its first wave exactly: it stands");
    assert_eq!(room.living_foes(), first, "with that wave");
    let (key, goal) =
        step_of(GoalKind::Escort, |goal| matches!(goal, Goal::Escort(escort) if !escort.ambush.is_empty()));
    let Goal::Escort(escort) = &goal.goal else { unreachable!("an escort") };
    let places = [(escort.from.as_str(), [0.0, 10.0], 20.0), (escort.to.as_str(), [0.0, -10.0], 20.0)];
    let mut room = node_room(&escort.node, &places);
    let player = joined(&mut room, &on_goal(key), [0.0, 12.0]);
    riding(&mut room, player);
    room.foes_most = 1;
    run(&mut room, 600);
    let state = room.step_seen(player).figures[5] as u8;
    assert!(state != HELD && room.foes.is_empty(), "waiting halfway for room, never ambushed with none standing");
    let at = room.step_seen(player).figures[1..3].to_vec();
    run(&mut room, 60);
    assert_eq!(room.step_seen(player).figures[1..3], at, "and not walking on");
    room.foes_most = crate::NODE_FOES_MOST;
    run_baked(&mut room, 1);
    assert_eq!(living(&room).len(), foes_of(escort.ambush.iter()).len(), "room: it stands");
    assert_eq!(room.step_seen(player).figures[5] as u8, HELD, "and holds its figure");
}

#[test]
fn a_ward_and_its_wave_leave_a_public_events_kept_places_to_the_event() {
    let (mut room, _, _, defend) = defence([0.0, 20.0]);
    room.open_public("saltgrass-downs", crate::public::Grounds { fissure: None, raid: None }, None);
    let first = foes_of(defend.waves[0].iter()).len();
    room.foes_most = crate::public::EVENT_ROOM + first - 1;
    run(&mut room, 60);
    assert!(room.quests.wards.is_empty() && room.foes.is_empty(), "the event's kept places are not the road's");
    room.foes_most = crate::public::EVENT_ROOM + first;
    run_baked(&mut room, 1);
    assert_eq!(room.living_foes(), first, "room for its first wave beside them: it stands");
}

#[test]
fn two_players_on_one_defence_have_their_waves_stand_apart() {
    let (mut room, one, key, _) = defence([0.0, 20.0]);
    let two = joined(&mut room, &on_goal(key), [0.0, 21.0]);
    run_baked(&mut room, 2);
    let at = |id: &FighterId| [room.foes[id].fighter.body.x, room.foes[id].fighter.body.y];
    let (ones, twos) = (wave(&room, one), wave(&room, two));
    assert!(!ones.is_empty() && !twos.is_empty(), "each their own wave");
    let nearest = ones.iter().flat_map(|a| twos.iter().map(move |b| (a, b))).map(|(a, b)| apart(at(a), at(b)));
    let nearest = nearest.fold(f64::INFINITY, f64::min);
    assert!(nearest > 1.0, "never on each other's spots: {nearest:.2} m");
}

/// The file's first puzzle with an order of three points or more, a room of its node with its place at the middle,
/// and a player on it.
fn puzzle() -> (Room, PlayerId, [usize; 3], &'static Puzzle) {
    let (key, goal) = step_of(
        GoalKind::Puzzle,
        |goal| matches!(goal, Goal::Puzzle(it) if it.order.as_ref().is_some_and(|order| order.len() > 2)),
    );
    let Goal::Puzzle(puzzle) = &goal.goal else { unreachable!("a puzzle") };
    let mut room = node_room(&puzzle.node, &[(puzzle.place.as_str(), [0.0, 0.0], 30.0)]);
    let player = joined(&mut room, &on_goal(key), [0.0, 20.0]);
    run_baked(&mut room, 1);
    (room, player, key, puzzle)
}

/// A point used by a player standing on it: 0, else why not.
fn used(room: &mut Room, player: PlayerId, point: usize) -> u8 {
    let points = room.step_seen(player).points;
    stand_at(room, player, [points[point * 3], points[point * 3 + 1]]);
    room.answer(player, Asked::UsePoint { point: u8::try_from(point).unwrap_or(u8::MAX) });
    room.player(player).expect("in").answer
}

#[test]
fn a_puzzles_points_are_used_in_order_and_a_wrong_one_puts_them_out_and_stops_uses_2_4_then_8_s() {
    let (mut room, player, key, puzzle) = puzzle();
    let points = room.step_seen(player).points;
    for (at, point) in puzzle.points.iter().enumerate() {
        let wanted = ahead([0.0, 0.0], point.bearing.to_radians(), point.at);
        assert!(apart([points[at * 3], points[at * 3 + 1]], wanted) < 1.0, "{} where it is meant", point.name);
    }
    let order = puzzle.order.clone().expect("an order");
    assert_eq!(used(&mut room, player, order[0]), 0);
    assert_eq!(room.step_seen(player).points[order[0] * 3 + 2], 1.0, "lit");
    stand_at(&mut room, player, [0.0, 0.0]);
    room.answer(player, Asked::UsePoint { point: u8::try_from(order[1]).unwrap_or(0) });
    assert_eq!(room.player(player).expect("in").answer, OUT_OF_REACH, "from the middle");
    for (wrong, stopped) in [(order[2], 120), (order[1], 240), (order[1], 480)] {
        assert_eq!(used(&mut room, player, wrong), 0, "out of its turn");
        let lit = room.step_seen(player).points.chunks(3).filter(|point| point[2] == 1.0).count();
        let fails = room.step_seen(player).fails[key[2]];
        assert_eq!(lit, 0, "all put out: failure {fails}");
        run(&mut room, stopped - 1);
        assert_eq!(used(&mut room, player, order[0]), NOT_YET, "no use for {} s", stopped / 60);
        run(&mut room, 1);
    }
    assert_eq!(room.step_seen(player).fails, counted(key, 3));
    for point in order {
        assert_eq!(used(&mut room, player, point), 0);
    }
    assert!(met(&room, player, key), "all lit in order");
}

#[test]
fn a_puzzle_with_no_order_lights_its_points_in_any_and_one_lit_again_does_nothing() {
    let (mut room, player, key, puzzle) = puzzle();
    let goal = changed(gear_goal(key), |goal| {
        if let Goal::Puzzle(it) = goal {
            it.order = None;
        }
    });
    room.quests.steps.get_mut(&player).expect("its step").goal = goal;
    let last = puzzle.points.len() - 1;
    for point in (1..=last).rev() {
        assert_eq!(used(&mut room, player, point), 0);
        assert_eq!(used(&mut room, player, point), 0, "lit again: nothing");
        let lit = room.step_seen(player).points.chunks(3).filter(|point| point[2] == 1.0).count();
        assert_eq!((lit, room.step_seen(player).fails.clone()), (last + 1 - point, counted(key, 0)), "no failure");
    }
    assert_eq!(used(&mut room, player, 0), 0);
    assert!(met(&room, player, key), "all lit, last to first");
}

#[test]
fn a_puzzles_point_where_a_box_stands_is_nudged_onto_ground_a_player_stands_on() {
    let (key, goal) = step_of(GoalKind::Puzzle, |_| true);
    let Goal::Puzzle(puzzle) = &goal.goal else { unreachable!("a puzzle") };
    let meant = ahead([0.0, 0.0], puzzle.points[0].bearing.to_radians(), puzzle.points[0].at);
    let mut room = node_room(&puzzle.node, &[(puzzle.place.as_str(), [0.0, 0.0], 30.0)]);
    let (min_x, min_y, max_x, max_y) = (meant[0] - 2.0, meant[1] - 3.0, meant[0] + 2.0, meant[1] + 3.0);
    room.blocks = vec![movement::Block { min_x, min_y, max_x, max_y, top: 3.0, bottom: 0.0 }].into();
    let player = joined(&mut room, &on_goal(key), [0.0, 20.0]);
    run_baked(&mut room, 1);
    let points = room.step_seen(player).points;
    let first = [points[0], points[1]];
    let clear = !(min_x - 0.4..max_x + 0.4).contains(&first[0]) || !(min_y - 0.4..max_y + 0.4).contains(&first[1]);
    assert!(clear && apart(first, meant) < 6.0, "off the box, near where it was meant: {first:?}");
}

#[test]
fn a_places_mesh_is_the_nodes_own_where_its_square_holds_it_else_baked_a_slice_a_tick_and_kept() {
    let mut room = node_room("elsewhere", &[]);
    let square = room.quests.square.expect("the node's square");
    let middle = [(square.min_x + square.max_x) / 2.0, (square.min_y + square.max_y) / 2.0];
    let place = |name: &str, at: [f64; 2]| Place { name: name.to_owned(), at, radius: 30.0 };
    let (home, east) = (place("Home", middle), place("East", [150.0, 0.0]));
    assert_eq!(room.ground_of(&home, 30.0), Some(0), "the node's own: its square holds all 30 m round the place");
    assert_eq!(room.ground_of(&home, 40.0), None, "not all 40 m round it: one round the place begun");
    assert_eq!(room.ground_of(&home, 40.0), None, "no second slice this tick");
    // The bake under way goes on whichever place asks, and East waits its turn till it is whole.
    let mut slices = 1;
    loop {
        room.clock += 1;
        slices += 1;
        if room.place_grounds() == 1 {
            break;
        }
        assert_eq!(room.ground_of(&east, 30.0), None, "East waits while Home's is baked");
    }
    assert!(slices > 3, "Home's baked over {slices} ticks, not in one");
    assert_eq!(room.ground_of(&home, 40.0), Some(1), "kept");
    assert_eq!(baked_ground(&mut room, &east, 30.0), 2);
    assert_eq!(room.ground_of(&home, 40.0), Some(1), "still kept");
    // A place named as another but standing elsewhere is not stood on the other's mesh.
    let twin = place("East", [-150.0, 0.0]);
    assert_eq!(baked_ground(&mut room, &twin, 30.0), 3, "a mesh round it, not East's");
    assert_eq!(room.place_grounds(), 3);
}

#[test]
fn a_puzzles_points_are_checked_within_the_square_its_places_mesh_is_baked_over() {
    assert_eq!(gear::quests::PLACE_SQUARE, crate::garrison::NODE_AROUND);
}

#[test]
fn a_defence_rejoined_stands_the_waves_already_fought_dropping_nothing_and_the_rest_as_any() {
    let (mut room, player, _, defend) = defence([0.0, 20.0]);
    run_baked(&mut room, 2);
    let first = wave(&room, player);
    assert!(!first.is_empty() && first.iter().all(|id| !room.quests.spoilless.contains(id)), "its first wave drops");
    let kept = gear::Character::from_json(&room.kept_character(player).expect("kept")).expect("a character");
    room.leave(player);
    run(&mut room, 2);
    let back = joined(&mut room, &kept, [0.0, 20.0]);
    run(&mut room, 2);
    let again = wave(&room, back);
    assert!(!again.is_empty() && again.iter().all(|id| room.quests.spoilless.contains(id)), "fought before: nothing");
    if defend.waves.len() > 1 {
        for id in &again {
            shoot_dead(&mut room, back, *id);
        }
        run(&mut room, 2);
        let next = wave(&room, back);
        assert!(next.iter().all(|id| !room.quests.spoilless.contains(id)), "a wave not fought before drops as any");
    }
}

#[test]
fn an_escorts_ambush_fought_before_a_rejoin_drops_nothing_again_as_a_defences_wave() {
    let (key, goal) =
        step_of(GoalKind::Escort, |goal| matches!(goal, Goal::Escort(escort) if !escort.ambush.is_empty()));
    let Goal::Escort(escort) = &goal.goal else { unreachable!("an escort") };
    let places = [(escort.from.as_str(), [0.0, 10.0], 20.0), (escort.to.as_str(), [0.0, -10.0], 20.0)];
    let mut room = node_room(&escort.node, &places);
    let player = joined(&mut room, &on_goal(key), [0.0, 12.0]);
    riding(&mut room, player);
    let ambush = |room: &mut Room| {
        for _ in 0..1200 {
            if !living(room).is_empty() {
                break;
            }
            run(room, 1);
        }
        living(room)
    };
    let first = ambush(&mut room);
    assert!(!first.is_empty() && first.iter().all(|id| !room.quests.spoilless.contains(id)), "its first ambush drops");
    let kept = gear::Character::from_json(&room.kept_character(player).expect("kept")).expect("a character");
    room.leave(player);
    run(&mut room, 2);
    let back = joined(&mut room, &kept, [0.0, 12.0]);
    riding(&mut room, back);
    let again = ambush(&mut room);
    assert!(!again.is_empty() && again.iter().all(|id| room.quests.spoilless.contains(id)), "fought before: nothing");
    assert!(room.player(back).is_some());
}
