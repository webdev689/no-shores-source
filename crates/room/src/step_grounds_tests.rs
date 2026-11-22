//! Every road's steps on its node as the bake lays it: each escort's and tail's way along the paths, inside its
//! section and over ground a body walks, the figure arriving with the player keeping up; each race's way between its
//! checkpoints inside its section, over ground a body walks and past no box, run within its clock with a tenth to
//! spare at a run, and what it takes at a run and at a gallop (printed); each puzzle's points on ground the player
//! reaches from its place; and each defence's waves standing in full and coming at the ward.

use super::*;
use crate::asks::Asked;
use crate::quests::quest_grounds_tests::{first_landmass, opened};
use crate::quests::quests_tests::{every_goal, on_goal};
use gear::quests::{GoalKind, Place};

/// Every road's step of a kind: its quest, task and place in the task, and its goal.
fn steps_of(kind: GoalKind) -> Vec<([usize; 3], &'static GoalDef)> {
    let found: Vec<([usize; 3], &'static GoalDef)> = every_goal().filter(|(_, goal)| goal.kind() == kind).collect();
    assert!(!found.is_empty(), "a road takes a {kind:?}");
    found
}

fn node_of(goal: &GoalDef) -> &'static bake::NodeFile {
    let id = goal.goal.node().unwrap_or_default();
    first_landmass().iter().find(|node| node.id == id).unwrap_or_else(|| panic!("{id} is baked"))
}

fn place_of(node: &bake::NodeFile, name: &str) -> Place {
    let found = node.places.iter().find(|place| place.name == name);
    let found = found.unwrap_or_else(|| panic!("{name} is a place of {}", node.id));
    Place { name: found.name.clone(), at: found.at, radius: found.radius }
}

/// A room of a step's node with a player on its task, standing at a point.
fn on_step(node: &bake::NodeFile, key: [usize; 3], at: [f64; 2]) -> (Room, PlayerId) {
    let mut room = opened(node);
    let player = room.join().expect("a room with space");
    assert!(room.restore_character(player, &on_goal(key).to_json()));
    assert!(room.put_player(player, at[0], at[1]));
    (room, player)
}

#[test]
fn every_escorts_and_tails_way_runs_the_paths_inside_its_section_over_walkable_ground_and_its_figure_arrives() {
    for (key, goal) in steps_of(GoalKind::Escort).into_iter().chain(steps_of(GoalKind::Tail)) {
        let node = node_of(goal);
        let ((from, to), gap) = match &goal.goal {
            Goal::Escort(escort) => ((&escort.from, &escort.to), 8.0),
            Goal::Tail(tail) => ((&tail.from, &tail.to), (tail.far + tail.near) / 2.0),
            _ => unreachable!("a figure's step"),
        };
        let (from, to) = (place_of(node, from), place_of(node, to));
        let way = way_between(&node.paths, &from, &to);
        assert!(way.len() > 2, "{}: the paths join {} and {}", goal.text, from.name, to.name);
        let length = walkable(node, &way, &goal.text, &[]);
        let behind = |at: [f64; 2], facing: f64| ahead(at, facing + core::f64::consts::PI, gap);
        let (_, facing) = along_way(&way, 0.0);
        let (mut room, player) = on_step(node, key, behind(from.at, facing));
        let most = (length / FIGURE_PACE * 1.5) as u32 * 60 + 600;
        let mut ticks = 0;
        while ticks < most && room.player(player).expect("in").character.quest_now() == Some((key[0], key[1])) {
            run_once(&mut room);
            ticks += 1;
            let Some(Step { kind: Stepping::Figure(figure), .. }) = room.quests.steps.get(&player) else { continue };
            let (at, facing, ambush) = ([figure.at[0], figure.at[1]], figure.facing, figure.ambush.clone());
            for id in ambush.unwrap_or_default() {
                room.foes.remove(&id);
            }
            let [x, y] = behind(at, facing);
            assert!(room.put_player(player, x, y));
        }
        assert!(met(&room, player, key), "{}: arrived in {} s of {length:.0} m", goal.text, ticks / 60);
        eprintln!(
            "{}: {} to {}, {length:.0} m along the paths, arrived in {} s",
            goal.text,
            from.name,
            to.name,
            ticks / 60
        );
    }
}

