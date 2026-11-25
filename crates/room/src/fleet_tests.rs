use super::*;
use naval::fight::{Hurts, sail_hurt};
use naval::ranks::{Commission, GREY_TITHE, Rank};
use naval::shots::ShotEvent;
use sailing::ship::Helm;
use sailing::waters::OpenSea;

const AT: [f64; 3] = [200_000.0, 300_000.0, 0.5];

fn orders(sequence: u32, helm: Helm) -> Input {
    Input { sequence, orders: Orders { helm, ..QUIET }, put_to_sea: None, call: Call::None }
}

fn put(sequence: u32, at: [f64; 3]) -> Input {
    Input { put_to_sea: Some(at), ..orders(sequence, QUIET.helm) }
}

const ROWING: Helm = Helm { steer: 0.3, climb: 0 };
const CLIMB: Helm = Helm { steer: 0.0, climb: 1 };

fn ship_of(fleet: &Fleet, player: PlayerId) -> Option<Ship> {
    fleet.fight().vessel(player).map(|vessel| vessel.ship)
}

/// A room with one player put to sea at `AT`, rowing ahead: their orders sent up to `sequence`, the room ticked as
/// many.
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
fn a_ship_puts_to_sea_where_its_player_asks_and_only_once() {
    let mut fleet = Fleet::new();
    let player = fleet.join().unwrap_or_default();
    fleet.tick();
    assert_eq!(ship_of(&fleet, player), None, "not at sea until their orders put it there");
    assert_eq!(fleet.input(player, put(1, AT)), Ok(()));
    fleet.tick();
    let at_sea = ship_of(&fleet, player).map(|ship| (ship.x, ship.y, ship.heading));
    assert_eq!(at_sea, Some((AT[0], AT[1], AT[2])));
    assert_eq!(fleet.input(player, put(2, [AT[0] + 5000.0, AT[1], 0.0])), Ok(()));
    fleet.tick();
    assert_eq!(ship_of(&fleet, player).map(|ship| ship.x), Some(AT[0]), "at sea, only its helm moves it");
}

#[test]
fn orders_out_of_turn_or_past_what_a_helm_can_ask_are_refused() {
    let mut fleet = Fleet::new();
    let player = fleet.join().unwrap_or_default();
    assert_eq!(fleet.input(player, orders(2, ROWING)), Err(Refused::OutOfOrder { expected: 1, got: 2 }));
    assert_eq!(fleet.input(player, orders(1, Helm { steer: 2.0, ..ROWING })), Err(Refused::BadLook));
    assert_eq!(fleet.input(player, orders(1, Helm { climb: 2, ..ROWING })), Err(Refused::BadLook));
    let far = Aim { bearing_deg: 90.0, range_m: 2.0e5, ray: None };
    let looked = Input { orders: Orders { aim: Some(far), ..QUIET }, ..orders(1, ROWING) };
    assert_eq!(fleet.input(player, looked), Err(Refused::BadLook));
    assert_eq!(fleet.input(player, put(1, [-5.0, AT[1], 0.0])), Err(Refused::BadLook), "outside the world");
    assert_eq!(fleet.input(player, put(1, [AT[0], f64::NAN, 0.0])), Err(Refused::BadLook));
    assert_eq!(fleet.input(99, put(1, AT)), Err(Refused::NoSuchPlayer));
    assert_eq!(fleet.input(player, put(1, AT)), Ok(()));
}

