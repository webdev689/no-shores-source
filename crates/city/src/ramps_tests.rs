use super::*;
use crate::grid::{Grid, SIDE_CELLS};
use crate::walls::cut;

/// The middle cell (35, 35) the landmark's at 87 m; east of it an avenue's head at 52.25 m, then north 42, then 41.8
/// (a rise too small to ramp); a second avenue from the east (41 m) shares the head's edge. The plaza stands
/// north-west, over the landmark's north side, so the switchback's top is at the head's north end.
struct Town {
    grid: Grid,
    footings: Vec<Footing>,
    uses: Vec<Use>,
    avenues: Vec<Vec<(usize, usize)>>,
}

const LANDMARK: (usize, usize) = (35, 35);
const HEAD: (usize, usize) = (36, 35);
const NORTH: (usize, usize) = (36, 34);
const FAR_NORTH: (usize, usize) = (36, 33);
const EAST: (usize, usize) = (37, 34);
const PLAZA: [f64; 4] = [-130.0, -170.0, 40.0, -50.0];
const BASE: [f64; 4] = [-50.0, -50.0, 50.0, 50.0];

fn town() -> Town {
    let mut footings = vec![Footing::Outside; SIDE_CELLS * SIDE_CELLS];
    let mut uses = vec![Use::Open; SIDE_CELLS * SIDE_CELLS];
    for (cell, level, used) in [
        (LANDMARK, 87.0, Use::Landmark),
        (HEAD, 52.25, Use::Avenue),
        (NORTH, 42.0, Use::Avenue),
        (FAR_NORTH, 41.8, Use::Avenue),
        (EAST, 41.0, Use::Avenue),
    ] {
        footings[index(cell.0, cell.1)] = Footing::Level { level };
        uses[index(cell.0, cell.1)] = used;
    }
    let avenues = vec![vec![FAR_NORTH, NORTH, HEAD, LANDMARK], vec![EAST, NORTH, HEAD, LANDMARK]];
    Town { grid: Grid::round([0.0, 0.0]), footings, uses, avenues }
}

fn laid(town: &Town) -> Laid {
    lay(&Avenues {
        grid: &town.grid,
        footings: &town.footings,
        uses: &town.uses,
        avenues: &town.avenues,
        platform: 87.0,
        plaza: PLAZA,
        over: &[BASE],
        harbour: None,
    })
}

fn of(laid: &Laid, piece: Piece) -> Vec<Ramp> {
    laid.ramps.iter().copied().filter(|ramp| ramp.piece == piece).collect()
}

fn holds(bounds: [f64; 4], x: f64, y: f64) -> bool {
    x >= bounds[0] && x <= bounds[2] && y >= bounds[1] && y <= bounds[3]
}

fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

#[test]
fn a_ramp_runs_the_roads_width_along_it_centred_on_the_two_cells_edge() {
    let town = town();
    let laid = laid(&town);
    let edge = town.grid.bounds(HEAD.0, HEAD.1)[1];
    let road = town.grid.centre(HEAD.0, HEAD.1)[0];
    let ramp = of(&laid, Piece::Ramp).into_iter().find(|ramp| holds(ramp.pad.bounds, road, edge)).expect("the ramp");
    // 10.25 m of rise wants 61.5 m of run: half of it into each cell, its walls either side of the road.
    let [west, north, east, south] = ramp.pad.bounds;
    assert!(close(west, road - ROAD_M / 2.0 - WALL_M) && close(east, road + ROAD_M / 2.0 + WALL_M), "{west} {east}");
    assert!(close(north, edge - 30.75) && close(south, edge + 30.75), "{north} {south}");
    assert_eq!((ramp.pad.level, ramp.pad.fall), (42.0, Some(Fall::South(52.25))));
    assert!(close(ramp.slope, 10.25 / 61.5));
    let expected = [[road, edge + 30.75, 52.25], [road, edge - 30.75, 42.0]];
    assert!(ramp.line.iter().flatten().zip(expected.iter().flatten()).all(|(&a, &b)| close(a, b)), "{:?}", ramp.line);
}

