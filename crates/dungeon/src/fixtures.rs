//! The lights that are not wall torches, by a room's purpose: braziers standing on the floor, candles on the tops of
//! altars, tables, lecterns and coffins, crystals and glowing fungus against a cavern's walls, lanterns hung on a
//! mine's walls and posts, and the fire in a hearth. A brazier and a crystal are solids, standing by the props' rules;
//! the others hang or burn on a piece and fill nothing.

use crate::furnish::Fitting;
use crate::lane::Lane;
use crate::models::{Piece, PropModel, prop_model};
use crate::purposes::{Light, Lit};
use crate::{CELL_M, Dungeon, Prop, SIDES, Side};

/// A fixture's kind, by its number on the wire.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Brazier,
    Candles,
    /// Crystals, or glowing fungus: a cluster against a wall that glows.
    Crystals,
    Lantern,
    Hearth,
}

impl Kind {
    #[must_use]
    pub const fn number(self) -> u8 {
        match self {
            Kind::Brazier => 0,
            Kind::Candles => 1,
            Kind::Crystals => 2,
            Kind::Lantern => 3,
            Kind::Hearth => 4,
        }
    }
}

/// A fixture: where its light burns (x east, y south, z up), its kind, and the box it fills (min x, min y, max x,
/// max y, top), if it fills one.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Fixture {
    pub at: [f64; 3],
    pub kind: Kind,
    pub solid: Option<[f64; 5]>,
}

/// A brazier: its bowl's half width and top, its flame over it, and how far its middle stands off the wall it flanks
/// a door by (m).
pub const BRAZIER_HALF_M: f64 = 0.3;
pub const BRAZIER_TOP_M: f64 = 1.0;
const BRAZIER_FLAME_M: f64 = 1.15;
const BRAZIER_OFF_WALL_M: f64 = 0.9;
/// Candles' flames over the top they stand on (m).
pub const CANDLES_OVER_M: f64 = 0.1;
/// A crystal cluster's length along its wall, how far out it reaches, its top, and how far its back stands off the
/// wall (m); it glows at its middle.
const CRYSTALS_ALONG_M: f64 = 0.6;
const CRYSTALS_INTO_M: f64 = 0.4;
pub const CRYSTALS_TOP_M: f64 = 0.9;
const CRYSTALS_OFF_WALL_M: f64 = 0.1;
/// A lantern's height, how far off its wall it hangs, and how far from a post's middle (m).
pub const LANTERN_M: f64 = 2.0;
const LANTERN_OFF_WALL_M: f64 = 0.25;
const LANTERN_OFF_POST_M: f64 = 0.3;
/// A hearth's fire: its height, and how far forward of the hearth's middle it burns, as a share of its depth.
const HEARTH_FIRE_M: f64 = 0.3;
const HEARTH_FIRE_FORWARD: f64 = 0.15;

/// A box of `half_x` and `half_y` round a point, up to `top`.
fn square(centre: [f64; 2], half_x: f64, half_y: f64, top: f64) -> [f64; 5] {
    [centre[0] - half_x, centre[1] - half_y, centre[0] + half_x, centre[1] + half_y, top]
}

impl Fitting {
    /// A brazier stood on `cell`: at its middle, or BRAZIER_OFF_WALL_M off the wall on `toward`'s side where it flanks
    /// a door; whether it stood.
    fn brazier(&mut self, dungeon: &Dungeon, cell: usize, toward: Option<Side>) -> bool {
        let [x, y] = dungeon.centre(cell);
        let [dx, dy] = toward.map_or([0.0, 0.0], Side::unit);
        let off = CELL_M / 2.0 - BRAZIER_OFF_WALL_M;
        let centre = [x + dx * off, y + dy * off];
        let solid = square(centre, BRAZIER_HALF_M, BRAZIER_HALF_M, BRAZIER_TOP_M);
        if !self.may(dungeon, cell, None, Some(&solid)) {
            return false;
        }
        self.take(cell, None, true);
        self.fixtures.push(Fixture {
            at: [centre[0], centre[1], BRAZIER_FLAME_M],
            kind: Kind::Brazier,
            solid: Some(solid),
        });
        true
    }

