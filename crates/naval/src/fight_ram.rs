//! Hulls in a fight after every ship has moved: those that overlap pushed apart, and each player's stem ramming a
//! ship of another flag it meets with way on, by the ram's law.

use super::{Event, Fight, Sailor, Vessel};
use crate::arms::{hull_block, posed};
use crate::captain::course::velocity_of;
use crate::damage::{BRACE_TAKEN, Hurt, SHIP_TOUGHNESS, State, founder, rounded};
use crate::ram::{
    Flat, RAM_COOLDOWN_S, RAM_MEMORY_S, RAM_REACH, RAM_SPEED, RECOIL_SHARE, driven_into, overlap, ram_blow,
    ram_closing, ram_contact, ram_line, ram_men, ram_paid, ram_room, recoil_room,
};
use crate::shots::ShipId;
use sailing::pose::{Pose, frame, keel_spots, pose_of};
use sailing::ship::{Ship, aground};
use sailing::waters::Waters;
use std::collections::{BTreeMap, VecDeque};

/// A player's stem as the ram's law keeps it: its way over the last moments (the fight's clock, then its velocity),
/// and when it last rammed each ship.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Stem {
    ways: VecDeque<(f64, [f64; 2])>,
    rammed: BTreeMap<ShipId, f64>,
}

impl Stem {
    /// Every number it holds, in a fixed order.
    #[must_use]
    pub fn numbers(&self) -> Vec<f64> {
        let mut numbers = vec![self.ways.len() as f64];
        numbers.extend(self.ways.iter().flat_map(|(at, way)| [*at, way[0], way[1]]));
        numbers.push(self.rammed.len() as f64);
        numbers.extend(self.rammed.iter().flat_map(|(ship, at)| [f64::from(*ship), *at]));
        numbers
    }
}

/// A hull on the flat: its hull's box, its middle set forward of the hull's as the box is.
fn flat_of(vessel: &Vessel) -> Flat {
    let [low, high] = vessel.arms().hull;
    let (forward, starboard) = frame(vessel.ship.heading);
    let ahead = (high[0] + low[0]) / 2.0;
    Flat {
        middle: [vessel.ship.x + forward[0] * ahead, vessel.ship.y + forward[1] * ahead],
        forward,
        starboard,
        half_length: (high[0] - low[0]) / 2.0,
        half_beam: high[1].max(-low[1]),
    }
}

/// Its pose on the water at `time`, as it founders: a captain's always, a player's going down.
fn settle(vessel: &mut Vessel, waters: &impl Waters, time: f64) {
    let afloat = pose_of(&vessel.ship, vessel.hull.hull(), waters, time);
    let going_down = matches!(vessel.damage.state, State::Sinking | State::Sunk);
    // A player's founders as `sail_players` has it, a seed of none saying its side and end.
    let (seed, under) = match &vessel.sailor {
        Sailor::Captain(command) => (command.mind.seed, command.under),
        Sailor::Player if going_down => (0, super::sink_depth(0, vessel.arms())),
        Sailor::Player => {
            vessel.pose = afloat;
            return;
        }
    };
    let (drop, pitch, roll) = founder(&vessel.damage, seed, under);
    vessel.pose = Pose { heave: afloat.heave - drop, pitch: afloat.pitch + pitch, roll: afloat.roll + roll, ..afloat };
}

/// Moves it by `push` and cuts its way by how squarely it drove into it.
fn shove(vessel: &mut Vessel, push: [f64; 2]) {
    let (forward, _) = frame(vessel.ship.heading);
    let kept = 1.0 - driven_into(forward, push);
    let ship = &mut vessel.ship;
    (ship.x, ship.y) = (ship.x + push[0], ship.y + push[1]);
    (ship.ahead, ship.sail_way) = (ship.ahead * kept, ship.sail_way * kept);
}

impl Fight {
    /// Hulls that overlap pushed apart, each pair in the order of their numbers: each out of the other by half the
    /// overlap, its way cut by how squarely it drove into it; one that half would ground, as the ground refuses a
    /// ship's own move (`aground`), stays, and the other takes the whole push where that leaves it afloat. A ship gone
    /// down is no longer in the way.
    pub(super) fn keep_apart(&mut self, waters: &impl Waters, time: f64) {
        let ids: Vec<ShipId> = self
            .ships
            .iter()
            .filter(|(_, vessel)| vessel.in_fight() && vessel.damage.state != State::Sunk)
            .map(|(id, _)| *id)
            .collect();
        for (at, first) in ids.iter().enumerate() {
            for second in &ids[at + 1..] {
                let (Some(one), Some(other)) = (self.ships.get(first), self.ships.get(second)) else { continue };
                let Some(push) = overlap(&flat_of(one), &flat_of(other)) else { continue };
                let afloat = |vessel: &Vessel, share: f64| {
                    let hull = vessel.hull.hull();
                    let moved =
                        Ship { x: vessel.ship.x + push[0] * share, y: vessel.ship.y + push[1] * share, ..vessel.ship };
                    !aground(&keel_spots(&vessel.ship, hull, waters, time), &moved, hull, waters, time)
                };
                let shares = match (afloat(one, 0.5), afloat(other, -0.5)) {
                    (true, true) => [0.5, -0.5],
                    (true, false) => [if afloat(one, 1.0) { 1.0 } else { 0.5 }, 0.0],
                    (false, true) => [0.0, if afloat(other, -1.0) { -1.0 } else { -0.5 }],
                    (false, false) => [0.0, 0.0],
                };
                for (id, share) in [(*first, shares[0]), (*second, shares[1])] {
                    if let Some(vessel) = self.ships.get_mut(&id).filter(|_| share != 0.0) {
                        shove(vessel, [push[0] * share, push[1] * share]);
                        settle(vessel, waters, time);
                    }
                }
            }
        }
    }