#[test]
fn a_rise_under_half_a_metre_has_no_ramp_a_small_one_the_shortest_and_a_shared_edge_one_ramp() {
    let town = town();
    let laid = laid(&town);
    let ramps = of(&laid, Piece::Ramp);
    assert_eq!(ramps.len(), 2, "north to head, once for both avenues, and east to north: {ramps:?}");
    let short = ramps.iter().find(|ramp| ramp.pad.fall == Some(Fall::East(41.0))).expect("east to north");
    assert!(close(short.pad.bounds[2] - short.pad.bounds[0], SHORTEST_M) && close(short.pad.level, 42.0));
    let between = |a: (usize, usize), b: (usize, usize)| {
        let [x, y] = [town.grid.centre(a.0, a.1), town.grid.centre(b.0, b.1)];
        ramps.iter().any(|ramp| holds(ramp.pad.bounds, (x[0] + y[0]) / 2.0, (x[1] + y[1]) / 2.0))
    };
    assert!(!between(FAR_NORTH, NORTH), "0.2 m of rise is walked on the pads' blend");
}

#[test]
fn every_ramp_leaves_each_cells_middle_flat() {
    let town = town();
    for ramp in of(&laid(&town), Piece::Ramp) {
        for cell in [HEAD, NORTH, FAR_NORTH, EAST] {
            let [x, y] = town.grid.centre(cell.0, cell.1);
            let half = ROAD_M / 2.0;
            let [west, north, east, south] = ramp.pad.bounds;
            assert!(
                !(east > x - half && west < x + half && south > y - half && north < y + half),
                "{ramp:?} reaches {cell:?}'s middle"
            );
        }
        let run = (ramp.pad.bounds[2] - ramp.pad.bounds[0]).max(ramp.pad.bounds[3] - ramp.pad.bounds[1]);
        assert!((SHORTEST_M - 1e-9..=LONGEST_M + 1e-9).contains(&run));
    }
}

#[test]
fn a_switchback_climbs_the_platforms_wall_in_odd_legs_with_flat_landings_from_the_road_to_the_top() {
    let town = town();
    let laid = laid(&town);
    let [wall, north, _, _] = town.grid.bounds(HEAD.0, HEAD.1);
    let legs = of(&laid, Piece::Leg);
    // 34.75 m of rise in three legs of at most 12 m, each 10 m wide and at most 64 m long, side by side from the wall.
    assert_eq!(legs.len(), 3);
    for leg in &legs {
        let [west, top, east, bottom] = leg.pad.bounds;
        let rise = leg.line[0][2] - leg.line[1][2];
        assert!(close(rise, 34.75 / 3.0) && rise <= LEG_RISE_M, "{leg:?}");
        assert!(close(east - west, LEG_M) && bottom - top <= LONGEST_M && close(leg.slope, rise / (bottom - top)));
        assert!(west >= wall - 1e-9 && east <= wall + STAIR_BAND_M + 1e-9);
    }
    let landings = of(&laid, Piece::Landing);
    let (foot, turns) = landings.split_first().expect("the foot's landing first");
    // Each turn's landing a leg's width deep, across the two legs it joins; the top one a leg's width square.
    assert_eq!(turns.len(), 3);
    for (landing, wide) in turns.iter().zip([2.0, 2.0, 1.0]) {
        let [west, top, east, bottom] = landing.pad.bounds;
        assert!(close(east - west, wide * LEG_M) && close(bottom - top, LEG_M), "{landing:?}");
        assert!(landing.pad.fall.is_none() && landing.slope == 0.0);
    }
    // The top landing at the platform's level, against the wall at its end nearest the plaza.
    let top = landings.last().expect("the top landing");
    assert_eq!(top.pad.level, 87.0);
    assert!(close(top.pad.bounds[0], wall) && close(top.pad.bounds[1], north));
    // The foot on the ground, at the far end of the run, reaching across to the road's flank.
    assert_eq!((foot.pad.level, foot.pad.fall), (52.25, None));
    assert!(close(foot.pad.bounds[2], wall + (CELL_M - ROAD_M) / 2.0) && close(foot.pad.bounds[3], north + 70.4));
    // From the foot to the top each piece's line starts where the one below it ends, on the same level.
    let pieces: Vec<&Ramp> = laid.ramps.iter().filter(|ramp| ramp.piece != Piece::Ramp).collect();
    for pair in pieces.windows(2) {
        let (below, above) = (pair[0].line[0], pair[1].line[1]);
        let (east, south) = (below[0] - above[0], below[1] - above[1]);
        let gap = (east * east + south * south).sqrt();
        assert!(gap <= LEG_M / 2.0 + 1e-9 && close(below[2], above[2]), "{:?} then {:?}", pair[0], pair[1]);
    }
}

