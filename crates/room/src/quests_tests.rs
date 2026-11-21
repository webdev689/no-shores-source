//! The houses' roads in a room: every foe a road names is one of the roster's; a keeper spoken with at their counter;
//! a place reached in its node alone; a kill goal's group standing as a player on it comes near, counting each kill
//! they struck, and standing again while the goal is unmet; a node entered and a sea island landed on; a resource
//! gathered and a wreck searched; a cast gated by what is earned and counted; and where the task's place stands.

use super::*;
use crate::arts::Cast;
use crate::asks::{Asked, Counter, CounterKind, ResourceNode, answer_code};
use crate::{Floor, NodeKind, Section};
use gear::asks::Refusal;
use gear::quests::quests;
use gear::{Ask, Character};
use isle::{Kind, Plan};

#[test]
fn every_foe_a_road_names_is_one_of_the_roster_at_a_rank_it_comes_in() {
    for goal in quests().quests.iter().flat_map(|quest| &quest.tasks).flat_map(|task| &task.goals) {
        for name in &goal.types {
            assert!(ROSTER.iter().any(|foe| foe.name == *name), "{name} is in the roster");
        }
        for (name, rank) in &goal.spawn {
            let (foe, rank) = named(name, rank).unwrap_or_else(|| panic!("{name}, {rank} is a foe and a rank"));
            assert!(foe.ranks.contains(&rank), "{name} comes in {rank:?}");
        }
    }
}

/// A node's room named `id` on open ground 400 m square round the origin, its spawn near its southern edge, holding
/// no garrison, with these places.
fn node_room(id: &str, places: &[(&str, [f64; 2], f64)]) -> Room {
    let ring = vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]];
    let section = Section { ring, spawns: vec![[0.0, 180.0]], falls_kill: false };
    let mut room = Room::garrisoned(Floor::Flat, Vec::new(), section, NodeKind::Social, (id, None));
    let place = |&(name, at, radius): &(&str, [f64; 2], f64)| Place { name: name.to_owned(), at, radius };
    room.set_places(places.iter().map(place).collect());
    room
}

/// A character pledged to `faction`, its road at `task`.
fn on_road(faction: u8, task: u8) -> Character {
    let mut character = Character::starting();
    character.allegiance.pledge = faction;
    character.quests.roads[usize::from(faction)].task = task;
    Character::from_json(&character.to_json()).expect("made whole")
}

/// A player joined with the character given, standing at a point.
fn joined(room: &mut Room, character: &Character, at: [f64; 2]) -> PlayerId {
    let player = room.join().expect("a room with space");
    assert!(room.restore_character(player, &character.to_json()));
    stand_at(room, player, at);
    player
}

fn stand_at(room: &mut Room, player: PlayerId, [x, y]: [f64; 2]) {
    let mut there = *room.fighter(player).expect("in");
    (there.body.x, there.body.y) = (x, y);
    room.set_fighter(player, there);
}

fn now(room: &Room, player: PlayerId) -> (Option<(usize, usize)>, Vec<u16>) {
    let character = &room.player(player).expect("in").character;
    (character.quest_now(), character.quest_counts())
}

fn run(room: &mut Room, ticks: u32) {
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
    let speak = |room: &mut Room, keeper| {
        room.answer(player, Asked::Gear(Ask::Speak { keeper }));
        room.player(player).expect("in").answer
    };
    assert_eq!(speak(&mut room, 2), answer_code(Err(Refusal::NotHere)), "the Lamplighters' counter is not here");
    assert_eq!(speak(&mut room, 1), 0);
    assert_eq!(now(&room, player), (Some((0, 0)), vec![1, 0, 0]));
    stand_at(&mut room, player, [20.0, 0.0]);
    assert_eq!(speak(&mut room, 10), answer_code(Err(Refusal::NothingToSay)), "the Mage is asked nothing");
    stand_at(&mut room, player, [40.0, 0.0]);
    assert_eq!(speak(&mut room, 1), answer_code(Err(Refusal::NotHere)), "afield");
}

