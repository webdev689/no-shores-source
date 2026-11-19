//! Hostile ships at sea, pirates and the Grey Tithe's, from DFO's director trimmed to them alone. Each player at sea
//! rolls for a ship half a minute after reaching the water and then every minute to two and a half; a roll that draws a
//! hostile ship stands her on the ring round their ship, clear of every player, crossing their waters on a slant. Her
//! seed is her temper, her faction and her rank, and her rank her hull. She sails on at a Sloop's way whatever her
//! hull, on the clock of the player she sails by (their voyage's pace, real time where another player shares those
//! waters), and goes once no player is near. A bold one that comes within sight of a player who is not fighting takes
//! them on, and one in sight of a ship of another faction meets her. One stream, seeded as the sea opens, draws every
//! chance in a fixed order, so a sea is the same given the same seed and courses.

use crate::PlayerId;
use naval::captain::course::heading_to;
use naval::captain::{ENGAGE_RANGE, Temper, temper_for};
use naval::fight::{DESPAWN_BEYOND, SPAWN_RING, SPAWN_TRIES};
use naval::random::Mulberry32;
use naval::ranks::{Commission, GREY_TITHE, PIRATES, Rank};
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
/// Of the hostile ships, this share are the Grey Tithe's and the rest pirates; and the ranks they come in, by their
/// shares.
pub const TITHE_SHARE: f64 = 0.5;
pub const RANKS_AT_SEA: [(Rank, f64); 3] = [(Rank::Minor, 0.3), (Rank::Major, 0.5), (Rank::Elite, 0.2)];
const FACTION_SALT: u32 = 0x3c6e_f372;
const RANK_SALT: u32 = 0xa54f_f53a;
/// No roll launches while this many pirates sail within `DESPAWN_BEYOND` of the player (DFO's default density).
pub const DENSITY: usize = 2;
/// A pirate stands no nearer than this to any player (metres).
pub const SPAWN_CLEAR_M: f64 = 450.0;
/// A pirate's way at sea, metres a second: a Sloop's on a beam reach.
pub const PIRATE_WAY_M_S: f64 = 2.4;
/// Waters another player sails within this of are shared, and keep real time (metres).
pub const SHARE_M: f64 = 1_200.0;
#[cfg(test)]
const STREAM_SEED: u32 = 0x5ea_9a7e;

/// A hostile ship at sea, a pirate's or the Grey Tithe's: her number in the room, her seed (her temper, faction and
/// rank, and every chance of her fight), where she is and her heading (radians clockwise from north).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pirate {
    pub id: u32,
    pub seed: u32,
    pub x: f64,
    pub y: f64,
    pub heading: f64,
    pub bold: bool,
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
}

#[cfg(test)]
impl Default for Pirates {
    fn default() -> Self {
        Self::new(STREAM_SEED)
    }
}

/// A hostile ship's faction and rank by her seed's own draws, as her temper is by another.
#[must_use]
pub fn commission_at_sea(seed: u32) -> Commission {
    let faction = if Mulberry32::new(seed ^ FACTION_SALT).draw() < TITHE_SHARE { GREY_TITHE } else { PIRATES };
    let roll = Mulberry32::new(seed ^ RANK_SALT).draw();
    let mut below = 0.0;
    let rank = RANKS_AT_SEA.iter().find(|(_, share)| {
        below += share;
        roll < below
    });
    Commission { faction, rank: rank.map_or(Rank::Elite, |(rank, _)| *rank) }
}

impl Pirate {
    /// Her faction and rank (`commission_at_sea`).
    #[must_use]
    pub fn commission(&self) -> Commission {
        commission_at_sea(self.seed)
    }
}

fn apart(from: [f64; 2], to: [f64; 2]) -> f64 {
    let (east, south) = (to[0] - from[0], to[1] - from[1]);
    (east * east + south * south).sqrt()
}

