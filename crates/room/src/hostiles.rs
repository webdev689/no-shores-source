//! Hostile ships at sea, the Grey Tithe's, from DFO's director trimmed to them alone. Each player at sea rolls for a
//! ship half a minute after reaching the water and then every minute to two and a half; the water at their ship
//! decides whether a roll sends one, at which rank and level (`sighting`). It comes near its sight's distance ahead,
//! clear of every player, nearest a lane and heading along it, else nearest a coast. Its commission is drawn as it
//! comes and kept; its rank picks its hull and its way. It sails on the clock of the player it sails by (real time
//! where another shares those waters), never into home waters, and goes once no player is within 1.1 times its sight.
//! A bold one within `ENGAGE_RANGE` of a player takes them on, and of a friendly ship attacks it (`friendlies`). One
//! stream, seeded as the sea opens, draws every chance in a fixed order.

use crate::PlayerId;
use crate::sea::SHIP_SPEED_M_S;
use crate::sighting::{
    AHEAD_ARC_RAD, COME_OUT, Chart, HELM_TURN_RAD_S, KEEP_SHARE, LANE_REACH_M, SIGHT_LEAST_M, SLOW_PACE, WaterHere,
    along_lane, faction_of, hostile_chance, intercept_heading, level_in, meeting_arc, rank_for, sight_for,
    turned_toward, way_of,
};
use combat::sight::apart;
use naval::captain::course::heading_to;
use naval::captain::{ENGAGE_RANGE, Temper, temper_for};
use naval::fight::SPAWN_TRIES;
use naval::random::Mulberry32;
use naval::ranks::Commission;
use std::collections::BTreeMap;
use std::f64::consts::TAU;

/// A player's first roll waits this long after their ship reaches the water, then each the next between these
/// (seconds).
pub const FIRST_ROLL_S: f64 = 30.0;
pub const ROLL_EVERY_S: [f64; 2] = [60.0, 140.0];
/// No roll launches while this many hostile ships sail within their sight of the player.
pub const DENSITY: usize = 3;
/// A hostile ship stands no nearer than this to any player (metres).
pub const SPAWN_CLEAR_M: f64 = 450.0;
/// A Sloop's way at sea on a beam reach, metres a second; each rank's is a share of it (`sighting::way_of`).
pub const HOSTILE_WAY_M_S: f64 = 2.4;
/// Waters another player sails within this of are shared, and keep real time (metres).
pub const SHARE_M: f64 = 1_200.0;
#[cfg(test)]
const STREAM_SEED: u32 = 0x5ea_9a7e;

/// A hostile ship at sea, the Grey Tithe's: its number in the room, its seed (its temper and every
/// chance of its fight), its faction and rank, its level, the distance it is sighted from, where it is and its
/// heading (radians clockwise from north).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Hostile {
    pub id: u32,
    pub seed: u32,
    pub commission: Commission,
    pub level: u8,
    pub sight_m: f64,
    pub x: f64,
    pub y: f64,
    pub heading: f64,
    pub bold: bool,
    /// The player a bold ship comes for, from its sighting them until it meets or loses them.
    pub quarry: Option<PlayerId>,
}

impl Hostile {
    /// A ship of level 0 seen from the least sight, as tests and doors stand one by hand.
    #[must_use]
    pub fn standing(id: u32, seed: u32, commission: Commission, [x, y]: [f64; 2], heading: f64, bold: bool) -> Self {
        Hostile { id, seed, commission, level: 0, sight_m: SIGHT_LEAST_M, x, y, heading, bold, quarry: None }
    }

    /// What its level makes of its hull, its men and its guns' harm: as a foe's level raises its health on land.
    #[must_use]
    pub fn strength(&self) -> f64 {
        gear::power::foe_health_times(self.level)
    }

    /// Whether a point lies within its sight.
    #[must_use]
    pub fn sees(&self, at: [f64; 2]) -> bool {
        apart([self.x, self.y], at) <= self.sight_m
    }

    /// Whether it stays at sea with a player at `at`: within 1.1 times its sight.
    #[must_use]
    pub fn kept_by(&self, at: [f64; 2]) -> bool {
        apart([self.x, self.y], at) <= KEEP_SHARE * self.sight_m
    }
}

