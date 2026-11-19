//! A patrol's dungeon as a room: it opens for each of a patrol's three, its garrison standing where the Forge puts
//! foes and no more than the room holds, its paths joining the way in to the Reeve, its rock and jambs stopping a body,
//! its cache opening for everyone in it when the Reeve falls, and the dead standing again at the way in.

use super::*;
use crate::garrison::STAND_AGAIN;
use crate::{Input, standing_on};
use combat::Intent;
use combat::fighter::Action;
use combat::sight::off;
use dungeon::{DOORWAY_HALF_M, Side};
use movement::{Controls, TUNING};

const PATROLS: [&str; 3] = ["saltgrass-downs", "thunderhoof-grasslands", "whitewind-tundra"];
const LEVELS: Option<(u8, u8)> = Some((10, 14));

/// Kills every foe of a post's group still there.
fn clear(room: &mut Room, post: usize) {
    for id in room.garrison[post].standing.clone() {
        let Some(found) = room.foes.get_mut(&id) else { continue };
        found.fighter.health = 0.0;
        found.fighter.action = Action::Dead { elapsed: 0 };
    }
}

fn run(room: &mut Room, ticks: u64) {
    for _ in 0..ticks {
        room.tick();
    }
}

/// Stands a player at (x, y) on the floor.
fn stand_player(room: &mut Room, player: PlayerId, at: [f64; 2]) {
    let body = standing_on(&room.floor, &room.blocks, at[0], at[1]);
    room.players.get_mut(&player).expect("in the room").fighter.body = body;
}

fn forged(patrol: &str, number: usize) -> Dungeon {
    let (seed, style) = dungeon::of_patrol(patrol, number);
    Dungeon::forge(seed, style)
}

/// The room of the dungeon a point stands in, if it is one.
fn room_at(dungeon: &Dungeon, at: [f64; 3]) -> Option<usize> {
    let (column, row) = ((at[0] / CELL_M) as usize, (at[1] / CELL_M) as usize);
    dungeon.room_at(row * dungeon.columns + column)
}

#[test]
fn a_dungeons_room_stands_its_reeve_alone_in_the_end_room_and_its_bands_past_the_way_in() {
    for patrol in PATROLS {
        for number in 0..dungeon::PER_PATROL {
            let room = Room::dungeon(patrol, number, LEVELS).expect("a patrol's dungeon");
            let dungeon = forged(patrol, number);
            let (arrival, _) = dungeon.arrival();
            assert_eq!(room.section.as_ref().map(|section| section.spawns.clone()), Some(vec![arrival]));
            assert!(room.living_foes() <= NODE_FOES_MOST, "{patrol} {number}: {} foes", room.living_foes());
            assert!(room.garrison.len() > 1, "{patrol} {number} stands bands");
            let reeve = &room.garrison[0];
            assert_eq!(
                reeve.members.iter().map(|member| (member.0, member.1)).collect::<Vec<_>>(),
                [(REEVE, Miniboss)]
            );
            assert_eq!(
                room_at(&dungeon, reeve.at),
                Some(dungeon.end()),
                "{patrol} {number}: the Reeve in the end room"
            );
            let mut rooms = Vec::new();
            for post in &room.garrison[1..] {
                let band = room_at(&dungeon, post.members[0].2).expect("a band stands in a room");
                assert!(band != dungeon.way_in.room && band != dungeon.end(), "{patrol} {number}: room {band}");
                assert!(post.members.iter().all(|member| room_at(&dungeon, member.2) == Some(band)));
                assert!((2..=4).contains(&post.members.len()));
                assert!(post.members.iter().all(|member| DUNGEON.contains(&(member.0, member.1))));
                rooms.push(band);
            }
            assert!(rooms.iter().enumerate().all(|(at, band)| !rooms[..at].contains(band)), "one band a room");
            let levels: Vec<u8> = room.foes.values().map(|foe| foe.level).collect();
            assert!(levels.iter().all(|level| (10..=14).contains(level)), "{levels:?}");
        }
    }
    assert!(Room::dungeon(PATROLS[0], dungeon::PER_PATROL, LEVELS).is_none(), "a patrol has three");
}

#[test]
fn bands_past_the_rooms_most_are_spread_evenly_along_the_walk() {
    let dungeon = forged(PATROLS[0], 0);
    let all = band_rooms(&dungeon, usize::MAX);
    assert_eq!(all.len(), dungeon.rooms.len() - 2, "every room but the way in's and the end");
    let few = band_rooms(&dungeon, 7);
    let size = |room: &usize| band_size(dungeon.rooms[*room].cells.len());
    assert!(!few.is_empty() && 1 + few.iter().map(size).sum::<usize>() <= 7);
    let walks: Vec<u32> = few.iter().map(|&room| dungeon.rooms[room].walk).collect();
    assert!(walks.is_sorted() && few.len() < all.len(), "{walks:?}");
    assert!(few[0] != all[0] && few[few.len() - 1] != all[all.len() - 1], "spread, not the first nor the last");
}

#[test]
fn a_path_joins_the_way_in_and_the_reeves_post() {
    for number in 0..dungeon::PER_PATROL {
        let room = Room::dungeon(PATROLS[1], number, LEVELS).expect("a patrol's dungeon");
        let (arrival, _) = forged(PATROLS[1], number).arrival();
        let route = room.nav.find_path([arrival[0], arrival[1], 0.0], room.garrison[0].at);
        assert!(route.is_some_and(|route| route.iter().all(|point| point[2].abs() < 0.05)), "dungeon {number}");
    }
}

