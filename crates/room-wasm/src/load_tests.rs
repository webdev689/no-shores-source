//! The sea room under load, measured as the host drives it: each tick, then every player's snapshot cut for them, at
//! 1, 8 and 16 players at sea among hostile ships, in one fight, and on boarded decks; and each road's group standing
//! in its patrol's room for the first time, its place's mesh baked then, from the bake's files; and the 18 Elite
//! Dungeons forged and opened. Run by hand, in release, to print the numbers (median, p99 and slowest milliseconds a
//! tick, and bytes a player a tick; milliseconds an opening and a standing; the slowest forge and opening):
//! `cargo test -p room-wasm --release load -- --ignored --nocapture`.

use super::*;
use naval::damage::Hurt;
use naval::fight::{CAPTAIN, Sailor};
use naval::ranks::{Commission, GREY_TITHE, Rank};
use room::hostiles::Hostile;
use std::time::Instant;

/// The sea's opening, as the host sends it: the world's own layout and its nine port cities.
fn request() -> String {
    let content = concat!(env!("CARGO_MANIFEST_DIR"), "/../../content/world");
    let layout = std::fs::read_to_string(format!("{content}/layout.json")).unwrap();
    let ports: Vec<serde_json::Value> = (1..=9)
        .map(|n| {
            let path = format!("{content}/land/continent-{n}.json");
            let file: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
            let city = &file["city"];
            let continent = format!("continent-{n}");
            serde_json::json!({ "id": city["id"], "name": city["name"], "continent": continent, "centre": city["centre"] })
        })
        .collect();
    format!(r#"{{"layout":{layout},"ports":{}}}"#, serde_json::Value::Array(ports))
}

fn with_sea<T>(using: impl FnOnce(&mut room::sea::Sea) -> T) -> T {
    with_open(|opened| match opened {
        Opened::Sea(sea) => using(sea),
        _ => panic!("not the sea"),
    })
    .unwrap()
}

/// Ticks `ticks` times, each tick followed by the snapshot cut for every player; answers the median, p99 and slowest
/// milliseconds a tick, and the mean bytes a player a tick.
// The wall clock is what this measures; the rules themselves never read it.
#[allow(clippy::disallowed_methods)]
fn run(players: &[PlayerId], ticks: usize) -> (f64, f64, f64, f64) {
    let mut times = Vec::new();
    let mut bytes = 0usize;
    for _ in 0..ticks {
        let started = Instant::now();
        room_tick();
        snapshot_door::prepare();
        for &player in players {
            bytes += snapshot_door::snapshot_for(player).len();
        }
        times.push(started.elapsed().as_secs_f64() * 1000.0);
    }
    times.sort_by(f64::total_cmp);
    let p99 = times[(times.len() * 99 / 100).min(times.len() - 1)];
    (times[times.len() / 2], p99, times[times.len() - 1], bytes as f64 / (ticks * players.len()) as f64)
}

/// Each port city's roadstead, as the sea reckons them, and the way from its city out to it: a new ship puts to sea
/// by a roadstead, as a player's does.
fn roadsteads() -> Vec<([f64; 2], [f64; 2])> {
    let request: SeaRequest = serde_json::from_str(&request()).unwrap();
    let harbours = room::harbour::Harbours::new(&request.layout, &request.ports);
    let out = |(id, at): &(String, [f64; 2])| {
        let centre = request.ports.iter().find(|port| port.id == *id).unwrap().centre;
        let (east, south) = (at[0] - centre[0], at[1] - centre[1]);
        let apart = (east * east + south * south).sqrt();
        (*at, [east / apart, south / apart])
    };
    harbours.ports.iter().map(out).collect()
}

/// Opens the sea and puts `count` players to sea as players put to sea: each by a port's roadstead (`by` chooses
/// which), on a course `out` metres off it away from its city, then another 20 km on.
fn open_with(count: usize, by: impl Fn(usize) -> usize, out: impl Fn(usize) -> f64, pace: u16) -> Vec<PlayerId> {
    assert!(open_sea(request().as_bytes(), 7));
    room_world_start(1_790_000_000.0);
    let ports = roadsteads();
    let players: Vec<PlayerId> = (0..count).map(|_| room_join()).collect();
    for (index, &player) in players.iter().enumerate() {
        let (at, away) = ports[by(index) % ports.len()];
        let point = |metres: f64| [at[0] + away[0] * metres, at[1] + away[1] * metres];
        let off = out(index);
        let answer = input(player, &protocol::course_bytes(&[point(off), point(off + 20_000.0)], pace));
        assert_eq!(answer, TAKEN, "player {index} by the roadstead at {at:?}");
    }
    // Under way, clear of the roadstead.
    for _ in 0..120 {
        room_tick();
    }
    players
}

/// Ticks until every player is in a fight, 10 s at most: a measurement of a fight that never began measures none.
fn until_met(players: &[PlayerId]) {
    for _ in 0..600 {
        if with_sea(|sea| players.iter().all(|&player| sea.fight_mut(player).is_some())) {
            return;
        }
        room_tick();
    }
    let unmet: Vec<usize> =
        with_sea(|sea| (0..players.len()).filter(|&index| sea.fight_mut(players[index]).is_none()).collect());
    panic!("players {unmet:?} met no hostile ship laid by them");
}

/// Where each player's ship is now.
fn ships_of(players: &[PlayerId]) -> Vec<[f64; 2]> {
    with_sea(|sea| {
        let at = |player: &PlayerId| sea.ships().find(|(each, _)| each == player).map(|(_, ship)| [ship.x, ship.y]);
        players.iter().map(|player| at(player).expect("at sea")).collect()
    })
}

#[test]
#[ignore = "a measurement, run by hand in release"]
fn load_at_sea_among_hostile_ships() {
    for count in [1, 8, 16] {
        let players = open_with(count, |index| index, |_| 2_000.0, 100);
        let ships = ships_of(&players);
        // Three wary Minors in each player's sight, which leave a sound Sloop be.
        with_sea(|sea| {
            for (index, &[x, y]) in ships.iter().enumerate() {
                for k in 0..3 {
                    let commission = Commission { faction: GREY_TITHE, rank: Rank::Minor };
                    let id = 10_000 + (index * 3 + k) as u32;
                    let at = [x + 3_000.0 * (k as f64 + 1.0), y + 2_000.0];
                    sea.put_to_sea(Hostile::standing(id, id, commission, at, 0.0, false));
                }
            }
        });
        let (median, p99, most, bytes) = run(&players, 600);
        eprintln!("AT SEA {count:>2} players: {median:.3} / {p99:.3} / {most:.3} ms; {bytes:.0} B a player a tick");
    }
}

#[test]
#[ignore = "a measurement, run by hand in release"]
fn load_in_one_fight() {
    for count in [1, 8, 16] {
        // Every ship off the second roadstead, out of Overlook's home waters, where no one is met: 40 m apart along
        // one course.
        let players = open_with(count, |_| 1, |index| 2_000.0 + index as f64 * 40.0, 5);
        let centre = ships_of(&players)[0];
        with_sea(|sea| {
            for k in 0..4 {
                let commission = Commission { faction: GREY_TITHE, rank: Rank::Elite };
                let id = 20_000 + k;
                let at = [centre[0] + 300.0 * f64::from(k), centre[1] - 600.0];
                sea.put_to_sea(Hostile {
                    level: 30,
                    ..Hostile::standing(id, id, commission, at, core::f64::consts::PI, true)
                });
            }
        });
        until_met(&players);
        let (median, p99, most, bytes) = run(&players, 600);
        eprintln!("ONE FIGHT {count:>2} players: {median:.3} / {p99:.3} / {most:.3} ms; {bytes:.0} B a player a tick");
    }
}

#[test]
#[ignore = "a measurement, run by hand in release"]
fn load_on_decks() {
    for count in [1, 8, 16] {
        // Off the second roadstead, out of Overlook's home waters, where no one is met: 60 m apart along one course.
        let players = open_with(count, |_| 1, |index| 2_000.0 + index as f64 * 60.0, 5);
        let ships = ships_of(&players);
        with_sea(|sea| {
            for (index, &[x, y]) in ships.iter().enumerate() {
                let commission = Commission { faction: GREY_TITHE, rank: Rank::Miniboss };
                let id = 30_000 + index as u32;
                sea.put_to_sea(Hostile {
                    level: 30,
                    ..Hostile::standing(id, id, commission, [x, y - 20.0], 0.0, true)
                });
            }
        });
        until_met(&players);
        with_sea(|sea| {
            for &player in &players {
                let fought = sea.fight_mut(player).expect("met");
                let clock = fought.fight.clock;
                for vessel in fought.fight.ships.values_mut() {
                    (vessel.ship.ahead, vessel.ship.abeam) = (0.0, 0.0);
                }
                let vessel = fought.fight.ships.get_mut(&CAPTAIN).unwrap();
                let hull = vessel.damage.max_hull * 0.97;
                vessel.damage.apply(Hurt { hull, sail: 0.0, crew: 0.0, fire: false }, clock, 0.0);
                if let Sailor::Captain(command) = &mut vessel.sailor {
                    command.struck_at = Some(clock);
                }
            }
        });
        let boarded = players.iter().filter(|&&player| input(player, &protocol::ask_bytes(2)) == TAKEN).count();
        let (median, p99, most, bytes) = run(&players, 60);
        eprintln!(
            "ON DECKS {count:>2} players ({boarded} boarded): {median:.3} / {p99:.3} / {most:.3} ms; {bytes:.0} B"
        );
    }
}

#[test]
#[ignore = "a measurement, run by hand in release, after `npm run bake`"]
// The wall clock is what this measures; the rules themselves never read it.
#[allow(clippy::disallowed_methods)]
fn load_of_a_roads_groups_standing() {
    use gear::quests::{Goal, Slay, quests};
    for (quest, def) in quests().quests.iter().enumerate() {
        for (task, goals) in def.tasks.iter().map(|task| &task.goals).enumerate() {
            for goal in goals {
                let Goal::Kill(Slay { node: Some(id), place: Some(place), spawn, .. }) = &goal.goal else { continue };
                if spawn.is_empty() {
                    continue;
                }
                let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../generated/nodes/").to_owned() + id + ".json";
                let text = std::fs::read_to_string(path).unwrap();
                let start = Instant::now();
                assert!(open_node(text.as_bytes()));
                let opening = start.elapsed().as_secs_f64() * 1000.0;
                let character = on_road(quest, task);
                let ticks = with_open(|opened| {
                    let Opened::Land { room, .. } = opened else { panic!("a node's room") };
                    let player = room.join().unwrap();
                    assert!(room.restore_character(player, &character.to_json()));
                    let node: serde_json::Value = serde_json::from_str(&text).unwrap();
                    let at = node["places"].as_array().unwrap().iter().find(|it| it["name"] == place.as_str()).unwrap();
                    let [x, y] = [at["at"][0].as_f64().unwrap(), at["at"][1].as_f64().unwrap()];
                    assert!(room.put_player(player, x, y + 140.0));
                    let timed = |room: &mut room::Room| {
                        let start = Instant::now();
                        room.tick();
                        start.elapsed().as_secs_f64() * 1000.0
                    };
                    // Its place's mesh is baked a slice a tick: ticked until it is kept, or a second at most.
                    let (mut slowest, mut baking) = (0.0_f64, 0);
                    while room.place_grounds() == 0 && baking < 60 {
                        slowest = slowest.max(timed(room));
                        baking += 1;
                    }
                    assert!(room.place_grounds() <= 1, "its place's mesh, baked as it first stands, or the node's own");
                    (slowest, baking, timed(room))
                });
                let (slowest, baking, after) = ticks.unwrap();
                eprintln!(
                    "STAND {id} '{place}': opens in {opening:.1} ms; its mesh over {baking} ticks, the slowest \
                     {slowest:.1} ms; then {after:.2} ms a tick"
                );
            }
        }
    }
}

#[test]
#[ignore = "a measurement, run by hand in release, after `npm run bake`"]
// The wall clock is what this measures; the rules themselves never read it.
#[allow(clippy::disallowed_methods)]
fn load_of_a_roads_steps() {
    use gear::quests::{Goal, GoalKind, quests};
    // The file's first escort, defence, puzzle, tail and unseen step; a player on each.
    for kind in [GoalKind::Escort, GoalKind::Defend, GoalKind::Puzzle, GoalKind::Tail, GoalKind::Unseen] {
        let follow = matches!(kind, GoalKind::Escort | GoalKind::Tail);
        let mut found = quests().quests.iter().enumerate().flat_map(|(quest, def)| {
            def.tasks
                .iter()
                .enumerate()
                .flat_map(move |(task, at)| at.goals.iter().map(move |goal| (quest, task, goal)))
        });
        let (quest, task, goal) = found.find(|(_, _, goal)| goal.kind() == kind).unwrap();
        let id = goal.goal.node().unwrap();
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../generated/nodes/").to_owned() + id + ".json";
        assert!(open_node(std::fs::read_to_string(path).unwrap().as_bytes()));
        let character = on_road(quest, task);
        let times = with_open(|opened| {
            let Opened::Land { room, .. } = opened else { panic!("a node's room") };
            let player = room.join().unwrap();
            let idle = (0..300).map(|_| tick_timed(room)).fold(0.0, f64::max);
            assert!(room.restore_character(player, &character.to_json()));
            let first = match &goal.goal {
                Goal::Escort(escort) => &escort.from,
                Goal::Tail(tail) => &tail.from,
                _ => goal.goal.place().unwrap(),
            };
            let start = room.place_grounds();
            let at = room_place(room, first);
            assert!(room.put_player(player, at[0], at[1] + if follow { 10.0 } else { 0.0 }));
            let mut mounted = room::Input { seen: room.clock(), ..room::Input::default() };
            mounted.intent.controls.mounted = true;
            room.input(player, mounted).unwrap();
            let begun = tick_timed(room);
            let mut ticks: Vec<f64> = (0..600)
                .map(|_| {
                    let seen = room.step_seen(player).figures;
                    if follow && seen.len() == 6 {
                        let back = seen[4] + core::f64::consts::PI;
                        let [x, y] = [seen[1] + back.sin() * 12.0, seen[2] - back.cos() * 12.0];
                        room.put_player(player, x, y);
                    }
                    tick_timed(room)
                })
                .collect();
            ticks.sort_by(f64::total_cmp);
            (idle, begun, (ticks[300], ticks[594], ticks[599]), room.place_grounds() - start)
        });
        let (idle, begun, (median, p99, most), baked) = times.unwrap();
        eprintln!(
            "STEP {kind:?} on {id}: slowest idle tick {idle:.2} ms; the tick it begins {begun:.1} ms ({baked} mesh baked); then {median:.2} ms a tick (p99 {p99:.2}, slowest {most:.1})"
        );
    }
}

/// A character on a quest's task: pledged to its house, every quest before it done.
fn on_road(quest: usize, task: usize) -> gear::Character {
    let mut character = gear::Character::starting();
    // A road is walked past the prologue, which a patrol's gate asks for.
    character.story.prologue = true;
    character.allegiance.pledge = gear::quests::quests().quests[quest].faction;
    character.quests.set_task(quest, task);
    // An escort rides only with its player on a horse.
    let id = character.take_id();
    let horse = gear::horses::horse(id, gear::horses::FIRST_HORSE).unwrap();
    character.items.insert(id, (horse, gear::character::At::Worn(gear::kinds::Slot::Mount)));
    character
}

/// A tick of the open room, timed in milliseconds.
#[allow(clippy::disallowed_methods)]
fn tick_timed(room: &mut room::Room) -> f64 {
    let start = Instant::now();
    room.tick();
    start.elapsed().as_secs_f64() * 1000.0
}

/// A place's middle in the open room, by its name.
fn room_place(room: &room::Room, name: &str) -> [f64; 2] {
    room.place(name).map(|place| place.at).unwrap()
}

/// The 18 Elite Dungeons, the largest and deepest a room opens: answers the slowest forge and the slowest opening
/// (its ground, its navmesh bake, its garrison and its encounters), milliseconds, with the dungeon each was.
// The wall clock is what this measures; the rules themselves never read it.
#[allow(clippy::disallowed_methods)]
#[test]
#[ignore = "a measurement, run by hand in release"]
fn load_of_opening_the_deepest_dungeons() {
    let (mut forge, mut open) = ((0.0, String::new()), (0.0, String::new()));
    for elite in gear::activities::elite_dungeons() {
        let started = Instant::now();
        let (seed, style) = room::elite_laid(elite.id).unwrap();
        let laid = dungeon::Dungeon::forge_within(seed, style, dungeon::ELITE_BLOCKS);
        let forged = started.elapsed().as_secs_f64() * 1000.0;
        let started = Instant::now();
        let of = room::RunOf::Elite { place: elite.id.into() };
        room::Room::dungeon_run(&of, gear::Difficulty::Normal, 29_919_420).unwrap();
        let opened = started.elapsed().as_secs_f64() * 1000.0;
        let name = format!("{} ({} storeys, {} cells)", elite.id, laid.storeys, laid.cells.len());
        if forged > forge.0 {
            forge = (forged, name.clone());
        }
        if opened > open.0 {
            open = (opened, name);
        }
    }
    eprintln!("slowest forge {:.1} ms: {}; slowest opening {:.1} ms: {}", forge.0, forge.1, open.0, open.1);
}
