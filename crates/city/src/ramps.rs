//! The ramps that join an avenue's terraces: a straight ramp the road's width across every edge where two of an
//! avenue's cells stand apart, and at each avenue's head a switchback up the landmark platform's wall, so the road
//! runs walkable from the gates and the harbour to the platform. Each is a sloped pad the ground reads, the walls that
//! hold and guard it, and the cuts it makes in the terraces' retaining walls.

use crate::grid::{CELL_M, Grid, index};
use crate::landmarks::turn_toward;
use crate::solids::{Material, Shape, Solid};
use crate::terraces::Footing;
use crate::walls::{Cut, PIER_M, QUAY_TOP_M};
use crate::{Pad, Use};
use land::pads::Fall;
use serde::Serialize;
use std::collections::BTreeSet;

/// An avenue's road, as the page paves it: six of a cell's sixteen ground tiles wide, metres.
pub const ROAD_M: f64 = 38.4;
/// Below this rise two cells' pads blend into each other within a body's step: no ramp, metres.
pub const LEAST_RISE_M: f64 = 0.5;
/// A ramp's run for each metre it rises, and its shortest and longest runs, metres: never more than half of the
/// longest into either cell, so a cell's middle, where its road turns, stays flat.
pub const RUN_PER_RISE: f64 = 6.0;
pub const SHORTEST_M: f64 = 6.0;
pub const LONGEST_M: f64 = 64.0;
/// A ramp's walls: as thick as a pad's seam blends, so the blend lies under them and the walked way is exact, metres.
pub const WALL_M: f64 = 1.2;
/// A parapet's height over the way it guards, and how far a wall's foot is sunk under the ground, metres.
pub const PARAPET_M: f64 = 1.1;
/// How deep a piece's paving slab is under its top, metres.
const PAVING_M: f64 = 0.4;
const SINK_M: f64 = 2.0;
/// A switchback's legs: the most one rises, the widest it is, metres.
pub const LEG_RISE_M: f64 = 12.0;
pub const LEG_M: f64 = 10.0;
/// How far from the platform's wall a switchback's legs reach across its head cell, metres: short of the road's
/// flank (32 m), so a walk from the foot's landing meets the road.
pub const STAIR_BAND_M: f64 = 30.0;
/// How far along the wall the switchback runs, metres: to the far side of the head cell's road, so its foot's landing
/// lies beside the road.
const STAIR_RUN_M: f64 = (CELL_M + ROAD_M) / 2.0;

/// What a ramp is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Piece {
    /// A straight ramp across the edge between two of an avenue's cells.
    Ramp,
    /// One sloped leg of a switchback.
    Leg,
    /// A switchback's flat landing: at its top, at each turn, or at its foot.
    Landing,
}

/// One walked piece of a ramp or a switchback: its pad (its bounds, its level, its fall), its rise over its run, and
/// its centre line from its top to its foot (east, south, level), which the next piece's line carries on from.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Ramp {
    pub piece: Piece,
    #[serde(flatten)]
    pub pad: Pad,
    pub slope: f64,
    pub line: [[f64; 3]; 2],
}

/// Every avenue's ramps, their works (walls and paving), and the cuts they make in the retaining walls.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Laid {
    /// Each avenue's ramps from its start to its head, then its switchback from its foot to its top.
    pub ramps: Vec<Ramp>,
    pub works: Vec<Solid>,
    pub cuts: Vec<Cut>,
}

/// What the ramps are laid from: the grid, each cell's footing and use, the avenues' cells from their starts to the
/// landmark (`ways::avenue`), the platform's level, the rectangles laid over the cells later (the plaza, the
/// landmark's base), where no ramp is laid, and which avenue starts at the harbour with the root of the pier nearest
/// it, on the quay.
#[derive(Debug)]
pub struct Avenues<'a> {
    pub grid: &'a Grid,
    pub footings: &'a [Footing],
    pub uses: &'a [Use],
    pub avenues: &'a [Vec<(usize, usize)>],
    pub platform: f64,
    pub plaza: [f64; 4],
    pub over: &'a [[f64; 4]],
    pub harbour: Option<Harbour>,
}

