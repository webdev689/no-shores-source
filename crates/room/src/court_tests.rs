//! The Court: the Boss's health made a match for the company; its wards holding its health at two thirds and one third
//! until its anchors are each stood on three seconds, with waves at each ward and the Boss slamming at its post; the
//! Reckoning from the first ward broken, harming only those it reaches outside its light; and Fury's weight.

use super::*;
use crate::encounters::SealState;
use crate::encounters::encounters_tests::{elite_room, hardy, put, ticks, told};
use crate::{How, PlayerId};
use combat::judge::{Blow, BlowKind};
use combat::{Action, Stroke, Verdict};

/// A room whose seals are broken and whose Boss has woken, a hardy player in it, its waves and band gone.
fn court() -> (Room, PlayerId, FighterId) {
    let mut room = elite_room("krakens-grotto");
    let player = hardy(&mut room);
    for seal in &mut room.encounters.as_mut().expect("encounters").seals {
        seal.state = SealState::Broken;
    }
    room.tick();
    let boss = room.boss().expect("woken");
    room.take_events();
    (room, player, boss)
}

/// Lands `damage` of the player's swing on a foe, as the room settles a blow it judged a hit.
fn strike(room: &mut Room, player: PlayerId, foe: FighterId, damage: f64) {
    let blow = Blow {
        striker: player,
        kind: BlowKind::Swing(Stroke::Down),
        from: [0.0, 0.0],
        damage,
        poise: 0.0,
        guard: 0.0,
        parryable: true,
        blockable: true,
        knocks_down: false,
        through: 1.0,
        stagger: 1.0,
        element: 0,
        crit: false,
    };
    room.settle(&blow, How::Swing, foe, Verdict::Hit { damage, poise: 0.0 }, Some(gear::Slot::Melee));
}

/// A point in the end room, by its first cell's middle.
fn in_court(room: &Room) -> [f64; 3] {
    let cell = room.encounters.as_ref().expect("encounters").court_cells[0];
    crate::encounters::encounters_tests::middle_of(room, cell)
}

/// Raises the first ward and breaks it.
fn first_ward_broken(room: &mut Room, player: PlayerId, boss: FighterId) {
    let most = room.foes[&boss].fighter.health_max;
    strike(room, player, boss, most);
    room.tick();
    stand_anchors(room, player);
}

fn anchors(room: &Room) -> Vec<[f64; 3]> {
    room.encounters.as_ref().expect("encounters").plan.anchors.clone()
}

/// Stands the player on each anchor in turn for ANCHOR_TICKS.
fn stand_anchors(room: &mut Room, player: PlayerId) {
    for anchor in anchors(room) {
        for _ in 0..ANCHOR_TICKS {
            put(room, player, anchor);
            room.tick();
        }
    }
}

#[test]
fn an_anchor_is_stood_on_in_the_court_alone_never_from_the_storey_over_it() {
    let (mut room, player, boss) = court();
    let most = room.foes[&boss].fighter.health_max;
    strike(&mut room, player, boss, most);
    room.tick();
    for [x, y, z] in anchors(&room) {
        for _ in 0..ANCHOR_TICKS {
            put(&mut room, player, [x, y, z + dungeon::STOREY_M]);
            room.tick();
        }
    }
    assert_eq!(room.encounter_seen().expect("seen").wards_broken, 0, "the ward stands");
}

