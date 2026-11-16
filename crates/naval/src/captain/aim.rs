//! A captain's guns, as DFO's: each broadside laid on where her mark will be when its balls arrive, run out as a
//! warning (the tell) when it is loaded, in reach, near her beam, bearing soon and its lay would strike, and fired no
//! sooner than the tell's 1.3 s, within her gunners' window, long or short by their error. A side run out too long
//! unfired, or that loses its mark, is run in.

use super::course::{DEG, distance, heading_to, lead_point, velocity_of, wrap};
use crate::arms::{Arms, Build, Side};
use crate::ballistics::{GRAVITY, launch_velocity};
use crate::gunnery::{Guns, Lay, lay, lay_on};
use crate::guns::SWIVEL;
use crate::random::Mulberry32;
use sailing::pose::Pose;
use sailing::ship::Ship;
use std::f64::consts::PI;

/// She lays on her mark this share of its freeboard up.
pub const AIM_FREEBOARD: f64 = 0.4;
/// The tell: seconds a side stands run out before it fires; within this many degrees of her beam it may run out,
/// past this many it runs in; unfired this long after the tell it runs in; and once run in it waits this long.
pub const RUN_OUT_S: f64 = 1.3;
pub const RUN_OUT_DEG: f64 = 30.0;
pub const RUN_IN_DEG: f64 = 45.0;
pub const RUN_OUT_WAIT_S: f64 = 2.5;
pub const RUN_IN_S: f64 = 2.0;
/// She runs out within this share of her reach, and fires within this many degrees at the most.
pub const RUN_OUT_REACH: f64 = 0.92;
pub const BEAR_DEG: f64 = 13.0;
/// The miss her gunners allow, as a share of the mark's length across her line of fire, and its skill's part.
pub const FIRE_EXTENT_K: f64 = 0.35;
pub const FIRE_EXTENT_SKILL: f64 = 0.65;
/// Her crew's lay is long or short by up to half this share of the range, by their want of skill.
pub const LAY_ERR: f64 = 0.9;

/// Her mark as her guns see it: where it is, its heading if it has way, its velocity, and the water under it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Mark {
    pub place: [f64; 2],
    pub heading: Option<f64>,
    pub velocity: [f64; 2],
    pub level: f64,
}

/// Her ship as her guns work it.
#[derive(Debug, Clone, Copy)]
pub struct Aboard<'a> {
    pub ship: &'a Ship,
    pub pose: &'a Pose,
    pub arms: &'a Arms,
    pub guns: &'a Guns,
    pub build: &'a Build,
}

/// The degrees off her beam she fires within at `at`: the miss her gunners allow on the mark's length across her
/// line of fire (all of it, end-on, over a mark with no way), never under her scatter nor over `BEAR_DEG`.
#[must_use]
pub fn fire_window(me: [f64; 2], at: [f64; 2], mark_heading: Option<f64>, target: &Arms, skill: f64) -> f64 {
    let [low, high] = target.hull;
    let (half_length, half_beam) = ((high[0] - low[0]) / 2.0, (high[1] - low[1]) / 2.0);
    let line = heading_to(me, at);
    let extent = mark_heading.map_or((half_length + half_beam) * 2.0 / PI, |heading| {
        half_length * libm::sin(heading - line).abs() + half_beam * libm::cos(heading - line).abs()
    });
    let miss = extent * (FIRE_EXTENT_K + FIRE_EXTENT_SKILL * (1.0 - skill));
    let spread = SWIVEL.yaw_spread_deg * (1.5 - skill).clamp(0.4, 1.5);
    let range = distance(me, at).max(1.0);
    BEAR_DEG.min(spread.max(libm::asin((miss / range).min(1.0)) / DEG))
}

/// Seconds until the bearing of `lead`, moving at `rel` to her, comes within `window` of `want_deg` off her bow;
/// never while it opens or stands.
#[must_use]
pub fn bears_within(ship: &Ship, lead: [f64; 2], rel: [f64; 2], want_deg: f64, window: f64) -> f64 {
    let (east, south) = (lead[0] - ship.x, lead[1] - ship.y);
    let square = east * east + south * south;
    if square < 1.0 {
        return 0.0;
    }
    let error = wrap(heading_to([ship.x, ship.y], lead) - ship.heading - want_deg * DEG) / DEG;
    if error.abs() <= window {
        return 0.0;
    }
    let rate = ((east * rel[1] - south * rel[0]) / square - ship.turn * DEG) / DEG;
    if rate.abs() < 1e-6 || rate.signum() == error.signum() {
        return f64::INFINITY;
    }
    (error.abs() - window) / rate.abs()
}

