//! What a fight leaves a player's ship, and the port cities that take her in. Her hull, canvas and men are kept with
//! her (as shares of whole) until repaired, and she starts every fight with them. A player whose ship goes down, or
//! who is beaten on a deck with no player left standing there, washes up at the nearest of the port cities: on foot by
//! its harbour, their ship moored at its roadstead, a sunk one at `SUNK_KEPT`. Within `REPAIR_REACH_M` of a port's
//! roadstead she may be repaired, free: made whole over a second for each hundredth missing (the most of hull, canvas
//! and men), `REPAIR_MOST_S` at most, lying at rest; sailing or leaving stops it where it stood.

use crate::PlayerId;
use std::collections::{BTreeMap, BTreeSet};
use world::layout::Layout;
use world::traffic::{Port, SeaWays, Traffic};

/// What a sunk ship comes back with: a tenth of her hull, a quarter of her canvas and half her men.
pub const SUNK_KEPT: [f64; 3] = [0.10, 0.25, 0.5];
/// How near a port's roadstead she is repaired, metres; and the longest a repair takes, seconds.
pub const REPAIR_REACH_M: f64 = 3_000.0;
pub const REPAIR_MOST_S: f64 = 100.0;
/// A repair takes this many seconds for each hundredth she is missing.
pub const REPAIR_S_PER_HUNDREDTH: f64 = 1.0;

/// A repair under way: what she had when it began, and the seconds it has run.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Repair {
    pub from: [f64; 3],
    pub seconds: f64,
}

impl Repair {
    /// How long making her whole from `from` takes, seconds.
    #[must_use]
    pub fn takes(from: [f64; 3]) -> f64 {
        let missing = from.iter().map(|share| 1.0 - share.clamp(0.0, 1.0)).fold(0.0, f64::max);
        (missing * 100.0 * REPAIR_S_PER_HUNDREDTH).min(REPAIR_MOST_S)
    }

    /// What she has now: each share risen evenly toward whole over the repair's time.
    #[must_use]
    pub fn now(&self) -> [f64; 3] {
        let takes = Repair::takes(self.from);
        let done = if takes > 0.0 { (self.seconds / takes).min(1.0) } else { 1.0 };
        self.from.map(|share| share + (1.0 - share) * done)
    }

    /// The seconds left.
    #[must_use]
    pub fn left(&self) -> f64 {
        (Repair::takes(self.from) - self.seconds).max(0.0)
    }
}

/// The port cities ships wash up at and are repaired by: each one's id and its roadstead, and the sea's ways between
/// points of open water that reckon which is nearest.
#[derive(Debug, Default)]
pub struct Harbours {
    pub ports: Vec<(String, [f64; 2])>,
    pub ways: Option<SeaWays>,
}

impl Harbours {
    /// The port cities of `ports` the layout holds, with their roadsteads (`world::traffic`).
    #[must_use]
    pub fn new(layout: &Layout, ports: &[Port]) -> Self {
        if ports.is_empty() {
            return Harbours::default();
        }
        let waters = world::waters::Waters::new(layout);
        let traffic = Traffic::new(layout, &waters, ports);
        let roadstead = |point: &world::geometry::Point| [point.x as f64, point.y as f64];
        let ports = traffic.ports.iter().zip(&traffic.roadsteads).map(|(port, at)| (port.id.clone(), roadstead(at)));
        Harbours { ports: ports.collect(), ways: Some(SeaWays::new(layout, &waters, &traffic.roadsteads)) }
    }

    /// The port nearest `at` by the sea's way there (round land, as the traffic's routes are planned), by its number
    /// among them; in a straight line where no port's way reaches, or with no ways planned.
    #[must_use]
    pub fn nearest(&self, at: [f64; 2]) -> Option<usize> {
        let point = world::geometry::Point::new(at[0].round() as i64, at[1].round() as i64);
        if let Some(port) = self.ways.as_ref().and_then(|ways| ways.nearest(point)) {
            return Some(port);
        }
        let straight = |port: &(String, [f64; 2])| libm::hypot(port.1[0] - at[0], port.1[1] - at[1]);
        (0..self.ports.len()).min_by(|one, other| straight(&self.ports[*one]).total_cmp(&straight(&self.ports[*other])))
    }