#[test]
fn the_platforms_parapet_opens_over_the_top_landing_alone() {
    let town = town();
    let laid = laid(&town);
    let [wall, north, _, south] = town.grid.bounds(HEAD.0, HEAD.1);
    let opened: Vec<&Cut> = laid.cuts.iter().filter(|cut| cut.top.is_some()).collect();
    assert_eq!(opened.len(), 1);
    let cut = opened[0];
    assert!(cut.north_south && close(cut.middle[0], wall) && close(cut.middle[1], (north + south) / 2.0));
    assert!(close(cut.span[0], north) && close(cut.span[1], north + LEG_M) && cut.top == Some(87.0));
}

#[test]
fn a_cut_splits_the_wall_on_its_edge_round_its_span_and_leaves_every_other() {
    let wall = Solid::upright(Shape::Block, [0.0, 0.0, 40.0], [CELL_M, 1.2, 13.0], Material::Stone);
    let other = Solid::upright(Shape::Block, [0.0, 102.4, 40.0], [CELL_M, 1.2, 13.0], Material::Stone);
    let through = Cut { middle: [0.0, 0.0], north_south: false, span: [-20.4, 20.4], top: None };
    let kept = cut(vec![wall, other], &[through]);
    assert_eq!(kept.len(), 3);
    assert!(kept.contains(&other));
    let spans: Vec<[f64; 2]> =
        kept[..2].iter().map(|piece| [piece.at[0] - piece.size[0] / 2.0, piece.at[0] + piece.size[0] / 2.0]).collect();
    assert!(close(spans[0][0], -51.2) && close(spans[0][1], -20.4) && close(spans[1][0], 20.4));
    assert!(close(spans[1][1], 51.2) && kept[..2].iter().all(|piece| piece.size[2] == 13.0));
    let lowered = cut(vec![wall], &[Cut { top: Some(50.0), ..through }]);
    assert_eq!(lowered.len(), 3);
    assert!(close(lowered[1].size[0], 40.8) && close(lowered[1].at[2] + lowered[1].size[2], 50.0));
}

#[test]
fn every_wall_stands_on_its_ramps_and_every_sloped_top_follows_the_way_it_guards() {
    let town = town();
    let laid = laid(&town);
    for wall in &laid.works {
        let [west, north, east, south, _, _] = wall.bounds();
        let middle = [(west + east) / 2.0, (north + south) / 2.0];
        assert!(laid.ramps.iter().any(|ramp| holds(ramp.pad.bounds, middle[0], middle[1])), "{wall:?} off the ramps");
    }
    // A leaned block's top runs along the way it stands on, flush with it (under the parapet) or a parapet over it,
    // the same at both its ends; on every leg and ramp, both.
    let sloped: Vec<Ramp> = laid.ramps.iter().copied().filter(|ramp| ramp.slope > 0.0).collect();
    let mut parapets = 0;
    for leaned in laid.works.iter().filter(|wall| wall.lean != 0.0) {
        let over = [-0.5, 0.5].map(|end| {
            let [x, y, z] = leaned.place([0.0, end * leaned.size[1], leaned.size[2]]);
            let way = sloped.iter().find(|ramp| holds(ramp.pad.bounds, x, y));
            z - way.map_or(f64::NAN, |ramp| ramp.pad.level_at(x, y))
        });
        assert!((over[0] - over[1]).abs() < 1e-6, "{leaned:?}: {over:?}");
        assert!(over[0].abs() < 1e-6 || (over[0] - PARAPET_M).abs() < 1e-6, "{leaned:?}: {over:?}");
        parapets += usize::from(over[0] > 0.5);
    }
    assert!(parapets >= sloped.len(), "{parapets} parapets for {} sloped ways", sloped.len());
}

