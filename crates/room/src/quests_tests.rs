//! The houses' roads in a room: every foe a road names is one of the roster's; a keeper spoken with at their counter;
//! a place reached in its node alone; a kill goal's group standing as a player on it comes near, counting each kill
//! they struck, and standing again while the goal is unmet; a node entered and a sea island landed on; a resource
//! gathered and a wreck searched; a cast gated by what is earned and counted; and where the task's place stands.

use super::*;
use crate::arts::Cast;
use crate::asks::{Asked, Counter, CounterKind, ResourceNode, answer_code};
use crate::{Floor, NodeKind, Section};
use gear::asks::Refusal;
use gear::quests::{Goal, GoalDef, GoalKind, TaskDef, keeper_key, quests};
use gear::{Ask, Character};
use isle::{Kind, Plan};

/// Every goal of the roads, by its quest, task and place in the task.
pub(crate) fn every_goal() -> impl Iterator<Item = ([usize; 3], &'static GoalDef)> {
    quests().quests.iter().enumerate().flat_map(|(quest, def)| {
        def.tasks.iter().enumerate().flat_map(move |(task, at)| {
            at.goals.iter().enumerate().map(move |(goal, found)| ([quest, task, goal], found))
        })
    })
}

/// The first goal of the roads `pick` takes, with its task: its quest, task and place in the task. The tests here
/// take the file's own goals, so they hold as the story moves them.
pub(crate) fn goal_where(pick: impl Fn(&TaskDef, &GoalDef) -> bool) -> ([usize; 3], &'static GoalDef) {
    let task = |[quest, task, _]: [usize; 3]| &quests().quests[quest].tasks[task];
    every_goal().find(|(key, goal)| pick(task(*key), goal)).expect("a road has such a goal")
}

/// The counts of a goal's task with that goal at `count` and the others at none.
pub(crate) fn counted([quest, task, goal]: [usize; 3], count: u16) -> Vec<u16> {
    let mut counts = vec![0; quests().quests[quest].tasks[task].goals.len()];
    counts[goal] = count;
    counts
}

/// What a goal names of foes that the roster has not: a type of none, or a type at a rank it never comes in, in its
/// kill's types, its group, waves, ambush or watchers, or its tail's foe.
fn unrostered(goal: &GoalDef) -> Vec<String> {
    let types = match &goal.goal {
        Goal::Kill(slay) => slay.types.clone(),
        Goal::Tail(tail) => tail.foe.iter().cloned().collect(),
        _ => Vec::new(),
    };
    let unknown = types.into_iter().filter(|name| !ROSTER.iter().any(|foe| foe.name == *name));
    let ranked =
        goal.goal.foes().filter(|(name, rank)| named(name, rank).is_none_or(|(foe, rank)| !foe.ranks.contains(&rank)));
    unknown.chain(ranked.map(|(name, rank)| format!("{name}, {rank}"))).collect()
}

#[test]
fn every_foe_a_road_names_is_one_of_the_roster_at_a_rank_it_comes_in() {
    for (_, goal) in every_goal() {
        assert_eq!(unrostered(goal), Vec::<String>::new(), "{}", goal.text);
    }
    let never_boss = ROSTER.iter().find(|foe| !foe.ranks.contains(&::foes::Rank::Boss)).expect("a type never a boss");
    let boss = never_boss.name;
    for text in [
        r#"{ "kind": "kill", "node": "n", "types": ["Reev"], "text": "t" }"#.to_owned(),
        format!(r#"{{ "kind": "kill", "node": "n", "place": "p", "spawn": [["{boss}", "Boss"]], "text": "t" }}"#),
        r#"{ "kind": "defend", "node": "n", "place": "p", "ward": "w", "waves": [[["Runner", "Minor"]], [["Runer", "Minor"]]], "text": "t" }"#.to_owned(),
        r#"{ "kind": "escort", "node": "n", "from": "a", "to": "b", "who": "tobin", "near": 15, "ambush": [["Brut", "Major"]], "text": "t" }"#.to_owned(),
        r#"{ "kind": "unseen", "node": "n", "place": "p", "spawn": [["Runner", "Huge"]], "text": "t" }"#.to_owned(),
        r#"{ "kind": "tail", "node": "n", "from": "a", "to": "b", "foe": "Colector", "far": 10, "near": 40, "text": "t" }"#.to_owned(),
    ] {
        let goal: GoalDef = serde_json::from_str(&text).expect("a goal");
        assert_eq!(unrostered(&goal).len(), 1, "{text}");
    }
}

/// A node's room named `id` on open ground 400 m square round the origin, its spawn near its southern edge, holding
/// no garrison, with these places.
pub(crate) fn node_room(id: &str, places: &[(&str, [f64; 2], f64)]) -> Room {
    let ring = vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]];
    let section = Section { ring, spawns: vec![[0.0, 180.0]], falls_kill: false };
    let mut room = Room::garrisoned(Floor::Flat, Vec::new(), section, NodeKind::Social, (id, None));
    let place = |&(name, at, radius): &(&str, [f64; 2], f64)| Place { name: name.to_owned(), at, radius };
    room.set_places(places.iter().map(place).collect());
    room
}

