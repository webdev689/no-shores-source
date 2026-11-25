//! A zone under ground: the Forge's dungeon in the zone's style, laid in its size's blocks from its seed, with its
//! way in as the mouth behind, its onward mouths on rock walls of the rooms farthest along its way, its lamp in its
//! greatest room, its foes' posts in its rooms and its spots on their quiet floor.

use crate::sites::{Door, POST_OFF_WAY_IN_M, SPOT_APART_M, Sites, apart, spread};
use crate::zone::Zone;
use dungeon::{CELL_M, Cell, Dungeon, SIDES, Side};

/// The onward mouths' passes: how far from the way in each keeps, how far from one another (metres), and whether each
/// asks a room of its own, the first pass the most.
const PASSES: [(f64, f64, bool); 4] = [(16.0, 9.0, true), (16.0, 9.0, false), (12.0, 6.0, false), (9.0, 4.0, false)];
/// How far a mouth keeps from a torch, a prop, a fixture or a landmark, metres.
const MOUTH_CLEAR_M: f64 = 2.4;
/// How far a mouth stands off its wall, as the exit door does, metres.
const OFF_WALL_M: f64 = CELL_M / 2.0 - 0.02;
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
            let rock = dungeon.beside(cell, side).is_none_or(|next| dungeon.cells[next] == Cell::Rock);
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
/// cell nearest its middle.
fn lamp(dungeon: &Dungeon) -> Option<[f64; 2]> {
    let way_in_room = dungeon.way_in.room;
    let roomy = |room: &&dungeon::Room| room.width >= 3 && room.depth >= 3;
    let rooms = dungeon.rooms.iter().enumerate().filter(|(number, _)| *number != way_in_room);
    let (_, room) = rooms.max_by_key(|(number, room)| (roomy(room), room.cells.len(), usize::MAX - number))?;
    let middle =
        [(room.x as f64 + room.width as f64 / 2.0) * CELL_M, (room.y as f64 + room.depth as f64 / 2.0) * CELL_M];
    let cells = if room.quiet.is_empty() { &room.cells } else { &room.quiet };
    cells
        .iter()
        .map(|&cell| dungeon.centre(cell))
        .min_by(|one, other| apart(*one, middle).total_cmp(&apart(*other, middle)))
}

/// The zone laid under ground in its style, or none for a style the Forge does not know.
pub(crate) fn lay(zone: &Zone, style: &str, onward_count: usize) -> Option<(Dungeon, Sites)> {
    let style = dungeon::style_of(style)?;
    let blocks = zone.size.blocks();
    let dungeon = Dungeon::forge_within(zone.forge_seed(), style, (blocks, blocks));
    let (arrive, toward) = dungeon.arrival();
    let facing = libm::atan2(toward[0], -toward[1]);
    let way_in = Door { at: dungeon.exit_door(), facing: dungeon.way_in.side.opposite().bearing() };
    let onward = onward(&dungeon, onward_count, way_in.at);
    let lamp = if zone.has_lamp() { lamp(&dungeon) } else { None };
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
        .map(|&cell| dungeon.centre(cell))
        .filter(|at| clear(*at))
        .collect();
    floor.sort_by(|one, other| apart(*other, arrive).total_cmp(&apart(*one, arrive)).then(one[0].total_cmp(&other[0])));
    let spots = spread(floor, SPOT_APART_M);
    Some((dungeon, Sites { arrive, facing, way_in, onward, lamp, posts, spots }))
}