/// A harbour avenue's first cell at 5 m, with a pier's root 3.7 m off its north edge, and the quay past it.
fn harbour_flights(roots: Vec<[f64; 2]>, quay: Vec<[f64; 2]>) -> (Grid, Laid) {
    let start = (36, 30);
    let mut footings = vec![Footing::Outside; SIDE_CELLS * SIDE_CELLS];
    let mut uses = vec![Use::Open; SIDE_CELLS * SIDE_CELLS];
    for cell in [start, (36, 31)] {
        footings[index(cell.0, cell.1)] = Footing::Level { level: 5.0 };
        uses[index(cell.0, cell.1)] = Use::Avenue;
    }
    let grid = Grid::round([0.0, 0.0]);
    let avenues = vec![vec![start, (36, 31)]];
    let laid = lay(&Avenues {
        grid: &grid,
        footings: &footings,
        uses: &uses,
        avenues: &avenues,
        platform: 87.0,
        plaza: PLAZA,
        over: &[BASE],
        harbour: Some(Harbour { avenue: 0, roots, quay }),
    });
    (grid, laid)
}

#[test]
fn the_harbour_avenue_runs_down_a_flight_from_its_first_cells_middle_onto_the_quay_at_the_nearest_pier() {
    let grid = Grid::round([0.0, 0.0]);
    let [west, north, _, _] = grid.bounds(36, 30);
    let root = [west + 20.0, north - 3.7];
    let (_, laid) = harbour_flights(vec![root, [west + 60.0, north - 40.0]], vec![]);
    let flight = laid.ramps.first().expect("the flight");
    let [left, top, right, bottom] = flight.pad.bounds;
    assert!(close(right - left, PIER_M + 2.0 * WALL_M) && close((left + right) / 2.0, root[0]));
    assert!(close(top, root[1]) && close(bottom, north + (CELL_M - ROAD_M) / 2.0), "{:?}", flight.pad);
    assert_eq!((flight.pad.level, flight.pad.fall), (QUAY_TOP_M, Some(Fall::South(5.0))));
    assert!(
        flight.slope <= 1.0 / RUN_PER_RISE && close(flight.line[1][2], QUAY_TOP_M) && close(flight.line[1][1], root[1])
    );
    let cut = laid.cuts.iter().find(|cut| close(cut.middle[1], north)).expect("the cell's edge cut");
    assert!(!cut.north_south && cut.top.is_none() && close(cut.span[0], left) && close(cut.span[1], right));
    // The walls stand on the flight, parapeted where it runs out over the shore.
    assert!(laid.works.iter().all(|wall| {
        let [west, north, east, south, _, _] = wall.bounds();
        holds(flight.pad.bounds, (west + east) / 2.0, (north + south) / 2.0)
    }));
}

#[test]
fn with_no_pier_in_reach_the_flight_lands_on_the_quays_nearest_point_and_with_the_quay_inside_none() {
    let grid = Grid::round([0.0, 0.0]);
    let [west, north, _, _] = grid.bounds(36, 30);
    let quay: Vec<[f64; 2]> =
        (0..100).map(|step| [west + f64::from(step), north - 8.0 - f64::from(step) * 0.1]).collect();
    let (_, laid) = harbour_flights(vec![[west + 50.0, north - 90.0]], quay);
    let flight = laid.ramps.first().expect("the flight");
    assert!(close(flight.pad.bounds[1], north - 8.0 - 0.1 * (PIER_M / 2.0 + WALL_M).ceil()), "{:?}", flight.pad);
    let (_, none) = harbour_flights(vec![[west + 50.0, north + 10.0]], vec![]);
    assert!(none.ramps.iter().all(|ramp| ramp.line[1][2] != QUAY_TOP_M));
}
