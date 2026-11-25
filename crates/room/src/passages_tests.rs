//! A passage zone as a room: laid from its plan with its foes at the depth's levels, its deal run until it is done,
//! its cache paid and its mouths opened, its lamp lit, its haul kept or lost, and a dive begun at a patrol zone's
//! mouths.

use crate::{PassageAsk, PlayerId, Room, standing_on};
use combat::fighter::Action;
use gear::dive::{Route, Start};
use passage::{Deal, Mission, PieceKind, Plan, Web};

const ISLAND: &str = "continent-1";
const BAND: (u8, u8) = (1, 4);

fn web(week: u64) -> Web {
    Web::of(passage::island(ISLAND).expect("Saltmere's passages"), week)
}

/// The first zone over the weeks from 2_900 whose deal is `deal`, under ground or not as `under` asks (either for none).
fn plan_of(deal: Deal, under: Option<bool>) -> (u64, Plan) {
    for week in 2_900..2_960 {
        let web = web(week);
        for zone in &web.zones {
            if zone.deal != deal
                || under.is_some_and(|under| under != matches!(zone.ground, passage::Ground::Under { .. }))
            {
                continue;
            }
            if let Some(plan) = Plan::of(&web, zone.number) {
                return (week, plan);
            }
        }
    }
    panic!("no zone of {deal:?}");
}

fn zone_room(deal: Deal, under: Option<bool>, route: Route) -> (u64, Plan, Room) {
    let (week, plan) = plan_of(deal, under);
    let modifiers = gear::passages::week_modifiers(ISLAND, week);
    let room = Room::passage(&plan, BAND, modifiers, (ISLAND, week, route)).expect("a zone's room");
    (week, plan, room)
}