/// A player's ship at sea as the hostile ships see it: where it is, its heading, the pace it was set to (0 at
/// rest), whether it is fighting, the clock its waters run at (its pace as it sails, 1 at rest), and the share of
/// its hull it keeps, by which a wary ship sizes it up.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Voyager {
    pub player: PlayerId,
    pub at: [f64; 2],
    pub heading: f64,
    pub pace: u16,
    pub fighting: bool,
    /// In Overlook's home waters, which hold no hostile ship: nothing meets it there.
    pub home: bool,
    pub clock: f64,
    pub hull: f64,
}

/// The hostile ships at sea, and each player's wait for their next roll.
#[derive(Debug)]
pub struct Hostiles {
    draws: Mulberry32,
    next_id: u32,
    waits: BTreeMap<PlayerId, f64>,
    pub sailing: Vec<Hostile>,
    /// The ship each player chases, by its number: met within `ENGAGE_RANGE` whatever its temper.
    chasing: BTreeMap<PlayerId, u32>,
    /// The sea's tier, which raises the levels of the ships it sends as it raises foes on land.
    pub difficulty: gear::Difficulty,
}

#[cfg(test)]
impl Default for Hostiles {
    fn default() -> Self {
        Self::new(STREAM_SEED)
    }
}

/// The rate a ship sails at: the clock of the player nearest it that keeps it at sea, but real time where another
/// player sails within `SHARE_M` of that one, or none is near.
fn clock_at(hostile: &Hostile, ships: &[Voyager]) -> f64 {
    let at = [hostile.x, hostile.y];
    let nearest = ships
        .iter()
        .filter(|ship| hostile.kept_by(ship.at))
        .min_by(|one, other| apart(at, one.at).total_cmp(&apart(at, other.at)));
    let Some(nearest) = nearest else { return 1.0 };
    let shared = ships.iter().any(|other| other.player != nearest.player && apart(other.at, nearest.at) <= SHARE_M);
    if shared { 1.0 } else { nearest.clock }
}

/// Where a ship blocked on `heading` sails instead: the open heading nearest its last, `last`, a twelfth of a half
/// turn at a time either way, so it follows a coast round; none `open`, it goes about.
pub(crate) fn round_the_coast(
    at: [f64; 2],
    (heading, last): (f64, f64),
    step: f64,
    open: &impl Fn([f64; 2], [f64; 2]) -> bool,
) -> (f64, Option<[f64; 2]>) {
    let ahead = |way: f64| [at[0] + libm::sin(way) * step, at[1] - libm::cos(way) * step];
    let turns = (1..=12).flat_map(|turn| [f64::from(turn), -f64::from(turn)]).map(|turn| heading + turn * TAU / 24.0);
    let open = turns.filter(|&way| open(at, ahead(way)));
    let off = |way: f64| ((way - last + TAU / 2.0).rem_euclid(TAU) - TAU / 2.0).abs();
    match open.min_by(|one, other| off(*one).total_cmp(&off(*other))) {
        Some(way) => (way.rem_euclid(TAU), Some(ahead(way))),
        None => ((heading + TAU / 2.0).rem_euclid(TAU), None),
    }
}

/// A ship's heading after `seconds` at its `clock`, and the player it comes for: the one it came for while still in
/// its sight and not fighting, else the nearest such; it steers to intercept them, at most at the helm's rate. A bold
/// ship comes for anyone; a wary one only for a Sloop it would take (`wary_takes`, DFO's `takesPrize`). One with no
/// one to come for keeps its heading.
fn come_for(hostile: &Hostile, ships: &[Voyager], (seconds, clock): (f64, f64)) -> (f64, Option<PlayerId>) {
    let at = [hostile.x, hostile.y];
    let takes =
        |ship: &Voyager| hostile.bold || naval::captain::wary_takes(hostile.commission, hostile.strength(), ship.hull);
    let open = |ship: &&Voyager| !ship.fighting && hostile.sees(ship.at) && takes(ship);
    let kept = ships.iter().filter(open).find(|ship| Some(ship.player) == hostile.quarry);
    let nearest = || ships.iter().filter(open).min_by(|one, other| apart(at, one.at).total_cmp(&apart(at, other.at)));
    let Some(ship) = kept.or_else(nearest) else { return (hostile.heading, None) };
    // Its lead is reckoned in seconds of its clock: the player's own, or real time in shared waters.
    let way = if ship.pace > 0 { SHIP_SPEED_M_S * ship.clock / clock } else { 0.0 };
    let velocity = [libm::sin(ship.heading) * way, -libm::cos(ship.heading) * way];
    let want = intercept_heading(at, way_of(hostile.commission.rank), ship.at, velocity);
    (turned_toward(hostile.heading, want, HELM_TURN_RAD_S * seconds * clock), Some(ship.player))
}

