//! Every road's steps on its node as the bake lays it: each escort's and tail's way along the paths, inside its
//! section and over ground a body walks, the figure arriving with the player keeping up; each race's checkpoints
//! passed along the paths in time, and what it takes at a run and at a gallop (printed); each puzzle's points on ground
//! the player reaches from its place; and each defence's waves standing in full and coming at the ward.

use super::*;
use crate::asks::Asked;
use crate::quests::quest_grounds_tests::{first_landmass, opened};
use gear::Character;
use gear::quests::{GoalKind, Place, quests};

/// Every road's step of a kind: its quest's and task's places in the file, and its goal.
fn steps_of(kind: GoalKind) -> Vec<(usize, usize, &'static GoalDef)> {
    let mut found = Vec::new();
    for (quest, def) in quests().quests.iter().enumerate() {
        for (task, at) in def.tasks.iter().enumerate() {
            found.extend(at.goals.iter().filter(|goal| goal.kind == kind).map(|goal| (quest, task, goal)));
        }
    }
    assert!(!found.is_empty(), "a road takes a {kind:?}");
    found
}

fn node_of(goal: &GoalDef) -> &'static bake::NodeFile {
    let id = goal.node.as_deref().unwrap_or_default();
    first_landmass().iter().find(|node| node.id == id).unwrap_or_else(|| panic!("{id} is baked"))
}

fn place_of(node: &bake::NodeFile, name: &str) -> Place {
    let found = node.places.iter().find(|place| place.name == name);
    let found = found.unwrap_or_else(|| panic!("{name} is a place of {}", node.id));
    Place { name: found.name.clone(), at: found.at, radius: found.radius }
}

/// A room of a step's node with a player on its task, standing at a point.
fn on_step(node: &bake::NodeFile, quest: usize, task: usize, at: [f64; 2]) -> (Room, PlayerId) {
    let mut room = opened(node);
    let mut character = Character::starting();
    character.allegiance.pledge = quests().quests[quest].faction;
    character.quests.set_task(quest, task);
    let player = room.join().expect("a room with space");
    assert!(room.restore_character(player, &character.to_json()));
    assert!(room.put_player(player, at[0], at[1]));
    (room, player)
}

