//! The fleet room's law: a place at sea at true scale, on the open sea under the swell, where each player sails her
//! own Sloop by her helm and fights, and captains of each faction called into the room fight whom they choose (the
//! naval crate's fight). A player's orders are taken as the land room takes inputs: in order, one a tick, never faster
//! than the room's clock, a few at most to catch up after a stall; a player whose orders stop has her helm stand.
//! It has no network and no clock: whatever hosts it hands it orders and ticks, and sends out what it sees.

use crate::players::{CATCH_UP, PLAYERS_MOST, SLACK_TICKS, VIEW_LAG, WAITING_LIMIT};
use crate::sea_weather::open_sea_at;
use crate::{PlayerId, Refused};
use land::sea::Swell;
use naval::fight::{Aim, End, Event, Fight, Orders};
use naval::ranks::Commission;
use naval::shots::ShipId;
use sailing::TICK_SECONDS;
use sailing::ship::{Helm, Ship};
use sailing::waters::OpenSea;
use std::collections::{BTreeMap, VecDeque};
use std::f64::consts::TAU;
use world::check::{FRAME_HEIGHT_M, FRAME_WIDTH_M};

/// How many captains a fleet room holds at once.
pub const CAPTAINS_MOST: usize = 4;
/// The seed every fleet room's chances are drawn from: one room fights the same fight for the same orders.
const SEED: u32 = 0x464c_4545;
/// The farthest a look may lay, metres: past every gun's reach.
pub const MOST_RANGE_M: f64 = 1e5;
/// Where a fleet room's open sea lies in the weather: the world frame's middle, metres east and south.
pub const FLEET_AT: [f64; 2] = [FRAME_WIDTH_M as f64 / 2.0, FRAME_HEIGHT_M as f64 / 2.0];

/// A captain asked for with a player's orders: one of a faction and rank called onto the ring round their ship at a
/// level, their own ship fitted at its level from then on, or every one sent off.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Call {
    #[default]
    None,
    Captain(Commission, Levels),
    SendOff,
}

/// The levels a call sets, 0 for none: the captain's, which raises its ship as a captain's level does at sea, and the
/// caller's ship's, which fits it as a plain ship of that level (`gear::ship::ShipPower::plain`). With no ship level
/// the ship is unfitted, combat's own numbers.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Levels {
    pub captain: u8,
    pub ship: u8,
}

/// One tick's orders from a player: their number, her orders at the helm and the guns, where she puts to sea (x, y
/// and heading, once: a ship at sea is moved only by her helm), and a captain asked for.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Input {
    pub sequence: u32,
    pub orders: Orders,
    pub put_to_sea: Option<[f64; 3]>,
    pub call: Call,
}

impl Input {
    /// Whether every number is one, the helm within its throw, the look within her bow's half circle and the guns'
    /// reach, and where she puts to sea within the world's frame.
    #[must_use]
    pub fn fits(&self) -> bool {
        let helm = self.orders.helm;
        let helm_fits = helm.steer.is_finite() && (-1.0..=1.0).contains(&helm.steer) && (-1..=1).contains(&helm.climb);
        let aim_fits = self.orders.aim.is_none_or(|Aim { bearing_deg, range_m, ray }| {
            (-180.0..=180.0).contains(&bearing_deg)
                && (0.0..=MOST_RANGE_M).contains(&range_m)
                && ray.is_none_or(|ray| ray.iter().flatten().all(|number| number.is_finite()))
        });
        let within = |value: f64, limit: i64| value.is_finite() && value >= 0.0 && value <= limit as f64;
        let put_fits = self
            .put_to_sea
            .is_none_or(|[x, y, heading]| within(x, FRAME_WIDTH_M) && within(y, FRAME_HEIGHT_M) && heading.is_finite());
        helm_fits && aim_fits && put_fits
    }
}

/// A player as the fleet room keeps her: when she joined, how many of her orders have been taken, the number of the
/// last received and the last taken, the orders waiting, and whether her ship is at sea.
#[derive(Debug)]
struct Helmsman {
    joined: u64,
    stepped: u64,
    received: u32,
    acknowledged: u32,
    waiting: VecDeque<Input>,
    at_sea: bool,
    ship_level: u8,
}

/// A tick's orders taken from the players, for the fight, and the captains they asked for.
struct Taken {
    orders: Vec<(ShipId, Orders)>,
    calls: Vec<(PlayerId, Call)>,
}

