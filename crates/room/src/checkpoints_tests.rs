//! An activity's checkpoints: a dungeon's at the doorway of each room whose band falls, its seals' and its Court's in
//! an Elite Dungeon, a mission's at each cleared post; the fallen standing at the one won farthest along, every player
//! told as it moves on; the ground held while anyone is in the room; and an Abyss wipe standing every band again.

use super::*;
use crate::encounters::encounters_tests::{elite_room, unseal};
use crate::garrison::STAND_AGAIN;
use crate::{EventKind, Floor, NodeKind, PlayerId, Room, RunOf, Section};
use combat::Action;
use combat::tuning::RESPAWN;

const PATROL: &str = "saltgrass-downs";
const LEVELS: Option<(u8, u8)> = Some((10, 14));

/// Kills every foe of a post's group still there.
fn clear(room: &mut Room, post: usize) {
    for id in room.garrison[post].standing.clone() {
        let Some(found) = room.foes.get_mut(&id) else { continue };
        (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    }
}

/// A player fallen long enough, asking to respawn, then the tick that stands them: where they stand.
fn respawned(room: &mut Room, player: PlayerId) -> [f64; 2] {
    let found = room.players.get_mut(&player).expect("in");
    (found.fighter.health, found.fighter.action, found.respawn_asked) = (0.0, Action::Dead { elapsed: RESPAWN }, true);
    room.tick();
    let body = room.players[&player].fighter.body;
    assert!(!room.players[&player].fighter.dead(), "stood again");
    [body.x, body.y]
}

fn told(room: &mut Room) -> Vec<f64> {
    room.take_events()
        .into_iter()
        .filter(|event| event.kind == EventKind::Checkpoint)
        .map(|event| event.amount)
        .collect()
}

#[test]
fn a_dungeon_lays_a_checkpoint_in_the_doorway_each_band_s_room_is_entered_by_facing_into_it() {
    let (seed, style) = dungeon::of_patrol(PATROL, 0);
    let laid = dungeon::Dungeon::forge(seed, style);
    let room = Room::dungeon(PATROL, 0, LEVELS).expect("a patrol's dungeon");
    let bands = room.garrison.len() - 1;
    assert!(bands > 0, "bands stand");
    assert_eq!(room.respawning.checkpoints.len(), bands, "one for each band's room");
    for checkpoint in &room.respawning.checkpoints {
        let cell = |[x, y]: [f64; 2]| (y / dungeon::CELL_M) as usize * laid.columns + (x / dungeon::CELL_M) as usize;
        let inside = laid.room_at(cell(checkpoint.at)).expect("on a room's cell");
        assert!(laid.frames.iter().any(|frame| frame.cell == cell(checkpoint.at)), "a doorway's cell");
        let ahead = [
            checkpoint.at[0] + libm::sin(checkpoint.facing) * dungeon::CELL_M,
            checkpoint.at[1] - libm::cos(checkpoint.facing) * dungeon::CELL_M,
        ];
        assert_eq!(laid.room_at(cell(ahead)), Some(inside), "facing into its room: {checkpoint:?}");
    }
}

#[test]
fn the_fallen_stand_at_the_band_fallen_farthest_along_and_every_player_is_told_as_it_moves_on() {
    let mut room = Room::dungeon(PATROL, 0, LEVELS).expect("a patrol's dungeon");
    let player = room.join().expect("in");
    let way_in = room.players[&player].fighter.body;
    room.take_events();
    let mut posts: Vec<(usize, f64)> = room
        .respawning
        .checkpoints
        .iter()
        .map(|found| (found.won, found.along))
        .filter_map(|(won, along)| if let Won::Post(post) = won { Some((post, along)) } else { None })
        .collect();
    posts.sort_by(|one, two| one.1.total_cmp(&two.1));
    let (nearest, farthest) = (posts[0].0, posts[posts.len() - 1].0);
    let number = |room: &Room, post: usize| {
        room.respawning.checkpoints.iter().position(|found| found.won == Won::Post(post)).expect("laid")
    };
    clear(&mut room, farthest);
    room.tick();
    assert_eq!(told(&mut room), [number(&room, farthest) as f64], "told as it is won");
    let at = room.respawning.checkpoints[number(&room, farthest)].at;
    assert_eq!(respawned(&mut room, player), at, "stood at its doorway");
    if nearest != farthest {
        clear(&mut room, nearest);
        room.tick();
        assert!(told(&mut room).is_empty(), "a room nearer the way in moves nothing on");
        assert_eq!(respawned(&mut room, player), at);
    }
    let mut fresh = Room::dungeon(PATROL, 0, LEVELS).expect("a patrol's dungeon");
    let alone = fresh.join().expect("in");
    let start = respawned(&mut fresh, alone);
    assert_eq!(start, [way_in.x, way_in.y], "before any, the way in");
}

#[test]
fn a_band_holds_the_ground_its_fall_won_while_anyone_is_in_the_room_and_stands_again_once_it_empties() {
    let mut room = Room::dungeon(PATROL, 0, LEVELS).expect("a patrol's dungeon");
    let player = room.join().expect("in");
    let post = 1;
    clear(&mut room, post);
    room.tick();
    let cleared = room.garrison[post].cleared_at.expect("cleared");
    room.clock = cleared + STAND_AGAIN + 1;
    room.tick();
    assert!(room.garrison[post].cleared_at.is_some(), "held while a player is in, however far off");
    room.leave(player);
    room.tick();
    assert!(room.garrison[post].cleared_at.is_none(), "a room no one is in stands it again as ever");
}

#[test]
fn an_elite_dungeon_lays_its_seals_and_its_court_and_the_court_s_is_won_as_its_boss_wakes() {
    let mut room = elite_room("krakens-grotto");
    let player = room.join().expect("in");
    let seals = room.encounters.as_ref().expect("encounters").seals.len();
    let laid = &room.respawning.checkpoints;
    let count = |of: fn(&Won) -> bool| laid.iter().filter(|found| of(&found.won)).count();
    assert_eq!(count(|won| matches!(won, Won::Seal(_))), seals, "one for each seal");
    assert_eq!(count(|won| *won == Won::Court), 1, "and the Court");
    unseal(&mut room);
    let court = room.respawning.checkpoints.iter().position(|found| found.won == Won::Court);
    assert_eq!(room.checkpoint(), court, "the Court's, farthest along");
    if let Some(boss) = room.boss() {
        room.send_away(&[boss]);
    }
    let at = room.respawning.checkpoints[court.expect("laid")].at;
    assert_eq!(respawned(&mut room, player), at, "the Boss gone, the dark lifts: stood at the Court's door");
}

#[test]
fn a_mission_lays_a_checkpoint_at_each_post_and_its_fallen_stand_at_the_cleared_one_farthest_from_the_landing() {
    let ring = vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]];
    let section = Section { ring, spawns: vec![[0.0, 180.0], [15.0, 185.0]], falls_kill: false };
    let mut room = Room::garrisoned(Floor::Flat, Vec::new(), section.clone(), NodeKind::Mission, ("keep", None));
    let posts: Vec<usize> = (0..room.garrison.len()).filter(|&post| !room.garrison[post].arrival).collect();
    assert_eq!(room.respawning.checkpoints.len(), posts.len(), "one for each post");
    let player = room.join().expect("in");
    let farthest = room.respawning.checkpoints.iter().max_by(|one, two| one.along.total_cmp(&two.along)).copied();
    let farthest = farthest.expect("laid");
    let Won::Post(post) = farthest.won else { panic!("a post's") };
    room.send_foes_away();
    room.garrison[post].cleared_at = Some(room.clock);
    assert_eq!(respawned(&mut room, player), farthest.at, "at the cleared post farthest along");
    let patrol = Room::garrisoned(Floor::Flat, Vec::new(), section, NodeKind::Patrol, ("downs", None));
    assert!(patrol.respawning.checkpoints.is_empty(), "a patrol zone keeps none");
}

#[test]
fn an_abyss_wipe_stands_every_band_again_so_its_fallen_begin_again_at_the_way_in() {
    let of = RunOf::Patrol { patrol: "gullwing-vale".into(), number: 1 };
    let mut room = Room::dungeon_run(&of, gear::Difficulty::Abyss, 29_919_420).expect("an Abyss run");
    let players = [room.join().expect("in"), room.join().expect("in")];
    clear(&mut room, 1);
    room.tick();
    assert!(room.checkpoint().is_some(), "won");
    for player in players {
        let found = room.players.get_mut(&player).expect("in");
        (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    }
    room.tick();
    assert_eq!(room.checkpoint(), None, "every band stands again");
}
