//! The lore lying in a room's node (`gear::lore`): each chapter the file lays at one of its places, shown to each player
//! who has not found it, and found by them within reach of it, alive.

use crate::{PlayerId, Room, Standing};
use gear::lore::{Found, LoreDef};

/// How near a chapter lying in the world a player must stand to find it, metres: a resource node's reach.
pub const LORE_REACH: f64 = crate::asks::NODE_REACH;

impl Room {
    /// The lore this room reads: the file's, unless a test gives its own.
    pub fn set_lore(&mut self, lore: &'static LoreDef) {
        self.quests.lore = Some(lore);
    }

    fn lore(&self) -> &'static LoreDef {
        self.quests.lore.unwrap_or_else(gear::lore::lore)
    }

    /// Every chapter lying in this room's node, by its number: where it lies, at the bearing and distance from its
    /// place's middle the file gives. A chapter at a place the node does not hold lies nowhere.
    #[must_use]
    pub fn lore_lying(&self) -> Vec<(u16, [f64; 2])> {
        let Some(node) = self.quests.node.as_deref() else { return Vec::new() };
        let lore = self.lore();
        lore.chapters()
            .enumerate()
            .filter_map(|(number, (_, found))| {
                let Found::Place { node: there, place, bearing, at } = found else { return None };
                let middle = self.quests.places.iter().find(|it| it.name == *place).filter(|_| there == node)?;
                let point = crate::steps::ahead(middle.at, bearing.to_radians(), *at);
                Some((u16::try_from(number).ok()?, point))
            })
            .collect()
    }

    /// The chapters a player has found, by their numbers, in the order found; one the lore no longer holds left out.
    #[must_use]
    pub fn lore_found(&self, player: PlayerId) -> Vec<u16> {
        let Some(found) = self.players.get(&player) else { return Vec::new() };
        found.character.lore.iter().filter_map(|key| self.lore().number_of(key)).collect()
    }

    /// The chapters lying here that a player has not found: each its number and where it lies.
    #[must_use]
    pub fn lore_here(&self, player: PlayerId) -> Vec<(u16, [f64; 2])> {
        let Some(found) = self.players.get(&player) else { return Vec::new() };
        let lore = self.lore();
        let unfound = |number: u16| lore.key_at(number).is_some_and(|key| !found.character.finds_lore(&key));
        self.lore_lying().into_iter().filter(|(number, _)| unfound(*number)).collect()
    }

    /// A player finds a chapter lying here, by its number: alive, within reach of it, and not found before. Answers 0,
    /// or why not.
    pub(crate) fn find_lore(&mut self, player: PlayerId, chapter: u16) -> u8 {
        let Some(fighter) = self.fighter(player).copied() else { return crate::asks::OUT_OF_REACH };
        let lying = self.lore_here(player).into_iter().find(|(number, _)| *number == chapter);
        let Some((_, [x, y])) = lying else { return crate::asks::OUT_OF_REACH };
        let Some(key) = self.lore().key_at(chapter) else { return crate::asks::OUT_OF_REACH };
        let Some(found) = self.players.get_mut(&player) else { return crate::asks::OUT_OF_REACH };
        let dead = fighter.dead() || matches!(found.standing, Standing::Dead { .. });
        if dead || libm::hypot(fighter.body.x - x, fighter.body.y - y) > LORE_REACH {
            return crate::asks::OUT_OF_REACH;
        }
        found.character.keep_lore(&key);
        found.gear_changed = true;
        0
    }
}

#[cfg(test)]
#[path = "lore_tests.rs"]
mod lore_tests;
