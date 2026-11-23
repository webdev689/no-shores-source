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
/// How far round from the way into a Weighing's room its plates stand at the most, as the cosine of the angle between
/// the way in through its doorway and the way from the doorway to a plate: about 70 degrees either side, so a body
/// coming in has every plate ahead of it, none behind or beside it.
pub const PLATES_AHEAD: f64 = 0.35;
/// An Ascent's pads: half a pad's side; the first's top, mantled from the dry doorway (within `TUNING.reach`); how
/// much higher each next stands than the one before at the most, and how far every pad after the first stands over a
/// mantle's reach from the floor at the least; the fewest and the most of them; the leap from each to the next, edge to edge along the line
/// between their middles, the least and the most (m), which a run off the edge never crosses and a running jump does;
/// and the room kept between a body's head on the top pad and the ceiling, and on any other pad, which a running jump
/// (`TUNING.jump`, rising about half a metre) leaves from (m).
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

/// What the plan reads of a dungeon: its cells' walks, the cells framed as doorways, those torches hang in, every
/// solid (`Dungeon::boxes`), and where every prop and fixture stands.
struct Reading<'laid> {
    dungeon: &'laid Dungeon,
    walks: Vec<u32>,
    doorways: Vec<usize>,
    torched: Vec<usize>,
    boxes: Vec<[f64; 5]>,
    furnished: Vec<[f64; 2]>,
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
            furnished: (dungeon.props.iter().map(|prop| [prop.at[0], prop.at[1]]))
                .chain(dungeon.fixtures.iter().map(|fixture| [fixture.at[0], fixture.at[1]]))
                .collect(),
        }
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
        .filter(|spot| self.furnished.iter().all(|at| apart(*at, *spot) >= PROP_CLEAR_M * PROP_CLEAR_M))
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
    let anchors = anchors_of(&reading);
    EncounterPlan { seals, anchors, columns: dungeon.columns }
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
            let point = |[x, y]: [f64; 2]| [x, y, x, y];
            let seen: Vec<[f64; 2]> = spots
                .iter()
                .copied()
                .filter(|&spot| ahead(spot) && open_air(point(door), point(spot), &reading.boxes))
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

/// A pad's footprint: west, north, east and south edges (m).
type Footprint = [f64; 4];

/// How far apart two footprints stand edge to edge, squared.
fn gap_squared(a: Footprint, b: Footprint) -> f64 {
    let east = (a[0] - b[2]).max(b[0] - a[2]).max(0.0);
    let south = (a[1] - b[3]).max(b[1] - a[3]).max(0.0);
    east * east + south * south
}

/// Whether the leap from one footprint to the next, edge to edge along the line between their middles, is within
/// LEAP_M; compared squared, so no root is taken.
fn leaps(a: Footprint, b: Footprint) -> bool {
    let middle = |pad: Footprint| [(pad[0] + pad[2]) / 2.0, (pad[1] + pad[3]) / 2.0];
    let ([ax, ay], [bx, by]) = (middle(a), middle(b));
    let (east, south) = ((bx - ax).abs(), (by - ay).abs());
    // The share of the line between the middles each pad covers, out from its middle to its edge.
    let out = |pad: Footprint| {
        let (half_x, half_y) = ((pad[2] - pad[0]) / 2.0, (pad[3] - pad[1]) / 2.0);
        match (east > 0.0, south > 0.0) {
            (true, true) => (half_x / east).min(half_y / south),
            (true, false) => half_x / east,
            (false, true) => half_y / south,
            (false, false) => 1.0,
        }
    };
    let open = 1.0 - out(a) - out(b);
    let leap_squared = (east * east + south * south) * open * open;
    open > 0.0 && leap_squared >= LEAP_M.0 * LEAP_M.0 && leap_squared <= LEAP_M.1 * LEAP_M.1
}

/// Whether the way from one footprint's middle to the next's, as wide as a body and a hand besides, meets no solid: the
/// dungeon's solids are walls to a body however high it leaps.
fn open_air(a: Footprint, b: Footprint, boxes: &[[f64; 5]]) -> bool {
    let middle = |pad: Footprint| [(pad[0] + pad[2]) / 2.0, (pad[1] + pad[3]) / 2.0];
    let ([ax, ay], [bx, by]) = (middle(a), middle(b));
    let wide = TUNING.radius + 0.1;
    boxes.iter().all(|&[min_x, min_y, max_x, max_y, _]| {
        // The share of the way inside the box's span on each axis, widened; the way meets it where all overlap.
        let span = |from: f64, to: f64, low: f64, high: f64| {
            let (low, high, run) = (low - wide, high + wide, to - from);
            if run == 0.0 {
                return if from >= low && from <= high { (0.0, 1.0) } else { (1.0, 0.0) };
            }
            let (first, second) = ((low - from) / run, (high - from) / run);
            (first.min(second), first.max(second))
        };
        let ((east_in, east_out), (south_in, south_out)) = (span(ax, bx, min_x, max_x), span(ay, by, min_y, max_y));
        east_in.max(south_in).max(0.0) > east_out.min(south_out).min(1.0)
    })
}

