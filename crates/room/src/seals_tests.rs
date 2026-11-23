//! Each seal's rules: a Litany's runes in order, a wrong one darkening them and waking foes; a Weighing's plates held
//! together, two of them under three living players in its room; an Ascent's drowned floor and its stone; a Holdfast's
//! ring, its relic drained by foes and a drained relic halving the hold; and a seal waiting while its room is guarded.

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

/// A foe of the garrison (not a wave) standing in a seal's room; its number.
fn guard(room: &mut Room, seal: &SealPlan) -> FighterId {
    let at = middle_of(room, seal.cells[seal.cells.len() / 2]);
    let id = stand_one(room, at);
    room.garrison.last_mut().expect("its post").arrival = false;
    id
}

/// Kills a foe where it stands.
fn kill(room: &mut Room, id: FighterId) {
    let found = room.foes.get_mut(&id).expect("standing");
    (found.fighter.health, found.fighter.action) = (0.0, combat::Action::Dead { elapsed: 0 });
}

#[test]
fn a_seal_waits_while_a_foe_of_the_garrison_stands_in_its_room_and_its_drowned_floor_harms_only_once_it_runs() {
    let mut room = elite_room("pale-undercroft");
    let player = hardy(&mut room);
    let seal = seal_of(&room, SealKind::Ascent);
    let laid = plan(&room, seal);
    let guard = guard(&mut room, &laid);
    let wet = laid.drowned.iter().copied().find(|&cell| {
        let [x, y] = middle_of(&room, cell);
        laid.pads
            .iter()
            .all(|pad| x < pad.min_x - 0.5 || x > pad.max_x + 0.5 || y < pad.min_y - 0.5 || y > pad.max_y + 0.5)
    });
    let [x, y] = middle_of(&room, wet.expect("a wet cell"));
    room.take_events();
    for _ in 0..DROWNED_EVERY * 2 {
        put(&mut room, player, [x, y, 0.0]);
        let body = &mut room.foes.get_mut(&guard).expect("it").fighter.body;
        (body.x, body.y) = (x + 1.0, y);
        room.tick();
    }
    assert_eq!(told(&room.take_events(), EventKind::Drowned), 0, "no harm while it waits");
    assert_eq!(state(&room, seal).state, SealState::Waiting, "guarded, it waits");
    kill(&mut room, guard);
    put(&mut room, player, [x, y, 0.0]);
    room.tick();
    assert_eq!(state(&room, seal).state, SealState::Running, "its guard fallen, it runs");
    for _ in 0..DROWNED_EVERY {
        put(&mut room, player, [x, y, 0.0]);
        room.tick();
    }
    assert_eq!(told(&room.take_events(), EventKind::Drowned), 1, "running, it harms once a second");
}

#[test]
fn a_dead_player_alone_in_a_seals_room_leaves_it_waiting() {
    let mut room = elite_room("krakens-grotto");
    let player = hardy(&mut room);
    let seal = seal_of(&room, SealKind::Litany);
    let laid = plan(&room, seal);
    inside(&mut room, player, &laid);
    let found = room.players.get_mut(&player).expect("in");
    (found.fighter.health, found.fighter.action) = (0.0, combat::Action::Dead { elapsed: 0 });
    room.tick();
    assert_eq!(state(&room, seal).state, SealState::Waiting);
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
    let marks = room.encounter_seen().expect("seen").seals[seal].marks.clone();
    assert!(marks.iter().enumerate().all(|(rune, mark)| *mark == if rune == 2 { 3 } else { 0 }), "none shows yet");
    assert_eq!(room.foes.len(), foes + WRONG_FOES);
    assert!(room.foes.keys().all(|id| room.quests.spoilless.contains(id)), "its foes drop nothing");
    assert_eq!(room.players[&player].fighter.health, health, "a wrong rune never hurts by itself");
    // Until the show starts again, no step counts: neither a right one nor another wrong one.
    for rune in [0, 2] {
        inside(&mut room, player, &laid);
        room.tick();
        put(&mut room, player, laid.pieces[rune]);
        room.tick();
    }
    assert_eq!((told(&room.take_events(), EventKind::RuneWrong), room.foes.len()), (0, foes + WRONG_FOES));
    assert_eq!(state(&room, seal).held, 0);
    ticks(&mut room, LITANY_PAUSE_TICKS);
    assert_eq!(room.encounter_seen().expect("seen").seals[seal].marks[0], 1, "the show starts again");
}