/// The harbour's avenue by its number among the avenues, the piers' roots and points along the quay's middle.
#[derive(Debug, Clone, PartialEq)]
pub struct Harbour {
    pub avenue: usize,
    pub roots: Vec<[f64; 2]>,
    pub quay: Vec<[f64; 2]>,
}

/// A frame on one edge of a cell: `across` metres in from the edge toward the cell's middle, `along` metres along it
/// from `origin`, an end of the edge.
#[derive(Debug, Clone, Copy)]
struct Frame {
    origin: [f64; 2],
    inward: [f64; 2],
    along: [f64; 2],
}

impl Frame {
    fn at(&self, across: f64, along: f64) -> [f64; 2] {
        [
            self.origin[0] + self.inward[0] * across + self.along[0] * along,
            self.origin[1] + self.inward[1] * across + self.along[1] * along,
        ]
    }

    /// A world point in the frame: how far across and along.
    fn local(&self, point: [f64; 2]) -> [f64; 2] {
        let (east, south) = (point[0] - self.origin[0], point[1] - self.origin[1]);
        [east * self.inward[0] + south * self.inward[1], east * self.along[0] + south * self.along[1]]
    }

    /// A rectangle of the frame (across from..to, along from..to) square to the world: west, north, east, south.
    fn rect(&self, across: [f64; 2], along: [f64; 2]) -> [f64; 4] {
        let (a, b) = (self.at(across[0], along[0]), self.at(across[1], along[1]));
        [a[0].min(b[0]), a[1].min(b[1]), a[0].max(b[0]), a[1].max(b[1])]
    }

    /// A pad on a rectangle of the frame whose level runs from `from` at along's start to `to` at its end.
    fn pad(&self, across: [f64; 2], along: [f64; 2], from: f64, to: f64) -> Pad {
        let bounds = self.rect(across, along);
        if from == to {
            return Pad::flat(bounds, from);
        }
        // The pad's level is at its west or north edge, falling to the east or south one.
        let forward = self.along[0] + self.along[1] > 0.0;
        let (first, last) = if forward { (from, to) } else { (to, from) };
        let fall = if self.along[0] == 0.0 { Fall::South(last) } else { Fall::East(last) };
        Pad { fall: Some(fall), ..Pad::flat(bounds, first) }
    }
}

/// The frame on the edge of a cell (west, north, east, south) facing a step to a neighbour, from the edge's end at
/// `start` (0 the west or north end, 1 the other).
fn edge_frame(bounds: [f64; 4], step: (isize, isize), start: usize) -> Frame {
    let [west, north, east, south] = bounds;
    let (origin_line, inward, along) = match step {
        (-1, _) => ([[west, north], [west, south]], [1.0, 0.0], [0.0, 1.0]),
        (1, _) => ([[east, north], [east, south]], [-1.0, 0.0], [0.0, 1.0]),
        (_, -1) => ([[west, north], [east, north]], [0.0, 1.0], [1.0, 0.0]),
        _ => ([[west, south], [east, south]], [0.0, -1.0], [1.0, 0.0]),
    };
    let sign = if start == 0 { 1.0 } else { -1.0 };
    Frame { origin: origin_line[start], inward, along: [along[0] * sign, along[1] * sign] }
}

fn overlaps(a: [f64; 4], b: [f64; 4]) -> bool {
    a[2] > b[0] && a[0] < b[2] && a[3] > b[1] && a[1] < b[3]
}

/// A wall square to the world along a frame's `along` (from..to) at `across` (its middle), standing from `bottom` to
/// `top`.
fn upright(frame: &Frame, across: f64, along: [f64; 2], bottom: f64, top: f64) -> Solid {
    let middle = frame.at(across, (along[0] + along[1]) / 2.0);
    let length = (along[1] - along[0]).abs();
    let size = if frame.along[0] == 0.0 { [WALL_M, length, top - bottom] } else { [length, WALL_M, top - bottom] };
    Solid::upright(Shape::Block, [middle[0], middle[1], bottom], size, Material::Stone)
}

