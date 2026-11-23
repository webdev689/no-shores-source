//! A player's lay among the ships of a fight: the side their look picks, laid on the point of a ship of another flag
//! the look's ray meets (DFO's `lookOnShip`), else for the water's range; and where each gun's ball, unscattered,
//! would stop. Free functions over the ships as numbers, so a browser lays the same lay the room fires.

use crate::arms::{LARGE_BOAT, arms_of, hull_block, sail_blocks, side_for_bearing};
use crate::ballistics::{Block, segment_entry};
use crate::damage::State;
use crate::fight::{Aim, Fight, Refusal, Vessel, carry_of};
use crate::gunnery::{Lay, RIPPLE_S, aimed, lay, lay_on, zone_radius};
use crate::guns::Shot;
use crate::rigging::masts_of;
use crate::shots::{Flag, ShipId, Stop, Target, stop_of};

use sailing::pose::Pose;
use sailing::ship::Ship;
use sailing::waters::Waters;
use sailing::{HullKind, TICK_SECONDS};

/// A look meets a ship within this far past the laid gun's longest throw (metres): DFO's `LOOK_REACH_PAD`.
pub const LOOK_REACH_PAD_M: f64 = 60.0;
/// The farthest a look's eye stands from its ship's middle, metres: the sea fight's camera, 75 m out from a point 6 m
/// over the ship (client/src/game/seaCombat.ts `ORBIT`), and the way the ship makes before the room hears the look. A
/// ray from farther lays nothing: no player looks from beside the ship they aim at.
pub const LOOK_EYE_M: f64 = 100.0;

/// A ship as a lay sees it: its number and flag, its hull, its helm's numbers, how it lies, and whether it floats.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Sighted {
    pub id: ShipId,
    pub flag: Flag,
    pub hull: HullKind,
    pub ship: Ship,
    pub pose: Pose,
    pub afloat: bool,
    /// The masts fallen, one bit a mast fore to aft: a ball passes where their sails stood.
    pub fallen: u8,
}

impl Sighted {
    #[must_use]
    pub fn of(id: ShipId, vessel: &Vessel) -> Self {
        let afloat = vessel.damage.state != State::Sunk;
        let fallen = vessel.rigging.fallen_bits();
        Self { id, flag: vessel.flag(), hull: vessel.hull, ship: vessel.ship, pose: vessel.pose, afloat, fallen }
    }

    /// The ship as a ball meets it.
    #[must_use]
    pub fn target(&self) -> Target {
        Target {
            id: self.id,
            flag: self.flag,
            hull: hull_block(&self.ship, &self.pose, arms_of(self.hull)),
            rig: sail_blocks(&self.ship, &self.pose, arms_of(self.hull)),
            up: masts_of(self.hull).iter().map(|mast| self.fallen & (1 << mast) == 0).collect(),
            alive: self.afloat,
        }
    }
}

/// The side `shooter`'s look lays with `load`, as its guns would fire it now, if a side bears there: on the point
/// of a ship of another flag the look's ray meets, else `range_m` out along its fire from its middle, so from its
/// guns' middle less the way they stand out from it.
#[must_use]
pub fn lay_for(shooter: &Sighted, load: Shot, aim: &Aim, ships: &[Sighted]) -> Option<Lay> {
    let side = side_for_bearing(aim.bearing_deg)?;
    let (ship, pose, arms) = (&shooter.ship, &shooter.pose, arms_of(shooter.hull));
    let square = lay(ship, pose, arms, side, load, 0.0, None);
    if let Some(point) = aim.ray.and_then(|ray| look_on(shooter, &square, ray, ships)) {
        return Some(lay_on(ship, pose, arms, side, load, point));
    }
    let out = (square.centre[0] - ship.x) * square.dir[0] + (square.centre[1] - ship.y) * square.dir[1];
    Some(lay(ship, pose, arms, side, load, (aim.range_m - out).max(0.0), None))
}

