//! Hostile ships at sea, pirates and the Grey Tithe's, from DFO's director trimmed to them alone. Each player at sea
//! rolls for a ship half a minute after reaching the water and then every minute to two and a half; the water at
//! their ship decides who a roll that draws a hostile ship sends, at which rank and level (`sighting`). She comes near
//! her sight's distance ahead of them, clear of every player, a pirate by a coast and a Tithe ship along a lane. Her
//! commission is drawn as she comes and kept, and her rank picks her hull and her way. She sails on the clock of the
//! player she sails by (their voyage's pace, real time where another player shares those waters), never into home
//! waters, and goes once no player is within 1.1 times her sight. A bold one within `ENGAGE_RANGE` of a player or a
//! rival takes them on. One stream, seeded as the sea opens, draws every chance in a fixed order.

use crate::PlayerId;
use crate::sea::SHIP_SPEED_M_S;
use crate::sighting::{
    AHEAD_ARC_RAD, COME_OUT, Chart, HELM_TURN_RAD_S, KEEP_SHARE, LANE_REACH_M, SIGHT_LEAST_M, SLOW_PACE, WaterHere,
    along_lane, faction_of, intercept_heading, level_in, meeting_arc, rank_for, sight_for, turned_toward, way_of,
};
use naval::captain::course::heading_to;
use naval::captain::{ENGAGE_RANGE, Temper, temper_for};
use naval::fight::SPAWN_TRIES;
use naval::random::Mulberry32;
use naval::ranks::{Commission, GREY_TITHE};
use std::collections::BTreeMap;
use std::f64::consts::TAU;

/// A player's first roll waits this long after their ship reaches the water, then each the next between these
/// (seconds).
pub const FIRST_ROLL_S: f64 = 30.0;
pub const ROLL_EVERY_S: [f64; 2] = [60.0, 140.0];
/// A roll's chance of a ship, and of that ship being hostile (DFO's open sea: 30 of its factions' 100); any other
/// ship does not sail here.
pub const SHIP_CHANCE: f64 = 0.8;
pub const PIRATE_SHARE: f64 = 0.3;
/// No roll launches while this many hostile ships sail within their sight of the player.
pub const DENSITY: usize = 3;
/// A hostile ship stands no nearer than this to any player (metres).
pub const SPAWN_CLEAR_M: f64 = 450.0;
/// A Sloop's way at sea on a beam reach, metres a second; each rank's is a share of it (`sighting::way_of`).
pub const PIRATE_WAY_M_S: f64 = 2.4;
/// Waters another player sails within this of are shared, and keep real time (metres).
pub const SHARE_M: f64 = 1_200.0;
#[cfg(test)]
const STREAM_SEED: u32 = 0x5ea_9a7e;

/// A hostile ship at sea, a pirate's or the Grey Tithe's: her number in the room, her seed (her temper and every
/// chance of her fight), her faction and rank, her level, the distance she is sighted from, where she is and her
/// heading (radians clockwise from north).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pirate {
    pub id: u32,
    pub seed: u32,
    pub commission: Commission,
    pub level: u8,
    pub sight_m: f64,
    pub x: f64,
    pub y: f64,
    pub heading: f64,
    pub bold: bool,
    /// The player a bold ship comes for, from her sighting them until she meets or loses them.
    pub quarry: Option<PlayerId>,
}

impl Pirate {
    /// A ship of level 0 seen from the least sight, as tests and doors stand one by hand.
    #[must_use]
    pub fn standing(id: u32, seed: u32, commission: Commission, [x, y]: [f64; 2], heading: f64, bold: bool) -> Self {
        Pirate { id, seed, commission, level: 0, sight_m: SIGHT_LEAST_M, x, y, heading, bold, quarry: None }
    }

    /// Whether a point lies within her sight.
    #[must_use]
    pub fn sees(&self, at: [f64; 2]) -> bool {
        apart([self.x, self.y], at) <= self.sight_m
    }

    /// Whether she stays at sea with a player at `at`: within 1.1 times her sight.
    #[must_use]
    pub fn kept_by(&self, at: [f64; 2]) -> bool {
        apart([self.x, self.y], at) <= KEEP_SHARE * self.sight_m
    }
}

/// A player's ship at sea as the hostile ships see her: where she is, her heading, the pace she was set to (0 at
/// rest), whether she is fighting, the clock her waters run at (her pace as she sails, 1 at rest), and the share of
/// her hull she keeps, by which a wary ship sizes her up.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Voyager {
    pub player: PlayerId,
    pub at: [f64; 2],
    pub heading: f64,
    pub pace: u16,
    pub fighting: bool,
    pub clock: f64,
    pub hull: f64,
}