/// A player in the zone on a dive of it, past the prologue, standing at its arrival.
fn diver(room: &mut Room, week: u64, plan: &Plan) -> PlayerId {
    let player = room.join().expect("joined");
    let mut character = gear::Character::starting();
    character.story.prologue = true;
    let start = Start {
        island: ISLAND,
        week,
        route: Route::Public,
        mouth: 0,
        zone: plan.zone.number,
        depth: plan.zone.depth,
        lamp: None,
    };
    character.begin_dive(&start).expect("begun");
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

fn dive(room: &Room, player: PlayerId) -> Option<&gear::dive::Dive> {
    room.players[&player].character.passage.as_ref()
}

#[test]
fn a_zone_stands_at_its_arrival_with_its_foes_at_the_depths_levels() {
    for under in [true, false] {
        let (_, plan, room) = zone_room(Deal::Skirmish, Some(under), Route::Public);
        assert_eq!(room.section.as_ref().map(|section| section.spawns.clone()), Some(vec![plan.sites.arrive]));
        assert_eq!(room.place, Some(gear::gate::Place::Passage));
        let (low, high) = passage::levels(BAND, plan.zone.depth);
        assert!(room.living_foes() > 0, "under {under}: its bands");
        assert!(room.foes.values().all(|foe| (low..=high).contains(&foe.level)), "under {under}: {low} to {high}");
    }
}

#[test]
fn a_skirmish_done_pays_its_cache_once_opens_the_mouths_and_lets_the_player_go_on() {
    let (week, plan, mut room) = zone_room(Deal::Skirmish, None, Route::Public);
    let player = diver(&mut room, week, &plan);
    assert!(dive(&room, player).is_some_and(|dive| dive.here), "finds go into the haul");
    let mouth = plan.sites.onward.first().expect("a way on").at;
    stand_at(&mut room, player, mouth);
    assert_eq!(room.ask_passage(player, PassageAsk::GoOn { mouth: 0 }), gear::Refusal::DealNotDone as u8 + 1);
    let xp = room.players[&player].character.xp;
    // Killed by hand here, so no blow of theirs marks them as taking part.
    room.zone_mut().expect("a zone").round.took_part.insert(player);
    kill_all(&mut room);
    run(&mut room, 2);
    let seen = room.passage_seen(player).expect("a zone");
    assert!(seen.done && seen.open, "{seen:?}");
    assert!(room.players[&player].character.xp > xp, "its cache's XP");
    assert_eq!(dive(&room, player).map(|dive| dive.paid.clone()), Some(vec![plan.zone.number]));
    assert_eq!(room.ask_passage(player, PassageAsk::GoOn { mouth: 0 }), 0);
    assert_eq!(dive(&room, player).map(|dive| dive.zone), plan.zone.onward.first().copied());
}

#[test]
fn a_public_deal_begins_again_a_minute_after_it_is_done_and_a_companys_does_not() {
    for (route, again) in [(Route::Public, true), (Route::Company, false)] {
        let (week, plan, mut room) = zone_room(Deal::Skirmish, None, route);
        diver(&mut room, week, &plan);
        let standing = room.living_foes();
        kill_all(&mut room);
        run(&mut room, 2);
        assert_eq!(room.living_foes(), 0);
        run(&mut room, super::passage_deal::AGAIN_TICKS + 1);
        assert_eq!(room.living_foes() == standing, again, "{route:?}");
    }
}

#[test]
fn a_kindles_three_dead_lamps_are_lit_by_holding_e_and_waves_come_meanwhile() {
    let (week, plan, mut room) = zone_room(Deal::Mission(Mission::Kindle), None, Route::Public);
    let player = diver(&mut room, week, &plan);
    run(&mut room, 1);
    assert!(room.living_foes() > 0, "the first wave");
    let kindles: Vec<(u8, [f64; 2])> = plan
        .pieces
        .iter()
        .filter_map(|piece| {
            if let PieceKind::Kindle(nth) = piece.kind { Some((nth, [piece.at[0], piece.at[1]])) } else { None }
        })
        .collect();
    assert_eq!(kindles.len(), 3);
    for (nth, at) in kindles {
        kill_all(&mut room);
        stand_at(&mut room, player, [at[0] + 1.0, at[1]]);
        assert_eq!(room.ask_passage(player, PassageAsk::Kindle { lamp: nth }), 0);
        for _ in 0..super::passage_asks::KINDLE_TICKS + 1 {
            room.players.get_mut(&player).expect("in").fighter.health = 1e9;
            room.tick();
        }
    }
    assert!(room.passage_seen(player).is_some_and(|seen| seen.done && seen.lit == 0b111));
}

#[test]
fn a_lamp_is_lit_for_each_player_once_its_guard_is_down_and_then_they_may_go_home() {
    let (week, plan, mut room) = zone_room(Deal::Lamp, None, Route::Public);
    let player = diver(&mut room, week, &plan);
    let lamp = plan.sites.lamp.expect("a lamp");
    stand_at(&mut room, player, [lamp[0] + 2.0, lamp[1]]);
    assert_eq!(room.ask_passage(player, PassageAsk::LightLamp), gear::Refusal::LampGuarded as u8 + 1);
    kill_all(&mut room);
    run(&mut room, 2);
    assert_eq!(room.ask_passage(player, PassageAsk::GoHome), gear::Refusal::LampNotLit as u8 + 1);
    assert_eq!(room.ask_passage(player, PassageAsk::LightLamp), 0);
    run(&mut room, super::passage_asks::LAMP_TICKS + 1);
    assert!(room.passage_seen(player).is_some_and(|seen| seen.lamp_lit));
    let number = passage::lamp_number(plan.zone.depth).expect("a lamp's depth");
    assert!(room.players[&player].character.activity.this_week.passage_lamps[ISLAND].contains(&number));
    assert_eq!(room.ask_passage(player, PassageAsk::GoHome), 0);
    assert!(dive(&room, player).is_some_and(|dive| dive.homeward), "home, the dive ending in the patrol zone");
}

#[test]
fn a_respawn_empties_the_haul_and_joining_another_room_ends_the_dive() {
    let (week, plan, mut room) = zone_room(Deal::Skirmish, None, Route::Public);
    let player = diver(&mut room, week, &plan);
    room.players.get_mut(&player).expect("in").character.gather(0);
    assert!(dive(&room, player).is_some_and(|dive| !dive.haul.is_empty()));
    room.lose_haul(player);
    assert!(dive(&room, player).is_some_and(|dive| dive.haul.is_empty()));
    let character = room.players[&player].character.clone();
    let mut elsewhere = Room::new(Vec::new(), (0.0, 0.0));
    let other = elsewhere.join().expect("joined");
    assert!(elsewhere.restore_character(other, &character.to_json()));
    assert!(elsewhere.players[&other].character.passage.is_none(), "the dive ends");
}

#[test]
fn an_ambush_bars_the_mouths_until_three_waves_are_beaten() {
    let (week, plan, mut room) = zone_room(Deal::Mission(Mission::Ambush), None, Route::Public);
    let player = diver(&mut room, week, &plan);
    for wave in 1..=3 {
        run(&mut room, 1);
        assert!(room.passage_seen(player).is_some_and(|seen| seen.wave == wave && !seen.open), "wave {wave}");
        kill_all(&mut room);
    }
    run(&mut room, 2);
    assert!(room.passage_seen(player).is_some_and(|seen| seen.done && seen.open));
}

#[test]
fn a_gauntlets_mouths_are_open_at_once_and_its_far_mouth_reached_is_its_deal() {
    let (week, plan, mut room) = zone_room(Deal::Mission(Mission::Gauntlet), None, Route::Public);
    let player = diver(&mut room, week, &plan);
    run(&mut room, 1);
    assert!(room.passage_seen(player).is_some_and(|seen| seen.open && !seen.done));
    let far = room.far_mouth().expect("a far mouth");
    stand_at(&mut room, player, far);
    run(&mut room, 2);
    assert!(room.passage_seen(player).is_some_and(|seen| seen.done));
}

#[test]
fn a_hold_is_done_once_its_ring_is_held_ninety_seconds() {
    let (week, plan, mut room) = zone_room(Deal::Mission(Mission::Hold), None, Route::Company);
    let player = diver(&mut room, week, &plan);
    let ring = plan.sites.spots[0];
    for _ in 0..super::passage_deal::HOLD_TICKS + 2 {
        kill_all(&mut room);
        stand_at(&mut room, player, ring);
        room.tick();
    }
    assert!(room.passage_seen(player).is_some_and(|seen| seen.done));
}

#[test]
fn a_severs_tally_posts_and_a_reckonings_collectors_are_its_deal() {
    for mission in [Mission::Sever, Mission::Reckoning] {
        let (week, plan, mut room) = zone_room(Deal::Mission(mission), None, Route::Public);
        let player = diver(&mut room, week, &plan);
        run(&mut room, 1);
        assert!(room.passage_seen(player).is_some_and(|seen| !seen.done && seen.broken == 0), "{mission:?}");
        kill_all(&mut room);
        run(&mut room, 2);
        assert!(room.passage_seen(player).is_some_and(|seen| seen.done && seen.broken == 0b111), "{mission:?}");
    }
}

#[test]
fn a_dive_begins_at_a_patrol_zones_mouth_within_reach_of_its_door() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    assert!(room.open_mouths(
        ISLAND,
        vec![([0.0, 0.0], [0.0, 20.0]), ([50.0, 0.0], [50.0, 20.0]), ([100.0, 0.0], [100.0, 20.0])]
    ));
    let player = room.join().expect("joined");
    let begin = |mouth| PassageAsk::Begin { mouth, route: Route::Public, lamp: None };
    assert_eq!(room.ask_passage(player, begin(1)), gear::Refusal::NotAtMouth as u8 + 1);
    assert_eq!(room.ask_passage(player, begin(0)), 0);
    let week = gear::clock::week_of(room.minute);
    let dive = room.players[&player].character.passage.clone().expect("begun");
    assert_eq!((dive.zone, dive.depth, dive.week), (web(week).mouths[0], 1, week));
    let lamp = PassageAsk::Begin { mouth: 0, route: Route::Company, lamp: Some(2) };
    assert_eq!(room.ask_passage(player, lamp), gear::Refusal::NoLamp as u8 + 1, "no lamp lit this week");
}