/// A character on a quest's task: pledged to its house, every quest before it done.
pub(crate) fn on_road(quest: usize, task: usize) -> Character {
    let mut character = Character::starting();
    character.allegiance.pledge = quests().quests[quest].faction;
    character.quests.set_task(quest, task);
    let character = Character::from_json(&character.to_json()).expect("made whole");
    assert_eq!(character.quest_now(), Some((quest, task)), "on its task");
    character
}

/// A character on a goal's task.
pub(crate) fn on_goal(key: [usize; 3]) -> Character {
    on_road(key[0], key[1])
}

/// A player joined with the character given, standing at a point.
pub(crate) fn joined(room: &mut Room, character: &Character, at: [f64; 2]) -> PlayerId {
    let player = room.join().expect("a room with space");
    assert!(room.restore_character(player, &character.to_json()));
    stand_at(room, player, at);
    player
}

pub(crate) fn stand_at(room: &mut Room, player: PlayerId, [x, y]: [f64; 2]) {
    let mut there = *room.fighter(player).expect("in");
    (there.body.x, there.body.y) = (x, y);
    room.set_fighter(player, there);
}

pub(crate) fn now(room: &Room, player: PlayerId) -> (Option<(usize, usize)>, Vec<u16>) {
    let character = &room.player(player).expect("in").character;
    (character.quest_now(), character.quest_counts())
}

pub(crate) fn run(room: &mut Room, ticks: u32) {
    for _ in 0..ticks {
        room.tick();
    }
}

#[test]
fn a_keeper_is_spoken_with_within_reach_of_their_counter_and_nowhere_else() {
    let mut room = node_room("harbour-social", &[]);
    let counters = [(CounterKind::Faction(1), [10.0, 0.0]), (CounterKind::Mage, [20.0, 0.0])];
    room.counters = Some(counters.map(|(kind, at)| Counter { kind, at }).to_vec());
    let player = joined(&mut room, &Character::starting(), [10.0, 1.0]);
    let opening = room.player(player).expect("in").character.quest_now().expect("the opening");
    let heard: Vec<u16> = quests().quests[opening.0].tasks[opening.1]
        .goals
        .iter()
        .map(|goal| u16::from(matches!(&goal.goal, Goal::Talk(talk) if Some(talk.to.as_str()) == keeper_key(1))))
        .collect();
    assert!(heard.contains(&1), "the opening hears the Stormcallers' keeper");
    let speak = |room: &mut Room, keeper| {
        room.answer(player, Asked::Gear(Ask::Speak { keeper }));
        room.player(player).expect("in").answer
    };
    assert_eq!(speak(&mut room, 2), answer_code(Err(Refusal::NotHere)), "the Lamplighters' counter is not here");
    assert_eq!(speak(&mut room, 1), 0);
    assert_eq!(now(&room, player), (Some(opening), heard));
    stand_at(&mut room, player, [20.0, 0.0]);
    assert_eq!(speak(&mut room, 10), answer_code(Err(Refusal::NothingToSay)), "the Mage is asked nothing");
    stand_at(&mut room, player, [40.0, 0.0]);
    assert_eq!(speak(&mut room, 1), answer_code(Err(Refusal::NotHere)), "afield");
}

