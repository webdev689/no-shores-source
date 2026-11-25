//! A dive as the rooms play it: begun at a lamp, its depth counted only for the zones gone through, the passages'
//! bounties counted once a zone, and the fourth lamp standing cold for Lanternfall's last step.

use crate::{PassageAsk, PlayerId, Room, standing_on};
use combat::fighter::Action;
use gear::dive::{Route, Start};
use gear::objectives::{Deed, Objective};
use passage::{Deal, Mission, Plan, Web};

const ISLAND: &str = "continent-1";

/// The first zone over the weeks from 2_900 of `deal` at `depth`, any depth for none.
fn plan_of(deal: Deal, depth: Option<u8>) -> (u64, Plan) {
    for week in 2_900..2_960 {
        let web = Web::of(passage::island(ISLAND).expect("Saltmere's passages"), week);
        let fits = |zone: &&passage::Zone| zone.deal == deal && depth.is_none_or(|depth| zone.depth == depth);
        if let Some(plan) = web.zones.iter().filter(fits).find_map(|zone| Plan::of(&web, zone.number)) {
            return (week, plan);
        }
    }
    panic!("no zone of {deal:?} at {depth:?}");
}

fn zone_room(deal: Deal, depth: Option<u8>, route: Route) -> (u64, Plan, Room) {
    let (week, plan) = plan_of(deal, depth);
    let band = gear::world::island_levels(ISLAND).expect("Saltmere's band");
    let modifiers = gear::passages::week_modifiers(ISLAND, week);
    (week, plan.clone(), Room::passage(&plan, band, modifiers, (ISLAND, week, route)).expect("a zone's room"))
}

/// A character past the prologue on a dive begun at the plan's zone, at its lamp if one is named (lit this week).
fn diving(week: u64, plan: &Plan, route: Route, lamp: Option<u8>) -> gear::Character {
    let mut character = gear::Character::starting();
    character.story.prologue = true;
    if let Some(lamp) = lamp {
        character.activity.this_week(week).passage_lamps.entry(ISLAND.to_owned()).or_default().insert(lamp);
    }
    let (zone, depth) = (plan.zone.number, plan.zone.depth);
    let start = Start { island: ISLAND, week, route, mouth: 0, zone, depth, lamp, seas: gear::Difficulty::Normal };
    character.begin_dive(&start).expect("begun");
    character
}

fn joined(room: &mut Room, character: &gear::Character) -> PlayerId {
    let player = room.join().expect("joined");
    assert!(room.restore_character(player, &character.to_json()), "the gate lets them in");
    player
}

fn run(room: &mut Room, ticks: u64) {
    for _ in 0..ticks {
        room.tick();
    }
}

fn kill_all(room: &mut Room) {
    for foe in room.foes.values_mut() {
        foe.fighter.health = 0.0;
        foe.fighter.action = Action::Dead { elapsed: 0 };
    }
}

fn stand_at(room: &mut Room, player: PlayerId, at: [f64; 2]) {
    let body = standing_on(&room.floor, &room.blocks, at[0], at[1]);
    room.players.get_mut(&player).expect("in the room").fighter.body = body;
}

#[test]
fn a_lamp_begun_at_is_lit_and_open_and_a_companys_stands_no_guard() {
    for (route, guarded) in [(Route::Company, false), (Route::Public, true)] {
        let (week, plan, mut room) = zone_room(Deal::Lamp, Some(10), route);
        assert!(room.living_foes() > 0, "its guard stands as the room opens");
        let player = joined(&mut room, &diving(week, &plan, route, Some(2)));
        run(&mut room, 2);
        let seen = room.passage_seen(player).expect("a zone");
        assert!(seen.open && seen.lamp_lit, "{route:?}: {seen:?}");
        assert_eq!(room.living_foes() > 0, guarded, "{route:?}");
        let dive = room.players[&player].character.passage.clone().expect("diving");
        assert_eq!(dive.paid, vec![plan.zone.number], "{route:?}: no cache paid for it");
        let lamp = plan.sites.lamp.expect("a lamp");
        stand_at(&mut room, player, [lamp[0] + 2.0, lamp[1]]);
        let why = if guarded { gear::Refusal::LampGuarded } else { gear::Refusal::AlreadyLit };
        assert_eq!(room.ask_passage(player, PassageAsk::LightLamp), why as u8 + 1, "{route:?}: lit for them already");
    }
}

