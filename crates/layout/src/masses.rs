//! The rock masses a zone's claim holds: the massif left standing far from every floor, climb and run, and far inside
//! the claim's edge, where the bounds are. A mass wider than a fighting space there is dead ground in the middle of the
//! zone, so each is given a climb to a lookout on its top with a ruin beside it, or a valley floor across it.

use crate::carve::{climb_along, lookouts};
use crate::field::{CELL_M, Field, chamfer, distance};
use crate::paths::{off_line, segments_apart};
use crate::pieces::Kit;
use land::sculpts::{Sculpt, Sculpts};

/// The least a mass spreads to be dead ground, square metres: wider than a fighting space.
const LEAST_M2: f64 = 2500.0;
/// How far a dead mass lies from every floor, climb and run, and inside the claim's edge, metres.
const FROM_FLOORS_M: f64 = 150.0;
const FROM_EDGE_M: f64 = 120.0;
/// The masses are sought on every other cell of the field each way: 16 m apart.
const STRIDE: usize = 2;
/// How many dead masses a layout answers at the most.
const MOST_ANSWERS: usize = 5;
/// A valley's half-width, metres: a footpath's canyon.
const VALLEY_HALF_M: f64 = 11.0;
/// How far a mass's valley or climb keeps from the climbs already cut where it runs through the rock, past both their
/// edges, metres: three cliffs' runs, so rock stands between them.
const KEEP_OFF_M: f64 = 48.0;
/// How far a valley may run from a mass's middle to the floor it reaches, metres, at the most.
const VALLEY_REACH_M: f64 = 900.0;
/// How far from its lookout's middle a mass's ruin stands, and how far it keeps off every floor and climb, metres.
const RUIN_OUT_M: f64 = 24.0;
const RUIN_OFF_M: f64 = 12.0;

/// A rock mass: the field's cells it was found on (each standing for 16 m square), its middle (the point farthest from
/// every floor, climb and run) and how far it spreads.
#[derive(Debug, Clone, PartialEq)]
pub struct Mass {
    pub cells: Vec<usize>,
    pub middle: [f64; 2],
    pub area_m2: f64,
}

/// One answer to a dead mass: a climb and its lookout, or a valley floor.
enum Answer {
    Climb([[f64; 7]; 2]),
    Valley([f64; 5]),
}

/// Answers a layout's dead masses (the field's claim, the sculpt's floors, climbs and runs), the largest that can be
/// answered first, seeking them again after each answer, up to `MOST_ANSWERS`: a climb goes in among the lookouts' and a
/// valley among the floors. The climbs cut, so a ruin stands by each lookout.
pub fn reach_masses(field: &Field, sculpt: &mut Sculpt) -> Vec<[[f64; 7]; 2]> {
    let mut cut = Vec::new();
    for _ in 0..MOST_ANSWERS {
        let carved = Sculpts::from(vec![sculpt.clone()]);
        let mut masses = dead_masses(field, &carved, sculpt.rise);
        masses.sort_by(|first, second| second.area_m2.total_cmp(&first.area_m2));
        match masses.iter().find_map(|mass| answer(field, (sculpt, &carved), mass)) {
            Some(Answer::Climb(climb)) => {
                let at = 2 * lookouts(&sculpt.climbs).count();
                sculpt.climbs.splice(at..at, climb);
                cut.push(climb);
            }
            Some(Answer::Valley(valley)) => sculpt.floors.push(valley),
            None => break,
        }
    }
    cut
}

