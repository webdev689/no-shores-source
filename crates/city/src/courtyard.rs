//! The social plaza's courtyard, after the Tower's: a portico on the landward side with a great door into the
//! landmark's hall, arcades either side of it with an alcove a bay, braziers flanking an obelisk in the middle,
//! benches facing the sea, lanterns on the seaward parapet, and bands of stone laid in the paving. Every piece is a
//! solid of the plan, dressed in the city's climate; the overhead pieces (entablature, roofs, hung lamps) stand clear
//! of a body (`collision`).

use crate::landmarks::{ahead, turn_toward};
use crate::solids::{Material, Shape, Solid};

/// The plaza as the courtyard is laid out in it: its middle, the way to the sea and the way across it (unit vectors
/// square to the world), its depth toward the sea and its length across, and its level.
#[derive(Debug, Clone, Copy)]
pub struct Frame {
    pub middle: [f64; 2],
    pub seaward: [f64; 2],
    pub depth: f64,
    pub length: f64,
    pub level: f64,
}

/// The parapet's height over the floor, metres, for the lanterns standing on it.
pub const PARAPET_TOP_M: f64 = 1.1;
/// The spawns' offsets across the plaza from its middle, metres; lanterns and benches stand midway between them.
pub const SPAWN_OFFSETS_M: [f64; 4] = [-60.0, -20.0, 20.0, 60.0];
/// The portico: its width across, its podium's depth and height, its columns' height.
const PORTICO_M: [f64; 4] = [52.0, 16.0, 1.2, 11.0];
/// The arcades: where they start and end across the plaza, their depth, their columns' height and their bays' width
/// as near as the arcade's length allows.
pub(crate) const ARCADE_M: [f64; 5] = [32.0, 118.0, 10.0, 6.0, 7.2];
/// The obelisk's height, over its two steps, metres.
pub const OBELISK_M: f64 = 18.0;
/// How thick a band laid in the paving is, metres: too low to step over, and clear of the paving's face.
const INLAY_M: f64 = 0.02;

impl Frame {
    fn across(&self) -> [f64; 2] {
        [-self.seaward[1], self.seaward[0]]
    }

    /// A point `toward_sea` metres seaward of the middle and `across` metres across.
    pub(crate) fn at(&self, toward_sea: f64, across: f64) -> [f64; 2] {
        ahead(ahead(self.middle, self.seaward, toward_sea), self.across(), across)
    }

    /// A box standing at `base` metres over the floor, `width` across the plaza and `depth` toward the sea.
    pub(crate) fn block(&self, toward_sea: f64, across: f64, base: f64, size: [f64; 3], material: Material) -> Solid {
        let [x, y] = self.at(toward_sea, across);
        Solid::upright(Shape::Block, [x, y, self.level + base], size, material).turned(turn_toward(self.seaward))
    }

    pub(crate) fn round(&self, toward_sea: f64, across: f64, base: f64, shape: [f64; 3], material: Material) -> Solid {
        let [width, height, top] = shape;
        let [x, y] = self.at(toward_sea, across);
        let column = Shape::Column { sides: 16, top };
        Solid::upright(column, [x, y, self.level + base], [width, width, height], material)
    }
}

/// Everything the courtyard stands on the plaza.
#[must_use]
pub fn courtyard(frame: &Frame) -> Vec<Solid> {
    let mut solids = portico(frame);
    for side in [-1.0, 1.0] {
        solids.extend(arcade(frame, side));
    }
    solids.extend(middle(frame));
    solids.extend(seaward_side(frame));
    solids.extend(inlays(frame));
    solids
}

