//! Parked ships through the door, as a place's room names its players to the sea and is told the ships lying at its
//! island, and as each room sends them: the sea to players within sight, the island's room to everyone, the ship's own
//! player too. server/parked.test.ts runs the same through the WebAssembly and pins the same answer.

use super::{land_parked, sea_ashore};
use crate::{TAKEN, gear_door, input, isle_door, open_sea, room_join, room_leave, room_tick, snapshot_door};
use protocol::wire::overlook::wire as messages;
use room::PlayerId;

/// A sea round one square continent 100 km a side, its north-west corner 100 km from the frame's.
const SQUARE_SEA: &str = r#"{ "continents": [{ "id": "continent-2", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;

/// The sea's answer to the word naming Ann ashore on the square, pinned: the WebAssembly answers the same
/// (server/parked.test.ts).
pub const ANSWER: &str = r#"[{"account":"ann","number":1,"x":98000.0,"y":150000.0,"heading":0.0,"hull":0,"dress":[0,10,18,30],"name":[255,255],"emblem":0}]"#;

/// The minute the host sets as the sea starts ticking, and its first second.
const MINUTE: u32 = 29_000_000;
const NOW: u64 = 29_000_000 * 60;

/// A player who joins the sea and comes to rest at `at`, of `account` if one is given.
fn at_rest(account: Option<&str>, at: [f64; 2]) -> PlayerId {
    let player = room_join();
    if let Some(account) = account {
        assert!(gear_door::own(player, account.as_bytes()));
    }
    assert_eq!(input(player, &protocol::course_bytes(&[at], 10)), TAKEN);
    player
}

/// A sea opened at `MINUTE` that Ann left, her ship at rest 2 km off the square's coast, and a player near it.
fn ann_left() -> (PlayerId, PlayerId) {
    assert!(open_sea(SQUARE_SEA.as_bytes(), 66));
    assert!(gear_door::set_minute(MINUTE));
    let ann = at_rest(Some("ann"), [98_000.0, 150_000.0]);
    room_tick();
    room_leave(ann);
    let near = at_rest(None, [90_000.0, 150_000.0]);
    room_tick();
    (ann, near)
}

/// A room on the square's continent naming `accounts` (each quoted) to the sea at the host's `seconds`.
fn word(accounts: &str, seconds: u64) -> Vec<u8> {
    format!(r#"{{"accounts":[{accounts}],"continent":"continent-2","seconds":{seconds}}}"#).into_bytes()
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
    let (ann, near) = ann_left();
    let far = at_rest(None, [10_000.0, 30_000.0]);
    room_tick();
    assert_eq!(sea_ashore(&word(r#""ann""#, NOW)), ANSWER);
    snapshot_door::prepare();
    let (ships, plates, _) = ships_in(&snapshot_door::snapshot_for(near));
    assert_eq!(ships, [(near, 0), (ann, 0)], "within sight, at rest");
    assert!(plates.contains(&ann), "with its plate");
    assert_eq!(ships_in(&snapshot_door::snapshot_for(far)).0, [(far, 0)], "past sight");
    assert_eq!(sea_ashore(br#"{"accounts":["ann"],"continent":"continent-2"}"#), "", "a word without the host's time");
    assert_eq!(sea_ashore(b"not a word"), "", "a word that does not read is answered with nothing");
}

#[test]
fn a_naming_lapses_after_45_seconds_of_the_hosts_time_though_the_sea_never_ticks_and_at_sea_after_45_of_ticks() {
    let (ann, near) = ann_left();
    assert_eq!(sea_ashore(&word(r#""ann""#, NOW)), ANSWER);
    assert_eq!(sea_ashore(&word("", NOW + 45)), ANSWER, "named 45 s ago");
    assert_eq!(sea_ashore(&word("", NOW + 46)), "[]", "lapsed, though the sea has not ticked since");
    let in_sight = || {
        snapshot_door::prepare();
        ships_in(&snapshot_door::snapshot_for(near)).0
    };
    assert_eq!(in_sight(), [(near, 0)], "nor seen at sea");
    let run = format!(r#"{{"accounts":["ann"],"seconds":{}}}"#, NOW + 46);
    assert_eq!(sea_ashore(run.as_bytes()), "[]", "a run at sea lies at no island, and is told of no ship");
    assert_eq!(in_sight(), [(near, 0), (ann, 0)], "yet keeps its players' ships seen wherever they lie");
    for _ in 0..45 * 60 {
        room_tick();
    }
    assert_eq!(in_sight(), [(near, 0), (ann, 0)], "45 s of the sea's ticks since its naming");
    for _ in 0..60 {
        room_tick();
    }
    assert_eq!(in_sight(), [(near, 0)], "named no more, its naming lapsed");
}

#[test]
fn an_islands_room_sends_everyone_every_ship_parked_at_it_their_own_too_whole_and_then_as_it_changes() {
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
    assert_eq!((shown, base), (vec![(7, 0), (8, 0)], 0), "the viewer's own ship too, so a page reloaded draws it");
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
    assert!(shown == [(7, 0)] && base > 0, "changed, sent on the base");
    let (shown, _, base) = ships_in(&snapshot_door::snapshot(bea));
    assert_eq!((shown, base), (vec![(7, 0)], 0), "and to another, Ann's");
    assert!(land_parked(b"[]"));
    let (shown, _, base) = seen(3, ann);
    assert_eq!((shown, base), (vec![], 0), "none now: sent whole");
}

/// The open room's clock.
fn room_tick_now() -> u64 {
    crate::with_open(|opened| match opened {
        crate::Opened::Land { room, .. } => room.clock(),
        _ => 0,
    })
    .unwrap_or(0)
}

#[test]
fn a_ship_whose_player_sails_another_tiers_sea_is_let_go_here_as_that_sea_says() {
    let (_, near) = ann_left();
    let afloat = format!(r#"{{"accounts":[],"afloat":["ann"],"seconds":{NOW}}}"#);
    assert_eq!(sea_ashore(afloat.as_bytes()), "[]");
    assert_eq!(sea_ashore(&word(r#""ann""#, NOW)), "[]", "let go: named again, it is seen no more");
    snapshot_door::prepare();
    assert_eq!(ships_in(&snapshot_door::snapshot_for(near)).0, [(near, 0)]);
}
