//! A room's outline inside its rectangle: which of the rectangle's cells it takes, and the rock left standing inside
//! a great cave. Every outline is one walk, so a room never splits into pieces a way must join.

use crate::lane::Lane;

/// A room's shape inside its rectangle.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Shape {
    /// All of it.
    Rectangle,
    /// A corner quarter left rock.
    Ell,
    /// Each corner block left rock, a third of each side.
    Cross,
    /// Each corner cell left rock.
    Octagon,
    /// A hall along the rectangle's longer sides, with single cells cut one deep into the rock beside one or both of
    /// its long walls, rock between them.
    Alcoves,
    /// An irregular outline bitten from the rectangle, rock standing inside the great ones.
    Cave,
    /// A round chamber: the cells inside the rectangle's own ellipse.
    Round,
    /// A walk round a core of rock left standing in the middle, as a cloister runs round its garth.
    Ring,
    /// A bar along one long side and a stem down the middle of the rest.
    Tee,
    /// A rhombus standing on its corners in the rectangle.
    Diamond,
}

/// A cave with both sides at least this many cells is a great one, and stands rock inside; two stones where it
/// holds at least this many cells.
const GREAT_CAVE_SIDE: usize = 5;
const TWO_STONES_CELLS: usize = 24;

/// A room's outline in its rectangle: for each cell, row by row, whether the room takes it; and the cells of rock
/// standing inside it, each (x, y) in the rectangle.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Outline {
    pub takes: Vec<bool>,
    pub stones: Vec<(usize, usize)>,
}

/// The outline of a room of `shape`, `width` by `depth` cells, its draws made on the block's lane.
pub(crate) fn outline(shape: Shape, width: usize, depth: usize, lane: &mut Lane) -> Outline {
    let mut takes = vec![true; width * depth];
    let mut stones = Vec::new();
    let mut leave = |x: usize, y: usize| takes[y * width + x] = false;
    match shape {
        Shape::Rectangle => {}
        Shape::Ell => {
            let (cut_width, cut_depth) = (width / 2, depth / 2);
            let (right, far) = (lane.chance(0.5), lane.chance(0.5));
            for y in 0..depth {
                for x in 0..width {
                    let in_columns = if right { x >= width - cut_width } else { x < cut_width };
                    let in_rows = if far { y >= depth - cut_depth } else { y < cut_depth };
                    if in_columns && in_rows {
                        leave(x, y);
                    }
                }
            }
        }
        Shape::Cross => {
            let (cut_width, cut_depth) = ((width / 3).max(1), (depth / 3).max(1));
            for y in 0..depth {
                for x in 0..width {
                    let side_columns = x < cut_width || x >= width - cut_width;
                    let side_rows = y < cut_depth || y >= depth - cut_depth;
                    if side_columns && side_rows {
                        leave(x, y);
                    }
                }
            }
        }
        Shape::Octagon => {
            for (x, y) in [(0, 0), (width - 1, 0), (0, depth - 1), (width - 1, depth - 1)] {
                leave(x, y);
            }
        }
        Shape::Alcoves => alcoves(&mut takes, width, depth, lane),
        Shape::Cave => stones = cave(&mut takes, width, depth, lane),
        Shape::Round | Shape::Diamond => {
            let (radius_x, radius_y) = (width as f64 / 2.0, depth as f64 / 2.0);
            for y in 0..depth {
                for x in 0..width {
                    let off = |at: usize, radius: f64| ((at as f64 + 0.5 - radius) / radius).abs();
                    let (east, south) = (off(x, radius_x), off(y, radius_y));
                    // Each fattened a little, so its rim cells stay whole and a small one is never a plus sign.
                    let outside =
                        if shape == Shape::Round { east * east + south * south > 1.2 } else { east + south > 1.25 };
                    if outside {
                        leave(x, y);
                    }
                }
            }
        }
        Shape::Ring => stones = ring_core(&mut takes, width, depth),
        Shape::Tee => {
            let bar = (depth / 3).max(1);
            let stem = width.div_ceil(3).max(1);
            let (from, far) = ((width - stem) / 2, lane.chance(0.5));
            for y in 0..depth {
                for x in 0..width {
                    let in_bar = if far { y >= depth - bar } else { y < bar };
                    if !in_bar && (x < from || x >= from + stem) {
                        leave(x, y);
                    }
                }
            }
        }
    }
    Outline { takes, stones }
}

/// Leaves a core of rock standing in the middle of a ring's rectangle, the walk round it two cells wide where the
/// room is seven cells or more that way and one where it is less: the core's cells, as stones no way cuts.
fn ring_core(takes: &mut [bool], width: usize, depth: usize) -> Vec<(usize, usize)> {
    let walk = |side: usize| if side >= 7 { 2 } else { 1 };
    let (inset_x, inset_y) = (walk(width), walk(depth));
    let mut stones = Vec::new();
    for y in inset_y..depth.saturating_sub(inset_y) {
        for x in inset_x..width.saturating_sub(inset_x) {
            takes[y * width + x] = false;
            stones.push((x, y));
        }
    }
    stones
}

