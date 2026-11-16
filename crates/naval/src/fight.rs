//! A fight: the player's Sloop and one pirate captain's, the balls between them, and the harm they do, stepped
//! together a tick at a time. The player orders her helm, a lay (the look's bearing off her bow and its range), the
//! fire, the brace and the load; the captain decides for herself. One seeded stream decides every chance, in a fixed
//! order, so a fight is the same on every machine.

use crate::arms::{Arms, LARGE_BOAT, PIRATE_SLOOP, SLOOP_ARMS, Side, hull_block, posed, sail_blocks, side_for_bearing};
use crate::ballistics::{Ball, flight};
use crate::captain::odds::Power;
use crate::captain::{Captain, Her, Mode, Sighting};
use crate::damage::{
    Damage, PLAYER_CREW_TOUGHNESS, SHIP_TOUGHNESS, SINK_CLEAR_M, SINK_LIST_DEG, SINK_PITCH_DEG, State, WRECKED_OARS,
    Zone, founder, shot_harm,
};
use crate::gunnery::{Guns, Lay, lay, volley};
use crate::guns::{Shot, fire_chance, rig_fire, shot_reach};
use crate::random::Mulberry32;
use crate::shots::{ShotEvent, Target, step_balls};
use sailing::pose::{Pose, pose_of, shallower};
use sailing::ship::{Helm, Pull, SAILS_SET, Ship, step_pulled};
use sailing::waters::Waters;
use sailing::{SLOOP, TICK_SECONDS};
use std::f64::consts::TAU;

pub const PLAYER: usize = 0;
pub const CAPTAIN: usize = 1;
/// A captain is put to sea this far from the player (metres), and leaves the fight past this, unless fighting.
pub const SPAWN_RING: [f64; 2] = [650.0, 1000.0];
pub const SPAWN_TRIES: u32 = 10;
pub const DESPAWN_BEYOND: f64 = 1900.0;
/// No mending with a hostile ship nearer than this (metres).
pub const HOSTILE_NEAR_M: f64 = 700.0;
/// The rest of the volley that made a ship strike, this long after (seconds), cannot sink her.
pub const STRUCK_GRACE_S: f64 = 2.0;

/// A ship in the fight: her helm's numbers, how she lies, her hurts and her guns.
#[derive(Debug, Clone, PartialEq)]
pub struct Vessel {
    pub ship: Ship,
    pub pose: Pose,
    pub damage: Damage,
    pub guns: Guns,
}

/// The player's lay: the look's bearing off her bow (degrees, to starboard) and how far out it meets the water.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Aim {
    pub bearing_deg: f64,
    pub range_m: f64,
}

/// What the player orders for a tick: her helm, the lay she holds, whether she fires it (a release: one tick), her
/// brace held, and a load to take (a press).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Orders {
    pub helm: Helm,
    pub aim: Option<Aim>,
    pub fire: bool,
    pub brace: bool,
    pub load: Option<Shot>,
}

/// Why the player's guns did not fire.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Refusal {
    NoGuns,
    Silent,
    Braced,
    Reloading { side: Side, left: f64 },
}

/// What happened in a tick, for the browser to show.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Event {
    Shot(ShotEvent),
    RunOut {
        side: Side,
    },
    State {
        ship: usize,
        state: State,
    },
    Refused(Refusal),
    /// The player's sails would not set: her rigging is shot away, or she is a wreck.
    NoSail {
        wrecked: bool,
    },
    Load {
        shot: Shot,
    },
}

/// How a fight ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum End {
    Sunk,
    Gone,
}

/// The fight.
#[derive(Debug, Clone, PartialEq)]
pub struct Fight {
    pub clock: f64,
    draws: Mulberry32,
    pub player: Vessel,
    pub captain: Vessel,
    pub her: Captain,
    pub balls: Vec<Ball>,
    struck_at: Option<f64>,
    under: f64,
    pub over: Option<End>,
}

/// Whether water at a point is deep enough to float a Sloop.
fn floats(waters: &impl Waters, x: f64, y: f64, time: f64) -> bool {
    !shallower(&waters.at(x, y, time), SLOOP.draught_m)
}

