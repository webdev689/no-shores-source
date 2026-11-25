//! Where a ship puts to sea, and comes back: a new one at a port's roadstead, never the page's own point, and one its
//! owner sailed before where the sea last had it, as a ship sails nowhere while its player is away; and the sea's loot
//! rolled on the host's own seeds, never the sea's, which its islands' seeds show.

use super::{Point, Sea, whole};
use crate::PlayerId;

impl Sea {
    /// Rolls what floats and what each boarded deck drops from the host's own seeds, kept from the players: the sea's
    /// seed shows in its islands', so its loot must not come from it.
    pub fn reseed(&mut self, loot: u64, world: u64) {
        self.harbour.flotsam.reseed(loot);
        self.decks.seeds = Some((loot, world));
    }

    /// Remembers where a player's ship lay as they left unkept, by its owner, the latest `LEFT_MOST` owners kept.
    pub(super) fn remember_left(&mut self, player: PlayerId) {
        let ship = self.berths.get(&player).and_then(|berth| berth.sailing.as_ref()).map(|sailing| sailing.ship);
        let unkept = !self.harbour.characters.contains_key(&player);
        if let (Some(owner), Some(ship), true) = (self.harbour.accounts.get(&player), ship, unkept) {
            let left = &mut self.harbour.left;
            left.insert(owner.clone(), [ship.x, ship.y, ship.heading, self.clock as f64]);
            if left.len() > crate::harbour::LEFT_MOST {
                let oldest = left.iter().min_by(|one, other| one.1[3].total_cmp(&other.1[3])).map(|(at, _)| at.clone());
                left.remove(&oldest.unwrap_or_default());
            }
        }
    }

    /// Where a ship not yet at sea puts in: where the sea last had its owner's ship; else, asked by a port city within
    /// reach of its roadstead, at that roadstead itself, never the page's own point; in a sea with no port cities,
    /// where the page asks. None where it may not put to sea.
    pub(super) fn puts_in(&self, player: PlayerId, asked: Point) -> Option<Point> {
        let left = self.harbour.accounts.get(&player).and_then(|owner| self.harbour.left.get(owner));
        let [x, y] = match left {
            Some([x, y, ..]) => [*x, *y],
            None if !self.harbour.harbours.puts_to_sea(asked) => return None,
            None if self.harbour.harbours.ports.is_empty() => return Some(asked),
            None => {
                let port = self.harbour.harbours.nearest([asked.x as f64, asked.y as f64])?;
                self.harbour.harbours.ports.get(port)?.1
            }
        };
        whole(&[x, y])
    }

    /// A ship put in at `at` on a course the sea took: where its owner's ship was left is used up, the page told where
    /// it lies when it is not where it asked; the heading it puts in with, as it was left, else north.
    pub(super) fn put_in(&mut self, player: PlayerId, at: Point, asked: Point) -> f64 {
        let owner = self.harbour.accounts.get(&player).cloned();
        let heading = owner.and_then(|owner| self.harbour.left.remove(&owner)).map_or(0.0, |[.., heading, _]| heading);
        if at != asked {
            let told = vec![crate::harbour::MOORED, self.clock as f64, at.x as f64, at.y as f64, heading];
            self.harbour.told.push((player, told));
        }
        heading
    }

    /// A ship played unkept that put to sea before its owner was known (a page's course before its token) is moored
    /// where the sea last had that owner's ship, as the owner becomes known; a fight it met meanwhile is over for it.
    pub(super) fn moor_left(&mut self, player: PlayerId) {
        let Some(owner) = self.harbour.accounts.get(&player).cloned() else { return };
        let at_sea = self.berths.get(&player).is_some_and(|berth| berth.sailing.is_some());
        if self.harbour.characters.contains_key(&player) || !at_sea {
            return;
        }
        let Some([x, y, heading, _]) = self.harbour.left.remove(&owner) else { return };
        if self.fights.fighting(player) {
            self.leave_decks(player);
            self.fights.leave(player);
        }
        if let Some(sailing) = self.berths.get_mut(&player).and_then(|berth| berth.sailing.as_mut()) {
            sailing.ship = super::Ship { x, y, heading, pace: 0, rate: 0 };
            sailing.course.clear();
            self.harbour.told.push((player, vec![crate::harbour::MOORED, self.clock as f64, x, y, heading]));
        }
    }
}
