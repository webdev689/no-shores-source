//! One tick of a fight: each player's ship by her orders, each captain by her own lights, the guns' clocks, the
//! captains' volleys and then the players', the balls and what they strike, fire and sinking, mending, and the
//! captains who leave.

use super::{
    DESPAWN_BEYOND, End, Event, Fight, HOSTILE_NEAR_M, Hurts, Orders, Part, STRUCK_GRACE_S, STRUCK_HOLD_S, Sailor,
    carry_of, floats, her_of, sail_hurt, sighting_of, sink_depth,
};
use crate::arms::{LARGE_BOAT, Side, arms_of, unposed};
use crate::captain::course::distance;
use crate::captain::{CHASE_GIVE_UP_S, Mode};
use crate::damage::{PLAYER_CREW_TOUGHNESS, SHIP_TOUGHNESS, State, Zone, founder, shot_harm};
use crate::gunnery::{Lay, RELOAD_SINGLEHANDED, lay, volley};
use crate::guns::{fire_chance, rig_fire, shot_reach};
use crate::rigging::Torn;
use crate::shots::{Flag, ShipId, ShotEvent, step_balls};
use sailing::TICK_SECONDS;
use sailing::pose::{Pose, pose_of};
use sailing::waters::Waters;

impl Fight {
    /// One tick. `orders` are the players' in the order they are taken: each steps her ship once, so a player whose
    /// orders are late is caught up by several in one tick, and one with none this tick lies as she was, riding the
    /// swell. Then the captains, the guns, the volleys, the balls, the hurts, mending, and the captains who leave.
    pub fn step(&mut self, orders: &[(ShipId, Orders)], waters: &impl Waters, wind: [f64; 2], time: f64) -> Vec<Event> {
        let mut events = Vec::new();
        let seconds = TICK_SECONDS;
        self.clock += seconds;
        self.sail_players(orders, waters, wind, time, &mut events);
        for id in self.ids(true) {
            self.sail_captain(id, waters, wind, time);
        }
        self.keep_apart(waters, time);
        self.rams(&mut events);
        for vessel in self.ships.values_mut().filter(|vessel| vessel.in_fight()) {
            vessel.guns.step(seconds);
        }
        for id in self.ids(true) {
            self.captain_fires(id, wind, &mut events);
        }
        for (id, order) in orders.iter().filter(|(_, order)| order.fire) {
            self.player_fires(*id, order, &mut events);
        }
        for (id, order) in orders {
            self.gunner_fires(*id, order);
        }
        let targets = self.targets();
        let mut balls = std::mem::take(&mut self.balls);
        for event in step_balls(&mut balls, self.clock, &targets, waters, time) {
            self.strike(&event, &mut events);
            events.push(Event::Shot(event));
        }
        self.balls = balls;
        for (id, vessel) in self.ships.iter_mut().filter(|(_, vessel)| vessel.in_fight()) {
            if let Some(state) = vessel.damage.step(seconds, self.clock) {
                events.push(Event::State { ship: *id, state });
                if let Sailor::Captain(command) = &mut vessel.sailor
                    && state == State::Struck
                {
                    command.struck_at = Some(self.clock);
                }
            }
        }
        self.patch(seconds);
        self.mend(wind, &mut events);
        self.scuttle_unboarded(&mut events);
        self.see_off(&mut events);
        told(&mut events);
        events
    }

    /// Each captain who struck `STRUCK_HOLD_S` ago with no one aboard her is scuttled.
    fn scuttle_unboarded(&mut self, events: &mut Vec<Event>) {
        let clock = self.clock;
        let due: Vec<ShipId> = self
            .ships
            .iter()
            .filter(|(_, vessel)| vessel.damage.state == State::Struck)
            .filter(|(_, vessel)| {
                vessel.command().is_some_and(|command| {
                    !command.boarded && command.struck_at.is_some_and(|at| clock - at >= STRUCK_HOLD_S - 1e-9)
                })
            })
            .map(|(id, _)| *id)
            .collect();
        for id in due {
            // Its state and its going down are told with the tick's others.
            events.extend(self.scuttle(id).into_iter().filter(|event| matches!(event, Event::State { .. })));
        }
    }

