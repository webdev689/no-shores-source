//! The lore lying in a node: where each chapter lies, who is shown it, and finding it within reach, once.

use crate::asks::{Asked, OUT_OF_REACH};
use crate::quests::quests_tests::node_room;
use crate::{PlayerId, Room};
use gear::lore::LoreDef;

/// Lore of a book with a chapter of the story's, one at the room's well, one at its well's middle, and one in another
/// node.
fn sample() -> &'static LoreDef {
    static SAMPLE: std::sync::OnceLock<LoreDef> = std::sync::OnceLock::new();
    SAMPLE.get_or_init(|| {
        serde_json::from_str(
            r#"{ "categories": [{ "id": "c" }], "books": [{ "id": "b", "category": "c", "chapters": [
                { "id": "told", "found": { "kind": "story" } },
                { "id": "east", "found": { "kind": "place", "node": "here", "place": "The Well", "bearing": 90, "at": 10 } },
                { "id": "middle", "found": { "kind": "place", "node": "here", "place": "The Well" } },
                { "id": "far", "found": { "kind": "place", "node": "elsewhere", "place": "The Well" } },
                { "id": "nowhere", "found": { "kind": "place", "node": "here", "place": "No Such Place" } }
            ] }] }"#,
        )
        .expect("the sample reads")
    })
}

fn room() -> Room {
    let mut room = node_room("here", &[("The Well", [20.0, -30.0], 12.0)]);
    room.set_lore(sample());
    room
}

fn stand_at(room: &mut Room, player: PlayerId, [x, y]: [f64; 2]) {
    let mut there = *room.fighter(player).expect("in");
    (there.body.x, there.body.y) = (x, y);
    room.set_fighter(player, there);
}

/// A player joined whose own character the room holds (`none_kept`), as a signed-in player's once it has come.
fn joined(room: &mut Room) -> PlayerId {
    let player = room.join().expect("room");
    room.none_kept(player);
    player
}

fn find(room: &mut Room, player: PlayerId, chapter: u16) -> u8 {
    room.answer(player, Asked::FindLore { chapter });
    room.player(player).expect("in").answer
}

#[test]
fn a_chapter_lies_at_its_place_in_its_node_as_far_and_at_the_bearing_the_file_gives() {
    let lying = room().lore_lying();
    assert_eq!(lying.len(), 2, "not another node's, nor at a place the node does not hold");
    let (east, [x, y]) = lying[0];
    assert_eq!(east, 1);
    assert!((x - 30.0).abs() < 1e-9 && (y + 30.0).abs() < 1e-9, "10 m east of the well: {x}, {y}");
    assert_eq!(lying[1], (2, [20.0, -30.0]), "at its middle, with no bearing nor distance");
}

#[test]
fn a_player_finds_a_chapter_within_reach_once_and_is_shown_it_no_more() {
    let mut room = room();
    let player = joined(&mut room);
    assert_eq!(room.lore_here(player).len(), 2);
    stand_at(&mut room, player, [30.0, -30.0 + crate::lore::LORE_REACH + 0.5]);
    assert_eq!(find(&mut room, player, 1), OUT_OF_REACH, "out of reach");
    stand_at(&mut room, player, [30.0, -29.0]);
    assert_eq!(find(&mut room, player, 3), OUT_OF_REACH, "another node's");
    assert_eq!(find(&mut room, player, 0), OUT_OF_REACH, "the story's lies nowhere");
    assert_eq!(find(&mut room, player, 1), 0, "within reach");
    assert!(room.player(player).expect("in").character.finds_lore("b/east"));
    assert_eq!(room.lore_found(player), [1], "by its number");
    assert_eq!(room.lore_here(player), vec![(2, [20.0, -30.0])], "found, it is shown no more");
    assert_eq!(find(&mut room, player, 1), OUT_OF_REACH, "found once");
    let other = joined(&mut room);
    assert_eq!(room.lore_here(other).len(), 2, "another player has found nothing");
}

#[test]
fn a_dead_player_finds_nothing() {
    let mut room = room();
    let player = joined(&mut room);
    stand_at(&mut room, player, [20.0, -30.0]);
    room.players.get_mut(&player).expect("in").standing = crate::Standing::Dead { ticks: 0, fell: false };
    assert_eq!(find(&mut room, player, 2), OUT_OF_REACH);
}

#[test]
fn a_player_whose_own_character_the_room_does_not_hold_is_shown_no_lore_and_finds_none() {
    let mut room = room();
    let player = room.join().expect("room");
    stand_at(&mut room, player, [20.0, -30.0]);
    assert_eq!(room.lore_here(player), [], "a page playing alone, or before its kept character comes");
    assert_eq!(find(&mut room, player, 2), OUT_OF_REACH);
}