/// A wall across a frame's `along` at `along` (its middle), `across` from..to, standing from `bottom` to `top`.
fn end_wall(frame: &Frame, across: [f64; 2], along: f64, bottom: f64, top: f64) -> Solid {
    let middle = frame.at((across[0] + across[1]) / 2.0, along);
    let width = (across[1] - across[0]).abs();
    let size = if frame.along[0] == 0.0 { [width, WALL_M, top - bottom] } else { [WALL_M, width, top - bottom] };
    Solid::upright(Shape::Block, [middle[0], middle[1], bottom], size, Material::Stone)
}

/// A block `width` wide leaned so its top runs straight from `top_from` over `from` to `top_to` over `to`, `vertical`
/// metres deep under its top all along. Its foot reaches past its higher end by `vertical` x the slope's sine and
/// cosine: under the ground or a wall there.
fn leaned(from: [f64; 2], to: [f64; 2], [top_from, top_to]: [f64; 2], vertical: f64, width: f64) -> Solid {
    let (east, south) = (to[0] - from[0], to[1] - from[1]);
    let run = (east * east + south * south).sqrt();
    let lean = libm::atan2(top_from - top_to, run);
    let (sine, cosine) = (libm::sin(lean), libm::cos(lean));
    let deep = vertical * cosine;
    let way = [east / run, south / run];
    // The top's middle lies over the run's middle: the block's foot stands back from it by its depth's lean.
    let middle = [(from[0] + to[0]) / 2.0 - way[0] * deep * sine, (from[1] + to[1]) / 2.0 - way[1] * deep * sine];
    let top = (top_from + top_to) / 2.0;
    let block = Solid::upright(
        Shape::Block,
        [middle[0], middle[1], top - deep * cosine],
        [width, run / cosine, deep],
        Material::Stone,
    );
    Solid { lean, ..block.turned(turn_toward(way)) }
}

/// A piece's paving: a slab its pad's size, its top the pad's, leaned along its fall.
fn paving(pad: &Pad) -> Solid {
    let [west, north, east, south] = pad.bounds;
    let slab = match pad.fall {
        None => {
            let (middle, size) = ([(west + east) / 2.0, (north + south) / 2.0], [east - west, south - north, PAVING_M]);
            Solid::upright(Shape::Block, [middle[0], middle[1], pad.level - PAVING_M], size, Material::Stone)
        }
        Some(Fall::East(to)) => {
            let middle = (north + south) / 2.0;
            leaned([west, middle], [east, middle], [pad.level, to], PAVING_M, south - north)
        }
        Some(Fall::South(to)) => {
            let middle = (west + east) / 2.0;
            leaned([middle, north], [middle, south], [pad.level, to], PAVING_M, east - west)
        }
    };
    Solid { material: Material::Paving, ..slab }
}

/// A wall guarding a sloped way along a frame's `along` (from..to) at `across`, the way's level running from
/// `surface[0]` to `surface[1]`, on ground at `ground`: a foot up to the way's lower end, a leaned block under the way's
/// slope, and a leaned parapet over it.
fn sloped_wall(frame: &Frame, across: f64, along: [f64; 2], surface: [f64; 2], ground: f64) -> [Solid; 3] {
    let (from, to) = (frame.at(across, along[0]), frame.at(across, along[1]));
    let low = surface[0].min(surface[1]);
    let rise = (surface[0] - surface[1]).abs();
    [
        upright(frame, across, along, ground - SINK_M, low),
        leaned(from, to, surface, rise + SINK_M / 4.0, WALL_M),
        leaned(from, to, surface.map(|level| level + PARAPET_M), PARAPET_M, WALL_M),
    ]
}

/// A cell's level, if it is levelled.
fn level_of(footings: &[Footing], (column, row): (usize, usize)) -> Option<f64> {
    match footings[index(column, row)] {
        Footing::Level { level } => Some(level),
        _ => None,
    }
}

