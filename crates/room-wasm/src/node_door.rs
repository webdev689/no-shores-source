//! A node's room opened from its file as the bake writes it (`bake::NodeFile`): its section, window and boxes, its
//! garrison, counters, places, paths, resources, finds, public events, landing zones and Breach's gate.

use crate::{
    Opened, breach_door, dungeon_door, finds_door, gear_door, keep, passage_room_door, public_door, sent::Sent,
};
use land::ground::Ground;
use movement::Block;
use movement::floats::BLOCK_FLOATS;
use room::asks::{Counter, CounterKind};
use room::{Floor, NodeKind, Room, Section};
use serde::Deserialize;

/// A node's file as the bake writes it: its id, kind, name, section, window, rect, boxes, whether it is locked, a
/// patrol's resource places, the roads' places and paths, and its passages' doors; a page alone writes its own, open.
#[derive(Debug, Deserialize)]
pub(crate) struct NodeFile {
    pub(crate) id: String,
    pub(crate) kind: NodeKind,
    #[serde(default)]
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) locked: bool,
    #[serde(default)]
    pub(crate) continent: String,
    pub(crate) ring: Vec<[f64; 2]>,
    pub(crate) spawns: Vec<[f64; 2]>,
    pub(crate) bounds: [f64; 4],
    pub(crate) ground: Ground,
    pub(crate) boxes: Vec<[f64; BLOCK_FLOATS]>,
    #[serde(default)]
    pub(crate) counters: Vec<gear_door::NodeCounter>,
    /// In Overlook's social space, where a player stands to read the bounty board.
    #[serde(default)]
    pub(crate) board: Option<[f64; 2]>,
    #[serde(default)]
    pub(crate) shape_spots: Vec<[f64; 2]>,
    #[serde(default)]
    pub(crate) grounds: Option<public_door::NodeGrounds>,
    #[serde(default)]
    pub(crate) resources: Vec<[f64; 2]>,
    #[serde(flatten)]
    pub(crate) finds: finds_door::Finds,
    #[serde(default)]
    pub(crate) foes: Vec<[f64; 2]>,
    #[serde(default)]
    pub(crate) places: Vec<gear::quests::Place>,
    #[serde(default)]
    pub(crate) paths: Vec<Vec<[f64; 2]>>,
    #[serde(default)]
    pub(crate) doors: Vec<gear::quests::Place>,
    /// In a patrol area with landing zones, each where a body lands, fast travelled to.
    #[serde(default)]
    pub(crate) landings: Vec<gear::quests::Place>,
    /// In a patrol area with a Breach's gate, where its module stands and its quarter turns.
    #[serde(default)]
    pub(crate) breach: Option<([f64; 3], u8)>,
}

/// Opens a new node's room from its file's text: its bodies stand on its window of the ground among its boxes, its
/// kind's garrison stands (a patrol's territories' and runs' groups as players come near), and it judges against its
/// section. Answers whether the text was a node with a section and a spawn.
pub fn open_node(text: &[u8]) -> bool {
    let Ok(node) = serde_json::from_slice::<NodeFile>(text) else { return false };
    if node.ring.len() < 3 || node.spawns.is_empty() {
        return false;
    }
    let blocks = node.boxes.iter().map(Block::from_floats);
    let section = Section { ring: node.ring, spawns: node.spawns, falls_kill: node.kind == NodeKind::Social };
    // Its garrison stands at its island's levels; a city's social space serves a player's gear at its counters; a
    // patrol keeps its island's resource nodes and lays its dungeons' entrances; an Elite Dungeon's node lays its one.
    let levels = gear::world::island_levels(&node.continent);
    let floor = Floor::Land(Box::new(node.ground));
    let mut room = Room::garrisoned(floor, blocks.collect(), section, node.kind, (&node.id, levels));
    room.set_island(&node.continent);
    room.counters = (node.kind == NodeKind::Social).then(|| {
        let board = node.board.map(|at| Counter { kind: CounterKind::Board, at });
        node.counters.iter().filter_map(gear_door::counter_of).chain(board).collect()
    });
    room.shape_spots = node.shape_spots;
    passage_room_door::open_mouths(&mut room, &node.continent, &node.doors, &node.places);
    room.set_places(node.places);
    room.set_foe_sites(&node.foes);
    room.set_paths(node.paths);
    room.set_landings(&node.landings.iter().map(|landing| landing.at).collect::<Vec<_>>());
    if let Some(grounds) = node.grounds {
        room.open_public(&node.id, grounds.into(), levels);
    }
    let patrol = node.kind == NodeKind::Patrol;
    let resource = gear::catalogue::catalogue().resources.iter().position(|found| found.continent == node.continent);
    if let Some(resource) = resource.filter(|_| patrol) {
        room.start_patrol(&node.id, u8::try_from(resource).unwrap_or_default(), &node.resources);
        finds_door::lay(&mut room, node.finds);
    }
    if node.kind == NodeKind::Dungeon {
        room.lay_elite_entrance(&node.id);
    }
    breach_door::stand_gate(&mut room, node.kind, node.breach);
    let refusal = dungeon_door::lock_words(node.locked, &node.name);
    let sent = Box::new(Sent::around(protocol::pack::middle_of(Some(node.bounds))));
    keep(Opened::Land { room: Box::new(room), node: Some((node.id, node.bounds)), refusal, sent });
    true
}
