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
    /// A player's character as it is kept between sessions, with the body they would leave with now and, in a social
    /// space, where they stand in it, to log back in there.
    #[must_use]
    pub fn kept_character(&self, player: PlayerId) -> Option<String> {
        let found = self.players.get(&player)?;
        let mut character = found.character.clone();
        character.left = Some(self.left_of(found));
        character.last = self.social_spot(found).or(character.last);
        Some(character.to_json())
    }

    /// Where a player stands in a social space's room, as their character keeps it to log back in there: only while
    /// they stand alive on their feet inside it, so none is kept from a fall, a jump or a death.
    fn social_spot(&self, found: &Player) -> Option<gear::last::Last> {
        let node = self.quests.node.as_deref().filter(|_| self.place == Some(gear::gate::Place::Social))?;
        let body = found.fighter.body;
        let standing = body.mode == movement::Mode::Ground && found.standing == crate::Standing::Inside;
        (standing && found.living()).then(|| gear::last::Last::social(node, [body.x, body.y, body.z], body.facing))
    }

    /// A player whose character last stood in this very social space stands where they left it, facing as they did,
    /// so logging back in takes them there; elsewhere, or where a body no longer fits there, as they joined.
    pub(crate) fn stand_where_left(&mut self, player: PlayerId) {
        let Some(node) = self.quests.node.clone().filter(|_| self.place == Some(gear::gate::Place::Social)) else {
            return;
        };
        let Some(found) = self.players.get(&player) else { return };
        let Some(([x, y, z], facing)) = found.character.last.as_ref().and_then(|last| last.stood_in(&node)) else {
            return;
        };
        let inside = self.section.as_ref().is_some_and(|section| reach::inside(&section.ring, x, y));
        // On the floor they stood on, a stair's or a bridge's over the ground among them.
        let floor = movement::blocks::ground_at(&self.blocks, &self.floor, x, y, z);
        let body = movement::Body { facing, z: floor, ..movement::standing(x, y) };
        let fits = movement::blocks::room_at(&self.blocks, x, y, body.z, combat::tuning::BODY_HEIGHT);
        if let Some(found) = self.players.get_mut(&player).filter(|_| inside && fits) {
            (found.fighter.body, found.stood) = (body, body.z);
        }
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
