//! The Waking at a Breach's gate in its patrol zone: one company at a time holds it, never one it opened to; its three
//! moorings held by the company's living players fill the Spire, fewer let it ebb and a minute empty loses it; a
//! Bulwark claims a mooring left empty; its waves are sized to its holders; the gate opens to that company alone once
//! the Spire wakes, for a day or until it clears; a lost Waking stands the company again at the gate, and its fallen
//! stand again there, one who leaves down coming back down; the zone hears of the companies inside; the gate holds
//! eight it would let in and tells the rest why; the Waking's foes keep within the room's places; and only Normal seas
//! stand a gate.

use super::gate::{MOORINGS, SPIRE_TICKS};
use super::*;
use crate::encounters::encounters_tests::{hardy, ticks};
use crate::{EventKind, PlayerId};

/// A patrol's room on open ground standing the Sunken Gate at its middle, with `count` hardy players.
pub(super) fn gate_room(count: usize) -> (Room, Vec<PlayerId>) {
    let module = super::plan::module("breach-gate").expect("the gate's module");
    let blocks: Vec<Block> = module
        .parts
        .iter()
        .map(|&[x0, y0, z0, x1, y1, z1]| Block { min_x: x0, min_y: y0, max_x: x1, max_y: y1, bottom: z0, top: z1 })
        .collect();
    let ring = vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]];
    let section = Section { ring, spawns: vec![[0.0, 60.0]], falls_kill: false };
    let mut room = Room::node(Floor::Flat, blocks, section);
    room.open_breach_gate([0.0, 0.0, 0.0], 0);
    let players = (0..count).map(|_| hardy(&mut room)).collect();
    room.take_events();
    (room, players)
}

fn socket(room: &Room, name: &str) -> [f64; 3] {
    room.breach_gate.as_ref().expect("a gate").socket(name).expect("its socket")
}

fn stand(room: &mut Room, player: PlayerId, at: [f64; 3]) {
    let body = &mut room.players.get_mut(&player).expect("in").fighter.body;
    (body.x, body.y, body.z, body.vx, body.vy, body.vz) = (at[0], at[1], at[2], 0.0, 0.0, 0.0);
    body.mode = movement::Mode::Ground;
}

/// Each of the first three players on a mooring.
fn hold_moorings(room: &mut Room, players: &[PlayerId]) {
    for (player, mooring) in players.iter().zip(MOORINGS) {
        let at = socket(room, mooring);
        stand(room, *player, at);
    }
}

#[test]
fn a_company_launched_for_a_run_takes_the_gate_and_anyone_else_on_a_mooring_does_not() {
    let (mut room, players) = gate_room(4);
    assert!(room.breach_company(players[0], "run-a", Tier::Normal));
    let (body, arrival) = (room.players[&players[0]].fighter.body, socket(&room, "arrival"));
    assert!(combat::sight::apart([body.x, body.y], [arrival[0], arrival[1]]) < 1.0, "launched, they stand at the gate");
    let mooring = socket(&room, MOORINGS[0]);
    stand(&mut room, players[3], mooring);
    room.tick();
    assert!(room.breach_gate.as_ref().expect("gate").held_by.is_none(), "a player of no company holds nothing");
    stand(&mut room, players[0], mooring);
    room.tick();
    assert_eq!(room.breach_gate.as_ref().expect("gate").held_by.as_deref(), Some("run-a"));
    assert!(room.breach_company(players[1], "run-b", Tier::Hard));
    let other = socket(&room, MOORINGS[1]);
    stand(&mut room, players[1], other);
    room.tick();
    assert_eq!(room.breach_gate.as_ref().expect("gate").held_by.as_deref(), Some("run-a"), "one at a time");
}

