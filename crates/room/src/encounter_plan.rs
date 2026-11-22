//! Where an Elite Dungeon's encounters stand, from its laid dungeon alone, so the room and the page lay the same: its
//! seals, two in four blocks and three in five, each in its own room along the walk (never the way in's, the end or a
//! landmark's) and never two alike, and the Court's three anchors round the end foe's post. Every draw is made on a lane
//! of the plan's own (`encounters:<fingerprint>`), and its maths is + - * / and comparisons, exact on every machine.
//! A room too small or too cluttered for a kind is passed over for one that fits.

use dungeon::lane::{Lane, named};
use dungeon::{CELL_M, Cell, Dungeon, SIDES};
use movement::{Block, TUNING};

/// The runes of a Litany, the fewest and the most.
pub const LITANY_RUNES: (usize, usize) = (4, 6);
/// The plates of a Weighing, and how far apart each two stand at the least (m): two cells, so no body holds two.
pub const PLATES: usize = 3;
pub const PLATES_APART_M: f64 = 2.0 * CELL_M;
/// An Ascent's pads: half a pad's side, how much higher each stands than the one before, the fewest and the most of
/// them, and the room kept between a body's head on the top pad and the ceiling (m).
pub const PAD_HALF_M: f64 = 0.8;
pub const PAD_RISE_M: f64 = 0.4;
pub const ASCENT_PADS: (usize, usize) = (3, 6);
pub const HEAD_ROOM_M: f64 = 0.3;
/// The Court's anchors round the end foe's post, and how far from the post each stands at the least (m).
pub const ANCHORS: usize = 3;
pub const ANCHOR_FROM_POST_M: f64 = 2.4;
/// How far a piece's spot keeps from every solid, how far apart two runes stand at the least, and the reach of a
/// Holdfast's ring round its relic (m).
pub const SPOT_CLEAR_M: f64 = 0.9;
pub const RUNES_APART_M: f64 = 2.0;
pub const RELIC_RING_M: f64 = 3.0;
/// A quarter of a cell: a spot's offset from its cell's middle toward a corner.
const QUARTER_M: f64 = CELL_M / 4.0;

/// The four seals' kinds, by their numbers on the wire and in the layout.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SealKind {
    /// Runes on the floor, stepped on in the order they light.
    Litany = 1,
    /// Plates apart in the room, held together.
    Weighing = 2,
    /// Pads rising over a drowned floor to the seal stone.
    Ascent = 3,
    /// A relic's ring held while foes come.
    Holdfast = 4,
}

const KINDS: [SealKind; 4] = [SealKind::Litany, SealKind::Weighing, SealKind::Ascent, SealKind::Holdfast];

/// One seal: its kind and room, the room's cells (row by row), and its pieces' places (x, y, z on the floor): a
/// Litany's runes in the order they light, a Weighing's plates (the two farthest apart first), a Holdfast's relic;
/// an Ascent's pads, each a block from the floor up, and its seal stone on the last pad's top; and the cells its
/// drowned floor covers (an Ascent's room but its doorways' cells), none for any other kind; and the middles of its
/// room's doorway cells, where its foes come in.
#[derive(Clone, Debug, PartialEq)]
pub struct SealPlan {
    pub kind: SealKind,
    pub room: usize,
    pub cells: Vec<usize>,
    pub pieces: Vec<[f64; 3]>,
    pub pads: Vec<Block>,
    pub drowned: Vec<usize>,
    pub doors: Vec<[f64; 2]>,
}

/// An Elite Dungeon's encounters: its seals in walk order, the Court's anchors (x, y, z) round the end foe's post,
/// and the dungeon's columns, by which a point finds its cell.
#[derive(Clone, Debug, PartialEq)]
pub struct EncounterPlan {
    pub seals: Vec<SealPlan>,
    pub anchors: Vec<[f64; 3]>,
    pub columns: usize,
}

impl EncounterPlan {
    /// Every Ascent's pads, the blocks a body climbs and the navmesh walls.
    #[must_use]
    pub fn pads(&self) -> Vec<Block> {
        self.seals.iter().flat_map(|seal| seal.pads.iter().copied()).collect()
    }

