use super::*;
use combat::fighter::Action;
use combat::tuning::RESPAWN;
use movement::{Block, Controls, Heights, Terrain};

/// A deck 2.3 m up, from x -5 to 5, and the open floor beside it.
fn deck() -> Block {
    Block { min_x: -5.0, min_y: -4.0, max_x: 5.0, max_y: 4.0, top: 2.3, bottom: 0.0 }
}

#[test]
fn a_player_joins_and_stands_again_on_the_top_of_the_block_under_the_spawn() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let body = room.players[&player].fighter.body;
    assert_eq!((body.x, body.y, body.z), (0.0, 0.0, 2.3));
    let fighter = &mut room.players.get_mut(&player).unwrap().fighter;
    fighter.health = 0.0;
    fighter.action = Action::Dead { elapsed: RESPAWN };
    room.tick();
    assert_eq!(room.players[&player].fighter.body.z, 2.3, "the respawn stands on the deck, not under it");
}

#[test]
fn a_spawn_off_every_block_stands_on_the_floor() {
    let mut room = Room::new(vec![deck()], (8.0, 0.0));
    let player = room.join().expect("a room with space");
    assert_eq!(room.players[&player].fighter.body.z, 0.0);
}

#[test]
fn a_foe_stood_by_the_page_stands_on_the_top_under_it_facing_as_asked_at_its_level_posted_there() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    let foe = room.stand_foe_at(14, 1, (2.0, 1.0), 1.5, 3).expect("a pirate Swordsman");
    let seen = room.foes_seen().find(|seen| seen.foe == foe).unwrap();
    assert_eq!((seen.foe_type, seen.rank, seen.level), (14, 1, 3));
    assert_eq!((seen.fighter.body.x, seen.fighter.body.y, seen.fighter.body.z), (2.0, 1.0, 2.3));
    assert_eq!(seen.fighter.aim, 1.5);
    let brain = format!("{:?}", room.foes[&foe].brain);
    assert!(
        brain.contains("home: Some(Home { at: [2.0, 1.0, 2.3], facing: 1.5, marching: false })"),
        "posted where it stands: {brain}"
    );
    assert_eq!(room.stand_foe_at(99, 1, (2.0, 1.0), 0.0, 0), None, "no type has that number");
}

#[test]
fn a_type_asked_at_a_rank_it_has_not_comes_at_its_first() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    let thule = room.stand_foe_at(12, 1, (0.0, 0.0), 0.0, 4).unwrap();
    assert_eq!(room.foes_seen().find(|seen| seen.foe == thule).unwrap().rank, ::foes::Rank::Boss as u8);
}

#[test]
fn the_page_stands_no_more_foes_than_the_room_holds() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    let stood = (0..FOES_MOST + 3).filter_map(|_| room.stand_foe_at(7, 1, (0.0, 0.0), 0.0, 1)).count();
    assert_eq!(stood, FOES_MOST);
}

#[test]
fn a_boss_the_page_stood_calls_no_one_in_its_last_phase() {
    let mut room = Room::new(vec![deck()], (0.0, 3.0));
    let player = room.join().expect("a room with space");
    let boss = room.stand_foe_at(12, 5, (0.0, -2.5), 0.0, 0).unwrap();
    for _ in 0..400 {
        let found = room.foes.get_mut(&boss).unwrap();
        found.fighter.health = 0.3 * found.fighter.health_max;
        room.tick();
        let whole = room.players[&player].fighter.health_max;
        room.players.get_mut(&player).unwrap().fighter.health = whole;
    }
    assert!(room.foes_seen().any(|seen| seen.foe == boss && seen.phase == 3), "it reached its last phase");
    assert_eq!(room.foes.len(), 1, "and called no crew");
}

#[test]
fn the_page_sends_every_foe_away_at_once() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    room.stand_foe_at(7, 1, (2.0, 1.0), 0.0, 1).unwrap();
    room.stand_foe_at(12, 5, (-2.0, 1.0), 0.0, 4).unwrap();
    room.clear_foes();
    assert_eq!(room.foes_seen().count(), 0);
    assert!(room.quiet.is_empty());
}

