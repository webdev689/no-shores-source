//! Walk-in buildings: a building a body walks into through its open doors, with rooms of its own inside its walls.
//! Each wing tall enough to stand in is lined with plaster just inside its outer faces, gaps left where its doors
//! open and lintels over them, floored with planks and ceiled under its eaves; one tall enough for two storeys has an
//! upper floor and a stair up to it; and its main room is furnished as its kind of building is (a tavern's counter
//! and tables, a house's bed and hearth, a temple's benches). Wings too low to stand in, outdoor steps and platforms
//! stay solid. What is built is drawn as solids, and every wall, floor, ceiling, stair and lintel is a box a body
//! meets.

use crate::book::{Book, Door, Measure, Wing};
use crate::collide::Box3;
use crate::pieces::Kit;
use crate::seat::Seated;
use city::solids::{Material, Shape, Solid};

/// A storey's height floor to floor, metres, and the least height a room is walked into at.
const STOREY_M: f64 = 3.2;
const LEAST_ROOM_M: f64 = 2.4;
/// The lining's thickness and how far inside the outer face it stands; a floor's, a ceiling's and a slab's.
const LINING_M: f64 = 0.2;
const INSET_M: f64 = 0.04;
const FLOOR_M: f64 = 0.06;
/// How far a ground floor's planks stand over the highest ground under them, and over the room's base at least: over
/// the model's own floor (its sills stand 0.05 m up) and any hump of the land, so neither shows through.
const PLANKS_OVER_M: f64 = 0.03;
const PLANKS_OVER_BASE_M: f64 = 0.07;
const PLANKS_HIGHEST_M: f64 = 0.4;
const CEILING_M: f64 = 0.16;
const SLAB_M: f64 = 0.25;
/// A stair's rise and run a step, and its width.
const RISE_M: f64 = 0.2;
const RUN_M: f64 = 0.3;
const STAIR_WIDTH_M: f64 = 1.0;
const WELL_BESIDE_M: f64 = 0.45;
/// The building types a body walks into: shops, guild halls, temples, taverns, palaces and houses (not the graves,
/// castle pieces and wall pieces Daggerfall files as buildings).
const WALKED_INTO: std::ops::RangeInclusive<u8> = 0..=20;

/// A building's frame: its origin and its yaw snapped to a quarter turn, for turning its plan into the world.
#[derive(Debug, Clone, Copy)]
struct Frame {
    origin: [f64; 3],
    cosine: f64,
    sine: f64,
}

impl Frame {
    fn of(seated: &Seated) -> Self {
        let quarter = ((seated.yaw / 90.0).round() as i64).rem_euclid(4);
        let (cosine, sine) = [(1.0, 0.0), (0.0, 1.0), (-1.0, 0.0), (0.0, -1.0)][quarter as usize];
        Self { origin: seated.at, cosine, sine }
    }

    /// A point of the plan (x right, z forward) in the world (east, south).
    fn world(&self, x: f64, z: f64) -> [f64; 2] {
        [self.origin[0] + x * self.cosine + z * self.sine, self.origin[1] + x * self.sine - z * self.cosine]
    }

    /// A box of the plan, x and z ranges, as a world box from `bottom` to `top` metres over the origin.
    fn block(&self, xs: [f64; 2], zs: [f64; 2], bottom: f64, top: f64, material: Material) -> Solid {
        let (corner, other) = (self.world(xs[0], zs[0]), self.world(xs[1], zs[1]));
        let middle = [(corner[0] + other[0]) / 2.0, (corner[1] + other[1]) / 2.0, self.origin[2] + bottom];
        let size = [(other[0] - corner[0]).abs(), (other[1] - corner[1]).abs(), top - bottom];
        Solid::upright(Shape::Block, middle, size, material)
    }
}

/// A box a body meets, from a solid square to the world.
fn box_of(solid: &Solid) -> Box3 {
    let [west, north, east, south, bottom, top] = solid.bounds();
    [west, north, east, south, top, bottom]
}

/// One rectangle of a wing, in plan metres and cells, with its floor and top over the origin.
#[derive(Debug, Clone, Copy)]
struct Room {
    cells: [usize; 4],
    xs: [f64; 2],
    zs: [f64; 2],
    base: f64,
    top: f64,
}