#[test]
fn a_wrong_rune_shows_wrong_for_a_second() {
    let mut room = elite_room("krakens-grotto");
    let player = hardy(&mut room);
    let seal = seal_of(&room, SealKind::Litany);
    let laid = plan(&room, seal);
    inside(&mut room, player, &laid);
    room.tick();
    put(&mut room, player, laid.pieces[1]);
    room.tick();
    let marks = |room: &Room| room.encounter_seen().expect("seen").seals[seal].marks.clone();
    assert_eq!(marks(&room)[1], 3, "the wrong rune flashes");
    ticks(&mut room, WRONG_SHOWN_TICKS - 1);
    assert_eq!(marks(&room)[1], 3);
    room.tick();
    assert_eq!(marks(&room)[1], 0, "a second on, dark");
}

#[test]
fn a_litany_ignores_a_lit_rune_stepped_again() {
    let mut room = elite_room("krakens-grotto");
    let player = hardy(&mut room);
    let seal = seal_of(&room, SealKind::Litany);
    let laid = plan(&room, seal);
    inside(&mut room, player, &laid);
    room.tick();
    room.take_events();
    for rune in [0, 0, 1] {
        put(&mut room, player, laid.pieces[rune]);
        room.tick();
        inside(&mut room, player, &laid);
        room.tick();
    }
    assert_eq!(state(&room, seal).held, 2);
    assert_eq!(told(&room.take_events(), EventKind::RuneWrong), 0);
}

#[test]
fn a_litanys_show_loops_while_it_runs_and_a_step_too_slow_starts_it_over_with_no_foes() {
    let mut room = elite_room("krakens-grotto");
    let player = hardy(&mut room);
    ticks(&mut room, RUNE_SHOWN_TICKS);
    let seal = seal_of(&room, SealKind::Litany);
    let laid = plan(&room, seal);
    inside(&mut room, player, &laid);
    room.tick();
    put(&mut room, player, laid.pieces[0]);
    room.tick();
    inside(&mut room, player, &laid);
    let marks = |room: &Room| room.encounter_seen().expect("seen").seals[seal].marks.clone();
    // The show at the second rune's turn: it is shown, and the first shown stepped.
    let clock = room.clock;
    room.encounters.as_mut().expect("encounters").seals[seal].shown_from = clock + 1 - RUNE_SHOWN_TICKS;
    room.tick();
    assert_eq!(marks(&room)[..2], [2, 1], "the show goes on past the stepped rune");
    let (foes, events) = (room.foes.len(), room.take_events());
    assert_eq!(told(&events, EventKind::RuneWrong), 0);
    let stepped = state(&room, seal).last_step;
    while room.clock < stepped + RUNE_STEP_TICKS {
        room.tick();
    }
    assert_eq!(state(&room, seal).held, 1, "three seconds to step the next");
    room.tick();
    assert_eq!(state(&room, seal).held, 0, "out of time, it starts over");
    assert_eq!(room.foes.len(), foes, "with no foes");
    assert_eq!(state(&room, seal).state, SealState::Running);
}

#[test]
fn a_litany_counts_no_step_from_a_body_in_the_air() {
    let mut room = elite_room("krakens-grotto");
    let player = hardy(&mut room);
    let seal = seal_of(&room, SealKind::Litany);
    let laid = plan(&room, seal);
    inside(&mut room, player, &laid);
    room.tick();
    put(&mut room, player, laid.pieces[0]);
    room.players.get_mut(&player).expect("in").fighter.body.mode = movement::Mode::Air;
    room.encounters.as_mut().expect("encounters").seals[seal].on = vec![false; laid.pieces.len()];
    let mut encounters = room.encounters.take().expect("encounters");
    room.keep_seal(&mut encounters, seal);
    room.encounters = Some(encounters);
    assert_eq!(state(&room, seal).held, 0, "a jump across a rune is no step");
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
    assert_eq!(state(&room, seal).state, SealState::Broken, "held twenty seconds in all");
    let mut three = elite_room("pale-undercroft");
    let company = [hardy(&mut three), hardy(&mut three), hardy(&mut three)];
    put(&mut three, company[0], laid.pieces[0]);
    put(&mut three, company[1], laid.pieces[1]);
    inside(&mut three, company[2], &laid);
    ticks(&mut three, 120);
    assert_eq!(state(&three, seal).held, 0, "three players hold three plates");
    put(&mut three, company[2], laid.pieces[2]);
    ticks(&mut three, 10);
    assert_eq!(state(&three, seal).held, 10);
    assert_eq!(three.encounter_seen().expect("seen").seals[seal].marks, vec![1, 1, 1]);
}

