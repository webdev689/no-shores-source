//! Ledges: cliff stairs cut into the rock between two places at different heights, where the brief asks for heights,
//! so a body climbs straight from a low place to a high one rather than round by the ways. Each runs square to the
//! world, so its stair's parts stay square: a slot cut at the low place's level from its floor's edge through the rock
//! to the high place's, and a cliff stair (a module, tools/modules/stairs.py) standing in it. The stair is the baked
//! rise nearest the climb, stretched to fit it to the centimetre, its top landing reaching out onto the high floor
//! past where the slot and the floor blend.

use crate::areas::Area;
use crate::field::{Field, Water, distance};
use crate::pieces::Kit;
use land::ground::Ground;
use land::sculpts::{Sculpt, Sculpts};

/// A ledge from the floor nearest area `from` up to the floor nearest area `to` (each a place's, or a way's near it):
/// where its slot leaves the low floor (`start`) and meets the high one (`edge`), and the way it climbs, square to the
/// world.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Ledge {
    pub from: usize,
    pub to: usize,
    pub start: [f64; 2],
    pub edge: [f64; 2],
    pub way: [f64; 2],
}

/// The least and the most a ledge climbs, metres: the lowest and the tallest stair baked.
const LEAST_RISE_M: f64 = 4.0;
const MOST_RISE_M: f64 = 24.0;
/// The slot's half-width, metres: the stair and its rock cheeks.
pub const SLOT_HALF_M: f64 = 3.4;
/// How far through the rock a slot runs at most, metres, the step it is sought at, and how often along a raised floor.
const FARTHEST_M: f64 = 90.0;
const SAMPLE_M: f64 = 2.0;
const SEEK_EVERY_M: f64 = 6.0;
/// How far the stair's top reaches onto the high floor, metres: past where the slot's end and the floor blend.
pub const OVER_M: f64 = 3.0;
/// How many ledges a layout cuts at most, and how far apart they keep, metres.
const MOST: usize = 3;
const APART_M: f64 = 60.0;
/// How far inside the claim a slot keeps, metres, and how far from its ends it may pass near a floor's edge.
const INSIDE_M: f64 = 30.0;
const END_CLEAR_M: f64 = 10.0;

/// The cliff stair for a climb of `rise` metres (the baked rise nearest it) and its run, foot to top, metres.
#[must_use]
pub fn stair_for(rise: f64) -> Option<(u32, f64)> {
    let baked = ((rise / 2.0).round() * 2.0).clamp(LEAST_RISE_M, MOST_RISE_M);
    let number = city::modules::number_of(&format!("cliff-stair-{baked:.0}"))?;
    let sockets = &city::modules::all()[number as usize].sockets;
    let end = |name: &str| sockets.iter().find(|socket| socket.name == name).map(|socket| socket.at[1]);
    Some((number, (end("top")? - end("foot")?).abs()))
}

/// The ledges a layout may cut, the shortest first: out from the edges of its raised floors (its places and ways
/// standing over the land's own level, `raised`), square to the world, through the rock to the first floor met that
/// stands lower, the rock between long enough to hold a stair, inside the claim on dry land and clear of every other
/// floor. A ledge joins the places nearest its two ends: often one place, its stair climbing from the way below it
/// straight up onto its platform.
fn candidates(field: &Field, (areas, ground): (&[Area], &Ground), raised: &[[f64; 7]], bare: &Sculpts) -> Vec<Ledge> {
    let mut found: Vec<(f64, Ledge)> = Vec::new();
    for &[x1, y1, x2, y2, ..] in raised.iter().filter(|capsule| capsule[5].min(capsule[6]) > 0.0) {
        let length = distance([x1, y1], [x2, y2]);
        let samples = (length / SEEK_EVERY_M).ceil().max(1.0) as i32;
        for sample in 0..=samples {
            let share = f64::from(sample) / f64::from(samples);
            let middle = [x1 + (x2 - x1) * share, y1 + (y2 - y1) * share];
            for out in [[1.0, 0.0], [-1.0, 0.0], [0.0, 1.0], [0.0, -1.0]] {
                if let Some(ledge) = slot_from(field, (bare, ground), areas, middle, out) {
                    found.push((distance(ledge.start, ledge.edge), ledge));
                }
            }
        }
    }
    found.sort_by(|first, second| first.0.total_cmp(&second.0));
    found.into_iter().map(|(_, ledge)| ledge).collect()
}

/// Whether a ledge keeps apart from those already cut, and there is room for another: at most 3, 60 m apart.
fn apart(chosen: &[Ledge], ledge: &Ledge) -> bool {
    chosen.len() < MOST && chosen.iter().all(|other| distance(other.edge, ledge.edge) > APART_M)
}

