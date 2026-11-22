//! The traffic's friendly ships the room has taken off their routes. A bold Grey Tithe ship within `ENGAGE_RANGE` of
//! one under way attacks it, and the two leave the sea for a clash (`clash`). The friendly ship fights for the players:
//! its commission is the players' faction's, a Major, in the hull the traffic gives it, at the Tithe ship's level.
//! Once the fight is over, one still afloat sails on for its route's far port at the traffic's speed, kept while a
//! player keeps it in sight, then gone. Its traffic id stays taken until its voyage would have ended, so the page never
//! draws it twice; and two that parted meet again only once they have been out of range of each other.

use crate::hostiles::{Hostile, Hostiles, apart, round_the_coast};
use crate::sighting::{Chart, KEEP_SHARE};
use naval::captain::ENGAGE_RANGE;
use naval::captain::course::heading_to;
use naval::ranks::{Commission, PLAYERS, Rank};
use sailing::HullKind;
use std::collections::BTreeMap;
use world::traffic::{DWELL_S, SPEED_M_S, Traffic, TrafficShip};

/// A friendly ship off its route: its traffic id, its hull, its seed (its sinking's chances), the level of the Tithe
/// ship it met, the distance it is sighted from, where it is, its heading (radians clockwise from north), and its
/// route's far port's roadstead, where it sails for.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Friendly {
    pub traffic: u64,
    pub hull: HullKind,
    pub seed: u32,
    pub level: u8,
    pub sight_m: f64,
    pub x: f64,
    pub y: f64,
    pub heading: f64,
    pub to: [f64; 2],
}

/// The commission a friendly ship fights under: the players' faction, so it flies their flag, at Major.
#[must_use]
pub fn friendly_commission() -> Commission {
    Commission { faction: PLAYERS, rank: Rank::Major }
}

impl Friendly {
    /// What its level makes of its hull, its men and its guns' harm, as a hostile ship's does.
    #[must_use]
    pub fn strength(&self) -> f64 {
        gear::power::foe_health_times(self.level)
    }

    /// Whether it stays at sea with a player at `at`: within 1.1 times its sight.
    #[must_use]
    pub fn kept_by(&self, at: [f64; 2]) -> bool {
        apart([self.x, self.y], at) <= KEEP_SHARE * self.sight_m
    }
}

/// The friendly ships sailing on after a clash, each taken traffic id with the world time its voyage would have ended,
/// and each Tithe ship and friendly ship that fought and both sailed on, by the hostile's number and the traffic id.
#[derive(Debug, Default)]
pub struct Friendlies {
    pub sailing: Vec<Friendly>,
    taken: BTreeMap<u64, f64>,
    parted: Vec<(u32, u64)>,
}

