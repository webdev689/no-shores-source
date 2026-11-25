//! Its hands boarding with their player: on a struck ship's deck, beside each player who comes over its rail, as many
//! of their ship's hands as its hull's class sends (two from a Sloop or a Schooner, three from a Brig, four from a
//! Frigate) and as many more as its First Mate and its perks lead aboard, never more than it has left. They
//! fight its crew on the players' side with a foe's own brain, by gear's power at their ship's level; a kill they have
//! a hand in is their player's. Those who fall are men it has lost, kept with its hurts once the player is back aboard.

use crate::companions::HAND_TYPE;
use crate::{PlayerId, Room};
use ::foes::{Rank, foe_type};
use combat::fighter::{FighterId, Side};

/// How far either side of their player along its rail hands come aboard, metres apart.
const ALONG_M: f64 = 1.2;

/// A hand aboard a struck ship: their player, and their ship's level they fight at.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Hand {
    pub leader: PlayerId,
    pub level: u8,
}

/// How many hands board with a player whose ship has `hands` left: its hull's class's (`naval::class`) and as many
/// more as its trim leads aboard.
#[must_use]
pub fn boarding(hands: u16, class: u8, more: u8) -> u8 {
    u8::try_from(hands.min(u16::from(class.saturating_add(more)))).unwrap_or(u8::MAX)
}

impl Room {
    /// `count` of a player's hands come aboard beside them at `level`, along its rail fore and aft of them, facing as
    /// they face.
    pub fn board_hands(&mut self, leader: PlayerId, count: u8, level: u8) {
        let (Some(at), Some(foe_type)) = (self.fighter(leader).copied(), foe_type(HAND_TYPE)) else { return };
        for nth in 0..count {
            let along = ALONG_M * f64::from(nth / 2 + 1) * if nth % 2 == 0 { 1.0 } else { -1.0 };
            let wanted = [at.body.x, at.body.y + along, at.body.z];
            let spot = self.nav.nearest_point(wanted).unwrap_or(wanted);
            let id = self.stand_foe(foe_type, Rank::Major, spot, at.body.facing, Some(leader));
            let Some(foe) = self.foes.get_mut(&id) else { continue };
            foe.fighter.side = Side::Players;
            foe.brain.joins_players();
            foe.level = level;
            self.ashore.hands.insert(id, Hand { leader, level });
        }
    }

    /// How many of a player's hands have fallen on this deck.
    #[must_use]
    pub fn fallen_hands(&self, leader: PlayerId) -> u8 {
        self.ashore.fallen.get(&leader).copied().unwrap_or(0)
    }

    /// Each tick on a deck: a hand who fell is counted against their player and goes; one whose player has left goes
    /// with them, back aboard.
    pub(crate) fn keep_hands(&mut self) {
        let gone: Vec<(FighterId, PlayerId, bool)> = self
            .ashore
            .hands
            .iter()
            .filter_map(|(id, hand)| {
                let fell = self.foes.get(id).is_none_or(|foe| foe.fighter.dead());
                (fell || !self.players.contains_key(&hand.leader)).then_some((*id, hand.leader, fell))
            })
            .collect();
        for (id, leader, fell) in gone {
            self.ashore.hands.remove(&id);
            if fell {
                *self.ashore.fallen.entry(leader).or_default() += 1;
            }
            self.foes.remove(&id);
            self.board.forget(id);
            self.ways.remove(&id);
        }
    }
}

#[cfg(test)]
#[path = "boarding_hands_tests.rs"]
mod tests;
