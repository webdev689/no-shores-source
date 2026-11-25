//! Every road's group, stood in full in its node as the bake lays it, even where its place's middle stands off the
//! mesh. The bake runs here over the first landmass, whose patrol areas hold every road's groups, so this needs no
//! files the bake wrote.

use super::*;
use crate::{Floor, Section};
use gear::quests::{Goal, KILL_PAST, Slay, quests};
use std::path::Path;

/// The first landmass's nodes, as `npm run bake` writes them, baked once for every test here.
pub(crate) fn first_landmass() -> &'static [bake::NodeFile] {
    static BAKED: std::sync::OnceLock<Vec<bake::NodeFile>> = std::sync::OnceLock::new();
    BAKED.get_or_init(baked)
}

fn baked() -> Vec<bake::NodeFile> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the content reads");
    let layout = world::layout::parse(&read("content/world/layout.json")).expect("the world's layout");
    let continent = layout.continents.into_iter().find(|it| it.id == "continent-1").expect("the first landmass");
    let blocks = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the blocks' index");
    let builders = bake::builders(&root).expect("the layouts' builders");
    let edits = land::edits::parse(&read("content/world/land/continent-1.json")).expect("its edits");
    bake::nodes_of(&continent, edits, &blocks, &builders).expect("its nodes bake")
}

/// A node's room as its file opens it, its places and paths named.
pub(crate) fn opened(node: &bake::NodeFile) -> Room {
    let blocks = node.boxes.iter().map(movement::Block::from_floats).collect();
    let section = Section { ring: node.ring.clone(), spawns: node.spawns.clone(), falls_kill: false };
    let (floor, levels) = (Floor::Land(Box::new(node.ground.clone())), gear::world::island_levels(&node.continent));
    let mut room = Room::garrisoned(floor, blocks, section, node.kind, (&node.id, levels));
    let place = |place: &bake::Place| Place { name: place.name.clone(), at: place.at, radius: place.radius };
    room.set_places(node.places.iter().map(place).collect());
    room.set_paths(node.paths.clone());
    room
}

#[test]
fn every_roads_group_stands_in_full_within_its_place_in_its_node_as_baked() {
    let nodes = first_landmass();
    let mut stood = 0;
    for (key, goal) in crate::quests::quests_tests::every_goal() {
        let Goal::Kill(Slay { node: Some(node), place: Some(name), spawn, .. }) = &goal.goal else { continue };
        if spawn.is_empty() {
            continue;
        }
        let def = &quests().quests[key[0]];
        let file = nodes.iter().find(|file| file.id == *node).unwrap_or_else(|| panic!("{node} is baked"));
        let mut room = opened(file);
        let place = room.quests.places.iter().find(|place| place.name == *name).cloned();
        let place = place.unwrap_or_else(|| panic!("{name} is a place of {node}"));
        let player = room.join().expect("a room with space");
        assert!(room.restore_character(player, &crate::quests::quests_tests::on_goal(key).to_json()));
        let before: Vec<FighterId> = room.foes.keys().copied().collect();
        assert!(room.put_player(player, place.at[0], place.at[1] + 140.0));
        crate::garrison::garrison_tests::run_baked(&mut room, 1);
        let new: Vec<[f64; 2]> = room
            .foes
            .iter()
            .filter(|(id, _)| !before.contains(id))
            .map(|(_, foe)| [foe.fighter.body.x, foe.fighter.body.y])
            .collect();
        assert_eq!(new.len(), spawn.len(), "{}: {} at {name} stands in full", def.id, goal.text);
        assert!(new.iter().all(|at| place.holds(*at, KILL_PAST)), "{}: {} within its place", def.id, goal.text);
        let most = new.iter().map(|at| combat::sight::apart(*at, place.at)).fold(0.0, f64::max);
        eprintln!(
            "{}: {}: {} stood at {name}, the farthest {most:.0} m from its middle (its reach {:.0} m)",
            def.id,
            goal.text,
            new.len(),
            place.radius
        );
        stood += 1;
    }
    assert!(stood > 0, "the roads' groups");
}