    /// The cell a point lies in, by the dungeon's columns.
    #[must_use]
    pub fn cell_at(&self, [x, y]: [f64; 2]) -> Option<usize> {
        if x < 0.0 || y < 0.0 {
            return None;
        }
        let (column, row) = ((x / CELL_M) as usize, (y / CELL_M) as usize);
        (column < self.columns).then_some(row * self.columns + column)
    }
}

/// How many seals a dungeon of `blocks` blocks holds.
#[must_use]
pub const fn seals_for(blocks: usize) -> usize {
    if blocks >= 5 { 3 } else { 2 }
}

/// A lane's name from the dungeon's own cells and its way in, so the plan is the dungeon's whoever lays it.
fn fingerprint(dungeon: &Dungeon) -> String {
    let kinds: Vec<u8> = dungeon
        .cells
        .iter()
        .map(|cell| match cell {
            Cell::Rock => 0,
            Cell::Corridor => 1,
            Cell::Room(_) => 2,
        })
        .collect();
    let cells = named(&String::from_utf8_lossy(&kinds));
    format!("encounters:{cells:08x}:{}:{}", dungeon.way_in.cell, dungeon.portal.cell)
}

/// Each cell's walk from the way in over every open cell, u32::MAX for rock or one never reached.
fn walks(dungeon: &Dungeon) -> Vec<u32> {
    let mut steps = vec![u32::MAX; dungeon.cells.len()];
    let mut todo = std::collections::VecDeque::from([dungeon.way_in.cell]);
    steps[dungeon.way_in.cell] = 0;
    while let Some(cell) = todo.pop_front() {
        for side in SIDES {
            let Some(next) = dungeon.beside(cell, side) else { continue };
            if dungeon.cells[next] != Cell::Rock && steps[next] == u32::MAX {
                steps[next] = steps[cell] + 1;
                todo.push_back(next);
            }
        }
    }
    steps
}

/// What the plan reads of a dungeon: its cells' walks, the cells framed as doorways, those torches hang in, and every
/// solid (`Dungeon::boxes`).
struct Reading<'laid> {
    dungeon: &'laid Dungeon,
    walks: Vec<u32>,
    doorways: Vec<usize>,
    torched: Vec<usize>,
    boxes: Vec<[f64; 5]>,
}

/// Squared distance between two points on the floor: compared squared, so no root is taken.
fn apart([ax, ay]: [f64; 2], [bx, by]: [f64; 2]) -> f64 {
    (ax - bx) * (ax - bx) + (ay - by) * (ay - by)
}

const fn on_floor([x, y]: [f64; 2]) -> [f64; 3] {
    [x, y, dungeon::FLOOR_M]
}

impl<'laid> Reading<'laid> {
    fn of(dungeon: &'laid Dungeon) -> Self {
        let cell_of = |[x, y]: [f64; 2]| (y / CELL_M) as usize * dungeon.columns + (x / CELL_M) as usize;
        Self {
            dungeon,
            walks: walks(dungeon),
            doorways: dungeon.frames.iter().map(|frame| frame.cell).collect(),
            torched: dungeon.torches.iter().map(|torch| cell_of([torch.at[0], torch.at[1]])).collect(),
            boxes: dungeon.boxes(),
        }
    }

    /// A room's cells a pad may stand on: no solid, no doorway, neither the way in's nor the portal's.
    fn free(&self, room: usize) -> Vec<usize> {
        let (dungeon, door, portal) = (self.dungeon, self.dungeon.way_in.cell, self.dungeon.portal.cell);
        let found = &dungeon.rooms[room];
        let open = |cell: &usize| {
            !dungeon.holds_solid(*cell) && !self.doorways.contains(cell) && *cell != door && *cell != portal
        };
        found.cells.iter().copied().filter(open).collect()
    }

