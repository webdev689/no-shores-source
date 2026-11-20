//! A patrol's dungeon entrances: one for each of its dungeons, laid out from the node's id the same every time, apart
//! from its resource spots' draw so those stand where they always have. Each is one of the four entrances Daggerfall's
//! dungeon blocks stand, drawn from its dungeon's seed, turned so its door faces the patrol's middle. A player may join
//! the patrol's room before an entrance's door, as they come out of its dungeon.

use crate::{Floor, PlayerId, Room, standing_on};
use combat::sight::{apart, bearing};
use gear::dice::{Dice, Purpose};
use land::ground::WaterAt;
use movement::{Body, Terrain};
use reach::{distance_to_ring, inside};

/// How far inside the ring's edge an entrance stands, and how far from every spawn, every resource spot and every
/// other entrance (m).
const FROM_EDGE_M: f64 = 60.0;
const FROM_SPAWNS_M: f64 = 60.0;
const FROM_SPOTS_M: f64 = 40.0;
const APART_M: f64 = 300.0;
/// The ground round an entrance, out to this far, rises and falls by no more than this (m).
const LEVEL_ACROSS_M: f64 = 12.0;
const LEVEL_WITHIN_M: f64 = 3.0;
/// How many places are tried for a patrol's entrances.
const TRIES: u32 = 400;
/// How far before its door a player joins at an entrance (m).
pub const BEFORE_DOOR_M: f64 = 1.5;

/// An entrance model as the forged props hold it, in the forged frame (x right, y up, z forward): its id, its door's
/// quad by three corners in turn and the way it faces, and how far up its dungeon block stands it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Model {
    pub id: u32,
    pub door: [[f64; 3]; 3],
    pub normal: [f64; 3],
    pub lift: f64,
}

/// Which of `MODELS` a dungeon's entrance is: one of its style's (a mound with a door for a built dungeon, a cave mouth
/// for the caverns and the mines), drawn by its seed. DUNGAA00's boulder and DUNGAA01's great tree are never drawn and
/// stand only by their numbers on the wire.
pub(crate) fn model_of(style: &dungeon::Style, seed: u32) -> usize {
    let id = style.entrances.get(seed as usize % style.entrances.len().max(1)).copied().unwrap_or(0);
    MODELS.iter().position(|model| model.id == u32::from(id)).unwrap_or(2)
}

/// The entrances Daggerfall's blocks stand: DUNGAA00's and DUNGAA01's, the two mounds the other dungeon blocks do,
/// and the two cave mouths its ruins do.
#[allow(clippy::approx_constant, reason = "the forged props' own numbers, as they are written there")]
pub(crate) const MODELS: [Model; 6] = [
    Model {
        id: 42000,
        door: [[-0.634, 0.045, -1.692], [-0.634, -2.205, -1.692], [0.616, -2.205, -1.692]],
        normal: [0.0, 0.0, -1.0],
        lift: 2.5,
    },
    Model {
        id: 42001,
        door: [[-0.598, -4.771, 3.167], [-1.823, -4.771, 2.842], [-1.823, -2.521, 2.842]],
        normal: [-0.2564, 0.0, 0.9666],
        lift: 4.8,
    },
    Model {
        id: 43601,
        door: [[-0.882, -0.787, 0.038], [-0.882, 1.16, 0.038], [-0.182, 1.159, 0.738]],
        normal: [-0.7071, 0.0, 0.7071],
        lift: 0.775,
    },
    Model {
        id: 43602,
        door: [[-0.589, -0.326, 1.213], [-0.589, 1.578, 0.232], [0.611, 1.578, 0.232]],
        normal: [0.0, 0.458, 0.8889],
        lift: 0.475,
    },
    Model {
        id: 43603,
        door: [[-0.562, -1.204, 0.442], [-0.785, 0.699, -0.215], [0.837, 0.699, -0.215]],
        normal: [0.0, 0.3261, 0.9453],
        lift: 1.2,
    },
    Model {
        id: 43604,
        door: [[-0.648, -1.226, 1.52], [-0.648, 0.974, 1.52], [0.552, 0.974, 1.52]],
        normal: [0.0, 0.0, 1.0],
        lift: 1.225,
    },
];

/// An entrance: where it stands (x, y and the ground's height there), its model's yaw (radians clockwise from north,
/// turning its +z as an RMB block's yaw does), and which of MODELS it is.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Entrance {
    pub at: [f64; 3],
    pub yaw: f64,
    pub model: usize,
}

impl Entrance {
    /// A model's point (forged frame) where the entrance stands it: x east, y south, z up.
    fn place(&self, point: [f64; 3]) -> [f64; 3] {
        let (sin, cos) = (libm::sin(self.yaw), libm::cos(self.yaw));
        let lift = MODELS[self.model].lift;
        [
            self.at[0] + point[0] * cos + point[2] * sin,
            self.at[1] + point[0] * sin - point[2] * cos,
            self.at[2] + lift + point[1],
        ]
    }

    /// The middle of its door at its foot, (x, y), and the way the door faces, outward.
    #[must_use]
    pub fn door(&self) -> ([f64; 2], f64) {
        let Model { door: [first, _, third], normal, .. } = MODELS[self.model];
        let middle = self.place([(first[0] + third[0]) / 2.0, 0.0, (first[2] + third[2]) / 2.0]);
        (([middle[0], middle[1]]), self.yaw + libm::atan2(normal[0], normal[2]))
    }
}

