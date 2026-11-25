//! The mark of what a player's next arrival is judged by: it moves for a lamp, the lamps lit this week, Home and a
//! dive a join ends, and not for a find.

use crate::{PlayerId, Room};
use gear::dive::{Route, Start};

const ISLAND: &str = "continent-1";
const WEEK: u64 = 2_900;

/// A player on a dive of the first zone of Saltmere's web, given back their character in `room`.
fn diver(room: &mut Room, zone: &passage::Zone) -> PlayerId {
    let player = room.join().expect("joined");
    let mut character = gear::Character::starting();
    character.story.prologue = true;
    let start = Start {
        island: ISLAND,
        week: WEEK,
        route: Route::Public,
        mouth: 0,
        zone: zone.number,
        depth: zone.depth,
        lamp: None,
    };
    character.begin_dive(&start).expect("begun");
    assert!(room.restore_character(player, &character.to_json()), "the gate lets them in");
    player
}

/// Changes a player's character as `change` does, and whether the mark moved once their gear goes out.
fn moved(room: &mut Room, player: PlayerId, change: impl FnOnce(&mut gear::Character)) -> bool {
    let found = room.players.get_mut(&player).expect("in the room");
    change(&mut found.character);
    found.gear_changed = true;
    room.take_gear_change(player);
    room.take_judged_move(player)
}

#[test]
fn the_mark_moves_for_a_lamp_the_weeks_lamps_and_home_and_not_for_a_find() {
    let web = passage::Web::of(passage::island(ISLAND).expect("Saltmere's passages"), WEEK);
    let plan = passage::Plan::of(&web, web.mouths[0]).expect("the first mouth's zone");
    let modifiers = gear::passages::week_modifiers(ISLAND, WEEK);
    let mut room = Room::passage(&plan, (1, 4), modifiers, (ISLAND, WEEK, Route::Public)).expect("a zone's room");
    let player = diver(&mut room, &plan.zone);
    assert!(!moved(&mut room, player, |_| {}), "a join that keeps the dive moves nothing");
    assert!(room.players[&player].character.passage.is_some());
    assert!(!moved(&mut room, player, |character| character.materials.add_aurem(5)), "a find");
    fn dive(character: &mut gear::Character) -> &mut gear::dive::Dive {
        character.passage.as_mut().expect("on a dive")
    }
    assert!(moved(&mut room, player, |character| dive(character).lamp = 1), "a lamp");
    assert!(!room.take_judged_move(player), "asking clears it");
    let lit = |character: &mut gear::Character| {
        character.activity.this_week(WEEK).passage_lamps.entry(ISLAND.to_owned()).or_default().insert(1);
    };
    assert!(moved(&mut room, player, lit), "the week's lamps");
    assert!(moved(&mut room, player, |character| dive(character).homeward = true), "Home");
    assert!(moved(&mut room, player, |character| character.passage = None), "a dive ended");
}

#[test]
fn a_dive_a_join_ends_shows_as_moved() {
    let web = passage::Web::of(passage::island(ISLAND).expect("Saltmere's passages"), WEEK);
    let zone = web.zones.iter().find(|zone| zone.number == web.mouths[0]).expect("the first mouth's zone");
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = diver(&mut room, zone);
    assert!(room.players[&player].character.passage.is_none(), "a room of no passage ends the dive");
    assert!(moved(&mut room, player, |_| {}));
}
