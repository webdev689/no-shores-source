//! The gates in the room: a patrol and its dungeons keep out a character short of the prologue, the seas one below
//! their level, and a social space and a course shut to no one.

use super::*;

fn node_of(kind: NodeKind, seas: gear::Difficulty) -> (Room, PlayerId) {
    let ring = vec![[-300.0, -300.0], [300.0, -300.0], [300.0, 300.0], [-300.0, 300.0]];
    let section = Section { ring, spawns: vec![[0.0, 0.0]] };
    let mut room = Room::garrisoned(Floor::Flat, Vec::new(), section, kind, ("saltgrass-downs", None));
    room.set_difficulty(seas);
    let player = room.join().expect("a room with space");
    (room, player)
}

#[test]
fn a_patrol_keeps_out_a_character_short_of_the_prologue_and_gives_one_past_it() {
    let (mut room, player) = node_of(NodeKind::Patrol, gear::Difficulty::Normal);
    let new = gear::Character::starting();
    assert_eq!(room.shut(&new), Some(gear::gate::Shut::Prologue));
    assert!(!room.restore_character(player, &new.to_json()), "never given");
    let mut past = gear::Character::starting();
    past.story.prologue = true;
    assert!(room.restore_character(player, &past.to_json()));
    let dungeon = Room::dungeon("saltgrass-downs", 0, None).expect("a patrol's dungeon");
    assert_eq!(dungeon.shut(&gear::Character::starting()), Some(gear::gate::Shut::Prologue));
}

#[test]
fn the_seas_shut_a_node_below_their_level_and_a_social_space_and_a_course_never_shut() {
    let (mission, _) = node_of(NodeKind::Mission, gear::Difficulty::Abyss);
    let mut low = gear::Character::starting();
    low.story.prologue = true;
    assert_eq!(mission.shut(&low), Some(gear::gate::Shut::Seas(gear::Difficulty::Abyss)));
    let (social, _) = node_of(NodeKind::Social, gear::Difficulty::Abyss);
    assert_eq!(social.shut(&gear::Character::starting()), None);
    assert_eq!(Room::new(Vec::new(), (0.0, 0.0)).shut(&gear::Character::starting()), None);
}

#[test]
fn a_prologue_finished_in_the_room_before_the_claim_answers_is_kept_and_a_kept_story_never_goes_back() {
    let (mut room, player) = node_of(NodeKind::Patrol, gear::Difficulty::Normal);
    let ask = Some(Asked::Gear(gear::Ask::FinishPrologue));
    room.input(player, Input { sequence: 1, ask, ..Input::default() }).expect("taken");
    room.tick();
    let claimed = gear::Character::starting();
    assert_eq!(room.shut_to(player, &claimed), None, "the story it already holds here is carried forward");
    assert!(room.restore_character(player, &claimed.to_json()));
    assert!(room.players[&player].character.story.prologue, "and kept after the restore");

    let (mut room, player) = node_of(NodeKind::Patrol, gear::Difficulty::Normal);
    let mut ahead = gear::Character::starting();
    ahead.story.prologue = true;
    assert!(!room.players[&player].character.story.prologue);
    assert_eq!(room.shut_to(player, &ahead), None);
    assert!(room.restore_character(player, &ahead.to_json()));
    assert!(room.players[&player].character.story.prologue, "a kept story ahead of the room's is never put back");
}

#[test]
fn an_elite_dungeons_node_keeps_out_a_character_short_of_the_prologue() {
    let (room, _) = node_of(NodeKind::Dungeon, gear::Difficulty::Normal);
    assert_eq!(room.shut(&gear::Character::starting()), Some(gear::gate::Shut::Prologue));
    let mut past = gear::Character::starting();
    past.story.prologue = true;
    assert_eq!(room.shut(&past), None);
}