fn step_between(from: (usize, usize), to: (usize, usize)) -> (isize, isize) {
    (to.0 as isize - from.0 as isize, to.1 as isize - from.1 as isize)
}

/// The ramp across the edge between two of an avenue's cells, `upper` standing higher: the road's width and the
/// walls either side, along the road and centred on the edge.
fn straight(site: &Avenues, upper: (usize, usize), lower: (usize, usize), laid: &mut Laid) {
    let (Some(high), Some(low)) = (level_of(site.footings, upper), level_of(site.footings, lower)) else { return };
    let rise = high - low;
    let run = (RUN_PER_RISE * rise).clamp(SHORTEST_M, LONGEST_M);
    // The frame on the upper cell's shared edge, from its road's flank: along runs across the road, across into it.
    let bounds = site.grid.bounds(upper.0, upper.1);
    let edge = edge_frame(bounds, step_between(upper, lower), 0);
    let half_width = ROAD_M / 2.0 + WALL_M;
    let flank = CELL_M / 2.0 - half_width;
    // Along the road: a frame whose along runs from the lower end of the ramp to its upper end.
    let mouth = edge.at(0.0, flank);
    let road = Frame { origin: mouth, inward: edge.along, along: edge.inward };
    let width = [0.0, 2.0 * half_width];
    let middle = (high + low) / 2.0;
    let pad = road.pad(width, [-run / 2.0, run / 2.0], low, high);
    if site.over.iter().chain([&site.plaza]).any(|&over| overlaps(pad.bounds, over)) {
        return;
    }
    let centre = |along: f64, level: f64| {
        let [east, south] = road.at(half_width, along);
        [east, south, level]
    };
    laid.ramps.push(Ramp {
        piece: Piece::Ramp,
        pad,
        slope: rise / run,
        line: [centre(run / 2.0, high), centre(-run / 2.0, low)],
    });
    for side in [WALL_M / 2.0, 2.0 * half_width - WALL_M / 2.0] {
        // In the upper cell a cutting, its wall's top flush with the lawn; in the lower an embankment, parapeted.
        laid.works.push(upright(&road, side, [0.0, run / 2.0], middle - SINK_M, high));
        laid.works.extend(sloped_wall(&road, side, [0.0, -run / 2.0], [middle, low], low));
    }
    let along = |point: [f64; 2]| if edge.along[0] == 0.0 { point[1] } else { point[0] };
    let ends = [along(edge.at(0.0, flank)), along(edge.at(0.0, flank + 2.0 * half_width))];
    laid.cuts.push(Cut {
        middle: edge.at(0.0, CELL_M / 2.0),
        north_south: edge.along[0] == 0.0,
        span: ends,
        top: None,
    });
}

