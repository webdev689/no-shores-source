//! The sea's door as a keeping sea uses it: a course held until the keeper says none is kept, each player's gear sent
//! from the character it keeps, and what each player at sea is sent of the ships, hostiles and decks round them.

use super::*;

/// A sea round one square continent 100 km a side, its north-west corner 100 km from the frame's.
fn small_sea() {
    let layout = r#"{ "continents": [{ "id": "continent-2", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    assert!(open_sea(layout.as_bytes(), 66));
}

/// The ships and hostile ships a player is sent in the prepared snapshot, by their numbers.
fn seen_at_sea(player: PlayerId) -> (Vec<PlayerId>, Vec<u32>) {
    let bytes = snapshot_door::snapshot_for(player);
    let snapshot = messages::root_as_from_room(&bytes).unwrap().snapshot().unwrap();
    let ships = snapshot.ships().map_or(Vec::new(), |ships| ships.iter().map(|ship| ship.player()).collect());
    let hostiles =
        snapshot.hostiles().map_or(Vec::new(), |hostiles| hostiles.iter().map(|hostile| hostile.id()).collect());
    (ships, hostiles)
}

#[test]
fn a_sea_that_keeps_characters_holds_a_players_course_until_the_keeper_says_none_is_kept() {
    small_sea();
    assert_eq!(gear_door::room_keep_characters(), 1);
    let player = room_join();
    assert_eq!(input(player, &protocol::course_bytes(&[[50_000.0, 50_000.0]], 10)), TAKEN, "held, not refused");
    room_tick();
    snapshot_door::prepare();
    assert_eq!(seen_at_sea(player).0, Vec::<PlayerId>::new(), "not at sea before the keeper answered");
    gear_door::room_none_kept(player);
    room_tick();
    snapshot_door::prepare();
    assert_eq!(seen_at_sea(player).0, vec![player]);
}

#[test]
fn at_sea_a_players_gear_is_sent_from_the_character_the_sea_keeps_once_it_changes() {
    small_sea();
    let player = room_join();
    assert_eq!(input(player, &protocol::course_bytes(&[[50_000.0, 50_000.0]], 10)), TAKEN);
    room_tick();
    assert!(gear_door::gear(player).is_empty(), "no character held yet");
    // A Friday's 09:00 UTC, the sea's minute: a bounty held that day is counted on it.
    let minute = 20_778 * 1_440 + 540;
    with_open(|opened| {
        if let Opened::Sea(sea) = opened {
            sea.minute = minute;
        }
    });
    let mut character = sailor();
    character.materials.add_aurem(777);
    character.activity.today.day = gear::clock::day_of(minute);
    character.activity.today.bounties.insert(2, 1);
    assert!(gear_door::restore_character(player, character.to_json().as_bytes()));
    let bytes = gear_door::gear(player);
    let gear = messages::root_as_from_room(&bytes).unwrap().gear().expect("their gear");
    assert_eq!(gear.aurem(), character.materials.aurem, "the character given back");
    assert_eq!(u64::from(gear.day()), gear::clock::day_of(minute), "the sea's day");
    let held = gear.bounties().expect("the board").get(2);
    assert_eq!((held.held(), held.count()), (true, 1), "the bounty counted at sea, today's");
    assert!(gear_door::gear(player).is_empty(), "sent once until it changes again");
}

#[test]
fn at_sea_each_sailors_gear_carries_their_own_characters_story_alone() {
    small_sea();
    let (done, new) = (room_join(), room_join());
    for player in [done, new] {
        assert_eq!(input(player, &protocol::course_bytes(&[[50_000.0, 50_000.0]], 10)), TAKEN);
    }
    room_tick();
    let mut past = sailor();
    past.story.prologue = true;
    assert!(gear_door::restore_character(done, past.to_json().as_bytes()));
    assert!(gear_door::restore_character(new, sailor().to_json().as_bytes()));
    let prologue = |player| {
        let bytes = gear_door::gear(player);
        messages::root_as_from_room(&bytes).unwrap().gear().expect("their gear").prologue_done()
    };
    // Written one after the other, as the sea writes each sailor's.
    assert_eq!((prologue(done), prologue(new)), (true, false), "one's prologue is not another's");
}

#[test]
fn each_player_at_sea_is_sent_the_hostile_ships_within_their_keeping_sight_and_the_players_within_60_km() {
    small_sea();
    let (one, near, far) = (room_join(), room_join(), room_join());
    for (player, at) in [(one, [50_000.0, 50_000.0]), (near, [50_000.0, 90_000.0]), (far, [300_000.0, 50_000.0])] {
        assert_eq!(input(player, &protocol::course_bytes(&[at], 10)), TAKEN);
    }
    let commission = naval::ranks::Commission { faction: naval::ranks::GREY_TITHE, rank: naval::ranks::Rank::Minor };
    // Wary Minors that leave a sound Sloop be, each kept at sea by the player within 1.1 times the Minor's 5 km sight
    // of it: the first player, and the near one.
    for (id, at) in [(1, [50_000.0, 44_600.0]), (2, [50_000.0, 95_400.0])] {
        let hostile = room::hostiles::Hostile::standing(id, 7, commission, at, 0.0, false);
        with_open(|opened| {
            if let Opened::Sea(sea) = opened {
                sea.put_to_sea(hostile)
            }
        });
    }
    room_tick();
    snapshot_door::prepare();
    assert_eq!(seen_at_sea(one), (vec![one, near], vec![1]));
    assert_eq!(seen_at_sea(near), (vec![one, near], vec![2]), "40 km off, within the page's farthest view");
    assert_eq!(seen_at_sea(far), (vec![far], vec![]), "250 km off, they see no one");
}

#[test]
fn each_player_at_sea_is_sent_only_those_walking_the_decks_of_the_ships_they_are_sent() {
    small_sea();
    let (one, near, far) = (room_join(), room_join(), room_join());
    for (player, at) in [(one, [50_000.0, 50_000.0]), (near, [50_000.0, 90_000.0]), (far, [300_000.0, 50_000.0])] {
        assert_eq!(input(player, &protocol::course_bytes(&[at], 10)), TAKEN);
    }
    room_tick();
    with_open(|opened| {
        if let Opened::Sea(sea) = opened {
            for player in [one, near, far] {
                assert_eq!(sea.leave_helm(player), Ok(()));
            }
        }
    });
    room_tick();
    snapshot_door::prepare();
    let walking = |player: PlayerId| {
        let bytes = snapshot_door::snapshot_for(player);
        let snapshot = messages::root_as_from_room(&bytes).unwrap().snapshot().unwrap();
        snapshot.players().map_or(Vec::new(), |seen| seen.iter().map(|each| each.player()).collect::<Vec<_>>())
    };
    assert_eq!(walking(one), vec![one, near]);
    assert_eq!(walking(far), vec![far], "250 km off, no one else's deck");
}

#[test]
fn the_sea_says_why_its_tier_shuts_to_a_kept_character_or_a_new_one() {
    small_sea();
    assert_eq!(shut(0, b""), gear::gate::NO_SHIP, "a new one keeps no ship yet");
    assert_eq!(shut(0, sailor().to_json().as_bytes()), "", "the Normal sea is open to anyone who keeps a ship");
    assert!(set_difficulty(2));
    assert_eq!(shut(0, sailor().to_json().as_bytes()), "Abyss seas open at level 20.");
    let mut seasoned = sailor();
    seasoned.xp = gear::power::xp_for_level(20);
    assert_eq!(shut(0, seasoned.to_json().as_bytes()), "", "a character of level 20 sails it");
}
