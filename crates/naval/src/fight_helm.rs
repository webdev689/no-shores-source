//! A player's ship at its helm in a fight: what its hurts and its fitting leave its way and its swing, and its step
//! by its helm as its hull's class sails it (`class.rs`), the same in the room and in a browser predicting it.

use super::{FIGHT_PACE, FIGHT_TURN, fitting};
use crate::class::class_of;
use crate::damage::{Damage, way_share_of};
use sailing::HullKind;
use sailing::TICK_SECONDS;
use sailing::ship::{Helm, Pull, SAILS_SET, Ship, step_pulled};
use sailing::waters::Waters;

/// What a player's ship's hurts leave its helm: the canvas it has left and the share of its way that canvas leaves it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Hurts {
    pub sail: f64,
    pub way_share: f64,
    /// The share of the turn its helm asks that its trim gives it.
    pub turn: f64,
    /// The share of its sails' and oars' pull its burst gives it (`Boost::drive`).
    pub drive: f64,
}

impl Hurts {
    #[must_use]
    pub fn of(damage: &Damage) -> Self {
        Self { sail: damage.sail, way_share: damage.way_share(), turn: 1.0, drive: 1.0 }
    }

    /// Its hurts from its numbers as a snapshot gives them.
    #[must_use]
    pub fn from_numbers(sail: f64, max_sail: f64) -> Self {
        Self { sail, way_share: way_share_of(sail, max_sail), turn: 1.0, drive: 1.0 }
    }

    /// Its hurts as its fitting trims them: the way its canvas leaves it, and its turn.
    #[must_use]
    pub fn fitted(self, fitting: Option<&fitting::Fitting>) -> Self {
        let Some(fitting) = fitting else { return self };
        Self { way_share: fitting.way_share(self.way_share), turn: fitting.trim.turn, ..self }
    }
}

/// A player's ship of `hull` stepped a tick by its helm, as its hurts let it, at a fight's pace and swing and its
/// class's way and swing: no sail sets with its rigging shot away, its sails' and oars' pull is held back, and a burst
/// drives it. Answers the ship and whether its helm climbed for sail it could not set.
#[must_use]
pub fn sail_hurt(
    ship: &Ship,
    hull: HullKind,
    helm: Helm,
    hurts: Hurts,
    waters: &impl Waters,
    wind: [f64; 2],
    time: f64,
) -> (Ship, bool) {
    let mut helm = helm;
    let mut refused = false;
    if hurts.sail <= 0.0 && ship.rung.saturating_add(helm.climb) >= SAILS_SET {
        refused = helm.climb > 0;
        helm.climb = if ship.rung >= SAILS_SET { -1 } else { 0 };
    }
    let class = class_of(hull);
    let pull = Pull {
        sail: hurts.way_share * hurts.drive * FIGHT_PACE * class.way,
        oars: hurts.drive * FIGHT_PACE * class.way,
        turn: hurts.turn * FIGHT_TURN * class.turn,
    };
    (step_pulled(ship, &helm, hull.hull(), wind, waters, time, TICK_SECONDS, pull), refused)
}
