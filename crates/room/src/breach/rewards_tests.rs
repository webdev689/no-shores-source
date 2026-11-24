//! What a Breach's run pays and weighs, and its rules kept for Hard: an encounter's first win in a week pays each kept
//! player a Vestige of its tier, the Steward two and the banner; a hidden chest pays once; the Lodestone's Strike,
//! Hold True and the Steward laid bare weigh their blows; the Two Shores are won with both Keepers fallen and no one
//! away; the Scrivener's writing unwrites the Rewritten; and Hard's fusions, ebb and Bulwarks.

use super::breach_tests::{at, breach, run, stand_at, told};
use super::fights_tests::{begin_at, put_at, won_to};
use super::gate::{MOORINGS, SPIRE_TICKS};
use super::gate_tests::gate_room;
use super::*;
use crate::EventKind;
use crate::encounters::encounters_tests::ticks;
use combat::{Blow, BlowKind, Stroke};

/// An encounter won where the company stands.
fn won(room: &mut Room, encounter: usize) {
    let mut breach_box = room.breach.take().expect("run");
    room.win_encounter(&mut breach_box, encounter);
    room.breach = Some(breach_box);
}

/// A swing from `striker`, as it lands before power.
fn swing(striker: FighterId) -> Blow {
    Blow {
        striker,
        kind: BlowKind::Swing(Stroke::Down),
        from: [0.0, 0.0],
        damage: 10.0,
        poise: 10.0,
        guard: 0.0,
        parryable: true,
        blockable: true,
        knocks_down: false,
        through: 1.0,
        stagger: 1.0,
        element: 0,
        crit: false,
    }
}

#[test]
fn an_encounters_first_win_in_a_week_pays_a_vestige_of_its_tier_and_the_steward_two_and_its_banner() {
    let (mut room, players) = run(Tier::Hard, 2);
    assert!(room.own(players[0], "ada"));
    let vestiges = |room: &Room| {
        room.players[&players[0]].character.vestiges.values().map(|(vestige, _)| vestige.clone()).collect::<Vec<_>>()
    };
    won(&mut room, MENDING);
    let paid = vestiges(&room);
    assert_eq!(paid.len(), 1, "one Vestige");
    assert!(paid[0].hard && paid[0].source == gear::Source::Breach, "of the Breach, at Hard");
    won(&mut room, MENDING);
    assert_eq!(vestiges(&room).len(), 1, "once a week");
    assert!(room.players[&players[1]].character.vestiges.is_empty(), "nothing for one the room does not keep");
    won(&mut room, STEWARD);
    assert_eq!(vestiges(&room).len(), 3, "the Steward pays two");
    let banner = gear::breach::DROWNED_VALE.banner;
    assert!(room.players[&players[0]].character.emblems.iter().any(|kept| kept == banner), "and the banner");
}

#[test]
fn a_hidden_chest_opens_once_to_a_kept_player_standing_at_it() {
    let (mut room, players) = run(Tier::Normal, 1);
    assert!(room.own(players[0], "ada"));
    let chest = at(&room, "descent", "chest-descent");
    stand_at(&mut room, players[0], chest);
    room.take_events();
    room.tick();
    assert_eq!(told(&mut room, EventKind::ChestOpened), 1, "opened");
    room.tick();
    assert_eq!(told(&mut room, EventKind::ChestOpened), 0, "and only once");
}

#[test]
fn the_lodestones_strike_weighs_three_hold_true_halves_a_foes_blow_and_the_bare_steward_takes_five() {
    let (mut room, players) = won_to(Tier::Normal, 2, STEWARD);
    begin_at(&mut room, &players, "court", "chest");
    let boss = breach(&room).fights.steward.boss.expect("the Steward stands");
    room.breach.as_mut().expect("run").lodestone.stone = lodestone::Stone::Borne(players[0]);
    assert_eq!(room.modded_blow(&swing(players[0]), boss), lodestone::STRIKE_TIMES, "the bearer's Strike");
    assert_eq!(room.modded_blow(&swing(players[1]), boss), 1.0, "a plain swing");
    room.breach.as_mut().expect("run").lodestone.held_from = Some(room.clock);
    assert_eq!(room.modded_blow(&swing(boss), players[1]), lodestone::HELD_TIMES, "held true beside its bearer");
    room.breach.as_mut().expect("run").fights.steward.bare_until = room.clock + 60;
    assert_eq!(room.modded_blow(&swing(players[1]), boss), steward::BARE_BLOW, "the Steward laid bare");
}