#[test]
fn a_hardened_zones_foes_stand_with_more_health() {
    let hardened = (2_900..2_990).find_map(|week| {
        let web = web(week);
        let zone = web
            .zones
            .iter()
            .find(|zone| zone.deal == Deal::Skirmish && zone.currents.contains(&passage::Current::Hardened))?;
        Plan::of(&web, zone.number).map(|plan| (week, plan))
    });
    let (week, plan) = hardened.expect("a hardened skirmish");
    let modifiers = gear::passages::week_modifiers(ISLAND, week);
    let room = Room::passage(&plan, BAND, modifiers, (ISLAND, week, Route::Public)).expect("a room");
    let mut plain = plan.clone();
    plain.zone.currents.retain(|current| *current != passage::Current::Hardened);
    let other = Room::passage(&plain, BAND, modifiers, (ISLAND, week, Route::Public)).expect("a room");
    let most = |room: &Room| room.foes.values().map(|foe| foe.fighter.health_max).sum::<f64>();
    assert!(most(&room) > most(&other), "{} against {}", most(&room), most(&other));
}

#[test]
fn a_hunt_begun_again_stands_its_marked_band_again_and_no_band_still_standing_twice() {
    let (week, plan, mut room) = zone_room(Deal::Mission(Mission::Hunt), None, Route::Public);
    let player = diver(&mut room, week, &plan);
    let standing = room.living_foes();
    for id in room.garrison[0].standing.clone() {
        let foe = room.foes.get_mut(&id).expect("the marked band");
        (foe.fighter.health, foe.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    }
    run(&mut room, 2);
    assert!(room.passage_seen(player).is_some_and(|seen| seen.done), "the marked band down");
    run(&mut room, super::passage_deal::AGAIN_TICKS + 1);
    assert_eq!(room.living_foes(), standing, "the marked band again, the rest as they stood");
}

#[test]
fn a_cache_pays_only_those_who_took_part_and_a_late_gauntlet_pays_none() {
    let (week, plan, mut room) = zone_room(Deal::Skirmish, None, Route::Public);
    let fighter = diver(&mut room, week, &plan);
    let idle = diver(&mut room, week, &plan);
    room.zone_mut().expect("a zone").round.took_part.insert(fighter);
    kill_all(&mut room);
    run(&mut room, 2);
    assert!(dive(&room, fighter).is_some_and(|dive| dive.paid == [plan.zone.number]));
    assert!(dive(&room, idle).is_some_and(|dive| dive.paid.is_empty() && dive.done), "its mouths open, no cache");

    let (week, plan, mut room) = zone_room(Deal::Mission(Mission::Gauntlet), None, Route::Public);
    let player = diver(&mut room, week, &plan);
    run(&mut room, super::passage_deal::GAUNTLET_TICKS + 2);
    let far = room.far_mouth().expect("a far mouth");
    stand_at(&mut room, player, far);
    run(&mut room, 2);
    assert!(room.passage_seen(player).is_some_and(|seen| seen.done));
    assert!(dive(&room, player).is_some_and(|dive| dive.paid.is_empty()), "late: no cache");
}

#[test]
fn a_company_all_down_in_a_gloomy_zone_falls_back_and_loses_its_haul() {
    let gloomy = (2_900..2_990).find_map(|week| {
        let web = web(week);
        let zone = web
            .zones
            .iter()
            .find(|zone| zone.deal == Deal::Skirmish && zone.currents.contains(&passage::Current::Gloom))?;
        Plan::of(&web, zone.number).map(|plan| (week, plan))
    });
    let (week, plan) = gloomy.expect("a gloomy skirmish");
    let modifiers = gear::passages::week_modifiers(ISLAND, week);
    let mut room = Room::passage(&plan, BAND, modifiers, (ISLAND, week, Route::Public)).expect("a room");
    let player = diver(&mut room, week, &plan);
    room.players.get_mut(&player).expect("in").character.gather(0);
    let found = room.players.get_mut(&player).expect("in");
    (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: combat::tuning::RESPAWN });
    found.respawn_asked = true;
    room.tick();
    assert!(!room.players[&player].fighter.dead(), "fallen back");
    assert!(dive(&room, player).is_some_and(|dive| dive.haul.is_empty()));
}

