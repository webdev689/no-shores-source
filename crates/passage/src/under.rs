//! A zone under ground: the Forge's dungeon in the zone's style, laid in its size's blocks from its seed, with its
//! way in as the mouth behind, its onward mouths on rock walls of the rooms farthest along its way, its lamp in its
//! greatest room, its foes' posts in its rooms and its spots on their quiet floor.

use crate::LAMP_CEILING_M;
use crate::plan::Kind;
use crate::sites::{Door, POST_OFF_WAY_IN_M, SPOT_APART_M, Sites, apart, spots_of, spread};
use crate::zone::{Deal, Mission, Zone};
use dungeon::{CELL_M, Cell, Dungeon, SIDES, Side};

/// The onward mouths' passes: how far from the way in each keeps, how far from one another (metres), and whether each
/// asks a room of its own, the first pass the most.
const PASSES: [(f64, f64, bool); 4] = [(16.0, 9.0, true), (16.0, 9.0, false), (12.0, 6.0, false), (9.0, 4.0, false)];
/// How far a mouth keeps from a torch, a prop, a fixture or a landmark, metres.
const MOUTH_CLEAR_M: f64 = 2.4;
/// How far a mouth stands off its wall, as the exit door does, metres.
const OFF_WALL_M: f64 = CELL_M / 2.0 - 0.02;
/// How many seeds a lamp's zone is tried from for a room tall enough to stand it in.
const LAMP_TRIES: u32 = 32;
/// How far the lamp keeps its ring from anything else's spot or post, metres.
const LAMP_CLEAR_M: f64 = 5.0;

/// A wall of a room's cell that is rock on its side, as a door would stand on it: its cell, side and room's walk.
struct Wall {
    cell: usize,
    side: Side,
    room: usize,
    walk: u32,
}

fn door_on(dungeon: &Dungeon, cell: usize, side: Side) -> Door {
    let [x, y] = dungeon.centre(cell);
    let [dx, dy] = side.unit();
    Door { at: [x + dx * OFF_WALL_M, y + dy * OFF_WALL_M], facing: side.opposite().bearing() }
}

/// Every wall a mouth could stand on: a room's cell's side that meets rock, clear of the way in, the torches, the
/// props, the fixtures and the landmarks.
fn walls(dungeon: &Dungeon) -> Vec<Wall> {
    let mut taken: Vec<[f64; 2]> = dungeon.torches.iter().map(|torch| [torch.at[0], torch.at[1]]).collect();
    taken.extend(dungeon.props.iter().map(|prop| [prop.at[0], prop.at[1]]));
    taken.extend(dungeon.fixtures.iter().map(|fixture| [fixture.at[0], fixture.at[1]]));
    taken.extend(dungeon.landmarks.iter().flat_map(|placed| placed.cells.iter().map(|&cell| dungeon.centre(cell))));
    let mut found = Vec::new();
    for (cell, kind) in dungeon.cells.iter().enumerate() {
        let Cell::Room(room) = *kind else { continue };
        for side in SIDES {
            // A great cave's stones stand free inside it: rock, but no wall.
            let rock = dungeon.beside(cell, side).is_none_or(|next| {
                dungeon.cells[next] == Cell::Rock && dungeon.rooms.iter().all(|room| !room.stones.contains(&next))
            });
            let door = door_on(dungeon, cell, side);
            let clear = taken.iter().all(|place| apart(*place, door.at) >= MOUTH_CLEAR_M);
            if rock && clear && cell != dungeon.way_in.cell {
                let room = usize::from(room);
                found.push(Wall { cell, side, room, walk: dungeon.rooms[room].walk });
            }
        }
    }
    found
}