#[test]
fn all_three_moorings_held_fill_the_spire_and_fewer_let_it_ebb_until_it_wakes_and_opens_the_gate_to_its_company() {
    let (mut room, players) = gate_room(4);
    for &player in &players[..3] {
        room.breach_company(player, "run-a", Tier::Normal);
    }
    room.breach_company(players[3], "run-b", Tier::Normal);
    hold_moorings(&mut room, &players[..3]);
    ticks(&mut room, 600);
    let filled = room.breach_gate.as_ref().expect("gate").fill;
    assert!(filled >= 590, "filling while all three are held: {filled}");
    let away = socket(&room, "arrival");
    stand(&mut room, players[2], away);
    ticks(&mut room, 400);
    assert!(room.breach_gate.as_ref().expect("gate").fill < filled, "ebbing while one is left");
    room.breach_gate.as_mut().expect("gate").fill = SPIRE_TICKS - 1;
    room.breach_gate.as_mut().expect("gate").claims = [None; 3];
    hold_moorings(&mut room, &players[..3]);
    room.tick();
    let gate = room.breach_gate.as_ref().expect("gate");
    assert!(gate.woken.is_some() && room.breach_opened("run-a") && !room.breach_opened("run-b"));
    let door = socket(&room, "gate");
    stand(&mut room, players[0], door);
    stand(&mut room, players[3], door);
    assert_eq!(room.ask_enter_breach(players[0]), crate::asks::INTO_BREACH, "open to the company that woke it");
    assert_eq!(room.ask_enter_breach(players[3]), gate::GATE_SHUT, "shut to any other");
    assert_eq!(room.take_events().iter().filter(|event| event.kind == EventKind::BreachWon).count(), players.len());
}

#[test]
fn a_bulwark_sent_out_claims_a_mooring_left_empty_and_while_it_stands_the_spire_does_not_fill() {
    let (mut room, players) = gate_room(3);
    for &player in &players {
        room.breach_company(player, "run-a", Tier::Normal);
    }
    hold_moorings(&mut room, &players);
    room.tick();
    let claimers = room.breach_gate.as_ref().expect("gate").claimers.clone();
    assert!(!claimers.is_empty(), "a Bulwark sent as the Waking begins");
    let (bulwark, mooring) = claimers[0];
    let elsewhere = socket(&room, "arrival");
    stand(&mut room, players[mooring], elsewhere);
    for _ in 0..90 * 60 {
        room.tick();
        if room.breach_gate.as_ref().expect("gate").claims[mooring].is_some() {
            break;
        }
    }
    assert_eq!(room.breach_gate.as_ref().expect("gate").claims[mooring], Some(bulwark), "it claimed the empty one");
    hold_moorings(&mut room, &players);
    let before = room.breach_gate.as_ref().expect("gate").fill;
    ticks(&mut room, 120);
    assert!(room.breach_gate.as_ref().expect("gate").fill <= before, "a claimed mooring holds nothing");
}

#[test]
fn a_hard_companys_fallen_do_not_stand_again_and_its_wipe_stands_it_whole_at_the_gate() {
    let (mut room, players) = gate_room(2);
    for &player in &players {
        room.breach_company(player, "run-a", Tier::Hard);
    }
    hold_moorings(&mut room, &players);
    room.tick();
    assert_eq!(room.breach_gate.as_ref().expect("gate").revives, Some(5));
    room.harm_share(players[0], 1.0e3, 0);
    ticks(&mut room, 20 * 60);
    assert!(room.players[&players[0]].fighter.dead(), "down for good while the Waking runs");
    room.harm_share(players[1], 1.0e3, 0);
    ticks(&mut room, WIPE_TICKS + 2);
    let gate = room.breach_gate.as_ref().expect("gate");
    assert!(gate.held_by.is_none() && gate.fill == 0, "the gate free again");
    let arrival = socket(&room, "arrival");
    for player in &players {
        let body = room.players[player].fighter.body;
        assert!(!room.players[player].fighter.dead());
        assert!(combat::sight::apart([body.x, body.y], [arrival[0], arrival[1]]) < 1.0);
    }
}