/// A way's length, each 2 m of it asserted inside its node's section, on a grade a body walks, and clear of every box
/// that stands in a body's way as it walks there (a top over a step above its feet, an underside below its head); but
/// within the reach of a place `past`, which the walk need not enter.
fn walkable(node: &bake::NodeFile, way: &[[f64; 2]], text: &str, past: &[&Place]) -> f64 {
    let length = way_length(way);
    let floor = crate::Floor::Land(Box::new(node.ground.clone()));
    let boxes: Vec<movement::Block> = node.boxes.iter().map(movement::Block::from_floats).collect();
    let tuning = movement::TUNING;
    let start = along_way(way, 0.0).0;
    let mut feet = movement::blocks::ground_at(&boxes, &floor, start[0], start[1], floor.height_at(start[0], start[1]));
    for step in 0..=(length / 2.0) as u32 {
        let [x, y] = along_way(way, f64::from(step) * 2.0).0;
        assert!(reach::inside(&node.ring, x, y), "{text}: inside its section at {x:.0}, {y:.0}");
        let ground = movement::blocks::ground_at(&boxes, &floor, x, y, feet);
        let grade = (ground - feet).abs() / 2.0;
        feet = ground;
        if past.iter().any(|place| place.holds([x, y], 0.0)) {
            continue;
        }
        assert!(grade < 1.0, "{text}: a grade of {grade:.2} at {x:.0}, {y:.0}");
        let blocked = movement::blocks::blocking_at(&boxes, x, y, feet, tuning.height);
        assert!(blocked.is_none(), "{text}: a box across its way at {x:.0}, {y:.0}: {blocked:?}");
    }
    length
}

/// Whether a player's step's goal is met: its task done, or its count there full.
fn met(room: &Room, player: PlayerId, [quest, task, goal]: [usize; 3]) -> bool {
    let character = &room.player(player).expect("in").character;
    character.quest_now() != Some((quest, task)) || character.quest_counts()[goal] >= 1
}

fn run_once(room: &mut Room) {
    room.tick();
}

