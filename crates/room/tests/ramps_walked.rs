//! Overlook's road to the sea as the planner lays it, walked by the movement rules: from out on the pier, onto the
//! quay, up the harbour avenue's flight and its ramps terrace by terrace, and up the switchback at its head to the
//! platform's level, never stepping more than the rules step nor leaving the ramps' walls; and the terraces' walls
//! open only where a ramp crosses them.

use city::grid::{SIDE_CELLS, index};
use city::ramps::{Piece, Ramp};
use city::solids::Solid;
use city::terraces::Footing;
use movement::{Block, Body, Controls, Mode, TICK_SECONDS, TUNING, standing, step_body};
use room::Floor;
use std::path::Path;
use std::sync::OnceLock;

/// How near a waypoint a body counts as there, metres.
const THERE_M: f64 = 1.0;

struct Overlook {
    plan: city::Plan,
    floor: Floor,
    blocks: Vec<Block>,
    /// The harbour avenue's cells, from its first to the landmark's.
    avenue: Vec<(usize, usize)>,
}

fn overlook() -> &'static Overlook {
    static LAID: OnceLock<Overlook> = OnceLock::new();
    LAID.get_or_init(|| {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let read =
            |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
        let id = "continent-1";
        let layout = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
        let continent = layout.continents.into_iter().find(|continent| continent.id == id).expect("the continent");
        let edits = land::edits::parse(&read(&format!("content/world/land/{id}.json"))).expect("the edits parse");
        let blocks = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
        let mut landmass = land::landmass::generate(&continent, edits).expect("the continent generates");
        let plan = city::settle(&mut landmass, &blocks).expect("its city settles").expect("Overlook");
        let mut footings = vec![Footing::Outside; SIDE_CELLS * SIDE_CELLS];
        for cell in &plan.cells {
            footings[index(cell.column, cell.row)] = cell.footing;
        }
        let harbour = plan.harbour.expect("Overlook has a harbour");
        let start = city::ways::built_cell_near(&plan.grid, &footings, harbour).expect("a cell by the harbour");
        let avenue = city::ways::avenue(&footings, start).expect("the harbour's avenue");
        let [west, north, east, south] = plan.grid.bounds(start.0, start.1);
        let reach = [west - 400.0, north - 400.0, east + 400.0, south + 800.0];
        let blocks = city::collision::boxes_within(&plan, reach)
            .into_iter()
            .map(|[min_x, min_y, max_x, max_y, top, bottom]| Block { min_x, min_y, max_x, max_y, top, bottom })
            .collect();
        Overlook { floor: Floor::Land(Box::new(landmass.surface.clone())), blocks, avenue, plan }
    })
}

fn holds(bounds: [f64; 4], x: f64, y: f64) -> bool {
    x >= bounds[0] && x <= bounds[2] && y >= bounds[1] && y <= bounds[3]
}

fn centre_of(town: &Overlook, (column, row): (usize, usize)) -> [f64; 2] {
    town.plan.grid.centre(column, row)
}

/// The ramp across the edge between two cells of the avenue, if they stand apart.
fn ramp_between(town: &Overlook, a: (usize, usize), b: (usize, usize)) -> Option<Ramp> {
    let ([ax, ay], [bx, by]) = (centre_of(town, a), centre_of(town, b));
    let edge = [(ax + bx) / 2.0, (ay + by) / 2.0];
    town.plan.ramps.iter().copied().find(|ramp| ramp.piece == Piece::Ramp && holds(ramp.pad.bounds, edge[0], edge[1]))
}

/// The harbour avenue's flight from its first cell down to the quay.
fn flight(town: &Overlook) -> Ramp {
    let [west, north, east, south] = town.plan.grid.bounds(town.avenue[0].0, town.avenue[0].1);
    let quay = city::walls::QUAY_TOP_M;
    let found = town.plan.ramps.iter().find(|ramp| {
        let [x, y, _] = ramp.line[0];
        ramp.line[1][2] == quay && x > west && x < east && y > north && y < south
    });
    *found.expect("the harbour avenue's flight down to the quay")
}