/// A building's plan as rooms: every rectangle of every wing, the room on each cell of its grid, the grid's size, a
/// cell's size and the grid's corner (x, z), plan metres.
struct Plan<'measure> {
    rooms: Vec<(Room, &'measure Wing)>,
    on: Vec<Option<usize>>,
    grid: [usize; 2],
    step: [f64; 2],
    min: [f64; 2],
}

/// Every rectangle of a building's plan, and for each cell of its grid the room standing on it.
fn rooms_of(measure: &Measure) -> Option<Plan<'_>> {
    let [columns, rows] = measure.grid?.map(|count| count as usize);
    let step = [(measure.max[0] - measure.min[0]) / columns as f64, (measure.max[2] - measure.min[2]) / rows as f64];
    let mut rooms = Vec::new();
    let mut on = vec![None; columns * rows];
    for wing in &measure.plan {
        let base = wing.low.unwrap_or(measure.min[1]);
        for rect in &wing.rects {
            let [column0, row0, column1, row1] =
                [rect[0], rect[1], rect[2], rect[3]].map(|value| value.max(0.0) as usize);
            let top = rect.get(4).copied().unwrap_or(wing.eaves);
            let room = Room {
                cells: [column0, row0, column1.min(columns), row1.min(rows)],
                xs: [measure.min[0] + column0 as f64 * step[0], measure.min[0] + column1 as f64 * step[0]],
                zs: [measure.min[2] + row0 as f64 * step[1], measure.min[2] + row1 as f64 * step[1]],
                base,
                top,
            };
            for row in room.cells[1]..room.cells[3] {
                for column in room.cells[0]..room.cells[2] {
                    on[row * columns + column] = Some(rooms.len());
                }
            }
            rooms.push((room, wing));
        }
    }
    Some(Plan { rooms, on, grid: [columns, rows], step, min: [measure.min[0], measure.min[2]] })
}

/// Whether a room is walked into: tall enough, and not outdoor steps or a platform.
fn walked(room: &Room, wing: &Wing) -> bool {
    !wing.steps && !wing.platform && room.top - room.base >= LEAST_ROOM_M
}

/// The floors of a room's storeys over the origin: the ground floor and each one above it that leaves room to stand.
fn floors_of(room: &Room) -> Vec<f64> {
    let mut floors = vec![room.base];
    while floors.last().is_some_and(|&floor| floor + STOREY_M + LEAST_ROOM_M <= room.top) {
        floors.push(floors[floors.len() - 1] + STOREY_M);
    }
    floors
}

/// What a building's interior adds: solids to draw and boxes a body meets.
#[derive(Debug, Default)]
pub struct Built {
    pub solids: Vec<Solid>,
    pub boxes: Vec<Box3>,
}

/// Builds a building's interior, or none where it is not walked into; then it is open.
pub fn build(kit: &mut Kit, seated: &mut Seated, book: &Book) -> Option<Built> {
    if !WALKED_INTO.contains(&seated.purpose) {
        return None;
    }
    let measure = book.buildings.get(&seated.model)?;
    let plan = rooms_of(measure)?;
    let rooms = &plan.rooms;
    if !rooms.iter().any(|(room, wing)| walked(room, wing)) {
        return None;
    }
    let frame = Frame::of(seated);
    let mut built = Built::default();
    line(&frame, &plan, &measure.doors, &mut built);
    let stair_room = rooms
        .iter()
        .enumerate()
        .filter(|(_, (room, wing))| walked(room, wing) && floors_of(room).len() > 1)
        .max_by(|(_, (first, _)), (_, (second, _))| area(first).total_cmp(&area(second)))
        .map(|(index, _)| index);
    for (index, (room, wing)) in rooms.iter().enumerate() {
        if !walked(room, wing) {
            let solid = frame.block(room.xs, room.zs, room.base, room.top, Material::Stone);
            built.boxes.push(box_of(&solid));
            continue;
        }
        let floors = floors_of(room);
        let stair = (Some(index) == stair_room).then(|| stair_of(room, &measure.doors));
        lay_floors(&frame, room, &floors, stair, planks_of(kit, &frame, room), &mut built);
        if let Some(stair) = stair {
            climb(&frame, room, stair, &mut built);
        }
    }
    let main = rooms
        .iter()
        .filter(|(room, wing)| walked(room, wing))
        .max_by(|(first, _), (second, _)| area(first).total_cmp(&area(second)));
    if let Some((room, _)) = main {
        let stair = stair_room.map(|index| stair_of(&rooms[index].0, &measure.doors));
        let planks = planks_of(kit, &frame, room);
        furnish(kit, &frame, room, &measure.doors, stair, planks, seated.purpose);
    }
    steps_out(kit, &frame, &measure.doors, measure.min[1], &mut built);
    seated.open = true;
    Some(built)
}