/// The pirates at sea, each player's wait for their next roll, and each pair of ships that fought and both sailed on,
/// by their numbers.
#[derive(Debug)]
pub struct Pirates {
    draws: Mulberry32,
    next_id: u32,
    waits: BTreeMap<PlayerId, f64>,
    pub sailing: Vec<Pirate>,
    parted: Vec<[u32; 2]>,
    /// The ship each player chases, by her number: met within `ENGAGE_RANGE` whatever her temper.
    chasing: BTreeMap<PlayerId, u32>,
}

#[cfg(test)]
impl Default for Pirates {
    fn default() -> Self {
        Self::new(STREAM_SEED)
    }
}

pub(crate) fn apart(from: [f64; 2], to: [f64; 2]) -> f64 {
    let (east, south) = (to[0] - from[0], to[1] - from[1]);
    (east * east + south * south).sqrt()
}

/// The rate a ship sails at: the clock of the player nearest her that keeps her at sea, but real time where another
/// player sails within `SHARE_M` of that one, or none is near.
fn clock_at(pirate: &Pirate, ships: &[Voyager]) -> f64 {
    let at = [pirate.x, pirate.y];
    let nearest = ships
        .iter()
        .filter(|ship| pirate.kept_by(ship.at))
        .min_by(|one, other| apart(at, one.at).total_cmp(&apart(at, other.at)));
    let Some(nearest) = nearest else { return 1.0 };
    let shared = ships.iter().any(|other| other.player != nearest.player && apart(other.at, nearest.at) <= SHARE_M);
    if shared { 1.0 } else { nearest.clock }
}

/// Where a ship blocked on `heading` sails instead: the open heading nearest her last, `last`, a twelfth of a half
/// turn at a time either way, so she follows a coast round; none open, she goes about.
fn round_the_coast(
    at: [f64; 2],
    (heading, last): (f64, f64),
    step: f64,
    chart: &impl Chart,
) -> (f64, Option<[f64; 2]>) {
    let ahead = |way: f64| [at[0] + libm::sin(way) * step, at[1] - libm::cos(way) * step];
    let turns = (1..=12).flat_map(|turn| [f64::from(turn), -f64::from(turn)]).map(|turn| heading + turn * TAU / 24.0);
    let open = turns.filter(|&way| chart.open(at, ahead(way)));
    let off = |way: f64| ((way - last + TAU / 2.0).rem_euclid(TAU) - TAU / 2.0).abs();
    match open.min_by(|one, other| off(*one).total_cmp(&off(*other))) {
        Some(way) => (way.rem_euclid(TAU), Some(ahead(way))),
        None => ((heading + TAU / 2.0).rem_euclid(TAU), None),
    }
}

/// A ship's heading after `seconds` at her `clock`, and the player she comes for: the one she came for while still in
/// her sight and not fighting, else the nearest such; she steers to intercept them, at most at the helm's rate. A bold
/// ship comes for anyone; a wary one only for a Sloop she would take (`wary_takes`, DFO's `takesPrize`). One with no
/// one to come for keeps her heading.
fn come_for(pirate: &Pirate, ships: &[Voyager], (seconds, clock): (f64, f64)) -> (f64, Option<PlayerId>) {
    let at = [pirate.x, pirate.y];
    let takes = |ship: &Voyager| pirate.bold || naval::captain::wary_takes(pirate.commission, ship.hull);
    let open = |ship: &&Voyager| !ship.fighting && pirate.sees(ship.at) && takes(ship);
    let kept = ships.iter().filter(open).find(|ship| Some(ship.player) == pirate.quarry);
    let nearest = || ships.iter().filter(open).min_by(|one, other| apart(at, one.at).total_cmp(&apart(at, other.at)));
    let Some(ship) = kept.or_else(nearest) else { return (pirate.heading, None) };
    // Her lead is reckoned in seconds of her clock: the player's own, or real time in shared waters.
    let way = if ship.pace > 0 { SHIP_SPEED_M_S * ship.clock / clock } else { 0.0 };
    let velocity = [libm::sin(ship.heading) * way, -libm::cos(ship.heading) * way];
    let want = intercept_heading(at, way_of(pirate.commission.rank), ship.at, velocity);
    (turned_toward(pirate.heading, want, HELM_TURN_RAD_S * seconds * clock), Some(ship.player))
}

