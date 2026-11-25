//! How a passage zone plays for its players: a respawn however a body fell, a lamp lit for a dive, a body left fallen,
//! a Gauntlet run from the way in, and a vein gathered into the haul.

use super::passages_tests::{BAND, ISLAND, dive, diver, kill_all, lit_lamp, run, stand_at, web, zone_room};
use crate::{Input, PlayerId, Room, Standing};
use combat::fighter::Action;
use gear::dive::Route;
use passage::{Current, Deal, Mission, Plan};

/// The first skirmish over the weeks from 2_900 that runs `current`, as its room.
fn with_current(current: Current) -> (u64, Plan, Room) {
    let found = (2_900..2_990).find_map(|week| {
        let web = web(week);
        let zone = web.zones.iter().find(|zone| zone.deal == Deal::Skirmish && zone.currents.contains(&current))?;
        Plan::of(&web, zone.number).map(|plan| (week, plan))
    });
    let (week, plan) = found.expect("a skirmish with the current");
    let modifiers = gear::passages::week_modifiers(ISLAND, week);
    let room = Room::passage(&plan, BAND, modifiers, (ISLAND, week, Route::Public)).expect("a room");
    (week, plan, room)
}

/// The player fallen as the section kills a body past its ring, long enough to respawn, a find in their haul.
fn section_dead(room: &mut Room, player: PlayerId) {
    let found = room.players.get_mut(&player).expect("in");
    found.character.gather(0);
    (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    found.standing = Standing::Dead { ticks: reach::RESPAWN_TICKS, fell: false };
}

#[test]
fn a_respawn_after_the_section_killed_loses_the_haul_and_is_refused_in_gloom() {
    let (week, plan, mut room) = zone_room(Deal::Skirmish, None, Route::Public);
    let player = diver(&mut room, week, &plan);
    section_dead(&mut room, player);
    room.step_dead(player, Input { respawn: true, ..Input::default() }, room.clock, &[]);
    assert!(!room.players[&player].fighter.dead(), "stood again");
    assert!(dive(&room, player).is_some_and(|dive| dive.haul.is_empty()), "as any respawn, its haul lost");

    let (week, plan, mut room) = with_current(Current::Gloom);
    let player = diver(&mut room, week, &plan);
    section_dead(&mut room, player);
    room.step_dead(player, Input { respawn: true, ..Input::default() }, room.clock, &[]);
    assert!(room.players[&player].fighter.dead(), "the Gloom takes no respawn");
}

#[test]
fn a_lamp_lit_for_a_dive_stays_lit_for_it_through_a_round_begun_again_and_a_reconnect() {
    let (_, _, mut room, player) = lit_lamp();
    run(&mut room, super::passage_deal::AGAIN_TICKS + 2);
    let seen = room.passage_seen(player).expect("a zone");
    assert!(!seen.done && seen.lamp_lit, "begun again, still lit for them: {seen:?}");
    let character = room.players[&player].character.to_json();
    let again = room.join().expect("joined");
    assert!(room.restore_character(again, &character));
    assert!(room.passage_seen(again).is_some_and(|seen| seen.lamp_lit), "lit for the dive, not the room's player");
    kill_all(&mut room);
    run(&mut room, 2);
    assert!(!room.may_hold(again, super::Held::Lamp), "never lit twice");
}

#[test]
fn a_body_left_fallen_comes_back_after_two_minutes_whole_but_without_its_haul() {
    let (week, plan, mut room) = zone_room(Deal::Skirmish, None, Route::Public);
    let player = diver(&mut room, week, &plan);
    let found = room.players.get_mut(&player).expect("in");
    found.character.gather(0);
    (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    let kept = room.kept_character(player).expect("kept");
    let minute = room.minute;
    let (_, _, mut later) = zone_room(Deal::Skirmish, None, Route::Public);
    later.set_minute(minute + gear::left::BODY_KEPT_MINUTES + 1);
    let back = later.join().expect("joined");
    assert!(later.restore_character(back, &kept));
    assert!(!later.players[&back].fighter.dead(), "the body no longer holds");
    assert!(dive(&later, back).is_some_and(|dive| dive.haul.is_empty()), "left fallen: as a respawn, its haul lost");
}

#[test]
fn a_gauntlet_is_run_from_the_way_in_and_its_seconds_left_from_each_ones_arrival() {
    let (week, plan, mut room) = zone_room(Deal::Mission(Mission::Gauntlet), None, Route::Public);
    let first = diver(&mut room, week, &plan);
    let far = room.far_mouth().expect("a far mouth");
    run(&mut room, 1);
    stand_at(&mut room, first, far);
    run(&mut room, 2);
    assert!(room.passage_seen(first).is_some_and(|seen| seen.done), "the first round, run");
    let waiting = diver(&mut room, week, &plan);
    stand_at(&mut room, waiting, far);
    let keep = |room: &mut Room, ticks: u64| {
        for _ in 0..ticks {
            kill_all(room);
            for found in room.players.values_mut() {
                found.fighter.health = 1e9;
            }
            room.tick();
        }
    };
    keep(&mut room, super::passage_deal::AGAIN_TICKS + 5);
    assert!(room.passage_seen(first).is_some_and(|seen| !seen.done), "no one lingering at the far mouth ends it");
    assert!(dive(&room, waiting).is_some_and(|dive| dive.paid.is_empty()), "no newcomer paid for waiting there");
    keep(&mut room, 30 * 60);
    let late = diver(&mut room, week, &plan);
    keep(&mut room, 1);
    let left = |player| room.passage_seen(player).map(|seen| seen.left).expect("a zone");
    assert!((left(late) - 90.0).abs() < 0.5 && (left(waiting) - 60.0).abs() < 0.5, "{} {}", left(late), left(waiting));
}

#[test]
fn a_veins_gather_is_refused_against_the_hauls_stock() {
    let (week, plan, mut room) = zone_room(Deal::Vein, None, Route::Public);
    let player = diver(&mut room, week, &plan);
    let resource = usize::from(room.resource_nodes[0].resource);
    let found = room.players.get_mut(&player).expect("in");
    found.character.materials.add(gear::character::Stuff::Resource(resource), gear::character::STOCK_MOST);
    assert_eq!(room.gather_refused(player, 0), None, "a full stock at home takes nothing from the haul");
    let found = room.players.get_mut(&player).expect("in");
    let haul = &mut found.character.passage.as_mut().expect("diving").haul;
    haul.materials.add(gear::character::Stuff::Resource(resource), gear::character::STOCK_MOST);
    assert_eq!(room.gather_refused(player, 0), Some(crate::asks::STOCK_FULL));
}