/// The top of a room's ground-floor planks over the origin: over the highest of the ground at its corners and middle.
fn planks_of(kit: &Kit, frame: &Frame, room: &Room) -> f64 {
    let (xs, zs) = ([room.xs[0] + 0.3, room.xs[1] - 0.3], [room.zs[0] + 0.3, room.zs[1] - 0.3]);
    let middle = [(xs[0] + xs[1]) / 2.0, (zs[0] + zs[1]) / 2.0];
    let points = [[xs[0], zs[0]], [xs[1], zs[0]], [xs[0], zs[1]], [xs[1], zs[1]], middle];
    let highest = points.iter().map(|&[x, z]| kit.height(frame.world(x, z))).fold(f64::NEG_INFINITY, f64::max);
    // Never more than a step over the doors' sills, so a body still walks in where the land humps under a room.
    (highest - frame.origin[2] + PLANKS_OVER_M).max(room.base + PLANKS_OVER_BASE_M).min(room.base + PLANKS_HIGHEST_M)
}

fn area(room: &Room) -> f64 {
    (room.xs[1] - room.xs[0]) * (room.zs[1] - room.zs[0])
}

/// The doors in one wall of a room: those whose sill lies on the wall's line, facing out of it, as spans along it
/// (from, to) with their sill and top.
fn doors_in(doors: &[Door], along_x: bool, at: f64, outward: f64) -> Vec<([f64; 2], f64, f64)> {
    doors
        .iter()
        .filter(|door| {
            let (across, facing) = if along_x { (door.sill[2], door.out[2]) } else { (door.sill[0], door.out[0]) };
            (across - at).abs() < 0.3 && facing * outward > 0.5
        })
        .map(|door| {
            let (from, to) = if along_x { (door.sill[0], door.sill_end[0]) } else { (door.sill[2], door.sill_end[2]) };
            ([from.min(to) - 0.05, from.max(to) + 0.05], door.sill[1], door.top[1])
        })
        .collect()
}

/// An edge of a building's outline: whether it runs along x, its line, its way out, and its floor, its top and the
/// height its lining starts from, millimetres.
type EdgeKey = (bool, i64, i64, [i64; 3]);

