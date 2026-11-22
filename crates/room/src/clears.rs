//! A node's clear, as Destiny 1's strikes paid on completion: once every group of a mission's, a dungeon's or a world
//! boss's garrison is down at once, no wave standing, each player still in the room who fought it since it last paid
//! takes its clear's pay (`gear::rewards::Clear`), and only once until a group has stood again. A patrol never ends,
//! so it pays none.

use crate::{NodeKind, PlayerId, Room};
use gear::rewards::Clear;
use std::collections::BTreeSet;

/// A garrison that pays a clear: which, who has fought it since it last paid, and whether it has paid since a group
/// last stood.
#[derive(Debug)]
pub(crate) struct Clearing {
    pub clear: Clear,
    pub fought: BTreeSet<PlayerId>,
    pub paid: bool,
}

/// The clearing a node of this kind keeps, if its garrison pays a clear.
pub(crate) fn clearing_of(kind: NodeKind) -> Option<Clearing> {
    let clear = match kind {
        NodeKind::Mission => Clear::Mission,
        NodeKind::Dungeon => Clear::Dungeon,
        NodeKind::Boss => Clear::WorldBoss,
        _ => return None,
    };
    Some(Clearing { clear, fought: BTreeSet::new(), paid: false })
}

impl Room {
    /// Notes that a player shared a kill of the room's garrison, so its clear pays them.
    pub(crate) fn fought_garrison(&mut self, player: PlayerId) {
        if let Some(clearing) = self.clearing.as_mut() {
            clearing.fought.insert(player);
        }
    }

    /// Pays the garrison's clear once every group of it is down at once, no wave standing: each player who fought it
    /// and is still here, at the garrison's highest level at the room's seas. What a dungeon's clear leaves is laid
    /// at their feet.
    pub(crate) fn pay_clear(&mut self) {
        let down =
            !self.garrison.is_empty() && self.garrison.iter().all(|post| !post.arrival && post.cleared_at.is_some());
        let level = self.garrison.iter().flat_map(|post| &post.girds).map(|(level, _)| self.at_seas(*level)).max();
        let Some(clearing) = self.clearing.as_mut() else { return };
        if !down || clearing.paid {
            clearing.paid &= down;
            return;
        }
        clearing.paid = true;
        let (clear, fought) = (clearing.clear, std::mem::take(&mut clearing.fought));
        for player in fought {
            let dice = self.dice(player);
            let Some(found) = self.players.get_mut(&player) else { continue };
            let vestiges = found.character.reward_clear(clear, level.unwrap_or(0), self.difficulty, &dice);
            found.gear_changed = true;
            let body = found.fighter.body;
            // Rank 0, none: a clear leaves no ammunition.
            self.drop_spoils(player, vestiges, 0, [body.x, body.y, body.z], &dice);
        }
    }
}