/// The onward mouths: the farthest walls along the way first, the end room's portal wall before all, each in a room
/// of its own where there are enough, then any wall far enough from the others.
fn onward(dungeon: &Dungeon, count: usize, way_in: [f64; 2]) -> Vec<Door> {
    let mut walls = walls(dungeon);
    let portal = (dungeon.portal.cell, dungeon.portal.side);
    walls.sort_by(|one, other| {
        let first = |wall: &Wall| (wall.cell, wall.side) != portal;
        first(one)
            .cmp(&first(other))
            .then(other.walk.cmp(&one.walk))
            .then(
                apart(door_on(dungeon, other.cell, other.side).at, way_in)
                    .total_cmp(&apart(door_on(dungeon, one.cell, one.side).at, way_in)),
            )
            .then(one.cell.cmp(&other.cell))
    });
    let mut chosen: Vec<(Door, usize)> = Vec::new();
    // A small dungeon may not hold every way on at the full spacing: each pass asks a little less of the last, so
    // every way on has its mouth.
    for (off_way_in, mouths_apart, own_room) in PASSES {
        for wall in &walls {
            let door = door_on(dungeon, wall.cell, wall.side);
            let far = apart(door.at, way_in) >= off_way_in
                && chosen.iter().all(|(held, _)| apart(held.at, door.at) >= mouths_apart);
            let alone = !own_room || chosen.iter().all(|(_, room)| *room != wall.room);
            if chosen.len() < count && far && alone {
                chosen.push((door, wall.room));
            }
        }
    }
    chosen.into_iter().map(|(door, _)| door).collect()
}

/// The lamp's room: the greatest room but the way in's, three cells or more each way where one is, and its quiet
/// cell nearest its middle where the lamp, facing the arrival, stands clear of every prop, fixture, landmark, pillar
/// and doorway; where its room holds no such cell, the next room as great and as tall, and where none does, the
/// greatest room's quiet cell nearest its middle.
fn lamp(dungeon: &Dungeon, arrive: [f64; 2]) -> Option<[f64; 2]> {
    let way_in_room = dungeon.way_in.room;
    let roomy = |room: &dungeon::Room| room.width >= 3 && room.depth >= 3;
    // The lamp stands 3.8 m high with its flame: a room tall enough first.
    let tall = |room: &dungeon::Room| room.height >= LAMP_CEILING_M;
    let rank = |number: usize, room: &dungeon::Room| {
        (roomy(room) && tall(room), tall(room), roomy(room), room.cells.len(), usize::MAX - number)
    };
    let mut rooms: Vec<(usize, &dungeon::Room)> =
        dungeon.rooms.iter().enumerate().filter(|(number, _)| *number != way_in_room).collect();
    rooms.sort_by_key(|&(number, room)| std::cmp::Reverse(rank(number, room)));
    let nearest_middle = |room: &dungeon::Room| {
        let middle =
            [(room.x as f64 + room.width as f64 / 2.0) * CELL_M, (room.y as f64 + room.depth as f64 / 2.0) * CELL_M];
        let cells = if room.quiet.is_empty() { &room.cells } else { &room.quiet };
        let mut places: Vec<(usize, [f64; 2])> = cells.iter().map(|&cell| (cell, dungeon.centre(cell))).collect();
        places.sort_by(|one, other| apart(one.1, middle).total_cmp(&apart(other.1, middle)));
        places
    };
    let boxes = dungeon.boxes();
    let &(_, greatest) = rooms.first()?;
    let alike = rooms.iter().filter(|(_, room)| (roomy(room), tall(room)) == (roomy(greatest), tall(greatest)));
    let placed =
        alike.flat_map(|(_, room)| nearest_middle(room)).find(|&(_, at)| lamp_clear(dungeon, &boxes, at, arrive));
    placed.or_else(|| nearest_middle(greatest).first().copied()).map(|(_, at)| at)
}

/// Whether the lamp at `at`, facing the arrival, stands on a cell that holds no solid with its plinth and stones
/// on its rooms' floor and clear of the dungeon's `boxes`.
fn lamp_clear(dungeon: &Dungeon, boxes: &[[f64; 6]], at: [f64; 2], arrive: [f64; 2]) -> bool {
    let overlap = |one: &[f64; 5], other: &[f64; 6]| {
        one[0] < other[2] && other[0] < one[2] && one[1] < other[3] && other[1] < one[3]
    };
    let cell_at = |[x, y]: [f64; 2]| {
        let (column, row) = ((x / CELL_M).floor(), (y / CELL_M).floor());
        let inside =
            column >= 0.0 && row >= 0.0 && (column as usize) < dungeon.columns && (row as usize) < dungeon.rows;
        inside.then(|| row as usize * dungeon.columns + column as usize)
    };
    let on_room_floor =
        |point: [f64; 2]| cell_at(point).is_some_and(|cell| matches!(dungeon.cells[cell], Cell::Room(_)));
    let facing = libm::atan2(arrive[0] - at[0], -(arrive[1] - at[1]));
    let solids = Kind::Lamp.solids_at([at[0], at[1], dungeon::FLOOR_M], facing);
    let whole = |&[west, north, east, south, _]: &[f64; 5]| {
        [[west, north], [east, north], [east, south], [west, south]].into_iter().all(on_room_floor)
    };
    cell_at(at).is_some_and(|cell| !dungeon.holds_solid(cell))
        && solids.iter().all(|solid| whole(solid) && boxes.iter().all(|held| !overlap(solid, held)))
}