/// Lines a building's walls with plaster just inside its outline, storey by storey: every edge of a room walked into
/// that does not open onto another room on its floor, and over a lower room beside it the edge above that room's
/// top, merged into runs along each wall, open where its doors are and a lintel over each door.
fn line(frame: &Frame, plan: &Plan, doors: &[Door], built: &mut Built) {
    let [columns, rows] = plan.grid;
    // The top of a room walked on into across a side, on about the same floor: no lining stands below it.
    let open_to = |column: isize, row: isize, base: f64| {
        (column >= 0 && row >= 0 && (column as usize) < columns && (row as usize) < rows)
            .then(|| plan.on[row as usize * columns + column as usize])
            .flatten()
            .map(|index| &plan.rooms[index])
            .filter(|(other, wing)| walked(other, wing) && (other.base - base).abs() < 0.6)
            .map(|(other, _)| other.top)
    };
    let millimetres = |metres: f64| (metres * 1000.0).round() as i64;
    // Each edge keyed by whether it runs along x, its line, its way out, its floor, its top and where its lining
    // starts.
    let mut edges: std::collections::BTreeMap<EdgeKey, Vec<[f64; 2]>> = std::collections::BTreeMap::new();
    for row in 0..rows {
        for column in 0..columns {
            let Some(index) = plan.on[row * columns + column] else { continue };
            let (room, wing) = &plan.rooms[index];
            if !walked(room, wing) {
                continue;
            }
            let x = [plan.min[0] + column as f64 * plan.step[0], plan.min[0] + (column + 1) as f64 * plan.step[0]];
            let z = [plan.min[1] + row as f64 * plan.step[1], plan.min[1] + (row + 1) as f64 * plan.step[1]];
            let (column, row) = (column as isize, row as isize);
            for (along_x, line_at, outward, neighbour, span) in [
                (true, z[0], -1, (column, row - 1), x),
                (true, z[1], 1, (column, row + 1), x),
                (false, x[0], -1, (column - 1, row), z),
                (false, x[1], 1, (column + 1, row), z),
            ] {
                // Over a lower room beside it, a taller room is lined from that room's top, so its own wall above
                // that roof (drawn facing out) is never seen through from inside.
                let from = match open_to(neighbour.0, neighbour.1, room.base) {
                    Some(top) if top >= room.top - 1e-6 => continue,
                    Some(top) => top,
                    None => room.base,
                };
                let heights = [room.base, room.top, from].map(millimetres);
                edges.entry((along_x, millimetres(line_at), outward, heights)).or_default().push(span);
            }
        }
    }
    for ((along_x, line_at, outward, [base, top, from]), mut spans) in edges {
        spans.sort_by(|first, second| first[0].total_cmp(&second[0]));
        let mut runs: Vec<[f64; 2]> = Vec::new();
        for span in spans {
            match runs.last_mut() {
                Some(run) if span[0] - run[1] < 1e-6 => run[1] = run[1].max(span[1]),
                _ => runs.push(span),
            }
        }
        let (at, outward) = (line_at as f64 / 1000.0, outward as f64);
        let [base, top, from] = [base, top, from].map(|millimetres| millimetres as f64 / 1000.0);
        let inner = at - outward * (INSET_M + LINING_M / 2.0);
        let thick = [inner - LINING_M / 2.0, inner + LINING_M / 2.0];
        let floors = floors_of(&Room { cells: [0; 4], xs: [0.0; 2], zs: [0.0; 2], base, top });
        let gaps = doors_in(doors, along_x, at, outward);
        for (storey, &floor) in floors.iter().enumerate() {
            let ceiling = floors.get(storey + 1).map_or(top - CEILING_M, |&next| next - SLAB_M);
            let floor = floor.max(from);
            if ceiling - floor < 0.05 {
                continue;
            }
            let here: Vec<&([f64; 2], f64, f64)> =
                gaps.iter().filter(|(_, sill, _)| *sill > floor - 0.4 && *sill < floor + 0.8).collect();
            for run in &runs {
                let mut pieces = vec![*run];
                for (span, _, door_top) in &here {
                    pieces = pieces.into_iter().flat_map(|piece| cut(piece, *span)).collect();
                    if span[0] < run[1] && span[1] > run[0] && *door_top < ceiling - 0.05 {
                        let lintel =
                            wall(frame, along_x, [span[0].max(run[0]), span[1].min(run[1])], thick, *door_top, ceiling);
                        built.boxes.push(box_of(&lintel));
                        built.solids.push(lintel);
                    }
                }
                for piece in pieces.into_iter().filter(|piece| piece[1] - piece[0] > 0.05) {
                    let lining = wall(frame, along_x, piece, thick, floor, ceiling);
                    built.boxes.push(box_of(&lining));
                    built.solids.push(lining);
                }
            }
        }
    }
}

/// A span with another cut out of it: none, one or two pieces.
fn cut(piece: [f64; 2], gap: [f64; 2]) -> Vec<[f64; 2]> {
    if gap[1] <= piece[0] || gap[0] >= piece[1] {
        return vec![piece];
    }
    [[piece[0], gap[0]], [gap[1], piece[1]]].into_iter().filter(|part| part[1] > part[0]).collect()
}

/// A length of lining: `span` along its wall, `thick` across it, from `bottom` to `top` over the origin.
fn wall(frame: &Frame, along_x: bool, span: [f64; 2], thick: [f64; 2], bottom: f64, top: f64) -> Solid {
    let (xs, zs) = if along_x { (span, thick) } else { (thick, span) };
    frame.block(xs, zs, bottom, top, Material::Plaster)
}