    /// Each player's orders in turn: her brace and load, her sails refused a wreck or bare yards, and her step held
    /// back by her hurts. A player with no orders this tick rides the swell where she lies.
    fn sail_players(
        &mut self,
        orders: &[(ShipId, Orders)],
        waters: &impl Waters,
        wind: [f64; 2],
        time: f64,
        events: &mut Vec<Event>,
    ) {
        for (id, order) in orders {
            let afloat = |vessel: &&mut super::Vessel| !matches!(vessel.damage.state, State::Sinking | State::Sunk);
            let Some(player) = self.ships.get_mut(id).filter(|vessel| vessel.command().is_none()).filter(afloat) else {
                continue;
            };
            player.guns.braced = order.brace;
            if let Some(shot) = order.load
                && player.guns.set_load(shot, 1.0, false)
            {
                events.push(Event::Load { ship: *id, shot });
            }
            let hurts = Hurts::of(&player.damage).fitted(self.fittings.get(id));
            let (ship, refused) = sail_hurt(&player.ship, player.hull.hull(), order.helm, hurts, waters, wind, time);
            if let Some(wrecked) = refused {
                events.push(Event::NoSail { ship: *id, wrecked });
            }
            player.ship = ship;
            player.pose = pose_of(&player.ship, player.hull.hull(), waters, time);
        }
        let ordered = |id: &ShipId| orders.iter().any(|(given, _)| given == id);
        for (id, player) in self.ships.iter_mut().filter(|(_, vessel)| vessel.command().is_none()) {
            let afloat = pose_of(&player.ship, player.hull.hull(), waters, time);
            if matches!(player.damage.state, State::Sinking | State::Sunk) {
                // She founders as a captain does, to the side and end a seed of none says.
                let (drop, pitch, roll) = founder(&player.damage, 0, sink_depth(0, arms_of(player.hull)));
                player.pose = Pose {
                    heave: afloat.heave - drop,
                    pitch: afloat.pitch + pitch,
                    roll: afloat.roll + roll,
                    ..afloat
                };
            } else if !ordered(id) {
                player.pose = afloat;
            }
        }
    }

    /// A captain's tick: her helm among the ships she may fight, her step held back by her canvas, and her pose as
    /// she lists and founders.
    fn sail_captain(&mut self, id: ShipId, waters: &impl Waters, wind: [f64; 2], time: f64) {
        let (sightings, traffic) = (self.sightings(id), self.traffic(id));
        let Some(vessel) = self.ships.get_mut(&id) else { return };
        let Sailor::Captain(command) = &mut vessel.sailor else { return };
        let her = her_of(vessel.hull, (&vessel.ship, &vessel.pose), (&vessel.damage, &vessel.guns), wind);
        let hull = vessel.hull.hull();
        let is_water = |x, y| floats(waters, hull, x, y, time);
        let helm = command.her.steer(&her, (&sightings, &traffic), TICK_SECONDS, &is_water);
        // Her rank's way pulls her sails and her oars alike.
        let way = command.her.commission.rank.scale().way;
        let pull = sailing::ship::Pull { sail: vessel.damage.way_share() * way, oars: way, turn: 1.0 };
        vessel.ship = sailing::ship::step_pulled(&vessel.ship, &helm, hull, wind, waters, time, TICK_SECONDS, pull);
        let afloat = pose_of(&vessel.ship, hull, waters, time);
        let (drop, pitch, roll) = founder(&vessel.damage, command.her.seed, command.under);
        vessel.pose =
            Pose { heave: afloat.heave - drop, pitch: afloat.pitch + pitch, roll: afloat.roll + roll, ..afloat };
    }

    /// A captain's guns after her step: run out at her enemy, and fired as her rank arms and paces them.
    fn captain_fires(&mut self, id: ShipId, wind: [f64; 2], events: &mut Vec<Event>) {
        let sightings = self.sightings(id);
        let Some(vessel) = self.ships.get_mut(&id) else { return };
        let Sailor::Captain(command) = &mut vessel.sailor else { return };
        let enemy = command.her.target().and_then(|target| sightings.iter().find(|seen| seen.id == target));
        let her = her_of(vessel.hull, (&vessel.ship, &vessel.pose), (&vessel.damage, &vessel.guns), wind);
        let battery = command.her.aim(&her, enemy, &mut self.draws);
        if let Some(side) = battery.run_out {
            events.push(Event::RunOut { ship: id, side });
        }
        if let Some(laid) = battery.fire {
            let seed = self.draws.seed();
            let commission = command.her.commission;
            let laid = Lay { gun: commission.armed(laid.gun, command.her.strength), ..laid };
            let (skill, carry) = (command.her.build.skill, carry_of(&vessel.ship));
            let flag = Flag::Faction(commission.faction);
            self.balls.extend(volley(&laid, carry, skill, seed, self.clock, (id, flag)));
            vessel.guns.fired(laid.side, vessel.damage.crew_share(), true);
            vessel.guns.pace_reload(laid.side, commission.rank.scale().reload);
        }
    }

    /// A player's release: her lay fired, or why her guns would not.
    fn player_fires(&mut self, id: ShipId, order: &Orders, events: &mut Vec<Event>) {
        match self.fire_order(id, order.aim.as_ref()) {
            Ok(laid) => self.player_volley(id, laid),
            Err(refusal) => events.push(Event::Refused { ship: id, refusal }),
        }
    }

