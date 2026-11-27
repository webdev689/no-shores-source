//! What a fight leaves a player's ship, and the port cities that take it in. Its hull, canvas and men are kept with
//! it (as shares of whole) until repaired, and it starts every fight with them. A player whose ship goes down, or
//! who is beaten on a deck with no player left standing there, washes up at the nearest of the port cities: on foot by
//! its harbour, their ship moored at its roadstead, a sunk one at `SUNK_KEPT`. Lying at rest within `REPAIR_REACH_M` of
//! a port's roadstead it may be repaired: made whole at once for `repair_price`'s Aurem.

use crate::PlayerId;
use std::collections::{BTreeMap, BTreeSet};
use world::layout::Layout;
use world::traffic::{Port, SeaWays, Traffic};

/// What a sunk ship comes back with: a tenth of its hull, a quarter of its canvas and half its men.
pub const SUNK_KEPT: [f64; 3] = [0.10, 0.25, 0.5];
/// How near a port's roadstead it is repaired, metres.
pub const REPAIR_REACH_M: f64 = 3_000.0;
/// What a repair costs for each whole percent the ship is missing, Aurem.
pub const REPAIR_AUREM_PER_PERCENT: u32 = 2;

/// What making a ship whole from `kept` costs, Aurem: `REPAIR_AUREM_PER_PERCENT` for each percent missing of the most
/// missing of hull, canvas and men, a part of a percent counted whole; nothing for a whole ship.
#[must_use]
pub fn repair_price(kept: [f64; 3]) -> u32 {
    let missing = kept.iter().map(|share| 1.0 - share.clamp(0.0, 1.0)).fold(0.0, f64::max);
    // A share read back from the character's ten-thousandths lands a hair past its percent, never a whole millionth.
    let percent = (missing * 100.0 - 1e-6).ceil().max(0.0) as u32;
    percent * REPAIR_AUREM_PER_PERCENT
}

/// The port cities ships wash up at and are repaired by: each one's id and its roadstead, and the sea's ways between
/// points of open water that reckon which is nearest.
#[derive(Debug, Default)]
pub struct Harbours {
    pub ports: Vec<(String, [f64; 2])>,
    pub ways: Option<SeaWays>,
    /// Whether each port lies in a locked sea, by its number: no ship washes up, puts in or is repaired there.
    pub locked: Vec<bool>,
}

impl Harbours {
    /// The port cities of `ports` the layout holds, with their roadsteads (`world::traffic`).
    #[must_use]
    pub fn new(layout: &Layout, ports: &[Port]) -> Self {
        if ports.is_empty() {
            return Harbours::default();
        }
        let waters = world::waters::Waters::new(layout);
        let (kept, roadsteads) = Traffic::roadsteads(layout, &waters, ports);
        let roadstead = |point: &world::geometry::Point| [point.x as f64, point.y as f64];
        let ports = kept.iter().zip(&roadsteads).map(|(port, at)| (port.id.clone(), roadstead(at)));
        Harbours { ports: ports.collect(), ways: Some(SeaWays::new(layout, &waters, &roadsteads)), locked: Vec::new() }
    }

    /// Whether the port numbered `port` lies in an open sea.
    fn open(&self, port: usize) -> bool {
        !self.locked.get(port).copied().unwrap_or(false)
    }

    /// The open port nearest `at` by the sea's way there (round land, as the traffic's routes are planned), by its
    /// number among them; in a straight line where no port's way reaches, the nearest by way is locked, or with no
    /// ways planned.
    #[must_use]
    pub fn nearest(&self, at: [f64; 2]) -> Option<usize> {
        let point = world::geometry::Point::new(at[0].round() as i64, at[1].round() as i64);
        if let Some(port) = self.ways.as_ref().and_then(|ways| ways.nearest(point)).filter(|&port| self.open(port)) {
            return Some(port);
        }
        let straight = |port: &(String, [f64; 2])| libm::hypot(port.1[0] - at[0], port.1[1] - at[1]);
        let open = (0..self.ports.len()).filter(|&port| self.open(port));
        open.min_by(|one, other| straight(&self.ports[*one]).total_cmp(&straight(&self.ports[*other])))
    }

    /// Whether `at` lies within `REPAIR_REACH_M` of an open port's roadstead.
    #[must_use]
    pub fn in_reach(&self, at: [f64; 2]) -> bool {
        let near = |(_, port): &(String, [f64; 2])| libm::hypot(port[0] - at[0], port[1] - at[1]) <= REPAIR_REACH_M;
        self.ports.iter().enumerate().any(|(number, port)| self.open(number) && near(port))
    }

