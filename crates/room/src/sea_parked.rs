//! Ships lying parked: a player who leaves the sea with their ship at rest by an island leaves it lying where it is,
//! kept by their account. It is seen, at sea and from the island, only while a place's room names that account ashore
//! at the island it lies at; unseen once no room names it (its player logged off or gone elsewhere), seen again as one
//! does, and let go after a day unnamed or as its player comes back to any sea, the ship theirs again. A parked ship
//! is never one of the sea's ships: no hostile ship or fight heeds it, though a sea island is rolled clear of it. Its
//! namings are timed by the host's clock, as the rooms' words tell it (`tell_seconds`), for a sea room ticks only
//! while someone sails it.

use super::islands::Islands;
use super::{Coast, Sea, Ship, ShipLook, whole};
use crate::PlayerId;
use crate::plates::Plate;
use std::collections::BTreeMap;
use std::ptr;
use world::layout::Layout;

/// How far off an island's coast a ship at rest is docked at it, and is parked as its player leaves, metres: a berth
/// lies well within this of a port's, a ruined coast's or a sea island's shore, and a ship out at sea well past it.
pub const PARKED_REACH_M: i64 = 5_000;
/// How long a naming keeps a parked ship seen, seconds: three of a place's namings, each 15 s apart, so one lost on the
/// way lets nothing go. A ship no room has named yet is kept as one named as it was parked, though seen by no one.
pub const NAMED_S: u64 = 45;
/// How long a parked ship no room names is kept unseen before it is let go, seconds: a day, so a player who logs off
/// on their island finds it docked there again, and the sea keeps no ship for ever.
pub const KEPT_S: u64 = 24 * 3600;
/// The most ships the sea keeps parked: past it, the one parked longest ago is let go.
pub const PARKED_MOST: usize = 1024;
/// How an account played as a guest begins (server/worker.ts): its ship is its session's, never parked.
const GUEST: &str = "unkept:";
/// The sea's ticks in a second (movement's `TICK_SECONDS`).
const TICKS_A_SECOND: u64 = 60;

/// Where a place's room stands as it names its players to the sea: on an island of the layout, by its continent's
/// id; on a sea island, by its number and seed; or anywhere, a run started at sea, whose players' ships stay parked
/// wherever they lie.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ashore<'place> {
    Continent(&'place str),
    Island { id: u32, seed: u64 },
    Anywhere,
}

/// A ship lying parked: the number it is sent under (its player's at sea as they left), where it lies at rest, its
/// looks and the plate over it, whether a room has named its account yet, the host's second it is kept until, and
/// how many ships were parked before it.
#[derive(Clone, Debug, PartialEq)]
pub struct Parked {
    pub number: PlayerId,
    pub ship: Ship,
    pub look: ShipLook,
    pub plate: Plate,
    named: bool,
    until: u64,
    order: u64,
}

/// Every parked ship by its account, the id of each continent the sea has a coast for, in its coasts' order, the
/// host's latest second the sea was told and its clock then, and how many ships have been parked.
#[derive(Debug, Default)]
pub(crate) struct ParkedShips {
    pub(crate) by_account: BTreeMap<String, Parked>,
    continents: Vec<String>,
    told: (u64, u64),
    parkings: u64,
}

impl ParkedShips {
    pub(crate) fn new(layout: &Layout) -> Self {
        ParkedShips { continents: super::Coast::ids(layout), ..ParkedShips::default() }
    }
}

impl Sea {
    /// Leaves a leaving player's ship parked where it is, if it is at rest within `PARKED_REACH_M` of a continent's
    /// coast or a standing sea island's, out of any fight and its account known and no guest's; those no room named
    /// in time are let go, and past `PARKED_MOST` the one parked longest ago.
    pub(super) fn park(&mut self, player: PlayerId) {
        self.let_go_unnamed();
        let Some(account) = self.harbour.accounts.get(&player).filter(|account| !account.starts_with(GUEST)) else {
            return;
        };
        let berth = self.berths.get(&player).and_then(|berth| berth.sailing.as_ref());
        let Some(sailing) = berth.filter(|sailing| sailing.course.is_empty()) else { return };
        let (Some(look), Some(plate)) = (self.look(player), self.plate(player)) else { return };
        let by_coast = coast_at(&self.coasts, &self.islands, &sailing.ship).is_some();
        if !by_coast || self.fights.fighting(player) || self.on_deck(player) {
            return;
        }
        let ship = Ship { pace: 0, rate: 0, ..sailing.ship };
        let (until, order) = (self.host_seconds().saturating_add(NAMED_S), self.parked.parkings);
        let parked = Parked { number: player, ship, look, plate, named: false, until, order };
        self.parked.parkings += 1;
        self.parked.by_account.insert(account.clone(), parked);
        if self.parked.by_account.len() > PARKED_MOST {
            let oldest = self.parked.by_account.iter().min_by_key(|(_, parked)| parked.order);
            if let Some(account) = oldest.map(|(account, _)| account.clone()) {
                self.parked.by_account.remove(&account);
            }
        }
    }