    /// The spots of a room a ring may lie on: each cell's middle and its four quarters' (neither the way in's cell nor
    /// the portal's, nor a doorway's unless `doorways`), each SPOT_CLEAR_M from every solid.
    fn spots(&self, room: usize, doorways: bool) -> Vec<[f64; 2]> {
        let (dungeon, door, portal) = (self.dungeon, self.dungeon.way_in.cell, self.dungeon.portal.cell);
        let clear = |[x, y]: [f64; 2]| {
            self.boxes.iter().all(|&[min_x, min_y, max_x, max_y, _]| {
                let (east, south) = ((min_x - x).max(x - max_x).max(0.0), (min_y - y).max(y - max_y).max(0.0));
                east * east + south * south >= SPOT_CLEAR_M * SPOT_CLEAR_M
            })
        };
        let cells = dungeon.rooms[room].cells.iter().copied();
        let open = cells.filter(|&cell| cell != door && cell != portal && (doorways || !self.doorways.contains(&cell)));
        let quarters = [
            (0.0, 0.0),
            (-QUARTER_M, -QUARTER_M),
            (QUARTER_M, -QUARTER_M),
            (-QUARTER_M, QUARTER_M),
            (QUARTER_M, QUARTER_M),
        ];
        open.flat_map(|cell| {
            let [x, y] = dungeon.centre(cell);
            quarters.map(|(east, south)| [x + east, y + south])
        })
        .filter(|spot| clear(*spot))
        .collect()
    }
}

/// An Elite Dungeon's encounters: as many seals as its blocks hold where rooms fit them, and the Court's anchors.
#[must_use]
pub fn plan_encounters(dungeon: &Dungeon) -> EncounterPlan {
    let reading = Reading::of(dungeon);
    let mut lane = Lane::named(&fingerprint(dungeon));
    let mut kinds = KINDS.to_vec();
    for last in (1..kinds.len()).rev() {
        kinds.swap(last, lane.below(last + 1));
    }
    let end = dungeon.end();
    let landmarked: Vec<usize> = dungeon.landmarks.iter().map(|placed| placed.room).collect();
    let mut rooms: Vec<usize> = (0..dungeon.rooms.len())
        .filter(|room| *room != end && *room != dungeon.way_in.room && !landmarked.contains(room))
        .collect();
    rooms.sort_by_key(|&room| (dungeon.rooms[room].walk, room));
    let count = seals_for(dungeon.squares.len());
    let mut seals: Vec<SealPlan> = Vec::new();
    for nth in 0..count {
        // Nearest the middle of its stretch of the walk first, then outward.
        let target = (2 * nth + 1) * rooms.len() / (2 * count).max(1);
        let mut order: Vec<usize> = (0..rooms.len()).collect();
        order.sort_by_key(|&at| (at.abs_diff(target), at));
        let taken = |room: usize, seals: &[SealPlan]| seals.iter().any(|seal| seal.room == room);
        let found = order.into_iter().map(|at| rooms[at]).filter(|&room| !taken(room, &seals)).find_map(|room| {
            let left = kinds.iter().copied().filter(|kind| seals.iter().all(|seal| seal.kind != *kind));
            left.collect::<Vec<_>>().into_iter().find_map(|kind| laid(&reading, &mut lane, kind, room))
        });
        if let Some(seal) = found {
            seals.push(seal);
        }
    }
    seals.sort_by_key(|seal| (dungeon.rooms[seal.room].walk, seal.room));
    let anchors = anchors_of(&reading);
    EncounterPlan { seals, anchors, columns: dungeon.columns }
}

/// A seal of `kind` laid in `room`, or none where it does not fit.
fn laid(reading: &Reading, lane: &mut Lane, kind: SealKind, room: usize) -> Option<SealPlan> {
    let spots = reading.spots(room, false);
    let (pieces, pads, drowned) = match kind {
        SealKind::Litany => (runes(lane, &spots)?, Vec::new(), Vec::new()),
        SealKind::Weighing => (plates(&spots)?, Vec::new(), Vec::new()),
        SealKind::Holdfast => (vec![relic(reading, room, &spots)?], Vec::new(), Vec::new()),
        SealKind::Ascent => {
            let (pads, stone) = ascent(reading, room, &reading.free(room))?;
            let cells = &reading.dungeon.rooms[room].cells;
            let drowned = cells.iter().copied().filter(|cell| !reading.doorways.contains(cell)).collect();
            (vec![stone], pads, drowned)
        }
    };
    let cells = reading.dungeon.rooms[room].cells.clone();
    let doors =
        cells.iter().filter(|cell| reading.doorways.contains(cell)).map(|&cell| reading.dungeon.centre(cell)).collect();
    Some(SealPlan { kind, room, cells, pieces, pads, drowned, doors })
}

