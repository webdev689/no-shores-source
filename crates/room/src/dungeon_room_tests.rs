//! A patrol's dungeon as a room: it opens for each of a patrol's three, its garrison standing where the Forge puts
//! foes and no more than the room holds, its paths joining the way in to the Reeve, its rock and jambs stopping a body,
//! its rock hiding a player from a band that sees one in its own room, its cache opening for everyone in it when the
//! Reeve falls, and the dead standing again at the way in.

use super::*;
use crate::garrison::GREAT_STAND_AGAIN;
use crate::{Input, standing_on};
use combat::fighter::Action;
use combat::sight::{apart, off};
use combat::{FighterId, Intent};
use dungeon::{Cell, DOORWAY_HALF_M, SIDES, Side};
use movement::{Controls, Mode, TUNING};

const PATROLS: [&str; 3] = ["saltgrass-downs", "thunderhoof-grasslands", "whitewind-tundra"];
const LEVELS: Option<(u8, u8)> = Some((10, 14));

/// The room of a dungeon laid by a seed and a style where no patrol lays it, as a sea island's run lays it.
fn laid_by_seed(name: &str, seed: u32, style: dungeon::Style, levels: Option<(u8, u8)>) -> Option<Room> {
    Room::laid_dungeon(name, &Dungeon::forge(seed, style), levels, (REEVE, Miniboss), None)
}

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
fn a_dungeon_laid_by_a_seed_and_a_style_stands_as_a_patrols_does() {
    // A sea island's: no patrol, a seed and a style by its key.
    for (seed, key) in [(4242, "caverns"), (77, "crypt"), (9001, "mines")] {
        let style = dungeon::style_of(key).expect("a style");
        let room = laid_by_seed("isle-test--dungeon", seed, style, LEVELS).expect("an island's dungeon");
        let (arrival, _) = Dungeon::forge(seed, style).arrival();
        assert_eq!(room.section.as_ref().map(|section| section.spawns.clone()), Some(vec![arrival]));
        assert!(room.garrison.len() > 1 && room.cache().is_some(), "{key}: its bands and its cache");
        assert_eq!(room.garrison[0].members[0].1, Miniboss, "{key}: its Reeve");
    }
    let (seed, style) = dungeon::of_patrol(PATROLS[0], 0);
    let by_patrol = Room::dungeon(PATROLS[0], 0, LEVELS).expect("a patrol's dungeon");
    let by_seed = laid_by_seed(&format!("{}--dungeon-0", PATROLS[0]), seed, style, LEVELS).expect("the same");
    assert_eq!(by_patrol.living_foes(), by_seed.living_foes(), "the same dungeon, the same garrison");
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
fn no_foe_the_cache_or_the_arrival_stands_on_a_landmark() {
    let mut landmarks = 0;
    for nth in 0..30 {
        let patrol = format!("patrol-{nth}");
        for number in 0..dungeon::PER_PATROL {
            let room = Room::dungeon(&patrol, number, LEVELS).expect("a patrol's dungeon");
            let dungeon = forged(&patrol, number);
            let under = |at: [f64; 2]| {
                dungeon.under_landmark((at[1] / CELL_M) as usize * dungeon.columns + (at[0] / CELL_M) as usize)
            };
            for member in room.garrison.iter().flat_map(|post| post.members.iter()) {
                assert!(!under([member.2[0], member.2[1]]), "{patrol} {number}: a foe's post on a landmark");
            }
            for foe in room.foes.values() {
                assert!(!under([foe.fighter.body.x, foe.fighter.body.y]), "{patrol} {number}: a foe on a landmark");
            }
            let [x, y, ..] = room.cache().expect("its cache");
            assert!(!under([x, y]) && !under(dungeon.arrival().0), "{patrol} {number}: the cache or the arrival");
            landmarks += dungeon.landmarks.len();
        }
    }
    assert!(landmarks > 90, "{landmarks} landmarks among 90 dungeons");
}

#[test]
fn the_navmesh_leads_round_a_landmark_never_through_its_solids() {
    let mut routes = 0;
    for patrol in PATROLS {
        for number in 0..dungeon::PER_PATROL {
            let room = Room::dungeon(patrol, number, LEVELS).expect("a patrol's dungeon");
            let dungeon = &forged(patrol, number);
            for placed in &dungeon.landmarks {
                // The free cells of its room beside the footprint: a route from the first to the farthest.
                let beside: Vec<[f64; 2]> = placed
                    .cells
                    .iter()
                    .flat_map(|&cell| SIDES.into_iter().filter_map(move |side| dungeon.beside(cell, side)))
                    .filter(|&cell| dungeon.room_at(cell) == Some(placed.room) && !dungeon.holds_solid(cell))
                    .map(|cell| dungeon.centre(cell))
                    .collect();
                let Some(&from) = beside.first() else { continue };
                let to =
                    beside.iter().copied().max_by(|first, second| apart(from, *first).total_cmp(&apart(from, *second)));
                let Some(to) = to else { continue };
                let route = room.nav.find_path([from[0], from[1], 0.0], [to[0], to[1], 0.0]).expect("a way round");
                for pair in route.windows(2) {
                    let looks =
                        (apart([pair[0][0], pair[0][1]], [pair[1][0], pair[1][1]]) / 0.05).ceil().max(1.0) as u32;
                    for look in 0..=looks {
                        let share = f64::from(look) / f64::from(looks);
                        let (x, y) = (
                            pair[0][0] + (pair[1][0] - pair[0][0]) * share,
                            pair[0][1] + (pair[1][1] - pair[0][1]) * share,
                        );
                        let inside = placed.solids.iter().any(|&[min_x, min_y, max_x, max_y, _]| {
                            x > min_x + 1e-6 && x < max_x - 1e-6 && y > min_y + 1e-6 && y < max_y - 1e-6
                        });
                        assert!(!inside, "{patrol} {number}: the route through {}", placed.landmark.module);
                    }
                }
                routes += 1;
            }
        }
    }
    assert!(routes >= 9, "{routes} routes round a landmark");
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
fn the_cache_opens_with_a_dungeons_clear_for_each_player_in_when_the_reeve_falls_and_shuts_when_he_stands_again() {
    let mut room = Room::dungeon(PATROLS[2], 0, LEVELS).expect("a patrol's dungeon");
    let [x, y, _, facing, open] = room.cache().expect("a dungeon's room has its cache");
    let post = room.garrison[0].at;
    assert!((apart([x, y], [post[0], post[1]]) - CACHE_FROM_POST_M).abs() < 1e-9 && open == 0.0, "shut by the Reeve");
    assert!((facing - bearing([x, y], [post[0], post[1]])).abs() < 1e-12, "facing the Reeve's post");
    let Floor::Dungeon(ground) = &room.floor else { panic!("a dungeon's ground") };
    assert!(ground.clear_between([post[0], post[1]], [x, y], 0.0), "nothing between the Reeve and the cache");
    let players: Vec<PlayerId> = (0..2).map(|_| room.join().expect("room")).collect();
    run(&mut room, 1);
    assert!(players.iter().all(|player| room.drops_for(*player).count() == 0));
    let reeve = room.garrison[0].standing[0];
    let level = room.foes[&reeve].level;
    let items = |room: &Room, player: PlayerId| room.players[&player].character.items.len();
    let held: Vec<usize> = players.iter().map(|player| items(&room, *player)).collect();
    clear(&mut room, 0);
    run(&mut room, 1);
    assert_eq!(room.cache().map(|cache| cache[4]), Some(1.0), "open");
    let from = room.cache().map(|cache| [cache[0], cache[1], cache[2]]).unwrap();
    for (player, held) in players.iter().zip(held) {
        assert_eq!(items(&room, *player), held + 1, "an item for each player in the room, as a dungeon's clear pays");
        // Beside the item, now and then a Vestige at the Reeve's level, poured out of the cache.
        for drop in room.drops_for(*player) {
            assert!(matches!(&drop.what, crate::Dropped::Vestige(vestige) if vestige.level == level), "{drop:?}");
            assert!(apart([drop.at[0], drop.at[1]], [x, y]) < 1.0 && drop.from == from && drop.poured, "poured");
        }
    }
    let later = room.join().expect("room");
    let later_held = items(&room, later);
    run(&mut room, 1);
    assert_eq!(room.drops_for(later).count(), 0, "none for a player who came after");
    assert_eq!(items(&room, later), later_held, "nor an item");
    for player in players.into_iter().chain([later]) {
        room.leave(player);
    }
    run(&mut room, GREAT_STAND_AGAIN); // A Miniboss, who stands again in ten minutes.
    assert!(room.garrison[0].cleared_at.is_none(), "the Reeve stands again");
    assert_eq!(room.cache().map(|cache| cache[4]), Some(0.0), "shut");
}

#[test]
fn every_dungeons_cache_stands_by_its_reeve_its_open_chest_off_rock_every_solid_and_the_portals_arch() {
    for seed in 0..150 {
        for style in dungeon::STYLES {
            let dungeon = Dungeon::forge(seed, style);
            let floor = Floor::of_dungeon(&dungeon).expect("a dungeon's ground");
            let [post_x, post_y] = dungeon.centre(dungeon.nearest_middle(dungeon.end(), 1)[0]);
            let cache = cache_by(&floor, &dungeon, [post_x, post_y, 0.0]).expect("its cache");
            let [x, y, _] = cache.at;
            let (key, Floor::Dungeon(ground)) = (style.key, &floor) else { panic!("a dungeon's ground") };
            assert!((apart([x, y], [post_x, post_y]) - CACHE_FROM_POST_M).abs() < 1e-9, "{seed} {key}: by the Reeve");
            let [toward_x, toward_y] = dungeon.portal.side.unit();
            let [portal_x, portal_y] = dungeon.centre(dungeon.portal.cell);
            // Every 2 cm of the chest, from its lock in front to its open lid behind, across its width.
            let (back_x, back_y) = (-libm::sin(cache.facing), libm::cos(cache.facing));
            for step_across in 0..=45 {
                for step_back in 0..=42 {
                    let (across, back) = (f64::from(step_across) * 0.02 - 0.45, f64::from(step_back) * 0.02 - 0.03);
                    let (at_x, at_y) = (x - back_y * across + back_x * back, y + back_x * across + back_y * back);
                    let (column, row) = ((at_x / CELL_M).floor(), (at_y / CELL_M).floor());
                    let cell = (column >= 0.0 && row >= 0.0).then(|| row as usize * dungeon.columns + column as usize);
                    let open = cell.and_then(|cell| dungeon.cells.get(cell)).is_some_and(|&kind| kind != Cell::Rock);
                    assert!(open, "{seed} {key}: the chest in rock");
                    let in_solid = ground.solids().iter().any(|&[min_x, min_y, max_x, max_y, _]| {
                        (min_x..=max_x).contains(&at_x) && (min_y..=max_y).contains(&at_y)
                    });
                    assert!(!in_solid, "{seed} {key}: the chest in a solid");
                    let out = (portal_x - at_x) * toward_x + (portal_y - at_y) * toward_y + CELL_M / 2.0;
                    let along = (at_x - portal_x) * toward_y - (at_y - portal_y) * toward_x;
                    let before_arch = (0.0..=CELL_M / 2.0).contains(&out) && along.abs() <= ARCH_HALF_M;
                    assert!(!before_arch, "{seed} {key}: the chest before the portal's arch");
                }
            }
        }
    }
}

#[test]
fn the_dead_who_ask_stand_again_at_the_way_in_facing_into_the_room_before_any_checkpoint() {
    let mut room = Room::dungeon(PATROLS[0], 2, LEVELS).expect("a patrol's dungeon");
    let (arrival, toward) = forged(PATROLS[0], 2).arrival();
    let player = room.join().expect("room");
    let end = room.garrison[0].at;
    stand_player(&mut room, player, [end[0], end[1]]);
    room.players.get_mut(&player).expect("in").fighter.action = Action::Dead { elapsed: combat::tuning::RESPAWN };
    run(&mut room, 1);
    assert!(room.players[&player].fighter.dead(), "a page's player lies until they ask");
    room.players.get_mut(&player).expect("in").respawn_asked = true;
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

#[test]
fn a_cache_on_the_reeves_post_throws_its_vestige_onto_clear_floor() {
    // Posts where a body stands by rock or a solid and no way round them fits a chest, as a post on odd floor would.
    let style = dungeon::style_of("halls").expect("a style");
    let dungeon = Dungeon::forge(1, style);
    let floor = Floor::of_dungeon(&dungeon).expect("a dungeon's ground");
    let Floor::Dungeon(ground) = &floor else { panic!("a dungeon's ground") };
    let mut room = laid_by_seed("isle-test--dungeon", 1, style, LEVELS).expect("an island's dungeon");
    room.join().expect("a player for the cache to pay");
    room.garrison[0].cleared_at = Some(0);
    let (mut on_post, mut thrown) = (0, 0);
    for cell in (0..dungeon.cells.len()).filter(|&cell| dungeon.cells[cell] != Cell::Rock) {
        let [x, y] = dungeon.centre(cell);
        for step in 0..64 {
            let post = [x - 1.4 + f64::from(step % 8) * 0.4, y - 1.4 + f64::from(step / 8) * 0.4];
            if !ground.clear_between(post, post, TUNING.radius) {
                continue;
            }
            let cache = cache_by(&floor, &dungeon, [post[0], post[1], 0.0]).expect("its cache");
            if apart([cache.at[0], cache.at[1]], post) > 1e-9 {
                continue;
            }
            on_post += 1;
            room.cache = Some(cache);
            let before = room.drops.len();
            room.keep_cache();
            // A dungeon's clear leaves a Vestige one time in three: whatever this one threw.
            for vestige in &room.drops[before..] {
                thrown += 1;
                let lies = [vestige.at[0], vestige.at[1]];
                assert!(ground.clear_between(post, lies, 0.0), "{post:?}: its Vestige thrown into rock or a solid");
            }
        }
    }
    assert!(on_post > 0, "some post where no way round fits");
    assert!(thrown * 5 > on_post, "{thrown} Vestiges from {on_post} clears");
}

#[test]
fn a_player_leaving_a_dungeon_by_its_exit_door_or_its_open_portal_is_kept_as_come_out_and_none_leaving_elsewhere() {
    let mut room = Room::dungeon("saltgrass-downs", 0, None).expect("its first dungeon");
    let player = room.join().expect("a room with space");
    let (door, portal) = room.ways_out.expect("a dungeon's ways out");
    let out = |room: &Room| {
        let kept = gear::Character::from_json(&room.kept_character(player).expect("kept")).expect("a character");
        kept.left.expect("its body left").out
    };
    stand_player(&mut room, player, door);
    assert!(out(&room), "at its exit door");
    let middle = [(door[0] + portal[0]) / 2.0, (door[1] + portal[1]) / 2.0];
    stand_player(&mut room, player, middle);
    assert!(!out(&room), "within it, away from either way out");
    stand_player(&mut room, player, portal);
    assert!(!out(&room), "at its portal while it stands shut");
    room.cache.as_mut().expect("its cache").open = true;
    assert!(out(&room), "at its portal once it stands open");
}