    /// A player back at sea under `account`, in this sea or another tier's, sails their ship again: it lies parked no
    /// more.
    pub fn unpark(&mut self, account: &str) {
        self.parked.by_account.remove(account);
    }

    /// A parked ship as its player's character has it now, as a place's room names them: the ship it sails as others
    /// see it (one bought, dressed or renamed ashore) and their level on its plate. Nothing for an account with no
    /// ship parked.
    pub fn refit(&mut self, account: &str, look: ShipLook, level: u8) {
        if let Some(parked) = self.parked.by_account.get_mut(account) {
            (parked.look, parked.plate.level) = (look, level);
        }
    }

    /// The host's time as a place's room tells it with its naming, seconds since the Unix epoch: the sea's namings
    /// are timed by it, as the sea stops ticking while nobody sails it. A time before one already told changes nothing.
    pub fn tell_seconds(&mut self, seconds: u64) {
        self.parked.told = (self.host_seconds().max(seconds), self.clock);
    }

    /// The host's time, seconds since the Unix epoch: the latest it told, on by the sea's ticks since, and never
    /// before the minute it set (`minute`, set as the sea starts ticking). Held at its most rather than wrapped round,
    /// so a time told near it neither panics nor turns back to show a lapsed naming again.
    fn host_seconds(&self) -> u64 {
        let (seconds, clock) = self.parked.told;
        seconds.saturating_add((self.clock - clock) / TICKS_A_SECOND).max(self.minute.saturating_mul(60))
    }

    /// A place's room names the accounts of the players it holds: each one's parked ship lying at its island (the
    /// coast nearest it, `coast_at`; any parked ship for `Ashore::Anywhere`) is seen for `NAMED_S` more, and a sea
    /// island named is held as `hold_ashore` holds it. The answer is every parked ship seen that lies at the island, by
    /// its account: none for a room at no island, or at a sea island that does not stand.
    pub fn ashore(&mut self, place: Ashore<'_>, accounts: &[&str]) -> Vec<(String, Parked)> {
        let now = self.host_seconds();
        self.let_go_unnamed();
        if let Ashore::Island { id, seed } = place {
            self.hold_ashore(id, seed);
        }
        let coast = match place {
            Ashore::Continent(id) => {
                self.parked.continents.iter().position(|each| each == id).and_then(|at| self.coasts.get(at))
            }
            Ashore::Island { id, seed } => {
                self.islands.by_id(id).filter(|island| island.seed == seed).map(|island| &island.coast)
            }
            Ashore::Anywhere => None,
        };
        let lies_at = |ship: &Ship| {
            coast.is_some_and(|coast| coast_at(&self.coasts, &self.islands, ship).is_some_and(|at| ptr::eq(at, coast)))
        };
        for account in accounts {
            let Some(parked) = self.parked.by_account.get_mut(*account) else { continue };
            if place == Ashore::Anywhere || lies_at(&parked.ship) {
                (parked.named, parked.until) = (true, now.saturating_add(NAMED_S));
            }
        }
        let seen = (self.parked.by_account.iter())
            .filter(|(_, parked)| parked.named && now <= parked.until && lies_at(&parked.ship));
        seen.map(|(account, parked)| (account.clone(), parked.clone())).collect()
    }

    /// Lets go of every parked ship no room has named for `KEPT_S`.
    fn let_go_unnamed(&mut self) {
        let now = self.host_seconds();
        self.parked.by_account.retain(|_, parked| now <= parked.until.saturating_add(KEPT_S));
    }

    /// Every parked ship seen: those a room has named, and whose naming holds.
    pub fn parked(&self) -> impl Iterator<Item = &Parked> {
        let now = self.host_seconds();
        self.parked.by_account.values().filter(move |parked| parked.named && now <= parked.until)
    }
}

/// The coast a ship lies at: of the continents' coasts and the standing sea islands' within `PARKED_REACH_M` of it,
/// the nearest, the first of those as near; none out at sea. A sea island may stand closer than that to a coast or
/// another island, and each ship lies at one place alone.
fn coast_at<'sea>(coasts: &'sea [Coast], islands: &'sea Islands, ship: &Ship) -> Option<&'sea Coast> {
    let at = whole(&[ship.x, ship.y])?;
    let near = coasts.iter().chain(islands.coasts()).filter(|coast| coast.within(at, PARKED_REACH_M));
    near.min_by(|one, other| one.off(at).total_cmp(&other.off(at)))
}
