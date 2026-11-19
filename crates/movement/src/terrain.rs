//! The open ground under the blocks: the land a body walks on, known only by its height at any point, so the rules
//! take any land without depending on the crate that makes it.

use crate::body::TUNING;

/// The height of the open ground at any point (x east, y south, metres), metres up.
pub trait Terrain {
    fn height_at(&self, x: f64, y: f64) -> f64;

    /// Whether a wall of the terrain stands across a move from `from` to `to` anywhere along it, so a move longer than
    /// a wall is thick never passes through it: open ground has none.
    fn walled(&self, _from: (f64, f64), _to: (f64, f64)) -> bool {
        false
    }

    /// Whether a wall of the terrain stands across the straight line from `from` to `to` (x, y, z) below the line where
    /// it crosses, so a look, a blow, a noise or a throw along it meets the wall; a line passes over a wall lower than
    /// itself. Unlike a move, a line keeps no half-width off a wall. Open ground has none.
    fn line_walled(&self, _from: [f64; 3], _to: [f64; 3]) -> bool {
        false
    }

    /// How far along the segment from `from` to `to` (0 to 1) it first enters a wall of the terrain below the wall's
    /// top, if it does: where a shot meets a wall exactly, however thin. Open ground has none.
    fn wall_entry(&self, _from: [f64; 3], _to: [f64; 3]) -> Option<f64> {
        None
    }
}

/// Open ground, level at 0 m everywhere.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Flat;

impl Terrain for Flat {
    fn height_at(&self, _x: f64, _y: f64) -> f64 {
        0.0
    }
}

/// Whether the terrain stops a move from `from` to `to`, `run` metres across, for feet at `z`: a wall of it along the
/// move, ground that would lift the feet more than a step, or lifts them where the terrain rises along the move more
/// steeply than the slope limit. Terrain ahead no higher than the feet, as downhill or beside a block's top, never
/// stops it. The rise is the terrain's own, from the terrain under the body, so a block sunk into a slope is walked
/// onto and off again.
pub(crate) fn too_steep(terrain: &dyn Terrain, z: f64, from: (f64, f64), to: (f64, f64), run: f64) -> bool {
    let ahead = terrain.height_at(to.0, to.1);
    terrain.walled(from, to)
        || ahead > z + TUNING.step
        || (ahead > z && ahead - terrain.height_at(from.0, from.1) > TUNING.slope * run)
}
