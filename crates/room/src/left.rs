//! The body a player leaves a room with, kept with their character (`gear::left`): their health and healing charges
//! for two minutes, their Anima and Tenets for ten, so leaving and coming back, to this room or another, heals nothing
//! and readies nothing ([[The Audit's Leftovers Are Fixed as Claude Suggested]]). One who left fallen comes back
//! fallen, to stand again at a spawn.

use crate::players::Player;
use crate::{PlayerId, Room};
use gear::left::{Left, share, whole_of};

impl Room {
    /// The body a player would leave with now.
    pub(crate) fn left_of(&self, found: &Player) -> Left {
        let fighter = found.fighter;
        let fallen = fighter.dead() || matches!(found.standing, crate::Standing::Dead { .. });
        let health =
            if fallen || fighter.health_max <= 0.0 { 0 } else { share(fighter.health / fighter.health_max).max(1) };
        Left {
            minute: self.minute,
            health,
            charges: fighter.charges,
            art: found.character.arts.worn,
            anima: share(found.casting.anima),
            tenets: found.casting.tenets.map(share),
        }
    }

    /// What a returning player's character brings back into the room: the body it left with, and on a sea island the
    /// nodes it gathered there today (`spent_today`).
    pub(crate) fn given_back(&mut self, player: PlayerId) {
        self.give_left_back(player);
        self.spent_today(player);
    }

    /// Gives a returning player the body their character left with, what of it still holds at the room's minute; a
    /// boarder comes onto a pirate's deck from their own ship, unhurt, as before.
    fn give_left_back(&mut self, player: PlayerId) {
        let (minute, on_deck) = (self.minute, matches!(self.floor, crate::Floor::Deck(_)));
        let Some(found) = self.players.get_mut(&player) else { return };
        let Some(left) = found.character.left else { return };
        if left.body_holds(minute) && !on_deck {
            let fighter = &mut found.fighter;
            fighter.charges = left.charges.min(combat::tuning::CHARGES);
            fighter.health = fighter.health_max * whole_of(left.health);
            if left.health == 0 {
                fighter.action = combat::Action::Dead { elapsed: 0 };
            }
        }
        if left.arts_hold(minute) && found.character.arts.worn == left.art {
            found.casting.anima = whole_of(left.anima);
            found.casting.tenets = left.tenets.map(whole_of);
        }
    }
}

#[cfg(test)]
#[path = "left_tests.rs"]
mod left_tests;