/// Where a room's stair runs: along its longer side, against a wall and from an end that leave its doors clear, in
/// plan metres (its foot, its way along x or z, +1 or -1, and the span across it).
#[derive(Debug, Clone, Copy)]
struct Stair {
    along_x: bool,
    start: f64,
    way: f64,
    side: [f64; 2],
}

impl Stair {
    /// The stretch its steps run along, low end first, plan metres.
    fn run(&self) -> [f64; 2] {
        let end = self.start + self.way * (STOREY_M / RISE_M).round() * RUN_M;
        [self.start.min(end), self.start.max(end)]
    }
}

fn stair_of(room: &Room, doors: &[Door]) -> Stair {
    let along_x = room.xs[1] - room.xs[0] >= room.zs[1] - room.zs[0];
    let (lines, ends) = if along_x { (room.zs, room.xs) } else { (room.xs, room.zs) };
    let busy = |near: usize| doors_in(doors, along_x, lines[near], [-1.0, 1.0][near]).len();
    let fewer = if busy(0) <= busy(1) { 0 } else { 1 };
    let options = [(fewer, 1.0), (fewer, -1.0), (1 - fewer, 1.0), (1 - fewer, -1.0)].map(|(near, way)| {
        let inner = if near == 0 { lines[0] + INSET_M + LINING_M } else { lines[1] - INSET_M - LINING_M };
        let side = if near == 0 { [inner, inner + STAIR_WIDTH_M] } else { [inner - STAIR_WIDTH_M, inner] };
        let start = if way > 0.0 { ends[0] + INSET_M + LINING_M + 0.2 } else { ends[1] - INSET_M - LINING_M - 0.2 };
        (Stair { along_x, start, way, side }, near)
    });
    // The first that leaves every door clear: none in its wall beside the run or the landing at its top, and none in
    // the end wall at its foot.
    let clear = |(stair, near): &(Stair, usize)| {
        let [low, high] = stair.run();
        let beside = doors_in(doors, along_x, lines[*near], [-1.0, 1.0][*near]);
        let foot = if stair.way > 0.0 { 0 } else { 1 };
        let ahead = doors_in(doors, !along_x, ends[foot], [-1.0, 1.0][foot]);
        beside.iter().all(|(span, _, _)| span[1] < low - 1.0 || span[0] > high + 1.0)
            && ahead.iter().all(|(span, _, _)| span[1] < stair.side[0] - 0.2 || span[0] > stair.side[1] + 0.2)
    };
    let (stair, _) = options.iter().find(|option| clear(option)).unwrap_or(&options[0]);
    *stair
}

/// The steps up to the first upper floor, each a block from the floor to its tread.
fn climb(frame: &Frame, room: &Room, stair: Stair, built: &mut Built) {
    let steps = (STOREY_M / RISE_M).round() as usize;
    for step in 0..steps {
        let along =
            [stair.start + stair.way * step as f64 * RUN_M, stair.start + stair.way * (step + 1) as f64 * RUN_M];
        let (xs, zs) = if stair.along_x { (along, stair.side) } else { (stair.side, along) };
        let tread = room.base + (step + 1) as f64 * RISE_M;
        let solid = frame.block(xs, zs, room.base, tread, Material::Timber);
        built.boxes.push(box_of(&solid));
        built.solids.push(solid);
    }
}

