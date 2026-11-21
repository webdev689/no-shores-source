//! The sea room under load, measured as the host drives it: each tick, then every player's snapshot cut for them, at
//! 1, 8 and 16 players at sea among hostile ships, in one fight, and on boarded decks; and a patrol's room opening with
//! and without its places' meshes, from the bake's files. Run by hand, in release, to print the numbers (median, p99
//! and slowest milliseconds a tick, and bytes a player a tick; milliseconds an opening):
//! `cargo test -p room-wasm --release load -- --ignored --nocapture`.

use super::*;
use naval::damage::Hurt;
use naval::fight::{CAPTAIN, Sailor};
use naval::ranks::{Commission, PIRATES, Rank};
use room::pirates::Pirate;
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

/// Players 60 km apart, four to a row.
fn spot(index: usize) -> [f64; 2] {
    [1_750_000.0 + (index % 4) as f64 * 60_000.0, 1_400_000.0 + (index / 4) as f64 * 60_000.0]
}

fn open_with(count: usize, at: impl Fn(usize) -> [f64; 2], pace: u16) -> Vec<PlayerId> {
    assert!(open_sea(request().as_bytes(), 7));
    room_world_start(1_790_000_000.0);
    let players: Vec<PlayerId> = (0..count).map(|_| room_join()).collect();
    for (index, &player) in players.iter().enumerate() {
        let [x, y] = at(index);
        let answer = input(player, &protocol::course_bytes(&[[x, y], [x + 50_000.0, y]], pace));
        assert_eq!(answer, TAKEN, "player {index} at {x},{y}");
    }
    players
}

#[test]
#[ignore = "a measurement, run by hand in release"]
fn load_at_sea_among_hostile_ships() {
    for count in [1, 8, 16] {
        let players = open_with(count, spot, 100);
        // Three wary Minors in each player's sight, which leave a sound Sloop be.
        with_sea(|sea| {
            for index in 0..count {
                let [x, y] = spot(index);
                for k in 0..3 {
                    let commission = Commission { faction: PIRATES, rank: Rank::Minor };
                    let id = 10_000 + (index * 3 + k) as u32;
                    let at = [x + 3_000.0 * (k as f64 + 1.0), y + 2_000.0];
                    sea.put_to_sea(Pirate::standing(id, id, commission, at, 0.0, false));
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
        let centre = [1_800_000.0, 1_500_000.0];
        let players = open_with(count, |index| [centre[0] + index as f64 * 40.0, centre[1]], 5);
        with_sea(|sea| {
            for k in 0..4 {
                let commission = Commission { faction: PIRATES, rank: Rank::Elite };
                let id = 20_000 + k;
                let at = [centre[0] + 300.0 * f64::from(k), centre[1] - 600.0];
                sea.put_to_sea(Pirate {
                    level: 30,
                    ..Pirate::standing(id, id, commission, at, core::f64::consts::PI, true)
                });
            }
        });
        for _ in 0..5 {
            room_tick();
        }
        let (median, p99, most, bytes) = run(&players, 600);
        eprintln!("ONE FIGHT {count:>2} players: {median:.3} / {p99:.3} / {most:.3} ms; {bytes:.0} B a player a tick");
    }
}

#[test]
#[ignore = "a measurement, run by hand in release"]
fn load_on_decks() {
    for count in [1, 8, 16] {
        let players = open_with(count, spot, 5);
        with_sea(|sea| {
            for index in 0..count {
                let [x, y] = spot(index);
                let commission = Commission { faction: PIRATES, rank: Rank::Miniboss };
                let id = 30_000 + index as u32;
                sea.put_to_sea(Pirate { level: 30, ..Pirate::standing(id, id, commission, [x, y - 20.0], 0.0, true) });
            }
        });
        room_tick();
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
fn load_of_a_patrols_places_meshes() {
    for id in ["saltgrass-downs", "gullwing-vale", "driftwood-moors"] {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../generated/nodes/").to_owned() + id + ".json";
        let mut node: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        let timed = |text: String| {
            let start = Instant::now();
            assert!(open_node(text.as_bytes()));
            start.elapsed().as_secs_f64() * 1000.0
        };
        let with = timed(node.to_string());
        let squares = with_open(|opened| match opened {
            Opened::Land { room, .. } => room.place_grounds(),
            _ => 0,
        });
        node["places"] = serde_json::json!([]);
        let without = timed(node.to_string());
        let each = (with - without) / squares.unwrap_or(1).max(1) as f64;
        eprintln!("OPEN {id}: {without:.1} ms without its places, {with:.1} ms with; {each:.1} ms a square");
    }
}