/// A walk over the ground as a body walks it, on 2 m cells within `ROUND` of the points `around`, inside the node's
/// section, up no steeper than a body climbs, down any, never where a box stands in a body's way: from any cell the
/// first mark holds, through a cell each next mark holds in turn, each step costing its length and the `toll` where it
/// ends. Its cells, and how far along it each mark after the first was reached; none if no walk does.
fn ground_walk(
    node: &bake::NodeFile,
    around: &[[f64; 2]],
    marks: &[&dyn Fn([f64; 2]) -> bool],
    toll: &dyn Fn([f64; 2]) -> f64,
) -> Option<(Vec<[f64; 2]>, Vec<f64>)> {
    use core::cmp::Reverse;
    const CELL: f64 = 2.0;
    const ROUND: f64 = 300.0;
    let (tuning, floor) = (movement::TUNING, crate::Floor::Land(Box::new(node.ground.clone())));
    let bounds = |axis: usize| {
        let along = around.iter().map(|point| point[axis]);
        (along.clone().fold(f64::INFINITY, f64::min) - ROUND, along.fold(f64::NEG_INFINITY, f64::max) + ROUND)
    };
    let ((min_x, max_x), (min_y, max_y)) = (bounds(0), bounds(1));
    let (wide, high) = (((max_x - min_x) / CELL) as usize + 1, ((max_y - min_y) / CELL) as usize + 1);
    let cells = wide * high;
    let at = |cell: usize| [min_x + (cell % wide) as f64 * CELL, min_y + (cell / wide) as f64 * CELL];
    let ground: Vec<f64> = (0..cells).map(|cell| floor.height_at(at(cell)[0], at(cell)[1])).collect();
    let mut open: Vec<bool> = (0..cells).map(|cell| reach::inside(&node.ring, at(cell)[0], at(cell)[1])).collect();
    for block in node.boxes.iter().map(movement::Block::from_floats) {
        let span = |low: f64, high: f64, from: f64, most: usize| {
            let first = ((low - tuning.radius - from) / CELL).ceil().max(0.0) as usize;
            let last = ((high + tuning.radius - from) / CELL).floor().min(most as f64 - 1.0);
            (last >= 0.0).then_some(first..=last as usize)
        };
        let (Some(columns), Some(rows)) =
            (span(block.min_x, block.max_x, min_x, wide), span(block.min_y, block.max_y, min_y, high))
        else {
            continue;
        };
        for cell in rows.flat_map(|row| columns.clone().map(move |column| row * wide + column)) {
            open[cell] &= !(block.top > ground[cell] + tuning.step && block.bottom - tuning.height < ground[cell]);
        }
    }
    // A state is a cell and the mark to reach next.
    let stages = marks.len();
    let (mut cost, mut came) = (vec![f64::INFINITY; stages * cells], vec![usize::MAX; stages * cells]);
    let mut heap = std::collections::BinaryHeap::new();
    for cell in (0..cells).filter(|cell| open[*cell] && marks[0](at(*cell))) {
        cost[cells + cell] = 0.0;
        heap.push(Reverse((0_u64, cells + cell)));
    }
    while let Some(Reverse((bits, here))) = heap.pop() {
        let (stage, cell) = (here / cells, here % cells);
        if f64::from_bits(bits) > cost[here] {
            continue;
        }
        let mut next = Vec::new();
        if marks[stage](at(cell)) {
            if stage + 1 == stages {
                return Some(walked_back(&came, here, cells, at));
            }
            next.push((here + cells, 0.0));
        }
        let (column, row) = ((cell % wide) as i64, (cell / wide) as i64);
        for (east, south) in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)] {
            let (to_column, to_row) = (column + east, row + south);
            if to_column < 0 || to_row < 0 || to_column >= wide as i64 || to_row >= high as i64 {
                continue;
            }
            let there = to_row as usize * wide + to_column as usize;
            let step = CELL * libm::hypot(f64::from(east as i32), f64::from(south as i32));
            if open[there] && ground[there] - ground[cell] <= tuning.slope * step {
                next.push((stage * cells + there, step + toll(at(there))));
            }
        }
        for (there, step) in next {
            if cost[here] + step < cost[there] {
                (cost[there], came[there]) = (cost[here] + step, here);
                heap.push(Reverse(((cost[here] + step).to_bits(), there)));
            }
        }
    }
    None
}

/// A run over the ground between a race's checkpoints as a body runs it, from the first's reach, through each between, to
/// entering the last's; and how far along it each after the first was entered.
fn race_run(node: &bake::NodeFile, checkpoints: &[Place]) -> Option<(Vec<[f64; 2]>, Vec<f64>)> {
    let marks: Vec<Box<dyn Fn([f64; 2]) -> bool + '_>> = checkpoints
        .iter()
        .map(|place| Box::new(move |at| place.holds(at, 0.0)) as Box<dyn Fn([f64; 2]) -> bool>)
        .collect();
    let marks: Vec<&dyn Fn([f64; 2]) -> bool> = marks.iter().map(|mark| mark.as_ref()).collect();
    let around: Vec<[f64; 2]> = checkpoints.iter().map(|place| place.at).collect();
    ground_walk(node, &around, &marks, &|_| 0.0)
}

/// The run that came to a state, from its start, and how far along it each checkpoint after the first was entered.
fn walked_back(came: &[usize], end: usize, cells: usize, at: impl Fn(usize) -> [f64; 2]) -> (Vec<[f64; 2]>, Vec<f64>) {
    let mut states = vec![end];
    while let Some(&before) = states.last().map(|state| &came[*state]).filter(|before| **before != usize::MAX) {
        states.push(before);
    }
    states.reverse();
    let (mut run, mut entered, mut along) = (vec![at(states[0] % cells)], Vec::new(), 0.0);
    for pair in states.windows(2) {
        let (from, to) = (at(pair[0] % cells), at(pair[1] % cells));
        along += apart(from, to);
        if pair[1] / cells > pair[0] / cells {
            entered.push(along);
        } else {
            run.push(to);
        }
    }
    entered.push(along);
    (run, entered)
}