/// The point to lay on where the look's ray first meets a ship of another flag, its hull or its canvas, within the
/// square lay's longest throw and `LOOK_REACH_PAD_M` (DFO's `lookOnShip`); none from an eye past `LOOK_EYE_M`. A look
/// on its canvas lays chain for that very point and every other load for its hull's middle: a ball laid for a sail
/// flies on through it. The point is led along the fire by its way over the ball's flight there; across the fire the
/// timing is the helm's.
fn look_on(shooter: &Sighted, square: &Lay, [eye, look]: [[f64; 3]; 2], ships: &[Sighted]) -> Option<[f64; 3]> {
    let length = (look[0] * look[0] + look[1] * look[1] + look[2] * look[2]).sqrt();
    let off = [eye[0] - shooter.ship.x, eye[1] - shooter.ship.y, eye[2] - shooter.pose.heave];
    if length <= 0.0 || (off[0] * off[0] + off[1] * off[1] + off[2] * off[2]).sqrt() > LOOK_EYE_M {
        return None;
    }
    let far = [0, 1, 2].map(|axis| eye[axis] + look[axis] / length * (square.reach + LOOK_REACH_PAD_M));
    let met = ships
        .iter()
        .filter(|other| other.flag != shooter.flag && other.id != shooter.id && other.afloat)
        .filter_map(|other| {
            let mark = other.target();
            let hull = segment_entry(eye, far, &mark.hull, 0.0).map(|share| (share, false));
            let rig = mark.rig.iter().filter_map(|sail| segment_entry(eye, far, sail, 0.0)).map(|share| (share, true));
            let first = hull.into_iter().chain(rig).min_by(|one, other| one.0.total_cmp(&other.0))?;
            Some((first, other, mark.hull.centre))
        })
        .min_by(|one, other| one.0.0.total_cmp(&other.0.0));
    let ((share, on_rig), mark, middle) = met?;
    let met = [0, 1, 2].map(|axis| eye[axis] + (far[axis] - eye[axis]) * share);
    let point = if on_rig && square.shot != Shot::Chain { middle } else { met };
    let (way, fire, from) = (carry_of(&mark.ship), square.dir, &shooter.ship);
    // DFO's own flight time: the way out over 0.97 of the muzzle speed, the ball's speed along the water.
    let flown = libm::hypot(point[0] - from.x, point[1] - from.y) / (square.gun.speed * 0.97).max(1.0);
    let along = (way[0] * fire[0] + way[1] * fire[1]) * flown;
    Some([point[0] + fire[0] * along, point[1] + fire[1] * along, point[2]])
}

/// Where each gun of `shooter`'s lay stops, its ball unscattered and flown by the law every ball flies by, with
/// every other ship where its way will have carried it when it gets there; none for a ball still aloft past its
/// life.
#[must_use]
pub fn ends_of(shooter: &Sighted, lay: &Lay, ships: &[Sighted], waters: &impl Waters, time: f64) -> Vec<Option<Stop>> {
    let carry = carry_of(&shooter.ship);
    let targets: Vec<(Target, [f64; 3])> = ships
        .iter()
        .map(|other| {
            let way = if other.id == shooter.id { [0.0; 3] } else { carry_of(&other.ship) };
            (other.target(), way)
        })
        .collect();
    (0..lay.mouths.len())
        .map(|index| {
            let delay = index as f64 * RIPPLE_S;
            let moved = |block: &Block, way: [f64; 3], seconds: f64| Block {
                centre: [block.centre[0] + way[0] * seconds, block.centre[1] + way[1] * seconds, block.centre[2]],
                ..*block
            };
            let at = |flown: f64| {
                let seconds = delay + flown;
                let place = |(target, way): &(Target, [f64; 3])| {
                    let rig = target.rig.iter().map(|sail| moved(sail, *way, seconds)).collect();
                    Target { hull: moved(&target.hull, *way, seconds), rig, ..target.clone() }
                };
                targets.iter().map(place).collect()
            };
            let ball = aimed(lay, index, carry, 0.0, (shooter.id, shooter.flag));
            stop_of(ball, at, (waters, time + delay, TICK_SECONDS))
        })
        .collect()
}

/// What a lay shows before it is fired: the lay, where each gun's ball stops, each gun's unscattered launch (where
/// its ball leaves, then its velocity), the landing zone's radius at the mean range its balls splash at, how much wider
/// than its gun's own it scatters as long as it has been held (`spread_after`), and whether any would strike a ship.
#[derive(Debug, Clone, PartialEq)]
pub struct Preview {
    pub lay: Lay,
    pub ends: Vec<Option<Stop>>,
    pub launches: Vec<[f64; 6]>,
    pub radius: f64,
    pub spread: f64,
    pub on_target: bool,
}

