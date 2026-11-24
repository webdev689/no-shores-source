use super::*;
use crate::fight::{Hurts, sail_hurt};
use sailing::TICK_SECONDS;
use sailing::ship::{Helm, Ship};
use sailing::waters::{Spot, Waters};

struct Open;

impl Waters for Open {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: -50.0, surface: Some(0.0) }
    }
}

#[test]
fn the_sloop_is_the_plain_ship_every_other_class_is_against() {
    let sloop = class_of(HullKind::Sloop);
    assert_eq!(*sloop.build(), LARGE_BOAT);
    assert_eq!([sloop.lasts, sloop.rig_lasts, sloop.broadside, sloop.reload, sloop.way, sloop.turn], [1.0; 6]);
    assert_eq!(sloop.fire(), 1.0);
}

#[test]
fn every_hull_has_a_class_in_its_own_order() {
    let hulls: Vec<HullKind> = CLASSES.iter().map(|class| class.hull).collect();
    assert_eq!(hulls, HullKind::ALL);
    for hull in HullKind::ALL {
        assert_eq!(class_of(hull).hull, hull);
        assert_eq!(class_of(hull).build().name, class_name(hull));
    }
}

#[test]
fn a_bigger_hulls_points_are_the_sloops_times_how_often_it_is_struck_and_how_long_it_lasts() {
    for class in &CLASSES {
        let build = class.build();
        let lasts = build.hull / LARGE_BOAT.hull / hull_exposure(class.hull);
        let rig = build.sail / LARGE_BOAT.sail / exposure(class.hull);
        assert!((lasts - class.lasts).abs() < 0.01, "{:?}'s hull lasts {lasts}", class.hull);
        assert!((rig - class.rig_lasts).abs() < 0.01, "{:?}'s canvas lasts {rig}", class.hull);
        let men = build.crew / LARGE_BOAT.crew / exposure(class.hull);
        assert!((men - class.rig_lasts).abs() < 0.05, "{:?}'s hands last {men}", class.hull);
        assert_eq!(build.crew, build.crew.round(), "whole men");
    }
}

#[test]
fn the_schooner_is_the_fast_ship_the_brig_the_heavy_one_and_the_frigate_the_last() {
    let [sloop, schooner, brig, frigate] = HullKind::ALL.map(class_of);
    // The Schooner: the swiftest and handiest, quickest to reload, built lighter.
    assert!(CLASSES.iter().all(|class| class.way <= schooner.way && class.turn <= schooner.turn));
    assert!(CLASSES.iter().all(|class| class.reload >= schooner.reload));
    assert!(schooner.lasts < sloop.lasts);
    // The Brig and the Frigate: each tougher and heavier in its fire than the one before, slower and stiffer.
    for (lighter, heavier) in [(sloop, brig), (brig, frigate)] {
        assert!(heavier.lasts > lighter.lasts && heavier.rig_lasts > lighter.rig_lasts);
        assert!(heavier.fire() > lighter.fire() && heavier.broadside > lighter.broadside);
        assert!(heavier.way < lighter.way && heavier.turn < lighter.turn);
        assert!(heavier.boarders > lighter.boarders);
    }
    // Every hull past the Sloop throws more a minute than it.
    assert!([schooner, brig, frigate].iter().all(|class| class.fire() > 1.0));
}

/// Its way under sail on a beam reach, settled, and its swing hard over a second after the wheel is put over, in a
/// fight with nothing hurt.
fn settled(hull: HullKind) -> (f64, f64) {
    let sound = Hurts::of(&crate::damage::Damage::new(class_of(hull).build(), true));
    let wind = [1.5, 0.0];
    let mut ship = Ship { x: 0.0, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
    let mut way = 0.0;
    for tick in 0..1860u32 {
        let climb = if tick == 0 { 2 } else { 0 };
        let steer = if tick >= 1800 { 1.0 } else { 0.0 };
        // Held to the north while it gathers way, then put hard over.
        if tick < 1800 {
            ship.heading = 0.0;
            way = ship.ahead;
        }
        ship = sail_hurt(&ship, hull, Helm { steer, climb }, sound, &Open, wind, f64::from(tick) * TICK_SECONDS).0;
    }
    (way, ship.turn)
}

/// Its swing hard over, settled, its way held at `way` m/s: what its helm makes of that way.
fn swing_at(hull: HullKind, way: f64) -> f64 {
    let sound = Hurts::of(&crate::damage::Damage::new(class_of(hull).build(), true));
    let mut ship = Ship { x: 0.0, y: 0.0, heading: 0.0, ahead: way, abeam: 0.0, turn: 0.0, sail_way: way, rung: 2 };
    for tick in 0..600u32 {
        ship.ahead = way;
        let helm = Helm { steer: 1.0, climb: 0 };
        ship = sail_hurt(&ship, hull, helm, sound, &Open, [1.5, 0.0], f64::from(tick) * TICK_SECONDS).0;
    }
    ship.turn
}

#[test]
fn held_at_the_same_way_each_hull_swings_its_class_against_the_sloop_at_every_way() {
    for way in [1.0, 3.0, 4.5, 6.0, 8.0] {
        let sloop = swing_at(HullKind::Sloop, way);
        for class in &CLASSES[1..] {
            let turned = swing_at(class.hull, way) / sloop;
            assert!((turned - class.turn).abs() < 0.01, "{:?} at {way} m/s swings {turned} of the Sloop", class.hull);
        }
    }
}

#[test]
fn in_a_fight_its_class_sets_its_way_and_its_swing_against_the_sloops() {
    let (sloop_way, sloop_swing) = settled(HullKind::Sloop);
    for class in &CLASSES[1..] {
        let (way, swing) = settled(class.hull);
        assert!(
            ((way / sloop_way) - class.way).abs() < 0.01,
            "{:?} makes {way} m/s to the Sloop's {sloop_way}",
            class.hull
        );
        let turned = swing / sloop_swing;
        assert!((turned - class.turn).abs() < 0.01, "{:?} swings {swing}° a second to {sloop_swing}", class.hull);
    }
}
