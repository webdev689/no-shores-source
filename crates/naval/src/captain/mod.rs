//! A captain who fights, as DFO's: whom she takes on (bold, or wary of a stronger ship), when she runs, chases, gives
//! up or leaves a wreck, the course that brings her broadside to bear or keeps her station, and her helm. She sails her
//! rank's hull under the same helm as the player (`sailing::ship`): DFO's commanded swing becomes a share of her
//! rudder, and its sail share the rung of her ladder whose way is nearest.

pub mod aim;
pub mod course;
mod engage;
pub mod land;
pub mod odds;

use crate::arms::{Arms, Build, Side, arms_of};
use crate::damage::{Damage, State};
use crate::gunnery::{Guns, lay};
use crate::random::Mulberry32;
use crate::ranks::Commission;
use crate::shots::ShipId;
use aim::{Aboard, Battery, Mark, RunOut, captain_guns, fire_window};
use course::{
    DEG, Traffic, distance, flee_course, heading_to, intercept, lead_point, pass_reach, traffic_course, velocity_of,
    wrap,
};
use land::{Avoid, NAV_EVERY_S, avoid_land, course_clear};
use odds::{Power, odds};
use sailing::helm::{HANDLING, PACE, canvas_drive, point_of_sail, sea_wind, steerage};
use sailing::pose::{Pose, frame};
use sailing::ship::{Helm, SAILS_SET, Ship, length, off_run_deg};
use sailing::{Hull, HullKind};
use std::collections::BTreeMap;

/// Who she sees (metres) and keeps on fighting out to this many times as far; whom she runs from within.
pub const ENGAGE_RANGE: f64 = 750.0;
pub const DISENGAGE: f64 = 1.35;
pub const FLEE_RANGE: f64 = 320.0;
/// The ship she fights is reckoned this much nearer than it is, so she holds it against one a little nearer.
pub const HELD_NEARER: f64 = 0.8;
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
/// A captain of an ordinary rank runs under this share of her hull (`ranks::SCALES`); a wary one takes a prize
/// under this share, or at these odds.
pub const PIRATE_RUNS_AT: f64 = 0.3;
pub const GRAPPLE_HULL: f64 = 0.35;

/// Whether a wary captain of `commission`, sound, falls on a player's Sloop met at sea with `hull_share` of her hull
/// left, by DFO's `takesPrize` (navalAI.js): one holed under `GRAPPLE_HULL`, or one she outguns `WARY_ODDS` to one by
/// their fighting powers.
#[must_use]
pub fn wary_takes(commission: Commission, hull_share: f64) -> bool {
    if hull_share < GRAPPLE_HULL {
        return true;
    }
    let arms = arms_of(commission.hull());
    let her = Captain::new(commission, 0, 0.0, arms);
    let prize = Power::player(&crate::arms::LARGE_BOAT, hull_share);
    odds(&her.power(&commission.damage()), &prize, [arms, arms_of(HullKind::Sloop)]) >= WARY_ODDS
}
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
/// How much cheaper, in seconds, another side must be to take her off the one she holds.
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

