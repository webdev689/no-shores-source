//! A player's ship as her own gear fits her for a fight: what her balls and her ram do to each ship she fights, and
//! what each one's balls do to her, by her level against theirs (the room reckons it by the gear crate's law); and her
//! trim, from her modules' perks and her officers' posts. A ship with no fitting fights as she always has.

use super::{Fight, Sailor};
use crate::arms::{Side, arms_of};
use crate::damage::{Hurt, Zone};
use crate::gunnery::lay_on;
use crate::guns::Gun;
use crate::shots::ShipId;
use std::collections::BTreeMap;

/// Her trim at sea: each a factor, 1 changing nothing (the gear crate's `ShipTrim`, as the room hands it over).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Trim {
    pub reload: f64,
    pub scatter: f64,
    pub harm_hull: f64,
    pub harm_sail: f64,
    pub harm_crew: f64,
    /// Her harm on a ship below a third of her hull.
    pub finisher: f64,
    pub way: f64,
    pub turn: f64,
    pub hull_taken: f64,
    pub sail_taken: f64,
    pub crew_taken: f64,
    /// What her hull takes below a third of it.
    pub cornered: f64,
    /// What her hull takes from a ball below her waterline.
    pub holed_taken: f64,
    /// What her men take below half of them.
    pub rally: f64,
    pub ram: f64,
    /// Her Carpenter's patches.
    pub patch: f64,
    /// How well her Gunner, her Bosun and her Carpenter hold their posts, 0 for none.
    pub gunner: f64,
    pub bosun: f64,
    pub carpenter: f64,
}

impl Default for Trim {
    fn default() -> Self {
        Self {
            reload: 1.0,
            scatter: 1.0,
            harm_hull: 1.0,
            harm_sail: 1.0,
            harm_crew: 1.0,
            finisher: 1.0,
            way: 1.0,
            turn: 1.0,
            hull_taken: 1.0,
            sail_taken: 1.0,
            crew_taken: 1.0,
            cornered: 1.0,
            holed_taken: 1.0,
            rally: 1.0,
            ram: 1.0,
            patch: 1.0,
            gunner: 0.0,
            bosun: 0.0,
            carpenter: 0.0,
        }
    }
}

/// The share of the way her torn canvas costs her that her Bosun keeps at full strength, and of each ball's harm to
/// her hull her Carpenter patches back; how fast the patching goes, hull points a second; the cosine of the widest a
/// ship may lie off a broadside's square for her Gunner to fire it.
pub const BOSUN_KEEPS: f64 = 0.5;
pub const CARPENTER_PATCHES: f64 = 0.25;
pub const PATCH_PER_S: f64 = 2.0;
pub const GUNNER_ARC_COS: f64 = 0.7;
/// Below this share of her hull she is cornered, and a ship of it is one her finishing harm falls on; below this
/// share of her men, they rally.
pub const CORNERED_AT: f64 = 1.0 / 3.0;
pub const RALLY_AT: f64 = 0.5;

/// A player's ship's fitting for a fight: her harm on each ship by number, each one's harm on her, her trim, and the
/// hull her Carpenter still has to patch.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Fitting {
    pub dealt: BTreeMap<ShipId, f64>,
    pub taken: BTreeMap<ShipId, f64>,
    pub trim: Trim,
    pub patching: f64,
}

impl Fitting {
    fn dealt_to(&self, ship: ShipId) -> f64 {
        self.dealt.get(&ship).copied().unwrap_or(1.0)
    }

    fn taken_from(&self, ship: ShipId) -> f64 {
        self.taken.get(&ship).copied().unwrap_or(1.0)
    }

    /// Her Carpenter's share of a ball's harm to her hull, to patch over the next seconds.
    pub(crate) fn owe(&mut self, hurt: &Hurt) {
        self.patching += hurt.hull * CARPENTER_PATCHES * self.trim.carpenter * self.trim.patch;
    }

    /// Her share of her way with her canvas as it stands: her Bosun keeps part of what torn canvas costs her, and her
    /// trim's way is on top.
    #[must_use]
    pub fn way_share(&self, share: f64) -> f64 {
        let kept = 1.0 - (1.0 - share) * (1.0 - BOSUN_KEEPS * self.trim.bosun);
        kept * self.trim.way
    }
}

impl Fight {
    /// Fits a player's ship for the fight; one fitted already keeps what her Carpenter has still to patch.
    pub fn fit(&mut self, id: ShipId, fitting: Fitting) {
        let patching = self.fittings.get(&id).map_or(0.0, |kept| kept.patching);
        self.fittings.insert(id, Fitting { patching, ..fitting });
    }