#[test]
fn the_boss_is_warded_at_two_thirds_and_one_third_until_each_anchor_is_stood_on_three_seconds() {
    let (mut room, player, boss) = court();
    let most = room.foes[&boss].fighter.health_max;
    strike(&mut room, player, boss, most);
    assert_eq!(room.foes[&boss].fighter.health, most * WARDS[0], "a killing blow held at two thirds");
    assert!(!room.foes[&boss].fighter.dead());
    let foes = room.foes.len();
    room.tick();
    assert_eq!(told(&room.take_events(), EventKind::WardRaised), 1);
    assert_eq!(room.foes.len(), foes + crate::encounters::WAVE_FOES.0, "two foes at the ward");
    strike(&mut room, player, boss, most / 10.0);
    assert_eq!(room.foes[&boss].fighter.health, most * WARDS[0], "nothing passes the ward");
    let seen = room.encounter_seen().expect("seen");
    assert_eq!((seen.ward, seen.wards_broken), (1, 0));
    // Two anchors are not enough.
    let laid = anchors(&room);
    for anchor in &laid[..2] {
        for _ in 0..ANCHOR_TICKS {
            put(&mut room, player, *anchor);
            room.tick();
        }
    }
    assert_eq!(room.encounter_seen().expect("seen").wards_broken, 0);
    for _ in 0..ANCHOR_TICKS {
        put(&mut room, player, laid[2]);
        room.tick();
    }
    assert_eq!(told(&room.take_events(), EventKind::WardBroken), 1);
    assert_eq!(room.encounter_seen().expect("seen").wards_broken, 1);
    strike(&mut room, player, boss, most / 10.0);
    assert!(room.foes[&boss].fighter.health < most * WARDS[0], "harmed again past the broken ward");
    strike(&mut room, player, boss, most);
    assert_eq!(room.foes[&boss].fighter.health, most * WARDS[1], "the second ward at one third");
    room.tick();
    stand_anchors(&mut room, player);
    assert_eq!(room.encounter_seen().expect("seen").wards_broken, 2);
    strike(&mut room, player, boss, most);
    assert!(room.foes[&boss].fighter.dead(), "no ward is left");
}

#[test]
fn the_reckoning_comes_from_the_first_ward_broken_and_harms_only_those_outside_its_light() {
    let (mut room, player, boss) = court();
    let other = hardy(&mut room);
    let most = room.foes[&boss].fighter.health_max;
    strike(&mut room, player, boss, most);
    room.tick();
    assert!(room.reckoning_seen().is_none(), "none while the first ward stands");
    stand_anchors(&mut room, player);
    let (left, at) = room.reckoning_seen().expect("shown once the first ward is broken");
    assert_eq!(u64::from(left), RECKONING_WARNING, "its whole warning shown");
    let light = anchors(&room)[usize::from(at)];
    let whole = room.players[&player].fighter.health_max;
    let healths = |room: &Room| [room.players[&player].fighter.health, room.players[&other].fighter.health];
    let before = healths(&room);
    // By the Boss's post, in the Court but at least ANCHOR_FROM_POST_M from every anchor's light.
    let post = room.garrison[0].at;
    room.take_events();
    for _ in 0..RECKONING_WARNING {
        put(&mut room, player, light);
        put(&mut room, other, post);
        room.tick();
    }
    let after = healths(&room);
    // The Boss and its ward's foes strike too, a sliver of so hardy a health beside the Reckoning's share.
    assert!(before[0] - after[0] < whole * 0.01, "in the light: untouched by it");
    let lost = before[1] - after[1];
    assert!(lost >= whole * RECKONING_SHARE && lost < whole * (RECKONING_SHARE + 0.01), "outside: seven tenths");
    assert_eq!(told(&room.take_events(), EventKind::ReckoningLanded), 2, "told to each player");
    assert!(room.reckoning_seen().is_none(), "until the next");
    ticks(&mut room, RECKONING_EVERY - RECKONING_WARNING);
    let (_, next) = room.reckoning_seen().expect("forty seconds on");
    assert_eq!(usize::from(next), (usize::from(at) + 1) % crate::encounter_plan::ANCHORS, "at the next anchor");
}