impl Hostiles {
    /// An empty sea, its chances drawn from `seed`.
    #[must_use]
    pub fn new(seed: u32) -> Self {
        Self {
            draws: Mulberry32::new(seed),
            next_id: 1,
            waits: BTreeMap::new(),
            sailing: Vec::new(),
            chasing: BTreeMap::new(),
            difficulty: gear::Difficulty::Normal,
        }
    }

    /// The player chases the ship numbered `ship`, or none.
    pub fn chase(&mut self, player: PlayerId, ship: Option<u32>) {
        match ship {
            Some(ship) => self.chasing.insert(player, ship),
            None => self.chasing.remove(&player),
        };
    }

    /// The ship the player chases, if any.
    #[must_use]
    pub fn chased(&self, player: PlayerId) -> Option<u32> {
        self.chasing.get(&player).copied()
    }

    /// Sets the player's next roll to wait at least its first wait, as a ship that has travelled to new waters: never
    /// sooner than it would have come, so travelling on and on brings no more ships than sailing.
    pub fn wait_first(&mut self, player: PlayerId) {
        let wait = self.waits.entry(player).or_insert(FIRST_ROLL_S);
        *wait = wait.max(FIRST_ROLL_S);
    }

    /// How long the player's next roll waits yet, seconds.
    #[cfg(test)]
    pub(crate) fn wait_of(&self, player: PlayerId) -> Option<f64> {
        self.waits.get(&player).copied()
    }

    /// One tick of `seconds` on `chart`, each player's ship at sea in `ships`. Each ship takes the sight of the player
    /// nearest it if it is farther than the ship's, sails on and goes once no player keeps it; then each player's roll
    /// comes due. Answers each bold ship that came within `ENGAGE_RANGE` of a player this tick, with that player, for
    /// their fight; it leaves the sea.
    pub fn tick(&mut self, seconds: f64, ships: &[Voyager], chart: &impl Chart) -> Vec<(PlayerId, Hostile)> {
        let nearest = |at: [f64; 2]| ships.iter().map(|ship| apart(at, ship.at)).fold(f64::INFINITY, f64::min);
        for index in 0..self.sailing.len() {
            let hostile = self.sailing[index];
            let at = [hostile.x, hostile.y];
            let closest = ships.iter().min_by(|one, other| apart(at, one.at).total_cmp(&apart(at, other.at)));
            let sight = closest.map_or(hostile.sight_m, |ship| sight_for(f64::from(ship.pace)).max(hostile.sight_m));
            let clock = clock_at(&hostile, ships);
            let (heading, quarry) = come_for(&hostile, ships, (seconds, clock));
            let step = way_of(hostile.commission.rank) * seconds * clock;
            let ahead = [hostile.x + libm::sin(heading) * step, hostile.y - libm::cos(heading) * step];
            let sailed = &mut self.sailing[index];
            (sailed.sight_m, sailed.heading, sailed.quarry) = (sight, heading, quarry);
            if chart.open(at, ahead) {
                [sailed.x, sailed.y] = ahead;
            } else {
                // Land or home water ahead: the ship follows it round, or goes about.
                let (way, there) =
                    round_the_coast(at, (heading, hostile.heading), step, &|from, to| chart.open(from, to));
                sailed.heading = way;
                if let Some([x, y]) = there {
                    [sailed.x, sailed.y] = [x, y];
                }
            }
        }
        self.sailing.retain(|hostile| ships.iter().any(|ship| hostile.kept_by(ship.at)));
        let mut met = Vec::new();
        for ship in ships {
            // One by the edge of home waters meets no player inside them.
            if ship.fighting || ship.home || met.iter().any(|&(taken, _)| taken == ship.player) {
                continue;
            }
            let chased = self.chasing.get(&ship.player).copied();
            let meets = |hostile: &Hostile| hostile.bold || chased == Some(hostile.id);
            let sighted = self
                .sailing
                .iter()
                .position(|hostile| meets(hostile) && apart([hostile.x, hostile.y], ship.at) <= ENGAGE_RANGE);
            if let Some(index) = sighted {
                met.push((ship.player, self.sailing.remove(index)));
            }
        }
        self.waits.retain(|player, _| ships.iter().any(|ship| ship.player == *player));
        let sailing = &self.sailing;
        self.chasing.retain(|player, ship| {
            ships.iter().any(|at_sea| at_sea.player == *player) && sailing.iter().any(|hostile| hostile.id == *ship)
        });
        for ship in ships {
            let wait = self.waits.entry(ship.player).or_insert(FIRST_ROLL_S);
            *wait -= seconds;
            // While a player fights, the sea sends no one else.
            if *wait > 0.0 || ship.fighting {
                continue;
            }
            *wait = self.draws.between(ROLL_EVERY_S[0], ROLL_EVERY_S[1]);
            let near = self.sailing.iter().filter(|hostile| hostile.sees(ship.at)).count();
            // Home waters send no one: the roll is spent. Elsewhere the water's band sets its chance.
            let Some(water) = chart.water(ship.at) else { continue };
            if near >= DENSITY || self.draws.draw() >= hostile_chance(water.levels) {
                continue;
            }
            if let Some(hostile) = self.come(ship, water, chart, &nearest) {
                self.sailing.push(hostile);
                self.next_id += 1;
            }
        }
        met
    }

