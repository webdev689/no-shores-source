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
    let player = room.join().expect("room");
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
    let other = room.join().expect("room");
    assert_eq!(room.lore_here(other).len(), 2, "another player has found nothing");
}

#[test]
fn a_dead_player_finds_nothing() {
    let mut room = room();
    let player = room.join().expect("room");
    stand_at(&mut room, player, [20.0, -30.0]);
    room.players.get_mut(&player).expect("in").standing = crate::Standing::Dead { ticks: 0, fell: false };
    assert_eq!(find(&mut room, player, 2), OUT_OF_REACH);
}

#[test]
fn lore_found_in_the_room_is_carried_into_the_character_kept_for_the_player() {
    let mut room = room();
    let player = room.join().expect("room");
    stand_at(&mut room, player, [20.0, -30.0]);
    assert_eq!(find(&mut room, player, 2), 0);
    let mut kept = gear::Character::starting();
    kept.story.prologue = true;
    assert!(room.restore_character(player, &kept.to_json()));
    assert!(room.player(player).expect("in").character.finds_lore("b/middle"), "the page told the room first");
}

#[test]
fn every_chapter_the_file_lays_in_the_first_landmass_lies_at_a_place_its_node_holds_inside_its_ring() {
    use crate::quests::quest_grounds_tests::{first_landmass, opened};
    let lore = gear::lore::lore();
    for (key, found) in lore.chapters() {
        let gear::lore::Found::Place { node, .. } = found else { continue };
        // shortcut: only the first landmass is baked here; bake a node's continent too once lore lies past it.
        let Some(file) = first_landmass().iter().find(|file| file.id == *node) else { continue };
        let room = opened(file);
        let number = lore.number_of(&key).expect("numbered");
        let lying = room.lore_lying().into_iter().find(|(at, _)| *at == number);
        let Some((_, point)) = lying else { panic!("{key}: its place is not one {node} holds") };
        assert!(reach::inside(&file.ring, point[0], point[1]), "{key} lies outside {node}'s ring");
    }
}
