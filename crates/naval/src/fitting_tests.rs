use super::*;
use crate::damage::{Hurt, Zone};
use crate::fight::{CAPTAIN, Fight, Orders, PLAYER};
use crate::guns::SWIVEL;
use crate::ranks::Commission;
use sailing::ship::{Helm, Ship};
use sailing::waters::{Spot, Waters};

struct Open;

impl Waters for Open {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: -50.0, surface: Some(0.0) }
    }
}

const STILL: Helm = Helm { steer: 0.0, crab: false, climb: 0 };
const IDLE: Orders = Orders { helm: STILL, aim: None, fire: false, brace: false, load: None };

/// A fight with its captain lying `east` metres off the player's starboard beam (both heading north), still.
fn abeam(east: f64) -> Fight {
    let ship = Ship { x: 0.0, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
    let mut fight = Fight::begin(ship, Commission::default(), 3, &Open, 0.0).expect("a fight");
    if let Some(other_ship) = fight.ships.get_mut(&CAPTAIN) {
        other_ship.ship = Ship { x: east, y: 0.0, ..ship };
    }
    fight
}

fn fitted(trim: Trim, dealt: f64, taken: f64) -> Fitting {
    Fitting { dealt: [(CAPTAIN, dealt)].into(), taken: [(CAPTAIN, taken)].into(), trim, patching: 0.0 }
}

#[test]
fn a_ship_with_no_fitting_strikes_and_is_struck_as_it_always_was() {
    let fight = abeam(80.0);
    assert_eq!(fight.fitted_gun(SWIVEL, PLAYER, CAPTAIN, Zone::Hull), SWIVEL);
    assert_eq!(fight.fitted_gun(SWIVEL, CAPTAIN, PLAYER, Zone::Hull), SWIVEL);
    assert!((fight.fitted_ram(PLAYER, CAPTAIN, 30.0) - 30.0).abs() < 1e-12);
}

#[test]
fn its_power_meets_each_ship_it_fights_out_and_in_and_its_trim_shapes_each_part() {
    let mut fight = abeam(80.0);
    let trim = Trim { harm_hull: 1.1, harm_crew: 1.5, sail_taken: 0.5, ram: 2.0, ..Trim::default() };
    fight.fit(PLAYER, fitted(trim, 2.0, 0.25));
    let out = fight.fitted_gun(SWIVEL, PLAYER, CAPTAIN, Zone::Hull);
    assert!((out.hull - SWIVEL.hull * 2.2).abs() < 1e-9 && (out.sail - SWIVEL.sail * 2.0).abs() < 1e-9);
    assert!((out.crew - SWIVEL.crew * 3.0).abs() < 1e-9);
    let taken = fight.fitted_gun(SWIVEL, CAPTAIN, PLAYER, Zone::Hull);
    assert!((taken.hull - SWIVEL.hull * 0.25).abs() < 1e-9 && (taken.sail - SWIVEL.sail * 0.125).abs() < 1e-9);
    assert!((fight.fitted_ram(PLAYER, CAPTAIN, 30.0) - 120.0).abs() < 1e-9);
}

#[test]
fn its_finishing_its_cornered_hull_its_waterline_and_its_rallied_men_take_their_turn() {
    let mut fight = abeam(80.0);
    let trim = Trim { finisher: 1.2, cornered: 0.5, holed_taken: 0.8, rally: 0.5, ..Trim::default() };
    fight.fit(PLAYER, fitted(trim, 1.0, 1.0));
    assert_eq!(fight.fitted_gun(SWIVEL, PLAYER, CAPTAIN, Zone::Hull), SWIVEL, "its foe is sound");
    if let Some(other_ship) = fight.ships.get_mut(&CAPTAIN) {
        other_ship.damage.hull = other_ship.damage.max_hull * 0.3;
    }
    assert!((fight.fitted_gun(SWIVEL, PLAYER, CAPTAIN, Zone::Hull).hull - SWIVEL.hull * 1.2).abs() < 1e-9);
    assert!((fight.fitted_gun(SWIVEL, CAPTAIN, PLAYER, Zone::Holed).hull - SWIVEL.hull * 0.8).abs() < 1e-9);
    if let Some(own) = fight.ships.get_mut(&PLAYER) {
        own.damage.hull = own.damage.max_hull * 0.3;
        own.damage.crew = own.damage.max_crew * 0.4;
    }
    let struck = fight.fitted_gun(SWIVEL, CAPTAIN, PLAYER, Zone::Hull);
    assert!((struck.hull - SWIVEL.hull * 0.5).abs() < 1e-9 && (struck.crew - SWIVEL.crew * 0.5).abs() < 1e-9);
}

#[test]
fn its_carpenter_patches_part_of_each_balls_harm_back_over_the_seconds_after_never_past_its_whole() {
    let mut fight = abeam(80.0);
    fight.fit(PLAYER, fitted(Trim { carpenter: 1.0, ..Trim::default() }, 1.0, 1.0));
    let whole = fight.ships[&PLAYER].damage.max_hull;
    if let Some(own) = fight.ships.get_mut(&PLAYER) {
        own.damage.hull = whole - 40.0;
    }
    if let Some(fitting) = fight.fittings.get_mut(&PLAYER) {
        fitting.owe(&Hurt { hull: 40.0, sail: 0.0, crew: 0.0, fire: false });
    }
    assert!((fight.fitting(PLAYER).expect("fitted").patching - 10.0).abs() < 1e-9, "a quarter of it");
    fight.patch(1.0);
    assert!((fight.ships[&PLAYER].damage.hull - (whole - 38.0)).abs() < 1e-9, "two points a second");
    fight.fit(PLAYER, fitted(Trim { carpenter: 1.0, ..Trim::default() }, 1.0, 1.0));
    fight.patch(100.0);
    assert!((fight.ships[&PLAYER].damage.hull - (whole - 30.0)).abs() < 1e-9, "a fitting refreshed keeps its due");
    let mut none = abeam(80.0);
    if let Some(fitting) = none.fittings.get_mut(&PLAYER) {
        fitting.owe(&Hurt { hull: 40.0, sail: 0.0, crew: 0.0, fire: false });
    }
    assert!(none.fitting(PLAYER).is_none(), "no Carpenter, no patching");
}

#[test]
fn its_gunner_fires_the_broadside_its_look_does_not_lay_when_a_ship_bears_on_it() {
    let mut fight = abeam(80.0);
    assert!(fight.gunners_lay(PLAYER, None).is_none(), "no Gunner posted");
    fight.fit(PLAYER, fitted(Trim { gunner: 0.8, ..Trim::default() }, 1.0, 1.0));
    let laid = fight.gunners_lay(PLAYER, None).expect("its starboard battery bears");
    assert_eq!(laid.side, crate::arms::Side::Starboard);
    assert!(fight.gunners_lay(PLAYER, Some(crate::arms::Side::Starboard)).is_none(), "it lays that side itself");
    let balls = fight.balls.len();
    let events = fight.step(&[(PLAYER, IDLE)], &Open, [1.5, 0.0], 0.0);
    assert!(fight.balls.len() > balls || events.iter().any(|event| matches!(event, crate::fight::Event::Shot(_))));
    assert!(fight.gunners_lay(PLAYER, None).is_none(), "the side is reloading");
    let mut far = abeam(5_000.0);
    far.fit(PLAYER, fitted(Trim { gunner: 0.8, ..Trim::default() }, 1.0, 1.0));
    assert!(far.gunners_lay(PLAYER, None).is_none(), "out of its guns' reach");
}

#[test]
fn the_bosun_keeps_part_of_the_way_torn_canvas_costs_and_the_trim_turns_the_ship() {
    let bosun = Fitting { trim: Trim { bosun: 1.0, way: 1.1, ..Trim::default() }, ..Fitting::default() };
    assert!((bosun.way_share(0.6) - 0.8 * 1.1).abs() < 1e-12);
    assert!((Fitting::default().way_share(0.6) - 0.6).abs() < 1e-12);
    let hurts = crate::fight::Hurts::from_numbers(false, 48.0, 96.0);
    let turned = Fitting { trim: Trim { turn: 1.2, ..Trim::default() }, ..Fitting::default() };
    assert!((hurts.fitted(Some(&turned)).turn - 1.2).abs() < 1e-12);
    assert_eq!(hurts.fitted(None), hurts);
}