#[test]
fn every_race_is_run_over_the_ground_with_a_tenth_of_its_clock_to_spare_and_met_by_a_player_running_it() {
    for (key, goal) in steps_of(GoalKind::Race) {
        let Goal::Race(race) = &goal.goal else { unreachable!("a race") };
        let node = node_of(goal);
        let checkpoints: Vec<Place> = race.checkpoints.iter().map(|name| place_of(node, name)).collect();
        let found = race_run(node, &checkpoints);
        let (run, entered) =
            found.unwrap_or_else(|| panic!("{}: a body runs from each checkpoint to the next", goal.text));
        for (place, metres) in checkpoints[1..].iter().zip(&entered) {
            eprintln!("{}: {} entered {metres:.0} m on", goal.text, place.name);
        }
        let raced = entered.last().copied().unwrap_or_default();
        let (running, galloping) = (raced / movement::TUNING.run, raced / movement::TUNING.ride_gallop);
        eprintln!(
            "{}: {raced:.0} m over the ground from {}'s reach: {running:.0} s at a run ({} m/s), {galloping:.0} s at a gallop, of {} s",
            goal.text,
            checkpoints[0].name,
            movement::TUNING.run,
            race.seconds
        );
        assert!(running <= race.seconds * 0.9, "{}: a run beats its clock with a tenth to spare", goal.text);
        let pace = raced / (race.seconds * 0.9);
        let (mut room, player) = on_step(node, key, run[0]);
        run_once(&mut room);
        let mut along = 0.0;
        // A step past its end stands on it, where its last checkpoint's reach is entered.
        while along <= way_length(&run) + pace * movement::TICK_SECONDS && !met(&room, player, key) {
            let [x, y] = along_way(&run, along).0;
            assert!(room.put_player(player, x, y), "{}: a body stands at {x:.0}, {y:.0}", goal.text);
            run_once(&mut room);
            along += pace * movement::TICK_SECONDS;
        }
        let seen = room.step_seen(player);
        let left =
            (seen.fails, seen.clock, room.quest_at(player), room.fighter(player).map(|it| [it.body.x, it.body.y]));
        assert!(met(&room, player, key), "{}: met at {pace:.1} m/s in {} s: {left:?}", goal.text, race.seconds);
    }
}

#[test]
fn every_puzzles_points_stand_on_ground_the_player_reaches_from_its_place_and_are_used_in_order() {
    for (key, goal) in steps_of(GoalKind::Puzzle) {
        let Goal::Puzzle(puzzle) = &goal.goal else { unreachable!("a puzzle") };
        let node = node_of(goal);
        let place = place_of(node, &puzzle.place);
        let (mut room, player) = on_step(node, key, place.at);
        run_once(&mut room);
        run_once(&mut room);
        let points = room.step_seen(player).points;
        let reach = puzzle.points.iter().map(|point| point.at + POINT_NUDGE).fold(0.0, f64::max);
        let ground = room.ground_of(&place, reach).expect("its place's mesh");
        let mesh = room.mesh_by(ground);
        let middle = crate::quests::held_near(mesh, &room.floor, place.at, place.radius).expect("its place's ground");
        for (at, point) in points.chunks(3).enumerate() {
            let floor = room.floor.height_at(point[0], point[1]);
            let near = mesh.nearest_point([point[0], point[1], floor]).expect("on the mesh");
            assert!(apart([near[0], near[1]], [point[0], point[1]]) < 0.5, "{}: point {at} on its ground", goal.text);
            let path = mesh.find_path(middle, near);
            assert!(path.is_some(), "{}: point {at} reached from its place", goal.text);
            let meant = ahead(place.at, puzzle.points[at].bearing.to_radians(), puzzle.points[at].at);
            let walked: f64 = path
                .unwrap_or_default()
                .windows(2)
                .map(|leg| apart([leg[0][0], leg[0][1]], [leg[1][0], leg[1][1]]))
                .sum();
            let nudged = apart(meant, [point[0], point[1]]);
            eprintln!(
                "{}: {} {nudged:.1} m from where meant, {walked:.0} m walk from its place",
                goal.text, puzzle.points[at].name
            );
        }
        let order = puzzle.order.clone().unwrap_or_else(|| (0..puzzle.points.len()).collect());
        for point in order {
            assert!(room.put_player(player, points[point * 3], points[point * 3 + 1]));
            run_once(&mut room);
            room.answer(player, Asked::UsePoint { point: u8::try_from(point).unwrap_or(u8::MAX) });
            assert_eq!(room.player(player).expect("in").answer, 0, "{}: point {point} used", goal.text);
        }
        assert!(met(&room, player, key), "{}: met", goal.text);
    }
}

