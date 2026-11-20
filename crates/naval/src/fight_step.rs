//! One tick of a fight: each player's ship by her orders, each captain by her own lights, the guns' clocks, the
//! captains' volleys and then the players', the balls and what they strike, fire and sinking, mending, and the
//! captains who leave.

use super::{
    DESPAWN_BEYOND, End, Event, Fight, HOSTILE_NEAR_M, Hurts, Orders, STRUCK_GRACE_S, Sailor, carry_of, floats, her_of,
    sail_hurt, sighting_of,
};
use crate::arms::LARGE_BOAT;
use crate::captain::Mode;
use crate::captain::course::distance;
use crate::damage::{PLAYER_CREW_TOUGHNESS, SHIP_TOUGHNESS, State, Zone, founder, shot_harm};
use crate::gunnery::{Lay, volley};
use crate::guns::{fire_chance, rig_fire, shot_reach};
use crate::shots::{Flag, ShipId, ShotEvent, step_balls};
use sailing::pose::{Pose, pose_of};
use sailing::waters::Waters;
use sailing::{SLOOP, TICK_SECONDS};

impl Fight {
    /// One tick. `orders` are the players' in the order they are taken: each steps her ship once, so a player whose
    /// orders are late is caught up by several in one tick, and one with none this tick lies as she was, riding the
    /// swell. Then the captains, the guns, the volleys, the balls, the hurts, mending, and the captains who leave.
    /// Each ship sails in the wind where she is, `wind_at` her place (m/s, east and south).
    pub fn step(
        &mut self,
        orders: &[(ShipId, Orders)],
        waters: &impl Waters,
        wind_at: &impl Fn([f64; 2]) -> [f64; 2],
        time: f64,
    ) -> Vec<Event> {
        let mut events = Vec::new();
        let seconds = TICK_SECONDS;
        self.clock += seconds;
        self.sail_players(orders, waters, wind_at, time, &mut events);
        for id in self.ids(true) {
            self.sail_captain(id, waters, wind_at, time);
        }
        self.keep_apart(waters, time);
        self.rams(&mut events);
        for vessel in self.ships.values_mut().filter(|vessel| vessel.in_fight()) {
            vessel.guns.step(seconds);
        }
        for id in self.ids(true) {
            self.captain_fires(id, wind_at, &mut events);
        }
        for (id, order) in orders.iter().filter(|(_, order)| order.fire) {
            self.player_fires(*id, order, &mut events);
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
        self.mend(wind_at, &mut events);
        self.see_off(&mut events);
        events
    }

    /// Each player's orders in turn: her brace and load, her sails refused a wreck or bare yards, and her step held
    /// back by her hurts. A player with no orders this tick rides the swell where she lies.
    fn sail_players(
        &mut self,
        orders: &[(ShipId, Orders)],
        waters: &impl Waters,
        wind_at: &impl Fn([f64; 2]) -> [f64; 2],
        time: f64,
        events: &mut Vec<Event>,
    ) {
        for (id, order) in orders {
            let Some(player) = self.ships.get_mut(id).filter(|vessel| vessel.command().is_none()) else { continue };
            player.guns.braced = order.brace;
            if let Some(shot) = order.load
                && player.guns.set_load(shot, 1.0, false)
            {
                events.push(Event::Load { ship: *id, shot });
            }
            let wind = wind_at([player.ship.x, player.ship.y]);
            let (ship, refused) = sail_hurt(&player.ship, order.helm, Hurts::of(&player.damage), waters, wind, time);
            if let Some(wrecked) = refused {
                events.push(Event::NoSail { ship: *id, wrecked });
            }
            player.ship = ship;
            player.pose = pose_of(&player.ship, &SLOOP, waters, time);
        }
        let ordered = |id: &ShipId| orders.iter().any(|(given, _)| given == id);
        for (_, player) in self.ships.iter_mut().filter(|(id, vessel)| vessel.command().is_none() && !ordered(id)) {
            player.pose = pose_of(&player.ship, &SLOOP, waters, time);
        }
    }

    /// A captain's tick: her helm among the ships she may fight, her step held back by her canvas, and her pose as
    /// she lists and founders.
    fn sail_captain(&mut self, id: ShipId, waters: &impl Waters, wind_at: &impl Fn([f64; 2]) -> [f64; 2], time: f64) {
        let (sightings, traffic) = (self.sightings(id), self.traffic(id));
        let Some(vessel) = self.ships.get_mut(&id) else { return };
        let Sailor::Captain(command) = &mut vessel.sailor else { return };
        let wind = wind_at([vessel.ship.x, vessel.ship.y]);
        let her = her_of((&vessel.ship, &vessel.pose), (&vessel.damage, &vessel.guns), wind);
        let is_water = |x, y| floats(waters, x, y, time);
        let helm = command.her.steer(&her, (&sightings, &traffic), TICK_SECONDS, &is_water);
        // Her rank's way pulls her sails and her oars alike.
        let way = command.her.commission.rank.scale().way;
        let pull = sailing::ship::Pull { sail: vessel.damage.way_share() * way, oars: way };
        vessel.ship = sailing::ship::step_pulled(&vessel.ship, &helm, &SLOOP, wind, waters, time, TICK_SECONDS, pull);
        let afloat = pose_of(&vessel.ship, &SLOOP, waters, time);
        let (drop, pitch, roll) = founder(&vessel.damage, command.her.seed, command.under);
        vessel.pose =
            Pose { heave: afloat.heave - drop, pitch: afloat.pitch + pitch, roll: afloat.roll + roll, ..afloat };
    }

    /// A captain's guns after her step: run out at her enemy, and fired as her rank arms and paces them.
    fn captain_fires(&mut self, id: ShipId, wind_at: &impl Fn([f64; 2]) -> [f64; 2], events: &mut Vec<Event>) {
        let sightings = self.sightings(id);
        let Some(vessel) = self.ships.get_mut(&id) else { return };
        let Sailor::Captain(command) = &mut vessel.sailor else { return };
        let enemy = command.her.target().and_then(|target| sightings.iter().find(|seen| seen.id == target));
        let wind = wind_at([vessel.ship.x, vessel.ship.y]);
        let her = her_of((&vessel.ship, &vessel.pose), (&vessel.damage, &vessel.guns), wind);
        let battery = command.her.aim(&her, enemy, &mut self.draws);
        if let Some(side) = battery.run_out {
            events.push(Event::RunOut { ship: id, side });
        }
        if let Some(laid) = battery.fire {
            let seed = self.draws.seed();
            let commission = command.her.commission;
            let laid = Lay { gun: commission.armed(laid.gun), ..laid };
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
            Ok(laid) => {
                let seed = self.draws.seed();
                let Some(player) = self.ships.get_mut(&id) else { return };
                let carry = carry_of(&player.ship);
                self.balls.extend(volley(&laid, carry, LARGE_BOAT.skill, seed, self.clock, (id, Flag::Player)));
                player.guns.fired(laid.side, 1.0, false);
            }
            Err(refusal) => events.push(Event::Refused { ship: id, refusal }),
        }
    }

    /// A ball's strike: its harm by zone (grape's men by its flight), rolled; the struck grace for the rest of the
    /// volley that made a captain strike; and a captain struck by a ship in the fight is provoked by her.
    pub(super) fn strike(&mut self, hit: &ShotEvent, events: &mut Vec<Event>) {
        let ShotEvent::Hit { shooter, target, zone, flight, gun, shot, .. } = *hit else {
            return;
        };
        let gun = crate::guns::Gun { crew: gun.crew * shot_reach(shot, flight), ..gun };
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
        hurt.fire = burns && self.draws.draw() < fire_chance(shot);
        let state = vessel.damage.apply(hurt, clock, floor);
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
    fn mend(&mut self, wind_at: &impl Fn([f64; 2]) -> [f64; 2], events: &mut Vec<Event>) {
        let captains = self.ids(true);
        for id in self.ids(false) {
            let Some(sighting) = self.ships.get(&id).map(|player| sighting_of(id, player)) else { continue };
            let hostile_near = captains.iter().any(|captain| {
                let Some(vessel) = self.ships.get(captain) else { return false };
                let Some(command) = vessel.command() else { return false };
                let wind = wind_at([vessel.ship.x, vessel.ship.y]);
                let her = her_of((&vessel.ship, &vessel.pose), (&vessel.damage, &vessel.guns), wind);
                let would = command.her.would_take(&her, &sighting);
                would && distance([vessel.ship.x, vessel.ship.y], [sighting.ship.x, sighting.ship.y]) < HOSTILE_NEAR_M
            });
            let clock = self.clock;
            let Some(player) = self.ships.get_mut(&id) else { continue };
            let wrecked = player.damage.state == State::Wrecked;
            player.damage.mend(TICK_SECONDS, clock, hostile_near, false);
            if wrecked && player.damage.state == State::Afloat {
                events.push(Event::State { ship: id, state: State::Afloat });
            }
        }
    }

    /// A captain who has sunk leaves the fight, as does one past every ship she may fight (each player's, and each
    /// afloat captain's of another faction) and not fighting; an ambush's captains leave it only by sinking.
    fn see_off(&mut self, events: &mut Vec<Event>) {
        let foes: Vec<(Flag, [f64; 2])> = self
            .ships
            .values()
            .filter(|vessel| vessel.command().is_none_or(|_| vessel.in_fight() && vessel.damage.fighting()))
            .map(|vessel| (vessel.flag(), [vessel.ship.x, vessel.ship.y]))
            .collect();
        for id in self.ids(true) {
            let Some(vessel) = self.ships.get_mut(&id) else { continue };
            let (at, own) = ([vessel.ship.x, vessel.ship.y], vessel.flag());
            let apart = foes.iter().filter(|(flag, _)| *flag != own).map(|(_, foe)| distance(at, *foe));
            let nearest = apart.fold(f64::INFINITY, f64::min);
            let sunk = vessel.damage.state == State::Sunk;
            let Sailor::Captain(command) = &mut vessel.sailor else { continue };
            let end = if sunk {
                Some(End::Sunk)
            } else if !self.ambush && nearest > DESPAWN_BEYOND && command.her.mode != Mode::Engage {
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