#[test]
fn the_zone_hears_of_the_companies_inside_until_they_are_done_or_silent() {
    let (mut room, _) = gate_room(1);
    opened(&mut room, &["run-a", "run-b"]);
    room.breach_inside("run-a", "Wenna", Tier::Hard, 2);
    room.breach_inside("run-a", "Wenna", Tier::Hard, 3);
    room.breach_inside("run-x", "Phantom", Tier::Hard, 2);
    let seen = room.breach_seen().expect("the gate's");
    assert_eq!(seen.inside, [("Wenna".to_owned(), Tier::Hard as u8, 3)], "one a company, none for a run never opened");
    assert_eq!((seen.marked_desk, seen.away_shore), (-1, -1), "no desk marked, no one away, as a run says it");
    room.breach_inside("run-a", "Wenna", Tier::Hard, 6);
    assert!(room.breach_seen().expect("the gate's").inside.is_empty(), "done");
    room.breach_inside("run-b", "Ossery", Tier::Normal, 1);
    room.clock += 61 * 60;
    room.tick();
    assert!(room.breach_seen().expect("the gate's").inside.is_empty(), "silent a minute, as its host forgets it");
}

#[test]
fn a_company_gone_from_the_hollow_lets_the_gate_go_and_a_member_it_would_shut_out_is_not_paid() {
    let (mut room, players) = gate_room(3);
    for &player in &players {
        room.breach_company(player, "run-a", Tier::Normal);
    }
    assert!(room.own(players[0], "ada"), "a kept character, level 1: the Breach shuts to it");
    hold_moorings(&mut room, &players);
    room.tick();
    assert_eq!(room.breach_gate.as_ref().expect("gate").held_by.as_deref(), Some("run-a"));
    room.breach_gate.as_mut().expect("gate").fill = SPIRE_TICKS - 1;
    room.breach_gate.as_mut().expect("gate").claims = [None; 3];
    hold_moorings(&mut room, &players);
    room.tick();
    assert!(room.breach_opened("run-a"));
    let week = gear::clock::week_of(room.minute);
    let character = &room.players[&players[0]].character;
    let paid = character.breach_paid(&gear::breach::DROWNED_VALE, Tier::Normal, week, 0);
    assert!(character.vestiges.is_empty() && !paid, "nothing paid to one shut out");
    let (mut room, players) = gate_room(2);
    for &player in &players {
        room.breach_company(player, "run-b", Tier::Normal);
    }
    hold_moorings(&mut room, &players);
    room.tick();
    for &player in &players {
        stand(&mut room, player, [0.0, gate::HOLLOW_M + 40.0, 0.0]);
    }
    ticks(&mut room, gate::LEFT_TICKS + 2);
    assert!(room.breach_gate.as_ref().expect("gate").held_by.is_none(), "let go to the next company");
}

#[test]
fn the_zone_is_told_once_that_a_company_cleared_the_breach() {
    let (mut room, _) = gate_room(1);
    opened(&mut room, &["run-a"]);
    room.breach_inside("run-a", "Wenna", Tier::Normal, 5);
    room.take_events();
    for _ in 0..3 {
        room.breach_inside("run-a", "Wenna", Tier::Normal, 6);
    }
    assert_eq!(room.take_events().iter().filter(|event| event.kind == EventKind::BreachCleared).count(), 1);
}

/// The company's Spire woken, its players stood off the moorings.
fn woken(room: &mut Room, players: &[PlayerId]) {
    room.breach_gate.as_mut().expect("gate").fill = SPIRE_TICKS - 1;
    room.breach_gate.as_mut().expect("gate").claims = [None; 3];
    hold_moorings(room, players);
    room.tick();
    assert!(room.breach_gate.as_ref().expect("gate").woken.is_some(), "woken");
    let arrival = socket(room, "arrival");
    for &player in players {
        stand(room, player, arrival);
    }
}