/// Whether a point of a room's floor is dry ground: out of the sea, and out of any river or lake the land tells.
pub(crate) fn dry(floor: &Floor, x: f64, y: f64) -> bool {
    match floor {
        Floor::Land(ground) => ground.water_at(x, y) == WaterAt::Dry,
        Floor::Flat | Floor::Dungeon(_) => floor.height_at(x, y) >= 0.0,
        // The open sea under a course is water everywhere.
        Floor::Sea(_) => false,
    }
}

/// Whether the ground across LEVEL_ACROSS_M round a point, at its middle and at eight ways round it at half that and
/// at all of it, rises and falls by LEVEL_WITHIN_M at most.
fn level(floor: &dyn Terrain, x: f64, y: f64) -> bool {
    let ways = [(0.0, -1.0), (1.0, -1.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (-1.0, 1.0), (-1.0, 0.0), (-1.0, -1.0)];
    let heights = [LEVEL_ACROSS_M / 2.0, LEVEL_ACROSS_M].into_iter().flat_map(|across| {
        ways.into_iter().map(move |(east, south): (f64, f64)| {
            let along = if east != 0.0 && south != 0.0 { across * core::f64::consts::FRAC_1_SQRT_2 } else { across };
            floor.height_at(x + east * along, y + south * along)
        })
    });
    let (low, high) = core::iter::once(floor.height_at(x, y))
        .chain(heights)
        .fold((f64::INFINITY, f64::NEG_INFINITY), |(low, high), height| (low.min(height), high.max(height)));
    high - low <= LEVEL_WITHIN_M
}

/// A patrol's entrances, its dungeons' in their order, from the node's id: places drawn in the ring until each
/// dungeon has one or the tries run out, each FROM_EDGE_M inside the ring's edge, FROM_SPAWNS_M from every spawn,
/// FROM_SPOTS_M from every resource spot and APART_M from the others, on dry ground that is level; each turned so its
/// door faces the ring's middle (its corners' average).
pub(crate) fn laid(
    node: &str,
    floor: &dyn Terrain,
    dry: &dyn Fn(f64, f64) -> bool,
    ring: &[[f64; 2]],
    spawns: &[[f64; 2]],
    spots: &[[f64; 2]],
) -> Vec<Entrance> {
    let (west, east) = ring.iter().fold((f64::MAX, f64::MIN), |(lo, hi), point| (lo.min(point[0]), hi.max(point[0])));
    let (north, south) = ring.iter().fold((f64::MAX, f64::MIN), |(lo, hi), point| (lo.min(point[1]), hi.max(point[1])));
    let corners = ring.len().max(1) as f64;
    let middle = ring.iter().fold([0.0, 0.0], |sum, point| [sum[0] + point[0] / corners, sum[1] + point[1] / corners]);
    let dice = Dice { seed: crate::patrol::named(&format!("{node}:dungeons")), tick: 0, player: 0 };
    let mut found: Vec<Entrance> = Vec::with_capacity(dungeon::PER_PATROL);
    for nth in 0..TRIES {
        if found.len() == dungeon::PER_PATROL {
            break;
        }
        let x = west + dice.roll(Purpose::Patrol, nth * 2) * (east - west);
        let y = north + dice.roll(Purpose::Patrol, nth * 2 + 1) * (south - north);
        let clear = inside(ring, x, y)
            && distance_to_ring(ring, x, y) >= FROM_EDGE_M
            && spawns.iter().all(|&spawn| apart(spawn, [x, y]) >= FROM_SPAWNS_M)
            && spots.iter().all(|&spot| apart(spot, [x, y]) >= FROM_SPOTS_M)
            && found.iter().all(|other| apart([other.at[0], other.at[1]], [x, y]) >= APART_M)
            && dry(x, y)
            && level(floor, x, y);
        if clear {
            let (seed, style) = dungeon::of_patrol(node, found.len());
            let model = model_of(&style, seed);
            let Model { normal, .. } = MODELS[model];
            let yaw = bearing([x, y], middle) - libm::atan2(normal[0], normal[2]);
            found.push(Entrance { at: [x, y, floor.height_at(x, y)], yaw, model });
        }
    }
    found
}

impl Room {
    /// A patrol's entrances, its dungeons' in their order; none in any other room.
    #[must_use]
    pub fn entrances(&self) -> &[Entrance] {
        self.patrol.as_ref().map_or(&[], |patrol| patrol.entrances.as_slice())
    }

    /// A new player standing BEFORE_DOOR_M before the door of the entrance numbered `number`, facing away from it, as
    /// they come out of its dungeon; none when the room has no such entrance or is full.
    pub fn join_at(&mut self, number: usize) -> Option<PlayerId> {
        let entrance = *self.entrances().get(number)?;
        if self.players.len() >= crate::PLAYERS_MOST {
            return None;
        }
        let ([x, y], facing) = entrance.door();
        let (x, y) = (x + libm::sin(facing) * BEFORE_DOOR_M, y - libm::cos(facing) * BEFORE_DOOR_M);
        let body = Body { facing, ..standing_on(&self.floor, &self.blocks, x, y) };
        Some(self.join_standing(body))
    }
}

#[cfg(test)]
#[path = "entrance_tests.rs"]
mod entrance_tests;
