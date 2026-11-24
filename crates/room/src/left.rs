//! The body a player leaves a room with, kept with their character (`gear::left`): their health and healing charges
//! for two minutes, their Anima and Tenets for ten, so leaving and coming back, to this room or another, heals nothing
//! and readies nothing ([[The Audit's Leftovers Are Fixed as Claude Suggested]]). One who left fallen comes back
//! fallen, to stand again at a spawn.

use crate::players::Player;
use crate::{PlayerId, Room};

/// How near a way out of a dungeon a player stands as they leave by it, metres: the page's `DOOR_REACH_M` and a metre for
/// the view it saw them by.
const WAY_OUT_REACH: f64 = 3.5;
use gear::left::{Left, share, whole_of};

impl Room {
    /// A player's character as it is kept between sessions, with the body they would leave with now.
    #[must_use]
    pub fn kept_character(&self, player: PlayerId) -> Option<String> {
        let found = self.players.get(&player)?;
        let mut character = found.character.clone();
        character.left = Some(self.left_of(found));
        Some(character.to_json())
    }

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
            out: !fallen && self.at_way_out([fighter.body.x, fighter.body.y]),
        }
    }

    /// Whether a body standing at `at` stands at one of a dungeon's ways out, within WAY_OUT_REACH of its exit door or
    /// of its return portal while that stands open, as the page offers "Leave" there.
    fn at_way_out(&self, at: [f64; 2]) -> bool {
        let open = self.cache.is_some_and(|cache| cache.open);
        self.ways_out.is_some_and(|(door, portal)| {
            combat::sight::apart(at, door) <= WAY_OUT_REACH
                || (open && combat::sight::apart(at, portal) <= WAY_OUT_REACH)
        })
    }

    /// What a returning player's character brings back into the room: the body it left with, and on a sea island the
    /// nodes it gathered there today (`spent_today`).
    pub(crate) fn given_back(&mut self, player: PlayerId) {
        self.give_left_back(player);
        self.spent_today(player);
    }

    /// Gives a returning player the body their character left with, what of it still holds at the room's minute; a
    /// boarder comes onto a hostile's deck from their own ship, unhurt.
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