#[test]
fn the_gate_holds_no_ninth_of_a_company_nor_a_kept_character_the_breach_shuts_out() {
    let (mut room, players) = gate_room(10);
    for &player in &players[..gear::breach::COMPANY_MOST] {
        assert!(room.breach_company(player, "run-a", Tier::Normal));
    }
    assert!(!room.breach_company(players[8], "run-a", Tier::Normal), "a ninth is not held");
    assert!(room.own(players[9], "ada"), "a kept character, level 1: the Breach shuts to it");
    assert!(!room.breach_company(players[9], "run-b", Tier::Normal), "nor one it shuts out");
    let gate = room.breach_gate.as_ref().expect("gate");
    assert_eq!(gate.companies["run-a"].players.len(), gear::breach::COMPANY_MOST);
    assert!(!gate.companies.contains_key("run-b"));
}

#[test]
fn in_the_waking_its_company_alone_revives_its_fallen_and_at_hard_each_revive_spends_one_of_its_revives() {
    let (mut room, players) = gate_room(5);
    for &player in &players[..4] {
        room.breach_company(player, "run-a", Tier::Hard);
    }
    hold_moorings(&mut room, &players);
    let near = socket(&room, MOORINGS[0]);
    stand(&mut room, players[3], [near[0] + 2.0, near[1], near[2]]);
    room.tick();
    room.harm_share(players[3], 1.0e3, 0);
    let body = room.players[&players[3]].fighter.body;
    stand(&mut room, players[4], [body.x + 1.0, body.y, body.z]);
    super::breach_tests::hold_revive(&mut room, players[4], 1);
    assert!(room.players[&players[3]].fighter.dead(), "not by one outside the company");
    stand(&mut room, players[0], [body.x - 1.0, body.y, body.z]);
    super::breach_tests::hold_revive(&mut room, players[0], 1);
    assert!(!room.players[&players[3]].fighter.dead(), "by one of the company");
    assert_eq!(room.breach_gate.as_ref().expect("gate").revives, Some(4), "for one of its five");
}

#[test]
fn one_fallen_in_the_waking_stands_again_at_the_gate_while_their_company_holds_it() {
    let (mut room, players) = gate_room(3);
    for &player in &players {
        room.breach_company(player, "run-a", Tier::Normal);
    }
    hold_moorings(&mut room, &players);
    room.tick();
    room.harm_share(players[0], 1.0e3, 0);
    ticks(&mut room, u64::from(super::fallen::STANDS_INSIDE) + crate::VIEW_LAG + 2);
    let (body, arrival) = (room.players[&players[0]].fighter.body, socket(&room, "arrival"));
    assert!(!room.players[&players[0]].fighter.dead(), "stood again");
    assert!(combat::sight::apart([body.x, body.y], [arrival[0], arrival[1]]) < 1.0, "at the gate's arrival");
}

#[test]
fn the_waking_stands_its_foes_within_what_the_garrison_may_take_and_counts_a_bulwark_once_it_stands() {
    let (mut room, players) = gate_room(3);
    room.open_public("saltgrass-downs", crate::public::Grounds::default(), None);
    for &player in &players {
        room.breach_company(player, "run-a", Tier::Normal);
    }
    let husk = ::foes::foe_type(::foes::roster::HUSK).expect("a Husk");
    while room.living_foes() < room.others_most() {
        room.stand_foe(husk, ::foes::Rank::Minor, [150.0, 150.0, 0.0], 0.0, None);
    }
    hold_moorings(&mut room, &players);
    room.tick();
    let gate = room.breach_gate.as_ref().expect("gate");
    assert!(gate.held_by.is_some() && gate.claimers.is_empty(), "no Bulwark past the event's places");
    assert_eq!(gate.bulwarks, 0, "and none counted");
    let one = *room.foes.keys().next().expect("a foe");
    room.gone(one);
    room.tick();
    let gate = room.breach_gate.as_ref().expect("gate");
    assert_eq!((gate.claimers.len(), gate.bulwarks), (1, 1), "sent, and counted, once there is room");
}

