//! Flanking on the ring: a waiting foe's place drifts away from where its target faces, round toward its side and back,
//! and stops short of the next foe of its side on the ring that way, so the waiting spread over the target's flanks
//! and none crosses another. On a crowded ring each moves toward the middle of its room, so the ring evens out.

use crate::senses::{Here, Sight};
use crate::tuning::{FLANK_ARC, RING_ROOM, RING_SLACK, SLOT_TURN};
use combat::sight::{apart, bearing, wrap};

/// Its place on the ring this tick, a bearing from its target, drifted on from `place` on a ring `ring` metres round.
/// Nearer than RING_ROOM to the next foe of its side on its ring, it moves toward the middle of the room between the
/// next each way; else, within FLANK_ARC of its target's face, it drifts away from the face up to RING_ROOM short of
/// the next.
#[must_use]
pub fn drift(here: &Here<'_, '_>, sight: &Sight, place: f64, ring: f64) -> f64 {
    let centre = [sight.spot[0], sight.spot[1]];
    let gap = RING_ROOM / ring.max(1.0);
    // The nearest of its side on its ring each way round from its place, clockwise and not, as angles.
    let (mut clockwise, mut counter) = (f64::INFINITY, f64::INFINITY);
    for (id, other) in here.world.fighters {
        let there = [other.body.x, other.body.y];
        let near = *id != here.me && other.side == here.fighter.side && !other.dead();
        if !near || (apart(centre, there) - ring).abs() > 2.0 * RING_SLACK {
            continue;
        }
        let ahead = wrap(bearing(centre, there) - place);
        if ahead >= 0.0 {
            clockwise = clockwise.min(ahead);
        } else {
            counter = counter.min(-ahead);
        }
    }
    let step = SLOT_TURN / 60.0;
    if clockwise.min(counter) < gap {
        // Crowded, it moves toward the middle of the room between the next each way, so a crowded ring evens out.
        if (clockwise - counter).abs() <= 2.0 * step {
            return place;
        }
        return wrap(place + if clockwise > counter { step } else { -step });
    }
    let from_face = wrap(place - sight.fighter.aim);
    if from_face.abs() >= FLANK_ARC {
        return place;
    }
    // Dead ahead of its target, the side it goes round is its number's, the same on every machine.
    let way = if from_face > 0.0 || (from_face == 0.0 && here.me.is_multiple_of(2)) { 1.0 } else { -1.0 };
    let room = if way > 0.0 { clockwise } else { counter };
    if room >= gap + step { wrap(place + way * step) } else { place }
}
