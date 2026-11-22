use super::*;
use sailing::TICK_SECONDS;

/// A boost after `seconds` of the fight's ticks.
fn after(mut boost: Boost, seconds: f64) -> Boost {
    for _ in 0..(seconds / TICK_SECONDS).round() as u32 {
        boost.step(TICK_SECONDS);
    }
    boost
}

#[test]
fn a_tap_bursts_for_four_seconds_then_it_recharges_for_twelve() {
    let mut boost = Boost::default();
    assert!(boost.ready() && boost.drive() == 1.0, "a ship that never tapped is ready and sails as it always has");
    assert!(boost.tap(), "a ready boost bursts");
    assert_eq!((boost.drive(), boost.shares()), (BURST_DRIVE, [1.0, 0.0]));
    let bursting = after(boost, 3.9);
    assert_eq!(bursting.drive(), BURST_DRIVE, "still bursting just short of four seconds");
    let spent = after(boost, 4.1);
    assert_eq!((spent.drive(), spent.ready()), (1.0, false), "the burst is over and it recharges");
    assert!(!after(boost, 15.9).ready(), "twelve seconds of recharge come after the burst");
    assert!(after(boost, 16.1).ready(), "ready again sixteen seconds after the tap");
}

#[test]
fn a_tap_while_it_bursts_or_recharges_does_nothing() {
    let mut boost = Boost::default();
    boost.tap();
    let mut again = after(boost, 2.0);
    let before = again;
    assert!(!again.tap(), "no second burst on top of the first");
    assert_eq!(again, before);
    let mut recharging = after(boost, 10.0);
    assert!(!recharging.tap() && recharging.drive() == 1.0, "none while it recharges");
}

#[test]
fn its_shares_show_the_burst_running_out_and_the_recharge_filling() {
    let mut boost = Boost::default();
    boost.tap();
    let [left, done] = after(boost, 1.0).shares();
    assert!((left - 0.75).abs() < 0.01 && done == 0.0, "a quarter of its burst run: {left}, {done}");
    let [left, done] = after(boost, 10.0).shares();
    assert!(left == 0.0 && (done - 0.5).abs() < 0.01, "half its recharge done six seconds after the burst: {done}");
    assert_eq!(Boost::default().shares(), [0.0, 1.0], "never tapped, it is wholly charged");
}

mod in_a_fight {
    use super::*;
    use crate::damage::State;
    use crate::fight::{Fight, Orders, PLAYER};
    use sailing::ship::{Helm, Ship};
    use sailing::waters::{Spot, Waters};

    /// Deep, still water everywhere.
    struct Open;

    impl Waters for Open {
        fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
            Spot { bed: -50.0, surface: Some(0.0) }
        }
    }

    const ROWING: Orders =
        Orders { helm: Helm { steer: 0.0, climb: 0 }, aim: None, fire: false, brace: false, load: None, boost: false };
    const TAP: Orders = Orders { boost: true, ..ROWING };

    /// A fight of the player's Sloop alone, rowing ahead at its whole way.
    fn rowing() -> Fight {
        let ship = Ship { x: 0.0, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 1 };
        let mut fight = Fight::new(1);
        fight.put_to_sea(PLAYER, ship, &Open, 0.0);
        row(&mut fight, ROWING, 600);
        fight
    }

    fn row(fight: &mut Fight, orders: Orders, ticks: u32) {
        for tick in 0..ticks {
            let now = if tick == 0 { orders } else { ROWING };
            fight.step(&[(PLAYER, now)], &Open, &|_| [1.5, 0.0], 0.0);
        }
    }

    fn way(fight: &Fight) -> f64 {
        fight.vessel(PLAYER).map_or(0.0, |vessel| vessel.ship.ahead)
    }

    #[test]
    fn a_tap_drives_its_ship_half_again_for_the_burst_then_it_falls_back() {
        let mut fight = rowing();
        let whole = way(&fight);
        row(&mut fight, TAP, 235);
        assert!((way(&fight) / whole - BURST_DRIVE).abs() < 0.01, "near the burst's end: {} of {whole}", way(&fight));
        row(&mut fight, ROWING, 300);
        assert!((way(&fight) - whole).abs() < 1e-9, "back to its whole way: {}", way(&fight));
        let spent = fight.vessel(PLAYER).map(|vessel| vessel.boost);
        row(&mut fight, TAP, 1);
        assert!((way(&fight) - whole).abs() < 1e-9, "a tap while it recharges does nothing");
        assert!(spent.is_some_and(|boost| !boost.ready()));
    }

    #[test]
    fn a_ship_going_down_cannot_burst_and_keeps_its_charge() {
        let mut fight = rowing();
        if let Some(vessel) = fight.ships.get_mut(&PLAYER) {
            vessel.damage.state = State::Sinking;
        }
        row(&mut fight, TAP, 1);
        let boost = fight.vessel(PLAYER).map(|vessel| vessel.boost);
        assert!(
            boost.is_some_and(|boost| boost.ready() && boost.drive() == 1.0),
            "its helm takes no orders, a tap too"
        );
    }
}