#[test]
fn only_normal_seas_stand_a_breachs_gate() {
    let (mut room, _) = gate_room(0);
    room.set_difficulty(gear::world::Difficulty::Normal);
    assert!(room.breach_gate.is_some());
    room.set_difficulty(gear::world::Difficulty::Elite);
    assert!(room.breach_gate.is_none(), "none at Elite seas, where no run would hear it opened");
}

#[test]
fn the_gates_waves_are_sized_to_the_living_company_holding_it() {
    for (count, size) in [(2, 3), (8, 6)] {
        let (mut room, players) = gate_room(count);
        for &player in &players {
            room.breach_company(player, "run-a", Tier::Normal);
        }
        hold_moorings(&mut room, &players);
        room.tick();
        let before = room.breach_gate.as_ref().expect("gate").foes.clone();
        room.breach_gate.as_mut().expect("gate").next_wave = room.clock + 1;
        room.tick();
        let wave = room.breach_gate.as_ref().expect("gate").foes.iter().filter(|id| !before.contains(id)).count();
        assert_eq!(wave, size, "{count} holding, and no Ravager on the first wave");
    }
}

#[test]
fn a_waking_whose_spire_stands_empty_a_minute_is_lost_and_the_gate_freed() {
    let (mut room, players) = gate_room(1);
    room.breach_company(players[0], "run-a", Tier::Normal);
    hold_moorings(&mut room, &players);
    room.tick();
    assert!(room.breach_gate.as_ref().expect("gate").held_by.is_some(), "one holds it, and cannot fill it");
    room.take_events();
    room.clock += 60 * 60;
    room.tick();
    assert!(room.breach_gate.as_ref().expect("gate").held_by.is_none(), "lost after a minute empty");
    assert_eq!(room.take_events().iter().filter(|event| event.kind == EventKind::BreachWiped).count(), 1);
}

/// The gate opened to each of these runs now, as their Spires woke.
fn opened(room: &mut Room, runs: &[&str]) {
    let minute = room.minute;
    let gate = room.breach_gate.as_mut().expect("gate");
    gate.opened.extend(runs.iter().map(|run| ((*run).to_owned(), minute)));
}

#[test]
fn the_gate_stays_open_to_its_company_a_day_or_until_it_clears_and_one_too_far_from_it_is_out_of_reach() {
    let (mut room, players) = gate_room(3);
    for &player in &players {
        room.breach_company(player, "run-a", Tier::Normal);
    }
    hold_moorings(&mut room, &players);
    room.tick();
    woken(&mut room, &players);
    let door = socket(&room, "gate");
    stand(&mut room, players[0], [door[0], door[1] + 20.0, door[2]]);
    assert_eq!(room.ask_enter_breach(players[0]), crate::asks::OUT_OF_REACH, "too far to go in");
    stand(&mut room, players[0], door);
    // Hours of play on, the room's ticks and the world's clock going on together.
    let on = |room: &mut Room, hours: u64| {
        room.clock += hours * 60 * 60 * 60;
        room.set_minute(room.minute + hours * 60);
        room.tick();
    };
    on(&mut room, 23);
    assert_eq!(room.ask_enter_breach(players[0]), crate::asks::INTO_BREACH, "open hours on, its company silent");
    on(&mut room, 1);
    assert_eq!(room.ask_enter_breach(players[0]), gate::GATE_SHUT, "shut a day on");
    opened(&mut room, &["run-a"]);
    room.breach_inside("run-a", "Ada", Tier::Normal, 6);
    assert_eq!(room.ask_enter_breach(players[0]), gate::GATE_SHUT, "shut once its company cleared the Breach");
}