#[test]
fn lore_the_room_gave_before_the_kept_character_came_is_carried_into_it() {
    let mut room = room();
    let player = room.join().expect("room");
    // As the story's chapters are, once the page tells the room the story was played.
    room.players.get_mut(&player).expect("in").character.keep_lore("b/told");
    let mut kept = gear::Character::starting();
    kept.story.prologue = true;
    assert!(room.restore_character(player, &kept.to_json()));
    assert!(room.player(player).expect("in").character.finds_lore("b/told"), "the page told the room first");
}

/// Every landmass's nodes, as the bake lays them: baked once, only when a chapter lies at a node past the first.
fn every_landmass() -> &'static [bake::NodeFile] {
    static BAKED: std::sync::OnceLock<Vec<bake::NodeFile>> = std::sync::OnceLock::new();
    BAKED.get_or_init(|| {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the content reads");
        let layout = world::layout::parse(&read("content/world/layout.json")).expect("the world's layout");
        let blocks = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the blocks' index");
        let builders = bake::builders(&root).expect("the layouts' builders");
        let bake = |continent: &world::layout::Continent| {
            let edits = land::edits::parse(&read(&format!("content/world/land/{}.json", continent.id))).expect("edits");
            bake::nodes_of(continent, edits, &blocks, &builders).expect("its nodes bake")
        };
        layout.continents.iter().flat_map(bake).collect()
    })
}

/// Every node's id the world holds, read from each landmass's edits without baking them: its nodes, and its city's
/// social space.
fn node_ids() -> Vec<String> {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: String| std::fs::read_to_string(root.join(path)).expect("the content reads");
    let layout = world::layout::parse(&read("content/world/layout.json".into())).expect("the world's layout");
    let ids = |continent: &world::layout::Continent| {
        let edits: serde_json::Value =
            serde_json::from_str(&read(format!("content/world/land/{}.json", continent.id))).expect("edits");
        let nodes = edits["nodes"].as_array().cloned().unwrap_or_default();
        let city = edits["city"]["id"].as_str().map(city::social_id);
        nodes.iter().filter_map(|node| node["id"].as_str().map(str::to_owned)).chain(city).collect::<Vec<_>>()
    };
    layout.continents.iter().flat_map(ids).collect()
}

/// Each chapter `lore` lays in the world that lies nowhere, said in a line: at a node no landmass holds, at a place
/// its node does not hold, or outside its node's ring.
fn lying_nowhere(lore: &'static LoreDef) -> Vec<String> {
    use crate::quests::quest_grounds_tests::{first_landmass, opened};
    let (ids, mut nowhere) = (node_ids(), Vec::new());
    for (key, found) in lore.chapters() {
        let gear::lore::Found::Place { node, .. } = found else { continue };
        if !ids.contains(node) {
            nowhere.push(format!("{key}: {node} is no node of the world"));
            continue;
        }
        let named = |file: &&bake::NodeFile| file.id == *node;
        let file = first_landmass().iter().find(named).or_else(|| every_landmass().iter().find(named));
        let file = file.unwrap_or_else(|| panic!("{node} is in the edits but not baked"));
        let mut room = opened(file);
        room.set_lore(lore);
        let number = lore.number_of(&key).expect("numbered");
        match room.lore_lying().into_iter().find(|(at, _)| *at == number) {
            None => nowhere.push(format!("{key}: its place is not one {node} holds")),
            Some((_, [x, y])) if !reach::inside(&file.ring, x, y) => {
                nowhere.push(format!("{key}: outside {node}'s ring"))
            }
            Some(_) => {}
        }
    }
    nowhere
}

#[test]
fn every_chapter_the_file_lays_in_the_world_lies_at_a_place_its_node_holds_inside_its_ring() {
    assert_eq!(lying_nowhere(gear::lore::lore()), Vec::<String>::new());
}

#[test]
fn a_chapter_laid_at_a_node_or_a_place_the_world_does_not_hold_is_said_to_lie_nowhere() {
    static LAID: std::sync::OnceLock<LoreDef> = std::sync::OnceLock::new();
    let laid = LAID.get_or_init(|| {
        serde_json::from_str(
            r#"{ "categories": [{ "id": "c" }], "books": [{ "id": "b", "category": "c", "chapters": [
                { "id": "barns", "found": { "kind": "place", "node": "saltgrass-downs", "place": "The Tithe Barns" } },
                { "id": "typo", "found": { "kind": "place", "node": "saltgrass-down", "place": "The Tithe Barns" } },
                { "id": "lost", "found": { "kind": "place", "node": "saltgrass-downs", "place": "No Such Place" } },
                { "id": "far", "found": { "kind": "place", "node": "saltgrass-downs", "place": "The Tithe Barns", "at": 9000 } }
            ] }] }"#,
        )
        .expect("the sample reads")
    });
    assert_eq!(
        lying_nowhere(laid),
        [
            "b/typo: saltgrass-down is no node of the world",
            "b/lost: its place is not one saltgrass-downs holds",
            "b/far: outside saltgrass-downs's ring",
        ]
    );
}
