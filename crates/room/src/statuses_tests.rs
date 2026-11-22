//! Statuses in the room: given through one door, a Charge for its foe's rank's time and not again while immune; a
//! settled blow weighed by its striker's Crit, Linked and veil and its defender's Expose; Linked healing each second;
//! foes' statuses running down as they step; and the Test Ground's grants on the player or every foe.

use super::*;
use crate::asks::{Asked, Grant};
use crate::foes::Foe;
use crate::judging::How;
use ::foes::Rank;
use combat::fighter::{Action, Cause};
use combat::judge::Blow;
use combat::status::{CRIT_TIMES, EXPOSE_TIMES, LINKED_TIMES, charge_ticks};
use combat::{BlowKind, Status, Stroke, Verdict};
use std::collections::BTreeMap;

const SWORDSMAN: u8 = ::foes::roster::COLLECTOR;

/// A room with a player at the origin and a hostile swordsman of `rank` 1.5 m north of it, facing north, away.
fn room_with_foe(rank: Rank) -> (Room, PlayerId, FighterId) {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let id = room.next_id();
    let foe_type = ::foes::foe_type(SWORDSMAN).expect("the hostiles' swordsman");
    let (fighter, mut brain) = ::foes::spawn(foe_type, rank, 0.0, -1.5, 0.0);
    brain.rank = rank;
    let fighter = Fighter { health: 1000.0, health_max: 1000.0, ..fighter };
    room.foes.insert(id, Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
    (room, player, id)
}

/// The health `damage` of the player's swing from `from` takes off the foe, as the room settles it.
fn lost(room: &mut Room, player: PlayerId, foe: FighterId, from: [f64; 2]) -> f64 {
    let before = room.fighter(foe).expect("standing").health;
    let blow = Blow {
        striker: player,
        kind: BlowKind::Swing(Stroke::Down),
        from,
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
    room.settle(&blow, How::Swing, foe, Verdict::Hit { damage: 10.0, poise: 0.0 }, None);
    before - room.fighter(foe).expect("standing").health
}

#[test]
fn a_charge_on_a_foe_lasts_by_its_rank_on_a_player_as_a_minor_s_and_never_twice_while_immune() {
    for (rank, ticks) in [(Rank::Minor, 120), (Rank::Elite, 60), (Rank::Boss, 24)] {
        let (mut room, player, foe) = room_with_foe(rank);
        assert_eq!(room.lasts(foe, Status::Charge), ticks);
        assert!(room.give(foe, Status::Charge, None, Some(player)), "a Charge takes");
        let charged = room.fighter(foe).expect("standing");
        assert_eq!(charged.action, Action::Staggered { left: ticks, cause: Cause::Charged });
        assert_eq!(charged.statuses.giver(Status::Charge), Some(player));
        assert!(!room.give(foe, Status::Charge, None, Some(player)), "not again while it holds");
        assert_eq!(room.lasts(player, Status::Charge), charge_ticks(1));
    }
}

#[test]
fn a_settled_blow_is_weighed_by_crit_linked_and_the_veil_on_its_striker_and_expose_on_its_foe() {
    let (mut room, player, foe) = room_with_foe(Rank::Major);
    let ahead = [0.0, -3.0];
    assert!((lost(&mut room, player, foe, ahead) - 10.0).abs() < 1e-9, "nothing given, nothing weighed");
    room.give(foe, Status::Expose, None, None);
    assert!((lost(&mut room, player, foe, ahead) - 10.0 * EXPOSE_TIMES).abs() < 1e-9);
    room.give(player, Status::Crit, None, None);
    room.give(player, Status::Linked, None, None);
    let all = 10.0 * EXPOSE_TIMES * CRIT_TIMES * LINKED_TIMES;
    assert!((lost(&mut room, player, foe, ahead) - all).abs() < 1e-9);
    let (mut room, player, foe) = room_with_foe(Rank::Major);
    room.give(player, Status::Veiled, None, None);
    assert!((lost(&mut room, player, foe, ahead) - 10.0).abs() < 1e-9, "veiled, before it");
    let behind = [0.0, 0.0];
    assert!((lost(&mut room, player, foe, behind) - 10.0 * CRIT_TIMES).abs() < 1e-9, "veiled, in its back");
}

#[test]
fn a_settled_blow_tells_whether_it_was_a_crit_and_the_element_it_carried() {
    let (mut room, player, foe) = room_with_foe(Rank::Major);
    let told = |room: &mut Room, element: u8| {
        room.take_events();
        let blow = Blow {
            striker: player,
            kind: BlowKind::Swing(Stroke::Down),
            from: [0.0, -3.0],
            damage: 10.0,
            poise: 0.0,
            guard: 0.0,
            parryable: true,
            blockable: true,
            knocks_down: false,
            through: 1.0,
            stagger: 1.0,
            element,
            crit: false,
        };
        room.settle(&blow, How::Swing, foe, Verdict::Hit { damage: 10.0, poise: 0.0 }, None);
        room.take_events().iter().map(|event| (event.crit, event.element)).collect::<Vec<_>>()
    };
    assert_eq!(told(&mut room, 0), vec![(false, 0)], "a plain blow");
    room.give(player, Status::Crit, None, None);
    assert_eq!(told(&mut room, 2), vec![(true, 2)], "a crit in Volt");
    let fighter = room.fighter(foe).copied().expect("standing");
    room.set_fighter(foe, Fighter { health: 1.0, ..fighter });
    assert_eq!(told(&mut room, 1), vec![(true, 1), (true, 1)], "its kill carries the blow's crit and element too");
}

#[test]
fn linked_heals_each_second_and_foes_statuses_run_down_as_they_step() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let mut hurt = *room.fighter(player).expect("in");
    hurt.health = 50.0;
    room.set_fighter(player, hurt);
    room.give(player, Status::Linked, Some(600), None);
    for _ in 0..120 {
        room.tick();
    }
    assert_eq!(room.fighter(player).expect("in").health, 60.0, "two seconds, ten health");
    let (mut room, _, foe) = room_with_foe(Rank::Major);
    room.give(foe, Status::Expose, Some(100), None);
    for _ in 0..30 {
        room.tick();
    }
    assert_eq!(room.fighter(foe).expect("standing").statuses.left(Status::Expose), 70);
}

#[test]
fn the_test_ground_grants_a_status_on_the_player_or_on_every_foe_from_the_player() {
    let (mut room, player, foe) = room_with_foe(Rank::Major);
    let grant = |status, on_foes, ticks| Asked::Grant(Grant::Status { status, on_foes, ticks });
    room.answer(player, grant(Status::Expose, true, Some(90)));
    let foe_now = room.fighter(foe).expect("standing");
    assert_eq!((foe_now.statuses.left(Status::Expose), foe_now.statuses.giver(Status::Expose)), (90, Some(player)));
    room.answer(player, grant(Status::Haste, false, None));
    assert_eq!(room.fighter(player).expect("in").statuses.left(Status::Haste), Status::Haste.ticks());
    assert!(!room.fighter(foe).expect("standing").statuses.has(Status::Haste), "the player's alone");
}
