//! Where things stand in a zone, in its own frame (x east, y south, metres): where a body comes in, the mouth behind
//! it and the mouths on, its lamp, its foes' posts, and the places its deal uses.

/// A mouth: its middle at its foot, (x, y), and the way its front faces, into the zone, in radians clockwise from
/// north.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Door {
    pub at: [f64; 2],
    pub facing: f64,
}

/// A zone's places.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Sites {
    /// Where a body stands coming in, and the way it faces.
    pub arrive: [f64; 2],
    pub facing: f64,
    /// The mouth it came in by, shut behind it.
    pub way_in: Door,
    /// One mouth for each zone it leads on to, in the zone's order.
    pub onward: Vec<Door>,
    /// The lamp's middle, in a lamp's zone.
    pub lamp: Option<[f64; 2]>,
    /// Where its foes' bands stand, the nearest the way in first.
    pub posts: Vec<[f64; 2]>,
    /// Open floor spread over the zone, the farthest from the way in first, for what its deal stands: dead lamps,
    /// tally posts, a reliquary, a vein's nodes, a ring, a hunt's round.
    pub spots: Vec<[f64; 2]>,
}

impl Default for Door {
    fn default() -> Self {
        Door { at: [0.0, 0.0], facing: 0.0 }
    }
}

/// How far apart a zone's spots and posts keep, metres.
pub const SPOT_APART_M: f64 = 7.0;
/// How far from the way in its first post stands at least, metres: a body comes in before it is met.
pub const POST_OFF_WAY_IN_M: f64 = 14.0;

/// From `places` ordered as wanted, those at least `apart` from every one taken before.
pub(crate) fn spread(places: impl IntoIterator<Item = [f64; 2]>, apart: f64) -> Vec<[f64; 2]> {
    let mut kept: Vec<[f64; 2]> = Vec::new();
    for place in places {
        if kept.iter().all(|held| libm::hypot(held[0] - place[0], held[1] - place[1]) >= apart) {
            kept.push(place);
        }
    }
    kept
}

/// The spots a zone's deal stands its things on, `SPOT_APART_M` apart, or closer in passes where its floor holds too
/// few for the `wanted` its deal needs: a small dungeon still holds a vein's six nodes.
pub(crate) fn spots_of(floor: &[[f64; 2]], wanted: usize) -> Vec<[f64; 2]> {
    let mut spots = Vec::new();
    for apart in [SPOT_APART_M, 5.0, 3.5] {
        spots = spread(floor.iter().copied(), apart);
        if spots.len() >= wanted {
            break;
        }
    }
    spots
}

/// The distance between two points.
pub(crate) fn apart(one: [f64; 2], other: [f64; 2]) -> f64 {
    libm::hypot(one[0] - other[0], one[1] - other[1])
}