/// A ledge's stair on the land as carved (its slot cut): its module, its run, and the heights of its foot on the
/// slot's floor and its top `OVER_M` onto the high floor, metres; none where it would not climb 3 to 25 m. The stair is
/// the baked rise nearest the climb measured at its foot, which a longer stair stands further down: so twice. None
/// where the slot's floor steps before the stair's foot, or the land stands over its steps.
#[must_use]
pub fn measured(ledge: &Ledge, ground: &Ground, carved: &Sculpts) -> Option<(u32, f64, f64, f64)> {
    let land =
        |at: [f64; 2]| ground.height_at(at[0], at[1]) + carved.raise(at[0], at[1], ground.coast.at(at[0], at[1]));
    let top = [ledge.edge[0] + ledge.way[0] * OVER_M, ledge.edge[1] + ledge.way[1] * OVER_M];
    let foot_of = |run: f64| [top[0] - ledge.way[0] * run, top[1] - ledge.way[1] * run];
    let top_m = land(top);
    let mut fitted = stair_for(top_m - land(ledge.start))?;
    for _ in 0..2 {
        fitted = stair_for(top_m - land(foot_of(fitted.1)))?;
    }
    let (number, run) = fitted;
    let foot_m = land(foot_of(run));
    // The slot's floor walked from its start to the stair's foot without a step, and no land standing over the steps
    // as they climb, so a body meets only the stair.
    let foot = foot_of(run);
    let lead = distance(ledge.start, foot);
    let walked = (1..=(lead / SAMPLE_STEP_M).ceil() as i32).all(|step| {
        let share = |step: i32| (f64::from(step) * SAMPLE_STEP_M / lead.max(1e-9)).min(1.0);
        let point = |share: f64| {
            [ledge.start[0] + (foot[0] - ledge.start[0]) * share, ledge.start[1] + (foot[1] - ledge.start[1]) * share]
        };
        (land(point(share(step))) - land(point(share(step - 1)))).abs() <= STEP_M
    });
    let under_steps = (0..=(run / SAMPLE_STEP_M).ceil() as i32).all(|step| {
        let along = (f64::from(step) * SAMPLE_STEP_M).min(run);
        let at = [foot[0] + ledge.way[0] * along, foot[1] + ledge.way[1] * along];
        land(at) <= foot_m + (top_m - foot_m) * along / run + STEP_M
    });
    let rises = (LEAST_RISE_M - 1.0..=MOST_RISE_M + 1.0).contains(&(top_m - foot_m));
    (rises && walked && under_steps).then_some((number, run, foot_m, top_m))
}

/// How far apart the slot's floor and the land under a stair are sampled, and the most they may rise between two
/// samples, or stand over the stair's steps, metres: a body's step.
const SAMPLE_STEP_M: f64 = 0.5;
const STEP_M: f64 = 0.5;

/// The place whose middle lies nearest a point.
fn nearest(areas: &[Area], at: [f64; 2]) -> Option<usize> {
    (0..areas.len()).min_by(|&first, &second| distance(areas[first].at, at).total_cmp(&distance(areas[second].at, at)))
}