/// The flight from the harbour avenue's first cell down to the quay, a pier's width, straight out from the cell's edge
/// to the nearest pier's root (or, with none in reach, the nearest of the quay), from the edge of the cell's middle:
/// a cutting in the cell, an embankment parapeted over the shore past it, the cell's retaining wall cut where it
/// passes. None where the quay lies inside the cell, more than half a longest ramp out, or past the cell's sides, or
/// where a flight that far would be steeper than a ramp.
fn quay_flight(site: &Avenues, start: (usize, usize), harbour: &Harbour, laid: &mut Laid) {
    let Some(level) = level_of(site.footings, start) else { return };
    let rise = level - QUAY_TOP_M;
    let bounds = site.grid.bounds(start.0, start.1);
    let half_width = PIER_M / 2.0 + WALL_M;
    let inside = (CELL_M - ROAD_M) / 2.0;
    // For a point on the quay: the cell's edge it lies furthest out past, how far out, and where along that edge.
    let reached = |point: &[f64; 2]| {
        let edges = [(0, -1), (0, 1), (-1, 0), (1, 0)].map(|step| edge_frame(bounds, step, 0));
        let edge = edges.into_iter().min_by(|a, b| a.local(*point)[0].total_cmp(&b.local(*point)[0]))?;
        let [out, along] = edge.local(*point);
        let fits = out < 0.0
            && -out <= LONGEST_M / 2.0
            && inside - out >= RUN_PER_RISE * rise
            && (half_width..=CELL_M - half_width).contains(&along);
        fits.then_some((edge, -out, along))
    };
    let nearest = |points: &[[f64; 2]]| points.iter().filter_map(reached).min_by(|a, b| a.1.total_cmp(&b.1));
    if rise < LEAST_RISE_M {
        return;
    }
    let Some((edge, gap, middle)) = nearest(&harbour.roots).or_else(|| nearest(&harbour.quay)) else { return };
    let run = inside + gap;
    // Across the flight from its west or north side; along it from the quay into the cell.
    let flight = Frame { origin: edge.at(0.0, middle - half_width), inward: edge.along, along: edge.inward };
    let pad = flight.pad([0.0, 2.0 * half_width], [-gap, inside], QUAY_TOP_M, level);
    let centre = |along: f64, level: f64| {
        let [east, south] = flight.at(half_width, along);
        [east, south, level]
    };
    laid.ramps.push(Ramp {
        piece: Piece::Ramp,
        pad,
        slope: rise / run,
        line: [centre(inside, level), centre(-gap, QUAY_TOP_M)],
    });
    let at_edge = QUAY_TOP_M + rise * gap / run;
    for side in [WALL_M / 2.0, 2.0 * half_width - WALL_M / 2.0] {
        laid.works.push(upright(&flight, side, [0.0, inside], at_edge - SINK_M, level));
        laid.works.extend(sloped_wall(&flight, side, [0.0, -gap], [at_edge, QUAY_TOP_M], 0.0));
    }
    let span = |across: f64| if edge.along[0] == 0.0 { edge.at(0.0, across)[1] } else { edge.at(0.0, across)[0] };
    laid.cuts.push(Cut {
        middle: edge.at(0.0, CELL_M / 2.0),
        north_south: edge.along[0] == 0.0,
        span: [span(middle - half_width), span(middle + half_width)],
        top: None,
    });
}