/// The first day from 20_000 whose board posts "Go 8 zones deep", its place on the board, and a minute of it.
fn deep_day() -> (u64, u8, u64) {
    let deep = Objective::Passage(Deed::Deep(8));
    for day in 20_000.. {
        let Some(index) = gear::bounties::board(day).iter().position(|bounty| bounty.objective == deep) else {
            continue;
        };
        let mut minute = day * gear::clock::DAY_MINUTES;
        while gear::clock::day_of(minute) < day {
            minute += gear::clock::minutes_to_next_day(minute).max(1);
        }
        return (day, gear::bounties::town_places().nth(index).expect("a town place"), minute);
    }
    unreachable!("the days run on")
}

#[test]
fn going_on_counts_the_zones_gone_through_from_where_the_dive_began_and_arriving_counts_none() {
    let (day, place, minute) = deep_day();
    let deep_after = |deal: Deal, depth: u8, lamp: Option<u8>, began: u8| {
        let (week, plan, mut room) = zone_room(deal, Some(depth), Route::Public);
        room.set_minute(minute);
        let mut character = diving(week, &plan, Route::Public, lamp);
        character.activity.today(day).bounties.insert(place, 0);
        character.passage.as_mut().expect("diving").began = began;
        let player = joined(&mut room, &character);
        let held = |room: &Room| room.players[&player].character.activity.today.bounties[&place];
        assert_eq!(held(&room), 0, "arriving counts nothing");
        room.players.get_mut(&player).expect("in").character.dive_deal_done(plan.zone.number);
        stand_at(&mut room, player, plan.sites.onward.first().expect("a way on").at);
        assert_eq!(room.ask_passage(player, PassageAsk::GoOn { mouth: 0 }), 0);
        held(&room)
    };
    assert_eq!(deep_after(Deal::Skirmish, 7, None, 1), 1, "a dive from the first depth gone on to the eighth");
    assert_eq!(deep_after(Deal::Lamp, 10, Some(2), 10), 0, "begun at the second lamp, two zones in");
}

#[test]
fn a_public_kindle_camped_counts_toward_lanternfall_once_a_dive() {
    let (week, plan, mut room) = zone_room(Deal::Mission(Mission::Kindle), None, Route::Public);
    let mut character = diving(week, &plan, Route::Public, None);
    character.atheric_bounties.held.insert("lanternfall".to_owned(), (1, 0));
    let player = joined(&mut room, &character);
    for _ in 0..3 {
        let zone = room.zone_mut().expect("a zone");
        zone.round.took_part.insert(player);
        zone.round.lit.iter_mut().for_each(|lit| *lit = true);
        run(&mut room, 2);
        assert!(room.passage_seen(player).is_some_and(|seen| seen.done));
        kill_all(&mut room);
        run(&mut room, crate::passages::passage_deal::AGAIN_TICKS + 1);
    }
    let held = room.players[&player].character.atheric_bounties.held.get("lanternfall").copied();
    assert_eq!(held, Some((1, 1)), "three rounds, one Kindle");
}

#[test]
fn the_fourth_lamp_stands_cold_for_lanternfalls_last_step_and_is_kindled_under_waves() {
    let (week, plan, mut room) = zone_room(Deal::Lamp, Some(20), Route::Company);
    let mut character = diving(week, &plan, Route::Company, None);
    character.atheric_bounties.held.insert("lanternfall".to_owned(), (3, 0));
    let holder = joined(&mut room, &character);
    let lamp = plan.sites.lamp.expect("a lamp");
    stand_at(&mut room, holder, [lamp[0] + 2.0, lamp[1]]);
    kill_all(&mut room);
    run(&mut room, 2);
    assert!(room.living_foes() > 0, "the Tithe come as its guard falls");
    kill_all(&mut room);
    run(&mut room, 1);
    assert_eq!(room.ask_passage(holder, PassageAsk::LightLamp), 0);
    let hold = |room: &mut Room, ticks: u64| {
        for _ in 0..ticks {
            room.players.get_mut(&holder).expect("in").fighter.health = 1e9;
            room.tick();
        }
    };
    hold(&mut room, super::LAMP_TICKS + 1);
    assert!(room.passage_seen(holder).is_some_and(|seen| !seen.lamp_lit), "no routine light");
    hold(&mut room, super::KINDLE_TICKS - super::LAMP_TICKS);
    assert!(room.passage_seen(holder).is_some_and(|seen| seen.lamp_lit), "kindled as a dead lamp is");
    assert!(room.players[&holder].character.atheric_bounties.finished.contains("lanternfall"));

    let (week, plan, mut room) = zone_room(Deal::Lamp, Some(20), Route::Company);
    joined(&mut room, &diving(week, &plan, Route::Company, None));
    kill_all(&mut room);
    run(&mut room, crate::passages::passage_deal::WAVE_EVERY_TICKS + 2);
    assert_eq!(room.living_foes(), 0, "for any other it is a lamp like the rest");
}