/// Leaves the rows of alcoves rock but the alcoves: the outer row along each long wall that holds them, both or one
/// drawn, and in it every second cell from the second, never at the wall's ends.
fn alcoves(takes: &mut [bool], width: usize, depth: usize, lane: &mut Lane) {
    let along_x = width >= depth;
    let (along, across) = if along_x { (width, depth) } else { (depth, width) };
    let rows: Vec<usize> = if lane.chance(0.5) {
        vec![0, across - 1]
    } else if lane.chance(0.5) {
        vec![0]
    } else {
        vec![across - 1]
    };
    for row in rows {
        for step in 0..along {
            let alcove = step % 2 == 1 && step + 1 < along;
            if !alcove {
                let (x, y) = if along_x { (step, row) } else { (row, step) };
                takes[y * width + x] = false;
            }
        }
    }
}

/// Bites a cave from its rectangle, as the Forge's caves are bitten: each cell kept where it lies inside the
/// rectangle's own ellipse, its edge pushed in or out by a draw; then only the cells one walk from the middle are
/// kept, and in a great cave one or two stones stand where every cell round them is the cave's. Its stones.
fn cave(takes: &mut [bool], width: usize, depth: usize, lane: &mut Lane) -> Vec<(usize, usize)> {
    let (radius_x, radius_y) = (width as f64 / 2.0, depth as f64 / 2.0);
    for y in 0..depth {
        for x in 0..width {
            let (off_x, off_y) = ((x as f64 + 0.5 - radius_x) / radius_x, (y as f64 + 0.5 - radius_y) / radius_y);
            takes[y * width + x] = off_x * off_x + off_y * off_y <= 0.75 + lane.draw() * 0.5;
        }
    }
    let middle = (depth / 2) * width + width / 2;
    let mut reached = vec![false; takes.len()];
    let mut todo = vec![middle];
    reached[middle] = true;
    while let Some(index) = todo.pop() {
        let (x, y) = (index % width, index / width);
        let beside = [(x + 1 < width).then(|| index + 1), x.checked_sub(1).map(|_| index - 1)];
        let below = [(y + 1 < depth).then(|| index + width), y.checked_sub(1).map(|_| index - width)];
        for next in beside.into_iter().chain(below).flatten() {
            if takes[next] && !reached[next] {
                reached[next] = true;
                todo.push(next);
            }
        }
    }
    for (index, take) in takes.iter_mut().enumerate() {
        *take = *take && reached[index];
    }
    let mut stones = Vec::new();
    if width < GREAT_CAVE_SIDE || depth < GREAT_CAVE_SIDE {
        return stones;
    }
    let want = if takes.iter().filter(|&&take| take).count() >= TWO_STONES_CELLS { 2 } else { 1 };
    for _ in 0..want {
        // A stone whose eight neighbours are the cave's leaves the cave one walk round it.
        let ringed =
            |x: usize, y: usize| (y - 1..=y + 1).all(|row| (x - 1..=x + 1).all(|column| takes[row * width + column]));
        let candidates: Vec<(usize, usize)> =
            (1..depth - 1).flat_map(|y| (1..width - 1).map(move |x| (x, y))).filter(|&(x, y)| ringed(x, y)).collect();
        if candidates.is_empty() {
            break;
        }
        let (x, y) = candidates[lane.below(candidates.len())];
        takes[y * width + x] = false;
        stones.push((x, y));
    }
    stones
}

/// How a room's ceiling is drawn: flat, a barrel vault along its longer side, a dome, or rough rock. Only a look: a
/// room's ceiling stands at its height whatever its form.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ceiling {
    Flat,
    Vault,
    Dome,
    Cave,
}

impl Ceiling {
    /// Its name on the wire.
    #[must_use]
    pub const fn key(self) -> &'static str {
        match self {
            Ceiling::Flat => "flat",
            Ceiling::Vault => "vault",
            Ceiling::Dome => "dome",
            Ceiling::Cave => "cave",
        }
    }
}

/// How a style roofs its rooms: arched (domes and vaults), flat, or rough rock over every room. A cave is rough
/// rock in any style.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Roof {
    Arched,
    Flat,
    Rough,
}

/// A room's ceiling form: rough over a cave or under a rough roof; under an arched roof, a dome over a square room, an
/// octagon or a round chamber, and a vault along a hall of alcoves, a T or a long rectangle (its longer side at least
/// half again its shorter); flat otherwise, a ring's and a diamond's among them.
pub(crate) fn ceiling(shape: Shape, width: usize, depth: usize, roof: Roof) -> Ceiling {
    let (long, short) = (width.max(depth), width.min(depth));
    match (roof, shape) {
        (Roof::Rough, _) | (_, Shape::Cave) => Ceiling::Cave,
        (Roof::Arched, Shape::Octagon | Shape::Round) => Ceiling::Dome,
        (Roof::Arched, Shape::Alcoves) => Ceiling::Vault,
        (Roof::Arched, Shape::Rectangle) if long == short => Ceiling::Dome,
        (Roof::Arched, Shape::Rectangle) if 2 * long >= 3 * short => Ceiling::Vault,
        _ => Ceiling::Flat,
    }
}
