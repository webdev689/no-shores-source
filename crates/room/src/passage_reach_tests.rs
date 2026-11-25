//! Every passage zone can be played: from its arrival, a body walks by the room's own ground and blocks to within use
//! of each thing its deal asks a player to reach (the ring, the far mouth, the lamp, the dead lamps, every onward
//! mouth) and to within a blow of every foe it stands.

use super::passage_asks::{HOLD_REACH_M, MOUTH_REACH_M};
use super::passage_deal::{REACHED_M, RING_M};
use crate::Room;
use passage::{Deal, Mission, PieceKind, Plan, Web};

/// How near a foe a body comes to strike it: a blow's reach and the foe's half-width, metres.
const BLOW_M: f64 = combat::tuning::PLAYER_REACH + movement::TUNING.radius;

/// The grid a body's walk is flooded over, metres a square.
const WALK_STEP_M: f64 = 0.5;

/// Every square a body walks to from the arrival, by the room's own ground (its walls, and no rise past a step from
/// square to square) and its blocks (one taller than a step over the floor is a wall, held off by the body's
/// half-width): the room's bounds, its columns, and for each square the one it was first walked to from (the start
/// its own, NONE for a square not reached), nearest first.
fn walked(room: &Room, from: [f64; 2]) -> ([f64; 2], usize, Vec<usize>) {
    let ring = &room.section.as_ref().expect("a section").ring;
    let low = ring.iter().fold([f64::MAX; 2], |low, at| [low[0].min(at[0]), low[1].min(at[1])]);
    let high = ring.iter().fold([f64::MIN; 2], |high, at| [high[0].max(at[0]), high[1].max(at[1])]);
    let (columns, rows) =
        (((high[0] - low[0]) / WALK_STEP_M) as usize + 1, ((high[1] - low[1]) / WALK_STEP_M) as usize + 1);
    let point = |square: usize| {
        [low[0] + (square % columns) as f64 * WALK_STEP_M, low[1] + (square / columns) as f64 * WALK_STEP_M]
    };
    let floor = |at: [f64; 2]| movement::Terrain::height_at(&room.floor, at[0], at[1]);
    let radius = movement::TUNING.radius;
    let blocked = |at: [f64; 2]| {
        room.blocks.iter().any(|block| {
            block.top - floor(at) > movement::TUNING.step
                && block.bottom <= floor(at) + 0.1
                && at[0] > block.min_x - radius
                && at[0] < block.max_x + radius
                && at[1] > block.min_y - radius
                && at[1] < block.max_y + radius
        })
    };
    let index =
        |at: f64, start: f64, count: usize| (((at - start) / WALK_STEP_M).round().max(0.0) as usize).min(count - 1);
    // From the free square nearest `from`, as a body pushed into a block steps out of it.
    let (row, column) = (index(from[1], low[1], rows), index(from[0], low[0], columns));
    let around = (row.saturating_sub(4)..(row + 5).min(rows)).flat_map(|row| {
        (column.saturating_sub(4)..(column + 5).min(columns)).map(move |column| row * columns + column)
    });
    let off = |square: usize| libm::hypot(point(square)[0] - from[0], point(square)[1] - from[1]);
    let free = around.filter(|&square| !blocked(point(square))).min_by(|&one, &two| off(one).total_cmp(&off(two)));
    let first = free.unwrap_or(row * columns + column);
    let mut parents = vec![NONE; columns * rows];
    parents[first] = first;
    let mut queue = std::collections::VecDeque::from([first]);
    while let Some(square) = queue.pop_front() {
        let (column, row) = (square % columns, square / columns);
        let beside = [
            (column > 0).then(|| square - 1),
            (column + 1 < columns).then(|| square + 1),
            (row > 0).then(|| square - columns),
            (row + 1 < rows).then(|| square + columns),
        ];
        for next in beside.into_iter().flatten() {
            let (here, there) = (point(square), point(next));
            let step = floor(there) - floor(here);
            let walks = step <= movement::TUNING.step
                && !movement::Terrain::walled(&room.floor, (here[0], here[1]), (there[0], there[1]))
                && !blocked(there);
            if parents[next] == NONE && walks {
                parents[next] = square;
                queue.push_back(next);
            }
        }
    }
    (low, columns, parents)
}

/// No square walked from.
const NONE: usize = usize::MAX;

