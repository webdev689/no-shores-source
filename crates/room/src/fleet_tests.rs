use super::*;
use naval::fight::{Hurts, sail_hurt};
use sailing::waters::OpenSea;

const AT: [f64; 3] = [200_000.0, 300_000.0, 0.5];

fn orders(sequence: u32, helm: Helm) -> Input {
    Input { sequence, orders: Orders { helm, ..STANDING }, put_to_sea: None, call: Call::None }
}

fn put(sequence: u32, at: [f64; 3]) -> Input {
    Input { put_to_sea: Some(at), ..orders(sequence, STANDING.helm) }
}

const ROWING: Helm = Helm { steer: 0.3, crab: false, climb: 0 };
const CLIMB: Helm = Helm { steer: 0.0, crab: false, climb: 1 };

fn ship_of(fleet: &Fleet, player: PlayerId) -> Option<Ship> {
    fleet.fight().vessel(player).map(|vessel| vessel.ship)
}

/// A room with one player put to sea at `AT`, rowing ahead: her orders sent up to `sequence`, the room ticked as many.
fn rowing(ticks: u32) -> (Fleet, PlayerId) {
    let mut fleet = Fleet::new();
    let player = fleet.join().unwrap_or_default();
    assert_eq!(fleet.input(player, put(1, AT)), Ok(()));
    fleet.tick();
    assert_eq!(fleet.input(player, orders(2, CLIMB)), Ok(()));
    fleet.tick();
    for sequence in 3..ticks + 3 {
        assert_eq!(fleet.input(player, orders(sequence, ROWING)), Ok(()));
        fleet.tick();
    }
    (fleet, player)
}

#[test]
fn a_ship_puts_to_sea_where_her_player_asks_and_only_once() {
    let mut fleet = Fleet::new();
    let player = fleet.join().unwrap_or_default();
    fleet.tick();
    assert_eq!(ship_of(&fleet, player), None, "not at sea until her orders put her there");
    assert_eq!(fleet.input(player, put(1, AT)), Ok(()));
    fleet.tick();
    let at_sea = ship_of(&fleet, player).map(|ship| (ship.x, ship.y, ship.heading));
    assert_eq!(at_sea, Some((AT[0], AT[1], AT[2])));
    assert_eq!(fleet.input(player, put(2, [AT[0] + 5000.0, AT[1], 0.0])), Ok(()));
    fleet.tick();
    assert_eq!(ship_of(&fleet, player).map(|ship| ship.x), Some(AT[0]), "at sea, only her helm moves her");
}

#[test]
fn orders_out_of_turn_or_past_what_a_helm_can_ask_are_refused() {
    let mut fleet = Fleet::new();
    let player = fleet.join().unwrap_or_default();
    assert_eq!(fleet.input(player, orders(2, ROWING)), Err(Refused::OutOfOrder { expected: 1, got: 2 }));
    assert_eq!(fleet.input(player, orders(1, Helm { steer: 2.0, ..ROWING })), Err(Refused::BadLook));
    assert_eq!(fleet.input(player, orders(1, Helm { climb: 2, ..ROWING })), Err(Refused::BadLook));
    let far = Aim { bearing_deg: 90.0, range_m: 2.0e5, ray: None };
    let looked = Input { orders: Orders { aim: Some(far), ..STANDING }, ..orders(1, ROWING) };
    assert_eq!(fleet.input(player, looked), Err(Refused::BadLook));
    assert_eq!(fleet.input(player, put(1, [-5.0, AT[1], 0.0])), Err(Refused::BadLook), "outside the world");
    assert_eq!(fleet.input(player, put(1, [AT[0], f64::NAN, 0.0])), Err(Refused::BadLook));
    assert_eq!(fleet.input(99, put(1, AT)), Err(Refused::NoSuchPlayer));
    assert_eq!(fleet.input(player, put(1, AT)), Ok(()));
}

#[test]
fn a_flood_of_orders_steps_her_no_faster_than_the_rooms_clock() {
    let mut fleet = Fleet::new();
    let player = fleet.join().unwrap_or_default();
    assert_eq!(fleet.input(player, put(1, AT)), Ok(()));
    for sequence in 2..=30 {
        assert_eq!(fleet.input(player, orders(sequence, CLIMB)), Ok(()));
    }
    for _ in 0..4 {
        fleet.tick();
    }
    assert_eq!(
        fleet.acknowledged(player),
        Some(10),
        "the clock's four ticks and its six of slack, three a tick at most"
    );
    for _ in 0..20 {
        fleet.tick();
    }
    assert_eq!(fleet.acknowledged(player), Some(30), "the rest in time");
}