#[test]
fn a_weighing_counts_only_the_living_players_in_its_room() {
    let mut room = elite_room("pale-undercroft");
    let company = [hardy(&mut room), hardy(&mut room), hardy(&mut room)];
    let seal = seal_of(&room, SealKind::Weighing);
    let laid = plan(&room, seal);
    put(&mut room, company[0], laid.pieces[0]);
    put(&mut room, company[1], laid.pieces[1]);
    // The third away, at the way in: two plates for the two in the room.
    ticks(&mut room, 10);
    assert_eq!(room.encounter_seen().expect("seen").seals[seal].marks, vec![1, 1], "one away");
    assert_eq!(state(&room, seal).held, 10);
    // The third in the room but down: still two.
    inside(&mut room, company[2], &laid);
    let found = room.players.get_mut(&company[2]).expect("in");
    (found.fighter.health, found.fighter.action) = (0.0, combat::Action::Dead { elapsed: 0 });
    ticks(&mut room, 10);
    assert_eq!(room.encounter_seen().expect("seen").seals[seal].marks, vec![1, 1], "one down");
    assert_eq!(state(&room, seal).held, 20);
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
fn a_seals_wave_counts_the_living_players_in_its_room_not_the_run() {
    let mut room = elite_room("pale-undercroft");
    let company: Vec<PlayerId> = (0..4).map(|_| hardy(&mut room)).collect();
    let seal = seal_of(&room, SealKind::Weighing);
    let laid = plan(&room, seal);
    let ([x, y], others) = (middle_of(&room, laid.cells[0]), &company[1..]);
    for (nth, player) in others.iter().enumerate() {
        put(&mut room, *player, [x + nth as f64 * 0.5, y, 0.0]);
    }
    ticks(&mut room, WEIGHING_FIRST_WAVE_TICKS + 2);
    assert_eq!(room.foes.len(), 3, "one for each of the three in its room, the fourth away");
}

#[test]
fn a_weighings_first_wave_comes_three_seconds_in_and_the_next_every_twelve_from_its_doorways() {
    let mut room = elite_room("pale-undercroft");
    let player = hardy(&mut room);
    let seal = seal_of(&room, SealKind::Weighing);
    let laid = plan(&room, seal);
    inside(&mut room, player, &laid);
    room.tick();
    ticks(&mut room, WEIGHING_FIRST_WAVE_TICKS - 1);
    assert!(room.foes.is_empty(), "none before three seconds");
    room.tick();
    assert_eq!(room.foes.len(), crate::encounters::WAVE_FOES.0, "two for one player");
    assert!(room.foes.values().all(|foe| foe.brain.rank < ::foes::Rank::Miniboss));
    assert!(room.foes.keys().all(|id| room.quests.spoilless.contains(id)), "a wave drops nothing");
    ticks(&mut room, WEIGHING_WAVE_TICKS - 1);
    assert_eq!(room.foes.len(), crate::encounters::WAVE_FOES.0);
    room.tick();
    assert_eq!(room.foes.len(), 2 * crate::encounters::WAVE_FOES.0, "the next twelve seconds on");
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
    room.tick();
    let two = crate::encounters::WAVE_FOES.0;
    let mut counts = Vec::new();
    for at in
        [HOLDFAST_FIRST_WAVE_TICKS - 1, HOLDFAST_FIRST_WAVE_TICKS, HOLDFAST_FIRST_WAVE_TICKS + HOLDFAST_WAVE_TICKS]
    {
        while room.clock() < at + state(&room, seal).shown_from {
            put(&mut room, player, laid.pieces[0]);
            room.tick();
        }
        counts.push(room.foes.len());
    }
    assert_eq!(counts, vec![0, two, 2 * two], "two seconds in, then every twelve");
    assert!(state(&room, seal).held >= HOLDFAST_WAVE_TICKS, "held in its ring");
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
fn a_holdfasts_relic_regains_a_fortieth_a_second_while_no_foe_stands_in_its_ring() {
    let mut room = elite_room("krakens-grotto");
    let player = hardy(&mut room);
    let seal = seal_of(&room, SealKind::Holdfast);
    let laid = plan(&room, seal);
    put(&mut room, player, laid.pieces[0]);
    room.tick();
    room.encounters.as_mut().expect("encounters").seals[seal].relic = 0.5;
    ticks(&mut room, 60);
    assert!((state(&room, seal).relic - (0.5 + 60.0 * RELIC_REGAIN)).abs() < 1e-9, "a second's regaining");
    room.encounters.as_mut().expect("encounters").seals[seal].relic = 1.0;
    room.tick();
    assert_eq!(state(&room, seal).relic, 1.0, "never past whole");
}

#[test]
fn an_ascents_stone_holds_only_while_every_living_player_in_its_room_stands_on_it() {
    let mut room = elite_room("pale-undercroft");
    let players = [hardy(&mut room), hardy(&mut room)];
    let seal = seal_of(&room, SealKind::Ascent);
    let laid = plan(&room, seal);
    let stone = laid.pieces[0];
    for _ in 0..STONE_TICKS {
        put(&mut room, players[0], stone);
        inside(&mut room, players[1], &laid);
        room.tick();
    }
    assert_eq!((state(&room, seal).held, state(&room, seal).state), (0, SealState::Running), "one of two on it");
    assert_eq!(room.encounter_seen().expect("seen").seals[seal].marks, vec![1, 2], "one of two");
    let away = [stone[0] + 0.3, stone[1], stone[2]];
    for _ in 0..STONE_TICKS {
        put(&mut room, players[0], stone);
        put(&mut room, players[1], away);
        room.tick();
    }
    assert_eq!(state(&room, seal).state, SealState::Broken, "both on it two seconds");
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

#[test]
fn a_seals_wave_stands_one_foe_for_each_living_player_two_to_four_each_hunting_the_nearest() {
    let mut room = elite_room("krakens-grotto");
    let players: Vec<PlayerId> = (0..5).map(|_| hardy(&mut room)).collect();
    let seal = seal_of(&room, SealKind::Holdfast);
    let laid = plan(&room, seal);
    let doors = Room::doorways_of(&laid);
    let mut encounters = room.encounters.take().expect("encounters");
    assert_eq!(room.stand_seal_wave(&mut encounters, Some(seal), &doors, 5), 4, "four at the most");
    assert_eq!(room.stand_seal_wave(&mut encounters, Some(seal), &doors, 1), 2, "two at the fewest");
    assert_eq!(room.stand_seal_wave(&mut encounters, Some(seal), &doors, 3), 0, "none past eight alive");
    room.encounters = Some(encounters);
    // Each hunts the living player nearest it.
    for (at, player) in players.iter().enumerate() {
        put(&mut room, *player, [laid.pieces[0][0] + at as f64 * 40.0, laid.pieces[0][1], 0.0]);
    }
    let mut encounters = room.encounters.take().expect("encounters");
    room.send_foes_away();
    let near = players[0];
    room.stand_foes(&mut encounters, None, &[[laid.pieces[0][0] + 1.0, laid.pieces[0][1]]], 2);
    room.encounters = Some(encounters);
    assert!(room.foes.values().all(|foe| foe.brain.target() == Some(near)), "hunting the nearest");
}

#[test]
fn a_waves_foe_standing_in_a_waiting_seals_room_does_not_hold_it() {
    let mut room = elite_room("krakens-grotto");
    let player = hardy(&mut room);
    let seal = seal_of(&room, SealKind::Litany);
    let laid = plan(&room, seal);
    let at = middle_of(&room, laid.cells[laid.cells.len() / 2]);
    stand_one(&mut room, at);
    inside(&mut room, player, &laid);
    room.tick();
    assert_eq!(state(&room, seal).state, SealState::Running, "a wave's foe is no garrison's: the seal runs");
}
