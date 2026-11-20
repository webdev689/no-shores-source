//! A captain's deck as a room, for the players who board her to fight her crew on foot by the land combat's own rules:
//! a node's room whose floor is her deck's grid of heights (in her own frame, a wall off her planks), its ring her
//! deck's bounds, its spawns at her rails amidships where boarders come over her side (clear of her masts, which stand
//! on her middle line), and her faction's deck crew for her rank standing along her deck at her level (`foes::crews`).

use crate::deck::Deck;
use crate::floor::Floor;
use crate::{PlayerId, Room};
use ::foes::Rank;
use reach::Section;

/// Her crew stand this far apart along her keel, from this far forward of amidships, metres, each pair either side of
/// her middle line.
const CREW_APART_M: f64 = 1.6;
const CREW_FROM_M: f64 = 2.0;
const CREW_ASIDE_M: f64 = 0.8;
/// A boarder stands this far in from her outermost plank at the rail they come over, metres, and the rail is sought
/// in steps of this.
const RAIL_IN_M: f64 = 0.5;
const RAIL_STEP_M: f64 = 0.05;

/// Where a boarder comes over her rail on `side` (1 her starboard, -1 her port): amidships, `RAIL_IN_M` in from her
/// outermost plank there; at her helm where no plank lies across her middle.
#[must_use]
pub fn rail_spot(deck: &Deck, side: f64) -> [f64; 2] {
    let [[west, _], [east, _]] = deck.bounds;
    let (edge, inward) = if side < 0.0 { (west, 1.0) } else { (east, -1.0) };
    let steps = ((east - west) / RAIL_STEP_M) as usize;
    let plank =
        (0..=steps).map(|step| edge + inward * RAIL_STEP_M * step as f64).find(|x| deck.heights.stands_at(*x, 0.0));
    let spot = plank.map(|x| x + inward * RAIL_IN_M).filter(|x| deck.heights.stands_at(*x, 0.0));
    spot.map_or(deck.helm, |x| [x, 0.0])
}

impl Room {
    /// The deck room of a captain of `faction` at `rank` and `level`, on `deck`.
    #[must_use]
    pub fn deck(deck: &Deck, faction: u8, rank: Rank, level: u8) -> Room {
        let [[west, north], [east, south]] = deck.bounds;
        let ring = vec![[west, north], [east, north], [east, south], [west, south]];
        let section = Section { ring, spawns: vec![rail_spot(deck, 1.0), rail_spot(deck, -1.0)] };
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

    /// A boarder comes aboard at `spot` (`rail_spot`), facing her bow and her crew; none when her room is full.
    pub fn board_at(&mut self, spot: [f64; 2]) -> Option<PlayerId> {
        let id = self.join()?;
        // Facing her bow (0, as her crew faces aft at a half turn), where her crew stands.
        let body = movement::Body { facing: 0.0, ..self.stand((spot[0], spot[1])) };
        if let Some(found) = self.players.get_mut(&id) {
            found.fighter.body = body;
        }
        Some(id)
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