/// The answer that reaches the most of a mass: a climb if one leaves no dead mass of it, else the valley reaching most
/// of it, else the climb that does.
fn answer(field: &Field, (sculpt, carved): (&Sculpt, &Sculpts), mass: &Mass) -> Option<Answer> {
    let taken: Vec<[f64; 7]> = sculpt.climbs.iter().chain(&sculpt.runs).copied().collect();
    // Where a capsule runs through the rock, not on the floors a valley joins or a climb starts from, it keeps off the
    // climbs and runs; and all of it off the outcrops.
    let clear = |[from, to]: [[f64; 2]; 2], half: f64| {
        let steps = (distance(from, to) / CELL_M).ceil().max(1.0) as u32;
        let rock_clear = (0..=steps).all(|step| {
            let share = f64::from(step) / f64::from(steps);
            let at = [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share];
            carved.floor_distance(at[0], at[1]) <= 0.0
                || taken.iter().all(|capsule| {
                    off_line(at, [capsule[0], capsule[1]], [capsule[2], capsule[3]]) > capsule[4] + half + KEEP_OFF_M
                })
        });
        let off_outcrops = sculpt.outcrops.iter().all(|outcrop| {
            let (spine, reach) = outcrop.footprint();
            segments_apart([from, to], spine) > reach + half + 3.0
        });
        rock_clear && off_outcrops
    };
    // How much of the mass a capsule reaches, in its cells.
    let reaches = |capsules: &[[f64; 5]]| {
        let near = |at: usize| {
            let centre = field.centre(at % field.columns, at / field.columns);
            capsules.iter().any(|&[x1, y1, x2, y2, half]| off_line(centre, [x1, y1], [x2, y2]) <= FROM_FLOORS_M + half)
        };
        mass.cells.iter().filter(|&&at| near(at)).count()
    };
    // The floor reached from the mass's middle along a way, if the land on the way is in the claim (and walked).
    let floor_along = |way: [f64; 2], walked: bool| {
        let mut out = 0.0;
        while out < VALLEY_REACH_M {
            out += CELL_M;
            let at = [mass.middle[0] + way[0] * out, mass.middle[1] + way[1] * out];
            let (column, row) = field.cell_of(at[0], at[1])?;
            let cell = field.index(column, row);
            if !field.claimed[cell] {
                return None;
            }
            if carved.floor_distance(at[0], at[1]) <= 0.0 {
                // A floor, or a lookout's climb in the rock, which is no floor to join or climb from.
                let on_climb = lookouts(&sculpt.climbs)
                    .flatten()
                    .any(|climb| off_line(at, [climb[0], climb[1]], [climb[2], climb[3]]) <= climb[4] + CELL_M);
                return (!on_climb).then_some(at);
            }
            if walked && !field.walkable(cell) {
                return None;
            }
        }
        None
    };
    let headings = 16;
    let ways = (0..headings).map(|heading| {
        let (sine, cosine) = land::exact::sin_cos(std::f64::consts::TAU * f64::from(heading) / f64::from(headings));
        [sine, -cosine]
    });
    let climbs = ways.clone().filter_map(|way| {
        let start = floor_along(way, false)?;
        let climb = climb_along(field, carved, &taken, start, [-way[0], -way[1]], sculpt.rise)?;
        let [[x1, y1, x2, y2, half, ..], lookout] = climb;
        let reached = reaches(&[[x1, y1, x2, y2, half], [lookout[0], lookout[1], lookout[2], lookout[3], lookout[4]]]);
        let ends = [[lookout[0], lookout[1]], [lookout[2], lookout[3]]];
        (reached > 0 && clear([[x1, y1], [x2, y2]], half) && clear(ends, lookout[4])).then_some((reached, climb))
    });
    let best_climb = climbs.max_by_key(|&(reached, _)| reached);
    let side = CELL_M * STRIDE as f64;
    let left = |reached: usize| (mass.cells.len() - reached) as f64 * side * side;
    if let Some((reached, climb)) = best_climb
        && left(reached) <= LEAST_M2
    {
        return Some(Answer::Climb(climb));
    }
    let valleys = ways.take(headings as usize / 2).filter_map(|way| {
        let (ahead, behind) = (floor_along(way, true)?, floor_along([-way[0], -way[1]], true)?);
        let valley = [ahead[0], ahead[1], behind[0], behind[1], VALLEY_HALF_M];
        clear([ahead, behind], VALLEY_HALF_M).then(|| (reaches(&[valley]), valley))
    });
    match valleys.max_by_key(|&(reached, _)| reached) {
        Some((reached, valley)) if best_climb.is_none_or(|(climbed, _)| reached > climbed) => {
            Some(Answer::Valley(valley))
        }
        _ => best_climb.map(|(_, climb)| Answer::Climb(climb)),
    }
}

/// The rock a layout's floors close round, which its section takes in as a hole filled: the grid's cells (16 m) that
/// lie more than 20 m from every floor, climb and run (past what the section takes or bridges) and that no way across
/// such cells joins to the grid's edge.
#[derive(Debug)]
pub(crate) struct Islands<'field> {
    field: &'field Field,
    columns: usize,
    enclosed: Vec<bool>,
}

/// How near a floor the section takes in the land or bridges the gap to another's, metres.
const SEALED_M: f64 = 20.0;

