//! Ships lying parked: a player who leaves the sea with their ship at rest leaves it lying where it is, kept by their
//! account. It is seen, at sea and from the island, only while a place's room names that account ashore at the island
//! it lies at; unseen once no room names it (its player logged off or gone elsewhere), seen again as one does, and let
//! go after a day unnamed or as its player comes back to the sea, the ship theirs again. A parked ship is never one of the sea's ships: no hostile
//! ship, fight or island heeds it.

use super::{Sea, Ship, ShipLook, whole};
use crate::PlayerId;
use crate::plates::Plate;
use std::collections::BTreeMap;
use world::layout::Layout;

/// How far off an island's coast a parked ship may lie and still lie at it, metres: a landfall's reach, as a node's
/// room judges a ship landed from the sea (server/arrival.ts `LANDFALL_M`).
pub const LANDFALL_M: i64 = 32_000;
/// How long a naming keeps a parked ship seen, ticks, and how long one no room has named yet is kept: three of a
/// place's namings, each about 15 s apart, so one lost on the way lets nothing go.
pub const NAMED_TICKS: u64 = 45 * 60;
/// How long a parked ship no room names is kept unseen before it is let go: a day, so a player who logs off on their
/// island finds it docked there again, and the sea keeps no ship for ever.
pub const KEPT_TICKS: u64 = 24 * 3600 * 60;

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
/// looks and the plate over it, whether a room has named its account yet, and the tick it is kept until.
#[derive(Clone, Debug, PartialEq)]
pub struct Parked {
    pub number: PlayerId,
    pub ship: Ship,
    pub look: ShipLook,
    pub plate: Plate,
    named: bool,
    until: u64,
}

/// Every parked ship by its account, and the id of each continent the sea has a coast for, in its coasts' order.
#[derive(Debug, Default)]
pub(crate) struct ParkedShips {
    pub(crate) by_account: BTreeMap<String, Parked>,
    continents: Vec<String>,
}

impl ParkedShips {
    pub(crate) fn new(layout: &Layout) -> Self {
        ParkedShips { by_account: BTreeMap::new(), continents: super::Coast::ids(layout) }
    }
}

impl Sea {
    /// Leaves a leaving player's ship parked where it lies, if it is at rest, out of any fight and its account known;
    /// those no room named in time are let go.
    pub(super) fn park(&mut self, player: PlayerId) {
        self.let_go_unnamed();
        let Some(account) = self.harbour.accounts.get(&player) else { return };
        let berth = self.berths.get(&player).and_then(|berth| berth.sailing.as_ref());
        let Some(sailing) = berth.filter(|sailing| sailing.course.is_empty()) else { return };
        let (Some(look), Some(plate)) = (self.look(player), self.plate(player)) else { return };
        if self.fights.fighting(player) || self.on_deck(player) {
            return;
        }
        let ship = Ship { pace: 0, rate: 0, ..sailing.ship };
        let parked = Parked { number: player, ship, look, plate, named: false, until: self.clock + NAMED_TICKS };
        self.parked.by_account.insert(account.clone(), parked);
    }

    /// A player back at sea under `account` sails their ship again: it lies parked no more.
    pub(super) fn unpark(&mut self, account: &str) {
        self.parked.by_account.remove(account);
    }

    /// A place's room names the accounts of the players it holds: each one's parked ship lying at its island (any
    /// parked ship for `Ashore::Anywhere`) is seen for `NAMED_TICKS` more, and a sea island named is held as
    /// `hold_ashore` holds it. The answer is every parked ship seen that lies at the island, by its account: none for
    /// a room at no island, or at a sea island that does not stand.
    pub fn ashore(&mut self, place: Ashore<'_>, accounts: &[&str]) -> Vec<(String, Parked)> {
        let clock = self.clock;
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
            coast.is_some_and(|coast| whole(&[ship.x, ship.y]).is_some_and(|at| coast.within(at, LANDFALL_M)))
        };
        for account in accounts {
            let Some(parked) = self.parked.by_account.get_mut(*account) else { continue };
            if place == Ashore::Anywhere || lies_at(&parked.ship) {
                (parked.named, parked.until) = (true, clock + NAMED_TICKS);
            }
        }
        let seen = (self.parked.by_account.iter())
            .filter(|(_, parked)| parked.named && clock <= parked.until && lies_at(&parked.ship));
        seen.map(|(account, parked)| (account.clone(), parked.clone())).collect()
    }

    /// Lets go of every parked ship no room has named for `KEPT_TICKS`.
    fn let_go_unnamed(&mut self) {
        let clock = self.clock;
        self.parked.by_account.retain(|_, parked| clock <= parked.until + KEPT_TICKS);
    }

    /// Every parked ship seen: those a room has named, and whose naming holds.
    pub fn parked(&self) -> impl Iterator<Item = &Parked> {
        self.parked.by_account.values().filter(|parked| parked.named && self.clock <= parked.until)
    }
}