#[test]
fn a_place_is_reached_standing_within_its_reach_in_its_own_node_only() {
    let beacon = [("The Old Beacon", [50.0, 0.0], 30.0)];
    let mut room = node_room("saltgrass-downs", &beacon);
    let player = joined(&mut room, &on_road(1, 0), [0.0, 0.0]);
    run(&mut room, 2);
    assert_eq!(now(&room, player).0, Some((1, 0)), "21 m short of its reach");
    stand_at(&mut room, player, [75.0, 10.0]);
    run(&mut room, 1);
    assert_eq!(now(&room, player), (Some((1, 1)), vec![0, 0]), "the next task at once");
    let mut other = node_room("gullwing-vale", &beacon);
    let player = joined(&mut other, &on_road(1, 0), [50.0, 0.0]);
    run(&mut other, 2);
    assert_eq!(now(&other, player).0, Some((1, 0)), "another node's place of that name");
}

/// A player's ball of a million through a foe's chest from a step south of it, over a tick.
fn shoot_dead(room: &mut Room, player: PlayerId, foe: FighterId) {
    let body = room.foes[&foe].fighter.body;
    let from = [body.x, body.y + 1.0, body.z + combat::tuning::CHEST];
    let mut ball = combat::shots::loose(player, combat::Ranged::Pistolet, from, 0.0, 0.0, 1.0);
    ball.damage = 1.0e6;
    room.shots.push((ball, None));
    run(room, 1);
    assert!(room.foes[&foe].fighter.dead(), "shot dead");
}

/// The foes of the room standing alive.
fn living(room: &Room) -> Vec<FighterId> {
    room.foes.iter().filter(|(_, foe)| !foe.fighter.dead()).map(|(id, _)| *id).collect()
}

#[test]
fn a_kill_goals_group_stands_for_a_player_on_it_within_150_m_and_each_kill_they_struck_counts() {
    let mut room = node_room("saltgrass-downs", &[("Tithe Camp", [0.0, 0.0], 48.0)]);
    let player = joined(&mut room, &on_road(1, 1), [0.0, 160.0]);
    let bystander = joined(&mut room, &Character::starting(), [0.0, 140.0]);
    run(&mut room, 2);
    assert!(room.foes.is_empty(), "160 m off; one on no such goal stands nothing");
    stand_at(&mut room, player, [0.0, 149.0]);
    run(&mut room, 1);
    let group = living(&room);
    let mut names: Vec<&str> = group.iter().map(|id| room.foes[id].brain.foe_type.name).collect();
    names.sort_unstable();
    assert_eq!(names, ["Collector", "Collector", "Crossbowman", "Enforcer", "Runner"]);
    assert!(room.garrison.iter().any(|post| post.arrival && post.standing == group), "an arriving post");
    for id in &group[..4] {
        shoot_dead(&mut room, player, *id);
    }
    assert_eq!(now(&room, player).1, [4, 0], "each kill counts, the gathering waits");
    shoot_dead(&mut room, bystander, group[4]);
    assert_eq!(now(&room, player).1, [4, 0], "one they never struck");
    run(&mut room, 1);
    let again = living(&room);
    assert_eq!(again.len(), 5, "the goal unmet and none standing, it stands again");
    assert!(again.iter().all(|id| !group.contains(id)));
    shoot_dead(&mut room, player, again[0]);
    assert_eq!(now(&room, player).1, [5, 0]);
    run(&mut room, 2);
    assert_eq!(living(&room).len(), 4, "the goal met, no other group");
}

#[test]
fn a_node_is_entered_and_a_sea_island_landed_on_as_the_character_arrives() {
    let mut maw = node_room("maw-shallows", &[]);
    let player = joined(&mut maw, &on_road(1, 8), [0.0, 0.0]);
    assert_eq!(now(&maw, player).1, [1, 0, 0]);
    let seed = (0..).find(|&seed| Kind::of(seed) == Kind::Cove).unwrap_or(0);
    let plan = Plan::new(seed, "woodland").expect("woodland dresses islands");
    let mut cove = Room::island(&plan, [612_345.5, 287_654.25], None, Some((5, 9)));
    let player = joined(&mut cove, &on_road(2, 6), [0.0, 0.0]);
    assert_eq!(now(&cove, player).1, [1, 0], "landed in a cove");
    let wreck = cove.isle.as_ref().expect("an island").wrecks[0];
    stand_at(&mut cove, player, wreck);
    cove.answer(player, Asked::Scavenge { wreck: 0 });
    assert_eq!(now(&cove, player).1, [1, 1], "a wreck searched");
    let player = joined(&mut cove, &on_road(1, 6), [0.0, 0.0]);
    assert_eq!(now(&cove, player).1, [0, 0], "a cove is no guarded isle");
}

