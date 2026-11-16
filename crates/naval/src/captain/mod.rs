//! A captain who fights, as DFO's: whom she takes on (bold, or wary of a stronger ship), when she runs, chases,
//! gives up or leaves a wreck, the course that brings her broadside to bear or keeps her station, and her helm. She
//! sails the Sloop under the same helm as the player (`sailing::ship`): DFO's commanded swing becomes a share of her
//! rudder, and its sail share the rung of her ladder whose way is nearest.

pub mod aim;
pub mod course;
mod engage;
pub mod land;
pub mod odds;

use crate::arms::{Arms, Build, Side};
use crate::damage::{Damage, State};
use crate::gunnery::{Guns, lay};
use crate::random::Mulberry32;
use aim::{Aboard, Battery, Mark, RunOut, captain_guns, fire_window};
use course::{DEG, distance, flee_course, heading_to, intercept, lead_point, traffic_course, velocity_of, wrap};
use land::{Avoid, NAV_EVERY_S, avoid_land, course_clear};
use odds::{Power, odds};
use sailing::Hull;
use sailing::helm::{HANDLING, PACE, canvas, point_of_sail, sea_wind, steerage};
use sailing::pose::{Pose, frame};
use sailing::ship::{Helm, SAILS_SET, Ship, length, off_run_deg};

/// Who she sees (metres) and keeps on fighting out to this many times as far; whom she runs from within.
pub const ENGAGE_RANGE: f64 = 750.0;
pub const DISENGAGE: f64 = 1.35;
pub const FLEE_RANGE: f64 = 320.0;
/// A blow makes her hostile this long; one she gives up on is spared this long (seconds).
pub const PROVOKED_S: f64 = 300.0;
pub const SPARE_S: f64 = 300.0;
/// A chase: marked every few seconds, given up after this long without closing by this share.
pub const CHASE_MARK_S: f64 = 2.0;
pub const CHASE_GIVE_UP_S: f64 = 150.0;
pub const CHASE_GAIN: f64 = 0.1;
/// Past this many of her fighting ranges she closes on an intercept.
pub const CLOSE_FROM: f64 = 1.8;
/// A wrecked player she does not board is left after this long.
pub const WRECK_SPARE_S: f64 = 30.0;
/// A pirate runs under this share of her hull; a wary one takes a prize under this share, or at these odds.
pub const PIRATE_RUNS_AT: f64 = 0.3;
pub const GRAPPLE_HULL: f64 = 0.35;
pub const WARY_ODDS: f64 = 1.25;
/// The share of pirates who are bold, by their seed's own draw.
pub const BOLD_SHARE: f64 = 0.25;
const TEMPER_SALT: u32 = 0x7e3a_9e1d;
/// Her mark's velocity is smoothed over this; her wanted heading's rate over this, reset by a jump of this many
/// degrees; her helm answers within four of these (the Large Boat's, seconds).
pub const TARGET_VEL_TAU: f64 = 1.0;
pub const TRACK_TAU: f64 = 0.5;
pub const TRACK_JUMP_DEG: f64 = 20.0;
pub const TURN_TAU: f64 = 0.6;
/// Presenting her broadside: within this share of her reach and over this share of her range, bent off the beam by
/// up to this many degrees to open or close it.
pub const PRESENT_WITHIN: f64 = 0.92;
pub const POINT_BLANK: f64 = 0.4;
pub const RANGE_BEND_DEG: f64 = 30.0;
/// A stern chase: a quarry running at over this share of her pace, she abaft its beam by this many degrees; she
/// sheers out within this many of her ranges, closing at this share of her pace over its own.
pub const CHASE_AWAY: f64 = 0.5;
pub const ABAFT_DEG: f64 = 110.0;
pub const CHASE_SHEER: f64 = 1.4;
pub const CHASE_MARGIN: f64 = 0.3;
/// Keeping station: no less sail than this, closing on a lead drawn ahead by this share a second.
pub const PRESENT_SAILS: f64 = 0.6;
pub const PRESENT_GAIN: f64 = 0.08;
/// A side's cost: a second a degree the wind forces her off it, this long if it cannot bear, and this much cheaper
/// another must be to take her off the one she holds.
pub const BEAR_COST_S: f64 = 1.0;
pub const NO_BEAR_S: f64 = 90.0;
pub const SIDE_HOLD_S: f64 = 8.0;
/// Boxed in by the land, she shortens sail to this.
pub const BOXED_SAILS: f64 = 0.3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Temper {
    Bold,
    Wary,
}

