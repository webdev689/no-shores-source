//! A patrol's land: its island's resource at its layout's resource places (an outcrop, salvage, a drying rack, felled
//! logs), a third of them holding a node at once and the next third after a while, so a player can plan a route
//! through them. Each player may gather each node once while it stands, holding E while their figure works it. Its
//! fights are its garrison's (`garrison.rs`).

use crate::asks::{GATHER_STIR_M, GATHER_TICKS};
use crate::{PlayerId, ResourceNode, Room, Standing};
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
    /// Makes this node's room a patrol: `resource`'s nodes at its layout's resource places (`places`), those within its
    /// section, in the layout's order.
    pub fn start_patrol(&mut self, resource: u8, places: &[[f64; 2]]) {
        let Some(section) = &self.section else { return };
        let inside = places.iter().filter(|&&[x, y]| reach::inside(&section.ring, x, y));
        self.resource_nodes = inside.map(|&[x, y]| ResourceNode { x, y, resource }).collect();
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

    /// Keeps each gather under way for a tick: one whose body stirred, was hurt or fell, or whose node's turn passed or
    /// whose resource filled, stops; one held `GATHER_TICKS` gathers its node, spent for the player this turn.
    pub(crate) fn keep_gathering(&mut self) {
        let under_way: Vec<PlayerId> =
            self.players.iter().filter(|(_, found)| found.gathering.is_some()).map(|(&id, _)| id).collect();
        for player in under_way {
            let fighter = self.fighter(player).copied();
            let Some(found) = self.players.get(&player) else { continue };
            let Some(gathering) = found.gathering else { continue };
            let index = usize::from(gathering.node);
            let node = self.resource_nodes.get(index).copied();
            let standing = self.node_standing(index) && !found.spent.contains(&gathering.node);
            let kept = fighter.zip(node).is_some_and(|(fighter, node)| {
                let stirred = libm::hypot(fighter.body.x - gathering.at[0], fighter.body.y - gathering.at[1]);
                let full =
                    found.character.materials.resource(usize::from(node.resource)) >= gear::character::STOCK_MOST;
                let fallen = fighter.dead() || matches!(found.standing, Standing::Dead { .. });
                standing && stirred <= GATHER_STIR_M && fighter.health >= gathering.health && !fallen && !full
            });
            let done = kept && self.clock >= gathering.since + GATHER_TICKS;
            let Some(found) = self.players.get_mut(&player) else { continue };
            if kept && !done {
                continue;
            }
            found.gathering = None;
            found.gear_changed = true;
            let Some(node) = node.filter(|_| done) else { continue };
            found.spent.push(gathering.node);
            if let (Some(owner), Some(patrol)) = (&found.owner, self.patrol.as_mut()) {
                patrol.gathered.entry(owner.clone()).or_default().push(gathering.node);
            }
            found.character.gather(usize::from(node.resource));
        }
    }
}