#[test]
fn fury_weighs_the_foes_blows_a_tenth_more_every_thirty_seconds_from_eight_minutes_to_three_times() {
    let (mut room, player, boss) = court();
    ticks(&mut room, 600);
    assert_eq!(room.encounters.as_ref().expect("encounters").court.fury_from, None, "not while no one is in the Court");
    let at = in_court(&room);
    put(&mut room, player, at);
    room.tick();
    let woke = room.encounters.as_ref().expect("encounters").court.fury_from.expect("started as they came in");
    assert_eq!(woke, room.clock);
    assert_eq!(room.fury_times(), 1.0);
    room.clock = woke + FURY_FROM - 60 * 60;
    assert_eq!(room.encounter_seen().expect("seen").fury_ticks, 60 * 60, "a minute to Fury");
    let blow = Blow {
        striker: boss,
        kind: BlowKind::Swing(Stroke::Down),
        from: [0.0, 0.0],
        damage: 10.0,
        poise: 0.0,
        guard: 0.0,
        parryable: true,
        blockable: true,
        knocks_down: false,
        through: 1.0,
        stagger: 1.0,
        element: 0,
        crit: false,
    };
    room.clock = woke + FURY_FROM - 1;
    assert_eq!(room.modded_blow(&blow, player), 1.0, "not before eight minutes");
    room.clock = woke + FURY_FROM;
    assert!((room.modded_blow(&blow, player) - 1.1).abs() < 1e-12, "a tenth more at eight minutes");
    room.clock = woke + FURY_FROM + FURY_EVERY * 5;
    assert!((room.fury_times() - 1.6).abs() < 1e-12);
    room.clock = woke + FURY_FROM + FURY_EVERY * 1000;
    assert!((room.fury_times() - FURY_MOST).abs() < 1e-12, "three times at the most");
    assert_eq!(room.encounter_seen().expect("seen").fury, 20);
    assert_eq!(room.encounter_seen().expect("seen").fury_ticks, 0, "begun");
    let swing = Blow { striker: player, ..blow };
    assert_eq!(room.modded_blow(&swing, boss), 1.0, "a player's blow is not the Boss's company's");
}

