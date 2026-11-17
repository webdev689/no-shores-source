//! Pirates at sea, from DFO's director trimmed to pirates alone. Each player at sea rolls for a ship half a minute
//! after reaching the water and then every minute to two and a half; a roll that draws a pirate stands her on the ring
//! round their ship, clear of every player, crossing their waters on a slant. She sails on at a Sloop's way and goes
//! once no player is near. A bold one that comes within sight of a player who is not fighting takes them on. One
//! seeded stream draws every chance in a fixed order, so the sea is the same wherever it is given the same courses.

use crate::PlayerId;
use naval::captain::course::heading_to;
use naval::captain::{ENGAGE_RANGE, Temper, temper_of};
use naval::fight::{DESPAWN_BEYOND, SPAWN_RING, SPAWN_TRIES};
use naval::random::Mulberry32;
use std::collections::BTreeMap;
use std::f64::consts::TAU;

/// A player's first roll waits this long after their ship reaches the water, then each the next between these
/// (seconds).
pub const FIRST_ROLL_S: f64 = 30.0;
pub const ROLL_EVERY_S: [f64; 2] = [60.0, 140.0];
/// A roll's chance of a ship, and of that ship being a pirate (DFO's open sea: 30 of its factions' 100); any other
/// ship does not sail here.
pub const SHIP_CHANCE: f64 = 0.8;
pub const PIRATE_SHARE: f64 = 0.3;
/// No roll launches while this many pirates sail within `DESPAWN_BEYOND` of the player (DFO's default density).
pub const DENSITY: usize = 2;
/// A pirate stands no nearer than this to any player (metres).
pub const SPAWN_CLEAR_M: f64 = 450.0;
/// A pirate's way at sea, metres a second: a Sloop's on a beam reach.
pub const PIRATE_WAY_M_S: f64 = 2.4;
const STREAM_SEED: u32 = 0x5ea_9a7e;

/// A pirate at sea: her number in the room, her seed (her temper, and every chance of her fight), where she is and
/// her heading (radians clockwise from north).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pirate {
    pub id: u32,
    pub seed: u32,
    pub x: f64,
    pub y: f64,
    pub heading: f64,
    pub bold: bool,
}

/// The pirates at sea and each player's wait for their next roll.
#[derive(Debug)]
pub struct Pirates {
    draws: Mulberry32,
    next_id: u32,
    waits: BTreeMap<PlayerId, f64>,
    pub sailing: Vec<Pirate>,
}

impl Default for Pirates {
    fn default() -> Self {
        Self { draws: Mulberry32::new(STREAM_SEED), next_id: 1, waits: BTreeMap::new(), sailing: Vec::new() }
    }
}

fn apart(from: [f64; 2], to: [f64; 2]) -> f64 {
    let (east, south) = (to[0] - from[0], to[1] - from[1]);
    (east * east + south * south).sqrt()
}

impl Pirates {
    /// One tick of `seconds`. `ships` is each player's ship at sea, with whether they are fighting; `open` answers
    /// whether a ship may sail straight from one point to another without touching land. Answers each pirate who
    /// came within sight of a player this tick, with that player, for their fight; she leaves the sea.
    pub fn tick(
        &mut self,
        seconds: f64,
        ships: &[(PlayerId, [f64; 2], bool)],
        open: impl Fn([f64; 2], [f64; 2]) -> bool,
    ) -> Vec<(PlayerId, Pirate)> {
        let nearest = |at: [f64; 2]| ships.iter().map(|&(_, ship, _)| apart(at, ship)).fold(f64::INFINITY, f64::min);
        for pirate in &mut self.sailing {
            let step = PIRATE_WAY_M_S * seconds;
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
        for &(player, ship, fighting) in ships {
            if fighting || met.iter().any(|&(taken, _)| taken == player) {
                continue;
            }
            let sighted =
                self.sailing.iter().position(|pirate| pirate.bold && apart([pirate.x, pirate.y], ship) <= ENGAGE_RANGE);
            if let Some(index) = sighted {
                met.push((player, self.sailing.remove(index)));
            }
        }
        self.waits.retain(|player, _| ships.iter().any(|&(at_sea, _, _)| at_sea == *player));
        for &(player, ship, fighting) in ships {
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
                let bold = matches!(temper_of(seed), Temper::Bold);
                self.sailing.push(Pirate { id: self.next_id, seed, x: at[0], y: at[1], heading, bold });
                self.next_id += 1;
                break;
            }
        }
        met
    }
}

#[cfg(test)]
#[path = "pirates_tests.rs"]
mod tests;