/// The switchback up the platform's wall from an avenue's head cell: an odd number of legs (so its foot lies at the
/// far end from its top) each rising at most `LEG_RISE_M`, side by side along the wall, the top leg against it; flat
/// landings at each turn, a leg's width deep, spanning the two legs they join; the top landing at the wall's end
/// nearest the plaza, where the platform's parapet opens onto it; and the foot's landing reaching across to the road.
fn switchback(site: &Avenues, head: (usize, usize), landmark: (usize, usize), laid: &mut Laid) {
    let Some(ground) = level_of(site.footings, head) else { return };
    let rise = site.platform - ground;
    if rise < LEAST_RISE_M {
        return;
    }
    let legs = {
        let fewest = (rise / LEG_RISE_M).ceil().max(1.0) as usize;
        fewest | 1
    };
    let width = LEG_M.min(STAIR_BAND_M / legs as f64);
    let step = rise / legs as f64;
    let band = width * legs as f64;
    let bounds = site.grid.bounds(head.0, head.1);
    let edge = edge_frame(bounds, step_between(head, landmark), 0);
    let Some((frame, length)) = placed(site, bounds, step_between(head, landmark), band) else { return };
    let run = length - 2.0 * width;
    if run < 2.0 * step {
        return;
    }
    let point = |across: f64, along: f64, level: f64| {
        let [east, south] = frame.at(across, along);
        [east, south, level]
    };
    // Strip 0 lies against the wall and climbs to the top; strip `legs - 1` is the outermost, its foot on the ground.
    // Each strip: a landing at the near end (along 0..width), its leg, a landing at the far end.
    let (near, far) = ([0.0, width], [width + run, length]);
    let mut pieces: Vec<Ramp> = Vec::new();
    let mut profiles: Vec<[f64; 2]> = Vec::new();
    for strip in (0..legs).rev() {
        let climbed = (legs - 1 - strip) as f64;
        let (bottom, top) = (ground + climbed * step, ground + (climbed + 1.0) * step);
        let across = [strip as f64 * width, (strip + 1) as f64 * width];
        let middle = across[0] + width / 2.0;
        // Even strips climb toward the near end, odd ones toward the far end.
        let toward_near = strip % 2 == 0;
        let (near_level, far_level) = if toward_near { (top, bottom) } else { (bottom, top) };
        profiles.push([near_level, far_level]);
        let foot = strip == legs - 1;
        let low_end = if toward_near { far } else { near };
        if foot {
            // The foot's landing, on the ground, reaching across to the road's flank.
            let reach = ((CELL_M - ROAD_M) / 2.0).max(band);
            let centre = (low_end[0] + low_end[1]) / 2.0;
            pieces.push(Ramp {
                piece: Piece::Landing,
                pad: frame.pad([across[0], reach], low_end, ground, ground),
                slope: 0.0,
                line: [point(middle, centre, ground), point(reach, centre, ground)],
            });
        }
        let leg_from = if toward_near { [width + run, width] } else { [width, width + run] };
        pieces.push(Ramp {
            piece: Piece::Leg,
            pad: frame.pad(across, [width, width + run], near_level, far_level),
            slope: step / run,
            line: [point(middle, leg_from[1], top), point(middle, leg_from[0], bottom)],
        });
        let high_end = if toward_near { near } else { far };
        let centre = (high_end[0] + high_end[1]) / 2.0;
        // Down from the strip inside it (or from the platform, at the top) across to this strip's leg.
        let line = [point(if strip == 0 { 0.0 } else { middle - width }, centre, top), point(middle, centre, top)];
        // A turn's landing spans the two strips it joins; the top one only its own.
        let spanned = if strip == 0 { across } else { [across[0] - width, across[1]] };
        pieces.push(Ramp { piece: Piece::Landing, pad: frame.pad(spanned, high_end, top, top), slope: 0.0, line });
    }
    profiles.reverse();
    laid.works.extend(switchback_walls(&frame, width, length, ground, site.platform, &profiles));
    laid.ramps.extend(pieces);
    // The platform's parapet opens over the top landing.
    let along = |point: [f64; 2]| if edge.along[0] == 0.0 { point[1] } else { point[0] };
    let span = [along(frame.at(0.0, 0.0)), along(frame.at(0.0, width))];
    laid.cuts.push(Cut {
        middle: edge.at(0.0, CELL_M / 2.0),
        north_south: edge.along[0] == 0.0,
        span: [span[0].min(span[1]), span[0].max(span[1])],
        top: Some(site.platform),
    });
}

/// Where a switchback stands in its head cell: on the platform's wall from the end nearest the plaza, its legs
/// reaching `band` across; moved along the wall past the plaza where the plaza stands over that end. Its frame and how
/// far along it may run; None where it would reach under the plaza or the landmark's base, or out of the cell (where
/// the plaza stands over the whole wall, the avenue meets the plaza's own wall, which is the plaza's to open).
fn placed(site: &Avenues, bounds: [f64; 4], step: (isize, isize), band: f64) -> Option<(Frame, f64)> {
    let middle = [(site.plaza[0] + site.plaza[2]) / 2.0, (site.plaza[1] + site.plaza[3]) / 2.0];
    let frames = [0, 1].map(|start| edge_frame(bounds, step, start));
    let distance = |frame: &Frame| {
        let [across, along] = frame.local(middle);
        across * across + along * along
    };
    let mut frame = if distance(&frames[1]) < distance(&frames[0]) { frames[1] } else { frames[0] };
    let corners = [frame.local([site.plaza[0], site.plaza[1]]), frame.local([site.plaza[2], site.plaza[3]])];
    let (across, along) = (
        [corners[0][0].min(corners[1][0]), corners[0][0].max(corners[1][0])],
        [corners[0][1].min(corners[1][1]), corners[0][1].max(corners[1][1])],
    );
    let mut room = CELL_M;
    if across[1] > 0.0 && across[0] < band && along[1] > 0.0 && along[0] < CELL_M {
        if along[0] <= 0.0 {
            room = CELL_M - along[1];
            frame.origin = frame.at(0.0, along[1]);
        } else {
            room = along[0];
        }
    }
    let length = room.min(STAIR_RUN_M);
    let full = frame.rect([0.0, band], [0.0, length]);
    let inside = full[0] >= bounds[0] - 1e-6
        && full[1] >= bounds[1] - 1e-6
        && full[2] <= bounds[2] + 1e-6
        && full[3] <= bounds[3] + 1e-6;
    let clear = !site.over.iter().chain([&site.plaza]).any(|&over| overlaps(full, over));
    (inside && clear && room > 0.0).then_some((frame, length))
}