#[test]
fn a_player_home_from_a_lamp_stands_before_the_mouth_they_began_at_keeping_what_they_found() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    assert!(room.open_mouths(
        ISLAND,
        vec![([0.0, 0.0], [0.0, 20.0]), ([50.0, 0.0], [50.0, 20.0]), ([100.0, 0.0], [100.0, 20.0])]
    ));
    let player = room.join().expect("joined");
    let mut character = room.players[&player].character.clone();
    let start = gear::dive::Start {
        island: ISLAND,
        week: 2_900,
        route: Route::Public,
        mouth: 1,
        zone: 4,
        depth: 5,
        lamp: None,
    };
    character.begin_dive(&start).expect("begun");
    let dive = character.passage.as_mut().expect("diving");
    (dive.lamp, dive.homeward) = (1, true);
    dive.haul.materials.add(gear::character::Stuff::Fragments(gear::kinds::Stock::Weapon), 2);
    let fragments = character.materials.weapon_fragments;
    room.players.get_mut(&player).expect("here").character = character;
    room.passage_arrived(player);
    let found = &room.players[&player];
    assert!(found.character.passage.is_none(), "the dive ends in the patrol zone");
    assert_eq!(found.character.materials.weapon_fragments, fragments + 2, "keeping what it carried home");
    let body = found.fighter.body;
    assert!(libm::hypot(body.x - 50.0, body.y - 2.0) < 1e-9, "before the second mouth: {:?}", (body.x, body.y));
}