    /// Each player's stem, after every ship has moved: its way kept for `RAM_MEMORY_S`, and, with way on along it
    /// keel and afloat, a ram on the first ship of another flag it meets, one a tick.
    pub(super) fn rams(&mut self, events: &mut Vec<Event>) {
        let clock = self.clock;
        let players: Vec<ShipId> =
            self.ships.iter().filter(|(_, vessel)| vessel.command().is_none()).map(|(id, _)| *id).collect();
        for id in players {
            let Some(vessel) = self.ships.get(&id) else { continue };
            let way = velocity_of(&vessel.ship);
            let (forward, _) = frame(vessel.ship.heading);
            let stem = self.stems.entry(id).or_default();
            stem.ways.push_back((clock, way));
            while stem.ways.front().is_some_and(|(at, _)| clock - at > RAM_MEMORY_S) {
                stem.ways.pop_front();
            }
            stem.rammed.retain(|_, at| clock - *at < RAM_COOLDOWN_S);
            let driving = stem.ways.iter().any(|(_, way)| way[0] * forward[0] + way[1] * forward[1] >= RAM_SPEED);
            if driving && vessel.damage.state == State::Afloat {
                self.ram_from(id, events);
            }
        }
    }

    /// Its stem on the first ship of another flag it meets, if its way drives a blow home it can pay for.
    fn ram_from(&mut self, id: ShipId, events: &mut Vec<Event>) {
        let (Some(vessel), Some(stem)) = (self.ships.get(&id), self.stems.get(&id)) else { return };
        // Its stem: the fore end of its own hull's box.
        let [_, high] = vessel.arms().hull;
        let point = posed(&vessel.ship, &vessel.pose, [high[0], 0.0, 1.0]);
        let share = RECOIL_SHARE * if vessel.guns.braced { BRACE_TAKEN } else { 1.0 };
        let ways: Vec<[f64; 2]> = stem.ways.iter().map(|(_, way)| *way).collect();
        let mine = &vessel.damage;
        let struck = self.ships.iter().find_map(|(target, other)| {
            let fair = other.flag() != vessel.flag() && other.in_fight() && other.damage.state == State::Afloat;
            if !fair || stem.rammed.contains_key(target) {
                return None;
            }
            let contact = ram_contact(&hull_block(&other.ship, &other.pose, other.arms()), point, RAM_REACH)?;
            let closing = ram_closing(&ways, velocity_of(&other.ship), contact.normal);
            let blow = ram_blow(closing, contact.side, mine.max_hull, other.damage.max_hull);
            let blow = self.fitted_ram(id, *target, blow);
            let blow = ram_paid(blow, recoil_room(mine), share);
            (blow >= 1.0).then_some((*target, blow))
        });
        let Some((target, blow)) = struck else { return };
        let recoil = rounded(blow * share).min(recoil_room(mine));
        if let Some(stem) = self.stems.get_mut(&id) {
            stem.rammed.insert(target, self.clock);
            stem.ways.clear();
        }
        let roll = self.draws.draw();
        let clock = self.clock;
        let Some(other) = self.ships.get_mut(&target) else { return };
        let dealt = blow.min(ram_room(&other.damage));
        let crew = ram_men(dealt, roll, SHIP_TOUGHNESS);
        let floor = ram_line(&other.damage);
        let change = other.damage.apply(Hurt { hull: blow, sail: 0.0, crew, fire: false }, clock, floor);
        if let Sailor::Captain(command) = &mut other.sailor {
            if change == Some(State::Struck) {
                command.struck_at = Some(clock);
            }
            command.mind.provoke(id);
        }
        events.push(Event::Ram { ship: target, by: id, point, dealt });
        if let Some(state) = change {
            events.push(Event::State { ship: target, state });
        }
        if let Some(rammer) = self.ships.get_mut(&id)
            && let Some(state) =
                rammer.damage.apply(Hurt { hull: recoil, sail: 0.0, crew: 0.0, fire: false }, clock, 0.0)
        {
            events.push(Event::State { ship: id, state });
        }
    }
}
