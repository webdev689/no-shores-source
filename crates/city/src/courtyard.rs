//! The social plaza's courtyard, after the Tower's: a portico on the landward side with a great door into the
//! landmark's hall, arcades either side of it with an alcove a bay, braziers flanking an obelisk in the middle,
//! benches facing the sea, lanterns on the seaward parapet, and bands of stone laid in the paving. Every piece is a
//! solid of the plan, dressed in the city's climate; the overhead pieces (entablature, roofs, hung lamps) stand clear
//! of a body (`collision`).

use crate::landmarks::{ahead, turn_toward};
use crate::life::{Keep, Post, Task, Ways};
use crate::solids::{Material, Shape, Solid};
use crate::stations::Station;

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
    pub(crate) fn across(&self) -> [f64; 2] {
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

/// Where a visitor who keeps no counter may stand, each a quiet place by something of the courtyard's: beside each
/// brazier on its seaward side, landward of the two outer benches, and before the portico's two ends. Clear of every
/// solid, the processional way, the spawns and the townsfolk's ways and posts.
#[must_use]
pub fn visitor_spots(frame: &Frame) -> Vec<[f64; 2]> {
    let braziers = [-95.0, -45.0, 45.0, 95.0].map(|across| frame.at(2.5, across));
    let benches = [-120.0, 120.0].map(|across| frame.at(frame.depth / 2.0 - 20.0, across));
    let portico = [-30.0, 30.0].map(|across| frame.at(-frame.depth / 2.0 + PORTICO_M[1] + 12.0, across));
    braziers.into_iter().chain(benches).chain(portico).collect()
}

/// The townsfolk's ways, metres in the plaza's frame: rows toward the sea from its middle (the first before the
/// arcades, clear of the portico's steps), columns across it, and the lines before the counters and the parapet,
/// metres in from the plaza's landward and seaward edges. Each keeps 1.3 m clear of every piece either side.
const ROWS_M: [f64; 4] = [-38.0, -14.0, 14.0, 34.0];
const COLUMNS_M: [f64; 6] = [-110.0, -70.0, -20.0, 20.0, 70.0, 110.0];
const COUNTER_LINE_IN_M: f64 = 13.5;
/// The short ways down from the first row to the line before the counters either side of the portico, metres across,
/// so the counters nearest it are reached the short way.
const BESIDE_PORTICO_M: f64 = 32.5;
const PARAPET_LINE_IN_M: f64 = 8.0;
/// Where a customer stands before a counter, a looker at the parapet, and talkers before a bench, metres in from
/// the plaza's edges; the benches the talkers stand at, metres across, the outer two's drinking.
const AT_COUNTER_IN_M: f64 = 11.5;
const AT_PARAPET_IN_M: f64 = 1.6;
const AT_BENCH_IN_M: f64 = 17.4;
const TALKED_BENCHES_M: [f64; 5] = [-80.0, -40.0, 0.0, 40.0, 80.0];
const VIEWS_M: [f64; 7] = [-110.0, -80.0, -40.0, 0.0, 40.0, 80.0, 110.0];
/// The band before the brazier west of the obelisk, in an arc round its dancer, and a juggler before the one east of
/// it: metres toward the sea and across.
const BAND_M: [(Task, [f64; 2]); 4] = [
    (Task::PlayLute, [-2.9, -48.3]),
    (Task::PlayFlute, [-3.5, -46.1]),
    (Task::PlayRecorder, [-3.5, -43.9]),
    (Task::PlayTambourine, [-2.9, -41.7]),
];
const DANCER_M: [f64; 2] = [-7.5, -45.0];
const JUGGLER_M: [f64; 2] = [-4.0, 45.0];
/// The sweeper's round of the ring laid round the obelisk, in turn: metres toward the sea and across.
const SWEPT_M: [[f64; 2]; 4] = [[-11.0, -7.0], [-11.0, 7.0], [11.0, 7.0], [11.0, -7.0]];

/// A way across the plaza: along a row (`toward` held) or a column (`across` held), between two ends of the other.
struct Line {
    row: bool,
    held: f64,
    ends: [f64; 2],
}

/// The courtyard's ways and posts, from its rows and columns: the walkers visit every counter, the views over the
/// parapet and the benches; a smith works before the Weaponsmith's alcove, a band of four plays with a dancer by
/// the brazier west of the obelisk, a juggler by the one east of it, and a sweeper sweeps round the obelisk.
#[must_use]
pub fn townsfolk_life(frame: &Frame, stations: &[Station]) -> (Ways, Vec<Post>) {
    let edge = frame.depth / 2.0;
    let (counter_line, parapet_line) = (-edge + COUNTER_LINE_IN_M, edge - PARAPET_LINE_IN_M);
    let column_ends = |across: f64| [if across.abs() > ARCADE_M[0] { counter_line } else { ROWS_M[0] }, parapet_line];
    let mut lines: Vec<Line> = ROWS_M.map(|held| Line { row: true, held, ends: [COLUMNS_M[0], COLUMNS_M[5]] }).into();
    lines.extend(COLUMNS_M.map(|held| Line { row: false, held, ends: column_ends(held) }));
    lines.push(Line { row: true, held: parapet_line, ends: [COLUMNS_M[0], COLUMNS_M[5]] });
    for side in [-1.0, 1.0] {
        lines.push(Line { row: false, held: side * BESIDE_PORTICO_M, ends: [counter_line, ROWS_M[0]] });
    }
    for side in [-1.0, 1.0] {
        let ends = [side * ARCADE_M[0], side * ARCADE_M[1]];
        lines.push(Line { row: true, held: counter_line, ends: [ends[0].min(ends[1]), ends[0].max(ends[1])] });
    }
    let mut plan = Life { frame, ways: Ways::default(), placed: Vec::new(), posts: Vec::new() };
    for line in &lines {
        for other in lines.iter().filter(|other| other.row != line.row) {
            let crossing = if line.row { [line.held, other.held] } else { [other.held, line.held] };
            if within(line, crossing) && within(other, crossing) {
                plan.point(crossing, "");
            }
        }
    }
    let landward = frame.seaward.map(|axis| -axis);
    for station in stations {
        let across = plan.across_of(station.counter);
        let kind = serde_json::to_value(station.kind).unwrap_or_default();
        let from = plan.point([counter_line, across], &format!("counter:{}", kind.as_str().unwrap_or_default()));
        plan.post(Task::Hold, [-edge + AT_COUNTER_IN_M, across], landward, Keep::Visited, from);
    }
    if let Some(forge) = stations.iter().find(|station| station.kind == crate::stations::StationKind::Weaponsmith) {
        // Between the Weaponsmith's alcove and the next one out, before the arcade's columns.
        let across = plan.across_of(forge.counter);
        let between = across + across.signum() * (ARCADE_M[1] - ARCADE_M[0]) / 12.0;
        let from = plan.point([counter_line, between], "smith");
        // Side on to the plaza, working toward the Weaponsmith's counter.
        let toward_counter = frame.across().map(|axis| -axis * across.signum());
        plan.post(Task::Smith, [-edge + ARCADE_M[2] + 1.1, between], toward_counter, Keep::Kept, from);
    }
    for (nth, across) in VIEWS_M.into_iter().enumerate() {
        let from = plan.point([parapet_line, across], &format!("view:seaward-{}", nth + 1));
        plan.post(Task::Idle, [edge - AT_PARAPET_IN_M, across], frame.seaward, Keep::Visited, from);
    }
    for (nth, across) in TALKED_BENCHES_M.into_iter().enumerate() {
        let from = plan.point([ROWS_M[3], across], &format!("bench:{}", nth + 1));
        let task = if across.abs() > 60.0 { Task::Drink } else { Task::Gesture };
        let across_way = [-frame.seaward[1], frame.seaward[0]];
        plan.post(task, [edge - AT_BENCH_IN_M, across - 0.75], across_way, Keep::Visited, from);
        plan.post(task, [edge - AT_BENCH_IN_M, across + 0.75], across_way.map(|axis| -axis), Keep::Visited, from);
    }
    let band = plan.point([ROWS_M[1], DANCER_M[1]], "band");
    for (task, place) in BAND_M {
        let to_dancer = plan.bearing_in([DANCER_M[0] - place[0], DANCER_M[1] - place[1]]);
        plan.post_facing(task, place, to_dancer, Keep::Kept, band);
    }
    plan.post(Task::Dance, DANCER_M, frame.seaward, Keep::Kept, band);
    let juggler = plan.point([ROWS_M[1], JUGGLER_M[1]], "juggler");
    plan.post(Task::Juggle, JUGGLER_M, landward, Keep::Kept, juggler);
    for (nth, swept) in SWEPT_M.into_iter().enumerate() {
        let row = if swept[0] < 0.0 { ROWS_M[1] } else { ROWS_M[2] };
        let from = plan.point([row, swept[1]], &format!("ring:{}", nth + 1));
        let next = SWEPT_M[(nth + 1) % SWEPT_M.len()];
        let along = [next[0] - swept[0], next[1] - swept[1]];
        plan.post_facing(Task::Sweep, swept, plan.bearing_in(along), Keep::Round(0), from);
    }
    for line in &lines {
        let mut on: Vec<(f64, u32)> = (0..plan.placed.len())
            .filter(|&index| {
                let place = plan.placed[index];
                (place[usize::from(!line.row)] - line.held).abs() < 1e-6 && within(line, place)
            })
            .map(|index| (plan.placed[index][usize::from(line.row)], index as u32))
            .collect();
        on.sort_by(|one, two| one.0.total_cmp(&two.0));
        plan.ways.line(&on.iter().map(|&(_, index)| index).collect::<Vec<_>>());
    }
    (plan.ways, plan.posts)
}

/// Whether a place of the plaza's frame (toward the sea, across) lies between a line's ends.
fn within(line: &Line, place: [f64; 2]) -> bool {
    let along = place[usize::from(line.row)];
    along >= line.ends[0] - 1e-6 && along <= line.ends[1] + 1e-6
}

/// The ways and posts as they are laid, with each point's place in the plaza's frame.
struct Life<'frame> {
    frame: &'frame Frame,
    ways: Ways,
    placed: Vec<[f64; 2]>,
    posts: Vec<Post>,
}

