//! Opening a chest or searching a container, E held as a node is gathered: a chest a second within CHEST_REACH of its
//! middle, a container a second and a half within SEARCH_REACH of its sides, alive, on foot and on its level. Being
//! hurt, mounting, falling or the find no longer standing stops it, and so does stirring or letting go before its
//! last GATHER_GRACE_TICKS. Then it is opened for that player, kept for their account however often they rejoin, and
//! pays them what it holds (`gear::finds`): a Vestige poured out of a chest as its lid opens, or thrown out of a
//! container to their feet as a kill's drops are.

use crate::asks::{GATHER_GRACE_TICKS, GATHER_STIR_M, MOUNTED, OUT_OF_REACH};
use crate::finds::{Holder, Standing};
use crate::{PlayerId, Room};
use gear::finds::Find;

/// How long a chest is held open and a container searched, ticks.
pub const OPEN_TICKS: u64 = 60;
pub const SEARCH_TICKS: u64 = 90;
/// How near a chest's middle a body opens it, and how near a container's sides it searches it, across; and how far
/// above or below its foot, metres.
pub const CHEST_REACH: f64 = 2.5;
pub const SEARCH_REACH: f64 = 1.5;
pub const FIND_HEIGHT: f64 = 2.0;

/// A find being opened, E held: its number, the tick it began, where the body stood, its health last tick, and
/// whether E was let go of.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Opening {
    pub number: u32,
    pub since: u64,
    pub at: [f64; 2],
    pub health: f64,
    pub let_go: bool,
}

/// How far a point lies from a holder's box across, 0 inside it.
fn off_box(holder: &Holder, [x, y]: [f64; 2]) -> f64 {
    let [west, north, east, south, ..] = *holder;
    libm::hypot((west - x).max(x - east).max(0.0), (north - y).max(y - south).max(0.0))
}

impl Room {
    /// Begins to open a find by its number, E held: 0, or why not.
    pub(crate) fn open_find(&mut self, player: PlayerId, number: u32) -> u8 {
        if let Some(refused) = self.find_refused(player, number) {
            return refused;
        }
        let Some(fighter) = self.fighter(player).copied() else { return OUT_OF_REACH };
        let (since, at, health) = (self.clock, [fighter.body.x, fighter.body.y], fighter.health);
        self.finds.opening.insert(player, Opening { number, since, at, health, let_go: false });
        0
    }

    /// Why `player` may not open a find now, as its answer's code: it stands not, or not for them (opened already),
    /// they are down, out of its reach, or on horseback.
    pub(crate) fn find_refused(&self, player: PlayerId, number: u32) -> Option<u8> {
        let Some(standing) = self.finds.standing(number) else { return Some(OUT_OF_REACH) };
        let (Some(fighter), Some(found)) = (self.fighter(player), self.players.get(&player)) else {
            return Some(OUT_OF_REACH);
        };
        let dead = fighter.dead() || matches!(found.standing, crate::Standing::Dead { .. });
        let body = [fighter.body.x, fighter.body.y];
        let (across, foot, reach) = match standing {
            Standing::Chest([x, y, z, _]) => (libm::hypot(body[0] - x, body[1] - y), z, CHEST_REACH),
            Standing::Holder(holder) => (off_box(&holder, body), holder[4], SEARCH_REACH),
        };
        let far = across > reach || (fighter.body.z - foot).abs() > FIND_HEIGHT;
        if dead || far || self.opened_by(player).contains(&number) {
            Some(OUT_OF_REACH)
        } else if found.mounted {
            Some(MOUNTED)
        } else {
            None
        }
    }

    /// Keeps each find being opened for a tick, as `keep_gathering` keeps a gather: one held its time opens.
    pub(crate) fn keep_opening(&mut self) {
        let under_way: Vec<(PlayerId, Opening)> =
            self.finds.opening.iter().map(|(&id, &opening)| (id, opening)).collect();
        for (player, opening) in under_way {
            let Some(fighter) = self.fighter(player).copied() else { continue };
            let held = match self.finds.standing(opening.number) {
                Some(Standing::Holder(_)) => SEARCH_TICKS,
                _ => OPEN_TICKS,
            };
            let stirred = libm::hypot(fighter.body.x - opening.at[0], fighter.body.y - opening.at[1]);
            let broken = self.find_refused(player, opening.number).is_some() || fighter.health < opening.health;
            let left = (opening.since + held).saturating_sub(self.clock);
            let ended = opening.let_go || stirred > GATHER_STIR_M;
            let done = !broken && (left == 0 || (ended && left <= GATHER_GRACE_TICKS));
            if !(broken || ended || done) {
                self.finds.opening.insert(player, Opening { health: fighter.health, ..opening });
                continue;
            }
            self.finds.opening.remove(&player);
            if let Some(found) = self.players.get_mut(&player) {
                found.gear_changed = true;
            }
            if done {
                self.pay_find(player, opening.number);
            }
        }
    }

    /// Opens a find for a player: kept as theirs and their account's, then paid at the room's level for finds.
    fn pay_find(&mut self, player: PlayerId, number: u32) {
        let Some(standing) = self.finds.standing(number) else { return };
        let (level, resource, difficulty, source) =
            (self.find_level(), self.resource_here(), self.difficulty, self.source);
        let dice = self.dice(player);
        let Some(found) = self.players.get_mut(&player) else { return };
        self.finds.by_player.entry(player).or_default().push(number);
        self.finds.last_paid.insert(player, number);
        if let Some(owner) = &found.owner {
            self.finds.opened.entry(owner.clone()).or_default().push(number);
        }
        let kind = match standing {
            Standing::Chest(_) => self.finds.chest_find(number),
            Standing::Holder(_) => Find::Search,
        };
        let paid = found.character.find(kind, (level, difficulty), resource, source, &dice);
        found.gear_changed = true;
        let body = [found.fighter.body.x, found.fighter.body.y, found.fighter.body.z];
        match standing {
            Standing::Chest([x, y, z, _]) => self.pour(player, paid.vestiges, [x, y, z], None),
            Standing::Holder([west, north, east, south, _, top, _]) => {
                for vestige in paid.vestiges {
                    let from = [(west + east) / 2.0, (north + south) / 2.0, top];
                    self.lay(player, crate::Dropped::Vestige(vestige), body, from);
                }
            }
        }
    }

    /// The level a room's finds are of: its island's band's middle, else its garrison's highest, raised by its seas
    /// as its foes are; at least 1.
    pub(crate) fn find_level(&self) -> u8 {
        let band = self.island.and_then(gear::world::island_levels);
        let middle = band.map(|(low, high)| low + high.saturating_sub(low) / 2);
        let garrisoned = self.garrison.iter().filter_map(|post| post.girds.first()).map(|&(level, _)| level).max();
        self.at_seas(middle.or(garrisoned).unwrap_or(1)).max(1)
    }

    /// The island's resource here, by its place in the catalogue's list: the patrol's nodes', else its island's.
    pub(crate) fn resource_here(&self) -> Option<usize> {
        let noded = self.resource_nodes.first().map(|node| usize::from(node.resource));
        noded.or_else(|| {
            let island = self.island?;
            gear::catalogue::catalogue().resources.iter().position(|resource| resource.continent == island)
        })
    }
}
