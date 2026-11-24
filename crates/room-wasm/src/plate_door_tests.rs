use super::name;
use crate::{TAKEN, gear_door, input, open_sea, room_join, room_tick, snapshot_door};
use protocol::wire::overlook::wire as messages;
use room::PlayerId;

/// The plates `player` is sent in the prepared sea snapshot: each player's number, name and level.
fn plates_at_sea(player: PlayerId) -> Vec<(PlayerId, String, u8)> {
    let bytes = snapshot_door::snapshot_for(player);
    let snapshot = messages::root_as_from_room(&bytes).unwrap().snapshot().unwrap();
    let read =
        |plate: messages::Plate<'_>| (plate.player(), plate.name().unwrap_or_default().to_owned(), plate.level());
    snapshot.plates().map_or(Vec::new(), |plates| plates.iter().map(read).collect())
}

#[test]
fn at_sea_each_player_is_sent_the_plates_of_the_other_ships_in_sight_but_not_their_own() {
    let layout = r#"{ "continents": [{ "id": "continent-2", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    assert!(open_sea(layout.as_bytes(), 66));
    let (one, near, far) = (room_join(), room_join(), room_join());
    for (player, at) in [(one, [50_000.0, 50_000.0]), (near, [50_000.0, 90_000.0]), (far, [300_000.0, 50_000.0])] {
        assert_eq!(input(player, &protocol::course_bytes(&[at], 10)), TAKEN);
    }
    room_tick();
    let mut seasoned = gear::Character::starting();
    seasoned.xp = 190_000;
    for (player, character) in [(one, &seasoned), (near, &gear::Character::starting()), (far, &seasoned)] {
        assert!(gear_door::restore_character(player, character.to_json().as_bytes()));
    }
    assert!(name(one, b"Wooden_Osprey"));
    assert!(!name(near, b"Two words"), "a name no username could be names no one");
    assert!(name(far, b"Far_Away"));
    room_tick();
    snapshot_door::prepare();
    assert_eq!(plates_at_sea(one), vec![(near, String::new(), 1)], "a guest's plate has no name");
    assert_eq!(plates_at_sea(near), vec![(one, "Wooden_Osprey".to_owned(), 20)]);
    assert_eq!(plates_at_sea(far), vec![], "250 km off, no ship is in sight");
}