/// The zone's layings under ground in its style, each from the next seed, the first first; a lamp's zone only where
/// a room but the way in's is tall enough to stand the lamp in and the lamp stands clear of the Forge's solids, a
/// Hold's where a room holds its ring whole, and any where its floor gives its deal every spot it wants, its seeds
/// tried once in turn, else its first seed's alone. None for a style the Forge does not know.
pub(crate) fn layings(zone: &Zone, style: &str, onward_count: usize) -> Option<impl Iterator<Item = (Dungeon, Sites)>> {
    let style = dungeon::style_of(style)?;
    let blocks = zone.size.blocks();
    let first = zone.forge_seed();
    // A passage under ground keeps one storey, as its zones were laid for.
    let forged = move |step: u32| Dungeon::forge_storeys(first.wrapping_add(step), style, (blocks, blocks), 1);
    // The lamp never stands in the way in's room, so that room's height does not count.
    let tall_enough = |dungeon: &Dungeon| {
        let mut rooms = dungeon.rooms.iter().enumerate().filter(|(number, _)| *number != dungeon.way_in.room);
        rooms.any(|(_, room)| room.height >= LAMP_CEILING_M)
    };
    let lamp = zone.has_lamp();
    let hold = zone.deal == Deal::Mission(Mission::Hold);
    let laid_out = {
        let zone = zone.clone();
        move |dungeon: Dungeon| {
            let sites = sites_of(&zone, &dungeon, onward_count);
            (dungeon, sites)
        }
    };
    // A Hold's ring, at its first spot, lies whole on the floor.
    let ring_whole =
        |(dungeon, sites): &(Dungeon, Sites)| sites.spots.first().is_some_and(|&at| ring_clear(dungeon, at));
    // The lamp stands clear of the Forge's solids, and the deal finds a spot for each of its things.
    let lamp_whole = |(dungeon, sites): &(Dungeon, Sites)| {
        sites.lamp.is_some_and(|at| lamp_clear(dungeon, &dungeon.boxes(), at, sites.arrive))
    };
    let wanted = crate::plan::spots_wanted(zone.deal);
    let tall = (0..LAMP_TRIES * 2)
        .map(forged)
        .filter(move |dungeon| !lamp || tall_enough(dungeon))
        .map(laid_out.clone())
        .filter(move |laid| !hold || ring_whole(laid))
        .filter(move |laid| !lamp || lamp_whole(laid))
        .filter(move |(_, sites)| sites.spots.len() >= wanted);
    let mut tall = tall.peekable();
    let laid: Box<dyn Iterator<Item = (Dungeon, Sites)>> =
        if tall.peek().is_some() { Box::new(tall) } else { Box::new(std::iter::once(laid_out(forged(0)))) };
    Some(laid)
}