/// A fleet room: its clock in ticks, its swell and wind, its fight, its players, the next number for a ship, and what
/// happened since it was last asked.
#[derive(Debug)]
pub struct Fleet {
    clock: u64,
    swell: Swell,
    wind: [f64; 2],
    fight: Fight,
    players: BTreeMap<PlayerId, Helmsman>,
    next_ship: ShipId,
    events: Vec<(u64, Event)>,
    world_start_s: f64,
    /// Each captain's level, by ship.
    captain_levels: BTreeMap<ShipId, u8>,
}

impl Default for Fleet {
    fn default() -> Self {
        Self::new()
    }
}

impl Fleet {
    /// An empty fleet room on the open sea at `FLEET_AT`, under the weather there at world time 0 until its host sets
    /// the time it opened (`set_world_start`).
    #[must_use]
    pub fn new() -> Self {
        let (swell, wind) = open_sea_at(FLEET_AT, 0.0);
        let fight = Fight::new(SEED);
        let players = BTreeMap::new();
        let (events, captain_levels) = (Vec::new(), BTreeMap::new());
        Self { clock: 0, swell, wind, fight, players, next_ship: 1, events, world_start_s: 0.0, captain_levels }
    }

    /// Sets the world time the room's clock started at, seconds since the Unix epoch: its sea takes the weather then,
    /// as a browser predicting it does (`room-wasm`'s fleet door), and keeps it while the room lasts.
    pub fn set_world_start(&mut self, seconds: f64) {
        (self.swell, self.wind) = open_sea_at(FLEET_AT, seconds);
        self.world_start_s = seconds;
    }

    /// The world time the room's clock started at, seconds since the Unix epoch: a browser predicting it takes the
    /// same weather by it.
    #[must_use]
    pub fn world_start(&self) -> f64 {
        self.world_start_s
    }

    /// The room's time, seconds: what the swell rolls by.
    #[must_use]
    pub fn time(&self) -> f64 {
        self.clock as f64 * TICK_SECONDS
    }

    #[must_use]
    pub fn clock(&self) -> u64 {
        self.clock
    }

    /// The swell and the wind the room's ships sail in.
    #[must_use]
    pub fn weather(&self) -> (&Swell, [f64; 2]) {
        (&self.swell, self.wind)
    }

    /// The fight: every ship in the room, the balls aloft.
    #[must_use]
    pub fn fight(&self) -> &Fight {
        &self.fight
    }

    /// A new player, whose ship is not at sea until her orders put her there; none when the room is full.
    pub fn join(&mut self) -> Option<PlayerId> {
        if self.players.len() >= PLAYERS_MOST {
            return None;
        }
        let id = self.next_ship;
        self.next_ship += 1;
        let helmsman = Helmsman {
            joined: self.clock,
            stepped: 0,
            received: 0,
            acknowledged: 0,
            waiting: VecDeque::new(),
            at_sea: false,
            ship_level: 0,
        };
        self.players.insert(id, helmsman);
        Some(id)
    }

    /// The player leaves, and her ship with her.
    pub fn leave(&mut self, player: PlayerId) {
        self.players.remove(&player);
        self.fight.leave(player);
    }

    /// The player's orders, which must follow her last; they wait for the room's next tick.
    pub fn input(&mut self, player: PlayerId, input: Input) -> Result<(), Refused> {
        let found = self.players.get_mut(&player).ok_or(Refused::NoSuchPlayer)?;
        let expected = found.received.wrapping_add(1);
        if input.sequence != expected {
            return Err(Refused::OutOfOrder { expected, got: input.sequence });
        }
        if !input.fits() {
            return Err(Refused::BadLook);
        }
        if found.waiting.len() >= WAITING_LIMIT {
            // Let go of the oldest as though taken: the order holds, and the player is never further behind than this.
            found.waiting.pop_front();
            found.acknowledged = found.acknowledged.wrapping_add(1);
        }
        found.received = input.sequence;
        found.waiting.push_back(input);
        Ok(())
    }

    /// The number of a player's last orders taken.
    #[must_use]
    pub fn acknowledged(&self, player: PlayerId) -> Option<u32> {
        self.players.get(&player).map(|found| found.acknowledged)
    }

    /// One tick: each player's waiting orders, as many as the clock allows; the captains asked for; the fight's step;
    /// and the captains who left it gone from the room.
    pub fn tick(&mut self) {
        self.clock += 1;
        let time = self.time();
        let Taken { orders, calls } = self.take_orders(time);
        for (player, call) in calls {
            self.answer_call(player, call, time);
        }
        self.fit();
        let swell = self.swell.clone();
        let waters = OpenSea { swell: &swell };
        let events = self.fight.step(&orders, &waters, self.wind, time);
        let gone: Vec<ShipId> = events
            .iter()
            .filter_map(|event| if let Event::Gone { ship, .. } = event { Some(*ship) } else { None })
            .collect();
        self.events.extend(events.into_iter().map(|event| (self.clock, event)));
        for ship in gone {
            self.fight.leave(ship);
            self.captain_levels.remove(&ship);
        }
    }