impl<'field> Islands<'field> {
    pub(crate) fn of(field: &'field Field, carved: &Sculpts) -> Self {
        let (columns, rows) = (field.columns.div_ceil(STRIDE), field.rows.div_ceil(STRIDE));
        let centre = |at: usize| field.centre((at % columns) * STRIDE, (at / columns) * STRIDE);
        let open: Vec<bool> = (0..columns * rows)
            .map(|at| {
                let [x, y] = centre(at);
                carved.floor_distance(x, y) > SEALED_M
            })
            .collect();
        let edge = |at: usize| {
            at.is_multiple_of(columns) || at / columns == 0 || at % columns + 1 == columns || at / columns + 1 == rows
        };
        let mut outside = vec![false; open.len()];
        let mut stack: Vec<usize> = (0..open.len()).filter(|&at| open[at] && edge(at)).collect();
        for &at in &stack {
            outside[at] = true;
        }
        while let Some(at) = stack.pop() {
            let (column, row) = (at % columns, at / columns);
            let across = [(column > 0).then(|| at - 1), (column + 1 < columns).then(|| at + 1)];
            let down = [(row > 0).then(|| at - columns), (row + 1 < rows).then(|| at + columns)];
            for next in across.into_iter().chain(down).flatten() {
                if open[next] && !outside[next] {
                    outside[next] = true;
                    stack.push(next);
                }
            }
        }
        let enclosed = open.iter().zip(&outside).map(|(&open, &outside)| open && !outside).collect();
        Self { field, columns, enclosed }
    }

    /// Whether a point lies on rock the floors close round.
    pub(crate) fn hold(&self, point: [f64; 2]) -> bool {
        self.field
            .cell_of(point[0], point[1])
            .is_some_and(|(column, row)| self.enclosed[(row / STRIDE) * self.columns + column / STRIDE])
    }
}

/// A ruined tower on the top beside a mass's lookout, past its parapet, off every floor and climb, on a top level
/// enough and clear of the outcrops as the rim's ruins are: what a body finds up there. None where no side fits.
pub fn ruin(kit: &mut Kit, climb: &[[f64; 7]; 2], carved: &Sculpts, outcrops: &[land::sculpts::Outcrop]) {
    let [[x1, y1, x2, y2, ..], _] = *climb;
    let length = distance([x1, y1], [x2, y2]).max(1e-9);
    let way = [(x2 - x1) / length, (y2 - y1) / length];
    // Ahead of the lookout, or to either side of it.
    for out in [way, [-way[1], way[0]], [way[1], -way[0]]] {
        let site = [x2 + out[0] * RUIN_OUT_M, y2 + out[1] * RUIN_OUT_M];
        if carved.floor_distance(site[0], site[1]) >= RUIN_OFF_M
            && crate::skyline::holds_a_ruin(kit, carved, site, outcrops)
        {
            crate::skyline::tower_stump(kit, carved, site);
            return;
        }
    }
}