/// An Ascent's pads and its seal stone. The first pad stands on a free cell beside the room's doorway nearest the way
/// in, reaching back to that doorway so the way onto it crosses no water, its top FIRST_PAD_TOP_M; each next a leap
/// away (LEAP_M) and every two at least the least leap apart, so no pad after the first is reached but by a running
/// jump; each PAD_RISE_M over the one before, to under the room's lowest ceiling less a body's height and JUMP_ROOM_M,
/// the last HEAD_ROOM_M.
/// The stone stands on the last pad's top. None for fewer than the fewest pads, or a ceiling too low for the second
/// pad to stand over a mantle's reach.
fn ascent(reading: &Reading, room: usize) -> Option<(Vec<Block>, [f64; 3])> {
    let dungeon = reading.dungeon;
    let found = &dungeon.rooms[room];
    let lowest = found.cells.iter().map(|&cell| dungeon.ceilings[cell]).fold(f64::INFINITY, f64::min);
    let (under, leapt_under) = (lowest - TUNING.height - HEAD_ROOM_M, lowest - TUNING.height - JUMP_ROOM_M);
    if leapt_under < TUNING.reach + PAD_OVER_REACH_M {
        return None;
    }
    let start = reading.entered_by(room)?;
    let padded = reading.padded(room);
    let clear = |pad: Footprint| {
        reading.boxes.iter().all(|&[min_x, min_y, max_x, max_y, _]| {
            max_x <= pad[0] || min_x >= pad[2] || max_y <= pad[1] || min_y >= pad[3]
        })
    };
    let fits = |pad: Footprint| {
        let on = |x: f64, y: f64| {
            let cell = (y / CELL_M) as usize * dungeon.columns + (x / CELL_M) as usize;
            x >= 0.0 && y >= 0.0 && padded.contains(&cell)
        };
        clear(pad) && on(pad[0], pad[1]) && on(pad[2], pad[1]) && on(pad[0], pad[3]) && on(pad[2], pad[3])
    };
    // Every pad's middle on a grid QUARTER_M apart over the room's cells, four a side to a cell.
    let offsets = [-1.5 * QUARTER_M, -0.5 * QUARTER_M, 0.5 * QUARTER_M, 1.5 * QUARTER_M];
    let spots: Vec<Footprint> = found
        .cells
        .iter()
        .flat_map(|&cell| {
            let [x, y] = dungeon.centre(cell);
            offsets.into_iter().flat_map(move |east| offsets.map(|south| [x + east, y + south]))
        })
        .map(|[x, y]| [x - PAD_HALF_M, y - PAD_HALF_M, x + PAD_HALF_M, y + PAD_HALF_M])
        .filter(|pad| fits(*pad))
        .collect();
    let mut best: Vec<Footprint> = Vec::new();
    for side in SIDES {
        let Some(first_cell) = dungeon.beside(start, side).filter(|cell| padded.contains(cell)) else { continue };
        let ([start_x, start_y], [x, y]) = (dungeon.centre(start), dungeon.centre(first_cell));
        let mut first = [x - PAD_HALF_M, y - PAD_HALF_M, x + PAD_HALF_M, y + PAD_HALF_M];
        // Reaching back to the doorway's cell.
        let edge = |from: f64, to: f64| (from + to) / 2.0;
        match (x.total_cmp(&start_x), y.total_cmp(&start_y)) {
            (core::cmp::Ordering::Greater, _) => first[0] = edge(start_x, x),
            (core::cmp::Ordering::Less, _) => first[2] = edge(start_x, x),
            (_, core::cmp::Ordering::Greater) => first[1] = edge(start_y, y),
            _ => first[3] = edge(start_y, y),
        }
        if !clear(first) {
            continue;
        }
        let mut path = vec![first];
        let mut budget = LEAP_SEARCH;
        leaping(&spots, &reading.boxes, &mut path, &mut best, &mut budget);
    }
    if best.len() < ASCENT_PADS.0 {
        return None;
    }
    let mut top = FIRST_PAD_TOP_M - PAD_RISE_M;
    let pads: Vec<Block> = best
        .iter()
        .enumerate()
        .map(|(nth, &[min_x, min_y, max_x, max_y])| {
            top = (top + PAD_RISE_M).min(if nth + 1 == best.len() { under } else { leapt_under });
            Block { min_x, min_y, max_x, max_y, top, bottom: dungeon::FLOOR_M }
        })
        .collect();
    let last = pads.last()?;
    let stone = [(last.min_x + last.max_x) / 2.0, (last.min_y + last.max_y) / 2.0, last.top];
    Some((pads, stone))
}

/// How many steps the search for an Ascent's leaps takes from each first pad at the most.
const LEAP_SEARCH: usize = 20_000;

/// The longest run of `spots` from `path`'s last, each a leap through open air from the one before and at least the
/// least leap from every other, ASCENT_PADS' most at the most; of two as long, the first found.
fn leaping(
    spots: &[Footprint],
    boxes: &[[f64; 5]],
    path: &mut Vec<Footprint>,
    best: &mut Vec<Footprint>,
    budget: &mut usize,
) {
    if path.len() > best.len() {
        best.clone_from(path);
    }
    if path.len() == ASCENT_PADS.1 || best.len() == ASCENT_PADS.1 {
        return;
    }
    let Some(&here) = path.last() else { return };
    for &next in spots {
        if *budget == 0 {
            return;
        }
        *budget -= 1;
        let apart = path.iter().all(|&pad| gap_squared(pad, next) >= LEAP_M.0 * LEAP_M.0);
        if apart && leaps(here, next) && open_air(here, next, boxes) {
            path.push(next);
            leaping(spots, boxes, path, best, budget);
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
