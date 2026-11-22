//! Each seal's rules: a Litany's runes in order, a wrong one darkening them and waking foes; a Weighing's plates held
//! together, two of them under three players; an Ascent's drowned floor and its stone; a Holdfast's ring, its relic
//! drained by foes and a drained relic halving the hold.

use super::*;
use crate::encounters::SealState;
use crate::encounters::encounters_tests::{elite_room, hardy, middle_of, put, seal_of, ticks, told};

fn plan(room: &Room, seal: usize) -> SealPlan {
    room.encounters.as_ref().expect("encounters").plan.seals[seal].clone()
}

fn state(room: &Room, seal: usize) -> Seal {
    room.encounters.as_ref().expect("encounters").seals[seal].clone()
}

/// A player stood in a seal's room, on a cell none of its pieces is on, so the seal runs.
fn inside(room: &mut Room, player: PlayerId, seal: &SealPlan) {
    let away = seal.cells.iter().copied().find(|&cell| {
        let [x, y] = middle_of(room, cell);
        let clear = |piece: &[f64; 3]| libm::hypot(piece[0] - x, piece[1] - y) > 2.0;
        seal.pieces.iter().all(clear)
            && seal
                .pads
                .iter()
                .all(|pad| x < pad.min_x - 1.0 || x > pad.max_x + 1.0 || y < pad.min_y - 1.0 || y > pad.max_y + 1.0)
    });
    let [x, y] = middle_of(room, away.unwrap_or(seal.cells[0]));
    put(room, player, [x, y, 0.0]);
}

/// One of the dungeon's foes stood at a point, as a wave's are; its number.
pub(crate) fn stand_one(room: &mut Room, at: [f64; 2]) -> FighterId {
    let before: Vec<FighterId> = room.foes.keys().copied().collect();
    let mut encounters = room.encounters.take().expect("encounters");
    room.stand_foes(&mut encounters, None, &[at], 1);
    room.encounters = Some(encounters);
    *room.foes.keys().find(|id| !before.contains(id)).expect("one stood")
}

#[test]
fn a_litany_shows_its_runes_in_turn_and_breaks_once_they_are_stepped_in_order() {
    let mut room = elite_room("krakens-grotto");
    let player = hardy(&mut room);
    let seal = seal_of(&room, SealKind::Litany);
    let laid = plan(&room, seal);
    inside(&mut room, player, &laid);
    room.tick();
    let marks = || room.encounter_seen().expect("seen").seals[seal].marks.clone();
    assert_eq!(marks().iter().filter(|mark| **mark == 1).count(), 1, "one rune shows at a time");
    assert_eq!(marks()[0], 1, "the first first");
    ticks(&mut room, RUNE_SHOWN_TICKS);
    assert_eq!(room.encounter_seen().expect("seen").seals[seal].marks[1], 1, "then the next");
    for (nth, rune) in laid.pieces.iter().enumerate() {
        put(&mut room, player, *rune);
        room.tick();
        let seen = room.encounter_seen().expect("seen");
        assert_eq!(seen.seals[seal].marks[nth], 2, "stepped in order, it stays lit");
        inside(&mut room, player, &laid);
        room.tick();
    }
    assert_eq!(state(&room, seal).state, SealState::Broken);
    assert_eq!(told(&room.take_events(), EventKind::SealBroken), 1);
}

#[test]
fn a_wrong_rune_darkens_them_all_and_wakes_two_of_the_dungeons_foes_but_harms_no_one() {
    let mut room = elite_room("krakens-grotto");
    let player = hardy(&mut room);
    let seal = seal_of(&room, SealKind::Litany);
    let laid = plan(&room, seal);
    inside(&mut room, player, &laid);
    room.tick();
    put(&mut room, player, laid.pieces[0]);
    room.tick();
    inside(&mut room, player, &laid);
    room.tick();
    let (health, foes) = (room.players[&player].fighter.health, room.foes.len());
    room.take_events();
    put(&mut room, player, laid.pieces[2]);
    room.tick();
    assert_eq!(told(&room.take_events(), EventKind::RuneWrong), 1);
    assert_eq!(state(&room, seal).held, 0, "every rune dark again");
    assert!(room.encounter_seen().expect("seen").seals[seal].marks.iter().all(|mark| *mark == 0), "none shows yet");
    assert_eq!(room.foes.len(), foes + WRONG_FOES);
    assert_eq!(room.players[&player].fighter.health, health, "a wrong rune never hurts by itself");
    ticks(&mut room, LITANY_PAUSE_TICKS);
    assert_eq!(room.encounter_seen().expect("seen").seals[seal].marks[0], 1, "the show starts again");
}

