use super::*;
use crate::ranks::Commission;
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
        aim: Some(Aim { bearing_deg: 85.0, range_m: 120.0, ray: Some([[4.0, 2.5, 6.0], [0.2, 1.0, -0.1]]) }),
        fire: true,
        brace: false,
        load: Some(Shot::Chain),
    };
    assert_eq!(orders_numbers(&orders).len(), ORDERS);
    assert_eq!(orders_from(&orders_numbers(&orders)), Ok(orders));
    let quiet =
        Orders { helm: Helm { steer: 0.0, crab: false, climb: 0 }, aim: None, fire: false, brace: true, load: None };
    assert_eq!(orders_from(&orders_numbers(&quiet)), Ok(quiet));
    let rayless = Orders { aim: Some(Aim { bearing_deg: -90.0, range_m: 60.0, ray: None }), ..quiet };
    assert_eq!(orders_from(&orders_numbers(&rayless)), Ok(rayless));
}

#[test]
fn numbers_that_are_not_orders_are_refused() {
    let good = [0.0, 0.0, 0.0, 1.0, 90.0, 100.0, 1.0, 4.0, 2.5, 6.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0];
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
    assert!(spoilt(6, 0.5).is_err(), "a ray that is neither");
    assert!(spoilt(9, f64::INFINITY).is_err(), "a ray's eye past the world");
    assert!(spoilt(13, 2.0).is_err(), "a fire that is neither");
    assert!(spoilt(15, 5.0).is_err(), "a fifth shot");
}

#[test]
fn a_fights_view_holds_its_clock_both_ships_her_captain_and_counts_for_the_rest() {
    let fight = Fight::meet(sloop_at(0.0, 0.0, 0.0), sloop_at(0.0, -700.0, 3.0), Commission::default(), 7, &Open, 0.0);
    let numbers = view_numbers(&fight, &[], None, &Open, 0.0);
    assert_eq!(numbers.len(), 2 + 2 * VESSEL_NUMBERS + 4 + 4, "no other captains, no balls, no lay, no events");
    assert_eq!(numbers[..2], [0.0, 0.0]);
    let ship_of = |id| fight.vessel(id).map(|vessel| vessel.ship.to_floats()).unwrap_or_default();
    assert_eq!(numbers[2..10], ship_of(PLAYER));
    assert_eq!(numbers[2 + VESSEL_NUMBERS..10 + VESSEL_NUMBERS], ship_of(CAPTAIN));
    let aim = Aim { bearing_deg: 90.0, range_m: 80.0, ray: None };
    let laid = view_numbers(&fight, &[Event::RunOut { ship: CAPTAIN, side: Side::Port }], Some(&aim), &Open, 0.0);
    let lay_at = 2 + 2 * VESSEL_NUMBERS + 4 + 2;
    assert_eq!(laid[lay_at..lay_at + 2], [1.0, 1.0], "a lay on her starboard side");
    assert_eq!(laid[lay_at + 6], 3.0, "three guns a side");
    assert_eq!(laid.len(), lay_at + 7 + 3 * (6 + STOP_NUMBERS) + 3);
    assert_eq!(laid[laid.len() - 3..], [1.0, 5.0, 0.0], "one event: her port guns run out");
}

#[test]
fn a_lay_crosses_as_the_fight_shows_it_each_gun_with_its_launch_and_its_stop() {
    // Her starboard guns laid on the captain close abeam: their balls strike her.
    let fight = Fight::meet(sloop_at(0.0, 0.0, 0.0), sloop_at(50.0, 0.0, 0.0), Commission::default(), 7, &Open, 0.0);
    let aim = Aim { bearing_deg: 90.0, range_m: 50.0, ray: None };
    let shown = fight.preview(PLAYER, &aim, &Open, 0.0).expect("a side bears");
    assert!(shown.on_target, "laid on her, close abeam");
    let numbers = view_numbers(&fight, &[], Some(&aim), &Open, 0.0);
    let lay_at = 2 + 2 * VESSEL_NUMBERS + 4 + 2;
    let head = [1.0, 1.0, shown.lay.elevation, shown.lay.reach, shown.radius, 1.0, 3.0];
    assert_eq!(numbers[lay_at..lay_at + 7], head);
    for (index, (launch, stop)) in shown.launches.iter().zip(&shown.ends).enumerate() {
        let at = lay_at + 7 + index * (6 + STOP_NUMBERS);
        assert_eq!(numbers[at..at + 6], *launch);
        let stop = stop.expect("each ball stops");
        let strike = stop.strike.map_or([0.0; 4], |[x, y, z]| [1.0, x, y, z]);
        let [x, y, z] = stop.point;
        let water = f64::from(u8::from(stop.water));
        assert_eq!(
            numbers[at + 6..at + 6 + STOP_NUMBERS],
            [[1.0, stop.time, x, y, z, water].as_slice(), &strike].concat()
        );
    }
}

#[test]
fn a_ram_crosses_as_its_own_kind_with_whom_it_struck_and_what_it_dealt() {
    let fight = Fight::meet(sloop_at(0.0, 0.0, 0.0), sloop_at(0.0, -700.0, 3.0), Commission::default(), 7, &Open, 0.0);
    let ram = Event::Ram { ship: CAPTAIN, by: PLAYER, point: [1.0, 2.0, 3.0], dealt: 4.0 };
    let numbers = view_numbers(&fight, &[ram], None, &Open, 0.0);
    assert_eq!(EVENT_NUMBERS[9], 6);
    assert_eq!(numbers[numbers.len() - 8..], [1.0, 10.0, 1.0, 0.0, 1.0, 2.0, 3.0, 4.0]);
}

#[test]
fn a_fight_with_more_captains_shows_each_other_one_with_her_number_faction_and_rank() {
    let tithe = Commission { faction: crate::ranks::GREY_TITHE, rank: crate::ranks::Rank::Elite };
    let captains = [(sloop_at(0.0, -700.0, 3.0), Commission::default(), 7), (sloop_at(400.0, -700.0, 0.0), tithe, 8)];
    let mut fight = Fight::among(&captains, &Open, 0.0);
    fight.put_to_sea(PLAYER, sloop_at(0.0, 0.0, 0.0), &Open, 0.0);
    let numbers = view_numbers(&fight, &[], None, &Open, 0.0);
    let others_at = 2 + 2 * VESSEL_NUMBERS + 4;
    assert_eq!(
        numbers[others_at..others_at + 4],
        [1.0, 2.0, 1.0, 3.0],
        "one other, ship 2: an Elite of the Grey Tithe"
    );
    let second = fight.vessel(CAPTAIN + 1).map(|vessel| vessel.ship.to_floats()).unwrap_or_default();
    assert_eq!(numbers[others_at + 4..others_at + 12], second);
    assert_eq!(numbers.len(), others_at + 4 + VESSEL_NUMBERS + 4 + 3);
    assert!(view_numbers(&Fight::among(&captains, &Open, 0.0), &[], None, &Open, 0.0).is_empty(), "no player");
}