#[test]
fn the_reckoning_and_fury_end_with_the_boss() {
    let (mut room, player, boss) = court();
    let at = in_court(&room);
    put(&mut room, player, at);
    room.tick();
    first_ward_broken(&mut room, player, boss);
    assert!(room.reckoning_seen().is_some());
    let found = room.foes.get_mut(&boss).expect("standing");
    (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    room.tick();
    room.clock += FURY_FROM * 2;
    assert!(room.reckoning_seen().is_none(), "no Reckoning once it has fallen");
    assert_eq!(room.fury_times(), 1.0, "no Fury once it has fallen");
}

#[test]
fn the_boss_is_made_a_match_for_the_living_players_as_it_wakes() {
    let mut room = elite_room("krakens-grotto");
    let company = [hardy(&mut room), hardy(&mut room), hardy(&mut room)];
    let found = room.players.get_mut(&company[2]).expect("in");
    (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    let alone = {
        let mut one = elite_room("krakens-grotto");
        hardy(&mut one);
        crate::encounters::encounters_tests::unseal(&mut one);
        let boss = one.boss().expect("woken");
        one.foes[&boss].fighter.health_max
    };
    crate::encounters::encounters_tests::unseal(&mut room);
    let boss = room.boss().expect("woken");
    let fighter = &room.foes[&boss].fighter;
    assert!((fighter.health_max - alone * 1.5).abs() < 1e-6, "half again for the second living player");
    assert_eq!(fighter.health, fighter.health_max, "whole");
}

#[test]
fn a_ward_stands_a_wave_for_each_living_player_and_another_fifteen_seconds_on() {
    let (mut room, player, boss) = court();
    let others = [hardy(&mut room), hardy(&mut room)];
    let most = room.foes[&boss].fighter.health_max;
    strike(&mut room, player, boss, most);
    // The ward's waves, apart from any foe the Boss calls itself.
    let waves = |room: &Room| room.foes.keys().filter(|id| room.quests.spoilless.contains(id)).count();
    room.tick();
    assert_eq!(waves(&room), others.len() + 1, "one for each of three");
    ticks(&mut room, WARD_WAVE_AGAIN - 1);
    assert_eq!(waves(&room), 3);
    room.tick();
    assert_eq!(waves(&room), 6, "a second wave while the ward stands");
    ticks(&mut room, WARD_WAVE_AGAIN * 2);
    assert_eq!(waves(&room), 6, "no third");
}

#[test]
fn a_wards_wave_comes_in_at_the_end_rooms_doorways_clear_of_the_anchors_and_once_refused_comes_when_there_is_room() {
    let (mut room, player, boss) = court();
    let laid = anchors(&room);
    let doors = room.encounters.as_ref().expect("encounters").plan.court_doors.clone();
    assert!(!doors.is_empty(), "the end room's doorways");
    let off =
        |at: [f64; 3]| laid.iter().map(|anchor| crate::encounters::seals::near(at, *anchor)).fold(f64::MAX, f64::min);
    // Fill the Court's waves to a lone player's most before the ward rises, so its first wave is refused.
    let mut encounters = room.encounters.take().expect("encounters");
    let of = crate::encounters::WaveOf::Court;
    assert_eq!(
        room.stand_seal_wave(&mut encounters, of, &doors, 1) + room.stand_seal_wave(&mut encounters, of, &doors, 1),
        4
    );
    room.encounters = Some(encounters);
    let most = room.foes[&boss].fighter.health_max;
    strike(&mut room, player, boss, most);
    let waves = |room: &Room| room.encounters.as_ref().expect("encounters").court.waves.clone();
    room.tick();
    assert_eq!(waves(&room).len(), 4, "refused while four stand");
    for id in waves(&room) {
        let found = room.foes.get_mut(&id).expect("standing");
        (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    }
    ticks(&mut room, crate::encounters::WAVE_RETRY_TICKS);
    let stood: Vec<FighterId> = waves(&room).into_iter().skip(4).collect();
    assert_eq!(stood.len(), 2, "the ward's wave, once there was room");
    let farthest = doors.iter().map(|door| off(*door)).fold(0.0, f64::max);
    for id in stood {
        let body = room.foes[&id].fighter.body;
        let apart = off([body.x, body.y, body.z]);
        assert!(apart >= crate::encounters::seals::WAVE_OFF_PIECES_M.min(farthest) - 1.0, "{apart} m off an anchor");
    }
}

#[test]
fn the_courts_waves_are_kept_to_two_for_each_living_player_four_at_the_fewest() {
    let (mut room, _, _) = court();
    let laid = anchors(&room);
    let mut encounters = room.encounters.take().expect("encounters");
    let of = crate::encounters::WaveOf::Court;
    assert_eq!(room.stand_seal_wave(&mut encounters, of, &laid, 1), 2);
    assert_eq!(room.stand_seal_wave(&mut encounters, of, &laid, 1), 2, "four for a lone player");
    assert_eq!(room.stand_seal_wave(&mut encounters, of, &laid, 1), 0, "and no more while they stand");
    room.encounters = Some(encounters);
}

#[test]
fn with_three_living_players_a_filled_anchor_empties_six_seconds_after_it_is_left() {
    let (mut room, player, boss) = court();
    let _others = [hardy(&mut room), hardy(&mut room)];
    let most = room.foes[&boss].fighter.health_max;
    strike(&mut room, player, boss, most);
    room.tick();
    let laid = anchors(&room);
    for _ in 0..ANCHOR_TICKS {
        put(&mut room, player, laid[0]);
        room.tick();
    }
    let held = |room: &Room| room.encounters.as_ref().expect("encounters").court.anchors[0];
    assert_eq!(held(&room), ANCHOR_TICKS, "filled");
    put(&mut room, player, laid[1]);
    ticks(&mut room, ANCHOR_EMPTIES_TICKS);
    assert_eq!(held(&room), ANCHOR_TICKS, "still filled six seconds on");
    room.tick();
    assert_eq!(held(&room), 0, "then emptied");
}

#[test]
fn with_one_or_two_living_players_a_left_anchor_keeps_what_it_holds() {
    let (mut room, player, boss) = court();
    let _other = hardy(&mut room);
    let most = room.foes[&boss].fighter.health_max;
    strike(&mut room, player, boss, most);
    room.tick();
    let laid = anchors(&room);
    for _ in 0..ANCHOR_TICKS {
        put(&mut room, player, laid[0]);
        room.tick();
    }
    put(&mut room, player, laid[1]);
    ticks(&mut room, ANCHOR_EMPTIES_TICKS * 2);
    assert_eq!(room.encounters.as_ref().expect("encounters").court.anchors[0], ANCHOR_TICKS, "kept");
}

#[test]
fn the_warded_boss_slams_round_it_every_eight_seconds_shown_two_seconds_first() {
    let (mut room, player, boss) = court();
    let most = room.foes[&boss].fighter.health_max;
    strike(&mut room, player, boss, most);
    room.tick();
    let raised = room.clock;
    let whole = room.players[&player].fighter.health_max;
    let mut shown = Vec::new();
    room.take_events();
    let mut before = 0.0;
    // A cell of the Court beside the Boss's, within the slam's reach.
    let post = room.foes[&boss].fighter.body;
    let cells = room.encounters.as_ref().expect("encounters").court_cells.clone();
    let beside = cells.into_iter().map(|cell| crate::encounters::encounters_tests::middle_of(&room, cell)).find(|at| {
        let apart = libm::hypot(at[0] - post.x, at[1] - post.y);
        apart > 1.0 && apart < SLAM_M - 0.3
    });
    let beside = beside.expect("a cell of the Court beside the Boss");
    while room.clock < raised + SLAM_EVERY {
        put(&mut room, player, beside);
        before = room.players[&player].fighter.health;
        room.tick();
        shown.push(room.encounter_seen().expect("seen").slam_ticks);
    }
    let lost = before - room.players[&player].fighter.health;
    assert!(lost >= whole * SLAM_SHARE && lost < whole * (SLAM_SHARE + 0.01), "three tenths: {lost}");
    assert_eq!(told(&room.take_events(), EventKind::BossSlammed), 1);
    let warned = shown.iter().filter(|ticks| **ticks > 0).count() as u64;
    assert_eq!(warned, SLAM_WARNING, "shown two seconds first");
}

#[test]
fn the_warded_boss_runs_back_to_its_post_and_stands_there() {
    let (mut room, player, boss) = court();
    let post = room.garrison[0].at;
    // A cell of the Court about a cell from its post.
    let off = room.encounters.as_ref().expect("encounters").court_cells.clone().into_iter().find_map(|cell| {
        let at = crate::encounters::encounters_tests::middle_of(&room, cell);
        let apart = libm::hypot(at[0] - post[0], at[1] - post[1]);
        (apart > 3.0 && apart < 3.4).then_some(at)
    });
    let at = off.expect("a cell of the Court beside its post's");
    let body = &mut room.foes.get_mut(&boss).expect("it").fighter.body;
    (body.x, body.y, body.z) = (at[0], at[1], at[2]);
    let most = room.foes[&boss].fighter.health_max;
    strike(&mut room, player, boss, most);
    // Once the blow it was winding up has landed.
    ticks(&mut room, 300);
    let body = room.foes[&boss].fighter.body;
    assert!(libm::hypot(body.x - post[0], body.y - post[1]) <= AT_POST_M + 0.2, "at its post");
}

#[test]
fn a_fallen_boss_never_stands_again_in_its_run() {
    let (mut room, player, boss) = court();
    let found = room.foes.get_mut(&boss).expect("standing");
    (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    room.tick();
    assert!(room.boss().is_none(), "fallen");
    // No player near its post, as a company farming the other rooms leaves it.
    room.leave(player);
    ticks(&mut room, crate::garrison::GREAT_STAND_AGAIN + 60);
    let standing = &room.garrison[0].standing;
    assert!(standing.iter().all(|id| room.foes.get(id).is_none_or(|foe| foe.fighter.dead())), "never again");
}

#[test]
fn the_reckoning_reaches_the_end_room_and_the_rooms_sharing_a_doorway_with_it_and_no_farther() {
    let (mut room, player, boss) = court();
    let near = hardy(&mut room);
    let far = hardy(&mut room);
    first_ward_broken(&mut room, player, boss);
    let (_, at) = room.reckoning_seen().expect("shown once the first ward is broken");
    let light = anchors(&room)[usize::from(at)];
    let laid = crate::encounters::encounters_tests::laid_dungeon("krakens-grotto");
    let reach = reckoning_reach(&laid);
    let beside = (0..laid.rooms.len())
        .find(|&other| other != laid.end() && reach.contains(&laid.rooms[other].cells[0]))
        .expect("a room sharing a doorway with the end room");
    let away = room.encounters.as_ref().expect("encounters").plan.seals[0].pieces[0];
    let cell = room.encounters.as_ref().expect("encounters").plan.cell_at(away).expect("its cell");
    assert!(!reach.contains(&cell), "the first seal's room lies beyond its reach");
    let [x, y, z] = laid.standing_point(laid.rooms[beside].cells[0]);
    let before = [room.players[&near].fighter.health, room.players[&far].fighter.health];
    for _ in 0..RECKONING_WARNING {
        put(&mut room, player, light);
        put(&mut room, near, [x, y, z]);
        put(&mut room, far, away);
        room.tick();
    }
    assert!(room.players[&near].fighter.health < before[0], "reached in a room beside the Court");
    assert_eq!(room.players[&far].fighter.health, before[1], "not reached beyond it");
}

#[test]
fn on_the_tick_its_ward_rises_the_boss_slams_no_one_its_two_second_warning_comes_first() {
    let (mut room, player, boss) = court();
    let most = room.foes[&boss].fighter.health_max;
    strike(&mut room, player, boss, most);
    let at = room.foes[&boss].fighter.body;
    put(&mut room, player, [at.x + 1.0, at.y, at.z]);
    let before = room.players[&player].fighter.health;
    room.take_events();
    room.tick();
    let events = room.take_events();
    assert_eq!(told(&events, EventKind::WardRaised), 1, "the ward rises this tick");
    assert_eq!(told(&events, EventKind::BossSlammed), 0, "and slams no one as it does");
    assert!(room.players[&player].fighter.health >= before, "unharmed by a slam");
}

#[test]
fn the_ward_rises_at_exactly_two_thirds_of_the_bosss_health_and_not_above() {
    let (mut room, _, boss) = court();
    let fighter = room.foes[&boss].fighter;
    let held = fighter.health_max * WARDS[0];
    let above = room.warded(boss, Fighter { health: held + 1e-6, ..fighter });
    assert!(!room.encounters.as_ref().expect("encounters").court.ward_up, "a hair above: no ward");
    assert_eq!(above.health, held + 1e-6);
    let at = room.warded(boss, Fighter { health: held, ..fighter });
    assert!(room.encounters.as_ref().expect("encounters").court.ward_up, "at two thirds exactly: warded");
    assert_eq!(at.health, held);
}

#[test]
fn the_foes_storeys_lie_half_a_dungeon_storey_apart() {
    assert_eq!(::foes::tuning::STOREYS_APART_M, dungeon::STOREY_M / 2.0);
}

#[test]
fn a_foe_hunts_the_nearest_player_on_its_own_storey_never_one_over_or_under_it() {
    let (mut room, player, boss) = court();
    let other = hardy(&mut room);
    let body = room.foes[&boss].fighter.body;
    // The player on the Boss's storey stands farther across than the one a storey under it.
    let far = room.encounters.as_ref().expect("encounters").court_cells.clone().into_iter().rev().find_map(|cell| {
        let at = crate::encounters::encounters_tests::middle_of(&room, cell);
        (libm::hypot(at[0] - body.x, at[1] - body.y) > 3.0).then_some(at)
    });
    put(&mut room, player, far.expect("a cell of the Court away from the Boss"));
    put(&mut room, other, [body.x + 1.0, body.y, body.z - dungeon::STOREY_M]);
    room.hunt_nearest(&[boss]);
    assert_eq!(room.foes[&boss].brain.fights(), Some(player), "the player on its own storey");
}

#[test]
fn the_warded_boss_a_storey_off_its_post_makes_back_for_it() {
    let (mut room, player, boss) = court();
    let most = room.foes[&boss].fighter.health_max;
    strike(&mut room, player, boss, most);
    room.tick();
    assert!(room.encounters.as_ref().is_some_and(|found| found.court.ward_up), "warded");
    let post = room.garrison[0].at;
    let body = &mut room.foes.get_mut(&boss).expect("it").fighter.body;
    // Straight over its post, a storey up: as near as can be across, yet nowhere near it.
    (body.x, body.y, body.z) = (post[0], post[1], post[2] + dungeon::STOREY_M);
    let noticed: Vec<(FighterId, combat::Fighter)> = room.fighters();
    let intents = room.think_foes(&noticed);
    let (_, (_, intent)) = intents.iter().find(|(id, _)| *id == boss).expect("the Boss thinks");
    assert_eq!(intent.controls.forward, 1.0, "it runs, never stands off its post");
}
