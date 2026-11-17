//! Telegraphed blows and shots: a brute winds up iron slams and never guards; the captain closes with charges and
//! leaps, feints and chains, and roars into its second phase once with an iron ring, striking harder after; an archer
//! kites a player who comes too close, draws and looses, and aims a shot now and then.

mod common;

use combat::Happening;
use combat::shapes::Shape;
use common::{Room, still, watching};
use core::f64::consts::PI;
use foes::Kind;

const PLAYER: u32 = 1;

#[test]
fn a_brute_winds_up_iron_slams_and_never_guards_or_dodges() {
    let mut room = Room::new(21).player(PLAYER, 0.0, 0.0, 0.0).foe(10, Kind::Brute, 0.0, -4.0, PI);
    room.run(3600, &mut still(0.0));
    let orders = room.orders(10);
    assert!(orders.iter().any(|(_, order)| order.shape == Shape::Slam && order.iron), "{orders:?}");
    assert!(orders.iter().all(|(_, order)| (order.shape == Shape::Slam) == order.iron), "only its slams are iron");
    assert!(orders.iter().all(|(_, order)| matches!(order.shape, Shape::Slam | Shape::Sweep)));
    assert!(room.foe_intents(10).iter().all(|(_, intent)| !intent.combat.guard && !intent.combat.dodge));
    let gaps: Vec<u64> = orders.windows(2).map(|pair| pair[1].0 - pair[0].0).collect();
    assert!(gaps.iter().all(|gap| *gap >= 8 * 60), "at least its cooldown apart: {gaps:?}");
}

#[test]
fn the_captain_throws_its_whole_set_closing_from_afar_feinting_and_chaining() {
    let (mut closers, mut feints, mut chains) = (0, 0, 0);
    for seed in 1..=6 {
        let mut room = Room::new(seed).player(PLAYER, 0.0, 0.0, 0.0).foe(10, Kind::Captain, 0.0, -9.0, PI);
        let mut script = |room: &Room, me: u32| {
            // A player who backs off for the first half draws the gap-closers, then stands to be fought up close.
            let mut intent = common::standing_still(room.toward(me, 10));
            let backing = room.tick < 1800 && room.distance(me, 10) < 6.0;
            intent.controls.forward = if backing { -1.0 } else { 0.0 };
            intent
        };
        room.run(3600, &mut script);
        let orders = room.orders(10);
        closers += orders.iter().filter(|(_, order)| matches!(order.shape, Shape::Charge | Shape::Leap)).count();
        feints += orders.iter().filter(|(_, order)| order.feint_at.is_some()).count();
        chains += orders.windows(2).filter(|pair| pair[1].0 - pair[0].0 < 90).count();
        for (_, order) in &orders {
            if order.shape == Shape::Leap {
                assert!((3.0..=9.0).contains(&order.ahead), "a leap lands at its target's feet: {}", order.ahead);
            }
            if let Some(cut) = order.feint_at {
                assert!(cut < order.windup, "a feint is cut before its blow would land");
            }
        }
    }
    assert!(closers > 0 && feints > 0 && chains > 0, "closers {closers}, feints {feints}, chains {chains}");
}

#[test]
fn the_captain_roars_into_its_second_phase_once_and_strikes_harder_after() {
    let mut room = Room::new(5).player(PLAYER, 0.0, 0.0, 0.0).foe(10, Kind::Captain, 0.0, -2.0, PI);
    room.run(30, &mut still(0.0));
    assert!((room.brain(10).might() - 1.2).abs() < 1e-12);
    room.set(10, |captain| captain.health = 0.36 * captain.health_max);
    room.run(30, &mut still(0.0));
    assert!(room.orders(10).iter().all(|(_, order)| order.shape != Shape::Ring), "not above its threshold");
    // Struck down to it while winding up or swinging, it roars as soon as it is free.
    room.set(10, |captain| captain.health = 0.34 * captain.health_max);
    let free = (room.tick..room.tick + 120).find(|_| {
        let idle = matches!(room.fighter(10).action, combat::fighter::Action::Idle);
        room.step(&mut still(0.0));
        idle
    });
    room.run(600, &mut still(0.0));
    let (tick, roar) = room.orders(10).into_iter().find(|(tick, _)| *tick >= 60).expect("it roars");
    assert_eq!(Some(tick), free, "at once");
    assert!(roar.shape == Shape::Ring && roar.iron, "an iron ring: {roar:?}");
    assert_eq!(roar.windup + combat::ticks(combat::shapes::IRON_EXTRA), 72, "a roar of 1.2 s");
    assert!((room.brain(10).might() - 1.2 * 1.25).abs() < 1e-12);
    assert!((room.fighter(10).might - 1.5).abs() < 1e-12, "its blows strike harder");
    let rings = room.orders(10).iter().filter(|(_, order)| order.shape == Shape::Ring).count();
    assert_eq!(rings, 1, "once");
}

#[test]
fn an_archer_kites_a_player_too_close_then_draws_and_looses_and_sometimes_aims() {
    let mut room = Room::new(9).player(PLAYER, 0.0, 0.0, 0.0).foe(10, Kind::Archer, 0.0, -4.0, PI);
    room.run(150, &mut watching(10));
    assert!(room.distance(PLAYER, 10) > 6.0, "it walked out of reach: {}", room.distance(PLAYER, 10));
    room.run(1800, &mut watching(10));
    let intents = room.foe_intents(10);
    let held = intents.windows(2).filter(|pair| pair[0].1.combat.aim && pair[1].1.combat.aim).count();
    let pulled = intents.windows(2).filter(|pair| !pair[0].1.combat.shoot && pair[1].1.combat.shoot).count();
    let loosed =
        room.happenings.iter().filter(|(_, by, happening)| *by == 10 && matches!(happening, Happening::Loosed(_)));
    assert!(held > 100 && pulled >= 5 && loosed.count() >= 5, "it aims its bow, holds it drawn and pulls");
    assert!(room.verdicts.iter().any(|(_, by, on, _)| *by == 10 && *on == PLAYER), "and its arrows find the player");
    let aimed = room.orders(10);
    assert!(!aimed.is_empty() && aimed.iter().all(|(_, order)| order.shape == Shape::Aimed), "{aimed:?}");
    assert!(aimed.iter().all(|(_, order)| (order.ahead - room.distance(PLAYER, 10)).abs() < 3.0));
}