#[test]
fn every_escorts_and_tails_way_runs_the_paths_inside_its_section_over_walkable_ground_and_its_figure_arrives() {
    for (quest, task, goal) in steps_of(GoalKind::Escort).into_iter().chain(steps_of(GoalKind::Tail)) {
        let node = node_of(goal);
        let (from, to) = (
            place_of(node, goal.from.as_deref().unwrap_or_default()),
            place_of(node, goal.to.as_deref().unwrap_or_default()),
        );
        let way = way_between(&node.paths, &from, &to);
        assert!(way.len() > 2, "{}: the paths join {} and {}", goal.text, from.name, to.name);
        let length = way_length(&way);
        let floor = crate::Floor::Land(Box::new(node.ground.clone()));
        for step in 0..=(length / 2.0) as u32 {
            let [x, y] = along_way(&way, f64::from(step) * 2.0).0;
            let [ahead_x, ahead_y] = along_way(&way, f64::from(step) * 2.0 + 2.0).0;
            assert!(reach::inside(&node.ring, x, y), "{}: inside its section at {x:.0}, {y:.0}", goal.text);
            let grade = (floor.height_at(ahead_x, ahead_y) - floor.height_at(x, y)).abs() / 2.0;
            assert!(grade < 1.0, "{}: a grade of {grade:.2} at {x:.0}, {y:.0}", goal.text);
        }
        let gap = if goal.kind == GoalKind::Tail { 20.0 } else { 8.0 };
        let behind = |at: [f64; 2], facing: f64| ahead(at, facing + core::f64::consts::PI, gap);
        let (_, facing) = along_way(&way, 0.0);
        let (mut room, player) = on_step(node, quest, task, behind(from.at, facing));
        let most = (length / FIGURE_PACE * 1.5) as u32 * 60 + 600;
        let mut ticks = 0;
        while ticks < most && room.player(player).expect("in").character.quest_now() == Some((quest, task)) {
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
        assert!(met(&room, player, quest, task, goal), "{}: arrived in {} s of {length:.0} m", goal.text, ticks / 60);
    }
}

/// Whether a player's step's goal is met: its task done, or its count there full.
fn met(room: &Room, player: PlayerId, quest: usize, task: usize, goal: &GoalDef) -> bool {
    let character = &room.player(player).expect("in").character;
    let goals = &quests().quests[quest].tasks[task].goals;
    let counted = character.quest_counts().iter().zip(goals).any(|(count, it)| std::ptr::eq(it, goal) && *count == 1);
    character.quest_now() != Some((quest, task)) || counted
}

fn run_once(room: &mut Room) {
    room.tick();
}

/// How far along a way a player passes a race's checkpoints, in order, from entering the first's reach to entering
/// the last's: none if the way misses one.
fn race_length(way: &[[f64; 2]], checkpoints: &[Place]) -> Option<f64> {
    let (length, mut along, mut next, mut started) = (way_length(way), 0.0, 0, None);
    while along <= length && next < checkpoints.len() {
        if checkpoints[next].holds(along_way(way, along).0, 0.0) {
            started = started.or(Some(along));
            next += 1;
            continue;
        }
        along += 0.25;
    }
    (next == checkpoints.len()).then(|| along - started.unwrap_or(along))
}

#[test]
fn every_race_passes_its_checkpoints_along_the_paths_and_is_met_by_a_player_there_in_time() {
    for (quest, task, goal) in steps_of(GoalKind::Race) {
        let node = node_of(goal);
        let checkpoints: Vec<Place> = goal.checkpoints.iter().map(|name| place_of(node, name)).collect();
        let way: Vec<[f64; 2]> =
            checkpoints.windows(2).flat_map(|pair| way_between(&node.paths, &pair[0], &pair[1])).collect();
        let seconds = goal.seconds.unwrap_or(0.0);
        let raced = race_length(&way, &checkpoints).expect("the way passes every checkpoint");
        let (running, galloping) = (raced / movement::TUNING.run, raced / movement::TUNING.ride_gallop);
        eprintln!(
            "{}: {raced:.0} m between its checkpoints' reaches: {running:.0} s at a run, {galloping:.0} s at a gallop, of {seconds} s",
            goal.text
        );
        // The pace that runs it with a tenth of its clock to spare: what a body needs is the report's.
        let pace = raced / (seconds * 0.9);
        let (mut room, player) = on_step(node, quest, task, checkpoints[0].at);
        let mut along = 0.0;
        while along <= way_length(&way) && room.player(player).expect("in").character.quest_counts()[0] == 0 {
            let [x, y] = along_way(&way, along).0;
            assert!(room.put_player(player, x, y));
            run_once(&mut room);
            along += pace * movement::TICK_SECONDS;
        }
        let counts = room.player(player).expect("in").character.quest_counts();
        assert_eq!(counts[0], 1, "{}: met at {pace:.1} m/s in {seconds} s", goal.text);
    }
}

#[test]
fn every_puzzles_points_stand_on_ground_the_player_reaches_from_its_place_and_are_used_in_order() {
    for (quest, task, goal) in steps_of(GoalKind::Puzzle) {
        let node = node_of(goal);
        let place = place_of(node, goal.place.as_deref().unwrap_or_default());
        let (mut room, player) = on_step(node, quest, task, place.at);
        run_once(&mut room);
        let points = room.step_seen(player).points;
        let ground = room.ground_of(&place);
        let mesh = &room.quests.grounds[ground].2;
        let middle = crate::quests::held_near(mesh, &room.floor, place.at, place.radius).expect("its place's ground");
        for (at, point) in points.chunks(3).enumerate() {
            let floor = room.floor.height_at(point[0], point[1]);
            let near = mesh.nearest_point([point[0], point[1], floor]).expect("on the mesh");
            assert!(apart([near[0], near[1]], [point[0], point[1]]) < 0.5, "{}: point {at} on its ground", goal.text);
            assert!(mesh.find_path(middle, near).is_some(), "{}: point {at} reached from its place", goal.text);
        }
        for &point in &goal.order {
            assert!(room.put_player(player, points[point * 3], points[point * 3 + 1]));
            run_once(&mut room);
            room.answer(player, Asked::UsePoint { point: u8::try_from(point).unwrap_or(u8::MAX) });
            assert_eq!(room.player(player).expect("in").answer, 0, "{}: point {point} used", goal.text);
        }
        assert_ne!(room.player(player).expect("in").character.quest_now(), Some((quest, task)), "{}: met", goal.text);
    }
}

#[test]
fn every_defences_waves_stand_in_full_and_come_at_its_ward() {
    for (quest, task, goal) in steps_of(GoalKind::Defend) {
        let node = node_of(goal);
        let place = place_of(node, goal.place.as_deref().unwrap_or_default());
        let (mut room, player) = on_step(node, quest, task, place.at);
        run_once(&mut room);
        for (wave, members) in goal.waves.iter().enumerate() {
            let Some(Step { kind: Stepping::Defence(defence), .. }) = room.quests.steps.get(&player) else {
                panic!("{}: its defence runs", goal.text)
            };
            let (ward, standing) = (defence.ward.expect("its ward stands"), defence.standing.clone());
            assert_eq!(standing.len(), members.len(), "{}: wave {wave} stands in full", goal.text);
            let mut came = false;
            for _ in 0..60 * 60 {
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
            for id in &standing {
                room.foes.remove(id);
            }
            run_once(&mut room);
        }
        assert!(met(&room, player, quest, task, goal), "{}: its last wave fallen, it is met", goal.text);
    }
}