/// The dead masses of a claim (the field's): the patches of land raised over a quarter of the massif's height
/// (`rise`; a terraced massif's lowest plateau stands at about a third), more than 150 m from every floor, climb and
/// run and 120 m inside the claim's edge, each wider than a fighting space.
#[must_use]
pub fn dead_masses(field: &Field, sculpts: &Sculpts, rise: f64) -> Vec<Mass> {
    let (columns, rows) = (field.columns.div_ceil(STRIDE), field.rows.div_ceil(STRIDE));
    let cell = |at: usize| field.index((at % columns) * STRIDE, (at / columns) * STRIDE);
    let centre = |at: usize| field.centre((at % columns) * STRIDE, (at / columns) * STRIDE);
    // A sculpt measures how far its floors lie only near them, so the cells a floor, climb or run reaches into are
    // found first, and how far every other cell lies from them is measured across the grid.
    let side = CELL_M * STRIDE as f64;
    let reached: Vec<bool> = (0..columns * rows)
        .map(|at| {
            let [x, y] = centre(at);
            sculpts.floor_distance(x, y) <= side * std::f64::consts::FRAC_1_SQRT_2
        })
        .collect();
    let off = chamfer(columns, rows, |at| reached[at]);
    let dead: Vec<bool> = (0..columns * rows)
        .map(|at| {
            let [x, y] = centre(at);
            field.inside[cell(at)] > FROM_EDGE_M
                && off[at] * STRIDE as f64 > FROM_FLOORS_M
                && sculpts.raise(x, y, field.to_sea[cell(at)]) - sculpts.floor_level(x, y) > rise / 4.0
        })
        .collect();
    let mut seen = vec![false; dead.len()];
    let mut masses = Vec::new();
    for start in 0..dead.len() {
        if !dead[start] || seen[start] {
            continue;
        }
        seen[start] = true;
        let (mut patch, mut stack) = (Vec::new(), vec![start]);
        while let Some(at) = stack.pop() {
            patch.push(at);
            let (column, row) = (at % columns, at / columns);
            let across = [(column > 0).then(|| at - 1), (column + 1 < columns).then(|| at + 1)];
            let down = [(row > 0).then(|| at - columns), (row + 1 < rows).then(|| at + columns)];
            for next in across.into_iter().chain(down).flatten() {
                if dead[next] && !seen[next] {
                    seen[next] = true;
                    stack.push(next);
                }
            }
        }
        let area_m2 = patch.len() as f64 * side * side;
        if area_m2 <= LEAST_M2 {
            continue;
        }
        // Its middle is the cell farthest into it, which a crooked mass's average might miss.
        let deepest =
            patch.iter().copied().fold(start, |deepest, at| if off[at] > off[deepest] { at } else { deepest });
        let cells: Vec<usize> = patch.iter().map(|&at| cell(at)).collect();
        masses.push(Mass { cells, middle: centre(deepest), area_m2 });
    }
    masses
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::field::{Water, ring_holds};
    use land::sculpts::Sculpt;

    const RISE_M: f64 = 28.0;

    fn square(half: f64) -> Vec<[f64; 2]> {
        vec![[-half, -half], [half, -half], [half, half], [-half, half]]
    }

    /// Flat dry land over a square claim `half` metres either side of its middle, and 40 m round it.
    fn made_field(half: f64) -> Field {
        let claim = square(half);
        let (west, north) = (-half - 40.0, -half - 40.0);
        let columns = (2.0 * (half + 40.0) / CELL_M).ceil() as usize;
        let count = columns * columns;
        let centre =
            |at: usize| [west + ((at % columns) as f64 + 0.5) * CELL_M, north + ((at / columns) as f64 + 0.5) * CELL_M];
        let claimed: Vec<bool> = (0..count).map(|at| ring_holds(&claim, centre(at)[0], centre(at)[1])).collect();
        let inside = chamfer(columns, columns, |at| !claimed[at]);
        Field {
            west,
            north,
            columns,
            rows: columns,
            height: vec![5.0; count],
            water: vec![Water::Dry; count],
            slope: vec![0.0; count],
            claimed,
            to_sea: vec![1e6; count],
            to_fresh: vec![1e6; count],
            inside,
            seaward: [0.0, -1.0],
        }
    }

    /// A claim `half` metres either side carved round a loop of canyons `side` metres on a side, with `climbs`.
    fn a_loop(half: f64, side: f64, climbs: Vec<[f64; 7]>, more: &[[f64; 5]]) -> Sculpts {
        let corners = square(side / 2.0);
        let mut floors: Vec<[f64; 5]> = (0..4)
            .map(|edge| {
                let (from, to) = (corners[edge], corners[(edge + 1) % 4]);
                [from[0], from[1], to[0], to[1], 12.0]
            })
            .collect();
        floors.extend_from_slice(more);
        let sculpt = Sculpt {
            claim: square(half),
            floors,
            outcrops: Vec::new(),
            rise: RISE_M,
            seed: 5,
            climbs,
            runs: Vec::new(),
            wings: Vec::new(),
            levels: Vec::new(),
            terraced: false,
        };
        Sculpts::from(vec![sculpt])
    }

    #[test]
    fn a_mass_no_way_touches_is_found() {
        let masses = dead_masses(&made_field(700.0), &a_loop(700.0, 1000.0, Vec::new(), &[]), RISE_M);
        assert_eq!(masses.len(), 1, "the block inside the loop: {masses:?}");
        let mass = &masses[0];
        assert!(mass.area_m2 > 600.0 * 600.0, "it spreads over the loop's inside but its rim: {}", mass.area_m2);
        assert!(mass.middle[0].abs() < 24.0 && mass.middle[1].abs() < 24.0, "{:?}", mass.middle);
    }

    #[test]
    fn a_reached_mass_is_not() {
        // A lookout on the top of a smaller block, and a valley floor across a larger one.
        let lookout = vec![[-100.0, 0.0, 0.0, 0.0, 3.5, 0.0, 1.0], [0.0, 0.0, 0.0, 0.0, 11.0, 1.0, 1.0]];
        let climbed = a_loop(300.0, 524.0, lookout, &[]);
        assert_eq!(dead_masses(&made_field(300.0), &climbed, RISE_M), Vec::new());
        let cut = a_loop(320.0, 600.0, Vec::new(), &[[-300.0, 0.0, 300.0, 0.0, 24.0]]);
        assert_eq!(dead_masses(&made_field(320.0), &cut, RISE_M), Vec::new());
        // The blocks are there without them: the lookout and the valley are what reach them.
        assert_eq!(dead_masses(&made_field(300.0), &a_loop(300.0, 524.0, Vec::new(), &[]), RISE_M).len(), 1);
        assert_eq!(dead_masses(&made_field(320.0), &a_loop(320.0, 600.0, Vec::new(), &[]), RISE_M).len(), 1);
    }

    #[test]
    fn the_bounds_by_the_claims_edge_are_no_mass() {
        // One basin in a claim: the rock round it lies within 120 m of the edge, or, in a wider claim, farther in.
        let basin = |half: f64| {
            let sculpts = a_loop(half, 0.0, Vec::new(), &[[0.0, 0.0, 0.0, 0.0, 40.0]]);
            dead_masses(&made_field(half), &sculpts, RISE_M).len()
        };
        assert_eq!(basin(200.0), 0);
        assert_eq!(basin(400.0), 1);
    }

    /// A loop's sculpt alone.
    fn sculpt_of(sculpts: Sculpts) -> Sculpt {
        Vec::from(sculpts).remove(0)
    }

    #[test]
    fn a_dead_mass_a_climb_reaches_is_climbed() {
        let field = made_field(300.0);
        let mut sculpt = sculpt_of(a_loop(300.0, 440.0, Vec::new(), &[]));
        let floors = sculpt.floors.len();
        let climbs = reach_masses(&field, &mut sculpt);
        assert_eq!((climbs.len(), sculpt.floors.len()), (1, floors), "one climb and no valley");
        assert_eq!(&sculpt.climbs[..2], &climbs[0][..], "the climb goes in among the lookouts");
        let lookout = [climbs[0][1][0], climbs[0][1][1]];
        assert!(lookout[0].abs() < 170.0 && lookout[1].abs() < 170.0, "its lookout stands in the loop: {lookout:?}");
        assert_eq!(dead_masses(&field, &Sculpts::from(vec![sculpt]), RISE_M), Vec::new());
    }

    #[test]
    fn a_dead_mass_no_climb_reaches_is_cut_by_a_valley_between_two_floors() {
        let field = made_field(320.0);
        let mut sculpt = sculpt_of(a_loop(320.0, 600.0, Vec::new(), &[]));
        let loop_floors = sculpt.floors.clone();
        assert!(reach_masses(&field, &mut sculpt).is_empty(), "no climb");
        let valleys = &sculpt.floors[loop_floors.len()..];
        assert_eq!(valleys.len(), 1, "one valley: {valleys:?}");
        let loop_only = Sculpts::from(vec![Sculpt { floors: loop_floors, ..sculpt.clone() }]);
        let [x1, y1, x2, y2, _] = valleys[0];
        for end in [[x1, y1], [x2, y2]] {
            assert!(loop_only.floor_distance(end[0], end[1]) <= 0.0, "each end on the loop's floor: {end:?}");
        }
        assert_eq!(dead_masses(&field, &Sculpts::from(vec![sculpt]), RISE_M), Vec::new());
    }

    #[test]
    fn the_rock_inside_a_loop_is_an_island_and_the_rock_outside_it_is_not() {
        let field = made_field(320.0);
        let islands = Islands::of(&field, &a_loop(320.0, 380.0, Vec::new(), &[]));
        assert!(islands.hold([0.0, 0.0]) && islands.hold([120.0, -100.0]), "inside the loop");
        assert!(!islands.hold([0.0, 260.0]) && !islands.hold([-280.0, 0.0]), "between the loop and the edge");
        assert!(!islands.hold([0.0, 190.0]), "on the loop's floor");
    }
}