    /// The ship a roll in `water` sends `ship`, if any: its commission and level drawn, then its place, of the tries
    /// that fit (clear of every player, open water from the player, out of home waters), the one nearest a lane within
    /// `LANE_REACH_M`, which it then heads along, else the one nearest a coast.
    fn come(
        &mut self,
        ship: &Voyager,
        water: WaterHere,
        chart: &impl Chart,
        nearest: &impl Fn([f64; 2]) -> f64,
    ) -> Option<Hostile> {
        let faction = faction_of(water.holder)?;
        let low = water.levels.map_or(0, |(low, _)| low);
        let commission = Commission { faction, rank: rank_for(low, self.draws.draw()) };
        // As a garrison's: a water with no band (level 0) stays none.
        let level = match level_in(water.levels, self.draws.draw()) {
            0 => 0,
            level => self.difficulty.raise(level),
        };
        let seed = self.draws.seed();
        let sight_m = sight_for(f64::from(ship.pace));
        let bold = matches!(temper_for(commission, seed), Temper::Bold);
        // A bold ship comes where it can meet a voyage that holds its course; at the helm's slow paces, near and slow
        // under 5 km of sight, it comes anywhere ahead as a wary one does.
        let arc = if bold && ship.pace > SLOW_PACE { meeting_arc(commission.rank) } else { AHEAD_ARC_RAD };
        let mut fits = Vec::new();
        for _ in 0..SPAWN_TRIES {
            let bearing = if ship.pace > 0 {
                ship.heading + (self.draws.draw() * 2.0 - 1.0) * arc
            } else {
                self.draws.draw() * TAU
            };
            let out = self.draws.between(COME_OUT[0], COME_OUT[1]) * sight_m;
            let at = [ship.at[0] + libm::sin(bearing) * out, ship.at[1] - libm::cos(bearing) * out];
            if nearest(at) >= SPAWN_CLEAR_M && chart.open(ship.at, at) {
                fits.push(at);
            }
        }
        let lanes = fits.iter().filter_map(|&at| Some((at, chart.lane(at)?)));
        let lane =
            lanes.filter(|(_, (off, _))| *off <= LANE_REACH_M).min_by(|one, other| one.1.0.total_cmp(&other.1.0));
        let by_coast = || fits.iter().copied().min_by(|one, other| chart.coast(*one).total_cmp(&chart.coast(*other)));
        let at = lane.map(|(at, _)| at).or_else(by_coast)?;
        let slant = if self.draws.draw() < 0.5 { 1.0 } else { -1.0 } * (0.6 + self.draws.draw() * 0.9);
        let slanted = (heading_to(at, ship.at) + slant).rem_euclid(TAU);
        let heading = lane.map_or(slanted, |(_, (_, way))| along_lane(way, slanted));
        let [x, y] = at;
        Some(Hostile { id: self.next_id, seed, commission, level, sight_m, x, y, heading, bold, quarry: None })
    }

    /// Ships back at sea from a clash, where it left them.
    pub fn back_from_clash(&mut self, ships: Vec<Hostile>) {
        self.sailing.extend(ships);
    }
}

#[cfg(test)]
#[path = "hostiles_tests.rs"]
mod tests;