#[test]
fn a_weighing_holds_three_plates_together_or_two_under_three_players_and_holds_nothing_with_a_plate_empty() {
    let mut room = elite_room("pale-undercroft");
    let players = [hardy(&mut room), hardy(&mut room)];
    let seal = seal_of(&room, SealKind::Weighing);
    let laid = plan(&room, seal);
    assert_eq!(room.encounter_seen().expect("seen").seals[seal].marks.len(), 2, "two plates for two");
    put(&mut room, players[0], laid.pieces[0]);
    inside(&mut room, players[1], &laid);
    ticks(&mut room, 60);
    assert_eq!(state(&room, seal).held, 0, "one plate alone holds nothing");
    put(&mut room, players[1], laid.pieces[1]);
    ticks(&mut room, WEIGHING_TICKS - 1);
    assert_eq!(state(&room, seal).state, SealState::Running);
    room.tick();
    assert_eq!(state(&room, seal).state, SealState::Broken, "held six seconds in all");
    let mut three = elite_room("pale-undercroft");
    let company = [hardy(&mut three), hardy(&mut three), hardy(&mut three)];
    put(&mut three, company[0], laid.pieces[0]);
    put(&mut three, company[1], laid.pieces[1]);
    ticks(&mut three, 120);
    assert_eq!(state(&three, seal).held, 0, "three players hold three plates");
    put(&mut three, company[2], laid.pieces[2]);
    ticks(&mut three, 10);
    assert_eq!(state(&three, seal).held, 10);
    assert_eq!(three.encounter_seen().expect("seen").seals[seal].marks, vec![1, 1, 1]);
}

#[test]
fn a_plate_stays_held_after_its_player_steps_off_so_one_player_can_hold_two() {
    let mut room = elite_room("pale-undercroft");
    let player = hardy(&mut room);
    let seal = seal_of(&room, SealKind::Weighing);
    let laid = plan(&room, seal);
    put(&mut room, player, laid.pieces[0]);
    room.tick();
    put(&mut room, player, laid.pieces[1]);
    ticks(&mut room, 100);
    assert_eq!(state(&room, seal).held, 100, "the first plate still held as the second is stood on");
    assert_eq!(room.encounter_seen().expect("seen").seals[seal].marks, vec![1, 1]);
    // Alone, a plate lingers its three seconds and the walk between the two plates besides.
    let linger = plate_linger(1, &laid.pieces);
    let walk = libm::hypot(laid.pieces[0][0] - laid.pieces[1][0], laid.pieces[0][1] - laid.pieces[1][1]);
    assert!(linger > PLATE_LINGER_TICKS + (walk / movement::TUNING.walk * 59.0) as u64, "{linger}");
    assert_eq!(plate_linger(2, &laid.pieces), PLATE_LINGER_TICKS, "two players stand on one each");
    ticks(&mut room, PLATE_LINGER_TICKS);
    assert_eq!(state(&room, seal).held, 100 + PLATE_LINGER_TICKS, "the first still held past three seconds");
    assert_eq!(room.encounter_seen().expect("seen").seals[seal].marks, vec![1, 1]);
}

#[test]
fn one_player_holds_a_weighing_walking_between_its_two_plates() {
    let mut room = elite_room("cinder-deep");
    let player = hardy(&mut room);
    let seal = seal_of(&room, SealKind::Weighing);
    let laid = plan(&room, seal);
    let [first, second] = [laid.pieces[0], laid.pieces[1]];
    let apart = libm::hypot(first[0] - second[0], first[1] - second[1]);
    let walk = (apart / movement::TUNING.walk * 60.0) as u64;
    // Walked to and fro, a second on each plate: never held at a run alone with three seconds' linger.
    for crossing in 0..12 {
        put(&mut room, player, if crossing % 2 == 0 { first } else { second });
        ticks(&mut room, 60);
        // Walking between them, on neither.
        put(&mut room, player, [(first[0] + second[0]) / 2.0, (first[1] + second[1]) / 2.0, 0.0]);
        ticks(&mut room, walk);
        if state(&room, seal).state == SealState::Broken {
            return;
        }
    }
    panic!("a lone walker never broke the Weighing: held {}", state(&room, seal).held);
}

#[test]
fn a_weighings_waves_come_every_fifteen_seconds_from_its_doorways() {
    let mut room = elite_room("pale-undercroft");
    let player = hardy(&mut room);
    let seal = seal_of(&room, SealKind::Weighing);
    let laid = plan(&room, seal);
    inside(&mut room, player, &laid);
    room.tick();
    ticks(&mut room, WEIGHING_WAVE_TICKS - 1);
    assert!(room.foes.is_empty(), "none before fifteen seconds");
    room.tick();
    assert_eq!(room.foes.len(), crate::encounters::WAVE_FOES.0, "two for one player");
    assert!(room.foes.values().all(|foe| foe.brain.rank < ::foes::Rank::Miniboss));
}

