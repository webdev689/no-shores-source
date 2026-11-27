//! Where an Elite Dungeon's encounters stand, from its laid dungeon alone, so the room and the page lay the same: its
//! seals, two in four blocks and three in five, each in its own room along the walk (never the way in's, the end, a
//! landmark's or a vault's) and never two alike, and the Court's three anchors round the end foe's post. Every draw is
//! made on a lane of the plan's own (`encounters:<fingerprint>`), and its maths is + - * / and comparisons, exact on
//! every machine. A room too small or too cluttered for a kind is passed over for one that fits.

use dungeon::lane::{Lane, named};
use dungeon::{CELL_M, Cell, Dungeon, SIDES};
use encounter_ascent::{ascent, open_air};
use movement::Block;

/// The runes of a Litany, the fewest and the most.
pub const LITANY_RUNES: (usize, usize) = (4, 6);
/// How far apart each two of a Weighing's plates stand at the least (m): two cells, so no body holds two.
pub const PLATES_APART_M: f64 = 2.0 * CELL_M;
/// How far round from the way into a Weighing's room its plates stand at the most, as the cosine of the angle between
/// the way in through its doorway and the way from the doorway to a plate: about 70 degrees either side, so a body
/// coming in has every plate ahead of it, none behind or beside it.
pub const PLATES_AHEAD: f64 = 0.35;
/// An Ascent's pads: half a pad's side; the first's top, mantled from the dry doorway (within `TUNING.reach`); how
/// much higher each next stands than the one before at the most, and how far every pad after the first stands over a
/// mantle's reach from the floor at the least; the fewest and the most of them; the leap from each to the next, edge to
/// edge along the line between their middles, the least and the most (m), which a run off the edge never crosses and a
/// running jump does; and the room kept between a body's head on the top pad and the ceiling, and on any other pad,
/// which a running jump (`TUNING.jump`, rising about half a metre) leaves from (m).
pub const PAD_HALF_M: f64 = 0.8;
pub const FIRST_PAD_TOP_M: f64 = 1.6;
pub const PAD_RISE_M: f64 = 0.4;
pub const ASCENT_PADS: (usize, usize) = (4, 6);
pub const PAD_OVER_REACH_M: f64 = 0.1;
pub const LEAP_M: (f64, f64) = (4.4, 5.2);
pub const HEAD_ROOM_M: f64 = 0.3;
pub const JUMP_ROOM_M: f64 = 0.6;
/// The Court's anchors round the end foe's post, and how far from the post each stands at the least (m).
pub const ANCHORS: usize = 3;
pub const ANCHOR_FROM_POST_M: f64 = 2.4;
/// How far a piece's spot keeps from every solid, and from the middle of every prop and fixture (a brazier, candles),
/// so none stands on a piece, how far apart two runes stand at the least, and the reach of a Holdfast's ring round
/// its relic (m).
pub const SPOT_CLEAR_M: f64 = 0.9;
pub const PROP_CLEAR_M: f64 = 1.4;
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
    pub doors: Vec<[f64; 3]>,
}

/// An Elite Dungeon's encounters: its seals in walk order, the Court's anchors (x, y, z) round the end foe's post,
/// and the dungeon's columns, rows and storeys, by which a point finds its cell.
#[derive(Clone, Debug, PartialEq)]
pub struct EncounterPlan {
    pub seals: Vec<SealPlan>,
    pub anchors: Vec<[f64; 3]>,
    pub columns: usize,
    pub rows: usize,
    pub storeys: usize,
}

impl SealPlan {
    /// Its pieces and pads raised from the top storey's floor onto its room's.
    fn onto(mut self, floor: f64) -> Self {
        self.pieces.iter_mut().for_each(|piece| piece[2] += floor);
        self.pads.iter_mut().for_each(|pad| (pad.top, pad.bottom) = (pad.top + floor, pad.bottom + floor));
        self
    }
}

impl EncounterPlan {
    /// Every Ascent's pads, the blocks a body climbs and the navmesh walls.
    #[must_use]
    pub fn pads(&self) -> Vec<Block> {
        self.seals.iter().flat_map(|seal| seal.pads.iter().copied()).collect()
    }

    /// The cell a point (x, y, z) lies in, on the storey of the highest floor at or under it.
    #[must_use]
    pub fn cell_at(&self, [x, y, z]: [f64; 3]) -> Option<usize> {
        if x < 0.0 || y < 0.0 {
            return None;
        }
        let (column, row) = ((x / CELL_M) as usize, (y / CELL_M) as usize);
        let storey = dungeon::storey_under(self.storeys, z);
        (column < self.columns && row < self.rows).then_some((storey * self.rows + row) * self.columns + column)
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
            Cell::Stair(_) => 3,
            Cell::Void => 4,
        })
        .collect();
    let cells = named(&String::from_utf8_lossy(&kinds));
    format!("encounters:{cells:08x}:{}:{}", dungeon.way_in.cell, dungeon.portal.cell)
}