/// A pirate's temper by her seed.
#[must_use]
pub fn temper_of(seed: u32) -> Temper {
    if Mulberry32::new(seed ^ TEMPER_SALT).draw() < BOLD_SHARE { Temper::Bold } else { Temper::Wary }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Cruise,
    Engage,
    Flee,
    Struck,
    Sinking,
}

/// The side she presents, when she chose it, and whether she lays her lead abeam with it.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Present {
    side: Side,
    at: f64,
    lays: bool,
}

/// A chase's marks (when, how far) and when she last closed.
#[derive(Debug, Clone, PartialEq)]
struct Chase {
    since: f64,
    marks: Vec<[f64; 2]>,
}

/// The player's Sloop as she sees her.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Sighting {
    pub ship: Ship,
    pub level: f64,
    pub hull_share: f64,
    pub wrecked: bool,
    pub power: Power,
}

/// Her own ship as she works it, in the wind.
#[derive(Debug, Clone, Copy)]
pub struct Her<'a> {
    pub ship: &'a Ship,
    pub pose: &'a Pose,
    pub damage: &'a Damage,
    pub guns: &'a Guns,
    pub arms: &'a Arms,
    pub hull: &'a Hull,
    pub wind: [f64; 2],
}

/// What her plan asks: a heading, a share of sail, and whether her helm leads its turn.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Plan {
    want: f64,
    sails: f64,
    track: bool,
}

/// A captain: her class, temper, seed and the course she cruises, her standing with the player, and her memory of
/// the fight.
#[derive(Debug, Clone, PartialEq)]
pub struct Captain {
    pub build: Build,
    pub temper: Temper,
    pub seed: u32,
    pub cruise: f64,
    pub mode: Mode,
    pub sails: f64,
    pub run: RunOut,
    pub dead_zone: f64,
    clock: f64,
    provoked_at: f64,
    spared_until: f64,
    target: bool,
    chase: Option<Chase>,
    wreck_since: Option<f64>,
    enemy_vel: Option<[f64; 2]>,
    want_prev: Option<f64>,
    want_rate: f64,
    present: Option<Present>,
    avoid: Avoid,
}

/// Her best way under sail with the wind on her quarter, left her by her canvas: the pace she reckons by.
#[must_use]
pub fn pace(hull: &Hull, wind: [f64; 2], way_share: f64) -> f64 {
    canvas(hull) * sea_wind(length(wind[0], wind[1])) * PACE * HANDLING.move_speed_sail * way_share
}

/// The most she swings at her way (degrees a second): her steerage under sail, her oars' swing on them.
#[must_use]
pub fn swing_rate(ship: &Ship, hull: &Hull) -> f64 {
    if ship.rung == SAILS_SET { steerage(length(ship.ahead, ship.abeam) / hull.gain) } else { HANDLING.turn_speed_oar }
}

impl Captain {
    /// A captain of `build` with her seed's temper, cruising on `cruise`, her dead zone against a ship armed as hers.
    #[must_use]
    pub fn new(build: Build, seed: u32, cruise: f64, arms: &Arms) -> Self {
        Self {
            build,
            temper: temper_of(seed),
            seed,
            cruise,
            mode: Mode::Cruise,
            sails: 1.0,
            run: RunOut::new(),
            dead_zone: aim::dead_zone(arms),
            clock: 0.0,
            provoked_at: f64::NEG_INFINITY,
            spared_until: f64::NEG_INFINITY,
            target: false,
            chase: None,
            wreck_since: None,
            enemy_vel: None,
            want_prev: None,
            want_rate: 0.0,
            present: None,
            avoid: Avoid::new(),
        }
    }