#[test]
fn an_ascents_drowned_floor_harms_while_its_seal_holds_and_its_stone_held_two_seconds_breaks_it() {
    let mut room = elite_room("pale-undercroft");
    let player = room.join().expect("in");
    let seal = seal_of(&room, SealKind::Ascent);
    let laid = plan(&room, seal);
    let wet = laid.drowned.iter().copied().find(|&cell| {
        let [x, y] = middle_of(&room, cell);
        laid.pads
            .iter()
            .all(|pad| x < pad.min_x - 0.5 || x > pad.max_x + 0.5 || y < pad.min_y - 0.5 || y > pad.max_y + 0.5)
    });
    let [x, y] = middle_of(&room, wet.expect("a wet cell"));
    let whole = room.players[&player].fighter.health_max;
    let mut taken = Vec::new();
    for _ in 0..DROWNED_EVERY * 2 {
        put(&mut room, player, [x, y, 0.0]);
        let before = room.players[&player].fighter.health;
        room.tick();
        taken.push(before - room.players[&player].fighter.health);
    }
    assert_eq!(taken.iter().filter(|took| **took > 0.0).count(), 2, "once a second");
    assert!(taken.iter().all(|took| *took == 0.0 || (took - whole * DROWNED_SHARE).abs() < 1e-6));
    let top = *laid.pads.last().expect("a top pad");
    let stone = laid.pieces[0];
    let health = room.players[&player].fighter.health;
    for _ in 0..STONE_TICKS {
        put(&mut room, player, stone);
        room.tick();
    }
    assert_eq!(room.players[&player].fighter.health, health, "dry on the pads");
    assert_eq!(state(&room, seal).state, SealState::Broken, "the stone held two seconds");
    assert!((stone[2] - top.top).abs() < 1e-12);
    for _ in 0..DROWNED_EVERY * 2 {
        put(&mut room, player, [x, y, 0.0]);
        room.tick();
    }
    assert_eq!(room.players[&player].fighter.health, health, "drained once the seal is broken");
}

#[test]
fn a_holdfast_is_held_in_its_ring_and_a_relic_drained_by_foes_halves_the_hold() {
    let mut room = elite_room("krakens-grotto");
    let player = hardy(&mut room);
    let seal = seal_of(&room, SealKind::Holdfast);
    let laid = plan(&room, seal);
    put(&mut room, player, laid.pieces[0]);
    ticks(&mut room, HOLDFAST_WAVE_TICKS + 10);
    assert!(state(&room, seal).held >= HOLDFAST_WAVE_TICKS, "held in its ring");
    let foes_after_waves = room.foes.len();
    assert!(foes_after_waves > 0, "a wave every twelve seconds");
    // A foe in the ring drains a twentieth of the relic a second.
    room.send_foes_away();
    room.encounters.as_mut().expect("encounters").seals[seal].relic = 1.0;
    let foe = stand_one(&mut room, [laid.pieces[0][0] + 0.5, laid.pieces[0][1]]);
    for _ in 0..60 {
        let body = &mut room.foes.get_mut(&foe).expect("it").fighter.body;
        (body.x, body.y) = (laid.pieces[0][0] + 0.5, laid.pieces[0][1]);
        put(&mut room, player, laid.pieces[0]);
        room.tick();
    }
    assert!((state(&room, seal).relic - (1.0 - 60.0 * RELIC_DRAIN)).abs() < 1e-9, "a second's draining");
    let held = state(&room, seal).held;
    room.encounters.as_mut().expect("encounters").seals[seal].relic = RELIC_DRAIN / 2.0;
    let body = &mut room.foes.get_mut(&foe).expect("it").fighter.body;
    (body.x, body.y) = (laid.pieces[0][0] + 0.5, laid.pieces[0][1]);
    room.take_events();
    room.tick();
    assert_eq!(told(&room.take_events(), EventKind::RelicDrained), 1);
    assert_eq!(state(&room, seal).held, held.div_ceil(2), "the tick held, then the hold halved");
    assert_eq!(state(&room, seal).relic, 1.0, "the relic whole again");
}

#[test]
fn a_holdfast_breaks_once_held_forty_five_seconds_in_all() {
    let mut room = elite_room("krakens-grotto");
    let player = hardy(&mut room);
    let seal = seal_of(&room, SealKind::Holdfast);
    let laid = plan(&room, seal);
    put(&mut room, player, laid.pieces[0]);
    room.tick();
    room.encounters.as_mut().expect("encounters").seals[seal].held = HOLDFAST_TICKS - 2;
    room.tick();
    assert_eq!(state(&room, seal).state, SealState::Running);
    room.tick();
    assert_eq!(state(&room, seal).state, SealState::Broken);
}

#[test]
fn a_litanys_show_lights_each_rune_in_turn_then_waits() {
    assert_eq!(showing(10, 10, 4), Some(0));
    assert_eq!(showing(10 + RUNE_SHOWN_TICKS * 3, 10, 4), Some(3));
    assert_eq!(showing(10 + RUNE_SHOWN_TICKS * 4, 10, 4), None, "its pause");
    assert_eq!(showing(10 + RUNE_SHOWN_TICKS * 4 + LITANY_PAUSE_TICKS, 10, 4), Some(0), "again");
    assert_eq!(showing(5, 10, 4), None, "not yet begun");
    assert_eq!(plates_for(1), 2);
    assert_eq!(plates_for(2), 2);
    assert_eq!(plates_for(3), 3);
}