    #[must_use]
    pub fn fitting(&self, id: ShipId) -> Option<&Fitting> {
        self.fittings.get(&id)
    }

    /// A ball's gun as it strikes: by the shooter's fitting on its target, and the target's on what it takes, each
    /// part by her trim.
    pub(crate) fn fitted_gun(&self, gun: Gun, shooter: ShipId, target: ShipId, zone: Zone) -> Gun {
        let mut gun = gun;
        let share = |id: ShipId| {
            self.ships.get(&id).map_or((1.0, 1.0), |her| (her.damage.hull_share(), her.damage.crew_share()))
        };
        if let Some(fitted) = self.fittings.get(&shooter) {
            let (trim, power) = (fitted.trim, fitted.dealt_to(target));
            let finish = if share(target).0 < CORNERED_AT { trim.finisher } else { 1.0 };
            gun.hull *= power * trim.harm_hull * finish;
            gun.sail *= power * trim.harm_sail * finish;
            gun.crew *= power * trim.harm_crew * finish;
        }
        if let Some(fitted) = self.fittings.get(&target) {
            let (trim, power) = (fitted.trim, fitted.taken_from(shooter));
            let (hull_share, crew_share) = share(target);
            let cornered = if hull_share < CORNERED_AT { trim.cornered } else { 1.0 };
            let holed = if zone == Zone::Holed { trim.holed_taken } else { 1.0 };
            let rallied = if crew_share < RALLY_AT { trim.rally } else { 1.0 };
            gun.hull *= power * trim.hull_taken * cornered * holed;
            gun.sail *= power * trim.sail_taken;
            gun.crew *= power * trim.crew_taken * rallied;
        }
        gun
    }

    /// A ram's blow from a player's stem on a ship: by her harm on that ship and her ram's trim.
    pub(crate) fn fitted_ram(&self, rammer: ShipId, target: ShipId, blow: f64) -> f64 {
        self.fittings.get(&rammer).map_or(blow, |fitted| blow * fitted.dealt_to(target) * fitted.trim.ram)
    }

    /// Each Carpenter's patching for a tick: whole hull points given back as they come due, never past her whole,
    /// none to a ship going down.
    pub(crate) fn patch(&mut self, seconds: f64) {
        for (id, fitted) in &mut self.fittings {
            let Some(vessel) = self.ships.get_mut(id) else { continue };
            if fitted.patching <= 0.0 || !vessel.damage.fighting() {
                continue;
            }
            let given = (PATCH_PER_S * seconds).min(fitted.patching);
            fitted.patching -= given;
            vessel.damage.hull = (vessel.damage.hull + given).min(vessel.damage.max_hull);
        }
    }

    /// The broadside a player's Gunner fires for her: the side her own look does not lay, loaded, square enough on a
    /// ship of another flag within its reach; laid on that ship's middle.
    pub(crate) fn gunners_lay(&self, id: ShipId, laid_by_player: Option<Side>) -> Option<crate::gunnery::Lay> {
        self.fittings.get(&id).filter(|fitted| fitted.trim.gunner > 0.0)?;
        let vessel = self.ships.get(&id).filter(|vessel| matches!(vessel.sailor, Sailor::Player))?;
        let arms = arms_of(vessel.hull);
        let sides = [Side::Port, Side::Starboard].into_iter().filter(|side| Some(*side) != laid_by_player);
        for side in sides.filter(|side| vessel.guns.ready(*side)) {
            let square = crate::gunnery::lay(&vessel.ship, &vessel.pose, arms, side, vessel.guns.load, 0.0, None);
            let bears = self.ships.iter().filter(|(other, her)| {
                **other != id && her.flag() != vessel.flag() && her.in_fight() && her.damage.fighting()
            });
            let target = bears
                .map(|(_, her)| {
                    let (east, south) = (her.ship.x - square.centre[0], her.ship.y - square.centre[1]);
                    let apart = (east * east + south * south).sqrt();
                    (her, apart, (east * square.dir[0] + south * square.dir[1]) / apart.max(1e-9))
                })
                .filter(|(_, apart, cos)| *cos >= GUNNER_ARC_COS && *apart <= square.reach)
                .min_by(|one, other| one.1.total_cmp(&other.1));
            if let Some((her, _, _)) = target {
                let point = [her.ship.x, her.ship.y, square.centre[2]];
                return Some(lay_on(&vessel.ship, &vessel.pose, arms, side, vessel.guns.load, point));
            }
        }
        None
    }
}

#[cfg(test)]
#[path = "fitting_tests.rs"]
mod tests;