/// The pier the harbour avenue's flight runs down to, and its root on the quay.
fn pier(town: &Overlook) -> (Solid, [f64; 2]) {
    let flight = flight(town);
    let foot = [flight.line[1][0], flight.line[1][1]];
    town.plan
        .works
        .iter()
        .filter(|solid| solid.material == city::solids::Material::Timber)
        .map(|pier| {
            let [x, y, _] = pier.place([0.0, -pier.size[1] / 2.0, 0.0]);
            (*pier, [x, y])
        })
        .min_by(|a, b| {
            let off =
                |root: [f64; 2]| (root[0] - foot[0]) * (root[0] - foot[0]) + (root[1] - foot[1]) * (root[1] - foot[1]);
            off(a.1).total_cmp(&off(b.1))
        })
        .expect("Overlook's piers")
}

/// The harbour avenue's way from 20 m out on the pier to inside the platform's edge: the pier's root, the flight,
/// each terrace's middle with the ramp across each step, and the switchback from its foot to its top.
fn waypoints(town: &Overlook) -> Vec<[f64; 2]> {
    let (pier, root) = pier(town);
    let out = pier.place([0.0, -pier.size[1] / 2.0 + 20.0, 0.0]);
    let flight = flight(town);
    let mut points = vec![[out[0], out[1]], root];
    let up = |ramp: &Ramp, points: &mut Vec<[f64; 2]>| {
        points.extend([ramp.line[1], ramp.line[0]].map(|[x, y, _]| [x, y]));
    };
    up(&flight, &mut points);
    let head = town.avenue.iter().position(|&(column, row)| {
        town.plan.cells.iter().any(|cell| (cell.column, cell.row) == (column, row) && cell.used == city::Use::Landmark)
    });
    let head = head.expect("the avenue reaches the landmark") - 1;
    for pair in town.avenue[..=head].windows(2) {
        points.push(centre_of(town, pair[0]));
        if let Some(ramp) = ramp_between(town, pair[0], pair[1]) {
            // Up the ramp, whichever way it runs.
            if ramp.line[0][2] > ramp.line[1][2] {
                up(&ramp, &mut points);
            }
        }
    }
    points.push(centre_of(town, town.avenue[head]));
    let cell = town.plan.grid.bounds(town.avenue[head].0, town.avenue[head].1);
    let inside = |ramp: &&Ramp| {
        let [west, north, east, south] = ramp.pad.bounds;
        west >= cell[0] - 1e-6 && east <= cell[2] + 1e-6 && north >= cell[1] - 1e-6 && south <= cell[3] + 1e-6
    };
    let stair: Vec<&Ramp> = town.plan.ramps.iter().filter(|ramp| ramp.piece != Piece::Ramp).filter(inside).collect();
    assert!(stair.iter().any(|ramp| ramp.piece == Piece::Leg), "the head's switchback");
    for piece in stair {
        up(piece, &mut points);
    }
    // Off the top landing onto the platform.
    let [x, y, _] = points.last().map(|&[x, y]| [x, y, 0.0]).expect("a way");
    let landmark = centre_of(town, town.avenue[head + 1]);
    let (east, south) = (landmark[0] - x, landmark[1] - y);
    let length = (east * east + south * south).sqrt();
    points.push([x + east / length * 8.0, y + south / length * 8.0]);
    points
}

/// Every body of a walk through the waypoints, steering at each tick toward the next, and how many it passed.
fn walked(town: &Overlook, waypoints: &[[f64; 2]], seconds: f64) -> (Vec<Body>, usize) {
    // On the pier's deck: from the ground under it a body would only see the pier as a wall.
    let mut body = Body { z: city::walls::QUAY_TOP_M, ..standing(waypoints[0][0], waypoints[0][1]) };
    let mut bodies = vec![body];
    let mut next = 1;
    for _ in 0..(seconds / TICK_SECONDS) as usize {
        let Some(target) = waypoints.get(next) else { break };
        let (east, south) = (target[0] - body.x, target[1] - body.y);
        if (east * east + south * south).sqrt() < THERE_M {
            next += 1;
            continue;
        }
        let controls = Controls { forward: 1.0, yaw: libm::atan2(east, -south), ..Controls::default() };
        body = step_body(&body, &controls, &town.blocks, &town.floor, TICK_SECONDS);
        bodies.push(body);
        if body.mode != Mode::Ground {
            break;
        }
    }
    (bodies, next)
}