    /// A player's laid side fired: its scatter and its reload as its fitting trims them.
    fn player_volley(&mut self, id: ShipId, laid: Lay) {
        let trim = self.fittings.get(&id).map(|fitted| fitted.trim).unwrap_or_default();
        let scatter = |spread: f64| spread * trim.scatter;
        let gun = crate::guns::Gun {
            yaw_spread_deg: scatter(laid.gun.yaw_spread_deg),
            pitch_spread_deg: scatter(laid.gun.pitch_spread_deg),
            ..laid.gun
        };
        let laid = Lay { gun, ..laid };
        let seed = self.draws.seed();
        let Some(player) = self.ships.get_mut(&id) else { return };
        let carry = carry_of(&player.ship);
        self.balls.extend(volley(&laid, carry, LARGE_BOAT.skill, seed, self.clock, (id, Flag::Player)));
        // Its hands work its guns: whole, at the pace one player alone always loaded them; thinned, slower.
        player.guns.fired(laid.side, player.damage.crew_share(), true);
        player.guns.pace_reload(laid.side, RELOAD_SINGLEHANDED * trim.reload);
    }

    /// Its Gunner's broadside, when he has one to fire: the side its own lay this tick does not take.
    fn gunner_fires(&mut self, id: ShipId, order: &Orders) {
        let own = order.aim.as_ref().and_then(|aim| self.laid(id, aim)).map(|laid| laid.side);
        let afloat = self.ships.get(&id).is_some_and(|vessel| vessel.damage.fighting() && !vessel.guns.braced);
        if let Some(laid) = self.gunners_lay(id, own).filter(|_| afloat) {
            self.player_volley(id, laid);
        }
    }

    /// A ball's strike: its harm by zone (grape's men by its flight), rolled; the struck grace for the rest of the
    /// volley that made a captain strike; and a captain struck by a ship in the fight is provoked by her.
    pub(super) fn strike(&mut self, hit: &ShotEvent, events: &mut Vec<Event>) {
        let ShotEvent::Hit { shooter, target, zone, point, flight, gun, shot, sail } = *hit else {
            if let ShotEvent::Splash { point, .. } = *hit {
                events.push(Event::Splash { at: [point[0], point[1]] });
            }
            return;
        };
        let gun = crate::guns::Gun { crew: gun.crew * shot_reach(shot, flight), ..gun };
        let gun = self.fitted_gun(gun, shooter, target, zone);
        let clock = self.clock;
        // A ball strikes only another flag, so whoever fired it, a player or another faction's captain, is a foe.
        let shooter_in_fight = self.ships.contains_key(&shooter);
        let Some(vessel) = self.ships.get_mut(&target) else { return };
        let (tough, braced, floor) = match &vessel.sailor {
            Sailor::Captain(command) => {
                let graced = command.struck_at.is_some_and(|at| clock - at <= STRUCK_GRACE_S);
                (SHIP_TOUGHNESS, false, if graced { 1.0 } else { 0.0 })
            }
            Sailor::Player => (PLAYER_CREW_TOUGHNESS, vessel.guns.braced, 0.0),
        };
        let roll = self.draws.draw();
        let mut hurt = shot_harm(&gun, zone, braced, roll, tough);
        let burns = zone == Zone::Hull || (zone == Zone::Rig && rig_fire(shot));
        // A ball of a side of many guns takes her share of a Sloop's ball's harm and of its chance to set her alight.
        hurt.fire = burns && self.draws.draw() < fire_chance(shot) * gun.share;
        let hurt = vessel.damage.shared(hurt, gun.share);
        let state = vessel.damage.apply(hurt, clock, floor);
        if let Some(fitted) = self.fittings.get_mut(&target) {
            fitted.owe(&hurt);
        }
        let rig = sail.filter(|_| zone == Zone::Rig);
        let part = match rig {
            None => Part::Hull,
            Some(sail) if vessel.rigging.lost(sail) => Part::Rig,
            Some(_) => Part::Sail,
        };
        events.push(Event::Hit { ship: target, at: unposed(&vessel.ship, &vessel.pose, point), part });
        match rig.and_then(|sail| vessel.rigging.struck(sail, hurt.sail, vessel.damage.max_sail)) {
            Some(Torn::Sail(sail)) => {
                // Her drive loses the torn sail's share: her canvas holds no more than her standing sails give.
                vessel.damage.sail =
                    vessel.damage.sail.min((vessel.damage.max_sail * vessel.rigging.standing()).floor());
                events.push(Event::SailLost { ship: target, sail });
            }
            Some(Torn::Mast(mast)) => events.push(Event::MastFell { ship: target, mast }),
            None => {}
        }
        if let Sailor::Captain(command) = &mut vessel.sailor {
            if state == Some(State::Struck) {
                command.struck_at = Some(clock);
            }
            if shooter_in_fight {
                command.her.provoke(shooter);
            }
        }
        if let Some(state) = state {
            events.push(Event::State { ship: target, state });
        }
    }