#[test]
fn every_defences_waves_stand_in_full_and_come_at_its_ward() {
    for (key, goal) in steps_of(GoalKind::Defend) {
        let Goal::Defend(defend) = &goal.goal else { unreachable!("a defence") };
        let node = node_of(goal);
        let place = place_of(node, &defend.place);
        let (mut room, player) = on_step(node, key, place.at);
        run_once(&mut room);
        run_once(&mut room);
        for (wave, members) in defend.waves.iter().enumerate() {
            let Some(Step { kind: Stepping::Defence(defence), .. }) = room.quests.steps.get(&player) else {
                panic!("{}: its defence runs", goal.text)
            };
            let (ward, standing) = (defence.ward.expect("its ward stands"), defence.standing.clone());
            assert_eq!(standing.len(), members.len(), "{}: wave {wave} stands in full", goal.text);
            assert!(!standing.is_empty(), "{}: wave {wave} stands", goal.text);
            let mut came = false;
            let mut ticks = 0;
            for _ in 0..60 * 60 {
                ticks += 1;
                run_once(&mut room);
                let ward_at = room.foes[&ward].fighter.body;
                let hurt = room.foes[&ward].fighter.health < room.foes[&ward].fighter.health_max;
                let near = standing
                    .iter()
                    .filter_map(|id| room.foes.get(id))
                    .any(|foe| apart([foe.fighter.body.x, foe.fighter.body.y], [ward_at.x, ward_at.y]) < 3.0);
                if hurt || near {
                    came = true;
                    break;
                }
            }
            assert!(came, "{}: wave {wave} comes at the ward", goal.text);
            eprintln!(
                "{}: wave {wave}, {} foes, at the ward in {:.1} s",
                goal.text,
                standing.len(),
                f64::from(ticks) / 60.0
            );
            for id in &standing {
                room.foes.remove(id);
            }
            run_once(&mut room);
        }
        assert!(met(&room, player, key), "{}: its last wave fallen, it is met", goal.text);
    }
}

/// Where a walk at a body's walking pace along a way to an unseen step's middle ends: `Ok` met unseen, this far from the
/// middle; `Err` seen, this far; none where no body stands on the way.
fn walked_in(node: &bake::NodeFile, key: [usize; 3], place: &Place, way: &[[f64; 2]]) -> Option<Result<f64, f64>> {
    let (mut room, player) = on_step_where(node, key, way[0])?;
    for _ in 0..3 {
        run_once(&mut room);
    }
    let (step, mut along) = (movement::TUNING.walk * movement::TICK_SECONDS, 0.0);
    while along <= way_length(way) + step {
        let at = along_way(way, along).0;
        if !room.put_player(player, at[0], at[1]) {
            return None;
        }
        run_once(&mut room);
        if room.step_seen(player).fails.get(key[2]).is_some_and(|fails| *fails > 0) {
            return Some(Err(apart(at, place.at)));
        }
        if met(&room, player, key) {
            return Some(Ok(apart(at, place.at)));
        }
        along += step;
    }
    None
}

/// A room of a step's node with a player on its task, standing at a point, if a body stands there.
fn on_step_where(node: &bake::NodeFile, key: [usize; 3], at: [f64; 2]) -> Option<(Room, PlayerId)> {
    let mut room = opened(node);
    let player = room.join().expect("a room with space");
    assert!(room.restore_character(player, &on_goal(key).to_json()));
    room.put_player(player, at[0], at[1]).then_some((room, player))
}