impl Friendlies {
    /// Each traffic id the room has taken off its route.
    pub fn taken(&self) -> impl Iterator<Item = u64> + '_ {
        self.taken.keys().copied()
    }

    /// Each bold ship in `hostiles` in turn meets the nearest friendly ship within `ENGAGE_RANGE`, neither met already:
    /// one sailing on, or one of `traffic` under way at world time `world_s` and not taken. Both leave the sea for
    /// their clash, and the traffic ship's id is taken. Two that parted never meet until they have been that far apart.
    pub fn meet(
        &mut self,
        hostiles: &mut Hostiles,
        traffic: Option<&Traffic>,
        world_s: f64,
    ) -> Vec<(Hostile, Friendly)> {
        let hostile_at = |id: u32| hostiles.sailing.iter().find(|ship| ship.id == id).map(|ship| [ship.x, ship.y]);
        let friend_at = |id: u64| self.sailing.iter().find(|ship| ship.traffic == id).map(|ship| [ship.x, ship.y]);
        let near = |(hostile, friend): (u32, u64)| {
            hostile_at(hostile).zip(friend_at(friend)).is_some_and(|(one, other)| apart(one, other) <= ENGAGE_RANGE)
        };
        self.parted.retain(|&pair| near(pair));
        let mut met = Vec::new();
        let mut at = 0;
        while at < hostiles.sailing.len() {
            let tithe = hostiles.sailing[at];
            let here = [tithe.x, tithe.y];
            let parted = |id: u64| self.parted.contains(&(tithe.id, id));
            let sailing = self.sailing.iter().copied().filter(|friend| !parted(friend.traffic));
            let ships = traffic
                .filter(|_| tithe.bold)
                .map(|traffic| (traffic, traffic.ships_near(here, ENGAGE_RANGE, world_s)));
            let routed = ships.into_iter().flat_map(|(traffic, ships)| {
                let open = |ship: &TrafficShip| ship.progress_m < ship.length_m && !self.taken.contains_key(&ship.id);
                ships.into_iter().filter(open).map(move |ship| (taken_of(traffic, &ship, &tithe), Some(ship)))
            });
            let nearest = sailing
                .map(|friend| (friend, None))
                .chain(routed)
                .filter(|(friend, _)| apart(here, [friend.x, friend.y]) <= ENGAGE_RANGE)
                .min_by(|one, other| apart(here, [one.0.x, one.0.y]).total_cmp(&apart(here, [other.0.x, other.0.y])));
            let Some((friend, routed)) = nearest.filter(|_| tithe.bold) else {
                at += 1;
                continue;
            };
            if let Some(ship) = routed {
                let ends = world_s + (ship.length_m - ship.progress_m) / SPEED_M_S + DWELL_S;
                self.taken.insert(ship.id, ends);
            }
            self.sailing.retain(|other| other.traffic != friend.traffic);
            met.push((hostiles.sailing.remove(at), friend));
        }
        met
    }

    /// Friendly ships back at sea from a clash, where it left them: each has parted from each of `hostiles`, the Tithe
    /// ships that sailed on from it.
    pub fn back_from_clash(&mut self, hostiles: &[u32], ships: Vec<Friendly>) {
        for friend in &ships {
            self.parted.extend(hostiles.iter().map(|&hostile| (hostile, friend.traffic)));
        }
        self.sailing.extend(ships);
    }

    /// One tick of `seconds`: each ship sailing on heads for its port at the traffic's speed, round any coast in its
    /// way, and is gone once there or once no player at `players` keeps it; each taken id whose voyage would have
    /// ended by world time `world_s` is let go.
    pub fn sail(&mut self, seconds: f64, players: &[[f64; 2]], chart: &impl Chart, world_s: f64) {
        let step = SPEED_M_S * seconds;
        for friend in &mut self.sailing {
            let at = [friend.x, friend.y];
            let heading = heading_to(at, friend.to);
            let ahead = [at[0] + libm::sin(heading) * step, at[1] - libm::cos(heading) * step];
            friend.heading = heading.rem_euclid(core::f64::consts::TAU);
            if chart.clear(at, ahead) {
                [friend.x, friend.y] = ahead;
            } else {
                let (way, there) = round_the_coast(at, (heading, heading), step, &|from, to| chart.clear(from, to));
                friend.heading = way;
                [friend.x, friend.y] = there.unwrap_or(at);
            }
        }
        self.sailing.retain(|friend| {
            apart([friend.x, friend.y], friend.to) > step && players.iter().any(|&at| friend.kept_by(at))
        });
        self.taken.retain(|_, ends| *ends > world_s);
    }
}

/// The friendly ship a traffic ship becomes when `tithe` attacks it.
fn taken_of(traffic: &Traffic, ship: &TrafficShip, tithe: &Hostile) -> Friendly {
    let far = traffic.roadsteads.get(ship.to_port).map_or(ship.position, |at| [at.x as f64, at.y as f64]);
    Friendly {
        traffic: ship.id,
        hull: HullKind::numbered(ship.hull).unwrap_or(HullKind::Sloop),
        // Its id folded to 32 bits: the same ship always sinks the same.
        seed: (ship.id ^ (ship.id >> 32)) as u32,
        level: tithe.level,
        sight_m: tithe.sight_m,
        x: ship.position[0],
        y: ship.position[1],
        heading: heading_to([0.0, 0.0], ship.direction).rem_euclid(core::f64::consts::TAU),
        to: far,
    }
}

#[cfg(test)]
#[path = "friendlies_tests.rs"]
mod tests;