/// The preview of `shooter`'s look laid with `load` among `ships`, if a side bears, its scatter `spread` times its
/// gun's own.
#[must_use]
pub fn preview(
    shooter: &Sighted,
    load: Shot,
    aim: &Aim,
    ships: &[Sighted],
    (waters, time): (&impl Waters, f64),
    spread: f64,
) -> Option<Preview> {
    let laid = lay_for(shooter, load, aim, ships)?;
    let ends = ends_of(shooter, &laid, ships, waters, time);
    let splashes: Vec<f64> = ends
        .iter()
        .flatten()
        .filter(|stop| stop.water)
        .map(|stop| {
            let (east, south) = (stop.point[0] - laid.centre[0], stop.point[1] - laid.centre[1]);
            (east * east + south * south).sqrt()
        })
        .collect();
    let range = splashes.iter().sum::<f64>() / splashes.len().max(1) as f64;
    // Each gun's ball as it leaves, a ripple after the one before and carried on by its way meanwhile, as `ends_of`
    // flies it: so each arc ends on its own stop.
    let carry = carry_of(&shooter.ship);
    let launches = (0..laid.mouths.len())
        .map(|index| {
            let ball = aimed(&laid, index, carry, 0.0, (shooter.id, shooter.flag));
            [ball.start[0], ball.start[1], ball.start[2], ball.launch[0], ball.launch[1], ball.launch[2]]
        })
        .collect();
    let widened = crate::guns::Gun { yaw_spread_deg: laid.gun.yaw_spread_deg * spread, ..laid.gun };
    let radius = zone_radius(&widened, LARGE_BOAT.skill, range);
    let on_target = ends.iter().flatten().any(|stop| stop.strike.is_some());
    Some(Preview { lay: laid, ends, launches, radius, spread, on_target })
}

impl Fight {
    /// The preview of a player's look as their guns would lay it now (`preview`), the fight's ships as they lie, its
    /// scatter as long as they have held it and as their ship's fitting trims it.
    #[must_use]
    pub fn preview(&self, shooter: ShipId, aim: &Aim, waters: &impl Waters, time: f64) -> Option<Preview> {
        let vessel = self.vessel(shooter)?;
        // As wide as the volley would scatter: as long as it has been held, and as its fitting trims it.
        let trim = self.fitting(shooter).map_or(1.0, |fitted| fitted.trim.scatter);
        let spread = self.spread_of(shooter) * trim;
        preview(&Sighted::of(shooter, vessel), vessel.guns.load, aim, &self.sighted(), (waters, time), spread)
    }

    /// Every ship still in the fight as a lay and a ball see it, by number.
    #[must_use]
    pub fn sighted(&self) -> Vec<Sighted> {
        let in_fight = self.ships.iter().filter(|(_, vessel)| vessel.in_fight());
        in_fight.map(|(id, vessel)| Sighted::of(*id, vessel)).collect()
    }

    /// Every ship still in the fight as a ball meets it, by number.
    pub(crate) fn targets(&self) -> Vec<Target> {
        self.sighted().iter().map(Sighted::target).collect()
    }

    /// The side a player's look lays, as their guns would fire it now; none for a ship not theirs or no side bearing.
    #[must_use]
    pub fn laid(&self, shooter: ShipId, aim: &Aim) -> Option<Lay> {
        let vessel = self.vessel(shooter)?;
        lay_for(&Sighted::of(shooter, vessel), vessel.guns.load, aim, &self.sighted())
    }

    /// Where each gun of a player's lay stops (`ends_of`), the fight's ships as they lie now.
    #[must_use]
    pub fn ends(&self, shooter: ShipId, lay: &Lay, waters: &impl Waters, time: f64) -> Vec<Option<Stop>> {
        let Some(vessel) = self.vessel(shooter) else { return Vec::new() };
        ends_of(&Sighted::of(shooter, vessel), lay, &self.sighted(), waters, time)
    }

    /// A player's lay, or why their guns will not fire it.
    pub(crate) fn fire_order(&self, shooter: ShipId, aim: Option<&Aim>) -> Result<Lay, Refusal> {
        let lay = aim.and_then(|aim| self.laid(shooter, aim)).ok_or(Refusal::NoGuns)?;
        let player = self.vessel(shooter).ok_or(Refusal::NoGuns)?;
        if matches!(player.damage.state, State::Sinking | State::Sunk) {
            return Err(Refusal::Silent);
        }
        if player.guns.braced {
            return Err(Refusal::Braced);
        }
        if !player.guns.ready(lay.side) {
            return Err(Refusal::Reloading { side: lay.side, left: player.guns.left(lay.side) });
        }
        Ok(lay)
    }
}
