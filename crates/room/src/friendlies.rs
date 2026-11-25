//! The traffic's friendly ships the room has taken off their routes. A bold Grey Tithe ship within `ENGAGE_RANGE` of
//! one under way attacks it, and the two leave the sea for a clash (`clash`). The friendly ship fights for the players:
//! its commission is the players' faction's, a Major, in the hull the traffic gives it, at the Tithe ship's level.
//! Once the fight is over, one still afloat sails on for its route's far port at the traffic's speed, kept while a
//! player keeps it in sight, then gone. Its traffic id stays taken until its voyage would have ended, so the page never
//! draws it twice; and two that parted meet again only once they have been out of range of each other.

use crate::hostiles::{Hostile, Hostiles, round_the_coast};
use crate::sighting::{Chart, KEEP_SHARE};
use combat::sight::apart;
use naval::captain::ENGAGE_RANGE;
use naval::captain::course::heading_to;
use naval::ranks::{Commission, PLAYERS, Rank};
use sailing::HullKind;
use std::collections::BTreeMap;
use world::traffic::{DWELL_S, SPEED_M_S, Traffic, TrafficShip};
use world::waters::Holder;

/// A friendly ship off its route: its traffic id, its hull, its seed (its sinking's chances), the level of the Tithe
/// ship it met, the distance it is sighted from, where it is, its heading (radians clockwise from north), its route's
/// far port's roadstead, where it sails for, and what is left of its route (none: straight for its port).
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
    pub lane: Option<Lane>,
}

/// What is left of a friendly ship's route: the route by its number, whether it sails it from its second port back to
/// its first, the next corner it makes for (counted from its start the way it sails), and whether it is back on it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Lane {
    pub route: usize,
    pub back: bool,
    pub next: usize,
    pub on: bool,
}

/// The corner `nth` of a lane's route, counted the way it sails.
fn corner(traffic: &Traffic, lane: Lane, nth: usize) -> Option<[f64; 2]> {
    let path = &traffic.routes.get(lane.route)?.path;
    let index = if lane.back { path.len().checked_sub(1 + nth)? } else { nth };
    path.get(index).map(|point| [point.x as f64, point.y as f64])
}

/// The point of the leg from `from` to `to` nearest `at`.
fn onto_leg(at: [f64; 2], from: [f64; 2], to: [f64; 2]) -> [f64; 2] {
    let way = [to[0] - from[0], to[1] - from[1]];
    let length = way[0] * way[0] + way[1] * way[1];
    let share = if length > 0.0 { ((at[0] - from[0]) * way[0] + (at[1] - from[1]) * way[1]) / length } else { 0.0 };
    let share = share.clamp(0.0, 1.0);
    [from[0] + share * way[0], from[1] + share * way[1]]
}

/// Where a friendly ship makes for now, moving its lane on past a point it has come to within `step`: first back to
/// its leg, then each corner of its route in turn; with no route, its port.
fn making_for(friend: &mut Friendly, traffic: Option<&Traffic>, step: f64) -> [f64; 2] {
    let at = [friend.x, friend.y];
    let Some((traffic, lane)) = traffic.zip(friend.lane.as_mut()) else { return friend.to };
    loop {
        let Some(next) = corner(traffic, *lane, lane.next) else { return friend.to };
        let target = match corner(traffic, *lane, lane.next.saturating_sub(1)).filter(|_| !lane.on) {
            Some(from) => onto_leg(at, from, next),
            None => next,
        };
        if apart(at, target) > step {
            return target;
        }
        if lane.on {
            lane.next += 1;
        }
        lane.on = true;
    }
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
    /// their clash, and the traffic ship's id is taken. Two that parted never meet until they have been that far apart,
    /// and none meets a friendly ship lying in home waters on `chart`, which hold no hostile ship.
    pub fn meet(
        &mut self,
        hostiles: &mut Hostiles,
        (traffic, chart): (Option<&Traffic>, &impl Chart),
        world_s: f64,
    ) -> Vec<(Hostile, Friendly)> {
        let home =
            |friend: &Friendly| chart.water([friend.x, friend.y]).is_some_and(|water| water.holder == Holder::Home);
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
                .filter(|(friend, _)| apart(here, [friend.x, friend.y]) <= ENGAGE_RANGE && !home(friend))
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

    /// One tick of `seconds`: each ship sailing on makes for its port at the traffic's speed by what is left of its
    /// route in `traffic` (back to it first), round any coast in its way, and is gone once there or once no player at
    /// `players` keeps it; each taken id whose voyage would have ended by world time `world_s` is let go.
    pub fn sail(
        &mut self,
        seconds: f64,
        players: &[[f64; 2]],
        (traffic, chart): (Option<&Traffic>, &impl Chart),
        world_s: f64,
    ) {
        let step = SPEED_M_S * seconds;
        for friend in &mut self.sailing {
            let at = [friend.x, friend.y];
            let heading = heading_to(at, making_for(friend, traffic, step));
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
        lane: Some(lane_of(traffic, ship)),
    }
}

/// What is left of a traffic ship's route: the first corner past how far it has sailed.
fn lane_of(traffic: &Traffic, ship: &TrafficShip) -> Lane {
    let mut lane = Lane { route: ship.route, back: ship.id & 1 == 1, next: 1, on: true };
    let mut sailed = 0.0;
    while let (Some(from), Some(to)) = (corner(traffic, lane, lane.next - 1), corner(traffic, lane, lane.next)) {
        sailed += apart(from, to);
        if sailed > ship.progress_m {
            break;
        }
        lane.next += 1;
    }
    lane
}

#[cfg(test)]
#[path = "friendlies_tests.rs"]
mod tests;