    /// Whether a ship not yet at sea may put to sea at `at`: within reach of a port city's roadstead, where the page
    /// first lays it off the city it leaves. A sea opened with no port cities has nowhere else: there it puts to sea
    /// anywhere.
    #[must_use]
    pub fn puts_to_sea(&self, at: world::geometry::Point) -> bool {
        self.ports.is_empty() || self.in_reach([at.x as f64, at.y as f64])
    }

    /// The roadstead of the port a new character first puts to sea from: Overlook's (`world::ports::MAIN_PORTS`).
    #[must_use]
    pub fn starting(&self) -> Option<[f64; 2]> {
        self.ports.iter().find(|(id, _)| id == world::ports::MAIN_PORTS[0]).map(|(_, roadstead)| *roadstead)
    }
}

/// Why a repair was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RepairRefused {
    /// No such player, or their ship not at sea.
    NotAtSea,
    /// In a fight, under way, or past `REPAIR_REACH_M` of every port's roadstead.
    NotThere,
    /// It is whole.
    Whole,
    /// The player's character holds less Aurem than the repair costs, or the sea holds no character for them.
    TooLittleAurem,
}

/// A course held for the keeper's word: its points and its pace.
pub type HeldCourse = (Vec<[f64; 2]>, u16);

/// What the sea keeps after its fights: its port cities, what floats, each player's character once the accounts gave
/// it, and what each player is told this tick (`naval::wire::told_numbers`'s numbers).
#[derive(Debug, Default)]
pub struct Harbour {
    pub harbours: Harbours,
    pub flotsam: crate::flotsam::Flotsam,
    pub characters: BTreeMap<PlayerId, gear::Character>,
    /// Each kept player's guild, as the host told it (`guild_book.rs`).
    pub guilds: crate::guild_book::Guilds,
    pub told: Vec<(PlayerId, Vec<f64>)>,
    /// In a sea that keeps characters, each player the keeper has not yet answered for, with the last course they
    /// asked meanwhile; none in a sea that keeps none.
    pub awaiting: Option<BTreeMap<PlayerId, Option<HeldCourse>>>,
    /// Each player whose character changed since their gear was last sent them, and the tick it was last sent.
    pub changed: BTreeSet<PlayerId>,
    pub gear_sent: BTreeMap<PlayerId, u64>,
    /// The account that keeps each player's character, kept after they leave: what floats for them waits for it.
    pub accounts: BTreeMap<PlayerId, String>,
    /// Each player's account's username, as the accounts gave it, for the plate over their ship.
    pub names: BTreeMap<PlayerId, String>,
    /// Each player's guild's tag, as their host told it, for the plate over their ship; none in no guild.
    pub tags: BTreeMap<PlayerId, String>,
    /// Where each owner's ship lay as they left the sea unkept (a kept character keeps its own), its heading and the
    /// tick too: the sea's last word on it, where it comes back however far the page puts it, as a ship sails nowhere
    /// while its player is away. The LEFT_MOST latest at most.
    pub left: BTreeMap<String, [f64; 4]>,
    /// The room each kept player came to the sea from, as the keeper knew it, until their character is restored.
    pub came_from: BTreeMap<PlayerId, String>,
}

/// How many owners' ships the sea remembers where they were left.
pub const LEFT_MOST: usize = 1_024;

impl Harbour {
    /// Forgets all it keeps for a player who left the sea.
    pub fn forget(&mut self, player: PlayerId) {
        self.characters.remove(&player);
        self.names.remove(&player);
        self.tags.remove(&player);
        self.changed.remove(&player);
        self.gear_sent.remove(&player);
        self.came_from.remove(&player);
        if let Some(awaiting) = self.awaiting.as_mut() {
            awaiting.remove(&player);
        }
    }
}

/// A player told they washed up: the code, the sea's tick, the port by its number among the port cities (-1 at an
/// island), whether their ship went down (1) or they were beaten aboard its enemy (0), and the island's number where
/// they washed up at one they found (0 at a port).
pub const WASHED_UP: f64 = 20.0;
/// A player told that someone joined their fight: the code, the tick, the player's number (0 for a hostile ship),
/// a hostile ship's faction and rank (0 for a player), and the hull the ship that joined sails (`HullKind::number`).
pub const JOINED: f64 = 22.0;
/// A player told where their ship lies once the accounts gave it back: the code, the tick, x and y, and its heading.
pub const MOORED: f64 = 23.0;
/// A player told what a piece they gathered held: the code, the tick, the piece, the Vestige's rarity (0 none, else
/// the gear crate's number and one), whether it held an Ammo box and an Ammo crate (1 or 0), each ship's material
/// taken (`ShipMaterial::ALL`'s order), and whether a module was taken (1 or 0): what tells the player a piece that
/// gave them nothing.
pub const HELD: f64 = 21.0;

#[cfg(test)]
#[path = "harbour_tests.rs"]
mod tests;