fn switchback_walls(
    frame: &Frame,
    width: f64,
    length: f64,
    ground: f64,
    platform: f64,
    profiles: &[[f64; 2]],
) -> Vec<Solid> {
    let spans = [[0.0, width], [width, length - width], [length - width, length]];
    let surfaces = |[near, far]: [f64; 2]| [[near, near], [near, far], [far, far]];
    let mut walls = Vec::new();
    for (strip, &profile) in profiles.iter().enumerate() {
        let inner = (strip as f64 * width + WALL_M / 2.0, strip.checked_sub(1).map(|next| profiles[next]), platform);
        let outer = ((strip + 1) as f64 * width - WALL_M / 2.0, profiles.get(strip + 1).copied(), ground);
        for (side, beside, past) in [inner, outer] {
            let across = beside.map_or([[past, past]; 3], surfaces);
            for ((span, here), there) in spans.into_iter().zip(surfaces(profile)).zip(across) {
                if here == there {
                    continue;
                }
                if here[0] == here[1] {
                    walls.push(upright(frame, side, span, ground - SINK_M, here[0] + PARAPET_M));
                } else {
                    walls.extend(sloped_wall(frame, side, span, here, ground));
                }
            }
        }
        let across = [strip as f64 * width, (strip + 1) as f64 * width];
        let [near, far] = profile;
        walls.push(end_wall(frame, across, WALL_M / 2.0, ground - SINK_M, near + PARAPET_M));
        if far > ground {
            walls.push(end_wall(frame, across, length - WALL_M / 2.0, ground - SINK_M, far + PARAPET_M));
        }
    }
    walls
}

/// Every avenue's ramps: across each edge between two of its cells standing `LEAST_RISE_M` or more apart, once
/// however many avenues share it, then its switchback where it meets the landmark's cells.
#[must_use]
pub fn lay(site: &Avenues) -> Laid {
    let mut laid = Laid::default();
    let mut edges = BTreeSet::new();
    let mut heads = BTreeSet::new();
    let avenue = |cell: (usize, usize)| site.uses[index(cell.0, cell.1)] == Use::Avenue;
    for (avenue_number, cells) in site.avenues.iter().enumerate() {
        if let (Some(harbour), Some(&start)) = (&site.harbour, cells.first())
            && harbour.avenue == avenue_number
        {
            quay_flight(site, start, harbour, &mut laid);
        }
        for pair in cells.windows(2) {
            let (here, next) = (pair[0], pair[1]);
            if avenue(here) && site.uses[index(next.0, next.1)] == Use::Landmark {
                if heads.insert(here) {
                    switchback(site, here, next, &mut laid);
                }
                break;
            }
            if !(avenue(here) && avenue(next)) || !edges.insert((here.min(next), here.max(next))) {
                continue;
            }
            let (Some(a), Some(b)) = (level_of(site.footings, here), level_of(site.footings, next)) else { continue };
            if (a - b).abs() >= LEAST_RISE_M {
                let (upper, lower) = if a > b { (here, next) } else { (next, here) };
                straight(site, upper, lower, &mut laid);
            }
        }
    }
    laid.works.extend(laid.ramps.iter().map(|ramp| paving(&ramp.pad)));
    laid
}

#[cfg(test)]
#[path = "ramps_tests.rs"]
mod tests;