/// The room's answer to a refusal.
fn refusal(refusal: gear::Refusal) -> u8 {
    refusal as u8 + 1
}

/// The first minute of a week.
fn week_begins(week: u64) -> u64 {
    let mut minute = (week - 1) * gear::clock::WEEK_MINUTES;
    while gear::clock::week_of(minute) < week {
        minute += gear::clock::minutes_to_next_week(minute).max(1);
    }
    minute
}

/// A lamp's zone, its guard down, lit for one player standing at it.
fn lit_lamp() -> (u64, Plan, Room, PlayerId) {
    let (week, plan, mut room) = zone_room(Deal::Lamp, None, Route::Public);
    let player = diver(&mut room, week, &plan);
    let lamp = plan.sites.lamp.expect("a lamp");
    stand_at(&mut room, player, [lamp[0] + 2.0, lamp[1]]);
    kill_all(&mut room);
    run(&mut room, 2);
    assert_eq!(room.ask_passage(player, PassageAsk::LightLamp), 0);
    run(&mut room, super::passage_asks::LAMP_TICKS + 1);
    assert!(room.passage_seen(player).is_some_and(|seen| seen.lamp_lit));
    (week, plan, room, player)
}

#[test]
fn a_zone_whose_web_has_turned_refuses_all_but_home_at_a_lamp_lit() {
    let (week, plan, mut room, player) = lit_lamp();
    let late = diver(&mut room, week, &plan);
    let body = room.players[&player].fighter.body;
    stand_at(&mut room, late, [body.x, body.y]);
    room.set_minute(week_begins(week + 1));
    assert_eq!(room.ask_passage(late, PassageAsk::LightLamp), refusal(gear::Refusal::Shifted), "no lamp of last week");
    assert_eq!(room.ask_passage(player, PassageAsk::GoHome), 0, "home from the lamp lit");

    let (week, plan, mut room) = zone_room(Deal::Skirmish, None, Route::Public);
    let player = diver(&mut room, week, &plan);
    room.zone_mut().expect("a zone").round.took_part.insert(player);
    kill_all(&mut room);
    run(&mut room, 2);
    stand_at(&mut room, player, plan.sites.onward.first().expect("a way on").at);
    room.set_minute(week_begins(week + 1));
    assert_eq!(room.ask_passage(player, PassageAsk::GoOn { mouth: 0 }), refusal(gear::Refusal::Shifted));
    assert_eq!(dive(&room, player).map(|dive| dive.zone), Some(plan.zone.number), "still where it was");
}