#[test]
fn a_flood_of_orders_steps_a_ship_no_faster_than_the_rooms_clock() {
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
fn time_in_harbour_is_not_banked_to_catch_up_on_at_sea() {
    // One player waits in harbour 600 ticks, then floods the room; another joins as they put to sea and sends one
    // order a tick. Each sets their sails, then holds their course.
    let mut fleet = Fleet::new();
    let waited = fleet.join().unwrap_or_default();
    for _ in 0..600 {
        fleet.tick();
    }
    let honest = fleet.join().unwrap_or_default();
    let (to_wait, to_honest) = (AT, [AT[0] + 5000.0, AT[1], AT[2]]);
    let helm = |sequence: u32| if sequence <= 3 { CLIMB } else { QUIET.helm };
    let order = |sequence: u32, at| {
        let given = orders(sequence, helm(sequence));
        if sequence == 1 { Input { put_to_sea: Some(at), ..given } } else { given }
    };
    let (mut waited_sent, mut honest_sent) = (0, 0);
    for _ in 0..600 {
        for _ in 0..CATCH_UP {
            waited_sent += 1;
            assert_eq!(fleet.input(waited, order(waited_sent, to_wait)), Ok(()));
        }
        honest_sent += 1;
        assert_eq!(fleet.input(honest, order(honest_sent, to_honest)), Ok(()));
        fleet.tick();
    }
    let run = |player, from: [f64; 3]| {
        let (east, south) = ship_of(&fleet, player).map_or((0.0, 0.0), |ship| (ship.x - from[0], ship.y - from[1]));
        (east * east + south * south).sqrt()
    };
    let (waited_run, honest_run) = (run(waited, to_wait), run(honest, to_honest));
    assert!(honest_run > 10.0, "under sail it runs: {honest_run} m");
    // A view's lag and the slack are 30 ticks to catch up on: half a second's run at most, at its way by then.
    let way = ship_of(&fleet, honest).map_or(0.0, |ship| ship.ahead);
    let banked = waited_run - honest_run;
    assert!(banked < 0.5 * way * 1.1, "it ran {waited_run} m to the honest {honest_run} m, making {way} m/s");
}

#[test]
fn a_release_in_a_late_tick_is_their_last_order_of_it_so_it_is_judged_by_its_own_brace() {
    let mut fleet = Fleet::new();
    let player = fleet.join().unwrap_or_default();
    assert_eq!(fleet.input(player, put(1, AT)), Ok(()));
    fleet.tick();
    fleet.take_events();
    let aim = Some(Aim { bearing_deg: 90.0, range_m: 80.0, ray: None });
    let fire = Input { orders: Orders { aim, fire: true, ..QUIET }, ..orders(2, QUIET.helm) };
    let brace = |sequence| Input { orders: Orders { brace: true, ..QUIET }, ..orders(sequence, QUIET.helm) };
    for input in [fire, brace(3), brace(4)] {
        assert_eq!(fleet.input(player, input), Ok(()));
    }
    fleet.tick();
    let events = fleet.take_events();
    let refused = events.iter().any(|(_, event)| matches!(event, Event::Refused { .. }));
    let fired = events.iter().any(|(_, event)| matches!(event, Event::Shot(ShotEvent::Muzzle { .. })));
    assert!(fired && !refused, "unbraced when they fired: {events:?}");
    assert_eq!(fleet.acknowledged(player), Some(2), "none after the release this tick");
    fleet.tick();
    assert_eq!(fleet.acknowledged(player), Some(4), "the braces the next tick");
    assert!(fleet.fight().vessel(player).is_some_and(|vessel| vessel.guns.braced));
}

#[test]
fn a_player_whose_orders_stop_lies_still_a_views_lag_then_their_helm_stands() {
    let (mut fleet, player) = rowing(60);
    let before = ship_of(&fleet, player);
    for _ in 0..VIEW_LAG {
        fleet.tick();
    }
    assert_eq!(ship_of(&fleet, player), before, "their orders may yet come");
    fleet.tick();
    let after = ship_of(&fleet, player);
    assert_ne!(after, before, "with their helm standing the ship rows on");
    assert_eq!(after.map(|ship| ship.rung), Some(1));
}

#[test]
fn their_ship_is_their_orders_stepped_by_the_rules_to_the_bit() {
    let (fleet, player) = rowing(120);
    let (swell, wind) = fleet.weather();
    let waters = OpenSea { swell };
    let sail = naval::arms::LARGE_BOAT.sail;
    let whole = naval::fight::Hurts::from_numbers(sail, sail);
    let mut ship =
        Ship { x: AT[0], y: AT[1], heading: AT[2], ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
    for helm in std::iter::once(QUIET.helm).chain(std::iter::once(CLIMB)).chain(std::iter::repeat_n(ROWING, 120)) {
        ship = sail_hurt(&ship, sailing::HullKind::Sloop, helm, whole, &waters, wind, 0.0).0;
    }
    let room = ship_of(&fleet, player).map(|ship| ship.to_floats().map(f64::to_bits));
    assert_eq!(room, Some(ship.to_floats().map(f64::to_bits)), "a browser predicting it agrees with the room");
    let hurts = fleet.fight().vessel(player).map(|vessel| Hurts::of(&vessel.damage));
    assert_eq!(hurts, Some(whole), "its hurts as a snapshot's numbers give them");
}

#[test]
fn a_captain_is_called_round_their_ship_four_at_most_and_all_sent_off_at_once() {
    let (mut fleet, player) = rowing(1);
    let mut sequence = 4;
    let mut call = |fleet: &mut Fleet, call: Call| {
        let input = Input { call, ..orders(sequence, ROWING) };
        sequence += 1;
        assert_eq!(fleet.input(player, input), Ok(()));
        fleet.tick();
    };
    for _ in 0..6 {
        call(&mut fleet, Call::Captain(Commission::default(), Levels::default()));
    }
    let captains = |fleet: &Fleet| fleet.fight().ships.values().filter(|vessel| vessel.command().is_some()).count();
    assert_eq!(captains(&fleet), CAPTAINS_MOST);
    let Some(own) = ship_of(&fleet, player) else { panic!("their ship is at sea") };
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
fn two_players_sail_in_one_fight_and_one_who_leaves_takes_their_ship() {
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
        let call = Input { call: Call::Captain(Commission::default(), Levels::default()), ..orders(33, ROWING) };
        assert_eq!(fleet.input(player, call), Ok(()));
        for sequence in 34..600 {
            let fire = sequence % 97 == 0;
            let aim = Some(Aim { bearing_deg: 90.0, range_m: 80.0, ray: None });
            let input = Input { orders: Orders { helm: ROWING, aim, fire, ..QUIET }, ..orders(sequence, ROWING) };
            assert_eq!(fleet.input(player, input), Ok(()));
            fleet.tick();
        }
        fleet.fight().numbers().iter().map(|number| number.to_bits()).collect::<Vec<_>>()
    };
    assert_eq!(fought(), fought());
}

#[test]
fn a_captain_called_comes_of_the_faction_and_rank_asked_for() {
    let (mut fleet, player) = rowing(1);
    let boss = Commission { faction: GREY_TITHE, rank: Rank::Boss };
    assert_eq!(
        fleet.input(player, Input { call: Call::Captain(boss, Levels::default()), ..orders(4, ROWING) }),
        Ok(())
    );
    fleet.tick();
    let called: Vec<_> = fleet
        .fight()
        .ships
        .values()
        .filter_map(|vessel| vessel.command().map(|command| (command.mind.commission, vessel.damage.max_hull)))
        .collect();
    let frigates = (264.0 * 5.0 * naval::ranks::hull_exposure(Rank::Boss.hull())).round();
    assert_eq!(called, [(boss, frigates)], "a Boss of the Grey Tithe, its hull five times a Major's in its Frigate's");
    assert_eq!(fleet.fight().ships.values().filter_map(|vessel| vessel.command()).count(), 1);
}

#[test]
fn a_captain_of_each_rank_called_into_a_fleet_room_sails_its_ranks_hull() {
    for rank in Rank::ALL {
        let (mut fleet, player) = rowing(1);
        let commission = Commission { faction: GREY_TITHE, rank };
        assert_eq!(
            fleet.input(player, Input { call: Call::Captain(commission, Levels::default()), ..orders(4, ROWING) }),
            Ok(())
        );
        fleet.tick();
        let hulls: Vec<_> =
            fleet.fight().ships.values().map(|vessel| (vessel.command().is_some(), vessel.hull)).collect();
        assert_eq!(hulls, [(false, sailing::HullKind::Sloop), (true, rank.hull())], "{rank:?}");
    }
}

#[test]
fn a_call_with_levels_raises_its_captain_and_fits_the_callers_ship_as_a_plain_one_and_none_leaves_both_plain() {
    let (mut fleet, player) = rowing(1);
    let captain_of = |fleet: &Fleet| {
        let mut captains = fleet.fight().ships.iter().filter(|(_, vessel)| vessel.command().is_some());
        captains.next().map(|(id, vessel)| (*id, vessel.damage.max_hull))
    };
    let plain = Input { call: Call::Captain(Commission::default(), Levels::default()), ..orders(4, ROWING) };
    assert_eq!(fleet.input(player, plain), Ok(()));
    fleet.tick();
    let (_, unraised) = captain_of(&fleet).expect("a captain called");
    fleet.tick();
    assert!(fleet.fight().fitting(player).is_none(), "no ship level, no fitting: combat's own numbers");
    let send_off = Input { call: Call::SendOff, ..orders(5, ROWING) };
    assert_eq!(fleet.input(player, send_off), Ok(()));
    fleet.tick();

    let levels = Levels { captain: 12, ship: 9 };
    let called = Input { call: Call::Captain(Commission::default(), levels), ..orders(6, ROWING) };
    assert_eq!(fleet.input(player, called), Ok(()));
    fleet.tick();
    let (captain, raised) = captain_of(&fleet).expect("a captain called");
    let strength = gear::power::foe_health_times(12);
    let at_sea = Commission::default().damage_at(strength).max_hull;
    assert!(raised > unraised && (raised - at_sea).abs() < 1e-9, "raised as at sea: {unraised} to {raised}");
    fleet.tick();
    let fitting = fleet.fight().fitting(player).expect("the caller's ship fitted");
    let power = gear::ship::ShipPower::plain(9);
    assert!((fitting.dealt[&captain] - power.harm_dealt(12)).abs() < 1e-12);
    assert!((fitting.taken[&captain] - power.harm_taken(12) / strength).abs() < 1e-12);
    assert!(fitting.dealt[&captain] < 1.0, "a ship three levels under its captain harms it less");
    let unfitted = Input { call: Call::Captain(Commission::default(), Levels::default()), ..orders(7, ROWING) };
    assert_eq!(fleet.input(player, unfitted), Ok(()));
    fleet.tick();
    assert!(fleet.fight().fitting(player).is_none(), "called again with no ship level, unfitted again");
}