    /// Whether `at` lies within `REPAIR_REACH_M` of a port's roadstead.
    #[must_use]
    pub fn in_reach(&self, at: [f64; 2]) -> bool {
        self.ports.iter().any(|(_, port)| libm::hypot(port[0] - at[0], port[1] - at[1]) <= REPAIR_REACH_M)
    }
}

/// Each player's repair under way, stepped a tick at a time.
#[derive(Debug, Default)]
pub struct Repairs {
    pub under_way: BTreeMap<PlayerId, Repair>,
}

impl Repairs {
    /// One tick of `seconds`: each repair runs on; one done is answered with what she has, and ends.
    pub fn tick(&mut self, seconds: f64) -> Vec<(PlayerId, [f64; 3])> {
        let mut done = Vec::new();
        for (player, repair) in &mut self.under_way {
            repair.seconds += seconds;
            done.push((*player, repair.now()));
        }
        self.under_way.retain(|_, repair| repair.left() > 0.0);
        done
    }

    /// A repair stops where it stood: what she has then, if one was under way.
    pub fn stop(&mut self, player: PlayerId) -> Option<[f64; 3]> {
        self.under_way.remove(&player).map(|repair| repair.now())
    }
}

/// Why a repair was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RepairRefused {
    /// No such player, or their ship not at sea.
    NotAtSea,
    /// In a fight, under way, or past `REPAIR_REACH_M` of every port's roadstead.
    NotThere,
    /// She is whole.
    Whole,
}

/// A course held for the keeper's word: its points and its pace.
pub type HeldCourse = (Vec<[f64; 2]>, u16);

/// What the sea keeps after its fights: its port cities, each repair under way, what floats, each player's character
/// once the accounts gave it, and what each player is told this tick (`naval::wire::told_numbers`'s numbers).
#[derive(Debug, Default)]
pub struct Harbour {
    pub harbours: Harbours,
    pub repairs: Repairs,
    pub flotsam: crate::flotsam::Flotsam,
    pub characters: BTreeMap<PlayerId, gear::Character>,
    pub told: Vec<(PlayerId, Vec<f64>)>,
    /// In a sea that keeps characters, each player the keeper has not yet answered for, with the last course they
    /// asked meanwhile; none in a sea that keeps none.
    pub awaiting: Option<BTreeMap<PlayerId, Option<HeldCourse>>>,
    /// Each player whose character changed since their gear was last sent them, and the tick it was last sent.
    pub changed: BTreeSet<PlayerId>,
    pub gear_sent: BTreeMap<PlayerId, u64>,
    /// The account that keeps each player's character, kept after they leave: what floats for them waits for it, and
    /// a ship they fought is told as theirs.
    pub accounts: BTreeMap<PlayerId, String>,
    /// Each captain's ship gone down in the last tick, for its hosts to take.
    pub downs: Vec<crate::battle::ShipDown>,
}

impl Harbour {
    /// Forgets all it keeps for a player who left the sea.
    pub fn forget(&mut self, player: PlayerId) {
        self.characters.remove(&player);
        self.changed.remove(&player);
        self.gear_sent.remove(&player);
        if let Some(awaiting) = self.awaiting.as_mut() {
            awaiting.remove(&player);
        }
    }
}

/// A player told they washed up: the code, the sea's tick, the port by its number among the port cities (-1 at an
/// island), whether their ship went down (1) or they were beaten aboard her enemy (0), and the island's number where
/// they washed up at one they found (0 at a port).
pub const WASHED_UP: f64 = 20.0;
/// A player told that someone joined their fight: the code, the tick, the player's number (0 for a hostile ship),
/// and a hostile ship's faction, rank and hull (`HullKind::number`; 0 for a player).
pub const JOINED: f64 = 22.0;
/// A player told where their ship lies once the accounts gave her back: the code, the tick, x and y, and her heading.
pub const MOORED: f64 = 23.0;
/// A player told what a piece they gathered held: the code, the tick, the piece, the Vestige's rarity (0 none, else
/// the gear crate's number and one), and whether it held an Ammo box and an Ammo crate (1 or 0).
pub const HELD: f64 = 21.0;

#[cfg(test)]
#[path = "harbour_tests.rs"]
mod tests;