#[test]
fn the_two_shores_are_won_with_both_keepers_fallen_and_no_one_away() {
    let (mut room, players) = won_to(Tier::Normal, 2, SHORES);
    begin_at(&mut room, &players, "hall", "plinth");
    room.breach.as_mut().expect("run").fights.shores.kept = [true, false];
    room.tick();
    assert!(matches!(breach(&room).phases[SHORES], Phase::Running(_)), "one Keeper fallen");
    room.breach.as_mut().expect("run").fights.shores.kept = [true, true];
    put_at(&mut room, players[1], "hall-is", "arrival");
    room.tick();
    assert!(matches!(breach(&room).phases[SHORES], Phase::Running(_)), "one still away");
    put_at(&mut room, players[1], "hall", "plinth");
    room.tick();
    assert_eq!(breach(&room).phases[SHORES], Phase::Won);
}

#[test]
fn the_scriveners_writing_unwrites_the_rewritten() {
    let (mut room, players) = won_to(Tier::Normal, 2, CHOIR);
    begin_at(&mut room, &players, "choir", "lectern-2");
    let mut breach_box = room.breach.take().expect("run");
    let mut fight = std::mem::take(&mut breach_box.fights.choir);
    room.wake_scrivener(&mut breach_box, &mut fight);
    fight.next_write = room.clock + 1;
    breach_box.fights.choir = fight;
    room.rewrite(&mut breach_box, players[0]);
    room.breach = Some(breach_box);
    room.take_events();
    ticks(&mut room, 2);
    assert!(room.players[&players[0]].fighter.dead(), "the Rewritten unwritten");
    assert!(!room.players[&players[1]].fighter.dead(), "the rest stand");
    assert!(told(&mut room, EventKind::Unwritten) >= 1);
}

#[test]
fn at_hard_three_fusions_close_the_vale_where_normal_takes_four() {
    for tier in Tier::ALL {
        let (mut room, players) = run(tier, 2);
        begin_at(&mut room, &players, "mending", "mender");
        room.breach.as_mut().expect("run").fights.mending.fused = [2, 1, 0];
        room.tick();
        let closed = players.iter().all(|player| room.players[player].fighter.dead());
        assert_eq!(closed, tier == Tier::Hard, "{tier:?}");
    }
}

#[test]
fn at_hard_the_spire_ebbs_at_half_the_pace_and_two_bulwarks_come_where_normal_sends_one() {
    for (tier, every, bulwarks) in [(Tier::Normal, 4, 1), (Tier::Hard, 2, 2)] {
        let (mut room, players) = gate_room(3);
        for &player in &players {
            room.breach_company(player, "run-a", tier);
        }
        for (player, mooring) in players.iter().zip(MOORINGS) {
            let socket = room.breach_gate.as_ref().and_then(|gate| gate.socket(mooring)).expect("its mooring");
            stand_at(&mut room, *player, socket);
        }
        room.tick();
        assert_eq!(room.breach_gate.as_ref().expect("gate").claimers.len(), bulwarks, "{tier:?}'s Bulwarks");
        room.breach_gate.as_mut().expect("gate").fill = SPIRE_TICKS / 2;
        let arrival = room.breach_gate.as_ref().and_then(|gate| gate.socket("arrival")).expect("its arrival");
        stand_at(&mut room, players[0], arrival);
        ticks(&mut room, 400);
        let lost = SPIRE_TICKS / 2 - room.breach_gate.as_ref().expect("gate").fill;
        assert!(lost.abs_diff(400 / every) <= 1, "{tier:?} ebbs a tick every {every}: lost {lost}");
    }
}
