//! A hall kit for the large buildings runs pass through, of the city's solids, every piece a collider: walls laid in
//! short lengths so a wall at a slant still boxes close to itself (a body meets a solid's box, square to the world);
//! rooms square to the world whose walls open wherever a way crosses them, roofed or open to the sky, windowed and
//! battlemented if asked; corridors walled and roofed along a way; stairs of 0.2 m risers; round turrets ringed with
//! merlons.

use crate::field::distance;
use crate::pieces::turn_along;
use city::solids::{Material, Shape, Solid};

/// A wall's thickness, metres.
pub const WALL_M: f64 = 0.8;
/// How far a wall piece's box may reach past the wall, metres: it decides the pieces' length on a slant.
const OVERSHOOT_M: f64 = 0.45;
/// How far either side of where a way crosses a room's wall the wall is left open, and the lintel's underside over
/// the floor, metres.
const GAP_HALF_M: f64 = 3.6;
const LINTEL_M: f64 = 3.2;
/// A stair's rise a step, metres.
const RISER_M: f64 = 0.2;
/// A turret's width, and a merlon's width, depth and height, metres.
pub const TURRET_M: f64 = 5.0;
const MERLON: [f64; 3] = [0.9, 0.4, 1.2];
const MERLON_EVERY_M: f64 = 2.0;
/// A window's width and height, and its sill over the floor, metres.
const WINDOW: [f64; 2] = [1.0, 1.6];
const SILL_M: f64 = 1.2;
/// How far apart a room's windows stand, metres.
const WINDOW_EVERY_M: f64 = 6.0;

fn unit(from: [f64; 2], to: [f64; 2]) -> [f64; 2] {
    let length = distance(from, to).max(1e-9);
    [(to[0] - from[0]) / length, (to[1] - from[1]) / length]
}

fn ahead(from: [f64; 2], way: [f64; 2], out: f64) -> [f64; 2] {
    [from[0] + way[0] * out, from[1] + way[1] * out]
}

/// How long a piece laid along `way` may be so its box reaches no further than `overshoot` past it: a box square to
/// the world round a piece of length L at an angle a to the axes reaches L/2 |sin 2a| further than the piece.
fn piece_length(way: [f64; 2], overshoot: f64, longest: f64) -> f64 {
    let slant = (2.0 * way[0] * way[1]).abs();
    if slant < 1e-6 { longest } else { (2.0 * overshoot / slant).clamp(1.2, longest) }
}

/// A run of solids along a line from `from` to `to`, each `across` wide and `bottom` to `top` high, in pieces short
/// enough that each piece's box stays within `overshoot` of it.
fn laid(out: &mut Vec<Solid>, ends: [[f64; 2]; 2], across: f64, heights: [f64; 2], overshoot: f64, material: Material) {
    let [from, to] = ends;
    let length = distance(from, to);
    if length < 0.05 || heights[1] <= heights[0] {
        return;
    }
    let way = unit(from, to);
    let pieces = (length / piece_length(way, overshoot, 12.0)).ceil().max(1.0);
    let each = length / pieces;
    for piece in 0..pieces as usize {
        let middle = ahead(from, way, each * (piece as f64 + 0.5));
        let size = [across, each + 0.02, heights[1] - heights[0]];
        out.push(
            Solid::upright(Shape::Block, [middle[0], middle[1], heights[0]], size, material).turned(turn_along(way)),
        );
    }
}

/// A wall from one point to another, `bottom` to `top` high and `thick` through.
pub fn wall(out: &mut Vec<Solid>, from: [f64; 2], to: [f64; 2], bottom: f64, top: f64, thick: f64, material: Material) {
    laid(out, [from, to], thick, [bottom, top], OVERSHOOT_M, material);
}

/// A room square to the world: its middle, its floor's height, its inner half-width east and south, its inner height,
/// whether it is roofed, which of its walls (north, east, south, west) have windows, and whether merlons stand on them.
#[derive(Debug, Clone, Copy)]
pub struct Room {
    pub middle: [f64; 2],
    pub floor: f64,
    pub half: [f64; 2],
    pub height: f64,
    pub roofed: bool,
    pub windows: [bool; 4],
    pub battled: bool,
}