impl Pirates {
    /// An empty sea, its chances drawn from `seed`.
    #[must_use]
    pub fn new(seed: u32) -> Self {
        Self {
            draws: Mulberry32::new(seed),
            next_id: 1,
            waits: BTreeMap::new(),
            sailing: Vec::new(),
            parted: Vec::new(),
            chasing: BTreeMap::new(),
        }
    }

    /// The player chases the ship numbered `ship`, or none.
    pub fn chase(&mut self, player: PlayerId, ship: Option<u32>) {
        match ship {
            Some(ship) => self.chasing.insert(player, ship),
            None => self.chasing.remove(&player),
        };
    }

    /// One tick of `seconds` on `chart`, each player's ship at sea in `ships`. Each ship takes the sight of the player
    /// nearest her if it is farther than hers, sails on and goes once no player keeps her; then each player's roll
    /// comes due. Answers each bold ship that came within `ENGAGE_RANGE` of a player this tick, with that player, for
    /// their fight; she leaves the sea.
    pub fn tick(&mut self, seconds: f64, ships: &[Voyager], chart: &impl Chart) -> Vec<(PlayerId, Pirate)> {
        let nearest = |at: [f64; 2]| ships.iter().map(|ship| apart(at, ship.at)).fold(f64::INFINITY, f64::min);
        for index in 0..self.sailing.len() {
            let pirate = self.sailing[index];
            let at = [pirate.x, pirate.y];
            let closest = ships.iter().min_by(|one, other| apart(at, one.at).total_cmp(&apart(at, other.at)));
            let sight = closest.map_or(pirate.sight_m, |ship| sight_for(f64::from(ship.pace)).max(pirate.sight_m));
            let clock = clock_at(&pirate, ships);
            let (heading, quarry) = come_for(&pirate, ships, (seconds, clock));
            let step = way_of(pirate.commission.rank) * seconds * clock;
            let ahead = [pirate.x + libm::sin(heading) * step, pirate.y - libm::cos(heading) * step];
            let sailed = &mut self.sailing[index];
            (sailed.sight_m, sailed.heading, sailed.quarry) = (sight, heading, quarry);
            if chart.open(at, ahead) {
                [sailed.x, sailed.y] = ahead;
            } else {
                // Land or home water ahead: she follows it round, or goes about.
                let (way, there) = round_the_coast(at, (heading, pirate.heading), step, chart);
                sailed.heading = way;
                if let Some([x, y]) = there {
                    [sailed.x, sailed.y] = [x, y];
                }
            }
        }
        self.sailing.retain(|pirate| ships.iter().any(|ship| pirate.kept_by(ship.at)));
        let mut met = Vec::new();
        for ship in ships {
            if ship.fighting || met.iter().any(|&(taken, _)| taken == ship.player) {
                continue;
            }
            let chased = self.chasing.get(&ship.player).copied();
            let meets = |pirate: &Pirate| pirate.bold || chased == Some(pirate.id);
            let sighted = self
                .sailing
                .iter()
                .position(|pirate| meets(pirate) && apart([pirate.x, pirate.y], ship.at) <= ENGAGE_RANGE);
            if let Some(index) = sighted {
                met.push((ship.player, self.sailing.remove(index)));
            }
        }
        self.waits.retain(|player, _| ships.iter().any(|ship| ship.player == *player));
        let sailing = &self.sailing;
        self.chasing.retain(|player, ship| {
            ships.iter().any(|at_sea| at_sea.player == *player) && sailing.iter().any(|pirate| pirate.id == *ship)
        });
        for ship in ships {
            let wait = self.waits.entry(ship.player).or_insert(FIRST_ROLL_S);
            *wait -= seconds;
            // While a player fights, the sea sends no one else.
            if *wait > 0.0 || ship.fighting {
                continue;
            }
            *wait = self.draws.between(ROLL_EVERY_S[0], ROLL_EVERY_S[1]);
            let near = self.sailing.iter().filter(|pirate| pirate.sees(ship.at)).count();
            if near >= DENSITY || self.draws.draw() >= SHIP_CHANCE || self.draws.draw() >= PIRATE_SHARE {
                continue;
            }
            // Home waters send no one: the roll is spent.
            let Some(water) = chart.water(ship.at) else { continue };
            if let Some(pirate) = self.come(ship, water, chart, &nearest) {
                self.sailing.push(pirate);
                self.next_id += 1;
            }
        }
        met
    }