/// A captain's temper: bold if her rank makes her so, else as her seed says.
#[must_use]
pub fn temper_for(commission: Commission, seed: u32) -> Temper {
    if commission.rank.scale().always_bold { Temper::Bold } else { temper_of(seed) }
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

/// A ship she may fight as she sees her, a player's or another faction's: her number, her hull, where she is and how
/// she lies, her hurts and her power.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Sighting {
    pub id: ShipId,
    pub hull: HullKind,
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

/// A captain: her commission (her faction and rank) and the class it gives her, her temper, seed and the course she
/// cruises, her standing with each ship she may fight (who struck her, whom she spares, whom she fights), and her
/// memory of the ship she marks.
#[derive(Debug, Clone, PartialEq)]
pub struct Captain {
    pub commission: Commission,
    pub build: Build,
    pub temper: Temper,
    pub seed: u32,
    pub cruise: f64,
    pub mode: Mode,
    pub sails: f64,
    pub run: RunOut,
    pub dead_zone: f64,
    clock: f64,
    provoked: BTreeMap<ShipId, f64>,
    spared: BTreeMap<ShipId, f64>,
    target: Option<ShipId>,
    /// The ship her chase, her wreck's watch, her mark's velocity and her side presented are about.
    marked: Option<ShipId>,
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
    canvas_drive(hull) * sea_wind(length(wind[0], wind[1])) * PACE * HANDLING.move_speed_sail * way_share
}

/// The most she swings at her way (degrees a second): her steerage under sail, her oars' swing on them.
#[must_use]
pub fn swing_rate(ship: &Ship, hull: &Hull) -> f64 {
    if ship.rung == SAILS_SET { steerage(length(ship.ahead, ship.abeam) / hull.gain) } else { HANDLING.turn_speed_oar }
}

impl Captain {
    /// A captain of `commission` with her temper (`temper_for`), cruising on `cruise`, her dead zone against a ship
    /// armed as hers.
    #[must_use]
    pub fn new(commission: Commission, seed: u32, cruise: f64, arms: &Arms) -> Self {
        Self {
            commission,
            build: commission.build(),
            temper: temper_for(commission, seed),
            seed,
            cruise,
            mode: Mode::Cruise,
            sails: 1.0,
            run: RunOut::new(),
            dead_zone: aim::dead_zone(arms),
            clock: 0.0,
            provoked: BTreeMap::new(),
            spared: BTreeMap::new(),
            target: None,
            marked: None,
            chase: None,
            wreck_since: None,
            enemy_vel: None,
            want_prev: None,
            want_rate: 0.0,
            present: None,
            avoid: Avoid::new(),
        }
    }

    /// The ship she has as her enemy, if any.
    #[must_use]
    pub fn target(&self) -> Option<ShipId> {
        self.target
    }

    /// Whether she has this ship as her enemy.
    #[must_use]
    pub fn hostile_to(&self, ship: ShipId) -> bool {
        self.target == Some(ship)
    }

    /// Whether this ship struck her lately.
    fn provoked_by(&self, ship: ShipId) -> bool {
        self.provoked.get(&ship).is_some_and(|at| *at > self.clock - PROVOKED_S)
    }

    /// Whether she spares this ship for now.
    fn spares(&self, ship: ShipId) -> bool {
        self.spared.get(&ship).is_some_and(|until| *until > self.clock)
    }

    /// A ship that has left the fight: she forgets it.
    pub fn forget(&mut self, ship: ShipId) {
        self.provoked.remove(&ship);
        self.spared.remove(&ship);
        if self.target == Some(ship) {
            self.target = None;
        }
    }

    /// Every number she holds, in a fixed order.
    #[must_use]
    pub fn numbers(&self) -> Vec<f64> {
        let flag = |on: bool| f64::from(u8::from(on));
        let mode = [Mode::Cruise, Mode::Engage, Mode::Flee, Mode::Struck, Mode::Sinking]
            .iter()
            .position(|mode| *mode == self.mode);
        let ship = |ship: Option<ShipId>| ship.map_or(-1.0, f64::from);
        let mut numbers = vec![
            f64::from(self.commission.faction),
            f64::from(self.commission.rank.number()),
            mode.unwrap_or(0) as f64,
            flag(self.temper == Temper::Bold),
            f64::from(self.seed),
            self.cruise,
            self.sails,
            self.dead_zone,
            self.clock,
            ship(self.target),
            ship(self.marked),
            self.wreck_since.unwrap_or(-1.0),
            self.want_prev.unwrap_or(-9.0),
            self.want_rate,
        ];
        for standing in [&self.provoked, &self.spared] {
            numbers.push(standing.len() as f64);
            numbers.extend(standing.iter().flat_map(|(ship, at)| [f64::from(*ship), *at]));
        }
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

    /// Whether she would take this ship on, sparing aside: afloat, and provoked or of a mind to take her. Her hands
    /// hold off mending her wreck while she lies near.
    #[must_use]
    pub fn would_take(&self, her: &Her, enemy: &Sighting) -> bool {
        her.damage.fighting() && (self.provoked_by(enemy.id) || self.takes_prize(her, enemy))
    }

    /// A ship struck her: she is hostile to it, whatever her temper, for a while.
    pub fn provoke(&mut self, by: ShipId) {
        self.provoked.insert(by, self.clock);
    }

    /// Whether she takes a ship on: always if bold; if wary, only a wreck, a hull nearly gone, or one she outguns
    /// well.
    fn takes_prize(&self, her: &Her, enemy: &Sighting) -> bool {
        if self.temper == Temper::Bold || enemy.wrecked || enemy.hull_share < GRAPPLE_HULL {
            return true;
        }
        odds(&self.power(her.damage), &enemy.power, [her.arms, arms_of(enemy.hull)]) >= WARY_ODDS
    }

    /// The share of her way her canvas gives her: what her hurts leave it, by her rank's way.
    fn way_share(&self, her: &Her) -> f64 {
        her.damage.way_share() * self.commission.rank.scale().way
    }

    /// Her fighting power as her hurts leave it: her hull and her strike as her rank sets them, and her guns' harm
    /// and reload as her rank paces them.
    #[must_use]
    pub fn power(&self, damage: &Damage) -> Power {
        let scale = self.commission.rank.scale();
        Power {
            struck_at: damage.struck_at,
            might: scale.might,
            reload: scale.reload,
            ..Power::captain(&self.build, damage.hull_share(), damage.crew_share())
        }
    }

    /// A chase marked: she gives it up, sparing her quarry, after `CHASE_GIVE_UP_S` without closing while still out
    /// of the fight's range.
    fn chase_on(&mut self, apart: f64, quarry: ShipId) -> bool {
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
            self.spared.insert(quarry, clock + SPARE_S);
            self.chase = None;
            return false;
        }
        true
    }

    /// A wreck she will not board is left, and spared, after `WRECK_SPARE_S`.
    fn wreck_on(&mut self, wrecked: bool, wreck: ShipId) -> bool {
        if !wrecked {
            self.wreck_since = None;
            return true;
        }
        let since = *self.wreck_since.get_or_insert(self.clock);
        if self.clock - since < WRECK_SPARE_S {
            return true;
        }
        self.spared.insert(wreck, self.clock + SPARE_S);
        self.wreck_since = None;
        false
    }

    /// Her enemy among the ships she sees, and how far off: the nearest she would fight and does not spare, within
    /// her sight (farther for the one she fights), the one she fights reckoned nearer.
    fn choose<'seen>(&self, her: &Her, sightings: &'seen [Sighting]) -> Option<(&'seen Sighting, f64)> {
        let me = [her.ship.x, her.ship.y];
        let mut chosen: Option<(&Sighting, f64)> = None;
        let mut best = f64::INFINITY;
        for sighting in sightings {
            let apart = distance(me, [sighting.ship.x, sighting.ship.y]);
            let held = self.target == Some(sighting.id) && self.mode == Mode::Engage;
            let sight = ENGAGE_RANGE * if held { DISENGAGE } else { 1.0 };
            let hostile = self.provoked_by(sighting.id) || self.takes_prize(her, sighting);
            if apart < sight && hostile && !self.spares(sighting.id) {
                let rank = if held { apart * HELD_NEARER } else { apart };
                if rank < best {
                    (chosen, best) = (Some((sighting, apart)), rank);
                }
            }
        }
        chosen
    }

    /// The nearest ship within `FLEE_RANGE` that struck her lately: a threat she may run from.
    fn threat<'seen>(&self, her: &Her, sightings: &'seen [Sighting]) -> Option<&'seen Sighting> {
        let me = [her.ship.x, her.ship.y];
        let apart = |sighting: &Sighting| distance(me, [sighting.ship.x, sighting.ship.y]);
        sightings.iter().filter(|sighting| self.provoked_by(sighting.id) && apart(sighting) < FLEE_RANGE).fold(
            None,
            |nearest: Option<&Sighting>, sighting| match nearest {
                Some(held) if apart(held) <= apart(sighting) => Some(held),
                _ => Some(sighting),
            },
        )
    }

    /// Marks a new ship: what she remembered of another (its chase, its wreck, its way, her side to it) is let go.
    fn mark(&mut self, ship: ShipId) {
        if self.marked.is_some_and(|marked| marked != ship) {
            (self.chase, self.wreck_since, self.enemy_vel, self.present) = (None, None, None, None);
        }
        self.marked = Some(ship);
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

    /// Her helm for a step of `seconds` among the ships she may fight and the hulls about her (`traffic`, each
    /// where it is and its way), over water `is_water` says she can float in.
    pub fn steer(
        &mut self,
        her: &Her,
        (sightings, traffic): (&[Sighting], &[Traffic]),
        seconds: f64,
        is_water: &impl Fn(f64, f64) -> bool,
    ) -> Helm {
        self.clock += seconds;
        let clock = self.clock;
        self.provoked.retain(|_, at| *at > clock - PROVOKED_S);
        self.spared.retain(|_, until| *until > clock);
        if !her.damage.fighting() {
            self.run.clear();
            (self.present, self.chase, self.target) = (None, None, None);
            self.mode =
                if matches!(her.damage.state, State::Sinking | State::Sunk) { Mode::Sinking } else { Mode::Struck };
            self.sails = (self.sails - 0.5 * seconds).max(0.0);
            return self.helm(her, her.ship.heading, 0.0);
        }
        let me = [her.ship.x, her.ship.y];
        let chosen = self.choose(her, sightings);
        if let Some((enemy, _)) = chosen {
            self.mark(enemy.id);
        }
        let apart = chosen.map_or(f64::INFINITY, |(_, apart)| apart);
        let mut seen = chosen.is_some_and(|(enemy, apart)| self.chase_on(apart, enemy.id));
        if !seen {
            (self.chase, self.wreck_since) = (None, None);
        }
        seen = seen && chosen.is_some_and(|(enemy, _)| self.wreck_on(enemy.wrecked, enemy.id));
        let threat = self.threat(her, sightings);
        let outgunned = threat
            .is_some_and(|threat| odds(&threat.power, &self.power(her.damage), [arms_of(threat.hull), her.arms]) > 1.0);
        let runs = (her.damage.hull_share() < self.commission.rank.scale().runs_at && (threat.is_some() || seen))
            || (self.temper == Temper::Wary && outgunned);
        let enemy = chosen.filter(|_| seen).map(|(enemy, _)| enemy);
        self.target = enemy.map(|enemy| enemy.id);
        let from = threat.or(enemy).map(|from| [from.ship.x, from.ship.y]);
        let plan = match (runs, from, enemy) {
            (true, Some(from), _) => {
                self.mode = Mode::Flee;
                Plan { want: flee_course(me, from, her.wind), sails: 1.0, track: false }
            }
            (false, _, Some(enemy)) => {
                self.mode = Mode::Engage;
                self.follow(enemy, seconds);
                self.engage(her, enemy, apart, is_water)
            }
            _ => {
                self.mode = Mode::Cruise;
                Plan { want: self.cruise, sails: 1.0, track: false }
            }
        };
        let own = (me, her.ship.heading, velocity_of(her.ship));
        let want = traffic_course(own, plan.want, traffic, pass_reach(her.arms));
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
        let own = pace(her.hull, her.wind, self.way_share(her));
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
        let sail_way = pace(her.hull, her.wind, self.way_share(her)) * point_of_sail(off_run_deg(forward, her.wind));
        let asked = self.sails * pace(her.hull, her.wind, self.way_share(her));
        let ways =
            [(0_i8, 0.0), (1, HANDLING.move_speed_oar * self.commission.rank.scale().way), (SAILS_SET, sail_way)];
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

    /// Her guns after her step: against her enemy (`enemy`, the ship she has as her target, as she sees it now)
    /// while she is not a wreck.
    pub fn aim(&mut self, her: &Her, enemy: Option<&Sighting>, draws: &mut Mulberry32) -> Battery {
        let Some(enemy) = enemy.filter(|enemy| self.target == Some(enemy.id) && !enemy.wrecked) else {
            self.run.clear();
            return Battery { run_out: None, fire: None };
        };
        if !her.damage.fighting() {
            self.run.clear();
            return Battery { run_out: None, fire: None };
        }
        let mark = Mark {
            place: [enemy.ship.x, enemy.ship.y],
            heading: Some(enemy.ship.heading),
            velocity: velocity_of(&enemy.ship),
            smoothed: self.enemy_vel.unwrap_or_else(|| velocity_of(&enemy.ship)),
            level: enemy.level,
            arms: arms_of(enemy.hull),
        };
        let (ship, pose, arms, guns, build) = (her.ship, her.pose, her.arms, her.guns, &self.build);
        let aboard = Aboard { ship, pose, arms, guns, build, aim_error: self.commission.rank.scale().aim_error };
        captain_guns(&mut self.run, &aboard, &mark, self.clock, draws)
    }
}

fn length_of(ship: &Ship) -> f64 {
    length(ship.ahead, ship.abeam)
}

#[cfg(test)]
#[path = "captain_tests.rs"]
mod tests;