#[test]
fn a_place_is_reached_standing_within_its_reach_in_its_own_node_only() {
    let alone = |task: &TaskDef, goal: &GoalDef| task.goals.len() == 1 && goal.kind() == GoalKind::Reach;
    let ([quest, task, _], goal) = goal_where(alone);
    let (node, place) = (goal.goal.node().expect("a node"), goal.goal.place().expect("a place"));
    let mut room = node_room(node, &[(place, [50.0, 0.0], 30.0)]);
    let player = joined(&mut room, &on_road(quest, task), [0.0, 0.0]);
    run(&mut room, 2);
    assert_eq!(now(&room, player).0, Some((quest, task)), "21 m short of its reach");
    stand_at(&mut room, player, [75.0, 10.0]);
    run(&mut room, 1);
    assert_ne!(now(&room, player).0, Some((quest, task)), "the next task at once");
    let mut other = node_room("elsewhere", &[(place, [50.0, 0.0], 30.0)]);
    let player = joined(&mut other, &on_road(quest, task), [50.0, 0.0]);
    run(&mut other, 2);
    assert_eq!(now(&other, player).0, Some((quest, task)), "another node's place of that name");
}

/// A player's ball of a million through a foe's chest from a step south of it, over a tick.
pub(crate) fn shoot_dead(room: &mut Room, player: PlayerId, foe: FighterId) {
    let body = room.foes[&foe].fighter.body;
    let from = [body.x, body.y + 1.0, body.z + combat::tuning::CHEST];
    let mut ball = combat::shots::loose(player, combat::Ranged::Pistolet, from, 0.0, 0.0, 1.0);
    ball.damage = 1.0e6;
    room.shots.push((ball, None));
    run(room, 1);
    assert!(room.foes[&foe].fighter.dead(), "shot dead");
}

/// The foes of the room standing alive.
pub(crate) fn living(room: &Room) -> Vec<FighterId> {
    room.foes.iter().filter(|(_, foe)| !foe.fighter.dead()).map(|(id, _)| *id).collect()
}

/// A kill goal whose group is as many as its count, in a task with another goal to wait on.
pub(crate) fn group_goal() -> ([usize; 3], &'static GoalDef) {
    goal_where(|task, goal| {
        let Goal::Kill(slay) = &goal.goal else { return false };
        task.goals.len() > 1 && slay.spawn.len() > 1 && usize::from(goal.count) == slay.spawn.len()
    })
}

/// The names of a group's foes, in order.
pub(crate) fn group_names(goal: &GoalDef) -> Vec<&str> {
    let mut names: Vec<&str> = goal.goal.foes().map(|(name, _)| name.as_str()).collect();
    names.sort_unstable();
    names
}

#[test]
fn a_kill_goals_group_stands_for_a_player_on_it_within_150_m_and_each_kill_they_struck_counts() {
    let (key, goal) = group_goal();
    let (node, place) = (goal.goal.node().expect("a node"), goal.goal.place().expect("a place"));
    let size = u16::try_from(group_names(goal).len()).unwrap_or(0);
    let mut room = node_room(node, &[(place, [0.0, 0.0], 48.0)]);
    let player = joined(&mut room, &on_goal(key), [0.0, 160.0]);
    let bystander = joined(&mut room, &Character::starting(), [0.0, 140.0]);
    run(&mut room, 2);
    assert!(room.foes.is_empty(), "160 m off; one on no such goal stands nothing");
    stand_at(&mut room, player, [0.0, 149.0]);
    run(&mut room, 1);
    let group = living(&room);
    let mut names: Vec<&str> = group.iter().map(|id| room.foes[id].brain.foe_type.name).collect();
    names.sort_unstable();
    assert_eq!(names, group_names(goal));
    assert!(room.garrison.iter().any(|post| post.arrival && post.standing == group), "an arriving post");
    let last = group.len() - 1;
    for id in &group[..last] {
        shoot_dead(&mut room, player, *id);
    }
    assert_eq!(now(&room, player).1, counted(key, size - 1), "each kill counts, the task's other goal waits");
    shoot_dead(&mut room, bystander, group[last]);
    assert_eq!(now(&room, player).1, counted(key, size - 1), "one they never struck");
    let fell = room.clock();
    while living(&room).is_empty() && room.clock() < fell + crate::garrison::STAND_AGAIN + 60 {
        run(&mut room, 1);
    }
    assert_eq!(room.clock() - fell, crate::garrison::STAND_AGAIN, "the goal unmet, it stands again two minutes on");
    let again = living(&room);
    assert_eq!(again.len(), group.len());
    assert!(again.iter().all(|id| !group.contains(id)));
    shoot_dead(&mut room, player, again[0]);
    assert_eq!(now(&room, player).1, counted(key, size));
    run(&mut room, 2);
    assert_eq!(living(&room).len(), last, "the goal met, no other group");
}