#[test]
fn a_player_whose_orders_stop_lies_still_a_views_lag_then_her_helm_stands() {
    let (mut fleet, player) = rowing(60);
    let before = ship_of(&fleet, player);
    for _ in 0..VIEW_LAG {
        fleet.tick();
    }
    assert_eq!(ship_of(&fleet, player), before, "her orders may yet come");
    fleet.tick();
    let after = ship_of(&fleet, player);
    assert_ne!(after, before, "with her helm standing she rows on");
    assert_eq!(after.map(|ship| ship.rung), Some(1));
}

#[test]
fn her_ship_is_her_orders_stepped_by_the_rules_to_the_bit() {
    let (fleet, player) = rowing(120);
    let swell = Swell::default();
    let waters = OpenSea { swell: &swell };
    let wind = steady_wind(&swell);
    let sail = naval::arms::LARGE_BOAT.sail;
    let whole = naval::fight::Hurts::from_numbers(false, sail, sail);
    let mut ship =
        Ship { x: AT[0], y: AT[1], heading: AT[2], ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
    for helm in std::iter::once(STANDING.helm).chain(std::iter::once(CLIMB)).chain(std::iter::repeat_n(ROWING, 120)) {
        ship = sail_hurt(&ship, helm, whole, &waters, wind, 0.0).0;
    }
    let room = ship_of(&fleet, player).map(|ship| ship.to_floats().map(f64::to_bits));
    assert_eq!(room, Some(ship.to_floats().map(f64::to_bits)), "a browser predicting her agrees with the room");
    let hurts = fleet.fight().vessel(player).map(|vessel| Hurts::of(&vessel.damage));
    assert_eq!(hurts, Some(whole), "her hurts as a snapshot's numbers give them");
}

#[test]
fn a_captain_is_called_round_her_ship_four_at_most_and_all_sent_off_at_once() {
    let (mut fleet, player) = rowing(1);
    let mut sequence = 4;
    let mut call = |fleet: &mut Fleet, call: Call| {
        let input = Input { call, ..orders(sequence, ROWING) };
        sequence += 1;
        assert_eq!(fleet.input(player, input), Ok(()));
        fleet.tick();
    };
    for _ in 0..6 {
        call(&mut fleet, Call::Captain);
    }
    let captains = |fleet: &Fleet| fleet.fight().ships.values().filter(|vessel| vessel.command().is_some()).count();
    assert_eq!(captains(&fleet), CAPTAINS_MOST);
    let Some(own) = ship_of(&fleet, player) else { panic!("her ship is at sea") };
    for vessel in fleet.fight().ships.values().filter(|vessel| vessel.command().is_some()) {
        let (east, south) = (vessel.ship.x - own.x, vessel.ship.y - own.y);
        let apart = (east * east + south * south).sqrt();
        assert!((600.0..=1050.0).contains(&apart), "{apart}");
    }
    fleet.take_events();
    call(&mut fleet, Call::SendOff);
    assert_eq!(captains(&fleet), 0);
    let gone = fleet.take_events().iter().filter(|(_, event)| matches!(event, Event::Gone { .. })).count();
    assert_eq!(gone, CAPTAINS_MOST, "each one sent off is gone");
}

#[test]
fn two_players_sail_in_one_fight_and_one_who_leaves_takes_her_ship() {
    let mut fleet = Fleet::new();
    let (first, second) = (fleet.join().unwrap_or_default(), fleet.join().unwrap_or_default());
    assert_ne!(first, second);
    assert_eq!(fleet.input(first, put(1, AT)), Ok(()));
    assert_eq!(fleet.input(second, put(1, [AT[0] + 60.0, AT[1], 0.0])), Ok(()));
    fleet.tick();
    assert_eq!(fleet.fight().ships.len(), 2);
    fleet.leave(first);
    assert_eq!(ship_of(&fleet, first), None);
    assert!(ship_of(&fleet, second).is_some());
}

#[test]
fn a_room_holds_sixteen_players() {
    let mut fleet = Fleet::new();
    let joined = (0..20).filter_map(|_| fleet.join()).count();
    assert_eq!(joined, PLAYERS_MOST);
}

#[test]
fn one_room_fights_the_same_fight_for_the_same_orders() {
    let fought = || {
        let (mut fleet, player) = rowing(30);
        let call = Input { call: Call::Captain, ..orders(33, ROWING) };
        assert_eq!(fleet.input(player, call), Ok(()));
        for sequence in 34..600 {
            let fire = sequence % 97 == 0;
            let aim = Some(Aim { bearing_deg: 90.0, range_m: 80.0, ray: None });
            let input = Input { orders: Orders { helm: ROWING, aim, fire, ..STANDING }, ..orders(sequence, ROWING) };
            assert_eq!(fleet.input(player, input), Ok(()));
            fleet.tick();
        }
        fleet.fight().numbers().iter().map(|number| number.to_bits()).collect::<Vec<_>>()
    };
    assert_eq!(fought(), fought());
}