/// Each cell's walk from the way in over every open cell, u32::MAX for rock or one never reached.
pub(crate) fn walks(dungeon: &Dungeon) -> Vec<u32> {
    let mut steps = vec![u32::MAX; dungeon.cells.len()];
    let mut todo = std::collections::VecDeque::from([dungeon.way_in.cell]);
    steps[dungeon.way_in.cell] = 0;
    while let Some(cell) = todo.pop_front() {
        for next in dungeon.walk_from(cell) {
            if steps[next] == u32::MAX {
                steps[next] = steps[cell] + 1;
                todo.push_back(next);
            }
        }
    }
    steps
}

/// What the plan reads of a dungeon: its cells' walks, the cells framed as doorways, those torches hang in, every
/// solid (`Dungeon::boxes`), and where every prop and fixture stands.
struct Reading<'laid> {
    dungeon: &'laid Dungeon,
    walks: Vec<u32>,
    doorways: Vec<usize>,
    torched: Vec<usize>,
    boxes: Vec<[f64; 6]>,
    furnished: Vec<[f64; 3]>,
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
        Self {
            dungeon,
            walks: walks(dungeon),
            doorways: dungeon.frames.iter().map(|frame| frame.cell).collect(),
            torched: dungeon.torches.iter().map(|torch| dungeon.cell_at(torch.at)).collect(),
            boxes: dungeon.boxes(),
            furnished: (dungeon.props.iter().map(|prop| prop.at))
                .chain(dungeon.fixtures.iter().map(|fixture| fixture.at))
                .collect(),
        }
    }

    /// The solids and the props' and fixtures' middles on a room's storey: another storey's stand over or under it.
    fn on_storey(&self, room: usize) -> (Vec<[f64; 6]>, Vec<[f64; 2]>) {
        let on = |z: f64| self.dungeon.storey_under(z) == self.dungeon.rooms[room].storey;
        let furnished = self.furnished.iter().filter(|at| on(at[2])).map(|at| [at[0], at[1]]);
        (self.boxes.iter().copied().filter(|solid| on(solid[4])).collect(), furnished.collect())
    }

    /// A room's cells a pad may stand over: no doorway, no torch, neither the way in's nor the portal's. A pad keeps
    /// clear of every solid itself (`ascent`).
    fn padded(&self, room: usize) -> Vec<usize> {
        let (dungeon, door, portal) = (self.dungeon, self.dungeon.way_in.cell, self.dungeon.portal.cell);
        let open = |cell: &usize| {
            !self.doorways.contains(cell) && !self.torched.contains(cell) && *cell != door && *cell != portal
        };
        dungeon.rooms[room].cells.iter().copied().filter(open).collect()
    }

    /// The doorway cell of a room a company comes in by: the one nearest the way in on the walk.
    fn entered_by(&self, room: usize) -> Option<usize> {
        let cells = self.dungeon.rooms[room].cells.iter().copied();
        cells.filter(|cell| self.doorways.contains(cell)).min_by_key(|&cell| (self.walks[cell], cell))
    }

    /// The spots of a room a ring may lie on: each cell's middle and its four quarters' (neither the way in's cell nor
    /// the portal's, nor a doorway's unless `doorways`), each SPOT_CLEAR_M from every solid and PROP_CLEAR_M from
    /// every prop's and fixture's middle.
    fn spots(&self, room: usize, doorways: bool) -> Vec<[f64; 2]> {
        let (dungeon, door, portal) = (self.dungeon, self.dungeon.way_in.cell, self.dungeon.portal.cell);
        let (boxes, furnished) = self.on_storey(room);
        let clear = |[x, y]: [f64; 2]| {
            boxes.iter().all(|&[min_x, min_y, max_x, max_y, _, _]| {
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
        .filter(|spot| furnished.iter().all(|at| apart(*at, *spot) >= PROP_CLEAR_M * PROP_CLEAR_M))
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
    // A landmark fills its room, and a vault's room stands its gold chest, which a seal's room never does.
    let shut: Vec<usize> = dungeon.landmarks.iter().map(|placed| placed.room).chain(dungeon.vaults.clone()).collect();
    let mut rooms: Vec<usize> = (0..dungeon.rooms.len())
        .filter(|room| *room != end && *room != dungeon.way_in.room && !shut.contains(room))
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
        // An Ascent first wherever a room of the stretch fits one, as the climb is the rarest fit, never in the first
        // room of the walk where there are four or more, so the way in is not straight into a climb; then any kind
        // left in the nearest room that fits it, any room of the walk.
        let stretch = (nth * rooms.len() / count).max(usize::from(rooms.len() >= 4))..(nth + 1) * rooms.len() / count;
        let climbed = seals.iter().any(|seal| seal.kind == SealKind::Ascent);
        let ascent = order
            .iter()
            .filter(|at| !climbed && stretch.contains(*at))
            .map(|&at| rooms[at])
            .filter(|&room| !taken(room, &seals))
            .find_map(|room| laid(&reading, &mut lane, SealKind::Ascent, room));
        let found = ascent.or_else(|| {
            order.into_iter().map(|at| rooms[at]).filter(|&room| !taken(room, &seals)).find_map(|room| {
                let left = kinds.iter().copied().filter(|kind| seals.iter().all(|seal| seal.kind != *kind));
                left.collect::<Vec<_>>().into_iter().find_map(|kind| laid(&reading, &mut lane, kind, room))
            })
        });
        if let Some(seal) = found {
            seals.push(seal);
        }
    }
    seals.sort_by_key(|seal| (dungeon.rooms[seal.room].walk, seal.room));
    let seals = seals
        .into_iter()
        .map(|seal| {
            let floor = dungeon::storey_floor(dungeon.rooms[seal.room].storey);
            seal.onto(floor)
        })
        .collect();
    let end_floor = dungeon.rooms.get(end).map_or(dungeon::FLOOR_M, |room| dungeon::storey_floor(room.storey));
    let anchors = anchors_of(&reading).into_iter().map(|[x, y, z]| [x, y, z + end_floor]).collect();
    let (columns, rows, storeys) = (dungeon.columns, dungeon.rows, dungeon.storeys);
    EncounterPlan { seals, anchors, columns, rows, storeys }
}

/// A seal of `kind` laid in `room`, or none where it does not fit.
fn laid(reading: &Reading, lane: &mut Lane, kind: SealKind, room: usize) -> Option<SealPlan> {
    let spots = reading.spots(room, false);
    let (pieces, pads, drowned) = match kind {
        SealKind::Litany => (runes(lane, &spots)?, Vec::new(), Vec::new()),
        SealKind::Weighing => {
            // Every plate in plain view from the doorway the room is entered by and ahead of a body coming in by it
            // (within PLATES_AHEAD of the way from the cell before it), so the puzzle is seen on coming in.
            let entered = reading.entered_by(room)?;
            let before = SIDES
                .into_iter()
                .filter_map(|side| reading.dungeon.beside(entered, side))
                .filter(|cell| {
                    reading.dungeon.cells[*cell] != Cell::Rock && reading.dungeon.room_at(*cell) != Some(room)
                })
                .min_by_key(|&cell| (reading.walks[cell], cell))?;
            let (door, from) = (reading.dungeon.centre(entered), reading.dungeon.centre(before));
            let inward = [door[0] - from[0], door[1] - from[1]];
            let ahead = |[x, y]: [f64; 2]| {
                let toward = [x - door[0], y - door[1]];
                let along = inward[0] * toward[0] + inward[1] * toward[1];
                // cos >= PLATES_AHEAD, squared so no root is taken.
                along > 0.0
                    && along * along
                        >= PLATES_AHEAD * PLATES_AHEAD * apart(inward, [0.0, 0.0]) * apart(toward, [0.0, 0.0])
            };
            let (point, boxes) = (|[x, y]: [f64; 2]| [x, y, x, y], reading.on_storey(room).0);
            let seen: Vec<[f64; 2]> = spots
                .iter()
                .copied()
                .filter(|&spot| ahead(spot) && open_air(point(door), point(spot), &boxes))
                .collect();
            (plates(&seen)?, Vec::new(), Vec::new())
        }
        SealKind::Holdfast => (vec![relic(reading, room, &spots)?], Vec::new(), Vec::new()),
        SealKind::Ascent => {
            let (pads, stone) = ascent(reading, room)?;
            let cells = &reading.dungeon.rooms[room].cells;
            let drowned = cells.iter().copied().filter(|cell| !reading.doorways.contains(cell)).collect();
            (vec![stone], pads, drowned)
        }
    };
    let cells = reading.dungeon.rooms[room].cells.clone();
    let doors = cells
        .iter()
        .filter(|cell| reading.doorways.contains(cell))
        .map(|&cell| reading.dungeon.standing_point(cell))
        .collect();
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
    let floor = dungeon::storey_floor(found.storey);
    let in_room =
        |[x, y]: [f64; 2]| x >= 0.0 && y >= 0.0 && dungeon.room_at(dungeon.cell_at([x, y, floor])) == Some(room);
    let ringed = |[x, y]: [f64; 2]| {
        let ring = RELIC_RING_M;
        [[x + ring, y], [x, y + ring], [x - ring, y], [x, y - ring]].into_iter().all(in_room)
    };
    let mut nearest = spots.to_vec();
    nearest.sort_by(|a, b| apart(*a, middle).total_cmp(&apart(*b, middle)));
    nearest.into_iter().find(|spot| ringed(*spot)).map(on_floor)
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

#[path = "encounter_ascent.rs"]
mod encounter_ascent;

#[cfg(test)]
#[path = "encounter_plan_tests.rs"]
mod encounter_plan_tests;