/// The portico on the landward side: a podium up three steps, six columns, an entablature and a pediment, against a
/// wall with a great timber door in an arch.
fn portico(frame: &Frame) -> Vec<Solid> {
    let [width, deep, raised, tall] = PORTICO_M;
    let edge = -frame.depth / 2.0;
    let front = edge + deep;
    let mut solids = vec![frame.block(edge + deep / 2.0, 0.0, 0.0, [width, deep, raised], Material::Stone)];
    for step in 1..=2 {
        let rise = raised * f64::from(step) / 3.0;
        let out = f64::from(3 - step);
        solids.push(frame.block(front + out - 0.5, 0.0, 0.0, [width, 1.0, rise], Material::Stone));
    }
    for column in 0..6 {
        let across = (f64::from(column) - 2.5) * 8.0;
        solids.push(frame.round(front - 2.0, across, raised, [1.8, tall, 0.86], Material::Stone));
    }
    let lintel = raised + tall;
    solids.push(frame.block(edge + deep / 2.0, 0.0, lintel, [width, deep, 2.0], Material::Trim));
    let [x, y] = frame.at(edge + deep / 2.0, 0.0);
    let pediment = Solid::upright(Shape::Gable, [x, y, frame.level + lintel + 2.0], [width, deep, 7.0], Material::Trim);
    solids.push(pediment.turned(turn_toward(frame.seaward)));
    solids.push(frame.block(edge + 0.75, 0.0, 0.0, [width, 1.5, lintel + 2.0], Material::Stone));
    let [x, y] = frame.at(edge + 1.8, 0.0);
    let arch =
        Solid::upright(Shape::Arch { opening: 0.8 }, [x, y, frame.level + raised], [12.0, 0.6, 9.5], Material::Trim);
    solids.push(arch.turned(turn_toward(frame.seaward)));
    solids.push(frame.block(edge + 1.7, 0.0, raised, [7.6, 0.3, 7.4], Material::Timber));
    solids
}

/// An arcade along the landward side on one `side` of the portico: a back wall, a row of columns under a beam and a
/// tiled roof, a wall at its far end, and a lamp hung in each alcove between its dividers.
fn arcade(frame: &Frame, side: f64) -> Vec<Solid> {
    let [start, end, deep, tall, spacing] = ARCADE_M;
    let (length, middle) = (end - start, side * (start + end) / 2.0);
    let edge = -frame.depth / 2.0;
    let front = edge + deep;
    let mut solids = vec![
        frame.block(edge + 0.5, middle, 0.0, [length, 1.0, tall + 3.0], Material::Stone),
        frame.block(edge + deep / 2.0, side * end, 0.0, [1.0, deep, tall + 0.8], Material::Stone),
        frame.block(front, middle, tall, [length, 1.2, 0.8], Material::Trim),
    ];
    // Whole bays: an alcove is two bays between dividers, its lamp over the column-free middle.
    let bays = (length / spacing / 2.0).round() * 2.0;
    let pitch = length / bays;
    let mut bay = 0.0;
    while bay < bays {
        let across = side * (start + pitch * (bay + 0.5));
        solids.push(frame.round(front, across, 0.0, [0.9, tall, 1.0], Material::Stone));
        let boundary = side * (start + pitch * (bay + 1.0));
        if bay + 1.0 < bays && libm::fmod(bay, 2.0) == 1.0 {
            solids.push(frame.block(edge + deep / 2.0, boundary, 0.0, [0.6, deep - 1.0, tall], Material::Stone));
        } else if libm::fmod(bay, 2.0) == 0.0 {
            solids.push(frame.block(edge + deep / 2.0, boundary, tall - 1.4, [0.5, 0.5, 0.6], Material::Glow));
        }
        bay += 1.0;
    }
    let [x, y] = frame.at(edge + deep / 2.0 + 0.5, middle);
    let roof =
        Solid::upright(Shape::Gable, [x, y, frame.level + tall + 0.8], [deep + 1.0, length, 3.0], Material::Roof);
    solids.push(roof.turned(turn_toward(frame.across())));
    solids
}

/// The middle of the plaza: the obelisk on two round steps, capped in gold, with a brazier either side of it and
/// two more toward the plaza's ends.
fn middle(frame: &Frame) -> Vec<Solid> {
    let mut solids = vec![
        frame.round(0.0, 0.0, 0.0, [16.0, 0.5, 1.0], Material::Stone),
        frame.round(0.0, 0.0, 0.5, [11.0, 0.5, 1.0], Material::Stone),
    ];
    let [x, y] = frame.middle;
    let shaft = Shape::Pyramid { top: 0.55 };
    solids.push(Solid::upright(shaft, [x, y, frame.level + 1.0], [2.4, 2.4, OBELISK_M], Material::Trim));
    let cap = Shape::Pyramid { top: 0.0 };
    solids.push(Solid::upright(cap, [x, y, frame.level + 1.0 + OBELISK_M], [1.32, 1.32, 1.4], Material::Gold));
    for across in [-95.0, -45.0, 45.0, 95.0] {
        solids.push(frame.round(0.0, across, 0.0, [0.8, 1.1, 0.5], Material::Iron));
        solids.push(frame.round(0.0, across, 1.1, [1.0, 0.5, 1.6], Material::Iron));
        solids.push(frame.round(0.0, across, 1.6, [1.1, 0.35, 0.7], Material::Glow));
    }
    solids
}

