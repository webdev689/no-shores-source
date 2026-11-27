//! A node's clear, as Destiny 1's strikes paid on completion: once every group of a mission's, a dungeon's or a world
//! boss's garrison is down at once, no wave standing, each player still in the room who fought it since it last paid
//! takes its clear's pay (`gear::rewards::Clear`), and only once until a group has stood again. A patrol never ends,
//! so it pays none.

use crate::{NodeKind, PlayerId, Room};
use gear::rewards::Clear;
use std::collections::BTreeSet;

/// A garrison that pays a clear: which, who has fought it since it last paid (by their accounts too, so one who
/// rejoins under a new number keeps their share), and whether it has paid since a group last stood.
#[derive(Debug)]
pub(crate) struct Clearing {
    pub clear: Clear,
    pub fought: BTreeSet<PlayerId>,
    pub owners: BTreeSet<String>,
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
    Some(Clearing { clear, fought: BTreeSet::new(), owners: BTreeSet::new(), paid: false })
}

impl Room {
    /// Notes that a player shared a kill of the room's garrison, so its clear pays them.
    pub(crate) fn fought_garrison(&mut self, player: PlayerId) {
        let owner = self.players.get(&player).and_then(|found| found.owner.clone());
        if let Some(clearing) = self.clearing.as_mut() {
            clearing.fought.insert(player);
            clearing.owners.extend(owner);
        }
    }

    /// Pays the garrison's clear once every group of it is down at once, no wave standing: each player who fought it
    /// and is still here, at the garrison's highest level at the room's seas. What a dungeon's clear leaves is laid
    /// at their feet.
    pub(crate) fn pay_garrison_clear(&mut self) {
        // Only the garrison's own groups standing again ready its clear anew: a quest's wave or ambush, which comes
        // and goes, never does, and no clear is paid while one stands.
        let own = self.garrison.iter().filter(|post| !post.arrival);
        let down = own.clone().next().is_some() && own.clone().all(|post| post.cleared_at.is_some());
        let wave = self.garrison.iter().any(|post| post.arrival);
        let level = own.flat_map(|post| &post.girds).map(|(level, _)| self.at_seas(*level)).max();
        let Some(clearing) = self.clearing.as_mut() else { return };
        clearing.paid &= down;
        if !down || wave || clearing.paid {
            return;
        }
        clearing.paid = true;
        let (clear, fought, owners) =
            (clearing.clear, std::mem::take(&mut clearing.fought), std::mem::take(&mut clearing.owners));
        let shared = |id: &PlayerId, owner: Option<&String>| {
            fought.contains(id) || owner.is_some_and(|owner| owners.contains(owner))
        };
        let paid: Vec<PlayerId> =
            self.players.iter().filter(|(id, found)| shared(id, found.owner.as_ref())).map(|(id, _)| *id).collect();
        for player in paid {
            let dice = self.dice(player);
            let Some(found) = self.players.get_mut(&player) else { continue };
            let (difficulty, source) = (self.difficulty, self.source);
            let spoils = crate::drops::laid(&mut found.character, |character| {
                character.reward_clear(clear, level.unwrap_or(0), difficulty, source, &dice)
            });
            found.gear_changed = true;
            let body = found.fighter.body;
            // Rank 0, none: a clear leaves no ammunition.
            self.drop_spoils(player, spoils, 0, [body.x, body.y, body.z], &dice);
        }
    }
}