#[test]
fn a_company_whose_gate_opened_takes_it_no_more() {
    let (mut room, players) = gate_room(3);
    for &player in &players {
        room.breach_company(player, "run-a", Tier::Normal);
    }
    hold_moorings(&mut room, &players);
    room.tick();
    woken(&mut room, &players);
    room.clock += gate::OPEN_TICKS;
    room.tick();
    assert!(room.breach_gate.as_ref().expect("gate").held_by.is_none(), "let go once open its while");
    hold_moorings(&mut room, &players);
    room.tick();
    assert!(room.breach_gate.as_ref().expect("gate").held_by.is_none(), "not taken again by a member on a mooring");
}

#[test]
fn a_hard_companys_fallen_stand_again_at_the_gate_once_it_woke() {
    let (mut room, players) = gate_room(3);
    for &player in &players {
        room.breach_company(player, "run-a", Tier::Hard);
    }
    hold_moorings(&mut room, &players);
    room.tick();
    woken(&mut room, &players);
    room.harm_share(players[0], 1.0e3, 0);
    // Out of the Waking the zone's own rules stand them: once they have lain long enough, as they ask.
    for sequence in 1..=combat::tuning::RESPAWN + 2 {
        room.input(players[0], crate::Input { sequence, respawn: true, ..crate::Input::default() }).expect("taken");
        room.tick();
    }
    let (body, arrival) = (room.players[&players[0]].fighter.body, socket(&room, "arrival"));
    assert!(!room.players[&players[0]].fighter.dead(), "stood again");
    assert!(combat::sight::apart([body.x, body.y], [arrival[0], arrival[1]]) < 1.0, "at the gate's arrival");
}

/// A character the Breach lets in at either tier but for Hard's Normal win: level 30, by XP to 20 and four Hard
/// Breach pieces with every upgrade bought.
fn breach_ready() -> gear::Character {
    use gear::grid::Column;
    let mut character = gear::Character { xp: 1 << 40, ..gear::Character::starting() };
    character.story.prologue = true;
    let dice = gear::dice::Dice { seed: 1, tick: 0, player: 0 };
    for slot in [gear::Slot::Head, gear::Slot::Torso, gear::Slot::Arms, gear::Slot::Legs] {
        let made = gear::vestige::make(0, gear::Rarity::Legendary, slot, 20, gear::Source::Breach, &dice);
        let mut item = made.expect("a piece");
        item.hard = true;
        let columns = item.columns();
        for column in (0..columns.len()).filter(|at| columns[*at] == Column::Upgrade) {
            item.bought |= item.node_bit(column, 0).expect("an upgrade's node");
        }
        let id = character.take_id();
        character.items.insert(id, (gear::Item { id, ..item }, gear::At::Worn(slot)));
    }
    assert_eq!(character.level(), 30);
    character
}

/// What a player was told of being shut out of a company, by the amount told them.
fn shut_out(room: &mut Room, player: PlayerId) -> Vec<f64> {
    let told = room.take_events();
    assert!(
        told.iter().filter(|event| event.kind == EventKind::ShutOut).all(|event| event.defender == player),
        "them alone"
    );
    told.iter().filter(|event| event.kind == EventKind::ShutOut).map(|event| event.amount).collect()
}

#[test]
fn one_the_gates_company_refuses_is_told_why_once() {
    let (mut room, players) = gate_room(11);
    for &player in &players[..gear::breach::COMPANY_MOST] {
        assert!(room.breach_company(player, "run-a", Tier::Normal));
    }
    room.take_events();
    assert!(!room.breach_company(players[8], "run-a", Tier::Normal));
    assert_eq!(shut_out(&mut room, players[8]), [1.0], "the company full");
    assert!(room.own(players[9], "ada"));
    assert!(!room.breach_company(players[9], "run-b", Tier::Normal));
    assert_eq!(shut_out(&mut room, players[9]), [2.0], "under the tier's level");
    assert!(room.own(players[10], "ben"));
    room.players.get_mut(&players[10]).expect("in").character = breach_ready();
    assert!(!room.breach_company(players[10], "run-b", Tier::Hard));
    assert_eq!(shut_out(&mut room, players[10]), [3.0], "Hard without Normal won");
    assert!(room.breach_company(players[10], "run-b", Tier::Normal), "Normal lets them in");
}

