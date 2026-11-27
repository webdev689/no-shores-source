use super::*;
use crate::captain::Temper;
use crate::night::{NIGHT_DARK_SIGHT_M, NIGHT_LIT_SIGHT_M};
use crate::ranks::{GREY_TITHE, PLAYERS, Rank};
use sailing::ship::SAILS_SET;
use sailing::waters::Spot;

/// Deep, still water everywhere.
struct Open;

impl Waters for Open {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: -50.0, surface: Some(0.0) }
    }
}

const TITHE: ShipId = 1;
const FRIEND: ShipId = 2;
const DAY: f64 = 1.0;
const NIGHT: f64 = 0.0;

/// A bold Tithe captain and a bold friendly one `apart` metres abeam under `daylight`, after one tick: whom each
/// marks.
fn marked(apart: f64, daylight: f64) -> [Option<ShipId>; 2] {
    let ship = |x| Ship { x, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: SAILS_SET };
    let mut fight = Fight::new(5);
    fight.daylight = daylight;
    fight.enlist(TITHE, ship(0.0), Commission { faction: GREY_TITHE, rank: Rank::Elite }, 11, &Open, 0.0);
    fight.enlist(FRIEND, ship(apart), Commission { faction: PLAYERS, rank: Rank::Elite }, 12, &Open, 0.0);
    for vessel in fight.ships.values_mut() {
        if let Sailor::Captain(command) = &mut vessel.sailor {
            command.mind.temper = Temper::Bold;
        }
    }
    fight.step(&[], &Open, &|_| [1.5, 0.0], 0.0);
    [TITHE, FRIEND].map(|id| fight.vessel(id).and_then(Vessel::command).and_then(|command| command.mind.target()))
}

#[test]
fn by_day_each_lookout_sees_the_other_out_to_its_whole_range() {
    assert_eq!(marked(700.0, DAY), [Some(FRIEND), Some(TITHE)]);
}

#[test]
fn by_night_the_tithe_sees_a_lit_friendly_ship_to_650_metres_and_no_farther() {
    assert_eq!(marked(NIGHT_LIT_SIGHT_M - 10.0, NIGHT)[0], Some(FRIEND));
    assert_eq!(marked(NIGHT_LIT_SIGHT_M + 10.0, NIGHT)[0], None);
}

#[test]
fn by_night_a_friendly_lookout_sees_the_dark_tithe_only_within_220_metres() {
    assert_eq!(marked(NIGHT_DARK_SIGHT_M - 10.0, NIGHT), [Some(FRIEND), Some(TITHE)]);
    assert_eq!(marked(NIGHT_DARK_SIGHT_M + 10.0, NIGHT), [Some(FRIEND), None]);
}
