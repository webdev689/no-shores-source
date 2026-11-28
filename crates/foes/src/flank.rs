//! The waiting's places round their target. They hold a line before the group's side of it, on rings by their place
//! in the line, so a player faces the group, sees every foe that waits and keeps a way out behind; one foe at a time,
//! the best suited, works round to the target's flank instead, its place drifting away from where the target faces,
//! out to its flank and stopping short of the next foe of its side on the ring. On a crowded ring each moves toward
//! the middle of its room, so the ring evens out.

use crate::board::Board;
use crate::brain::Brain;
use crate::roles::Role;
use crate::senses::{Here, Sight};
use crate::tuning::{FLANK_ARC, LINE_ARC, LINE_LEAN, RANK_GAP, RING_ROOM, RING_SLACK, SLOT_TURN};
use combat::arms::OffHand;
use combat::sight::{apart, bearing, off, wrap};

/// The ring a waiting foe stands on, the flank asked for on the way: a skirmisher before any other, and a foe with no
/// shield before none; a shield-bearer holds the line, and a leader its followers screen keeps behind them. The flanker
/// stands on the nearest ring; the rest stand by their place in the line, the nearest ring holding as many as fit along
/// the line RING_ROOM apart, the next RANK_GAP farther out as many again, and so on, so the next to go in stand
/// nearest.
pub fn ring_of(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board, sight: &Sight, ring: f64) -> f64 {
    let suits = match brain.role() {
        _ if brain.orders.screened => None,
        Role::Skirmisher => Some(0),
        _ if here.fighter.arms.off_hand == OffHand::Shield => None,
        _ => Some(1),
    };
    brain.flanking = board.flank(sight.id, here.me, suits);
    if brain.flanking {
        return ring;
    }
    let (mut ring, mut before, line) = (ring, 0, board.in_line(sight.id, here.me));
    loop {
        before += (2.0 * LINE_ARC * ring / RING_ROOM) as usize + 1;
        if line < before {
            return ring;
        }
        ring += RANK_GAP;
    }
}

/// The middle of the line, a bearing from the target: the group's side, where the foes fighting it hand to hand stand
/// round it, once the mean of their bearings leans LINE_LEAN one way; short of that, the way the target faces. None
/// for a foe fighting its target alone, which keeps no line.
fn front(here: &Here<'_, '_>, sight: &Sight) -> Option<f64> {
    let centre = [sight.spot[0], sight.spot[1]];
    let toward = bearing(centre, here.at());
    let (mut east, mut south, mut count) = (libm::sin(toward), -libm::cos(toward), 1.0);
    for (id, other) in here.world.fighters {
        if !here.ally(*id, other) || other.target != Some(sight.id) || other.arms.ranged.is_some() {
            continue;
        }
        let toward = bearing(centre, [other.body.x, other.body.y]);
        (east, south, count) = (east + libm::sin(toward), south - libm::cos(toward), count + 1.0);
    }
    if count < 2.0 {
        return None;
    }
    if libm::sqrt(east * east + south * south) < LINE_LEAN * count {
        return Some(sight.fighter.aim);
    }
    Some(bearing([0.0, 0.0], [east, south]))
}

/// Whether a foe stands where its group means it to: a flanker anywhere, any other within LINE_ARC of the line's
/// middle.
#[must_use]
pub fn in_place(here: &Here<'_, '_>, sight: &Sight, flanking: bool) -> bool {
    let toward = bearing([sight.spot[0], sight.spot[1]], here.at());
    flanking || front(here, sight).is_none_or(|front| off(toward, front) <= LINE_ARC)
}

/// Its place on the ring this tick, a bearing from its target, drifted on from `place` on a ring `ring` metres round.
/// Flanking, it drifts away from where its target faces, out past the line to FLANK_ARC. Holding the line, outside
/// LINE_ARC of the line's middle its place is the line's nearer end. Nearer than RING_ROOM to the next foe of its side
/// on its ring, it moves toward the middle of the room between the next each way; else, in the line, it closes up
/// toward the line's middle, RING_ROOM short of the next. Alone at its target, within FLANK_ARC of its target's face it
/// drifts away from the face up to RING_ROOM short of the next.
#[must_use]
pub fn drift(here: &Here<'_, '_>, sight: &Sight, place: f64, ring: f64, flanking: bool) -> f64 {
    let step = SLOT_TURN / 60.0;
    let from_face = wrap(place - sight.fighter.aim);
    if flanking {
        return if from_face.abs() < FLANK_ARC { wrap(place + here.way_round(from_face) * step) } else { place };
    }
    let line = front(here, sight);
    if let Some(front) = line {
        let from_front = wrap(place - front);
        if from_front.abs() > LINE_ARC {
            return wrap(front + LINE_ARC * here.way_round(from_front));
        }
    }
    let centre = [sight.spot[0], sight.spot[1]];
    let gap = RING_ROOM / ring.max(1.0);
    // The nearest of its side on its ring each way round from its place, clockwise and not, as angles.
    let (mut clockwise, mut counter) = (f64::INFINITY, f64::INFINITY);
    for (id, other) in here.world.fighters {
        let there = [other.body.x, other.body.y];
        if !here.ally(*id, other) || (apart(centre, there) - ring).abs() > 2.0 * RING_SLACK {
            continue;
        }
        let ahead = wrap(bearing(centre, there) - place);
        if ahead >= 0.0 {
            clockwise = clockwise.min(ahead);
        } else {
            counter = counter.min(-ahead);
        }
    }
    if clockwise.min(counter) < gap {
        // Crowded, it moves toward the middle of the room between the next each way, so a crowded ring evens out.
        if (clockwise - counter).abs() <= 2.0 * step {
            return place;
        }
        return wrap(place + if clockwise > counter { step } else { -step });
    }
    if let Some(front) = line {
        // Holding the line, it closes up toward the line's middle, RING_ROOM short of the next that way.
        let from_front = wrap(place - front);
        let way = -here.way_round(from_front);
        let room = if way > 0.0 { clockwise } else { counter };
        return if from_front.abs() > step && room >= gap + step { wrap(place + way * step) } else { place };
    }
    if from_face.abs() >= FLANK_ARC {
        return place;
    }
    let way = here.way_round(from_face);
    let room = if way > 0.0 { clockwise } else { counter };
    if room >= gap + step { wrap(place + way * step) } else { place }
}
