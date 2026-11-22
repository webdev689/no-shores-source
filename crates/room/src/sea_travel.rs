//! Travel by the held map ([[The Held Map Takes the Ship to Other Waters, Seen Sailing Away]]): a course into another
//! water, asked with the travel flag, takes the ship most of the way at once. The room judges it as any course, and
//! refuses it besides while the ship fights, has a hostile ship on its heels, or its player is off the helm, and for a
//! course that ends in the water the ship is in. Taken, the ship lies on the course's last leg short of its end,
//! heading along it, and sails the rest; the player's next roll for a hostile ship waits its first wait again.

use super::{CourseRefused, Sea};
use crate::PlayerId;

/// What the sea tells a player of their travel: the code, the tick, and its outcome (0 taken, else
/// `TravelRefused::number`).
pub const TRAVELLED: f64 = 24.0;
/// How far short of its course's end a travel puts the ship, metres: the arrival is seen sailing in.
pub const SHORT_OF_END_M: f64 = 400.0;

/// Why a travel was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TravelRefused {
    /// In a fight, on a deck, or boarding.
    Fighting,
    OffTheHelm,
    /// A hostile ship has the player for its quarry.
    Chased,
    /// The course ends in the water the ship is in.
    OwnWater,
    /// Refused as any course would be.
    Course(CourseRefused),
}

impl TravelRefused {
    /// The number the page is told: 1 fighting, 2 off the helm, 3 chased, 4 its own water, 5 across land, 6 too soon,
    /// 7 any other course refused.
    #[must_use]
    pub fn number(self) -> f64 {
        match self {
            TravelRefused::Fighting | TravelRefused::Course(CourseRefused::Fighting) => 1.0,
            TravelRefused::OffTheHelm | TravelRefused::Course(CourseRefused::OffTheHelm) => 2.0,
            TravelRefused::Chased => 3.0,
            TravelRefused::OwnWater => 4.0,
            TravelRefused::Course(CourseRefused::CrossesLand) => 5.0,
            TravelRefused::Course(CourseRefused::TooSoon) => 6.0,
            TravelRefused::Course(_) => 7.0,
        }
    }
}

impl Sea {
    /// Travels a player's ship by `points` at `pace`, telling them how it went (`TRAVELLED`).
    pub fn travel(&mut self, player: PlayerId, points: &[[f64; 2]], pace: u16) -> Result<(), TravelRefused> {
        let travelled = self.try_travel(player, points, pace);
        let outcome = travelled.err().map_or(0.0, TravelRefused::number);
        self.harbour.told.push((player, vec![TRAVELLED, self.clock as f64, outcome]));
        travelled
    }

    /// The travel itself: refused as the module says, else the course set and the ship placed on it.
    fn try_travel(&mut self, player: PlayerId, points: &[[f64; 2]], pace: u16) -> Result<(), TravelRefused> {
        let sailing = self.berths.get(&player).and_then(|berth| berth.sailing.as_ref());
        let ship = sailing.ok_or(TravelRefused::Course(CourseRefused::BadCourse))?.ship;
        if self.fights.fighting(player) || self.on_deck(player) {
            return Err(TravelRefused::Fighting);
        }
        if self.aboard.contains_key(&player) {
            return Err(TravelRefused::OffTheHelm);
        }
        if self.pirates.sailing.iter().any(|hostile| hostile.quarry == Some(player)) {
            return Err(TravelRefused::Chased);
        }
        let &asked = points.last().ok_or(TravelRefused::Course(CourseRefused::BadCourse))?;
        if self.chart.water_id(asked) == self.chart.water_id([ship.x, ship.y]) {
            return Err(TravelRefused::OwnWater);
        }
        self.course(player, points, pace).map_err(TravelRefused::Course)?;
        // The course as the room took it, to the whole metre, from where the ship lay.
        let sailing = self.berths.get_mut(&player).and_then(|berth| berth.sailing.as_mut());
        let sailing = sailing.ok_or(TravelRefused::Course(CourseRefused::NoSuchPlayer))?;
        let held = &sailing.course;
        let &end = held.back().ok_or(TravelRefused::Course(CourseRefused::BadCourse))?;
        let start = held.len().checked_sub(2).map_or([sailing.ship.x, sailing.ship.y], |before| held[before]);
        let (east, south) = (end[0] - start[0], end[1] - start[1]);
        let length = (east * east + south * south).sqrt();
        let short = if length > SHORT_OF_END_M { SHORT_OF_END_M / length } else { 1.0 };
        (sailing.ship.x, sailing.ship.y) = (end[0] - east * short, end[1] - south * short);
        sailing.ship.heading = libm::atan2(east, -south).rem_euclid(core::f64::consts::TAU);
        sailing.course.drain(..sailing.course.len() - 1);
        self.pirates.wait_first(player);
        Ok(())
    }
}

#[cfg(test)]
#[path = "sea_travel_tests.rs"]
mod tests;