/// A Litany's runes: four to six of the room's spots, drawn, each RUNES_APART_M from the others, in the order they
/// light.
fn runes(lane: &mut Lane, spots: &[[f64; 2]]) -> Option<Vec<[f64; 3]>> {
    let wanted = lane.int(LITANY_RUNES.0, LITANY_RUNES.1);
    let mut drawn = spots.to_vec();
    for last in (1..drawn.len()).rev() {
        drawn.swap(last, lane.below(last + 1));
    }
    let mut taken: Vec<[f64; 2]> = Vec::new();
    for spot in drawn {
        if taken.len() < wanted && taken.iter().all(|kept| apart(*kept, spot) >= RUNES_APART_M * RUNES_APART_M) {
            taken.push(spot);
        }
    }
    (taken.len() >= LITANY_RUNES.0).then(|| taken.into_iter().map(on_floor).collect())
}

/// The spot of `spots` farthest from every one of `taken`; the first of any as far.
fn farthest(spots: &[[f64; 2]], taken: &[[f64; 2]]) -> Option<[f64; 2]> {
    let nearest = |spot: [f64; 2]| taken.iter().fold(f64::INFINITY, |near, kept| near.min(apart(spot, *kept)));
    spots
        .iter()
        .copied()
        .filter(|spot| !taken.contains(spot))
        .fold(None, |best, spot| if best.is_none_or(|kept| nearest(spot) > nearest(kept)) { Some(spot) } else { best })
}

/// A Weighing's three plates: the two spots farthest apart, then the one farthest from both, each two at least
/// PLATES_APART_M apart.
fn plates(spots: &[[f64; 2]]) -> Option<Vec<[f64; 3]>> {
    let mut pair: Option<([f64; 2], [f64; 2])> = None;
    for (at, &first) in spots.iter().enumerate() {
        for &second in &spots[at + 1..] {
            if pair.is_none_or(|(a, b)| apart(first, second) > apart(a, b)) {
                pair = Some((first, second));
            }
        }
    }
    let (first, second) = pair?;
    let third = farthest(spots, &[first, second])?;
    let least = PLATES_APART_M * PLATES_APART_M;
    let spread = [(first, second), (first, third), (second, third)].iter().all(|&(a, b)| apart(a, b) >= least);
    spread.then(|| vec![on_floor(first), on_floor(second), on_floor(third)])
}

/// A Holdfast's relic: the spot nearest the room's middle whose ring, RELIC_RING_M round it, reaches the room's floor
/// east, south, west and north.
fn relic(reading: &Reading, room: usize, spots: &[[f64; 2]]) -> Option<[f64; 3]> {
    let dungeon = reading.dungeon;
    let found = &dungeon.rooms[room];
    let middle =
        [(found.x as f64 + found.width as f64 / 2.0) * CELL_M, (found.y as f64 + found.depth as f64 / 2.0) * CELL_M];
    let in_room = |[x, y]: [f64; 2]| {
        x >= 0.0
            && y >= 0.0
            && dungeon.room_at((y / CELL_M) as usize * dungeon.columns + (x / CELL_M) as usize) == Some(room)
    };
    let ringed = |[x, y]: [f64; 2]| {
        let ring = RELIC_RING_M;
        [[x + ring, y], [x, y + ring], [x - ring, y], [x, y - ring]].into_iter().all(in_room)
    };
    let mut nearest = spots.to_vec();
    nearest.sort_by(|a, b| apart(*a, middle).total_cmp(&apart(*b, middle)));
    nearest.into_iter().find(|spot| ringed(*spot)).map(on_floor)
}