/// An input walking the way `yaw` faces.
fn walking(sequence: u32, yaw: f64) -> Input {
    let controls = Controls { forward: 1.0, yaw, ..Controls::default() };
    Input { sequence, intent: Intent { controls, ..Intent::default() }, ..Input::default() }
}

/// Walks a player the way `yaw` faces for `ticks`; where they stand then.
fn walk(room: &mut Room, player: PlayerId, yaw: f64, ticks: u32) -> [f64; 2] {
    let sequence = room.players[&player].received;
    for step in 1..=ticks {
        room.input(player, walking(sequence + step, yaw)).expect("in order");
        room.tick();
    }
    let body = room.players[&player].fighter.body;
    [body.x, body.y]
}

/// How far past a cell's middle a point lies toward one of its sides.
fn past(dungeon: &Dungeon, cell: usize, side: Side, at: [f64; 2]) -> f64 {
    let ([x, y], [dx, dy]) = (dungeon.centre(cell), side.unit());
    (at[0] - x) * dx + (at[1] - y) * dy
}

#[test]
fn a_body_walked_into_the_rock_stops_at_the_wall_and_a_jamb_leaves_no_gap_at_the_wall() {
    let mut room = Room::dungeon(PATROLS[0], 1, LEVELS).expect("a patrol's dungeon");
    let dungeon = forged(PATROLS[0], 1);
    let player = room.join().expect("room for a player");
    let way_in = dungeon.way_in;
    let body = room.players[&player].fighter.body;
    let (arrival, toward) = dungeon.arrival();
    assert_eq!([body.x, body.y], arrival);
    assert!(off(body.facing, bearing([0.0, 0.0], toward)) < 1e-9, "facing into the room");
    let stopped = walk(&mut room, player, way_in.side.bearing(), 120);
    let into = past(&dungeon, way_in.cell, way_in.side, stopped);
    assert!(into < CELL_M / 2.0 && into > CELL_M / 2.0 - 0.6, "stopped at the wall, {into} m past the middle");
    let frame = dungeon.frames[0];
    let [dx, dy] = frame.side.unit();
    let [x, y] = dungeon.centre(frame.cell);
    // Beside the doorway's opening, where its jamb stands in the corridor against the wall.
    let across = (DOORWAY_HALF_M + CELL_M / 2.0) / 2.0;
    stand_player(&mut room, player, [x + dx * 0.5 - dy * across, y + dy * 0.5 + dx * across]);
    // Half a second takes it to the jamb and no further; longer, it climbs, as a body climbs any block too high to grab.
    let stopped = walk(&mut room, player, frame.side.bearing(), 30);
    let into = past(&dungeon, frame.cell, frame.side, stopped);
    assert!(into <= CELL_M / 2.0 - TUNING.radius + 0.01 && into > 1.0, "the jamb stops it in its room, {into} m past");
}

#[test]
fn the_cache_opens_with_a_vestige_for_each_player_in_when_the_reeve_falls_and_shuts_when_he_stands_again() {
    let mut room = Room::dungeon(PATROLS[2], 0, LEVELS).expect("a patrol's dungeon");
    let [x, y, _, facing, open] = room.cache().expect("a dungeon's room has its cache");
    let post = room.garrison[0].at;
    assert!((apart([x, y], [post[0], post[1]]) - CACHE_FROM_POST_M).abs() < 1e-9 && open == 0.0, "shut by the Reeve");
    assert!((facing - bearing([x, y], [post[0], post[1]])).abs() < 1e-12, "facing the Reeve's post");
    assert!(room.blocks.iter().all(|block| {
        apart([x, y], [x.clamp(block.min_x, block.max_x), y.clamp(block.min_y, block.max_y)]) >= CACHE_CLEAR_M
    }));
    let players: Vec<PlayerId> = (0..2).map(|_| room.join().expect("room")).collect();
    run(&mut room, 1);
    assert!(players.iter().all(|player| room.drops_for(*player).count() == 0));
    let reeve = room.garrison[0].standing[0];
    let level = room.foes[&reeve].level;
    clear(&mut room, 0);
    run(&mut room, 1);
    assert_eq!(room.cache().map(|cache| cache[4]), Some(1.0), "open");
    for player in &players {
        let drops: Vec<&crate::Drop> = room.drops_for(*player).collect();
        assert_eq!(drops.len(), 1, "one Vestige for each player in the room");
        assert!(apart([drops[0].at[0], drops[0].at[1]], [x, y]) < 1.0 && drops[0].vestige.level == level);
    }
    let later = room.join().expect("room");
    run(&mut room, 1);
    assert_eq!(room.drops_for(later).count(), 0, "none for a player who came after");
    for player in players.into_iter().chain([later]) {
        room.leave(player);
    }
    run(&mut room, STAND_AGAIN);
    assert!(room.garrison[0].cleared_at.is_none(), "the Reeve stands again");
    assert_eq!(room.cache().map(|cache| cache[4]), Some(0.0), "shut");
}

#[test]
fn the_dead_stand_again_at_the_way_in_facing_into_the_room() {
    let mut room = Room::dungeon(PATROLS[0], 2, LEVELS).expect("a patrol's dungeon");
    let (arrival, toward) = forged(PATROLS[0], 2).arrival();
    let player = room.join().expect("room");
    let end = room.garrison[0].at;
    stand_player(&mut room, player, [end[0], end[1]]);
    room.players.get_mut(&player).expect("in").fighter.action = Action::Dead { elapsed: combat::tuning::RESPAWN };
    run(&mut room, 1);
    let body = room.players[&player].fighter.body;
    assert_eq!([body.x, body.y], arrival);
    assert!(off(body.facing, bearing([0.0, 0.0], toward)) < 1e-9, "{body:?} {toward:?}");
}
