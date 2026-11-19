//! A patrol's dungeon as a room: it opens for each of a patrol's three, its garrison standing where the Forge puts
//! foes and no more than the room holds, its paths joining the way in to the Reeve, its rock and jambs stopping a body,
//! its rock hiding a player from a band that sees one in its own room, its cache opening for everyone in it when the
//! Reeve falls, and the dead standing again at the way in.

use super::*;
use crate::garrison::STAND_AGAIN;
use crate::{Input, standing_on};
use combat::fighter::Action;
use combat::sight::{apart, off};
use combat::{FighterId, Intent};
use dungeon::{DOORWAY_HALF_M, Side};
use movement::{Controls, Mode, TUNING};

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
            assert!(room.cache().is_some(), "{patrol} {number} has its cache");
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
    for patrol in PATROLS {
        for number in 0..dungeon::PER_PATROL {
            let dungeon = forged(patrol, number);
            let all = band_rooms(&dungeon, usize::MAX);
            assert_eq!(all.len(), dungeon.rooms.len() - 2, "every room but the way in's and the end");
            let size = |room: &usize| band_size(dungeon.rooms[*room].cells.len());
            for most in [5, 9, 13] {
                let few = band_rooms(&dungeon, most);
                assert!(few.iter().map(size).sum::<usize>() < most, "with the Reeve, {most} at most");
                // Each chosen room's place along the walk: equal stretches apart, give or take one room.
                let places: Vec<usize> =
                    few.iter().map(|room| all.iter().position(|found| found == room).unwrap()).collect();
                let gaps: Vec<usize> = places.windows(2).map(|pair| pair[1] - pair[0]).collect();
                let (low, high) = (gaps.iter().min().copied().unwrap_or(0), gaps.iter().max().copied().unwrap_or(0));
                assert!(high - low <= 1, "{patrol} {number}: spread evenly, {places:?} of {}", all.len());
            }
        }
    }
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
fn a_body_pressed_into_the_rock_or_a_jamb_stops_its_half_width_off_it_and_never_climbs() {
    let mut room = Room::dungeon(PATROLS[0], 1, LEVELS).expect("a patrol's dungeon");
    let dungeon = forged(PATROLS[0], 1);
    let player = room.join().expect("room for a player");
    let way_in = dungeon.way_in;
    let body = room.players[&player].fighter.body;
    let (arrival, toward) = dungeon.arrival();
    assert_eq!([body.x, body.y], arrival);
    assert!(off(body.facing, bearing([0.0, 0.0], toward)) < 1e-9, "facing into the room");
    // A run's tick is how far short of its half-width a body may stop.
    let tick = TUNING.run / 60.0;
    let stopped = walk(&mut room, player, way_in.side.bearing(), 240);
    let into = past(&dungeon, way_in.cell, way_in.side, stopped);
    let wall = CELL_M / 2.0 - TUNING.radius;
    assert!(into <= wall + 1e-9 && into > wall - tick, "stopped its half-width off the wall, {into} m past the middle");
    let frame = dungeon.frames[0];
    let [dx, dy] = frame.side.unit();
    let [x, y] = dungeon.centre(frame.cell);
    // Beside the doorway's opening, where its jamb stands in the corridor against the wall.
    let across = (DOORWAY_HALF_M + CELL_M / 2.0) / 2.0;
    stand_player(&mut room, player, [x + dx * 0.5 - dy * across, y + dy * 0.5 + dx * across]);
    let stopped = walk(&mut room, player, frame.side.bearing(), 240);
    let into = past(&dungeon, frame.cell, frame.side, stopped);
    assert!(into <= wall + 1e-9 && into > wall - tick, "the jamb stops it in its room, {into} m past");
    let body = room.players[&player].fighter.body;
    assert!(body.z.abs() < 1e-9 && body.mode == Mode::Ground, "four seconds pressed and it never climbs");
}