/// Where a segment crosses another, as a share along the first.
fn crossing(first: [[f64; 2]; 2], second: [[f64; 2]; 2]) -> Option<f64> {
    let (start, span) = (first[0], [first[1][0] - first[0][0], first[1][1] - first[0][1]]);
    let (other_start, other_span) = (second[0], [second[1][0] - second[0][0], second[1][1] - second[0][1]]);
    let cross = span[0] * other_span[1] - span[1] * other_span[0];
    if cross.abs() < 1e-12 {
        return None;
    }
    let gap = [other_start[0] - start[0], other_start[1] - start[1]];
    let along = (gap[0] * other_span[1] - gap[1] * other_span[0]) / cross;
    let other = (gap[0] * span[1] - gap[1] * span[0]) / cross;
    ((0.0..=1.0).contains(&along) && (0.0..=1.0).contains(&other)).then_some(along)
}

/// A room's four walls, open wherever `way` (a polyline) crosses one, a lintel over each opening, windowed and
/// battlemented as it asks, and its roof.
pub fn room(out: &mut Vec<Solid>, way: &[[f64; 2]], room: Room, material: Material) {
    let ([x, y], [east, south]) = (room.middle, room.half);
    let out_by = WALL_M / 2.0;
    let corners = [
        [x - east - out_by, y - south - out_by],
        [x + east + out_by, y - south - out_by],
        [x + east + out_by, y + south + out_by],
        [x - east - out_by, y + south + out_by],
    ];
    let (bottom, top) = (room.floor - 0.4, room.floor + room.height + 0.6);
    for side in 0..4 {
        let (from, to) = (corners[side], corners[(side + 1) % 4]);
        let length = distance(from, to);
        let mut gaps: Vec<[f64; 2]> = way
            .windows(2)
            .filter_map(|pair| crossing([from, to], [pair[0], pair[1]]))
            .map(|along| [along * length - GAP_HALF_M, along * length + GAP_HALF_M])
            .collect();
        gaps.sort_by(|first, second| first[0].total_cmp(&second[0]));
        let along = unit(from, to);
        let whole = |out: &mut Vec<Solid>, ends: [[f64; 2]; 2]| {
            if room.windows[side] {
                windowed(out, ends[0], ends[1], [room.floor; 2], room.height, WINDOW_EVERY_M);
            } else {
                wall(out, ends[0], ends[1], bottom, top, WALL_M, material);
            }
        };
        if room.battled {
            let outward = [along[1] * WALL_M / 4.0, -along[0] * WALL_M / 4.0];
            let shifted = |at: [f64; 2]| [at[0] + outward[0], at[1] + outward[1]];
            battlements(out, shifted(from), shifted(to), top, material);
        }
        let mut start = 0.0;
        for [open, close] in gaps {
            if open > start {
                whole(out, [ahead(from, along, start), ahead(from, along, open)]);
            }
            let (open, close) = (open.max(0.0), close.min(length));
            wall(
                out,
                ahead(from, along, open),
                ahead(from, along, close),
                room.floor + LINTEL_M,
                top,
                WALL_M,
                material,
            );
            start = start.max(close);
        }
        if start < length {
            whole(out, [ahead(from, along, start), to]);
        }
    }
    if room.roofed {
        let size = [2.0 * (east + WALL_M), 2.0 * (south + WALL_M), 0.6];
        out.push(Solid::upright(Shape::Block, [x, y, room.floor + room.height], size, material));
    }
}

/// A corridor along a way from one end to the other (`floors`, the floor's height at each): walled either side
/// `half` metres off its line and roofed `height` over its higher floor.
pub fn corridor(
    out: &mut Vec<Solid>,
    ends: [[f64; 2]; 2],
    floors: [f64; 2],
    half: f64,
    height: f64,
    material: Material,
) {
    let way = unit(ends[0], ends[1]);
    let across = [-way[1], way[0]];
    let (low, high) = (floors[0].min(floors[1]), floors[0].max(floors[1]));
    for side in [1.0, -1.0] {
        let off = side * (half + WALL_M / 2.0);
        wall(
            out,
            ahead(ends[0], across, off),
            ahead(ends[1], across, off),
            low - 0.4,
            high + height + 0.6,
            WALL_M,
            material,
        );
    }
    laid(out, ends, 2.0 * (half + WALL_M), [high + height, high + height + 0.6], 3.0, material);
}