#[test]
fn a_resource_gathered_counts_for_its_goal() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.furnish(None, vec![ResourceNode { x: 1.0, y: 0.0, resource: 0 }]);
    let player = joined(&mut room, &on_road(1, 1), [0.0, 0.0]);
    room.answer(player, Asked::Gather { node: 0 });
    assert_eq!(now(&room, player).1, [0, 1]);
}

/// Asks a cast with its charge full, and ticks past its release.
fn cast(room: &mut Room, player: PlayerId, spell: u8) {
    room.ready_arts(player);
    room.ask_cast(player, Some(Cast { spell, aim: None }));
    run(room, 30);
}

#[test]
fn a_spell_is_cast_only_when_its_art_is_worn_and_it_is_earned_and_each_cast_counts() {
    let mut room = node_room("saltgrass-downs", &[]);
    let player = joined(&mut room, &on_road(1, 3), [0.0, 0.0]);
    let worn = |room: &Room| room.player(player).expect("in").character.arts.worn;
    assert_eq!(worn(&room), 0);
    cast(&mut room, player, 1);
    assert_eq!(now(&room, player).1, [0, 0], "no Art worn casts nothing");
    let found = room.players.get_mut(&player).expect("in");
    (found.character.arts.earned, found.character.arts.worn) = (Some(vec![gear::arts::EARNED_ART, 0, 0]), 1);
    cast(&mut room, player, 2);
    assert_eq!(room.player(player).expect("in").casting.tenets[0], 1.0, "a Tenet not earned is not cast");
    cast(&mut room, player, 1);
    assert_eq!(now(&room, player).1, [1, 0], "Tempest called");
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
    let places = [("Grey Point Light", [30.0, -40.0], 30.0), ("Moorend", [0.0, 0.0], 70.0)];
    let mut room = node_room("driftwood-moors", &places);
    let player = joined(&mut room, &on_road(1, 7), [0.0, 0.0]);
    assert_eq!(room.quest_at(player), Some([30.0, -40.0, 30.0]));
    stand_at(&mut room, player, [30.0, -40.0]);
    run(&mut room, 1);
    assert_eq!(now(&room, player).1, [1, 0]);
    assert_eq!(room.quest_at(player), Some([30.0, -40.0, 30.0]), "its kill goal there yet");
    let mut elsewhere = node_room("gullwing-vale", &places);
    let player = joined(&mut elsewhere, &on_road(1, 7), [0.0, 0.0]);
    assert_eq!(elsewhere.quest_at(player), None, "no goal of the task is in this node");
}

#[test]
fn the_isle_s_leader_shot_on_a_guarded_isle_counts_and_its_task_gives_a_fragment_choice() {
    let seed = (0..).find(|&seed| Kind::of(seed) == Kind::Ruin).unwrap_or(0);
    let plan = Plan::new(seed, "woodland").expect("woodland dresses islands");
    let tithe = ::foes::factions::GREY_TITHE;
    let mut isle = Room::island(&plan, [612_345.5, 287_654.25], Some(tithe), Some((5, 9)));
    let player = joined(&mut isle, &on_road(3, 6), [0.0, 0.0]);
    assert_eq!(now(&isle, player).1, [1, 0], "landed on a guarded isle");
    let reeve = isle.foes.iter().find(|(_, foe)| foe.brain.foe_type.name == "Reeve").map(|(id, _)| *id);
    shoot_dead(&mut isle, player, reeve.expect("the isle's leader"));
    assert_eq!(now(&isle, player).0, Some((3, 7)), "the next task");
    assert_eq!(isle.player(player).expect("in").character.fragment_choices(3), 1);
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
    let mut room =
        node_room("saltgrass-downs", &[("Tithe Camp", [0.0, -120.0], 48.0), ("Saltgrass", [0.0, 0.0], 70.0)]);
    assert_eq!(room.quests.grounds.len(), 1, "a mesh round the camp alone, where a group stands");
    let player = joined(&mut room, &on_road(1, 1), [0.0, 25.0]);
    run(&mut room, 1);
    let group = living(&room);
    assert_eq!(group.len(), 5);
    let camp = &room.quests.grounds[0].1;
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
        let ring = vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]];
        let section = Section { ring, spawns: vec![[0.0, 180.0]], falls_kill: false };
        let id = ("saltgrass-downs", None);
        let mut room = Room::garrisoned(Floor::Flat, Vec::new(), section, NodeKind::Patrol, id);
        room.set_places(places);
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