/// The sites of a zone laid in a dungeon: its arrival and way in, its onward mouths, its lamp, posts and spots.
fn sites_of(zone: &Zone, dungeon: &Dungeon, onward_count: usize) -> Sites {
    let (arrive, toward) = dungeon.arrival();
    let facing = libm::atan2(toward[0], -toward[1]);
    let way_in = Door { at: dungeon.exit_door(), facing: dungeon.way_in.side.opposite().bearing() };
    let onward = onward(dungeon, onward_count, way_in.at);
    let lamp = if zone.has_lamp() { lamp(dungeon, arrive) } else { None };
    let clear = |place: [f64; 2]| {
        lamp.is_none_or(|lamp| apart(lamp, place) >= LAMP_CLEAR_M)
            && onward.iter().chain([&way_in]).all(|door| apart(door.at, place) >= SPOT_APART_M / 2.0)
    };
    let mut middles: Vec<(u32, [f64; 2])> = dungeon
        .rooms
        .iter()
        .enumerate()
        .filter(|(number, _)| *number != dungeon.way_in.room)
        .map(|(_, room)| {
            let cells = if room.quiet.is_empty() { &room.cells } else { &room.quiet };
            // A band stands on open floor: the middle of the room's cells no prop, fixture or landmark fills.
            let open: Vec<usize> = cells.iter().copied().filter(|&cell| !dungeon.holds_solid(cell)).collect();
            let cells = if open.is_empty() { cells } else { &open };
            let middle = cells.get(cells.len() / 2).map_or([0.0, 0.0], |&cell| dungeon.centre(cell));
            (room.walk, middle)
        })
        .collect();
    middles.sort_by(|one, other| one.0.cmp(&other.0).then(one.1[0].total_cmp(&other.1[0])));
    let off_way_in = |place: &[f64; 2]| apart(*place, arrive) >= POST_OFF_WAY_IN_M;
    let posts = spread(middles.into_iter().map(|(_, at)| at).filter(off_way_in).filter(|at| clear(*at)), SPOT_APART_M);
    let mut floor: Vec<[f64; 2]> = dungeon
        .rooms
        .iter()
        .flat_map(|room| if room.quiet.is_empty() { room.cells.iter() } else { room.quiet.iter() })
        // A deal's thing stands on open floor, never in a prop, a fixture or a landmark.
        .filter(|&&cell| !dungeon.holds_solid(cell))
        .map(|&cell| dungeon.centre(cell))
        .filter(|at| clear(*at))
        .collect();
    floor.sort_by(|one, other| apart(*other, arrive).total_cmp(&apart(*one, arrive)).then(one[0].total_cmp(&other[0])));
    // A Hold's ring, the first spot's, stands where most of it lies on the floor, the farthest such from the way in.
    if zone.deal == Deal::Mission(Mission::Hold)
        && let Some(best) = {
            // Each spot's ring judged once: whether it is whole on the floor, and how much of it lies there.
            let whole: Vec<(bool, f64)> =
                floor.iter().map(|&at| (ring_clear(dungeon, at), ring_on_floor(dungeon, at))).collect();
            (0..floor.len()).max_by(|&one, &other| {
                let ((one_whole, one_share), (other_whole, other_share)) = (whole[one], whole[other]);
                one_whole.cmp(&other_whole).then(one_share.total_cmp(&other_share)).then(other.cmp(&one))
            })
        }
    {
        let ring = floor.remove(best);
        floor.insert(0, ring);
    }
    let spots = spots_of(&floor, crate::plan::spots_wanted(zone.deal));
    Sites { arrive, facing, way_in, onward, lamp, posts, spots }
}

/// The share of a Hold's ring round `middle`, sampled every 10 degrees, that lies on a cell of the dungeon's floor.
fn ring_on_floor(dungeon: &Dungeon, middle: [f64; 2]) -> f64 {
    let cell_of = |at: [f64; 2]| ((at[0] / CELL_M).floor() as i64, (at[1] / CELL_M).floor() as i64);
    let floor: std::collections::BTreeSet<(i64, i64)> =
        dungeon.rooms.iter().flat_map(|room| room.cells.iter()).map(|&cell| cell_of(dungeon.centre(cell))).collect();
    let on = (0..36_u32).filter(|step| {
        let turn = f64::from(*step) * std::f64::consts::TAU / 36.0;
        let radius = crate::plan::RING_M;
        floor.contains(&cell_of([middle[0] + radius * libm::sin(turn), middle[1] - radius * libm::cos(turn)]))
    });
    on.count() as f64 / 36.0
}

/// Whether a Hold's ring round `middle` lies whole on the floor of the dungeon's rooms: no rock or corridor cell, and
/// no edge of the dungeon, comes within `RING_M` of its middle.
pub(crate) fn ring_clear(dungeon: &Dungeon, middle: [f64; 2]) -> bool {
    let (radius, half) = (crate::plan::RING_M, CELL_M / 2.0);
    let within = |at: f64, cells: usize| at - radius >= 0.0 && at + radius <= cells as f64 * CELL_M;
    if !within(middle[0], dungeon.columns) || !within(middle[1], dungeon.rows) {
        return false;
    }
    let near = |cell: usize| {
        let [x, y] = dungeon.centre(cell);
        libm::hypot((middle[0] - x).abs().max(half) - half, (middle[1] - y).abs().max(half) - half)
    };
    (0..dungeon.cells.len()).all(|cell| matches!(dungeon.cells[cell], Cell::Room(_)) || near(cell) >= radius)
}