    /// Whether she has the player as her enemy.
    #[must_use]
    pub fn hostile(&self) -> bool {
        self.target
    }

    /// Every number she holds, in a fixed order.
    #[must_use]
    pub fn numbers(&self) -> Vec<f64> {
        let flag = |on: bool| f64::from(u8::from(on));
        let mode = [Mode::Cruise, Mode::Engage, Mode::Flee, Mode::Struck, Mode::Sinking]
            .iter()
            .position(|mode| *mode == self.mode);
        let mut numbers = vec![
            mode.unwrap_or(0) as f64,
            flag(self.temper == Temper::Bold),
            f64::from(self.seed),
            self.cruise,
            self.sails,
            self.dead_zone,
            self.clock,
            self.provoked_at,
            self.spared_until,
            flag(self.target),
            self.wreck_since.unwrap_or(-1.0),
            self.want_prev.unwrap_or(-9.0),
            self.want_rate,
        ];
        numbers.extend(self.enemy_vel.unwrap_or([0.0; 2]));
        numbers.extend(self.run.numbers());
        numbers.extend(self.avoid.numbers());
        if let Some(present) = self.present {
            numbers.extend([present.side.sign(), present.at, flag(present.lays)]);
        }
        if let Some(chase) = &self.chase {
            numbers.push(chase.since);
            numbers.extend(chase.marks.iter().flatten());
        }
        numbers
    }

    /// Whether she would take the player on, sparing aside: afloat, and provoked or of a mind to take him. Her hands
    /// hold off mending his wreck while she lies near.
    #[must_use]
    pub fn would_take(&self, her: &Her, enemy: &Sighting) -> bool {
        her.damage.fighting() && (self.provoked_at > self.clock - PROVOKED_S || self.takes_prize(her, enemy))
    }

    /// The player struck her: she is hostile to him, whatever her temper, for a while.
    pub fn provoke(&mut self) {
        self.provoked_at = self.clock;
    }

    /// Whether she takes the player on: always if bold; if wary, only a wreck, a hull nearly gone, or one she
    /// outguns well.
    fn takes_prize(&self, her: &Her, enemy: &Sighting) -> bool {
        if self.temper == Temper::Bold || enemy.wrecked || enemy.hull_share < GRAPPLE_HULL {
            return true;
        }
        odds(&self.power(her), &enemy.power, her.arms) >= WARY_ODDS
    }

    fn power(&self, her: &Her) -> Power {
        Power::captain(&self.build, her.damage.hull_share(), her.damage.crew_share())
    }

    /// A chase marked: she gives it up, sparing her quarry, after `CHASE_GIVE_UP_S` without closing while still out
    /// of the fight's range.
    fn chase_on(&mut self, apart: f64) -> bool {
        let clock = self.clock;
        let chase = self.chase.get_or_insert_with(|| Chase { since: clock, marks: Vec::new() });
        if chase.marks.last().is_none_or(|mark| clock - mark[0] >= CHASE_MARK_S) {
            chase.marks.push([clock, apart]);
        }
        while chase.marks.len() > 1 && chase.marks.first().is_some_and(|mark| clock - mark[0] > CHASE_GIVE_UP_S) {
            chase.marks.remove(0);
        }
        let far = chase.marks.iter().fold(apart, |most, mark| most.max(mark[1]));
        let fighting_range = self.build.range_m * CLOSE_FROM;
        if apart < far * (1.0 - CHASE_GAIN) || apart <= fighting_range {
            chase.since = clock;
        }
        if clock - chase.since > CHASE_GIVE_UP_S && apart > fighting_range {
            self.spared_until = clock + SPARE_S;
            self.chase = None;
            return false;
        }
        true
    }

