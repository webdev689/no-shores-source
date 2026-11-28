//! A player travelling aboard a company member's ship through the doors: asked as they join, boarded on their
//! company's word, and sent their captain's ship as their own.

use super::{ask_aboard, board};
use crate::{TAKEN, gear_door, input, open_sea, plate_door, room_join, room_tick, snapshot_door};
use protocol::wire::overlook::wire as messages;
use room::PlayerId;

/// A sea round one square continent 100 km a side, its north-west corner 100 km from the frame's.
const SQUARE_SEA: &str = r#"{ "continents": [{ "id": "continent-2", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;

/// The ships a snapshot carries, each its number and where it lies; and the numbers its plates are over.
fn seen(bytes: &[u8]) -> (Vec<(PlayerId, f64, f64)>, Vec<PlayerId>) {
    let snapshot = messages::root_as_from_room(bytes).unwrap().snapshot().unwrap();
    let ships = snapshot
        .ships()
        .map_or(Vec::new(), |ships| ships.iter().map(|ship| (ship.player(), ship.x(), ship.y())).collect());
    let plates = snapshot.plates().map_or(Vec::new(), |plates| plates.iter().map(|plate| plate.player()).collect());
    (ships, plates)
}

#[test]
fn a_passenger_boards_on_their_companys_word_and_is_sent_their_captains_ship_as_their_own() {
    assert!(open_sea(SQUARE_SEA.as_bytes(), 66));
    let ann = room_join();
    assert!(gear_door::own(ann, b"ann") && plate_door::name(ann, b"Ann"));
    assert_eq!(input(ann, &protocol::course_bytes(&[[90_000.0, 150_000.0]], 10)), TAKEN);
    room_tick();
    let bea = room_join();
    assert!(!board(bea, br#"{"captain":"Ann","company":["ann","bea"]}"#), "not asked as she joined");
    assert!(ask_aboard(bea) && gear_door::own(bea, b"bea"));
    assert!(!board(bea, br#"{"captain":"Ann","company":["bea"]}"#), "Ann is not of her company");
    assert!(!board(bea, b"not a word"));
    assert!(board(bea, br#"{"captain":"Ann","company":["ann","bea"]}"#));
    room_tick();
    snapshot_door::prepare();
    let (ships, plates) = seen(&snapshot_door::snapshot_for(bea));
    assert_eq!(ships, [(bea, 90_000.0, 150_000.0)], "Ann's ship, as her own");
    assert!(!plates.contains(&ann) && !plates.contains(&bea), "no plate over the ship she is aboard");
    assert_eq!(seen(&snapshot_door::snapshot_for(ann)).0, [(ann, 90_000.0, 150_000.0)], "Ann sails as before");
}
