//! Parked ships through the door, as a place's room names its players to the sea and is told the ships lying at its
//! island, and as each room sends them: the sea to players within sight, the island's room to everyone but the ship's
//! own player. server/parked.test.ts runs the same through the WebAssembly and pins the same answer.

use super::{land_parked, sea_ashore};
use crate::{TAKEN, gear_door, input, isle_door, open_sea, room_join, room_leave, room_tick, snapshot_door};
use protocol::wire::overlook::wire as messages;
use room::PlayerId;

/// A sea round one square continent 100 km a side, its north-west corner 100 km from the frame's.
const SQUARE_SEA: &str = r#"{ "continents": [{ "id": "continent-2", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;

/// The sea's answer to the word naming Ann ashore on the square, pinned: the WebAssembly answers the same
/// (server/parked.test.ts).
pub const ANSWER: &str = r#"[{"account":"ann","number":1,"x":80000.0,"y":150000.0,"heading":0.0,"hull":0,"dress":[0,10,18,30],"name":[255,255],"emblem":0}]"#;

/// A player who joins the sea and comes to rest at `at`, of `account` if one is given.
fn at_rest(account: Option<&str>, at: [f64; 2]) -> PlayerId {
    let player = room_join();
    if let Some(account) = account {
        assert!(gear_door::own(player, account.as_bytes()));
    }
    assert_eq!(input(player, &protocol::course_bytes(&[at], 10)), TAKEN);
    player
}

/// The ships a snapshot carries, each its number and pace; and the numbers its plates are over.
fn ships_in(bytes: &[u8]) -> (Vec<(PlayerId, u16)>, Vec<PlayerId>, u64) {
    let snapshot = messages::root_as_from_room(bytes).unwrap().snapshot().unwrap();
    let ships =
        snapshot.ships().map_or(Vec::new(), |ships| ships.iter().map(|ship| (ship.player(), ship.pace())).collect());
    let plates = snapshot.plates().map_or(Vec::new(), |plates| plates.iter().map(|plate| plate.player()).collect());
    (ships, plates, snapshot.base())
}

#[test]
fn a_ship_left_at_rest_is_told_to_its_islands_room_and_seen_at_sea_within_sight_at_rest_with_its_plate() {
    assert!(open_sea(SQUARE_SEA.as_bytes(), 66));
    let ann = at_rest(Some("ann"), [80_000.0, 150_000.0]);
    room_tick();
    room_leave(ann);
    let (near, far) = (at_rest(None, [90_000.0, 150_000.0]), at_rest(None, [10_000.0, 30_000.0]));
    room_tick();
    assert_eq!(sea_ashore(br#"{"accounts":["ann"],"continent":"continent-2"}"#), ANSWER);
    snapshot_door::prepare();
    let (ships, plates, _) = ships_in(&snapshot_door::snapshot_for(near));
    assert_eq!(ships, [(near, 0), (ann, 0)], "within sight, at rest");
    assert!(plates.contains(&ann), "with its plate");
    assert_eq!(ships_in(&snapshot_door::snapshot_for(far)).0, [(far, 0)], "past sight");
    assert_eq!(sea_ashore(br#"{"accounts":["ann"]}"#), "[]", "a run at sea lies at no island");
    assert_eq!(sea_ashore(b"not a word"), "", "a word that does not read is answered with nothing");
}

#[test]
fn an_islands_room_sends_every_ship_parked_at_it_but_the_viewers_own_whole_and_then_as_it_changes() {
    assert!(!land_parked(b"[]"), "no room on land open");
    let word = r#"{"seed":"41","climate":"desert","at":[700000,300000],"guards":0,"levels":null}"#;
    assert!(isle_door::open_island(word.as_bytes()));
    let (ann, bea) = (room_join(), room_join());
    assert!(gear_door::own(ann, b"ann") && gear_door::own(bea, b"bea"));
    let ship = |account: &str, number: u32| {
        format!(
            r#"{{"account":"{account}","number":{number},"x":700100.0,"y":300200.0,"heading":1.5,"hull":1,"dress":[1,2,3,4],"name":[5,6],"emblem":7}}"#
        )
    };
    let both = format!("[{},{}]", ship("ann", 7), ship("bea", 8));
    assert!(land_parked(both.as_bytes()));
    assert!(!land_parked(b"not ships"));
    room_tick();
    let (shown, _, base) = ships_in(&snapshot_door::snapshot(ann));
    assert_eq!((shown, base), (vec![(8, 0)], 0), "never the viewer's own ship");
    let seen = |sequence: u32, player: PlayerId| {
        let tick = room_tick_now();
        let bytes = protocol::input_bytes(&room::Input { sequence, seen: tick, ..room::Input::default() });
        assert_eq!(input(player, &bytes), TAKEN);
        room_tick();
        ships_in(&snapshot_door::snapshot(player))
    };
    let (shown, _, base) = seen(1, ann);
    assert!(shown.is_empty() && base > 0, "standing as the base's, left out");
    assert!(land_parked(format!("[{}]", ship("ann", 7)).as_bytes()));
    let (shown, _, base) = seen(2, ann);
    assert_eq!((shown, base), (vec![], 0), "none now: sent whole");
    let (shown, _, base) = ships_in(&snapshot_door::snapshot(bea));
    assert_eq!((shown, base), (vec![(7, 0)], 0), "and to another, Ann's");
}

/// The open room's clock.
fn room_tick_now() -> u64 {
    crate::with_open(|opened| match opened {
        crate::Opened::Land { room, .. } => room.clock(),
        _ => 0,
    })
    .unwrap_or(0)
}