    /// Fits each player's ship that has a level against every captain in the room by theirs, for the tick to come.
    fn fit(&mut self) {
        for (&id, found) in &self.players {
            if found.ship_level == 0 || !found.at_sea {
                continue;
            }
            let captains = self.fight.ships.iter().filter(|(_, vessel)| vessel.command().is_some());
            let levels =
                captains.map(|(captain, _)| (*captain, self.captain_levels.get(captain).copied().unwrap_or(0)));
            let power = gear::ship::ShipPower::plain(found.ship_level);
            let fitting = crate::ship_power::fitted(power, naval::fight::fitting::Trim::default(), levels);
            self.fight.fit(id, fitting);
        }
    }

    /// Each player's orders this tick, as many as the clock allows and `CATCH_UP` at most, in order, and none after
    /// one that fires; her ship put to sea by the first that asks while she is not; and a player a view's lag behind
    /// with none to take stands a tick, her helm too once she is at sea. Answers the orders for the fight and the
    /// captains asked for.
    fn take_orders(&mut self, time: f64) -> Taken {
        let (mut orders, mut calls) = (Vec::new(), Vec::new());
        let clock = self.clock;
        for (&id, found) in &mut self.players {
            let mut taken = 0;
            while taken < CATCH_UP && found.stepped < clock - found.joined + SLACK_TICKS {
                let Some(input) = found.waiting.pop_front() else { break };
                taken += 1;
                found.stepped += 1;
                found.acknowledged = found.acknowledged.wrapping_add(1);
                if let (false, Some([x, y, heading])) = (found.at_sea, input.put_to_sea) {
                    let heading = heading.rem_euclid(TAU);
                    let heading = if heading < TAU { heading } else { 0.0 };
                    let ship = Ship { x, y, heading, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
                    self.fight.put_to_sea(id, ship, &OpenSea { swell: &self.swell }, time);
                    found.at_sea = true;
                }
                if found.at_sea {
                    orders.push((id, input.orders));
                }
                if input.call != Call::None {
                    calls.push((id, input.call));
                }
                // The fight judges a release by her brace and her ship after all her orders of the tick: so the one
                // that fires is her last.
                if input.orders.fire {
                    break;
                }
            }
            // She stands from the moment she joins, as on land: time spent in harbour is not banked to catch up on.
            if taken == 0 && found.stepped + VIEW_LAG < clock - found.joined {
                found.stepped += 1;
                if found.at_sea {
                    orders.push((id, STANDING));
                }
            }
        }
        Taken { orders, calls }
    }

    /// A captain of the faction and rank asked for called onto the ring round the player's ship, while the room holds
    /// fewer than `CAPTAINS_MOST`; or every captain sent off.
    fn answer_call(&mut self, player: PlayerId, call: Call, time: f64) {
        let captains: Vec<ShipId> =
            self.fight.ships.iter().filter(|(_, vessel)| vessel.command().is_some()).map(|(id, _)| *id).collect();
        match call {
            Call::None => {}
            Call::SendOff => {
                for captain in captains {
                    self.fight.leave(captain);
                    self.captain_levels.remove(&captain);
                    self.events.push((self.clock, Event::Gone { ship: captain, end: End::Gone }));
                }
            }
            Call::Captain(commission, levels) => {
                if let Some(found) = self.players.get_mut(&player) {
                    found.ship_level = levels.ship;
                }
                let Some(near) = self.fight.vessel(player).map(|vessel| vessel.ship) else { return };
                if captains.len() >= CAPTAINS_MOST {
                    return;
                }
                let id = self.next_ship;
                let waters = OpenSea { swell: &self.swell };
                if self.fight.call_captain(id, &near, commission, &waters, time).is_ok() {
                    self.next_ship += 1;
                    if levels.captain > 0 {
                        self.fight.raise(id, gear::power::foe_health_times(levels.captain));
                        self.captain_levels.insert(id, levels.captain);
                    }
                }
            }
        }
    }

    /// What happened in the fight since this was last asked, each with its tick, to send to everyone once.
    pub fn take_events(&mut self) -> Vec<(u64, Event)> {
        std::mem::take(&mut self.events)
    }
}

/// A player's helm standing for a tick: no rudder, no rung, no fire, no brace, no look.
pub const STANDING: Orders =
    Orders { helm: Helm { steer: 0.0, crab: false, climb: 0 }, aim: None, fire: false, brace: false, load: None };

#[cfg(test)]
#[path = "fleet_tests.rs"]
mod fleet_tests;