/// The ledge down out of a raised floor at `middle` along `out`: where it leaves that floor, crosses only rock and
/// meets a floor at least 4 m lower, long enough for its stair and clear of the claim's edge and water.
fn slot_from(
    field: &Field,
    (bare, ground): (&Sculpts, &Ground),
    areas: &[Area],
    middle: [f64; 2],
    out: [f64; 2],
) -> Option<Ledge> {
    let at = |reach: f64| [middle[0] + out[0] * reach, middle[1] + out[1] * reach];
    let on_floor = |reach: f64| {
        let point = at(reach);
        bare.floor_distance(point[0], point[1]) <= 0.0
    };
    if !on_floor(0.0) {
        return None;
    }
    let mut leaves = 0.0;
    while on_floor(leaves + SAMPLE_M) {
        leaves += SAMPLE_M;
        if leaves > FARTHEST_M {
            return None;
        }
    }
    let mut meets = leaves + SAMPLE_M;
    while !on_floor(meets) {
        meets += SAMPLE_M;
        if meets - leaves > FARTHEST_M {
            return None;
        }
    }
    let (edge, start) = (at(leaves), at(meets));
    // The climb where the stair stands: from its foot, on the slot's floor (the low floor's raise over the land's own
    // rise there), to its top on the high floor; the stair's run sets where its foot is, so it is measured twice.
    let land = |point: [f64; 2]| ground.height_at(point[0], point[1]) + bare.floor_level(point[0], point[1]);
    let top = land(at(leaves - OVER_M));
    let climb = |run: f64| {
        let foot = at(leaves - OVER_M + run);
        top - ground.height_at(foot[0], foot[1]) - bare.floor_level(start[0], start[1])
    };
    let mut run = stair_for(top - land(start))?.1;
    for _ in 0..2 {
        run = stair_for(climb(run))?.1;
    }
    // An estimate, before the slot is cut: the carving measures each ledge it cuts with its slot in the land.
    if !(LEAST_RISE_M - 2.0..=MOST_RISE_M + 2.0).contains(&climb(run)) {
        return None;
    }
    let length = meets - leaves;
    // Long enough for the stair; where the rock runs on past it, the slot is a cleft leading to its foot.
    if length < run - OVER_M + 1.0 {
        return None;
    }
    // Through rock all the way, its sides too, inside the claim on dry land.
    let clear = (1..(length / SAMPLE_M) as i32).all(|step| {
        let point = at(leaves + f64::from(step) * SAMPLE_M);
        let Some((column, row)) = field.cell_of(point[0], point[1]) else { return false };
        let cell = field.index(column, row);
        let inside = field.claimed[cell] && field.inside[cell] >= INSIDE_M && field.water[cell] == Water::Dry;
        // Near its ends a slot leaves and meets a floor's wandering edge; between them no floor runs alongside it.
        let near_end = f64::from(step) * SAMPLE_M < END_CLEAR_M || length - f64::from(step) * SAMPLE_M < END_CLEAR_M;
        inside && (near_end || bare.floor_distance(point[0], point[1]) > SLOT_HALF_M + 2.0)
    });
    let (from, to) = (nearest(areas, start)?, nearest(areas, edge)?);
    clear.then_some(Ledge { from, to, start, edge, way: [-out[0], -out[1]] })
}

/// A ledge's slot as a raised floor (`[x1, y1, x2, y2, half, from, to]`) at the low floor's level (`share`): from its
/// start to short of the high floor's edge by its half, so its rounded end meets the edge.
#[must_use]
pub fn slot(ledge: &Ledge, share: f64) -> [f64; 7] {
    let end = [ledge.edge[0] - ledge.way[0] * SLOT_HALF_M, ledge.edge[1] - ledge.way[1] * SLOT_HALF_M];
    [ledge.start[0], ledge.start[1], end[0], end[1], SLOT_HALF_M, share, share]
}

/// How many ledges, the shortest first, are measured with their slots cut at the most.
const TRIES: usize = 12;

/// Cuts a layout's ledges into its sculpt, last of what is carved so they yield to its runs and climbs: each kept only
/// where its stair climbs on the land with its slot cut, measured as the stair will stand (`measured`), its slot a
/// raised floor at the low floor's level.
pub fn cut(field: &Field, (areas, ground): (&[Area], &Ground), sculpt: &mut Sculpt) -> Vec<Ledge> {
    let bare = Sculpts::from(vec![sculpt.clone()]);
    let mut chosen: Vec<Ledge> = Vec::new();
    for ledge in candidates(field, (areas, ground), &sculpt.levels, &bare).into_iter().take(TRIES) {
        if !apart(&chosen, &ledge) {
            continue;
        }
        let share = crate::heights::share_at(&sculpt.floors, &sculpt.levels, ledge.start);
        sculpt.levels.push(slot(&ledge, share));
        if measured(&ledge, ground, &Sculpts::from(vec![sculpt.clone()])).is_some() {
            chosen.push(ledge);
        } else {
            sculpt.levels.pop();
        }
    }
    chosen
}

/// Stands a ledge's stair on the land as carved (`measured`): its top `OVER_M` onto the high floor, its foot on the
/// slot's floor, the baked rise nearest the climb stretched to the climb itself.
pub fn build(kit: &mut Kit, ledge: &Ledge, carved: &Sculpts) {
    let Some((number, run, foot_m, top_m)) = measured(ledge, kit.ground, carved) else { return };
    let top = [ledge.edge[0] + ledge.way[0] * OVER_M, ledge.edge[1] + ledge.way[1] * OVER_M];
    let middle = [top[0] - ledge.way[0] * run / 2.0, top[1] - ledge.way[1] * run / 2.0];
    let module = &city::modules::all()[number as usize];
    let baked = module.sockets.iter().find(|socket| socket.name == "top").map_or(module.size[2], |top| top.at[2]);
    let (name, high) = (module.name.clone(), module.size[2] * (top_m - foot_m) / baked.max(1.0));
    crate::modules::stand_stretched(kit, &name, [middle[0], middle[1], foot_m], ("top", ledge.way), high);
}
