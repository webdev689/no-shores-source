//! How a foe comes, after Destiny: some stand on the ground already (a garrison as its room opens, a site's or a
//! quest's group as a player nears it); others arrive. The Grey Tithe's come by airship: the ship flies in, hangs
//! over the ground it brings them to, lets each down in turn, built from the feet up as a player arriving is, and
//! flies on. The Lattice's come under its crystal: a crown of it forms in the air, each foe forms under it, and it
//! breaks. A Boss's called foes arrive where they stand. A foe arriving neither thinks, steps nor hears, no foe sees
//! it, and no blow, shot or cast touches it, until it has landed: the owner's "some enemies are already on the
//! ground, while others come in from a dropship or spawn effect".

use crate::{Floor, Room};
use combat::fighter::FighterId;
use combat::sight::{apart, bearing};
use core::f64::consts::PI;
use std::collections::BTreeMap;

/// What brings a foe: a Grey Tithe airship, a Lattice crown, or a Boss's call (numbered on the wire in protocol's
/// `land.rs`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Bringer {
    Airship,
    Crown,
    Called,
}

/// An airship's flight, in ticks: in from far off to hang over its ground, a moment to settle, each foe let down this
/// long after the one before and built this long, the ship lingering after the last stands and flying on out of sight.
/// It carries this many foes at most; more go in a second ship.
pub const FLY_IN: u64 = 8 * 60;
pub const SETTLE: u64 = 60;
pub const LET_DOWN_GAP: u64 = 30;
pub const TITHE_BUILD: u64 = 60;
pub const LINGER: u64 = 72;
pub const FLY_OUT: u64 = 9 * 60;
pub const SHIP_MOST: usize = 6;
const SECOND_SHIP_LAG: u64 = 90;
/// Ships coming to ground nearer each other than this, metres, hang one over the other.
const SHIPS_APART: f64 = 40.0;
/// How high a ship hangs over its ground, metres: each further ship this much higher.
pub const HANGS_HIGH: f64 = 16.0;
const HIGHER_EACH: f64 = 8.0;
/// A ship comes in toward the nearest player, swung this far either way off the line to them, radians.
const SWING: f64 = 0.6;
/// A crown's life, in ticks: forming in the air, each foe forming this long after the one before and taking this
/// long, the crown holding after the last stands, then breaking.
pub const CROWN_FORMS: u64 = 72;
pub const CROWN_GAP: u64 = 15;
pub const LATTICE_BUILD: u64 = 78;
pub const CROWN_HOLDS: u64 = 36;
pub const CROWN_BREAKS: u64 = 48;
/// A called foe is built where it stands as quickly as a player arriving is.
pub const CALLED_BUILD: u64 = 36;
/// The draws of a ship's swing come from a stream of their own.
const ARRIVAL_STREAM: u64 = 0x6169_7273_6869_7073;

/// What brings foes, as the page draws it: its number; what it is; the point on the ground it brings them to (x, y,
/// z); the way an airship comes, radians clockwise from north (a crown's turn); how high it hangs over the ground; and
/// the ticks it set out (a crown began forming), hangs there (a crown stands whole), lets its last foe go (breaks) and
/// is gone.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ArrivalSeen {
    pub id: u32,
    pub kind: Bringer,
    pub at: [f64; 3],
    pub heading: f64,
    pub high: f64,
    pub began: u64,
    pub hangs: u64,
    pub leaves: u64,
    pub gone: u64,
}

/// A foe arriving: what brings it, the number of what brings it (0 for a call), the tick it is let down (before which
/// it is not seen) and the tick it lands, whole.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FoeArrival {
    pub kind: Bringer,
    pub from: u32,
    pub drops: u64,
    pub lands: u64,
}

/// What is bringing foes, and the foes arriving.
#[derive(Debug, Default)]
pub(crate) struct Arrivals {
    next: u32,
    pub bringers: Vec<ArrivalSeen>,
    pub foes: BTreeMap<FighterId, FoeArrival>,
}

impl Room {
    /// Whether foes here come under the open sky, where an airship flies: a node's land or an island's, never a
    /// dungeon's halls, a Breach's dark or a deck.
    pub(crate) fn open_sky(&self) -> bool {
        matches!(self.floor, Floor::Land(_) | Floor::Island(_))
    }

    /// Whether a foe is still arriving: not yet landed whole.
    pub(crate) fn arriving(&self, id: FighterId) -> bool {
        self.arrivals.foes.get(&id).is_some_and(|arrival| self.clock < arrival.lands)
    }

    /// A foe's arrival as the page draws it, while it is arriving.
    pub(crate) fn arrival_of(&self, id: FighterId) -> Option<FoeArrival> {
        self.arrivals.foes.get(&id).copied().filter(|arrival| self.clock < arrival.lands)
    }

    /// Everything bringing foes now.
    #[must_use]
    pub fn arrivals_seen(&self) -> &[ArrivalSeen] {
        &self.arrivals.bringers
    }

