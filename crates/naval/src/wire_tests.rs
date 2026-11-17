use super::*;
use sailing::ship::Ship;
use sailing::waters::{Spot, Waters};

/// Deep, still water everywhere.
struct Open;

impl Waters for Open {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: -50.0, surface: Some(0.0) }
    }
}

fn sloop_at(x: f64, y: f64, heading: f64) -> Ship {
    Ship { x, y, heading, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 2 }
}

#[test]
fn orders_cross_as_their_numbers_and_back() {
    let orders = Orders {
        helm: Helm { steer: -0.5, crab: true, climb: 1 },
        aim: Some(Aim { bearing_deg: 85.0, range_m: 120.0 }),
        fire: true,
        brace: false,
        load: Some(Shot::Chain),
    };
    assert_eq!(orders_numbers(&orders).len(), ORDERS);
    assert_eq!(orders_from(&orders_numbers(&orders)), Ok(orders));
    let quiet =
        Orders { helm: Helm { steer: 0.0, crab: false, climb: 0 }, aim: None, fire: false, brace: true, load: None };
    assert_eq!(orders_from(&orders_numbers(&quiet)), Ok(quiet));
}

#[test]
fn numbers_that_are_not_orders_are_refused() {
    let good = [0.0, 0.0, 0.0, 1.0, 90.0, 100.0, 0.0, 0.0, 0.0];
    assert!(orders_from(&good).is_ok());
    let spoilt = |at: usize, value: f64| {
        let mut numbers = good;
        numbers[at] = value;
        orders_from(&numbers)
    };
    assert!(orders_from(&good[1..]).is_err(), "too few");
    assert!(spoilt(0, 2.0).is_err(), "a helm past hard over");
    assert!(spoilt(2, 0.5).is_err(), "half a climb");
    assert!(spoilt(4, 270.0).is_err(), "a bearing past her stern");
    assert!(spoilt(5, f64::NAN).is_err(), "not a number");
    assert!(spoilt(6, 2.0).is_err(), "a fire that is neither");
    assert!(spoilt(8, 5.0).is_err(), "a fifth shot");
}

#[test]
fn a_fights_view_holds_its_clock_both_ships_her_captain_and_counts_for_the_rest() {
    let fight = Fight::meet(sloop_at(0.0, 0.0, 0.0), sloop_at(0.0, -700.0, 3.0), 7, &Open, 0.0);
    let numbers = view_numbers(&fight, &[], None);
    assert_eq!(numbers.len(), 2 + 2 * VESSEL_NUMBERS + 4 + 3, "no balls, no lay, no events");
    assert_eq!(numbers[..2], [0.0, 0.0]);
    assert_eq!(numbers[2..10], fight.player.ship.to_floats());
    assert_eq!(numbers[2 + VESSEL_NUMBERS..10 + VESSEL_NUMBERS], fight.captain.ship.to_floats());
    let laid =
        view_numbers(&fight, &[Event::RunOut { side: Side::Port }], Some(&Aim { bearing_deg: 90.0, range_m: 80.0 }));
    let lay_at = 2 + 2 * VESSEL_NUMBERS + 4 + 1;
    assert_eq!(laid[lay_at..lay_at + 2], [1.0, 1.0], "a lay on her starboard side");
    assert_eq!(laid[lay_at + 5], 3.0, "three guns a side");
    assert_eq!(laid[laid.len() - 3..], [1.0, 5.0, 0.0], "one event: her port guns run out");
}