    /// The ship a roll in `water` sends `ship`, if any: her commission and level drawn, then her place, of the tries
    /// that fit (clear of every player, open water from the player, out of home waters), the one nearest a coast for a
    /// pirate and nearest a lane for a Tithe ship, who then heads along it.
    fn come(
        &mut self,
        ship: &Voyager,
        water: WaterHere,
        chart: &impl Chart,
        nearest: &impl Fn([f64; 2]) -> f64,
    ) -> Option<Pirate> {
        let faction = faction_of(water.holder, self.draws.draw())?;
        let low = water.levels.map_or(0, |(low, _)| low);
        let commission = Commission { faction, rank: rank_for(low, self.draws.draw()) };
        let level = level_in(water.levels, self.draws.draw());
        let seed = self.draws.seed();
        let sight_m = sight_for(f64::from(ship.pace));
        let bold = matches!(temper_for(commission, seed), Temper::Bold);
        // A bold ship comes where she can meet a voyage that holds its course; at the helm's slow paces, near and slow
        // under 5 km of sight, she comes anywhere ahead as a wary one does.
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
        let lane = (faction == GREY_TITHE)
            .then(|| {
                let lanes = fits.iter().filter_map(|&at| Some((at, chart.lane(at)?)));
                lanes.filter(|(_, (off, _))| *off <= LANE_REACH_M).min_by(|one, other| one.1.0.total_cmp(&other.1.0))
            })
            .flatten();
        let by_coast = || fits.iter().copied().min_by(|one, other| chart.coast(*one).total_cmp(&chart.coast(*other)));
        let at = lane.map(|(at, _)| at).or_else(by_coast)?;
        let slant = if self.draws.draw() < 0.5 { 1.0 } else { -1.0 } * (0.6 + self.draws.draw() * 0.9);
        let slanted = (heading_to(at, ship.at) + slant).rem_euclid(TAU);
        let heading = lane.map_or(slanted, |(_, (_, way))| along_lane(way, slanted));
        let [x, y] = at;
        Some(Pirate { id: self.next_id, seed, commission, level, sight_m, x, y, heading, bold, quarry: None })
    }

    /// Ships back at sea from a fight among them, where it left them: any two of them have parted.
    pub fn back_from_clash(&mut self, ships: Vec<Pirate>) {
        for (index, one) in ships.iter().enumerate() {
            self.parted.extend(ships[index + 1..].iter().map(|other| [one.id, other.id]));
        }
        self.sailing.extend(ships);
    }

    /// Each bold ship in turn meets the nearest ship of another faction within `ENGAGE_RANGE`, neither met already:
    /// both leave the sea for their fight, the bold one first. Ships of one faction never meet, nor two that parted
    /// until they have been that far apart.
    pub fn meet_rivals(&mut self) -> Vec<[Pirate; 2]> {
        let at = |id: u32| self.sailing.iter().find(|pirate| pirate.id == id).map(|pirate| [pirate.x, pirate.y]);
        let in_sight = |[one, other]: [u32; 2]| {
            at(one).zip(at(other)).is_some_and(|(one, other)| apart(one, other) <= ENGAGE_RANGE)
        };
        let parted: Vec<[u32; 2]> = self.parted.iter().copied().filter(|&pair| in_sight(pair)).collect();
        self.parted = parted;
        let mut pairs: Vec<[u32; 2]> = Vec::new();
        for one in self.sailing.iter().filter(|pirate| pirate.bold) {
            let taken = |id: u32| pairs.iter().flatten().any(|&met| met == id);
            if taken(one.id) {
                continue;
            }
            let faction = one.commission.faction;
            let rival = self
                .sailing
                .iter()
                .filter(|other| !taken(other.id) && other.commission.faction != faction)
                .filter(|other| !self.parted.iter().any(|pair| pair.contains(&one.id) && pair.contains(&other.id)))
                .map(|other| (other.id, apart([one.x, one.y], [other.x, other.y])))
                .filter(|&(_, off)| off <= ENGAGE_RANGE)
                .min_by(|first, second| first.1.total_cmp(&second.1));
            if let Some((rival, _)) = rival {
                pairs.push([one.id, rival]);
            }
        }
        let mut take = |id: u32| {
            let at = self.sailing.iter().position(|pirate| pirate.id == id);
            at.map(|at| self.sailing.remove(at))
        };
        pairs.into_iter().filter_map(|[one, rival]| Some([take(one)?, take(rival)?])).collect()
    }
}

#[cfg(test)]
#[path = "pirates_tests.rs"]
mod tests;
