//! A patrol's land: its island's resource at its layout's resource places (an outcrop, salvage, a drying rack, felled
//! logs), a third of them holding a node at once and the next third after a while, so a player can plan a route
//! through them. Each player may gather each node once while it stands, holding E while their figure works it. Its
//! fights are its garrison's (`garrison.rs`).

use crate::asks::{GATHER_GRACE_TICKS, GATHER_STIR_M, GATHER_TICKS};
use crate::{PlayerId, ResourceNode, Room};
use gear::Difficulty;
use std::collections::BTreeMap;

/// How many groups of a patrol's nodes take turns, and how long each group stands (three minutes).
pub const GROUPS: usize = 3;
pub const ROTATE_TICKS: u64 = 60 * 180;

/// A patrol: the nodes each account's character gathered this turn, kept past a player's leaving.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Patrol {
    pub gathered: BTreeMap<String, Vec<u8>>,
}

impl Room {
    /// Makes this node's room a patrol: `resource`'s nodes where its layout stands them (`places`, each on its
    /// section's floor), numbered in the layout's order as the page numbers them.
    pub fn start_patrol(&mut self, resource: u8, places: &[[f64; 2]]) {
        self.resource_nodes = places.iter().map(|&[x, y]| ResourceNode { x, y, resource }).collect();
        self.patrol = Some(Patrol::default());
    }

    /// Sets the difficulty the room's voyage set out at, and raises the garrison standing to it.
    pub fn set_difficulty(&mut self, difficulty: Difficulty) {
        self.difficulty = difficulty;
        self.raise_garrison();
    }

    /// Whether a resource node stands now: in a patrol, only its group's turn; elsewhere, always.
    #[must_use]
    pub fn node_standing(&self, index: usize) -> bool {
        self.patrol.is_none() || (self.clock / ROTATE_TICKS) as usize % GROUPS == index % GROUPS
    }

    /// The resource nodes standing that a player may still gather, each with its number.
    pub fn nodes_for(&self, player: crate::PlayerId) -> impl Iterator<Item = (u8, &ResourceNode)> + '_ {
        let spent = self.players.get(&player).map(|found| found.spent.as_slice()).unwrap_or_default();
        self.resource_nodes.iter().enumerate().filter_map(move |(index, node)| {
            let number = u8::try_from(index).ok()?;
            (self.node_standing(index) && !spent.contains(&number)).then_some((number, node))
        })
    }

    /// Keeps a patrol going for a tick: when the nodes' turn passes, every player may gather again and is sent the
    /// nodes now standing.
    pub(crate) fn keep_patrol(&mut self) {
        let Some(patrol) = self.patrol.as_mut() else { return };
        if self.clock.is_multiple_of(ROTATE_TICKS) {
            for found in self.players.values_mut() {
                found.spent.clear();
                found.gear_changed = true;
            }
            patrol.gathered.clear();
        }
    }

    /// Keeps each gather under way for a tick: one whose player may no longer gather it (`gather_refused`) or was hurt
    /// stops; one stepped off or let go of stops, unless within `GATHER_GRACE_TICKS` of its end, when it is gathered;
    /// one held `GATHER_TICKS` gathers its node, spent for the player this turn.
    pub(crate) fn keep_gathering(&mut self) {
        let under_way: Vec<PlayerId> =
            self.players.iter().filter(|(_, found)| found.gathering.is_some()).map(|(&id, _)| id).collect();
        for player in under_way {
            let Some(gathering) = self.players.get(&player).and_then(|found| found.gathering) else { continue };
            let Some(fighter) = self.fighter(player).copied() else { continue };
            let stirred = libm::hypot(fighter.body.x - gathering.at[0], fighter.body.y - gathering.at[1]);
            let broken = self.gather_refused(player, gathering.node).is_some() || fighter.health < gathering.health;
            let left = (gathering.since + GATHER_TICKS).saturating_sub(self.clock);
            let ended = gathering.let_go || stirred > GATHER_STIR_M;
            let done = !broken && (left == 0 || (ended && left <= GATHER_GRACE_TICKS));
            let Some(found) = self.players.get_mut(&player) else { continue };
            if !(broken || ended || done) {
                // A blow is measured from the health it found last, so a heal meanwhile hides none.
                found.gathering = Some(crate::asks::Gathering { health: fighter.health, ..gathering });
                continue;
            }
            found.gathering = None;
            found.gear_changed = true;
            let Some(node) = self.resource_nodes.get(usize::from(gathering.node)).filter(|_| done) else { continue };
            found.spent.push(gathering.node);
            if let (Some(owner), Some(patrol)) = (&found.owner, self.patrol.as_mut()) {
                patrol.gathered.entry(owner.clone()).or_default().push(gathering.node);
            }
            found.character.gather(usize::from(node.resource));
        }
    }
}