/// An Ascent's pads and its seal stone: from the room's doorway nearest the way in, the longest line of the room's
/// free cells one beside the next (no torch's), a pad on each, each PAD_RISE_M over the one before, the last under the
/// room's lowest ceiling less a body's height and HEAD_ROOM_M; the stone on the last pad's top. None for fewer than
/// the fewest pads.
fn ascent(reading: &Reading, room: usize, free: &[usize]) -> Option<(Vec<Block>, [f64; 3])> {
    let dungeon = reading.dungeon;
    let found = &dungeon.rooms[room];
    let lowest = found.cells.iter().map(|&cell| dungeon.ceilings[cell]).fold(f64::INFINITY, f64::min);
    let under = lowest - TUNING.height - HEAD_ROOM_M;
    let most = (1..=ASCENT_PADS.1).take_while(|&pads| pads as f64 * PAD_RISE_M <= under).last()?;
    let start = found.cells.iter().copied().filter(|cell| reading.doorways.contains(cell)).min_by_key(|&cell| {
        (reading.walks[cell], cell) // the doorway a company comes in by
    })?;
    let padded: Vec<usize> = free.iter().copied().filter(|cell| !reading.torched.contains(cell)).collect();
    let mut best: Vec<usize> = Vec::new();
    let mut path = Vec::new();
    longest(dungeon, start, &padded, most, &mut path, &mut best);
    if best.len() < ASCENT_PADS.0 {
        return None;
    }
    let mut pads: Vec<Block> = best
        .iter()
        .enumerate()
        .map(|(nth, &cell)| {
            let [x, y] = dungeon.centre(cell);
            let top = (nth + 1) as f64 * PAD_RISE_M;
            let (min_x, min_y, max_x, max_y) = (x - PAD_HALF_M, y - PAD_HALF_M, x + PAD_HALF_M, y + PAD_HALF_M);
            Block { min_x, min_y, max_x, max_y, top, bottom: dungeon::FLOOR_M }
        })
        .collect();
    // The first pad reaches back to the doorway's cell, so the way onto it from the dry doorway crosses no water.
    let ([start_x, start_y], [first_x, first_y]) = (dungeon.centre(start), dungeon.centre(*best.first()?));
    let edge = |from: f64, to: f64| (from + to) / 2.0;
    if let Some(first) = pads.first_mut() {
        match (first_x.total_cmp(&start_x), first_y.total_cmp(&start_y)) {
            (core::cmp::Ordering::Greater, _) => first.min_x = edge(start_x, first_x),
            (core::cmp::Ordering::Less, _) => first.max_x = edge(start_x, first_x),
            (_, core::cmp::Ordering::Greater) => first.min_y = edge(start_y, first_y),
            _ => first.max_y = edge(start_y, first_y),
        }
    }
    let last = pads.last()?;
    let stone = [(last.min_x + last.max_x) / 2.0, (last.min_y + last.max_y) / 2.0, last.top];
    Some((pads, stone))
}

/// The longest line of `cells` one beside the next from `from`, `most` at the most; of two as long, the one ending
/// farther from the start, then the first found.
fn longest(dungeon: &Dungeon, from: usize, cells: &[usize], most: usize, path: &mut Vec<usize>, best: &mut Vec<usize>) {
    let better = |path: &[usize], best: &[usize]| {
        let far = |line: &[usize]| line.last().map_or(0.0, |&end| apart(dungeon.centre(end), dungeon.centre(from)));
        path.len() > best.len() || (path.len() == best.len() && far(path) > far(best))
    };
    let here = path.last().copied().unwrap_or(from);
    if better(path, best) {
        best.clone_from(path);
    }
    if path.len() == most {
        return;
    }
    for side in SIDES {
        let Some(next) = dungeon.beside(here, side) else { continue };
        if cells.contains(&next) && !path.contains(&next) {
            path.push(next);
            longest(dungeon, from, cells, most, path, best);
            path.pop();
        }
    }
}

/// The Court's anchors: the end room's spots, its doorways' among them, ANCHOR_FROM_POST_M from the end foe's post,
/// the first the farthest from the post, each next the farthest from those taken and the post.
fn anchors_of(reading: &Reading) -> Vec<[f64; 3]> {
    let dungeon = reading.dungeon;
    let end = dungeon.end();
    let Some(&post) = dungeon.nearest_middle(end, 1).first() else { return Vec::new() };
    let post = dungeon.centre(post);
    let spots: Vec<[f64; 2]> = reading
        .spots(end, true)
        .into_iter()
        .filter(|spot| apart(*spot, post) >= ANCHOR_FROM_POST_M * ANCHOR_FROM_POST_M)
        .collect();
    let mut taken = vec![post];
    while taken.len() <= ANCHORS {
        let Some(next) = farthest(&spots, &taken) else { break };
        taken.push(next);
    }
    taken.into_iter().skip(1).map(on_floor).collect()
}

#[cfg(test)]
#[path = "encounter_plan_tests.rs"]
mod encounter_plan_tests;