/// A room's plank floor, its top at `planks` over the origin and walked on, its ceiling, and the slab of each upper
/// floor with its stairwell left open.
fn lay_floors(frame: &Frame, room: &Room, floors: &[f64], stair: Option<Stair>, planks: f64, built: &mut Built) {
    let inner_x = [room.xs[0] + INSET_M, room.xs[1] - INSET_M];
    let inner_z = [room.zs[0] + INSET_M, room.zs[1] - INSET_M];
    let floor = frame.block(inner_x, inner_z, room.base - FLOOR_M, planks, Material::Timber);
    built.boxes.push(box_of(&floor));
    built.solids.push(floor);
    built.solids.push(frame.block(inner_x, inner_z, room.top - CEILING_M, room.top, Material::Timber));
    // A body meets the ceiling, and the rain stops under what a body meets (client/src/sky/shelter.ts): its box spans
    // the room to its outer faces, as a closed building's whole box does, so the shelter's cells along its walls are
    // dry inside.
    built.boxes.push(box_of(&frame.block(room.xs, room.zs, room.top - CEILING_M, room.top, Material::Timber)));
    for &floor in &floors[1..] {
        let mut slabs = vec![(inner_x, inner_z)];
        if let (Some(stair), true) = (stair, floor - room.base < STOREY_M + 0.1) {
            // Open over the steps, and past the top one so a head climbing them clears the slab's edge.
            let [low, high] = stair.run();
            let well = if stair.way > 0.0 { [low - 0.1, high + 0.3] } else { [low - 0.3, high + 0.1] };
            // Wider than the steps by more than a body's radius, so a head going up beside their edge clears the slab.
            let side = [stair.side[0] - WELL_BESIDE_M, stair.side[1] + WELL_BESIDE_M];
            let (well_x, well_z) = if stair.along_x { (well, side) } else { (side, well) };
            slabs = vec![
                ([inner_x[0], well_x[0]], inner_z),
                ([well_x[1], inner_x[1]], inner_z),
                ([well_x[0].max(inner_x[0]), well_x[1].min(inner_x[1])], [inner_z[0], well_z[0]]),
                ([well_x[0].max(inner_x[0]), well_x[1].min(inner_x[1])], [well_z[1], inner_z[1]]),
            ];
        }
        for (xs, zs) in slabs {
            if xs[1] - xs[0] > 0.05 && zs[1] - zs[0] > 0.05 {
                let slab = frame.block(xs, zs, floor - SLAB_M, floor, Material::Timber);
                built.boxes.push(box_of(&slab));
                built.solids.push(slab);
            }
        }
    }
}

/// The furniture of a room by its building's kind: what stands along its walls, and a table in its middle.
fn furnish(kit: &mut Kit, frame: &Frame, room: &Room, doors: &[Door], stair: Option<Stair>, planks: f64, purpose: u8) {
    const BED: u32 = 41000;
    const TABLE: u32 = 41108;
    const CHAIR: u32 = 41100;
    const WARDROBE: u32 = 41003;
    const SHELF: u32 = 41005;
    const HEARTH: u32 = 41116;
    const COUNTER: u32 = 41126;
    const BENCH: u32 = 41105;
    const LECTERN: u32 = 41021;
    const CRATE: u32 = 41816;
    let along_walls: &[u32] = match purpose {
        15 => &[COUNTER, HEARTH, CRATE, CRATE, BENCH, SHELF],
        14 => &[LECTERN, BENCH, BENCH, BENCH, BENCH],
        17..=20 => &[BED, HEARTH, WARDROBE, SHELF, CRATE],
        _ => &[COUNTER, SHELF, SHELF, SHELF, CRATE, CRATE],
    };
    let inside = INSET_M + LINING_M + 0.45;
    let (xs, zs) = ([room.xs[0] + inside, room.xs[1] - inside], [room.zs[0] + inside, room.zs[1] - inside]);
    if xs[1] - xs[0] < 1.5 || zs[1] - zs[0] < 1.5 {
        return;
    }
    // Slots round the room, a metre and three quarters apart, each facing the middle; none before a door or on the
    // stair.
    let mut slots: Vec<([f64; 2], [f64; 2])> = Vec::new();
    for (start, end, facing) in [
        ([xs[0], zs[0]], [xs[1], zs[0]], [0.0, 1.0]),
        ([xs[1], zs[1]], [xs[0], zs[1]], [0.0, -1.0]),
        ([xs[0], zs[1]], [xs[0], zs[0]], [1.0, 0.0]),
        ([xs[1], zs[0]], [xs[1], zs[1]], [-1.0, 0.0]),
    ] {
        let length = ((end[0] - start[0]).abs()).max((end[1] - start[1]).abs());
        let count = (length / 1.75) as usize;
        for slot in 1..count {
            let share = slot as f64 / count as f64;
            let at = [start[0] + (end[0] - start[0]) * share, start[1] + (end[1] - start[1]) * share];
            let by_door = doors.iter().any(|door| {
                let middle = [(door.sill[0] + door.sill_end[0]) / 2.0, (door.sill[2] + door.sill_end[2]) / 2.0];
                (middle[0] - at[0]).abs() + (middle[1] - at[1]).abs() < 2.2 && door.sill[1] < room.base + 0.8
            });
            let on_stair = stair.is_some_and(|stair| {
                let [low, high] = stair.run();
                let (along, across) = if stair.along_x { (at[0], at[1]) } else { (at[1], at[0]) };
                along > low - 0.8 && along < high + 0.8 && across > stair.side[0] - 0.9 && across < stair.side[1] + 0.9
            });
            if !by_door && !on_stair {
                slots.push((at, facing));
            }
        }
    }
    let floor = frame.origin[2] + planks;
    let place = |kit: &mut Kit, model: u32, at: [f64; 2], facing: [f64; 2]| {
        let Some(measure) = kit.book.measure(model, false) else { return };
        let world = frame.world(at[0], at[1]);
        let turned = frame.world(at[0] + facing[0], at[1] + facing[1]);
        let toward = [turned[0] - world[0], turned[1] - world[1]];
        let yaw = crate::pieces::yaw_toward(toward);
        let reach = (measure.max[0] - measure.min[0]).max(measure.max[2] - measure.min[2]) / 2.0;
        kit.prop_at(
            model,
            [world[0], world[1], floor - measure.min[1]],
            yaw,
            [world[0] - reach, world[1] - reach, world[0] + reach, world[1] + reach],
        );
    };
    let picked = slots.len().min(along_walls.len());
    for (number, &model) in along_walls.iter().take(picked).enumerate() {
        let (at, facing) = slots[number * slots.len() / picked.max(1)];
        place(kit, model, at, facing);
    }
    let middle = [(xs[0] + xs[1]) / 2.0, (zs[0] + zs[1]) / 2.0];
    if xs[1] - xs[0] > 3.5 && zs[1] - zs[0] > 3.5 && purpose != 14 {
        place(kit, TABLE, middle, [0.0, 1.0]);
        place(kit, CHAIR, [middle[0], middle[1] - 1.0], [0.0, 1.0]);
        place(kit, CHAIR, [middle[0], middle[1] + 1.0], [0.0, -1.0]);
    }
}

