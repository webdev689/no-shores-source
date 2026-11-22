//! Where a ship puts to sea, and comes back: a new one at a port's roadstead, never the page's own point, and one its
//! owner sailed before where the sea last had it, as a ship sails nowhere while its player is away; and the sea's loot
//! rolled on the host's own seeds, never the sea's, which its islands' seeds show
//! ([[The Audit's Leftovers Are Fixed as Claude Suggested]]).

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

    /// Where a ship not yet at sea puts in, the page told so when it is not where it asked: where the sea last had its
    /// owner's ship; else, asked by a port city within reach of its roadstead, at that roadstead itself, never the
    /// page's own point; in a sea with no port cities, where the page asks. None where it may not put to sea.
    pub(super) fn puts_in(&mut self, player: PlayerId, asked: Point) -> Option<Point> {
        let owner = self.harbour.accounts.get(&player);
        let left = owner.and_then(|owner| self.harbour.left.get(owner)).copied();
        let [x, y, heading] = match left {
            Some([x, y, heading, _]) => [x, y, heading],
            None if !self.harbour.harbours.puts_to_sea(asked) => return None,
            None if self.harbour.harbours.ports.is_empty() => return Some(asked),
            None => {
                let port = self.harbour.harbours.nearest([asked.x as f64, asked.y as f64])?;
                let [x, y] = self.harbour.harbours.ports.get(port)?.1;
                [x, y, 0.0]
            }
        };
        let at = whole(&[x, y])?;
        if at != asked {
            self.harbour.told.push((player, vec![crate::harbour::MOORED, self.clock as f64, x, y, heading]));
        }
        Some(at)
    }
}