/// A stair from one point to another higher one, `width` wide, in risers of 0.2 m at most.
pub fn stair(out: &mut Vec<Solid>, from: [f64; 3], to: [f64; 3], width: f64, material: Material) {
    let rise = to[2] - from[2];
    let steps = (rise / RISER_M).ceil().max(1.0);
    let (start, end) = ([from[0], from[1]], [to[0], to[1]]);
    let way = unit(start, end);
    let tread = distance(start, end) / steps;
    for step in 1..=steps as usize {
        let middle = ahead(start, way, tread * (step as f64 - 0.5));
        let top = from[2] + rise * step as f64 / steps;
        let size = [width, tread + 0.02, top - (from[2] - 0.3)];
        out.push(
            Solid::upright(Shape::Block, [middle[0], middle[1], from[2] - 0.3], size, material).turned(turn_along(way)),
        );
    }
}

/// Merlons along a wall's top from one point to another, standing on `top`: 0.9 m wide and 1.2 m tall every 2 m, each
/// laid as a short length like `wall`'s, as thick as half a wall; a wall's outer half takes them.
pub fn battlements(out: &mut Vec<Solid>, from: [f64; 2], to: [f64; 2], top: f64, material: Material) {
    let length = distance(from, to);
    let way = unit(from, to);
    let count = (length / MERLON_EVERY_M).round().max(1.0);
    for merlon in 0..count as usize {
        let middle = length * (merlon as f64 + 0.5) / count;
        let ends = [ahead(from, way, middle - MERLON[0] / 2.0), ahead(from, way, middle + MERLON[0] / 2.0)];
        laid(out, ends, MERLON[1], [top, top + MERLON[2]], OVERSHOOT_M, material);
    }
}

/// A wall from one point to another (`floors`, the floor's height at each end) standing `height` over its higher
/// floor, as `corridor`'s and `room`'s walls, with openings 1.0 m wide and 1.6 m tall, their sills 1.2 m over the
/// higher floor, `every` metres apart.
pub fn windowed(out: &mut Vec<Solid>, from: [f64; 2], to: [f64; 2], floors: [f64; 2], height: f64, every: f64) {
    let (low, high) = (floors[0].min(floors[1]), floors[0].max(floors[1]));
    let (bottom, top, sill) = (low - 0.4, high + height + 0.6, high + SILL_M);
    let (length, way) = (distance(from, to), unit(from, to));
    let count = (length / every.max(1e-9)).floor();
    let mut start = 0.0;
    for opening in 0..count as usize {
        let middle = length * (opening as f64 + 0.5) / count;
        let (open, close) = (middle - WINDOW[0] / 2.0, middle + WINDOW[0] / 2.0);
        wall(out, ahead(from, way, start), ahead(from, way, open), bottom, top, WALL_M, Material::Stone);
        let span = [ahead(from, way, open), ahead(from, way, close)];
        wall(out, span[0], span[1], bottom, sill, WALL_M, Material::Stone);
        wall(out, span[0], span[1], sill + WINDOW[1], top, WALL_M, Material::Stone);
        start = close;
    }
    wall(out, ahead(from, way, start), to, bottom, top, WALL_M, Material::Stone);
}