#[test]
fn a_body_walks_from_the_pier_up_the_harbour_avenue_and_its_switchback_to_the_platform() {
    let town = overlook();
    let points = waypoints(town);
    let (bodies, passed) = walked(town, &points, 900.0);
    let end = bodies[bodies.len() - 1];
    assert_eq!(
        passed,
        points.len(),
        "the body stops at {:.1},{:.1} {:.2} m up, {:?}, short of {:?}",
        end.x,
        end.y,
        end.z,
        end.mode,
        points.get(passed)
    );
    let level = town.plan.pads.last().expect("the base's pad").level;
    assert!((end.z - level).abs() < 0.05, "it ends {:.2} m up, the platform is at {level}", end.z);
    assert!(bodies[0].z <= city::walls::QUAY_TOP_M + 0.01, "it starts on the pier: {:.2}", bodies[0].z);
    for pair in bodies.windows(2) {
        let (from, to) = (pair[0], pair[1]);
        assert!(to.z - from.z <= TUNING.step, "a step of {:.2} m at {:.1},{:.1}", to.z - from.z, to.x, to.y);
        assert_eq!(to.mode, Mode::Ground, "at {:.1},{:.1} {:.2} m up", to.x, to.y, to.z);
        // On a ramp it walks the ramp's own way, never up on one of its walls.
        if let Some(ramp) = town.plan.ramps.iter().find(|ramp| holds(ramp.pad.bounds, to.x, to.y)) {
            let way = ramp.pad.level_at(to.x, to.y);
            assert!(
                (to.z - way).abs() < 0.05,
                "{:.2} m over the way at {:.1},{:.1} on {ramp:?}",
                to.z - way,
                to.x,
                to.y
            );
        }
    }
}

#[test]
fn the_harbour_avenues_terrace_walls_open_only_where_its_ramps_cross() {
    let town = overlook();
    for pair in town.avenue.windows(2) {
        let Some(ramp) = ramp_between(town, pair[0], pair[1]) else { continue };
        let ([ax, ay], [bx, by]) = (centre_of(town, pair[0]), centre_of(town, pair[1]));
        let edge = [(ax + bx) / 2.0, (ay + by) / 2.0];
        let north_south = ax != bx;
        let half = city::grid::CELL_M / 2.0;
        let along = if north_south { edge[1] } else { edge[0] };
        // The walls standing on the shared edge, and what of the edge they cover.
        let on_edge: Vec<[f64; 2]> = town
            .plan
            .works
            .iter()
            .filter(|wall| wall.lean == 0.0 && wall.turn == 0.0)
            .filter(|wall| {
                let (line, middle) =
                    if north_south { (wall.at[0] - edge[0], wall.at[1]) } else { (wall.at[1] - edge[1], wall.at[0]) };
                line.abs() < 1e-6 && (middle - along).abs() < half
            })
            .map(|wall| {
                let (middle, length) =
                    if north_south { (wall.at[1], wall.size[1]) } else { (wall.at[0], wall.size[0]) };
                [middle - length / 2.0, middle + length / 2.0]
            })
            .collect();
        let [west, north, east, south] = ramp.pad.bounds;
        let gap = if north_south { [north, south] } else { [west, east] };
        let mut covered = on_edge.clone();
        covered.sort_by(|a, b| a[0].total_cmp(&b[0]));
        assert_eq!(covered.len(), 2, "{pair:?}: the wall either side of the ramp, {covered:?}");
        let close = |a: f64, b: f64| (a - b).abs() < 1e-6;
        assert!(close(covered[0][0], along - half) && close(covered[0][1], gap[0]), "{pair:?}: {covered:?} {gap:?}");
        assert!(close(covered[1][0], gap[1]) && close(covered[1][1], along + half), "{pair:?}: {covered:?} {gap:?}");
    }
}
