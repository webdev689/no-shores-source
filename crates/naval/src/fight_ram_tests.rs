use super::*;
use crate::damage::Hurt;
use crate::ram::{Flat, overlap};
use sailing::waters::Spot;

/// Deep, still water everywhere.
struct Open;

impl Waters for Open {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: -50.0, surface: Some(0.0) }
    }
}

const WIND: [f64; 2] = [1.5, 0.0];
const ROWING: Orders =
    Orders { helm: Helm { steer: 0.0, crab: false, climb: 0 }, aim: None, fire: false, brace: false, load: None };

/// The player's Sloop at (0, `south`) heading north at `way` m/s on her oars, and a wary captain lying still at
/// (0, -5) heading east, her starboard side to the player's bow.
fn bow_to_side(south: f64, way: f64) -> Fight {
    let mut fight = Fight::new(11);
    let player = Ship { x: 0.0, y: south, heading: 0.0, ahead: way, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 1 };
    fight.put_to_sea(PLAYER, player, &Open, 0.0);
    fight.call_captain(CAPTAIN, &player, &Open, 0.0).unwrap_or_else(|error| panic!("{error}"));
    let her = fight.ships.get_mut(&CAPTAIN).unwrap_or_else(|| panic!("the captain"));
    her.ship = Ship { x: 0.0, y: -5.0, heading: std::f64::consts::FRAC_PI_2, ..Ship { rung: 0, ahead: 0.0, ..player } };
    if let Sailor::Captain(command) = &mut her.sailor {
        (command.her.temper, command.her.cruise) = (crate::captain::Temper::Wary, std::f64::consts::FRAC_PI_2);
    }
    fight
}

fn hull_of(fight: &Fight, id: ShipId) -> f64 {
    fight.vessel(id).map_or(-1.0, |vessel| vessel.damage.hull)
}

fn rams(events: &[Event]) -> Vec<(ShipId, ShipId, f64)> {
    let ram = |event: &Event| match *event {
        Event::Ram { ship, by, dealt, .. } => Some((ship, by, dealt)),
        _ => None,
    };
    events.iter().filter_map(ram).collect()
}

#[test]
fn a_sloop_driven_into_her_side_rams_her_and_pays_its_recoil() {
    let mut fight = bow_to_side(0.5, 6.0);
    let events = fight.step(&[(PLAYER, ROWING)], &Open, WIND, 0.0);
    // 0.15 of the lesser hull (240) at 6 of 8 m/s, into her side: 27; the recoil is 0.6 of it, 16.
    assert_eq!(rams(&events), [(CAPTAIN, PLAYER, 27.0)]);
    assert_eq!((hull_of(&fight, CAPTAIN), hull_of(&fight, PLAYER)), (264.0 - 27.0, 240.0 - 16.0));
    for tick in 1..30 {
        fight.step(&[(PLAYER, ROWING)], &Open, WIND, f64::from(tick) / 60.0);
    }
    let her = fight.vessel(CAPTAIN).and_then(Vessel::command).map(|command| command.her.target());
    assert_eq!(her, Some(Some(PLAYER)), "rammed, the wary captain fights the rammer");
}

#[test]
fn a_bump_under_a_rams_way_does_no_harm() {
    let mut fight = bow_to_side(0.5, 1.0);
    let mut events = Vec::new();
    for tick in 0..240 {
        events.extend(fight.step(&[(PLAYER, ROWING)], &Open, WIND, f64::from(tick) / 60.0));
    }
    assert!(rams(&events).is_empty());
    assert_eq!((hull_of(&fight, CAPTAIN), hull_of(&fight, PLAYER)), (264.0, 240.0));
}

#[test]
fn a_ship_once_rammed_is_not_rammed_again_by_her_for_three_seconds() {
    let mut fight = bow_to_side(0.5, 6.0);
    let mut events = fight.step(&[(PLAYER, ROWING)], &Open, WIND, 0.0);
    // Back where she rammed from, at the same way, two seconds on.
    for tick in 1..120 {
        fight.step(&[(PLAYER, ROWING)], &Open, WIND, f64::from(tick) / 60.0);
    }
    let again = Ship { x: 0.0, y: 0.5, heading: 0.0, ahead: 6.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 1 };
    let her = Ship { x: 0.0, y: -5.0, heading: std::f64::consts::FRAC_PI_2, ahead: 0.0, rung: 0, ..again };
    fight.ships.get_mut(&PLAYER).unwrap_or_else(|| panic!("player")).ship = again;
    fight.ships.get_mut(&CAPTAIN).unwrap_or_else(|| panic!("captain")).ship = her;
    events.extend(fight.step(&[(PLAYER, ROWING)], &Open, WIND, 2.0));
    assert_eq!(rams(&events).len(), 1, "the second within three seconds does not land");
}

#[test]
fn a_wreck_rams_nothing() {
    let mut fight = bow_to_side(0.5, 6.0);
    let player = fight.ships.get_mut(&PLAYER).unwrap_or_else(|| panic!("player"));
    player.damage.apply(Hurt { hull: 300.0, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    let events = fight.step(&[(PLAYER, ROWING)], &Open, WIND, 0.0);
    assert!(rams(&events).is_empty());
}

#[test]
fn hulls_that_overlap_are_pushed_apart() {
    let mut fight = bow_to_side(0.5, 0.0);
    let her = Ship { x: 1.2, y: 0.5, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
    fight.ships.get_mut(&CAPTAIN).unwrap_or_else(|| panic!("captain")).ship = her;
    let flats = |fight: &Fight| {
        [PLAYER, CAPTAIN].map(|id| {
            let ship = fight.vessel(id).map_or(her, |vessel| vessel.ship);
            let (forward, starboard) = sailing::pose::frame(ship.heading);
            let middle = [ship.x + forward[0] * 0.28125, ship.y + forward[1] * 0.28125];
            Flat { middle, forward, starboard, half_length: 3.55105, half_beam: 1.0009 }
        })
    };
    let [one, other] = flats(&fight);
    assert!(overlap(&one, &other).is_some(), "abreast, 1.2 m apart: their hulls overlap");
    fight.step(&[(PLAYER, ROWING)], &Open, WIND, 0.0);
    let [one, other] = flats(&fight);
    assert_eq!(overlap(&one, &other), None, "pushed apart, half each way");
    assert_eq!((hull_of(&fight, CAPTAIN), hull_of(&fight, PLAYER)), (264.0, 240.0), "a push is no blow");
}