#[test]
fn a_hard_holder_who_leaves_down_comes_back_down_with_no_revive_spent() {
    let (mut room, players) = gate_room(2);
    for (player, account) in players.iter().zip(["ada", "ben"]) {
        assert!(room.own(*player, account));
        room.players.get_mut(player).expect("in").character = breach_ready();
        room.players.get_mut(player).expect("in").character.story.breaches = breach_won();
        assert!(room.breach_company(*player, "run-a", Tier::Hard));
    }
    hold_moorings(&mut room, &players);
    room.tick();
    room.harm_share(players[1], 1.0e3, 0);
    room.tick();
    room.part(players[1]);
    let back = hardy(&mut room);
    assert!(room.own(back, "ben"));
    room.players.get_mut(&back).expect("in").character = breach_ready();
    room.players.get_mut(&back).expect("in").character.story.breaches = breach_won();
    assert!(room.breach_company(back, "run-a", Tier::Hard));
    assert!(room.players[&back].fighter.dead(), "down at the gate, as they left");
    assert_eq!(room.breach_gate.as_ref().expect("gate").revives, Some(5), "no revive spent");
}

/// The record of a character who has seen the Drowned Vale won at Normal.
fn breach_won() -> std::collections::BTreeSet<String> {
    let mut character = gear::Character::starting();
    let dice = gear::dice::Dice { seed: 1, tick: 0, player: 0 };
    let last = gear::breach::DROWNED_VALE.encounters.len() - 1;
    character.breach_cleared(&gear::breach::DROWNED_VALE, Tier::Normal, 0, last, &dice);
    character.story.breaches
}

#[test]
fn no_company_whose_gate_opened_takes_it_again_once_it_cleared_or_its_day_is_past() {
    for cleared in [true, false] {
        let (mut room, players) = gate_room(3);
        for &player in &players {
            room.breach_company(player, "run-a", Tier::Normal);
        }
        hold_moorings(&mut room, &players);
        room.tick();
        woken(&mut room, &players);
        room.clock += gate::OPEN_TICKS;
        room.tick();
        assert!(room.breach_opened("run-a"), "opened to its company");
        if cleared {
            room.breach_inside("run-a", "Wenna", Tier::Normal, 6);
        } else {
            // A day by the world's clock, though the zone stood empty and its room ticked none of it.
            room.set_minute(room.minute + gate::OPENED_MINUTES);
        }
        room.tick();
        assert!(!room.breach_opened("run-a"), "shut to it again");
        let mooring = socket(&room, MOORINGS[0]);
        stand(&mut room, players[0], mooring);
        room.tick();
        assert!(
            room.breach_gate.as_ref().expect("gate").held_by.is_none(),
            "cleared {cleared}: it takes the gate no more"
        );
    }
}

#[test]
fn a_gate_whose_day_is_past_answers_shut_before_its_room_ticks_again() {
    let (mut room, players) = gate_room(3);
    for &player in &players {
        room.breach_company(player, "run-a", Tier::Normal);
    }
    hold_moorings(&mut room, &players);
    room.tick();
    woken(&mut room, &players);
    room.set_minute(room.minute + gate::OPENED_MINUTES - 1);
    assert!(room.breach_opened("run-a"), "open to the last minute of its day");
    // An empty zone's room is asked without a tick, its host giving it the minute first.
    room.set_minute(room.minute + 1);
    assert!(!room.breach_opened("run-a"), "shut once its day is out");
}
