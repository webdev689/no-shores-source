//! The factions' bounties on the wire: the pledged faction's three after the town's six, each with its place and
//! faction, and another faction's held today after them.

use crate::gear_wire::gear_bytes;
use crate::messages;
use gear::bounties::{bounty_at, faction_places};
use room::Room;

const FRIDAY_NINE: u64 = 29_919_420;
const DAY: u64 = 20_778;

/// Each bounty a player's gear carries: its place, its faction, its name, its count and whether held.
fn carried(character: &gear::Character) -> Vec<(u8, u8, String, u32, bool)> {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.set_minute(FRIDAY_NINE);
    let player = room.join().expect("a room with space");
    assert!(room.restore_character(player, &character.to_json()));
    let bytes = gear_bytes(&room, player).expect("written");
    let gear = messages::root_as_from_room(&bytes).expect("read").gear().expect("gear");
    let rows = gear.bounties().expect("the board");
    rows.iter()
        .map(|row| (row.place(), row.faction(), row.name().unwrap_or_default().to_owned(), row.count(), row.held()))
        .collect()
}

#[test]
fn a_pledged_players_gear_carries_the_towns_six_then_their_factions_three_each_by_its_place() {
    let unpledged = carried(&gear::Character::starting());
    let places: Vec<(u8, u8)> = unpledged.iter().map(|row| (row.0, row.1)).collect();
    assert_eq!(places, (0..6).map(|place| (place, 0)).collect::<Vec<_>>(), "the town's six alone");
    let mut veiled = gear::Character::starting();
    veiled.allegiance.pledge = 3;
    let rows = carried(&veiled);
    assert_eq!(rows.len(), 9);
    for (row, place) in rows[6..].iter().zip(faction_places(3)) {
        let bounty = bounty_at(DAY, place).expect("on the board");
        assert_eq!((row.0, row.1, row.2.as_str()), (place, 3, bounty.name), "the Veiled's, at its own places");
    }
}

#[test]
fn another_factions_bounty_held_today_is_carried_after_and_none_from_another_day() {
    let mut switched = gear::Character::starting();
    switched.allegiance.pledge = 2;
    let held = faction_places(1).start + 1;
    switched.activity.today =
        gear::activity::Today { day: DAY, faction_bounties: [(held, 4)].into(), ..Default::default() };
    let rows = carried(&switched);
    assert_eq!(rows.len(), 10, "the town's six, the Lamplighters' three and the Stormcallers' held");
    let last = rows.last().expect("a row");
    assert_eq!((last.0, last.1, last.3, last.4), (held, 1, 4, true));
    switched.activity.today.day = DAY - 1;
    let yesterdays = carried(&switched);
    assert_eq!(yesterdays.len(), 9, "yesterday's is held no more");
    assert!(yesterdays.iter().all(|row| !row.4));
}

#[test]
fn a_pledged_player_holding_the_towns_and_their_factions_bounties_sees_each_once_and_yesterdays_turn_in_is_not_today_paid()
 {
    let mut pledged = gear::Character::starting();
    pledged.allegiance.pledge = 1;
    let own = faction_places(1).start;
    pledged.activity.today = gear::activity::Today {
        day: DAY,
        bounties: [(2, 1)].into(),
        turned_in: [4].into(),
        faction_bounties: [(own, 2)].into(),
        faction_turned_in: [own + 1].into(),
        ..Default::default()
    };
    let rows = carried(&pledged);
    let places: Vec<u8> = rows.iter().map(|row| row.0).collect();
    assert_eq!(places, [0, 1, 2, 3, 4, 5, 6, 7, 8], "each once, in the board's order");
    assert!(rows[2].4 && rows[6].4, "the town's and their own held, each where it stands");
    pledged.activity.today.day = DAY - 1;
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.set_minute(FRIDAY_NINE);
    let player = room.join().expect("a room with space");
    assert!(room.restore_character(player, &pledged.to_json()));
    let bytes = gear_bytes(&room, player).expect("written");
    let gear = messages::root_as_from_room(&bytes).expect("read").gear().expect("gear");
    assert!(gear.bounties().expect("the board").iter().all(|row| !row.paid()), "yesterday's turned in, none today");
}