/// The seaward side: a lantern on the parapet midway between each two spawns and on to the plaza's ends, and a stone
/// bench facing the sea behind each, so none stands in an arriving player's view.
fn seaward_side(frame: &Frame) -> Vec<Solid> {
    let parapet = frame.depth / 2.0;
    let mut solids = Vec::new();
    for step in -3_i32..=3 {
        let across = f64::from(step) * 40.0;
        let [x, y] = frame.at(parapet, across);
        let top = frame.level + PARAPET_TOP_M;
        let post = Shape::Column { sides: 8, top: 0.7 };
        solids.push(Solid::upright(post, [x, y, top], [0.3, 0.3, 2.4], Material::Iron));
        solids.push(Solid::upright(Shape::Block, [x, y, top + 2.4], [0.5, 0.5, 0.6], Material::Glow));
        let cap = Shape::Pyramid { top: 0.0 };
        solids.push(Solid::upright(cap, [x, y, top + 3.0], [0.7, 0.7, 0.4], Material::Iron));
        solids.push(frame.block(parapet - 16.0, across, 0.0, [4.0, 0.9, 0.5], Material::Stone));
    }
    solids
}

/// Bands of stone laid in the paving: a processional way from the portico's steps to the seaward parapet, a border
/// inside the parapets, and a ring round the obelisk's steps.
fn inlays(frame: &Frame) -> Vec<Solid> {
    let edge = -frame.depth / 2.0;
    let from = edge + PORTICO_M[1] + 2.0;
    let to = frame.depth / 2.0 - 0.4;
    let way = frame.block((from + to) / 2.0, 0.0, 0.0, [6.0, to - from, INLAY_M], Material::Stone);
    let border = frame.block(to - 0.75, 0.0, 0.0, [frame.length - 0.8, 1.5, INLAY_M], Material::Stone);
    let ends = [-1.0, 1.0].map(|side| {
        let across = side * (frame.length / 2.0 - 1.15);
        frame.block((from + to) / 2.0, across, 0.0, [1.5, to - from, INLAY_M], Material::Stone)
    });
    let ring = frame.round(0.0, 0.0, 0.0, [26.0, INLAY_M, 1.0], Material::Stone);
    vec![way, border, ends[0], ends[1], ring]
}

#[cfg(test)]
mod tests {
    use super::*;

    const FRAME: Frame =
        Frame { middle: [1000.0, 2000.0], seaward: [0.0, -1.0], depth: 120.0, length: 260.0, level: 80.0 };

    #[test]
    fn every_piece_stands_on_the_plaza_and_none_on_a_spawn() {
        let solids = courtyard(&FRAME);
        let spawns: Vec<[f64; 2]> =
            SPAWN_OFFSETS_M.iter().map(|&across| FRAME.at(FRAME.depth / 2.0 - 4.0, across)).collect();
        for solid in &solids {
            let [west, north, east, south, bottom, _] = solid.bounds();
            assert!(
                west >= 870.0 - 0.5 && east <= 1130.0 + 0.5 && north >= 1940.0 - 0.5 && south <= 2060.0 + 0.5,
                "{solid:?}"
            );
            assert!(bottom >= FRAME.level - 1e-9, "{solid:?}");
            for [x, y] in &spawns {
                let clear = *x < west - 1.0 || *x > east + 1.0 || *y < north - 1.0 || *y > south + 1.0;
                assert!(clear || solid.size[2] <= INLAY_M, "a spawn stands in {solid:?}");
            }
        }
    }

    #[test]
    fn the_portico_steps_rise_no_more_than_a_body_steps() {
        let solids = portico(&FRAME);
        let mut rises: Vec<f64> =
            solids.iter().filter(|solid| solid.at[2] == FRAME.level).map(|solid| solid.size[2]).collect();
        rises.sort_by(f64::total_cmp);
        let climbed: Vec<f64> = rises.iter().copied().filter(|&rise| rise <= PORTICO_M[2] + 1e-9).collect();
        assert_eq!(climbed.len(), 3, "{rises:?}");
        let mut below = 0.0;
        for rise in climbed {
            assert!(rise - below <= 0.45, "a step of {} m in {rises:?}", rise - below);
            below = rise;
        }
    }
}