/// A land goal on an island of this kind, with another goal after it in its task.
fn landing(island: &str, then: GoalKind) -> ([usize; 3], &'static GoalDef) {
    goal_where(|task, goal| {
        matches!(&goal.goal, Goal::Land(land) if land.island == island) && task.goals.iter().any(|it| it.kind() == then)
    })
}

#[test]
fn a_node_is_entered_and_a_sea_island_landed_on_as_the_character_arrives() {
    let (entered, goal) = goal_where(|task, goal| goal.kind() == GoalKind::Enter && task.goals.len() > 1);
    let mut maw = node_room(goal.goal.node().expect("a node"), &[]);
    let player = joined(&mut maw, &on_goal(entered), [0.0, 0.0]);
    assert_eq!(now(&maw, player).1, counted(entered, 1));
    let (landed, _) = landing("cove", GoalKind::Scavenge);
    let searched =
        quests().quests[landed[0]].tasks[landed[1]].goals.iter().position(|it| it.kind() == GoalKind::Scavenge);
    let seed = (0..).find(|&seed| Kind::of(seed) == Kind::Cove).unwrap_or(0);
    let plan = Plan::new(seed, "woodland").expect("woodland dresses islands");
    let mut cove = Room::island(&plan, [612_345.5, 287_654.25], None, Some((5, 9)));
    let player = joined(&mut cove, &on_goal(landed), [0.0, 0.0]);
    assert_eq!(now(&cove, player).1, counted(landed, 1), "landed in a cove");
    let wreck = cove.isle.as_ref().expect("an island").wrecks[0];
    stand_at(&mut cove, player, wreck);
    cove.answer(player, Asked::Scavenge { wreck: 0 });
    let mut both = counted(landed, 1);
    both[searched.expect("a search")] = 1;
    assert_eq!(now(&cove, player).1, both, "a wreck searched");
    let (isle, _) = landing("isle", GoalKind::Kill);
    let player = joined(&mut cove, &on_goal(isle), [0.0, 0.0]);
    assert_eq!(now(&cove, player).1, counted(isle, 0), "a cove is no guarded isle");
}

#[test]
fn a_resource_gathered_counts_for_its_goal() {
    let (key, _) = goal_where(|task, goal| goal.kind() == GoalKind::Gather && (task.goals.len() > 1 || goal.count > 1));
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.furnish(None, vec![ResourceNode { x: 1.0, y: 0.0, resource: 0 }]);
    let player = joined(&mut room, &on_goal(key), [0.0, 0.0]);
    room.answer(player, Asked::Gather { node: 0 });
    assert_eq!(now(&room, player).1, counted(key, 1));
}

/// Asks a cast with its charge full, and ticks past its release.
fn cast(room: &mut Room, player: PlayerId, spell: u8) {
    room.ready_arts(player);
    room.ask_cast(player, Some(Cast { spell, aim: None }));
    run(room, 30);
}

#[test]
fn a_spell_is_cast_only_when_its_art_is_worn_and_it_is_earned_and_each_cast_counts() {
    let anima = |spell: &str| gear::arts::arts().arts.iter().position(|art| art.anima.name == spell);
    let (key, goal) = goal_where(|task, goal| {
        matches!(&goal.goal, Goal::Cast(cast) if anima(&cast.spell).is_some())
            && (task.goals.len() > 1 || goal.count > 1)
    });
    let Goal::Cast(spell) = &goal.goal else { unreachable!("a cast") };
    let art = anima(&spell.spell).expect("an Anima");
    let mut room = node_room("saltgrass-downs", &[]);
    let player = joined(&mut room, &on_goal(key), [0.0, 0.0]);
    let worn = |room: &Room| room.player(player).expect("in").character.arts.worn;
    assert_eq!(worn(&room), 0);
    cast(&mut room, player, 1);
    assert_eq!(now(&room, player).1, counted(key, 0), "no Art worn casts nothing");
    let found = room.players.get_mut(&player).expect("in");
    let mut earned = vec![0; 3];
    earned[art] = gear::arts::EARNED_ART;
    (found.character.arts.earned, found.character.arts.worn) = (Some(earned), u8::try_from(art + 1).unwrap_or(0));
    cast(&mut room, player, 2);
    assert_eq!(room.player(player).expect("in").casting.tenets[0], 1.0, "a Tenet not earned is not cast");
    cast(&mut room, player, 1);
    assert_eq!(now(&room, player).1, counted(key, 1), "{} called", spell.spell);
}