#[test]
fn a_checkpoint_moves_where_the_next_respawn_stands() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    let player = room.join().expect("a room with space");
    room.set_spawn(4.0, -3.0);
    let fighter = &mut room.players.get_mut(&player).unwrap().fighter;
    fighter.health = 0.0;
    fighter.action = Action::Dead { elapsed: RESPAWN };
    room.tick();
    let body = room.players[&player].fighter.body;
    assert_eq!((body.x, body.y, body.z), (4.0, -3.0, 2.3));
}

#[test]
fn a_player_put_somewhere_stands_there_at_once_keeping_their_health() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let fighter = &mut room.players.get_mut(&player).unwrap().fighter;
    fighter.health = 40.0;
    fighter.body = Body { z: -1.0, vz: -6.0, ..standing(9.0, 9.0) };
    assert!(room.put_player(player, -3.0, 2.0));
    let fighter = room.players[&player].fighter;
    assert_eq!((fighter.body.x, fighter.body.y, fighter.body.z, fighter.body.vz), (-3.0, 2.0, 2.3, 0.0));
    assert_eq!(fighter.health, 40.0);
    assert!(!room.put_player(99, 0.0, 0.0), "no such player");
}

#[test]
fn a_block_stood_after_the_room_opened_stops_a_player() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    let player = room.join().expect("a room with space");
    room.stand_block(Block { min_x: -5.0, min_y: -2.0, max_x: 5.0, max_y: -1.5, top: 5.0, bottom: 0.0 });
    let north = combat::Intent {
        controls: movement::Controls { forward: 1.0, yaw: 0.0, ..movement::Controls::default() },
        ..combat::Intent::default()
    };
    // Half a second of walking north would take the body 2.2 m, past where the block stands.
    for sequence in 1..=30 {
        room.input(player, Input { sequence, intent: north, ..Input::default() }).unwrap();
        room.tick();
    }
    let body = room.players[&player].fighter.body;
    assert!(body.y > -1.5, "the block stands in the way: {body:?}");
}

#[test]
fn a_block_taken_from_the_course_lets_a_player_through_and_only_a_block_it_holds_is_taken() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let gate = Block { min_x: -5.0, min_y: -2.0, max_x: 5.0, max_y: -1.5, top: 5.0, bottom: 0.0 };
    room.stand_block(gate);
    assert!(room.take_block(gate));
    assert!(!room.take_block(gate), "it is gone");
    let north = combat::Intent {
        controls: movement::Controls { forward: 1.0, yaw: 0.0, ..movement::Controls::default() },
        ..combat::Intent::default()
    };
    for sequence in 1..=30 {
        room.input(player, Input { sequence, intent: north, ..Input::default() }).unwrap();
        room.tick();
    }
    let body = room.players[&player].fighter.body;
    assert!(body.y < -2.0, "the way is open: {body:?}");
}

#[test]
fn a_foe_found_off_the_course_over_the_sea_stands_again_at_its_post() {
    let mut room = Room::over_sea(vec![deck()], (0.0, 0.0));
    let foe = room.stand_foe_at(7, 1, (4.0, 1.0), 0.5, 1).expect("a Deckhand");
    room.foes.get_mut(&foe).unwrap().fighter.body = Body { z: 0.0, ..movement::standing(9.0, 1.0) };
    room.tick();
    let body = room.foes[&foe].fighter.body;
    assert_eq!((body.x, body.y, body.z, body.facing), (4.0, 1.0, 2.3, 0.5), "back at its post on the deck");
}

/// The wreck's ground as its export laid it.
fn wreck_course() -> Vec<Block> {
    let file: serde_json::Value =
        serde_json::from_str(include_str!("../../../content/prologue/wreck.json")).expect("the wreck's file");
    let number = |block: &serde_json::Value, key: &str| block[key].as_f64().expect("a block's number");
    let blocks = file["course"].as_array().expect("its blocks");
    blocks
        .iter()
        .map(|block| Block {
            min_x: number(block, "minX"),
            min_y: number(block, "minY"),
            max_x: number(block, "maxX"),
            max_y: number(block, "maxY"),
            top: number(block, "top"),
            // The page stands the wreck's blocks from the sea up (`wreckLayout.ts`).
            bottom: 0.0,
        })
        .collect()
}

