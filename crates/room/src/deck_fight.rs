//! A captain's deck as a room, for the players who board her to fight her crew on foot by the land combat's own rules:
//! a node's room whose floor is her deck's grid of heights (in her own frame, a wall off her planks), its ring her
//! deck's bounds, its spawn amidships where boarders come over her side, and her faction's deck crew for her rank
//! standing along her deck at her level (`foes::crews`).

use crate::Room;
use crate::deck::Deck;
use crate::floor::Floor;
use ::foes::Rank;
use reach::Section;

/// Her crew stand this far apart along her keel, from this far forward of amidships, metres, each pair either side of
/// her middle line.
const CREW_APART_M: f64 = 1.6;
const CREW_FROM_M: f64 = 2.0;
const CREW_ASIDE_M: f64 = 0.8;

impl Room {
    /// The deck room of a captain of `faction` at `rank` and `level`, on `deck`.
    #[must_use]
    pub fn deck(deck: &Deck, faction: u8, rank: Rank, level: u8) -> Room {
        let [[west, north], [east, south]] = deck.bounds;
        let ring = vec![[west, north], [east, north], [east, south], [west, south]];
        let amidships = if deck.heights.stands_at(0.0, 0.0) { [0.0, 0.0] } else { deck.helm };
        let section = Section { ring, spawns: vec![amidships] };
        let mut room = Room::node(Floor::Deck(Box::new(deck.heights.clone())), Vec::new(), section);
        let crew = ::foes::crews::deck_crew(faction, rank);
        room.foes_most = crew.len();
        for (nth, (number, rank)) in crew.into_iter().enumerate() {
            let Some(foe_type) = ::foes::foe_type(number) else { continue };
            let along = -CREW_FROM_M - CREW_APART_M * (nth / 2) as f64;
            let aside = if nth % 2 == 0 { -CREW_ASIDE_M } else { CREW_ASIDE_M };
            let spot = [aside, along.max(north + 0.5), 0.0];
            let spot = room.nav.nearest_point(spot).unwrap_or(spot);
            // Each faces aft, toward the boarders.
            let id = room.stand_foe(foe_type, rank, spot, core::f64::consts::PI, None);
            room.gird(id, level, None);
        }
        room
    }

    /// Whether every foe aboard has fallen.
    #[must_use]
    pub fn cleared(&self) -> bool {
        self.living_foes() == 0
    }

    /// Whether every player in the room is down.
    #[must_use]
    pub fn all_down(&self) -> bool {
        self.players.values().all(|found| found.fighter.dead())
    }
}

#[cfg(test)]
#[path = "deck_fight_tests.rs"]
mod tests;