/// The rate a pirate at `at` sails at: the clock of the player nearest her within `DESPAWN_BEYOND`, but real time where
/// another player sails within `SHARE_M` of that one, or none is near.
fn clock_at(at: [f64; 2], ships: &[(PlayerId, [f64; 2], bool, f64)]) -> f64 {
    let nearest = ships
        .iter()
        .filter(|&&(_, ship, _, _)| apart(at, ship) <= DESPAWN_BEYOND)
        .min_by(|one, other| apart(at, one.1).total_cmp(&apart(at, other.1)));
    let Some(&(player, ship, _, clock)) = nearest else { return 1.0 };
    let shared = ships.iter().any(|&(other, there, _, _)| other != player && apart(there, ship) <= SHARE_M);
    if shared { 1.0 } else { clock }
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
        }
    }

    /// One tick of `seconds`. `ships` is each player's ship at sea, with whether they are fighting and the clock their
    /// waters run at (their voyage's pace, 1 at rest); `open` answers whether a ship may sail straight from one point
    /// to another without touching land. Answers each pirate who came within sight of a player this tick, with that
    /// player, for their fight; she leaves the sea.
    pub fn tick(
        &mut self,
        seconds: f64,
        ships: &[(PlayerId, [f64; 2], bool, f64)],
        open: impl Fn([f64; 2], [f64; 2]) -> bool,
    ) -> Vec<(PlayerId, Pirate)> {
        let nearest = |at: [f64; 2]| ships.iter().map(|&(_, ship, _, _)| apart(at, ship)).fold(f64::INFINITY, f64::min);
        for pirate in &mut self.sailing {
            let step = PIRATE_WAY_M_S * seconds * clock_at([pirate.x, pirate.y], ships);
            let ahead = [pirate.x + libm::sin(pirate.heading) * step, pirate.y - libm::cos(pirate.heading) * step];
            if open([pirate.x, pirate.y], ahead) {
                [pirate.x, pirate.y] = ahead;
            } else {
                // Land ahead: she goes about.
                pirate.heading = (pirate.heading + TAU / 2.0).rem_euclid(TAU);
            }
        }
        self.sailing.retain(|pirate| nearest([pirate.x, pirate.y]) <= DESPAWN_BEYOND);
        let mut met = Vec::new();
        for &(player, ship, fighting, _) in ships {
            if fighting || met.iter().any(|&(taken, _)| taken == player) {
                continue;
            }
            let sighted =
                self.sailing.iter().position(|pirate| pirate.bold && apart([pirate.x, pirate.y], ship) <= ENGAGE_RANGE);
            if let Some(index) = sighted {
                met.push((player, self.sailing.remove(index)));
            }
        }
        self.waits.retain(|player, _| ships.iter().any(|&(at_sea, _, _, _)| at_sea == *player));
        for &(player, ship, fighting, _) in ships {
            let wait = self.waits.entry(player).or_insert(FIRST_ROLL_S);
            *wait -= seconds;
            // While a player fights, the sea sends no one else.
            if *wait > 0.0 || fighting {
                continue;
            }
            *wait = self.draws.between(ROLL_EVERY_S[0], ROLL_EVERY_S[1]);
            let near = self.sailing.iter().filter(|pirate| apart([pirate.x, pirate.y], ship) <= DESPAWN_BEYOND);
            if near.count() >= DENSITY || self.draws.draw() >= SHIP_CHANCE || self.draws.draw() >= PIRATE_SHARE {
                continue;
            }
            let seed = self.draws.seed();
            for _ in 0..SPAWN_TRIES {
                let bearing = self.draws.draw() * TAU;
                let out = self.draws.between(SPAWN_RING[0], SPAWN_RING[1]);
                let at = [ship[0] + libm::sin(bearing) * out, ship[1] - libm::cos(bearing) * out];
                if nearest(at) < SPAWN_CLEAR_M || !open(ship, at) {
                    continue;
                }
                let slant = if self.draws.draw() < 0.5 { 1.0 } else { -1.0 } * (0.6 + self.draws.draw() * 0.9);
                let heading = (heading_to(at, ship) + slant).rem_euclid(TAU);
                let bold = matches!(temper_for(commission_at_sea(seed), seed), Temper::Bold);
                self.sailing.push(Pirate { id: self.next_id, seed, x: at[0], y: at[1], heading, bold });
                self.next_id += 1;
                break;
            }
        }
        met
    }

    /// Ships back at sea from a fight among them, where it left them: any two of them have parted.
    pub fn back_from_clash(&mut self, ships: Vec<Pirate>) {
        for (index, one) in ships.iter().enumerate() {
            self.parted.extend(ships[index + 1..].iter().map(|other| [one.id, other.id]));
        }
        self.sailing.extend(ships);
    }

    /// Each bold ship in turn meets the nearest ship of another faction within her sight, neither met already: both
    /// leave the sea for their fight, the bold one first. Ships of one faction never meet, nor two that parted until
    /// they have been out of each other's sight.
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
            let faction = one.commission().faction;
            let rival = self
                .sailing
                .iter()
                .filter(|other| !taken(other.id) && other.commission().faction != faction)
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