impl Life<'_> {
    /// The point at a place of the frame (toward the sea, across), laid once; named if it is not yet.
    fn point(&mut self, place: [f64; 2], name: &str) -> u32 {
        let found =
            self.placed.iter().position(|at| (at[0] - place[0]).abs() < 1e-6 && (at[1] - place[1]).abs() < 1e-6);
        if let Some(index) = found {
            if self.ways.points[index].name.is_empty() {
                name.clone_into(&mut self.ways.points[index].name);
            }
            return index as u32;
        }
        self.placed.push(place);
        self.ways.point(self.frame.at(place[0], place[1]), name)
    }

    fn across_of(&self, point: [f64; 2]) -> f64 {
        let off = [point[0] - self.frame.middle[0], point[1] - self.frame.middle[1]];
        let across = self.frame.across();
        off[0] * across[0] + off[1] * across[1]
    }

    /// The compass bearing of a way in the frame (toward the sea, across): radians clockwise from north.
    fn bearing_in(&self, along: [f64; 2]) -> f64 {
        let [toward, across] = along;
        let (seaward, aside) = (self.frame.seaward, self.frame.across());
        let east = seaward[0] * toward + aside[0] * across;
        let south = seaward[1] * toward + aside[1] * across;
        libm::atan2(east, -south)
    }

    /// A post at a place of the frame, facing along a way of the world.
    fn post(&mut self, task: Task, place: [f64; 2], facing: [f64; 2], keep: Keep, from: u32) {
        let facing = libm::atan2(facing[0], -facing[1]);
        self.post_facing(task, place, facing, keep, from);
    }

    fn post_facing(&mut self, task: Task, place: [f64; 2], facing: f64, keep: Keep, from: u32) {
        self.posts.push(Post { task, at: self.frame.at(place[0], place[1]), facing, keep, reached_from: from });
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
    use crate::life::{Keep, Post, Task, Ways};

    const FRAME: Frame =
        Frame { middle: [1000.0, 2000.0], seaward: [0.0, -1.0], depth: 120.0, length: 260.0, level: 80.0 };

    #[test]
    fn every_visitor_spot_stands_clear_on_the_plaza() {
        let spots = visitor_spots(&FRAME);
        assert_eq!(spots.len(), 8);
        let spawns: Vec<[f64; 2]> =
            SPAWN_OFFSETS_M.iter().map(|&across| FRAME.at(FRAME.depth / 2.0 - 4.0, across)).collect();
        let standing = courtyard(&FRAME).into_iter().filter(|solid| solid.bounds()[5] - solid.bounds()[4] > 0.1);
        let standing: Vec<[f64; 6]> = standing.map(|solid| solid.bounds()).collect();
        for spot in &spots {
            let [x, y] = *spot;
            assert!((x - FRAME.middle[0]).abs() < FRAME.length / 2.0 - 2.0, "on the plaza: {spot:?}");
            assert!((y - FRAME.middle[1]).abs() < FRAME.depth / 2.0 - 2.0, "on the plaza: {spot:?}");
            assert!((x - FRAME.middle[0]).abs() > 6.0, "off the processional way: {spot:?}");
            for [west, north, east, south, ..] in &standing {
                let gap = libm::hypot((west - x).max(x - east).max(0.0), (north - y).max(y - south).max(0.0));
                assert!(gap > 1.0, "{spot:?} stands within a metre of a solid");
            }
            assert!(spawns.iter().all(|spawn| libm::hypot(spawn[0] - x, spawn[1] - y) > 10.0));
        }
    }

    /// The plaza's floor at its level everywhere, as its pad sets it.
    struct Level(f64);

    impl movement::Terrain for Level {
        fn height_at(&self, _x: f64, _y: f64) -> f64 {
            self.0
        }
    }

    /// Everything a body walks among on the plaza: the courtyard, the stations, and the parapets round it, as boxes.
    fn plaza_boxes() -> Vec<crate::collision::Box2> {
        let (_, stalls) = crate::stations::stations(&FRAME);
        let [west, north, east, south] = [870.0, 1940.0, 1130.0, 2060.0];
        let top = FRAME.level + PARAPET_TOP_M;
        let parapets = [
            [west, north - 0.4, east, north + 0.4],
            [west, south - 0.4, east, south + 0.4],
            [west - 0.4, north, west + 0.4, south],
            [east - 0.4, north, east + 0.4, south],
        ];
        let solids = courtyard(&FRAME).into_iter().chain(stalls).map(|solid| {
            let [west, north, east, south, bottom, top] = solid.bounds();
            [west, north, east, south, top, bottom]
        });
        solids.chain(parapets.map(|[west, north, east, south]| [west, north, east, south, top, 0.0])).collect()
    }

    fn life() -> (Ways, Vec<Post>) {
        let (stations, _) = crate::stations::stations(&FRAME);
        townsfolk_life(&FRAME, &stations)
    }

    /// Walked with the movement rules, every way keeps clear of the courtyard's pieces either side, and every post
    /// is walked to.
    #[test]
    fn the_courtyards_ways_are_walked_clear_of_every_piece() {
        let (ways, posts) = life();
        let ring = [[870.0, 1940.0], [1130.0, 1940.0], [1130.0, 2060.0], [870.0, 2060.0]];
        let faults = crate::life::check::faults(&ways, &posts, &ring, &plaza_boxes(), &Level(FRAME.level));
        assert!(faults.is_empty(), "{}", faults.join("\n"));
    }

    /// Every way of keeping a post is laid: kept posts, a round, and posts the walkers visit at every counter, view
    /// and bench; every counter's way point is named for it.
    #[test]
    fn the_courtyard_has_kept_posts_a_round_and_visited_ones() {
        let (ways, posts) = life();
        let kept = |keep: Keep| posts.iter().filter(|post| post.keep == keep).count();
        assert_eq!(kept(Keep::Kept), 7, "a smith, the band of four, a dancer and a juggler");
        assert_eq!(kept(Keep::Round(0)), 4, "a sweeper's round of the obelisk's ring");
        assert_eq!(kept(Keep::Visited), 12 + 7 + 10, "every counter, seven views and five benches' talkers");
        let (stations, _) = crate::stations::stations(&FRAME);
        for station in &stations {
            let kind = serde_json::to_value(station.kind).expect("a kind writes");
            let name = format!("counter:{}", kind.as_str().unwrap_or_default());
            assert!(ways.points.iter().any(|point| point.name == name), "{name}");
        }
        let tasks: Vec<Task> = posts.iter().map(|post| post.task).collect();
        for task in [Task::Smith, Task::Sweep, Task::PlayLute, Task::PlayTambourine, Task::Gesture, Task::Hold] {
            assert!(tasks.contains(&task), "{task:?}");
        }
    }

    /// Shape stands off every way and every post, so no one walks through him or works where he stands.
    #[test]
    fn every_visitor_spot_stands_off_the_townsfolks_ways_and_posts() {
        let (ways, posts) = life();
        for spot in visitor_spots(&FRAME) {
            for &[one, two] in &ways.links {
                let [from, to] = [ways.points[one as usize].at, ways.points[two as usize].at];
                let along = [to[0] - from[0], to[1] - from[1]];
                let share = (((spot[0] - from[0]) * along[0] + (spot[1] - from[1]) * along[1])
                    / (along[0] * along[0] + along[1] * along[1]))
                    .clamp(0.0, 1.0);
                let near = [from[0] + along[0] * share, from[1] + along[1] * share];
                let apart = libm::hypot(spot[0] - near[0], spot[1] - near[1]);
                assert!(apart > 4.0, "the spot {spot:?} stands {apart:.2} m off the way {from:?} to {to:?}");
            }
            for post in &posts {
                let apart = libm::hypot(spot[0] - post.at[0], spot[1] - post.at[1]);
                assert!(apart > 4.0, "the spot {spot:?} stands {apart:.2} m from a post at {:?}", post.at);
            }
        }
    }

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
