//! Where a body may go: a node's section of the land, the warning past its edge, death beyond it, death by a fall in a
//! social space, and the respawn.
//! Judged once a tick, the same on the server and in any browser that predicts it: the maths is + - * /, square root
//! and comparisons, which every machine rounds alike.

/// Ticks a second: the rate movement steps bodies at (its `TICK_SECONDS` is 1/60 s).
pub const TICKS_PER_SECOND: u32 = 60;
/// How long a body may stand outside its section before it dies: 10 s.
pub const WARNING_TICKS: u32 = 10 * TICKS_PER_SECOND;
/// How far past the section's edge a body dies at once, metres.
pub const LIMIT_M: f64 = 60.0;
/// How far below where it last stood a body in the air dies, in a social space, metres.
pub const FALL_M: f64 = 6.0;
/// How long after death a respawn is offered: 4 s.
pub const RESPAWN_TICKS: u32 = 4 * TICKS_PER_SECOND;

/// A node's section of the land, in metres (x east, y south): its edge, a closed ring whose last point does not repeat
/// its first, the places a body may respawn, and whether a fall of FALL_M kills there (a social space's does).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Section {
    pub ring: Vec<[f64; 2]>,
    pub spawns: Vec<[f64; 2]>,
    pub falls_kill: bool,
}

/// Where a body is, metres: its feet (x east, y south, z up), and whether it is in the air.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Place {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub aloft: bool,
}

/// Where a body stands with its section.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Standing {
    /// Inside the ring, or on it.
    Inside,
    /// Outside and warned to go back: it dies once `ticks_left` more ticks pass outside.
    Warned { ticks_left: u32 },
    /// Dead for `ticks` ticks, 0 on the tick it died; by a fall, or else by straying. Only a respawn ends it.
    Dead { ticks: u32, fell: bool },
}

impl Standing {
    /// The standing one tick on, for a body now at `at` that last stood at the height `stood`. Where falls kill, a body
    /// in the air FALL_M or more below `stood` dies at once, inside the ring or out, and one leaving the ring in the air
    /// is warned only once its feet are down. Outside the ring the count runs down from WARNING_TICKS; back inside
    /// ends it; at 0, or LIMIT_M or more past the edge, the body dies, measured flat.
    #[must_use]
    pub fn tick(self, section: &Section, at: Place, stood: f64) -> Self {
        let left = match self {
            Standing::Dead { ticks, fell } => return Standing::Dead { ticks: ticks.saturating_add(1), fell },
            Standing::Inside => WARNING_TICKS,
            Standing::Warned { ticks_left } => ticks_left,
        };
        if section.falls_kill && at.aloft && stood - at.z >= FALL_M {
            return Standing::Dead { ticks: 0, fell: true };
        }
        let Place { x, y, .. } = at;
        if inside(&section.ring, x, y) {
            return Standing::Inside;
        }
        // Where falls kill, going over the edge starts no warning until the feet are down: the fall is judged first.
        if section.falls_kill && at.aloft && self == Standing::Inside {
            return Standing::Inside;
        }
        let ticks_left = left.saturating_sub(1);
        if ticks_left == 0 || distance_to_ring(&section.ring, x, y) >= LIMIT_M {
            Standing::Dead { ticks: 0, fell: false }
        } else {
            Standing::Warned { ticks_left }
        }
    }

    /// Whether the body may respawn: dead for RESPAWN_TICKS or more.
    #[must_use]
    pub fn may_respawn(self) -> bool {
        matches!(self, Standing::Dead { ticks, .. } if ticks >= RESPAWN_TICKS)
    }
}

/// The height a body's fall is measured from, one tick on, from `stood` before it: where its feet are while they are
/// down (on the ground, on a wall or a lip), kept while it is in the air, so a jump's rise is never a footing.
#[must_use]
pub fn stood(stood: f64, at: Place) -> f64 {
    if at.aloft { stood } else { at.z }
}

/// Whether (x, y) lies inside the ring or on its edge, by the even-odd rule. A ring of fewer than three points holds
/// nothing.
#[must_use]
pub fn inside(ring: &[[f64; 2]], x: f64, y: f64) -> bool {
    if ring.len() < 3 {
        return false;
    }
    let mut odd = false;
    for (index, &[from_x, from_y]) in ring.iter().enumerate() {
        let [to_x, to_y] = ring[(index + 1) % ring.len()];
        // Which side of the edge's line the point lies: 0 on it, positive to the left going from `from` to `to`.
        let side = (to_x - from_x) * (y - from_y) - (to_y - from_y) * (x - from_x);
        let within = x >= from_x.min(to_x) && x <= from_x.max(to_x) && y >= from_y.min(to_y) && y <= from_y.max(to_y);
        if side == 0.0 && within {
            return true;
        }
        // The edge crosses the line east from the point: a crossing's x past the point's, without a division.
        if (from_y > y) != (to_y > y) && (side > 0.0) == (to_y > from_y) {
            odd = !odd;
        }
    }
    odd
}

/// How far outside the ring (x, y) lies, metres: 0 inside it or on it, else the distance to its nearest edge.
#[must_use]
pub fn distance_outside(ring: &[[f64; 2]], x: f64, y: f64) -> f64 {
    if inside(ring, x, y) { 0.0 } else { distance_to_ring(ring, x, y) }
}

/// The distance from (x, y) to the ring's nearest edge, inside or out; infinite for a ring with no points.
#[must_use]
pub fn distance_to_ring(ring: &[[f64; 2]], x: f64, y: f64) -> f64 {
    let edges = ring.iter().enumerate().map(|(index, &from)| (from, ring[(index + 1) % ring.len()]));
    edges.map(|(from, to)| distance_to_edge(from, to, x, y)).fold(f64::INFINITY, f64::min)
}

fn distance_to_edge([from_x, from_y]: [f64; 2], [to_x, to_y]: [f64; 2], x: f64, y: f64) -> f64 {
    let (span_x, span_y) = (to_x - from_x, to_y - from_y);
    let length = span_x * span_x + span_y * span_y;
    let along =
        if length > 0.0 { (((x - from_x) * span_x + (y - from_y) * span_y) / length).clamp(0.0, 1.0) } else { 0.0 };
    let (off_x, off_y) = (x - from_x - span_x * along, y - from_y - span_y * along);
    (off_x * off_x + off_y * off_y).sqrt()
}

/// The section's spawn nearest (x, y), where a body that died there comes back; the first of any equally near. None
/// for a section with no spawns.
#[must_use]
pub fn respawn_point(section: &Section, x: f64, y: f64) -> Option<[f64; 2]> {
    let squared = |[spawn_x, spawn_y]: [f64; 2]| (spawn_x - x) * (spawn_x - x) + (spawn_y - y) * (spawn_y - y);
    section.spawns.iter().copied().reduce(|best, spawn| if squared(spawn) < squared(best) { spawn } else { best })
}