/// A round turret from `heights[0]` to `heights[1]` with ten merlons round its top; where `open` (a unit vector) is
/// given, the merlon on that side is left out, so a body comes onto the top from there.
pub fn turret(out: &mut Vec<Solid>, at: [f64; 2], heights: [f64; 2], open: Option<[f64; 2]>, material: Material) {
    let [bottom, top] = heights;
    let shape = Shape::Column { sides: 10, top: 1.0 };
    out.push(Solid::upright(shape, [at[0], at[1], bottom], [TURRET_M, TURRET_M, top - bottom], material));
    let start = open.map_or(0.0, |way| libm::atan2(way[1], way[0]));
    for slot in usize::from(open.is_some())..10 {
        let (sine, cosine) = land::exact::sin_cos(start + std::f64::consts::TAU * slot as f64 / 10.0);
        let spot = ahead(at, [cosine, sine], TURRET_M / 2.0 - 0.35);
        let merlon = Solid::upright(Shape::Block, [spot[0], spot[1], top], MERLON, material);
        out.push(merlon.turned(turn_along([cosine, sine])));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::off_line;
    use city::solids::Material;

    /// Whether any solid's box stands within `clear` metres of a line under `head` metres over `floor`.
    fn blocking(solids: &[Solid], line: &[[f64; 2]], floor: f64, head: f64, clear: f64) -> bool {
        solids.iter().any(|solid| {
            let [west, north, east, south, bottom, _] = solid.bounds();
            bottom < floor + head
                && line.windows(2).any(|pair| {
                    (0..=100).any(|step| {
                        let share = f64::from(step) / 100.0;
                        let at = [
                            pair[0][0] + (pair[1][0] - pair[0][0]) * share,
                            pair[0][1] + (pair[1][1] - pair[0][1]) * share,
                        ];
                        at[0] > west - clear && at[0] < east + clear && at[1] > north - clear && at[1] < south + clear
                    })
                })
        })
    }

    #[test]
    fn a_wall_at_a_slant_boxes_close_to_itself() {
        let mut out = Vec::new();
        wall(&mut out, [0.0, 0.0], [20.0, 20.0], 0.0, 4.0, 0.8, Material::Stone);
        assert!(out.len() >= 10, "laid in short lengths: {}", out.len());
        for solid in &out {
            let [west, north, east, south, ..] = solid.bounds();
            for corner in [[west, north], [east, north], [east, south], [west, south]] {
                let off = off_line(corner, [0.0, 0.0], [20.0, 20.0]);
                assert!(off < 1.4, "a piece's box reaches {off} m off the wall");
            }
        }
    }

    #[test]
    fn a_room_leaves_its_way_through_clear_and_walls_the_rest() {
        let mut out = Vec::new();
        let way = [[-30.0, 2.0], [0.0, 0.0], [30.0, -6.0]];
        room(
            &mut out,
            &way,
            Room {
                middle: [0.0, 0.0],
                floor: 5.0,
                half: [10.0, 8.0],
                height: 4.0,
                roofed: true,
                windows: [false; 4],
                battled: false,
            },
            Material::Stone,
        );
        assert!(!blocking(&out, &way, 5.0, 2.2, 1.2), "the way through is open");
        let north = out.iter().any(|solid| (solid.bounds()[1] + solid.bounds()[3]) / 2.0 < -7.5);
        let south = out.iter().any(|solid| (solid.bounds()[1] + solid.bounds()[3]) / 2.0 > 7.5);
        assert!(north && south, "walls stand along both sides the way does not cross");
        let roof = out.iter().filter(|solid| solid.bounds()[4] >= 5.0 + 4.0 - 1e-9).count();
        assert!(roof > 0, "a roofed room is roofed over its height");
    }

    #[test]
    fn a_corridor_is_roofed_and_walled_either_side() {
        let mut out = Vec::new();
        corridor(&mut out, [[0.0, 0.0], [20.0, 20.0]], [3.0, 3.0], 2.5, 3.4, Material::Stone);
        assert!(!blocking(&out, &[[0.0, 0.0], [20.0, 20.0]], 3.0, 2.6, 1.2), "nothing stands in it under 2.6 m");
        let sides: Vec<f64> = out
            .iter()
            .filter(|solid| solid.bounds()[4] < 3.0 + 1.0)
            .map(|solid| {
                let [west, north, east, south, ..] = solid.bounds();
                let middle = [(west + east) / 2.0, (north + south) / 2.0];
                (middle[1] - middle[0]).signum()
            })
            .collect();
        assert!(sides.contains(&1.0) && sides.contains(&-1.0), "walled on both sides");
        assert!(out.iter().any(|solid| solid.bounds()[4] >= 3.0 + 3.4 - 1e-9), "roofed");
    }

    #[test]
    fn battlements_stand_on_the_wall_top_with_gaps() {
        let mut out = Vec::new();
        battlements(&mut out, [0.0, 0.0], [20.0, 0.0], 6.0, Material::Stone);
        let mut spans: Vec<[f64; 6]> = out.iter().map(Solid::bounds).collect();
        spans.sort_by(|first, second| first[0].total_cmp(&second[0]));
        assert_eq!(spans.len(), 10, "a merlon every 2 m");
        for [west, north, east, south, bottom, top] in &spans {
            assert!((bottom - 6.0).abs() < 1e-9 && (top - 7.2).abs() < 1e-9, "on the top, 1.2 m tall");
            // A length is laid 2 cm long, as a wall's are, so lengths in a row join.
            assert!((east - west - 0.92).abs() < 1e-6 && (south - north - 0.4).abs() < 1e-6, "0.9 m wide, 0.4 thick");
        }
        for pair in spans.windows(2) {
            assert!((pair[1][0] - pair[0][0] - 2.0).abs() < 1e-6, "2 m apart");
            assert!(pair[1][0] - pair[0][2] > 1.0, "with a gap between");
        }
        let mut slant = Vec::new();
        battlements(&mut slant, [0.0, 0.0], [14.0, 14.0], 6.0, Material::Stone);
        for solid in &slant {
            let [west, north, east, south, ..] = solid.bounds();
            let off = off_line([(west + east) / 2.0, (north + south) / 2.0], [0.0, 0.0], [14.0, 14.0]);
            assert!(off < 1e-6 && east - west < 1.0, "on a slant each merlon boxes close to the wall");
        }
    }

    #[test]
    fn a_windowed_wall_has_openings_a_ray_passes() {
        let mut out = Vec::new();
        windowed(&mut out, [0.0, 0.0], [20.0, 0.0], [3.0, 3.0], 5.0, 4.0);
        // A ray square through the wall at a point along it and a height.
        let passes = |x: f64, z: f64| {
            !out.iter().any(|solid| {
                let [west, north, east, south, bottom, top] = solid.bounds();
                (west..=east).contains(&x) && north <= 0.0 && south >= 0.0 && (bottom..=top).contains(&z)
            })
        };
        let open: Vec<f64> = (0..200).map(|step| f64::from(step) * 0.1 + 0.05).filter(|&x| passes(x, 5.0)).collect();
        let openings = open.windows(2).filter(|pair| pair[1] - pair[0] > 0.15).count() + usize::from(!open.is_empty());
        assert_eq!(openings, 5, "an opening every 4 m: {open:?}");
        assert!(open.iter().all(|&x| (x - 2.0).rem_euclid(4.0) < 0.5 || (x - 2.0).rem_euclid(4.0) > 3.5), "{open:?}");
        assert!(open.len() >= 5 * 9, "each 1.0 m wide");
        for x in (0..200).map(|step| f64::from(step) * 0.1 + 0.05) {
            assert!(!passes(x, 3.0 + 1.1) && !passes(x, 3.0 + 2.9) && !passes(x, 3.0 + 5.5), "walled below and over");
        }
        assert!(!passes(2.0, 2.65) && passes(2.0, 4.25) && passes(2.0, 5.75) && !passes(2.0, 5.85), "1.2 to 2.8 up");
    }

    #[test]
    fn a_stair_rises_at_most_two_tenths_a_step() {
        let mut out = Vec::new();
        stair(&mut out, [0.0, 0.0, 0.0], [6.0, 0.0, 2.0], 2.0, Material::Stone);
        let mut tops: Vec<f64> = out.iter().map(|solid| solid.bounds()[5]).collect();
        tops.sort_by(f64::total_cmp);
        assert!((tops.last().copied().unwrap_or(0.0) - 2.0).abs() < 1e-9, "it reaches the top");
        assert!(tops.windows(2).all(|pair| pair[1] - pair[0] <= 0.2 + 1e-9), "{tops:?}");
        assert!(tops[0] <= 0.2 + 1e-9);
    }
}