/// Stone steps down from each ground-floor door whose sill stands over the ground outside it.
fn steps_out(kit: &mut Kit, frame: &Frame, doors: &[Door], ground_floor: f64, built: &mut Built) {
    for door in doors.iter().filter(|door| door.sill[1] < ground_floor + 0.8) {
        let middle = [(door.sill[0] + door.sill_end[0]) / 2.0, (door.sill[2] + door.sill_end[2]) / 2.0];
        let out = [door.out[0], door.out[2]];
        let width = ((door.sill_end[0] - door.sill[0]).abs()).max((door.sill_end[2] - door.sill[2]).abs()) + 0.6;
        let sill = frame.origin[2] + door.sill[1];
        let outside = frame.world(middle[0] + out[0] * 0.9, middle[1] + out[1] * 0.9);
        let drop = sill - kit.height(outside);
        if drop < 0.3 {
            continue;
        }
        let count = (drop / 0.22).ceil().min(14.0) as usize;
        for step in 0..count {
            let near = 0.3 + step as f64 * 0.35;
            let far = near + 0.35;
            let tread = sill - (step + 1) as f64 * (drop / count as f64);
            let (xs, zs) = if out[0].abs() > 0.5 {
                let span = [middle[0] + out[0] * near, middle[0] + out[0] * far];
                ([span[0].min(span[1]), span[0].max(span[1])], [middle[1] - width / 2.0, middle[1] + width / 2.0])
            } else {
                let span = [middle[1] + out[1] * near, middle[1] + out[1] * far];
                ([middle[0] - width / 2.0, middle[0] + width / 2.0], [span[0].min(span[1]), span[0].max(span[1])])
            };
            let base = tread - drop - 0.6 - frame.origin[2];
            let solid = frame.block(xs, zs, base, tread - frame.origin[2], Material::Stone);
            built.boxes.push(box_of(&solid));
            built.solids.push(solid);
        }
    }
}

#[cfg(test)]
#[path = "interiors_tests.rs"]
mod tests;