/// How deep she settles for her highest point to end `SINK_CLEAR_M` under at her last list and trim.
fn sink_depth(arms: &Arms, seed: u32) -> f64 {
    let ship = Ship { x: 0.0, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
    let side = if seed & 1 == 1 { 1.0 } else { -1.0 };
    let end = if seed & 2 == 2 { -1.0 } else { 1.0 };
    let last = Pose {
        heave: 0.0,
        pitch: (end * SINK_PITCH_DEG).to_radians(),
        roll: (side * SINK_LIST_DEG).to_radians(),
        aground: false,
    };
    let boxes = std::iter::once(&arms.hull).chain(arms.sails.iter());
    let corners = boxes.flat_map(|[low, high]| {
        (0..8).map(move |at| {
            [
                if at & 1 == 0 { low[0] } else { high[0] },
                if at & 2 == 0 { low[1] } else { high[1] },
                if at & 4 == 0 { low[2] } else { high[2] },
            ]
        })
    });
    corners.map(|corner| posed(&ship, &last, corner)[2]).fold(0.0, f64::max) + SINK_CLEAR_M
}

fn carry_of(ship: &Ship) -> [f64; 3] {
    let way = crate::captain::course::velocity_of(ship);
    [way[0], way[1], 0.0]
}

fn target_of(vessel: &Vessel) -> Target {
    Target {
        hull: hull_block(&vessel.ship, &vessel.pose, &SLOOP_ARMS),
        rig: sail_blocks(&vessel.ship, &vessel.pose, &SLOOP_ARMS),
        alive: vessel.damage.state != State::Sunk,
    }
}

impl Fight {
    /// A pirate captain put to sea on the ring round the player's `ship`, where the water floats her, heading across
    /// the player's waters on a slant. Every chance is drawn from `seed`.
    pub fn begin(ship: Ship, seed: u32, waters: &impl Waters, time: f64) -> Result<Fight, String> {
        let mut draws = Mulberry32::new(seed);
        for _ in 0..SPAWN_TRIES {
            let bearing = draws.draw() * TAU;
            let out = draws.between(SPAWN_RING[0], SPAWN_RING[1]);
            let (x, y) = (ship.x + libm::sin(bearing) * out, ship.y - libm::cos(bearing) * out);
            let at = Ship { x, y, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
            if pose_of(&at, &SLOOP, waters, time).aground {
                continue;
            }
            let to_player = crate::captain::course::heading_to([x, y], [ship.x, ship.y]);
            let slant = if draws.draw() < 0.5 { 1.0 } else { -1.0 } * (0.6 + draws.draw() * 0.9);
            let heading = (to_player + slant).rem_euclid(TAU);
            let heading = if heading < TAU { heading } else { 0.0 };
            let her_seed = draws.seed();
            let captain_ship = Ship { heading, ..at };
            let vessel = |ship: Ship, damage: Damage| Vessel {
                pose: pose_of(&ship, &SLOOP, waters, time),
                ship,
                damage,
                guns: Guns::new(),
            };
            return Ok(Fight {
                clock: 0.0,
                draws,
                player: vessel(ship, Damage::new(&LARGE_BOAT, true)),
                captain: vessel(captain_ship, Damage::new(&PIRATE_SLOOP, false)),
                her: Captain::new(PIRATE_SLOOP, her_seed, heading, &SLOOP_ARMS),
                balls: Vec::new(),
                struck_at: None,
                under: sink_depth(&SLOOP_ARMS, her_seed),
                over: None,
            });
        }
        Err("There is no open water for a captain near the Sloop.".into())
    }

    fn sighting(&self) -> Sighting {
        let damage = &self.player.damage;
        Sighting {
            ship: self.player.ship,
            level: self.player.pose.heave,
            hull_share: damage.hull_share(),
            wrecked: damage.state == State::Wrecked,
            power: Power::player(&LARGE_BOAT, damage.hull_share()),
        }
    }

    /// The side the player's look lays, as her guns would fire it now, if a side bears there.
    #[must_use]
    pub fn laid(&self, aim: &Aim) -> Option<Lay> {
        let side = side_for_bearing(aim.bearing_deg)?;
        let player = &self.player;
        Some(lay(&player.ship, &player.pose, &SLOOP_ARMS, side, player.guns.load, aim.range_m.max(0.0), None))
    }

    /// The player's lay, or why her guns will not fire it.
    fn fire_order(&self, aim: Option<&Aim>) -> Result<Lay, Refusal> {
        let lay = aim.and_then(|aim| self.laid(aim)).ok_or(Refusal::NoGuns)?;
        let player = &self.player;
        if player.damage.state == State::Wrecked {
            return Err(Refusal::Silent);
        }
        if player.guns.braced {
            return Err(Refusal::Braced);
        }
        if !player.guns.ready(lay.side) {
            return Err(Refusal::Reloading { side: lay.side, left: player.guns.left(lay.side) });
        }
        Ok(lay)
    }

    /// Whether a lay's balls, unscattered, would meet the captain's hull where she will be when they arrive.
    #[must_use]
    pub fn on_target(&self, lay: &Lay) -> bool {
        if self.captain.damage.state == State::Sunk {
            return false;
        }
        let block = hull_block(&self.captain.ship, &self.captain.pose, &SLOOP_ARMS);
        let moving = carry_of(&self.captain.ship);
        let carry = carry_of(&self.player.ship);
        let launch = crate::ballistics::launch_velocity(lay.dir, lay.elevation, lay.gun.speed, carry);
        lay.mouths.iter().any(|mouth| {
            let at = |time: f64| {
                let point = flight(*mouth, launch, time);
                [point[0] - moving[0] * time, point[1] - moving[1] * time, point[2]]
            };
            (0..80).any(|step| {
                let (from, to) = (f64::from(step) * 0.05, f64::from(step + 1) * 0.05);
                crate::ballistics::segment_entry(at(from), at(to), &block, lay.gun.radius_m).is_some()
            })
        })
    }

    /// A ball's strike: its harm by zone (grape's men by its flight), rolled; the struck grace for the rest of the
    /// volley that made the captain strike; and a captain struck by the player is provoked.
    fn strike(&mut self, hit: &ShotEvent, events: &mut Vec<Event>) {
        let ShotEvent::Hit { shooter, target, zone, flight, gun, shot, .. } = *hit else {
            return;
        };
        let gun = crate::guns::Gun { crew: gun.crew * shot_reach(shot, flight), ..gun };
        let graced = target == CAPTAIN && self.struck_at.is_some_and(|at| self.clock - at <= STRUCK_GRACE_S);
        let (tough, braced, floor) = if target == CAPTAIN {
            (SHIP_TOUGHNESS, false, if graced { 1.0 } else { 0.0 })
        } else {
            (PLAYER_CREW_TOUGHNESS, self.player.guns.braced, 0.0)
        };
        let roll = self.draws.draw();
        let mut hurt = shot_harm(&gun, zone, braced, roll, tough);
        let burns = zone == Zone::Hull || (zone == Zone::Rig && rig_fire(shot));
        hurt.fire = burns && self.draws.draw() < fire_chance(shot);
        let vessel = if target == CAPTAIN { &mut self.captain } else { &mut self.player };
        if let Some(state) = vessel.damage.apply(hurt, self.clock, floor) {
            events.push(Event::State { ship: target, state });
            if target == CAPTAIN && state == State::Struck {
                self.struck_at = Some(self.clock);
            }
        }
        if target == CAPTAIN && shooter == PLAYER {
            self.her.provoke();
        }
    }
}

impl Fight {
    /// One tick: the player's orders and her step, the captain's helm and step, both poses, the guns' clocks, the
    /// captain's guns, the player's fire, the balls and what they strike, fire and sinking, mending, and the end.
    pub fn step(&mut self, orders: &Orders, waters: &impl Waters, wind: [f64; 2], time: f64) -> Vec<Event> {
        let mut events = Vec::new();
        if self.over.is_some() {
            return events;
        }
        let seconds = TICK_SECONDS;
        self.clock += seconds;
        self.sail_player(orders, waters, wind, time, &mut events);
        self.sail_captain(waters, wind, time);
        self.player.guns.step(seconds);
        self.captain.guns.step(seconds);
        let sighting = self.sighting();
        let her = Her {
            ship: &self.captain.ship,
            pose: &self.captain.pose,
            damage: &self.captain.damage,
            guns: &self.captain.guns,
            arms: &SLOOP_ARMS,
            hull: &SLOOP,
            wind,
        };
        let battery = self.her.aim(&her, &sighting, &mut self.draws);
        if let Some(side) = battery.run_out {
            events.push(Event::RunOut { side });
        }
        if let Some(laid) = battery.fire {
            let seed = self.draws.seed();
            let (skill, carry) = (PIRATE_SLOOP.skill, carry_of(&self.captain.ship));
            self.balls.extend(volley(&laid, carry, skill, seed, self.clock, CAPTAIN));
            self.captain.guns.fired(laid.side, self.captain.damage.crew_share(), true);
        }
        if orders.fire {
            match self.fire_order(orders.aim.as_ref()) {
                Ok(laid) => {
                    let seed = self.draws.seed();
                    let carry = carry_of(&self.player.ship);
                    self.balls.extend(volley(&laid, carry, LARGE_BOAT.skill, seed, self.clock, PLAYER));
                    self.player.guns.fired(laid.side, 1.0, false);
                }
                Err(refusal) => events.push(Event::Refused(refusal)),
            }
        }
        let targets = [target_of(&self.player), target_of(&self.captain)];
        let mut balls = std::mem::take(&mut self.balls);
        for event in step_balls(&mut balls, self.clock, &targets, waters, time) {
            self.strike(&event, &mut events);
            events.push(Event::Shot(event));
        }
        self.balls = balls;
        for (ship, vessel) in [(PLAYER, &mut self.player), (CAPTAIN, &mut self.captain)] {
            if let Some(state) = vessel.damage.step(seconds, self.clock) {
                events.push(Event::State { ship, state });
            }
        }
        let apart = crate::captain::course::distance(
            [self.player.ship.x, self.player.ship.y],
            [self.captain.ship.x, self.captain.ship.y],
        );
        let hostile_near = self.her.hostile() && self.captain.damage.fighting() && apart < HOSTILE_NEAR_M;
        let wrecked = self.player.damage.state == State::Wrecked;
        self.player.damage.mend(seconds, self.clock, hostile_near, false);
        if wrecked && self.player.damage.state == State::Afloat {
            events.push(Event::State { ship: PLAYER, state: State::Afloat });
        }
        if self.captain.damage.state == State::Sunk {
            self.over = Some(End::Sunk);
        } else if apart > DESPAWN_BEYOND && self.her.mode != Mode::Engage {
            self.over = Some(End::Gone);
        }
        events
    }

    /// The player's tick: her brace and load, her sails refused a wreck or bare yards, and her step held back by her
    /// hurts.
    fn sail_player(
        &mut self,
        orders: &Orders,
        waters: &impl Waters,
        wind: [f64; 2],
        time: f64,
        events: &mut Vec<Event>,
    ) {
        let player = &mut self.player;
        player.guns.braced = orders.brace;
        if let Some(shot) = orders.load
            && player.guns.set_load(shot, 1.0, false)
        {
            events.push(Event::Load { shot });
        }
        let wrecked = player.damage.state == State::Wrecked;
        let mut helm = orders.helm;
        if (wrecked || player.damage.sail <= 0.0) && player.ship.rung.saturating_add(helm.climb) >= SAILS_SET {
            if helm.climb > 0 {
                events.push(Event::NoSail { wrecked });
            }
            helm.climb = if player.ship.rung >= SAILS_SET { -1 } else { 0 };
        }
        let pull = Pull {
            sail: if wrecked { 0.0 } else { player.damage.way_share() },
            oars: if wrecked { WRECKED_OARS } else { 1.0 },
        };
        player.ship = step_pulled(&player.ship, &helm, &SLOOP, wind, waters, time, TICK_SECONDS, pull);
        player.pose = pose_of(&player.ship, &SLOOP, waters, time);
    }

    /// The captain's tick: her helm against the player, her step held back by her canvas, and her pose as she lists
    /// and founders.
    fn sail_captain(&mut self, waters: &impl Waters, wind: [f64; 2], time: f64) {
        let sighting = self.sighting();
        let captain = &mut self.captain;
        let her = Her {
            ship: &captain.ship,
            pose: &captain.pose,
            damage: &captain.damage,
            guns: &captain.guns,
            arms: &SLOOP_ARMS,
            hull: &SLOOP,
            wind,
        };
        let helm = self.her.steer(&her, &sighting, TICK_SECONDS, &|x, y| floats(waters, x, y, time));
        let pull = Pull { sail: captain.damage.way_share(), oars: 1.0 };
        captain.ship = step_pulled(&captain.ship, &helm, &SLOOP, wind, waters, time, TICK_SECONDS, pull);
        let afloat = pose_of(&captain.ship, &SLOOP, waters, time);
        let (drop, pitch, roll) = founder(&captain.damage, self.her.seed, self.under);
        captain.pose =
            Pose { heave: afloat.heave - drop, pitch: afloat.pitch + pitch, roll: afloat.roll + roll, ..afloat };
    }

    /// Every number the fight holds, in a fixed order: what its fingerprint is taken over.
    #[must_use]
    pub fn numbers(&self) -> Vec<f64> {
        let mut numbers = vec![self.clock, f64::from(self.draws.state()), self.struck_at.unwrap_or(-1.0), self.under];
        for vessel in [&self.player, &self.captain] {
            numbers.extend(vessel.ship.to_floats());
            numbers.extend(vessel.pose.to_floats());
            numbers.extend(vessel.damage.numbers());
            numbers.extend(vessel.guns.numbers());
        }
        numbers.extend(self.her.numbers());
        for ball in &self.balls {
            numbers.extend(ball.start.into_iter().chain(ball.launch).chain([
                ball.born,
                ball.shooter as f64,
                ball.flown,
            ]));
            numbers.extend([
                f64::from(u8::from(ball.fired)),
                f64::from(u8::from(ball.rigged[0])),
                f64::from(u8::from(ball.rigged[1])),
            ]);
        }
        numbers.push(match self.over {
            None => 0.0,
            Some(End::Sunk) => 1.0,
            Some(End::Gone) => 2.0,
        });
        numbers
    }
}

#[cfg(test)]
#[path = "fight_tests.rs"]
mod tests;
