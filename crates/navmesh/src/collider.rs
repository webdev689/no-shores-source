//! What a navmesh is baked from: blocks standing on the ground, and ramps. Their tops, and the ground between them,
//! are also the heights a path rides.

use movement::{Block, Terrain};

/// The way a ramp rises: from its footprint's west edge to its east edge, or from its north edge to its south.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rise {
    East,
    South,
}

/// A ramp: a footprint (x east, y south, metres) whose top rises in a plane from `low` at the footprint's minimum
/// the way it `rises` to `high` at its maximum. It stands solid from the ground beneath it up to the plane.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ramp {
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
    pub rises: Rise,
    pub low: f64,
    pub high: f64,
}

/// One solid thing on the course.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Collider {
    Block(Block),
    Ramp(Ramp),
}

impl From<Block> for Collider {
    fn from(block: Block) -> Self {
        Self::Block(block)
    }
}

impl Collider {
    /// The footprint: min x, min y, max x, max y.
    pub(crate) fn footprint(&self) -> [f64; 4] {
        match self {
            Self::Block(block) => [block.min_x, block.min_y, block.max_x, block.max_y],
            Self::Ramp(ramp) => [ramp.min_x, ramp.min_y, ramp.max_x, ramp.max_y],
        }
    }

    /// The highest point of its top.
    pub(crate) fn highest(&self) -> f64 {
        match self {
            Self::Block(block) => block.top,
            Self::Ramp(ramp) => ramp.low.max(ramp.high),
        }
    }

    /// Whether its top is shallow enough to walk: a block's always is, a ramp's within `max_slope` rise over run.
    pub(crate) fn walkable_top(&self, max_slope: f64) -> bool {
        match self {
            Self::Block(_) => true,
            Self::Ramp(ramp) => {
                let run = match ramp.rises {
                    Rise::East => ramp.max_x - ramp.min_x,
                    Rise::South => ramp.max_y - ramp.min_y,
                };
                ((ramp.high - ramp.low) / run).abs() <= max_slope
            }
        }
    }

    /// The height of its top at (x, y): a block's top, or the ramp's plane there, held to its ends.
    pub(crate) fn surface(&self, x: f64, y: f64) -> f64 {
        match self {
            Self::Block(block) => block.top,
            Self::Ramp(ramp) => {
                let along = match ramp.rises {
                    Rise::East => (x - ramp.min_x) / (ramp.max_x - ramp.min_x),
                    Rise::South => (y - ramp.min_y) / (ramp.max_y - ramp.min_y),
                };
                let t = along.clamp(0.0, 1.0);
                ramp.low + (ramp.high - ramp.low) * t
            }
        }
    }

    /// Whether (x, y) is on its footprint, edges included.
    fn covers(&self, x: f64, y: f64) -> bool {
        let [min_x, min_y, max_x, max_y] = self.footprint();
        !(x < min_x || x > max_x || y < min_y || y > max_y)
    }
}

/// The surface a body stands on at (x, y): of the tops over it and not under the ground, the one nearest `near` (a
/// poly's own level, so a floor under an overhang is not taken for the one above it); the tallest when `near` is
/// none; the ground when no top is over it.
pub(crate) fn surface_near(colliders: &[Collider], ground: &dyn Terrain, x: f64, y: f64, near: Option<f64>) -> f64 {
    let floor = ground.height_at(x, y);
    let Some(near) = near else { return surface_top(colliders, floor, x, y) };
    let mut found = None;
    let mut best = f64::INFINITY;
    for collider in colliders.iter().filter(|collider| collider.covers(x, y)) {
        let top = collider.surface(x, y);
        if top < floor {
            continue;
        }
        let off = (top - near).abs();
        if off < best {
            best = off;
            found = Some(top);
        }
    }
    found.unwrap_or(floor)
}

/// The tallest top over (x, y), never below the ground there, at `floor`.
fn surface_top(colliders: &[Collider], floor: f64, x: f64, y: f64) -> f64 {
    let tallest = colliders
        .iter()
        .filter(|collider| collider.covers(x, y))
        .fold(f64::NEG_INFINITY, |tallest, collider| tallest.max(collider.surface(x, y)));
    if tallest == f64::NEG_INFINITY { floor } else { tallest.max(floor) }
}