#[test]
fn a_new_player_in_a_node_wears_no_art_and_the_test_grounds_earns_every_one() {
    let mut room = node_room("saltgrass-downs", &[]);
    let player = room.join().expect("a room with space");
    assert_eq!(room.player(player).expect("in").character.worn_art(), None);
    let mut ground = Room::new(Vec::new(), (0.0, 0.0));
    let player = ground.join().expect("a room with space");
    let character = &ground.player(player).expect("in").character;
    assert!((1..=3).all(|art| character.earned(art) == gear::arts::ALL_EARNED));
}

#[test]
fn the_task_s_first_unmet_goal_with_a_place_here_is_where_its_mark_stands() {
    let (key, goal) = goal_where(|task, goal| {
        let later = |it: &GoalDef| it.kind() == GoalKind::Kill && it.goal.place() == goal.goal.place();
        goal.kind() == GoalKind::Reach && task.goals.iter().any(later)
    });
    let (node, place) = (goal.goal.node().expect("a node"), goal.goal.place().expect("a place"));
    let places = [(place, [30.0, -40.0], 30.0), ("The Middle", [0.0, 0.0], 70.0)];
    let mut room = node_room(node, &places);
    let player = joined(&mut room, &on_goal(key), [0.0, 0.0]);
    assert_eq!(room.quest_at(player), Some([30.0, -40.0, 30.0]));
    stand_at(&mut room, player, [30.0, -40.0]);
    run(&mut room, 1);
    assert_eq!(now(&room, player).1, counted(key, 1));
    assert_eq!(room.quest_at(player), Some([30.0, -40.0, 30.0]), "its kill goal there yet");
    let mut elsewhere = node_room("elsewhere", &places);
    let player = joined(&mut elsewhere, &on_goal(key), [0.0, 0.0]);
    assert_eq!(elsewhere.quest_at(player), None, "no goal of the task is in this node");
}

/// A guarded isle's room, held by the Grey Tithe, and the land goal of a task that asks its leader killed there.
fn guarded_isle() -> (Room, [usize; 3]) {
    let (key, _) = goal_where(|task, goal| {
        let leader = |it: &GoalDef| matches!(&it.goal, Goal::Kill(slay) if slay.types.iter().any(|name| name == "Reeve") && it.count == 1);
        matches!(&goal.goal, Goal::Land(land) if land.island == "isle") && task.goals.iter().any(leader)
    });
    let seed = (0..).find(|&seed| Kind::of(seed) == Kind::Ruin).unwrap_or(0);
    let plan = Plan::new(seed, "woodland").expect("woodland dresses islands");
    (Room::island(&plan, [612_345.5, 287_654.25], Some(::foes::factions::GREY_TITHE), Some((5, 9))), key)
}

#[test]
fn the_isle_s_leader_shot_on_a_guarded_isle_counts_and_its_task_gives_a_fragment_choice() {
    let (mut isle, key) = guarded_isle();
    let player = joined(&mut isle, &on_goal(key), [0.0, 0.0]);
    assert_eq!(now(&isle, player).1, counted(key, 1), "landed on a guarded isle");
    let reeve = isle.foes.iter().find(|(_, foe)| foe.brain.foe_type.name == "Reeve").map(|(id, _)| *id);
    shoot_dead(&mut isle, player, reeve.expect("the isle's leader"));
    assert_ne!(now(&isle, player).0, Some((key[0], key[1])), "the next task");
    let def = &quests().quests[key[0]];
    let choices = isle.player(player).expect("in").character.fragment_choices(def.faction);
    assert_eq!(choices, def.tasks[key[1]].reward.fragments, "its fragment choices");
}

/// Each foe of `group` living, with its place in its group and how alert it is.
fn homes(room: &Room, group: &[FighterId]) -> Vec<([f64; 3], [f64; 3], ::foes::Alertness)> {
    let living = group.iter().filter_map(|id| room.foes.get(id)).filter(|foe| !foe.fighter.dead());
    living
        .map(|foe| {
            let body = foe.fighter.body;
            let home = foe.brain.home().expect("it holds its place").at;
            ([body.x, body.y, body.z], home, foe.brain.alertness())
        })
        .collect()
}