    /// The Grey Tithe's `foes`, stood at their places, come by airship under the open sky: a ship for each SHIP_MOST
    /// of them, hanging over the middle of the places its foes stand at, coming in toward the nearest player; a ship
    /// coming to ground another is over sets out a little later and hangs higher. Elsewhere they stand as stood.
    pub(crate) fn by_airship(&mut self, foes: &[FighterId]) {
        if !self.open_sky() {
            return;
        }
        for carried in foes.chunks(SHIP_MOST) {
            let Some(at) = self.middle_of(carried) else { continue };
            let over = |bringer: &&ArrivalSeen| {
                bringer.kind == Bringer::Airship && apart([bringer.at[0], bringer.at[1]], [at[0], at[1]]) < SHIPS_APART
            };
            let nth = self.arrivals.bringers.iter().filter(over).count();
            let began = self.clock + SECOND_SHIP_LAG * nth as u64;
            let id = self.next_arrival();
            let hangs = began + FLY_IN;
            let mut last = hangs;
            for (turn, foe) in carried.iter().enumerate() {
                let drops = hangs + SETTLE + LET_DOWN_GAP * turn as u64;
                last = drops + TITHE_BUILD;
                let arrival = FoeArrival { kind: Bringer::Airship, from: id, drops, lands: last };
                self.arrivals.foes.insert(*foe, arrival);
            }
            let heading = self.heading_in(at, id);
            let high = HANGS_HIGH + HIGHER_EACH * nth as f64;
            let leaves = last + LINGER;
            let seen =
                ArrivalSeen { id, kind: Bringer::Airship, at, heading, high, began, hangs, leaves, gone: leaves };
            self.arrivals.bringers.push(ArrivalSeen { gone: leaves + FLY_OUT, ..seen });
        }
    }

    /// The Lattice's `foes`, stood at their places, come under a crown of its crystal formed over their middle.
    pub(crate) fn under_crown(&mut self, foes: &[FighterId]) {
        let Some(at) = self.middle_of(foes) else { return };
        let id = self.next_arrival();
        let began = self.clock;
        let hangs = began + CROWN_FORMS;
        let mut last = hangs;
        for (turn, foe) in foes.iter().enumerate() {
            let drops = hangs + CROWN_GAP * turn as u64;
            last = drops + LATTICE_BUILD;
            self.arrivals.foes.insert(*foe, FoeArrival { kind: Bringer::Crown, from: id, drops, lands: last });
        }
        let heading = f64::from(id) * 2.399_963;
        let leaves = last + CROWN_HOLDS;
        let seen = ArrivalSeen { id, kind: Bringer::Crown, at, heading, high: 0.0, began, hangs, leaves, gone: leaves };
        self.arrivals.bringers.push(ArrivalSeen { gone: leaves + CROWN_BREAKS, ..seen });
    }

    /// A foe a Boss calls, built where it stands.
    pub(crate) fn as_called(&mut self, foe: FighterId) {
        let arrival =
            FoeArrival { kind: Bringer::Called, from: 0, drops: self.clock, lands: self.clock + CALLED_BUILD };
        self.arrivals.foes.insert(foe, arrival);
    }

    /// Each tick: a foe landing this tick takes up the hunt it came with afresh, at its target as it stands now (its
    /// order is as old as its arrival); a foe landed, fallen or gone is arriving no more; and what brought foes is gone
    /// once it has flown off or broken.
    pub(crate) fn keep_arrivals(&mut self) {
        let clock = self.clock;
        let landing: Vec<FighterId> =
            self.arrivals.foes.iter().filter(|(_, arrival)| arrival.lands == clock).map(|(id, _)| *id).collect();
        for id in landing {
            let Some(target) = self.foes.get(&id).and_then(|foe| foe.brain.target()) else { continue };
            let Some(body) = self.fighter(target).filter(|fighter| !fighter.dead()).map(|fighter| fighter.body) else {
                continue;
            };
            if let Some(foe) = self.foes.get_mut(&id) {
                foe.brain.hunt(target, [body.x, body.y, body.z], clock);
            }
        }
        let foes = &self.foes;
        self.arrivals
            .foes
            .retain(|id, arrival| arrival.lands > clock && foes.get(id).is_some_and(|foe| !foe.fighter.dead()));
        self.arrivals.bringers.retain(|bringer| bringer.gone > clock);
    }

    fn next_arrival(&mut self) -> u32 {
        self.arrivals.next += 1;
        self.arrivals.next
    }

    /// The middle of where foes stand, on the ground under it: their places' mean, at their mean height.
    fn middle_of(&self, foes: &[FighterId]) -> Option<[f64; 3]> {
        let bodies: Vec<[f64; 3]> = foes
            .iter()
            .filter_map(|id| self.foes.get(id))
            .map(|foe| [foe.fighter.body.x, foe.fighter.body.y, foe.fighter.body.z])
            .collect();
        let count = bodies.len() as f64;
        (!bodies.is_empty()).then(|| {
            let sum = bodies.iter().fold([0.0; 3], |sum, at| [sum[0] + at[0], sum[1] + at[1], sum[2] + at[2]]);
            sum.map(|part| part / count)
        })
    }

    /// The way an airship comes in to `at`: toward the nearest living player, swung off that line by a draw, so it is
    /// seen coming; with no player, the way its draw says.
    fn heading_in(&self, at: [f64; 3], id: u32) -> f64 {
        let mut draws = crate::garrison::draws_of(self.world_seed ^ ARRIVAL_STREAM ^ u64::from(id));
        let swing = (draws.draw() * 2.0 - 1.0) * SWING;
        let nearest = self
            .players
            .values()
            .filter(|player| player.living())
            .map(|player| [player.fighter.body.x, player.fighter.body.y])
            .min_by(|one, two| apart(*one, [at[0], at[1]]).total_cmp(&apart(*two, [at[0], at[1]])));
        nearest.map_or(draws.draw() * 2.0 * PI, |player| bearing([at[0], at[1]], player) + swing)
    }
}

#[cfg(test)]
#[path = "arrivals_tests.rs"]
mod arrivals_tests;