    /// A wrecked player she will not board is left, and spared, after `WRECK_SPARE_S`.
    fn wreck_on(&mut self, wrecked: bool) -> bool {
        if !wrecked {
            self.wreck_since = None;
            return true;
        }
        let since = *self.wreck_since.get_or_insert(self.clock);
        if self.clock - since < WRECK_SPARE_S {
            return true;
        }
        self.spared_until = self.clock + SPARE_S;
        self.wreck_since = None;
        false
    }

    /// The rate her wanted heading turns at, smoothed; a jump resets it.
    fn track_rate(&mut self, want: f64, seconds: f64) -> f64 {
        let Some(before) = self.want_prev.filter(|_| seconds > 0.0) else {
            self.want_prev = Some(want);
            self.want_rate = 0.0;
            return 0.0;
        };
        self.want_prev = Some(want);
        let step = wrap(want - before);
        if step.abs() > TRACK_JUMP_DEG * DEG {
            self.want_rate = 0.0;
            return 0.0;
        }
        self.want_rate += (step / seconds - self.want_rate) * (1.0 - libm::exp(-seconds / TRACK_TAU));
        self.want_rate
    }

    /// Her helm for a step of `seconds` against the player, over water `is_water` says she can float in.
    pub fn steer(&mut self, her: &Her, enemy: &Sighting, seconds: f64, is_water: &impl Fn(f64, f64) -> bool) -> Helm {
        self.clock += seconds;
        if !her.damage.fighting() {
            self.run.clear();
            (self.present, self.chase, self.target) = (None, None, false);
            self.mode =
                if matches!(her.damage.state, State::Sinking | State::Sunk) { Mode::Sinking } else { Mode::Struck };
            self.sails = (self.sails - 0.5 * seconds).max(0.0);
            return self.helm(her, her.ship.heading, 0.0);
        }
        let (me, them) = ([her.ship.x, her.ship.y], [enemy.ship.x, enemy.ship.y]);
        let apart = distance(me, them);
        let provoked = self.provoked_at > self.clock - PROVOKED_S;
        let sight = ENGAGE_RANGE * if self.mode == Mode::Engage { DISENGAGE } else { 1.0 };
        let hostile = provoked || self.takes_prize(her, enemy);
        let mut seen = apart < sight && hostile && self.spared_until <= self.clock;
        seen = seen && self.chase_on(apart);
        if !seen {
            (self.chase, self.wreck_since) = (None, None);
        }
        seen = seen && self.wreck_on(enemy.wrecked);
        let threat = apart < FLEE_RANGE && provoked;
        let outgunned = threat && odds(&enemy.power, &self.power(her), her.arms) > 1.0;
        let runs = (her.damage.hull_share() < PIRATE_RUNS_AT && (threat || seen))
            || (self.temper == Temper::Wary && outgunned);
        self.target = seen;
        let plan = if runs {
            self.mode = Mode::Flee;
            Plan { want: flee_course(me, them, her.wind), sails: 1.0, track: false }
        } else if seen {
            self.mode = Mode::Engage;
            self.follow(enemy, seconds);
            self.engage(her, enemy, apart, is_water)
        } else {
            self.mode = Mode::Cruise;
            Plan { want: self.cruise, sails: 1.0, track: false }
        };
        // Both hulls' pass reaches: half of half her beam and half her length, each.
        let [low, high] = her.arms.hull;
        let passing = 2.0 * 0.5 * ((high[1] - low[1]) / 2.0 + (high[0] - low[0]) / 2.0);
        let traffic = (me, her.ship.heading, velocity_of(her.ship));
        let want = traffic_course(traffic, plan.want, (them, velocity_of(&enemy.ship)), passing);
        let look = self.lookout(her);
        let want = avoid_land(&mut self.avoid, (self.clock, me, her.ship.heading), want, &look, is_water);
        let asked = if self.avoid.boxed() { plan.sails.min(BOXED_SAILS) } else { plan.sails };
        self.sails = (self.sails + (asked - self.sails).clamp(-0.5 * seconds, 0.4 * seconds)).clamp(0.0, 1.0);
        let lead = if plan.track {
            self.track_rate(want, seconds)
        } else {
            (self.want_prev, self.want_rate) = (None, 0.0);
            0.0
        };
        self.helm(her, want, lead)
    }