#[test]
fn a_group_300_m_from_the_spawn_stands_on_its_places_own_mesh_fights_there_and_walks_back_to_its_post() {
    let (key, goal) = group_goal();
    let (node, place) = (goal.goal.node().expect("a node"), goal.goal.place().expect("a place"));
    let mut room = node_room(node, &[(place, [0.0, -120.0], 48.0), ("The Middle", [0.0, 0.0], 70.0)]);
    assert_eq!(room.quests.grounds.len(), 0, "no mesh is baked before a group must stand");
    let player = joined(&mut room, &on_goal(key), [0.0, 25.0]);
    run(&mut room, 1);
    let group = living(&room);
    assert_eq!(room.quests.grounds.len(), 1, "a mesh round the camp alone, where a group stands");
    assert_eq!(group.len(), group_names(goal).len());
    let camp = &room.quests.grounds[0].2;
    for (feet, home, alert) in homes(&room, &group) {
        assert_eq!((room.mesh_index([feet[0], feet[1]]), alert), (1, ::foes::Alertness::Idle), "idle on the camp's");
        let near = camp.nearest_point(feet).expect("the camp's mesh");
        assert!(combat::sight::apart([near[0], near[1]], [feet[0], feet[1]]) < 0.1 && feet == home, "at its place");
    }
    stand_at(&mut room, player, [0.0, -108.0]);
    let (mut closest, mut struck) = (f64::INFINITY, false);
    for _ in 0..1200 {
        room.tick();
        let at = room.fighter(player).map(|fighter| [fighter.body.x, fighter.body.y]).expect("in");
        for (feet, _, _) in homes(&room, &group) {
            closest = closest.min(combat::sight::apart(at, [feet[0], feet[1]]));
        }
        struck |= room.take_events().iter().any(|event| group.contains(&event.striker) && event.defender == player);
        if struck {
            break;
        }
    }
    assert!(struck && closest < 3.0, "it noticed them, closed to {closest:.1} m and struck");
    stand_at(&mut room, player, [0.0, 150.0]);
    run(&mut room, 3600);
    let home = homes(&room, &group);
    assert!(!home.is_empty());
    for (feet, place, alert) in home {
        let back = combat::sight::apart([feet[0], feet[1]], [place[0], place[1]]);
        assert!(back < 1.0 && alert == ::foes::Alertness::Idle, "back at its place: {back:.1} m, {alert:?}");
    }
}

#[test]
fn a_patrols_own_garrison_stands_and_fights_the_same_whatever_meshes_its_places_add() {
    let fought = |places: Vec<Place>| {
        let baked = places.first().cloned();
        let ring = vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]];
        let section = Section { ring, spawns: vec![[0.0, 180.0]], falls_kill: false };
        let id = ("saltgrass-downs", None);
        let mut room = Room::garrisoned(Floor::Flat, Vec::new(), section, NodeKind::Patrol, id);
        room.set_places(places);
        if let Some(place) = baked {
            room.ground_of(&place, place.radius);
        }
        let player = room.join().expect("a room with space");
        let post = room.garrison[0].at;
        stand_at(&mut room, player, [post[0] + 6.0, post[1]]);
        let mut struck = 0;
        for _ in 0..900 {
            room.tick();
            struck += room.take_events().iter().filter(|event| event.defender == player).count();
        }
        (room.quests.grounds.len(), struck, room.fighters())
    };
    let camp = Place { name: "Tithe Camp".to_owned(), at: [0.0, -120.0], radius: 48.0 };
    let (without, with) = (fought(Vec::new()), fought(vec![camp]));
    assert_eq!((without.0, with.0), (0, 1));
    assert!(with.1 > 0, "its garrison fights the player");
    assert_eq!((without.1, without.2), (with.1, with.2), "every blow, and every fighter where it was, as it was");
}

#[test]
fn where_the_sea_checks_landings_a_player_lands_and_counts_the_isles_kills_only_once_it_says_so() {
    let (mut isle, key) = guarded_isle();
    assert!(isle.check_landings());
    let player = joined(&mut isle, &on_goal(key), [0.0, 0.0]);
    assert!(isle.own(player, "account-a"));
    assert_eq!(now(&isle, player).1, counted(key, 0), "given back and owned, not yet landed");
    let reeve = isle.foes.iter().find(|(_, foe)| foe.brain.foe_type.name == "Reeve").map(|(id, _)| *id);
    shoot_dead(&mut isle, player, reeve.expect("the isle's leader"));
    assert_eq!(now(&isle, player).1, counted(key, 0), "its leader's fall before they landed");
    assert!(isle.land("account-b"));
    assert_eq!(now(&isle, player).1, counted(key, 0), "another account's word");
    assert!(isle.land("account-a"));
    assert_eq!(now(&isle, player).1, counted(key, 1), "the sea's word for theirs");
}