/// A body's way on foot from `from` to the square walked to nearest `to`, its points from the start, each on the
/// floor; none where nothing near `to` is walked to.
pub(crate) fn on_foot(room: &Room, from: [f64; 2], to: [f64; 2]) -> Option<Vec<[f64; 3]>> {
    let (low, columns, parents) = walked(room, from);
    let point = |square: usize| {
        let at = [low[0] + (square % columns) as f64 * WALK_STEP_M, low[1] + (square / columns) as f64 * WALK_STEP_M];
        [at[0], at[1], movement::Terrain::height_at(&room.floor, at[0], at[1])]
    };
    let apart = |square: usize| libm::hypot(point(square)[0] - to[0], point(square)[1] - to[1]);
    let reached = (0..parents.len()).filter(|&square| parents[square] != NONE);
    let mut square = reached.min_by(|&one, &two| apart(one).total_cmp(&apart(two)))?;
    let mut way = vec![point(square)];
    while parents[square] != square {
        square = parents[square];
        way.push(point(square));
    }
    way.reverse();
    Some(way)
}

/// What a zone's room asks to be reached that a body cannot walk to within use of from the arrival, each named.
pub(crate) fn unreached(room: &Room) -> Vec<String> {
    let Some(zone) = room.zone() else { return vec!["no zone".to_owned()] };
    let (low, columns, parents) = walked(room, zone.sites.arrive);
    let reached: Vec<bool> = parents.iter().map(|&parent| parent != NONE).collect();
    let mut wanted: Vec<(String, [f64; 2], f64)> = Vec::new();
    for (nth, door) in zone.sites.onward.iter().enumerate() {
        wanted.push((format!("onward mouth {nth}"), door.at, MOUTH_REACH_M));
    }
    match zone.zone.deal {
        Deal::Mission(Mission::Hold) => {
            wanted.extend(zone.sites.spots.first().map(|at| ("the ring".to_owned(), *at, RING_M)));
        }
        Deal::Mission(Mission::Gauntlet) => {
            wanted.extend(room.far_mouth().map(|at| ("the far mouth".to_owned(), at, REACHED_M)));
        }
        _ => {}
    }
    for piece in &zone.pieces {
        let name = match piece.kind {
            PieceKind::Lamp => "the lamp".to_owned(),
            PieceKind::Kindle(nth) => format!("dead lamp {nth}"),
            _ => continue,
        };
        wanted.push((name, [piece.at[0], piece.at[1]], HOLD_REACH_M));
    }
    for (id, foe) in &room.foes {
        wanted.push((format!("foe {id:?}"), [foe.fighter.body.x, foe.fighter.body.y], BLOW_M));
    }
    // Only the squares round each thing are looked at.
    let rows = reached.len() / columns;
    let near = |at: [f64; 2], within: f64| {
        let span = |middle: f64, start: f64, count: usize| {
            let first = ((middle - within - start) / WALK_STEP_M).floor().max(0.0) as usize;
            first..(((middle + within - start) / WALK_STEP_M).ceil().max(0.0) as usize + 1).min(count)
        };
        span(at[1], low[1], rows).any(|row| {
            span(at[0], low[0], columns).any(|column| {
                let point = [low[0] + column as f64 * WALK_STEP_M, low[1] + row as f64 * WALK_STEP_M];
                reached[row * columns + column] && libm::hypot(point[0] - at[0], point[1] - at[1]) <= within
            })
        })
    };
    wanted.into_iter().filter(|(_, at, within)| !near(*at, *within)).map(|(name, ..)| name).collect()
}

#[test]
fn every_zone_of_many_weeks_can_be_walked_to_all_its_deal_asks() {
    let island = passage::island("continent-1").expect("Saltmere's passages");
    let mut failed = Vec::new();
    for week in 2_900..2_912 {
        let web = Web::of(island, week);
        for zone in &web.zones {
            let Some(plan) = Plan::of(&web, zone.number) else { continue };
            let modifiers = gear::passages::week_modifiers("continent-1", week);
            let Some(room) = Room::passage(&plan, (1, 4), modifiers, ("continent-1", week, gear::dive::Route::Public))
            else {
                failed.push(format!("week {week} zone {}: no room", zone.number));
                continue;
            };
            let under = matches!(zone.ground, passage::Ground::Under { .. });
            for name in unreached(&room) {
                failed.push(format!("week {week} zone {} {:?} under {under}: {name}", zone.number, zone.deal));
            }
        }
    }
    assert!(failed.is_empty(), "{} unreached, the first: {:#?}", failed.len(), &failed[..failed.len().min(30)]);
}