    /// A light on a wall of `cell`: a crystal cluster against it, a solid, or a lantern hung on it; whether it stood.
    fn on_wall(&mut self, dungeon: &Dungeon, cell: usize, wall: Side, kind: Kind) -> bool {
        let [x, y] = dungeon.centre(cell);
        let [dx, dy] = wall.unit();
        let (off, solid) = if kind == Kind::Crystals {
            let off = CELL_M / 2.0 - CRYSTALS_OFF_WALL_M - CRYSTALS_INTO_M / 2.0;
            let (half_x, half_y) = if dx == 0.0 {
                (CRYSTALS_ALONG_M / 2.0, CRYSTALS_INTO_M / 2.0)
            } else {
                (CRYSTALS_INTO_M / 2.0, CRYSTALS_ALONG_M / 2.0)
            };
            (off, Some(square([x + dx * off, y + dy * off], half_x, half_y, CRYSTALS_TOP_M)))
        } else {
            (CELL_M / 2.0 - LANTERN_OFF_WALL_M, None)
        };
        if !self.may(dungeon, cell, Some(wall), solid.as_ref()) {
            return false;
        }
        // A lantern fills no floor, but its cell then holds nothing else, as a hanging's does.
        self.take(cell, Some(wall), solid.is_some());
        let z = if kind == Kind::Crystals { CRYSTALS_TOP_M / 2.0 } else { LANTERN_M };
        self.fixtures.push(Fixture { at: [x + dx * off, y + dy * off, z], kind, solid });
        true
    }

    /// The pieces laid in this room of a kind, each its model and where its box stands.
    fn pieces(&self, piece: Piece) -> Vec<(PropModel, Prop)> {
        self.props
            .iter()
            .filter_map(|prop| prop_model(prop.model).filter(|model| model.piece == piece).map(|model| (model, *prop)))
            .collect()
    }

    /// Lights one light of its purpose where it says.
    pub(crate) fn light(&mut self, dungeon: &Dungeon, lane: &mut Lane, light: &Light) {
        let cells = dungeon.rooms[self.room].cells.len();
        match light.lit {
            Lit::Flank => {
                let Some((first, second, wall)) = self.flank_cells(dungeon) else { return };
                let before = (self.taken.len(), self.solid.len(), self.fixtures.len());
                if !(self.brazier(dungeon, first, Some(wall)) && self.brazier(dungeon, second, Some(wall))) {
                    self.taken.truncate(before.0);
                    self.solid.truncate(before.1);
                    self.fixtures.truncate(before.2);
                }
            }
            Lit::Middle => {
                for cell in self.nearest_middle(dungeon) {
                    if self.brazier(dungeon, cell, None) {
                        return;
                    }
                }
            }
            Lit::Walls { per } => {
                let (want, mut lit) = ((cells / per).max(1), 0);
                for (cell, wall) in self.wall_spots(dungeon, lane) {
                    if lit == want {
                        break;
                    }
                    if !self.taken.contains(&cell) && self.on_wall(dungeon, cell, wall, light.kind) {
                        lit += 1;
                    }
                }
            }
            Lit::Tops { most } => {
                for (_, prop) in self.pieces(Piece::Top).into_iter().take(most) {
                    let Some([min_x, min_y, max_x, max_y, top]) = prop.solid else { continue };
                    let at = [(min_x + max_x) / 2.0, (min_y + max_y) / 2.0, top + CANDLES_OVER_M];
                    self.fixtures.push(Fixture { at, kind: Kind::Candles, solid: None });
                }
            }
            Lit::Hearths => {
                for (model, prop) in self.pieces(Piece::Hearth) {
                    let Some([min_x, min_y, max_x, max_y, _]) = prop.solid else { continue };
                    let front = front_of(prop.yaw);
                    let [fx, fy] = front.unit();
                    let forward = model.depth() * HEARTH_FIRE_FORWARD;
                    let middle = [(min_x + max_x) / 2.0, (min_y + max_y) / 2.0];
                    let at = [middle[0] + fx * forward, middle[1] + fy * forward, HEARTH_FIRE_M];
                    self.fixtures.push(Fixture { at, kind: Kind::Hearth, solid: None });
                }
            }
            Lit::Posts => {
                let room = &dungeon.rooms[self.room];
                let middle = [
                    (room.x as f64 + room.width as f64 / 2.0) * CELL_M,
                    (room.y as f64 + room.depth as f64 / 2.0) * CELL_M,
                ];
                for (_, prop) in self.pieces(Piece::Post) {
                    let Some([min_x, min_y, max_x, max_y, _]) = prop.solid else { continue };
                    let post = [(min_x + max_x) / 2.0, (min_y + max_y) / 2.0];
                    let (dx, dy) = (middle[0] - post[0], middle[1] - post[1]);
                    // Toward the room's middle along the nearer axis, so it hangs on the post's face to the room.
                    let toward = if dx.abs() >= dy.abs() { [dx.signum(), 0.0] } else { [0.0, dy.signum()] };
                    let at =
                        [post[0] + toward[0] * LANTERN_OFF_POST_M, post[1] + toward[1] * LANTERN_OFF_POST_M, LANTERN_M];
                    self.fixtures.push(Fixture { at, kind: Kind::Lantern, solid: None });
                }
            }
        }
    }
}

/// The side a yaw faces, of the four a piece is turned to.
fn front_of(yaw: f64) -> Side {
    SIDES.into_iter().find(|side| (side.bearing() - yaw).abs() < 1e-9).unwrap_or(Side::North)
}
