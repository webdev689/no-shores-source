//! A patrol zone's landing is a safe place to arrive: on continent 1's patrol zones as the bake makes them, a player
//! who stands a minute where they land is never struck, and the zone's garrison still stands beyond it.

use movement::Block;
use room::{EventKind, Floor, NodeKind, Room, Section};
use std::path::Path;

/// Continent 1's nodes as the bake makes them, with its city blocks and briefs.
fn nodes() -> Vec<bake::NodeFile> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let layout = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let found = layout.continents.iter().find(|each| each.id == "continent-1").expect("the continent is drawn");
    let edits = land::edits::parse(&read("content/world/land/continent-1.json")).expect("its edits parse");
    let blocks = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
    let builders = bake::builders(&root).expect("the builders read");
    bake::nodes_of(found, edits, &blocks, &builders).expect("the continent bakes")
}

#[test]
fn a_player_standing_where_they_land_in_a_patrol_zone_is_never_struck() {
    let patrols: Vec<bake::NodeFile> = nodes().into_iter().filter(|node| node.kind == NodeKind::Patrol).collect();
    assert!(!patrols.is_empty(), "continent 1 has patrol zones");
    for node in &patrols {
        let blocks = node.boxes.iter().map(Block::from_floats).collect();
        let section = Section { ring: node.ring.clone(), spawns: node.spawns.clone(), falls_kill: false };
        let levels = gear::world::island_levels(&node.continent);
        let floor = Floor::Land(Box::new(node.ground.clone()));
        let mut room = Room::garrisoned(floor, blocks, section, node.kind, (&node.id, levels));
        room.set_island(&node.continent);
        assert!(room.foes_seen().count() > 0, "{}'s garrison stands", node.id);
        let player = room.join().expect("a player joins");
        for tick in 0..60 * 60 {
            room.tick();
            let struck = room
                .take_events()
                .into_iter()
                .find(|event| event.defender == player && matches!(event.kind, EventKind::Hit | EventKind::Killed));
            assert!(struck.is_none(), "{}: struck where they landed at tick {tick}: {struck:?}", node.id);
        }
    }
}

#[test]
fn a_patrol_zone_s_dungeon_entrances_stand_clear_of_every_box_with_room_to_come_out_before_each_door() {
    for node in nodes().iter().filter(|node| node.kind == NodeKind::Patrol) {
        let blocks: Vec<Block> = node.boxes.iter().map(Block::from_floats).collect();
        let section = Section { ring: node.ring.clone(), spawns: node.spawns.clone(), falls_kill: false };
        let floor = Floor::Land(Box::new(node.ground.clone()));
        let mut room = Room::garrisoned(floor, blocks.clone(), section, node.kind, (&node.id, None));
        room.start_patrol(&node.id, 0, &node.resources);
        assert_eq!(room.entrances().len(), dungeon::PER_PATROL, "{}: each dungeon its entrance", node.id);
        for (number, entrance) in room.entrances().iter().enumerate() {
            let ground = node.ground.height_at(entrance.at[0], entrance.at[1]);
            let near = blocks.iter().find(|block| {
                let east = (block.min_x - entrance.at[0]).max(entrance.at[0] - block.max_x).max(0.0);
                let south = (block.min_y - entrance.at[1]).max(entrance.at[1] - block.max_y).max(0.0);
                east.hypot(south) <= 8.0 && block.top > ground + 0.5 && block.bottom < ground + 2.5
            });
            assert!(near.is_none(), "{}: entrance {number} stands at {:?} by a box {near:?}", node.id, entrance.at);
        }
    }
}