#[test]
fn every_outer_edge_of_the_wreck_holds_a_body_running_and_jumping_off_it() {
    // Each run is 0.8 s, under 7 m: the blocks within this of where it starts are all it meets. No ground of the
    // wreck lies lower than LOWEST_M over the sea (tools/wreck/wreck_course.py): a body under it is in the sea.
    const REACH_M: f64 = 8.0;
    const LOWEST_M: f64 = 0.5;
    let course = wreck_course();
    let room = Room::over_sea(course.clone(), (0.0, 0.0));
    let Floor::Sea(rim) = &room.floor else { panic!("a room over the sea") };
    let half = course::RIM_CELL_M / 2.0;
    let mut edges = 0;
    for block in &course {
        let mut x = block.min_x + half;
        while x < block.max_x {
            let mut y = block.min_y + half;
            while y < block.max_y {
                for (bearing, (east, south)) in
                    [(0.0, (0.0, -1.0)), (1.0, (1.0, 0.0)), (2.0, (0.0, 1.0)), (3.0, (-1.0, 0.0))]
                {
                    let beyond = (x + east * course::RIM_CELL_M, y + south * course::RIM_CELL_M);
                    if rim.stands_at(beyond.0, beyond.1) {
                        continue;
                    }
                    edges += 1;
                    let near: Vec<Block> = course
                        .iter()
                        .filter(|other| other.max_x > x - REACH_M && other.min_x < x + REACH_M)
                        .filter(|other| other.max_y > y - REACH_M && other.min_y < y + REACH_M)
                        .copied()
                        .collect();
                    let yaw = bearing * std::f64::consts::FRAC_PI_2;
                    let run = Controls { forward: 1.0, yaw, run: true, ..Controls::default() };
                    let mut body = room.on_top(x, y);
                    for tick in 0..48 {
                        let controls = Controls { jump: tick % 24 == 12, ..run };
                        body = movement::step_body(&body, &controls, &near, &room.floor, movement::TICK_SECONDS);
                    }
                    assert!(
                        rim.stands_at(body.x, body.y) && body.z > LOWEST_M - 1e-9,
                        "held at the edge running from ({x:.2}, {y:.2}) at {yaw:.2}: {body:?}"
                    );
                }
                y += course::RIM_CELL_M;
            }
            x += course::RIM_CELL_M;
        }
    }
    assert!(edges > 1000, "the wreck's outer edges were walked: {edges}");
}

#[test]
fn the_sea_round_a_course_is_at_0_m_for_what_falls_or_flies_over_it() {
    let room = Room::over_sea(vec![deck()], (0.0, 0.0));
    assert_eq!(room.floor.height_at(9.0, 0.0), 0.0, "the sea, not the rim's wall");
    assert!(room.floor.walled((4.0, 0.0), (9.0, 0.0)), "yet no body walks out to it");
}

#[test]
fn the_rim_round_the_wreck_holds_its_blocks_cell_for_cell_as_the_page_s_does() {
    // The page's rimOf is checked against the same measure (wreckLayout.test.ts): both hold the blocks' area.
    let course = wreck_course();
    let rim = Heights::rim(&course, course::RIM_CELL_M);
    let floats = rim.to_floats();
    let open = floats[movement::heights::SHAPE_FLOATS..].iter().filter(|height| **height == 0.0).count();
    let area: f64 = course.iter().map(|block| (block.max_x - block.min_x) * (block.max_y - block.min_y)).sum();
    let held = open as f64 * course::RIM_CELL_M * course::RIM_CELL_M;
    assert!((held - area).abs() < 1.0, "the rim holds {held:.0} m2 of the blocks' {area:.0}");
}
