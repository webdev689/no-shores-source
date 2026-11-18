//! Flanking on the ring: a waiting foe's place drifts away from where its target faces, round toward its side and back,
//! and stops short of the next foe of its side on the ring that way, so the waiting spread over the target's flanks
//! and none crosses another.

use crate::senses::{Here, Sight};
use crate::tuning::{FLANK_ARC, RING_SLACK, SLOT_TURN, SPACING};
use combat::sight::{apart, bearing, wrap};

/// Its place on the ring this tick, a bearing from its target, drifted on from `place` on a ring `ring` metres round.
#[must_use]
pub fn drift(here: &Here<'_, '_>, sight: &Sight, place: f64, ring: f64) -> f64 {
    let from_face = wrap(place - sight.fighter.aim);
    if from_face.abs() >= FLANK_ARC {
        return place;
    }
    // Dead ahead of its target, the side it goes round is its number's, the same on every machine.
    let way = if from_face > 0.0 || (from_face == 0.0 && here.me.is_multiple_of(2)) { 1.0 } else { -1.0 };
    let centre = [sight.spot[0], sight.spot[1]];
    let gap = (SPACING + RING_SLACK) / ring.max(1.0);
    let crowded = here.world.fighters.iter().any(|(id, other)| {
        let there = [other.body.x, other.body.y];
        let near = *id != here.me && other.side == here.fighter.side && !other.dead();
        let ahead = wrap(bearing(centre, there) - place) * way;
        near && (apart(centre, there) - ring).abs() <= 2.0 * RING_SLACK && ahead > 0.0 && ahead < gap
    });
    if crowded { place } else { wrap(place + way * SLOT_TURN / 60.0) }
}