/// Whether the lay's middle gun, unscattered, passes within `band` (heights, a hand under its foot allowed) where it
/// comes abreast of `at`.
#[must_use]
pub fn lay_passes(lay: &Lay, carry: [f64; 3], at: [f64; 2], band: [f64; 2]) -> bool {
    let start = lay.mouths[1];
    let launch = launch_velocity(lay.dir, lay.elevation, lay.gun.speed, carry);
    let along = launch[0] * lay.dir[0] + launch[1] * lay.dir[1];
    let out = (at[0] - start[0]) * lay.dir[0] + (at[1] - start[1]) * lay.dir[1];
    if along <= 1e-6 || out <= 0.0 {
        return false;
    }
    let time = out / along;
    let height = start[2] + launch[2] * time - 0.5 * GRAVITY * time * time;
    (band[0] - 0.25..=band[1]).contains(&height)
}

/// The nearest range, in whole metres, at which her broadside laid on a ship like hers passes through her: inside it
/// her carriage cannot depress onto her.
#[must_use]
pub fn dead_zone(arms: &Arms) -> f64 {
    let ship = Ship { x: 0.0, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
    let pose = Pose { heave: 0.0, pitch: 0.0, roll: 0.0, aground: false };
    let top = arms.hull[1][2];
    let reach = lay(&ship, &pose, arms, Side::Starboard, crate::guns::Shot::Round, 0.0, None).reach;
    let mut range = 1.0;
    while range < reach {
        let laid =
            lay_on(&ship, &pose, arms, Side::Starboard, crate::guns::Shot::Round, [range, 0.0, top * AIM_FREEBOARD]);
        if lay_passes(&laid, [0.0; 3], [range, 0.0], [0.0, top]) {
            return range;
        }
        range += 1.0;
    }
    reach
}

/// Each side's tell: when it was run out, and when last run in.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RunOut {
    out: [Option<f64>; 2],
    run_in: [f64; 2],
}

impl Default for RunOut {
    fn default() -> Self {
        Self::new()
    }
}

impl RunOut {
    #[must_use]
    pub fn new() -> Self {
        Self { out: [None; 2], run_in: [f64::NEG_INFINITY; 2] }
    }

    /// When `side` was run out, if it stands run out.
    #[must_use]
    pub fn out(&self, side: Side) -> Option<f64> {
        self.out[side.index()]
    }

    /// Both sides run in: a ship that no longer fights.
    pub fn clear(&mut self) {
        self.out = [None; 2];
    }
}

/// What her guns did this step: a side run out (the tell), and a side fired, laid.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Battery {
    pub run_out: Option<Side>,
    pub fire: Option<Lay>,
}

/// Her broadsides at `clock` against her mark. The lay's error is drawn from `draws`; the caller fires the lay.
pub fn captain_guns(run: &mut RunOut, at: &Aboard, mark: &Mark, clock: f64, draws: &mut Mulberry32) -> Battery {
    let mut battery = Battery { run_out: None, fire: None };
    let ship = at.ship;
    let me = [ship.x, ship.y];
    let own = velocity_of(ship);
    let (rel, carry) = ([mark.velocity[0] - own[0], mark.velocity[1] - own[1]], [own[0], own[1], 0.0]);
    let top = at.arms.hull[1][2];
    let band = [mark.level, mark.level + top];
    let skill = at.build.skill;
    for (side, want) in [(Side::Starboard, 90.0), (Side::Port, -90.0)] {
        let gun = at.guns.gun();
        let lead = lead_point(me, mark.place, rel, gun.speed);
        let range = distance(me, lead);
        let error = wrap(heading_to(me, lead) - ship.heading - want * DEG).abs() / DEG;
        let loaded = at.guns.ready(side);
        let reach = lay(ship, at.pose, at.arms, side, at.guns.load, 0.0, None).reach;
        let lay_k = |share: f64| {
            let target = [
                me[0] + (lead[0] - me[0]) * share,
                me[1] + (lead[1] - me[1]) * share,
                mark.level + top * AIM_FREEBOARD,
            ];
            lay_on(ship, at.pose, at.arms, side, at.guns.load, target)
        };
        let strikes = || lay_passes(&lay_k(1.0), carry, lead, band);
        let window = fire_window(me, lead, mark.heading, at.arms, skill);
        let Some(since) = run.out[side.index()] else {
            if run.run_in[side.index()] > clock - RUN_IN_S {
                continue;
            }
            let soon = error <= window || bears_within(ship, lead, rel, want, window) <= RUN_OUT_S;
            if loaded && range <= reach * RUN_OUT_REACH && error <= RUN_OUT_DEG && soon && strikes() {
                run.out[side.index()] = Some(clock);
                battery.run_out = Some(side);
            }
            continue;
        };
        if !loaded || range > reach * 1.02 || error > RUN_IN_DEG || clock - since > RUN_OUT_S + RUN_OUT_WAIT_S {
            run.out[side.index()] = None;
            run.run_in[side.index()] = clock;
            continue;
        }
        if clock - since < RUN_OUT_S || error > window || !strikes() {
            continue;
        }
        battery.fire = Some(lay_k(1.0 + (draws.draw() - 0.5) * LAY_ERR * (1.0 - skill)));
        run.out[side.index()] = None;
    }
    battery
}

#[cfg(test)]
#[path = "aim_tests.rs"]
mod tests;