#[test]
fn the_cache_opens_with_a_vestige_for_each_player_in_when_the_reeve_falls_and_shuts_when_he_stands_again() {
    let mut room = Room::dungeon(PATROLS[2], 0, LEVELS).expect("a patrol's dungeon");
    let [x, y, _, facing, open] = room.cache().expect("a dungeon's room has its cache");
    let post = room.garrison[0].at;
    assert!((apart([x, y], [post[0], post[1]]) - CACHE_FROM_POST_M).abs() < 1e-9 && open == 0.0, "shut by the Reeve");
    assert!((facing - bearing([x, y], [post[0], post[1]])).abs() < 1e-12, "facing the Reeve's post");
    let Floor::Dungeon(ground) = &room.floor else { panic!("a dungeon's ground") };
    assert!(ground.solids().iter().all(|&[min_x, min_y, max_x, max_y, _]| {
        apart([x, y], [x.clamp(min_x, max_x), y.clamp(min_y, max_y)]) >= CACHE_CLEAR_M
    }));
    assert!(ground.clear_between([post[0], post[1]], [x, y], 0.0), "nothing between the Reeve and the cache");
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
        let sure = matches!(drops[0].what, crate::Dropped::Vestige(vestige) if vestige.level == level);
        assert!(apart([drops[0].at[0], drops[0].at[1]], [x, y]) < 1.0 && sure, "a Vestige at the Reeve's level");
        assert_eq!(
            drops[0].from,
            room.cache().map(|cache| [cache[0], cache[1], cache[2]]).unwrap(),
            "thrown out of it"
        );
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

/// Whether the straight line between two points crosses a rock cell, looked at every 2 cm along it.
fn through_rock(dungeon: &Dungeon, from: [f64; 2], to: [f64; 2]) -> bool {
    let looks = (apart(from, to) / 0.02).ceil() as u32;
    (0..=looks).any(|look| {
        let share = f64::from(look) / f64::from(looks);
        let (x, y) = (from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share);
        let cell = (y / CELL_M) as usize * dungeon.columns + (x / CELL_M) as usize;
        dungeon.cells[cell] == dungeon::Cell::Rock
    })
}

/// A band foe of a room, and two open cells' middles well inside its sight's range and arc: one of another place,
/// with rock between, and one of its own room, with nothing between.
fn band_foe_and_two_places(room: &Room, dungeon: &Dungeon) -> Option<(FighterId, [f64; 2], [f64; 2])> {
    let Floor::Dungeon(ground) = &room.floor else { return None };
    let ahead = |at: [f64; 2], aim: f64, there: [f64; 2], most: f64| {
        let distance = apart(at, there);
        distance > 2.0 && distance < most && off(aim, bearing(at, there)) < ::foes::tuning::SIGHT_ARC / 2.0
    };
    room.garrison[1..].iter().flat_map(|post| post.standing.iter()).find_map(|&id| {
        let body = room.foes[&id].fighter.body;
        let (at, aim) = ([body.x, body.y], room.foes[&id].fighter.aim);
        let own = room_at(dungeon, [body.x, body.y, body.z]);
        let open: Vec<[f64; 2]> = (0..dungeon.cells.len())
            .filter(|&cell| dungeon.cells[cell] != dungeon::Cell::Rock)
            .map(|cell| dungeon.centre(cell))
            .collect();
        let beyond = open.iter().copied().find(|&there| {
            room_at(dungeon, [there[0], there[1], 0.0]) != own
                && ahead(at, aim, there, ::foes::tuning::ENGAGE_RANGE - 2.0)
                && through_rock(dungeon, at, there)
        })?;
        let near = open.iter().copied().find(|&there| {
            room_at(dungeon, [there[0], there[1], 0.0]) == own
                && ahead(at, aim, there, 8.0)
                && ground.clear_between(at, there, 0.0)
        })?;
        Some((id, beyond, near))
    })
}

#[test]
fn a_band_foe_never_sees_a_player_beyond_the_rock_but_sees_one_in_its_own_room() {
    let mut cases = 0;
    for patrol in PATROLS {
        for number in 0..dungeon::PER_PATROL {
            let mut room = Room::dungeon(patrol, number, LEVELS).expect("a patrol's dungeon");
            let dungeon = forged(patrol, number);
            let Some((foe, beyond, near)) = band_foe_and_two_places(&room, &dungeon) else { continue };
            cases += 1;
            room.foes.retain(|id, _| *id == foe);
            let player = room.join().expect("room for a player");
            for _ in 0..240 {
                stand_player(&mut room, player, beyond);
                room.tick();
                let alertness = room.foes[&foe].brain.alertness();
                assert_eq!(alertness, ::foes::Alertness::Idle, "{patrol} {number}: {beyond:?} is beyond the rock");
            }
            let sees = (0..120).any(|_| {
                stand_player(&mut room, player, near);
                room.tick();
                room.foes[&foe].brain.alertness() == ::foes::Alertness::Alert
            });
            assert!(sees, "{patrol} {number}: {near:?} stands in its own room");
        }
    }
    assert!(cases >= 3, "{cases} dungeons with a band foe that faces the rock");
}
