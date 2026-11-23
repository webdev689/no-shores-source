//! An Atheric module's own work in a fight, beside the trim's factors (`fitting.rs`): Living Bone mending its hull,
//! Hard to Kill's last stand, Feeding's guns reloaded by a ship it sinks, Squall's way from each ball striking it, a
//! Web's balls slowing the turn of a ship they strike in the rigging, and a Snare slowing the ships near it. A ship
//! sinks to the ball that takes the last of its hull: that ball's shooter sank it. Only a player's ship is fitted, so
//! a captain's carries none of these, and a fight with none of them is the same to the bit.

use super::Fight;
use crate::captain::course::distance;
use crate::damage::{Damage, Hurt, State, Zone};
use crate::shots::ShipId;

/// A Squall's way is each ball's share for this many seconds, to this share at most.
pub const SQUALL_S: f64 = 6.0;
pub const SQUALL_MOST: f64 = 0.15;
/// A Web's slowed turn lasts this many seconds.
pub const WEB_S: f64 = 6.0;
/// A Snare slows a ship of another flag within this many metres of it.
pub const SNARE_M: f64 = 30.0;

impl super::fitting::Fitting {
    /// Its last stand, for a ball's `hurt` about to be applied to its `damage` at `floor`: once a fight, a ball that
    /// would sink it leaves it its trim's share of its hull. Answers the floor the ball is applied at.
    pub(crate) fn stand(&mut self, damage: &mut Damage, hurt: &Hurt, floor: f64) -> f64 {
        // A ship held afloat already (an ambush's least hull, a floor) is not one the ball would sink.
        let held = damage.least_hull > 0.0 || floor > 0.0;
        let sinks = !held && hurt.hull.trunc() >= damage.hull && damage.state == State::Afloat;
        if self.stood || self.trim.last_stand <= 0.0 || !sinks {
            return floor;
        }
        self.stood = true;
        let left = damage.max_hull * self.trim.last_stand;
        damage.hull = damage.hull.max(left);
        floor.max(left)
    }
}

impl Fight {
    /// What other ships' Atherics take off a ship's way and its turn this tick, as factors: a Web's from its balls in
    /// its rigging, and the strongest Snare of another flag within `SNARE_M`. 1 each for none.
    pub(crate) fn hampered(&self, id: ShipId) -> (f64, f64) {
        let turn = self.webbed.get(&id).map_or(1.0, |(_, share)| 1.0 - share);
        let Some(vessel) = self.ships.get(&id) else { return (1.0, turn) };
        let at = [vessel.ship.x, vessel.ship.y];
        let snare = (self.fittings.iter())
            .filter(|(other, fitted)| **other != id && fitted.trim.snare > 0.0)
            .filter_map(|(other, fitted)| {
                let snarer = self.ships.get(other)?;
                let near = distance(at, [snarer.ship.x, snarer.ship.y]) <= SNARE_M;
                let foe = snarer.flag() != vessel.flag() && snarer.in_fight() && snarer.damage.fighting();
                (near && foe).then_some(fitted.trim.snare)
            })
            .fold(0.0, f64::max);
        (1.0 - snare, turn)
    }

    /// A ball's strike as the Atherics take it, once its harm is applied and `state` is the target's change: a
    /// Feeding shooter whose ball sank it reloads at once, a Squall in the target fills (once a ball: not again for a
    /// ball `rigged` that tore its canvas first), and a Web shooter's ball in its rigging slows its turn.
    pub(super) fn struck_by(
        &mut self,
        shooter: ShipId,
        target: ShipId,
        (zone, rigged): (Zone, bool),
        state: Option<State>,
    ) {
        let clock = self.clock;
        let trim = self.fittings.get(&shooter).map(|fitted| fitted.trim).unwrap_or_default();
        if trim.feeding
            && state == Some(State::Sinking)
            && let Some(vessel) = self.ships.get_mut(&shooter)
        {
            vessel.guns.reload_at_once();
        }
        if let Some(fitted) = self.fittings.get_mut(&target).filter(|fitted| fitted.trim.squall > 0.0 && !rigged) {
            fitted.squalls.push(clock);
        }
        if trim.web > 0.0 && zone == Zone::Rig {
            self.webbed.insert(target, (clock + WEB_S, trim.web));
        }
    }

    /// The Atherics' tick: Living Bone mends a ship afloat by its share of its hull a second, never past its whole;
    /// each Squall's ball and each Web runs out in its seconds.
    pub(super) fn exotics(&mut self, seconds: f64) {
        let clock = self.clock;
        for (id, fitted) in &mut self.fittings {
            fitted.squalls.retain(|at| clock - at < SQUALL_S - 1e-9);
            let Some(vessel) = self.ships.get_mut(id) else { continue };
            if fitted.trim.mend > 0.0 && vessel.damage.fighting() {
                let mended = vessel.damage.max_hull * fitted.trim.mend * seconds;
                vessel.damage.hull = (vessel.damage.hull + mended).min(vessel.damage.max_hull);
            }
        }
        self.webbed.retain(|_, (until, _)| *until > clock + 1e-9);
    }
}

#[cfg(test)]
#[path = "fight_exotics_tests.rs"]
mod tests;