    /// Her mark's velocity, smoothed.
    fn follow(&mut self, enemy: &Sighting, seconds: f64) {
        let now = velocity_of(&enemy.ship);
        let smoothed = self.enemy_vel.get_or_insert(now);
        let share = 1.0 - libm::exp(-seconds / TARGET_VEL_TAU);
        *smoothed = [smoothed[0] + (now[0] - smoothed[0]) * share, smoothed[1] + (now[1] - smoothed[1]) * share];
    }

    fn lookout(&self, her: &Her) -> land::Lookout {
        let own = pace(her.hull, her.wind, her.damage.way_share());
        let length = her.arms.hull[1][0] - her.arms.hull[0][0];
        // Her turning circle at her own pace: a ship lying still is about to gather way.
        let paced = Ship { rung: SAILS_SET, ahead: own, abeam: 0.0, ..*her.ship };
        let radius = (length * 0.5).max(own / (swing_rate(&paced, her.hull) * DEG).max(1e-6));
        let way = length_of(her.ship);
        land::lookout(her.arms.hull[1][0], (her.arms.hull[1][1] - her.arms.hull[0][1]) / 2.0, way, radius)
    }

    /// Her rudder and her rung for `want`, leading a turning want by `lead` (radians a second): DFO's commanded swing
    /// as a share of her own, and the rung whose way is nearest her share of sail.
    fn helm(&mut self, her: &Her, want: f64, lead: f64) -> Helm {
        let most = swing_rate(her.ship, her.hull) * DEG;
        let error = self.avoid.helm_error(wrap(want - her.ship.heading));
        let command = (error / (4.0 * TURN_TAU) + lead).clamp(-most, most);
        let (forward, _) = frame(her.ship.heading);
        let sail_way = pace(her.hull, her.wind, her.damage.way_share()) * point_of_sail(off_run_deg(forward, her.wind));
        let asked = self.sails * pace(her.hull, her.wind, her.damage.way_share());
        let ways = [(0_i8, 0.0), (1, HANDLING.move_speed_oar), (SAILS_SET, sail_way)];
        let rung =
            ways.into_iter()
                .filter(|(rung, _)| *rung != SAILS_SET || her.damage.sail > 0.0)
                .fold((0_i8, f64::INFINITY), |best, (rung, way)| {
                    if (way - asked).abs() <= best.1 { (rung, (way - asked).abs()) } else { best }
                })
                .0;
        Helm {
            steer: if most > 0.0 { command / most } else { 0.0 },
            crab: false,
            climb: (rung - her.ship.rung).signum(),
        }
    }

    /// Her guns after her step: against the player while she has him as her enemy and he is not a wreck.
    pub fn aim(&mut self, her: &Her, enemy: &Sighting, draws: &mut Mulberry32) -> Battery {
        if !self.target || enemy.wrecked || !her.damage.fighting() {
            self.run.clear();
            return Battery { run_out: None, fire: None };
        }
        let mark = Mark {
            place: [enemy.ship.x, enemy.ship.y],
            heading: Some(enemy.ship.heading),
            velocity: velocity_of(&enemy.ship),
            smoothed: self.enemy_vel.unwrap_or_else(|| velocity_of(&enemy.ship)),
            level: enemy.level,
        };
        let aboard = Aboard { ship: her.ship, pose: her.pose, arms: her.arms, guns: her.guns, build: &self.build };
        captain_guns(&mut self.run, &aboard, &mark, self.clock, draws)
    }
}

fn length_of(ship: &Ship) -> f64 {
    length(ship.ahead, ship.abeam)
}

#[cfg(test)]
#[path = "captain_tests.rs"]
mod tests;