    /// Each player's hands mend her if nothing hurt her lately and no captain who would take her lies near.
    fn mend(&mut self, wind: [f64; 2], events: &mut Vec<Event>) {
        let captains = self.ids(true);
        for id in self.ids(false) {
            let Some(sighting) = self.ships.get(&id).map(|player| sighting_of(id, player)) else { continue };
            let hostile_near = captains.iter().any(|captain| {
                let Some(vessel) = self.ships.get(captain) else { return false };
                let Some(command) = vessel.command() else { return false };
                let her = her_of(vessel.hull, (&vessel.ship, &vessel.pose), (&vessel.damage, &vessel.guns), wind);
                let would = command.her.would_take(&her, &sighting);
                would && distance([vessel.ship.x, vessel.ship.y], [sighting.ship.x, sighting.ship.y]) < HOSTILE_NEAR_M
            });
            let clock = self.clock;
            let Some(player) = self.ships.get_mut(&id) else { continue };
            let wrecked = player.damage.state == State::Wrecked;
            player.damage.mend(TICK_SECONDS, clock, hostile_near, false);
            player.damage.sail = player.damage.sail.min((player.damage.max_sail * player.rigging.standing()).floor());
            if wrecked && player.damage.state == State::Afloat {
                events.push(Event::State { ship: id, state: State::Afloat });
            }
        }
    }

    /// A captain who has sunk leaves the fight, as does one not fighting who is past every ship she may fight (each
    /// player's, and each afloat captain's of another faction), or, engaged by no captain, has been out of all their
    /// guns' reach for her give-up time, `CHASE_GIVE_UP_S`. One struck or going down never leaves but by sinking.
    fn see_off(&mut self, events: &mut Vec<Event>) {
        let foes: Vec<(Flag, [f64; 2], f64)> = self
            .ships
            .values()
            .filter(|vessel| vessel.in_fight() && vessel.damage.fighting())
            .map(|vessel| {
                let reach =
                    lay(&vessel.ship, &vessel.pose, arms_of(vessel.hull), Side::Starboard, vessel.guns.load, 0.0, None);
                (vessel.flag(), [vessel.ship.x, vessel.ship.y], reach.reach)
            })
            .collect();
        // The ships a captain engages: one of them stays in her fight however far she is out of reach.
        let hunted: Vec<ShipId> = (self.ships.values().filter_map(|vessel| vessel.command()))
            .filter(|command| command.gone.is_none() && command.her.mode == Mode::Engage)
            .filter_map(|command| command.her.target())
            .collect();
        let clock = self.clock;
        for id in self.ids(true) {
            let Some(vessel) = self.ships.get_mut(&id) else { continue };
            let (at, own) = ([vessel.ship.x, vessel.ship.y], vessel.flag());
            let others = || foes.iter().filter(|(flag, ..)| *flag != own);
            let nearest = others().map(|(_, foe, _)| distance(at, *foe)).fold(f64::INFINITY, f64::min);
            let out_of_reach = !hunted.contains(&id) && others().all(|(_, foe, reach)| distance(at, *foe) > *reach);
            let (sunk, struck) =
                (vessel.damage.state == State::Sunk, matches!(vessel.damage.state, State::Struck | State::Sinking));
            let Sailor::Captain(command) = &mut vessel.sailor else { continue };
            let engaging = command.her.mode == Mode::Engage;
            // Out of every foe's guns and not engaging: she breaks off once that has lasted her give-up time.
            command.out_of_reach_since =
                if out_of_reach && !engaging && !struck { command.out_of_reach_since.or(Some(clock)) } else { None };
            let broke_off = command.out_of_reach_since.is_some_and(|since| clock - since >= CHASE_GIVE_UP_S);
            let end = if sunk {
                Some(End::Sunk)
            } else if (nearest > DESPAWN_BEYOND || broke_off) && !engaging && !struck {
                // One who struck lies hove to for boarders until she is scuttled.
                Some(End::Gone)
            } else {
                None
            };
            if let Some(end) = end {
                command.gone = Some(end);
                events.push(Event::Gone { ship: id, end });
            }
        }
    }
}

/// Each colours struck and each going down of the tick told again as its own event, after the rest.
fn told(events: &mut Vec<Event>) {
    let again: Vec<Event> = events
        .iter()
        .filter_map(|event| match *event {
            Event::State { ship, state: State::Struck } => Some(Event::Struck { ship }),
            Event::State { ship, state: State::Sinking } => Some(Event::Sinking { ship }),
            _ => None,
        })
        .collect();
    events.extend(again);
}