#[test]
fn a_fallen_player_asks_the_passages_nothing() {
    let (_, _, mut room, player) = lit_lamp();
    let found = room.players.get_mut(&player).expect("in");
    (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    assert_eq!(room.ask_passage(player, PassageAsk::GoHome), refusal(gear::Refusal::Fallen));
    assert!(dive(&room, player).is_some_and(|dive| !dive.homeward));
}

#[test]
fn a_lamp_lit_already_is_refused_as_lit() {
    let (_, _, mut room, player) = lit_lamp();
    assert_eq!(room.ask_passage(player, PassageAsk::LightLamp), refusal(gear::Refusal::AlreadyLit));
}

#[test]
fn a_gauntlets_time_runs_from_the_later_of_a_players_arrival_and_the_rounds_start() {
    let (week, plan, mut room) = zone_room(Deal::Mission(Mission::Gauntlet), None, Route::Public);
    let first = diver(&mut room, week, &plan);
    let far = room.far_mouth().expect("a far mouth");
    stand_at(&mut room, first, far);
    run(&mut room, 2);
    assert!(room.passage_seen(first).is_some_and(|seen| seen.done), "the first round");
    stand_at(&mut room, first, plan.sites.arrive);
    let second = diver(&mut room, week, &plan);
    let keep = |room: &mut Room, ticks: u64| {
        for _ in 0..ticks {
            kill_all(room);
            for id in [first, second] {
                room.players.get_mut(&id).expect("in").fighter.health = 1e9;
            }
            room.tick();
        }
    };
    keep(&mut room, super::passage_deal::AGAIN_TICKS + 2);
    assert!(room.passage_seen(second).is_some_and(|seen| !seen.done), "the next round");
    keep(&mut room, 60 * 60);
    stand_at(&mut room, second, far);
    keep(&mut room, 2);
    assert!(dive(&room, second).is_some_and(|dive| dive.paid == [plan.zone.number]), "in time in its own round");
}

#[test]
fn the_waves_called_never_overflow() {
    let (week, plan, mut room) = zone_room(Deal::Mission(Mission::Kindle), None, Route::Public);
    diver(&mut room, week, &plan);
    run(&mut room, 1);
    room.zone_mut().expect("a zone").round.waves = u8::MAX;
    for _ in 0..super::passage_deal::AGAIN_TICKS {
        kill_all(&mut room);
        room.tick();
    }
    assert_eq!(room.zone().expect("a zone").round.waves, u8::MAX);
}

#[test]
fn a_kindle_counts_toward_the_bounties_only_of_those_who_took_part() {
    let (week, plan, mut room) = zone_room(Deal::Mission(Mission::Kindle), None, Route::Public);
    let (fighter, idle) = (diver(&mut room, week, &plan), diver(&mut room, week, &plan));
    for id in [fighter, idle] {
        room.players.get_mut(&id).expect("in").character.atheric_bounties.held.insert("lanternfall".to_owned(), (1, 0));
    }
    let zone = room.zone_mut().expect("a zone");
    zone.round.took_part.insert(fighter);
    zone.round.lit.iter_mut().for_each(|lit| *lit = true);
    run(&mut room, 2);
    let held = |id: PlayerId| room.players[&id].character.atheric_bounties.held.get("lanternfall").copied();
    assert_eq!((held(fighter), held(idle)), (Some((1, 1)), Some((1, 0))));
}

#[test]
fn a_homeward_dive_joining_another_islands_patrol_zone_loses_its_haul() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    assert!(room.open_mouths("continent-2", vec![([0.0, 0.0], [0.0, 20.0])]));
    let player = room.join().expect("joined");
    let mut character = room.players[&player].character.clone();
    let start = Start { island: ISLAND, week: 2_900, route: Route::Public, mouth: 0, zone: 4, depth: 5, lamp: None };
    character.begin_dive(&start).expect("begun");
    let dive = character.passage.as_mut().expect("diving");
    (dive.lamp, dive.homeward) = (1, true);
    dive.haul.materials.add(gear::character::Stuff::Fragments(gear::kinds::Stock::Weapon), 2);
    let fragments = character.materials.weapon_fragments;
    room.players.get_mut(&player).expect("here").character = character;
    room.passage_arrived(player);
    let found = &room.players[&player];
    assert!(found.character.passage.is_none());
    assert_eq!(found.character.materials.weapon_fragments, fragments, "lost");
}