#[test]
fn every_unseen_steps_watch_faces_out_round_its_middle_so_a_walk_round_their_sight_is_unseen_and_one_at_them_seen() {
    for (key, goal) in steps_of(GoalKind::Unseen) {
        let Goal::Unseen(unseen) = &goal.goal else { unreachable!("an unseen step") };
        let node = node_of(goal);
        let place = place_of(node, &unseen.place);
        let (mut room, _) = on_step(node, key, node.spawns.first().copied().expect("a spawn"));
        for _ in 0..3 {
            run_once(&mut room);
        }
        let watching = room.quests.steps.values().flat_map(|step| match &step.kind {
            Stepping::Unseen(Watched { watchers: Some(ids), .. }) => {
                ids.iter().filter_map(|id| room.foes.get(id)).collect()
            }
            _ => Vec::new(),
        });
        // Each watcher: where it stands, where it looks, and how far it sees.
        let mut watch: Vec<([f64; 2], f64, f64)> = Vec::new();
        for foe in watching {
            let at = [foe.fighter.body.x, foe.fighter.body.y];
            let bearing = libm::atan2(at[0] - place.at[0], place.at[1] - at[1]);
            let off = libm::remainder(foe.fighter.aim - bearing, core::f64::consts::TAU).to_degrees();
            let sees =
                if foe.brain.numbers().shooter { ::foes::tuning::SHOOT_RANGE } else { ::foes::tuning::ENGAGE_RANGE };
            let (name, out) = (foe.brain.foe_type.name, apart(at, place.at));
            eprintln!(
                "{}: a {name} watches {out:.1} m out at {:.0}°, facing {off:.0}° off outward",
                goal.text,
                bearing.to_degrees().rem_euclid(360.0)
            );
            assert_eq!(foe.brain.alertness(), ::foes::Alertness::Idle, "{}: its watch idle", goal.text);
            watch.push((at, foe.fighter.aim, sees));
        }
        assert_eq!(watch.len(), crate::quests::foes_of(unseen.spawn.iter()).len(), "{}: its watch stands", goal.text);
        let within = |at: [f64; 2]| apart(at, place.at) <= unseen.within;
        let said = |came: Option<Result<f64, f64>>| match came {
            Some(Ok(out)) => format!("met unseen {out:.0} m from the middle"),
            Some(Err(out)) => format!("seen {out:.0} m from the middle"),
            None => "no ground to walk in on".to_owned(),
        };
        // Careless: the shortest walk in from 16 m before a watcher.
        let mut seen = 0;
        for (at, aim, _) in &watch {
            let start = ahead(*at, *aim, 16.0);
            let near = |cell: [f64; 2]| apart(cell, start) <= 3.0;
            let Some((way, reached)) = ground_walk(node, &[place.at], &[&near, &within], &|_| 0.0) else { continue };
            let came = walked_in(node, key, &place, &way);
            eprintln!("{}: walking {:.0} m in from before a watcher, {}", goal.text, reached[0], said(came));
            seen += usize::from(matches!(came, Some(Err(_))));
        }
        // Careful: the walk in from 25 to 30 m off that keeps out of every watcher's sight that it can.
        let ring = |cell: [f64; 2]| (unseen.within + 25.0..=unseen.within + 30.0).contains(&apart(cell, place.at));
        let watched = |cell: [f64; 2]| {
            let sees = |(at, aim, range): &([f64; 2], f64, f64)| {
                let off = libm::fabs(libm::remainder(combat::sight::bearing(*at, cell) - aim, core::f64::consts::TAU));
                apart(*at, cell) <= *range && off <= core::f64::consts::FRAC_PI_2
            };
            if watch.iter().any(sees) { 100.0 } else { 0.0 }
        };
        let careful = ground_walk(node, &[place.at], &[&ring, &within], &watched);
        let (way, reached) = careful.unwrap_or_else(|| panic!("{}: a walk in", goal.text));
        let came = walked_in(node, key, &place, &way);
        eprintln!("{}: walking {:.0} m in round the watch's sight, {}", goal.text, reached[0], said(came));
        assert!(seen > 0, "{}: walking in at a watcher, seen", goal.text);
        assert!(matches!(came, Some(Ok(_))), "{}: walking in round their sight, unseen", goal.text);
    }
}
