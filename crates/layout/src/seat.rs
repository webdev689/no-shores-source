//! An RMB block stood on open land. The block is turned by quarter turns, so its buildings stay square to the world,
//! but nothing else of it is square: each building is seated on its own footprint, level with the highest ground
//! under it and on a stone plinth where the ground falls away, a building the land cannot hold (water, too steep, past
//! the section) is left out, props stand on the ground where they are, and only the block's streets and yards are
//! laid on the land, never its grass.

use crate::book::{Book, RmbBlock, ground_tiles};
use crate::field::{Field, Water, distance};
use city::grid::CELL_M as BLOCK_M;
use city::solids::{Material, Shape, Solid};
use land::exact::fbm;
use land::ground::{Ground, WaterAt};
use land::pads::Pad;
use serde::Serialize;

/// A block's tiles' side, metres.
pub const TILE_M: f64 = BLOCK_M / 16.0;
/// The most the ground may rise under a building's footprint, metres: more, and the building is left out.
const SEAT_RELIEF_M: f64 = 3.2;
/// How far a building sinks into the highest ground under it, metres, so no corner floats on a slope.
const SINK_M: f64 = 0.15;
/// How far a plinth runs into the ground under its lowest corner, metres.
const FOOTING_M: f64 = 0.6;
/// How far a block's ground is worn round its buildings, metres, and how much further it wanders.
const YARD_M: f64 = 9.0;
const YARD_WANDER_M: f64 = 12.0;
/// The records of a tile that is grass (its own, or Daggerfall's random ground), water, or out of the table.
const GRASS: u8 = 2;
const LAST_RECORD: u8 = 55;

/// A model stood on the land: its id, its origin (east, south, up), its yaw in degrees clockwise from north, whether
/// it is a building, and the ground it covers (west, north, east, south).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Seated {
    pub model: u32,
    pub at: [f64; 3],
    pub yaw: f64,
    pub building: bool,
    pub footprint: [f64; 4],
    /// A building's type as its block keeps it (a tavern, a house, a temple); 0 for a prop.
    #[serde(skip)]
    pub purpose: u8,
    /// Whether a body walks into it: its doors stand open onto rooms of its own.
    pub open: bool,
    /// Whether it stands on the ground as the plan found it, so it follows the ground as it is laid (settle.rs).
    #[serde(skip)]
    pub grounded: bool,
}

/// A tile of a block's streets or yards laid on the land: its middle, its byte as the block keeps it, and the quarter
/// turns its block was turned by.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Tile {
    pub at: [f64; 2],
    pub byte: u8,
    pub turns: u8,
    /// The ground's height at its corners (north-west, north-east, south-east, south-west) once laid, metres.
    pub corners: [f64; 4],
}

/// Everything a layout stands: the blocks it used, and their buildings, props, tiles, plinths and pads.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Seating {
    pub blocks: Vec<Placed>,
    pub buildings: Vec<Seated>,
    pub props: Vec<Seated>,
    pub tiles: Vec<Tile>,
    pub solids: Vec<Solid>,
    /// The rooms of the buildings walked into: their linings, floors, ceilings and stairs.
    pub rooms: Vec<Solid>,
    /// Boxes a body meets that are not each one solid: a room's walls, floors, ceilings and stairs, a wing too low to
    /// enter.
    #[serde(skip)]
    pub walls: Vec<crate::collide::Box3>,
    pub pads: Vec<Pad>,
    /// Each bridge, from its deck's one end to the other and how far either side its pieces stand, so it is moved as
    /// a whole.
    #[serde(skip)]
    pub bridges: Vec<[f64; 5]>,
}

/// A block a layout stood: its name, its middle and its quarter turns.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Placed {
    pub name: String,
    pub at: [f64; 2],
    pub turns: u8,
}

/// A point of a block (east of its west edge, south of its north edge) where the block stands with its middle at
/// `at`, turned `turns` quarter turns clockwise.
#[must_use]
pub fn turned(point: [f64; 2], at: [f64; 2], turns: u8) -> [f64; 2] {
    let (east, south) = (point[0] - BLOCK_M / 2.0, point[1] - BLOCK_M / 2.0);
    let (east, south) = match turns % 4 {
        0 => (east, south),
        1 => (-south, east),
        2 => (-east, -south),
        _ => (south, -east),
    };
    [at[0] + east, at[1] + south]
}

/// A model's footprint (west, north, east, south) where it stands at `origin` turned `yaw` degrees.
fn footprint(measure: &crate::book::Measure, origin: [f64; 2], yaw: f64) -> [f64; 4] {
    let (sine, cosine) = land::exact::sin_cos(yaw.to_radians());
    let corners = [
        [measure.min[0], measure.min[2]],
        [measure.max[0], measure.min[2]],
        [measure.max[0], measure.max[2]],
        [measure.min[0], measure.max[2]],
    ];
    let start = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
    corners.iter().fold(start, |[west, north, east, south], &[x, z]| {
        let (world_x, world_y) = (origin[0] + x * cosine + z * sine, origin[1] + x * sine - z * cosine);
        [west.min(world_x), north.min(world_y), east.max(world_x), south.max(world_y)]
    })
}

/// Whether a point is on the section's land: in the field, claimed, dry and not too steep to stand on.
fn holds(field: &Field, section: &[bool], at: [f64; 2]) -> bool {
    field.cell_of(at[0], at[1]).is_some_and(|(column, row)| {
        let cell = field.index(column, row);
        section[cell] && field.water[cell] == Water::Dry
    })
}

/// The ground heights under a footprint grown by `grow` metres: its corners, edges' middles and middle.
fn under(ground: &Ground, print: [f64; 4], grow: f64) -> Option<(f64, f64)> {
    let [west, north, east, south] = [print[0] - grow, print[1] - grow, print[2] + grow, print[3] + grow];
    let (middle_x, middle_y) = ((west + east) / 2.0, (north + south) / 2.0);
    let points = [
        (west, north),
        (middle_x, north),
        (east, north),
        (west, middle_y),
        (middle_x, middle_y),
        (east, middle_y),
        (west, south),
        (middle_x, south),
        (east, south),
    ];
    let mut range = (f64::INFINITY, f64::NEG_INFINITY);
    for (x, y) in points {
        if ground.water_at(x, y) != WaterAt::Dry {
            return None;
        }
        let height = ground.height_at(x, y);
        range = (range.0.min(height), range.1.max(height));
    }
    Some(range)
}

/// How many square metres of a block's buildings the land would hold, the block standing at `at` turned `turns`.
#[must_use]
pub fn fit(book: &Book, block: &RmbBlock, field: &Field, section: &[bool], at: [f64; 2], turns: u8) -> f64 {
    block
        .buildings
        .iter()
        .filter_map(|row| {
            let measure = book.measure(row[0] as u32, true)?;
            let origin = turned([row[1], row[2]], at, turns);
            let print = footprint(measure, origin, row[4] + 90.0 * f64::from(turns));
            let corners = [[print[0], print[1]], [print[2], print[1]], [print[2], print[3]], [print[0], print[3]]];
            let flat = corners
                .iter()
                .map(|&[x, y]| field.height_near(x, y))
                .fold((f64::INFINITY, f64::NEG_INFINITY), |range, height| (range.0.min(height), range.1.max(height)));
            (corners.iter().all(|&corner| holds(field, section, corner)) && flat.1 - flat.0 <= SEAT_RELIEF_M)
                .then(|| (print[2] - print[0]) * (print[3] - print[1]))
        })
        .sum()
}

/// Stands a block on the land at `at` turned `turns`, into `seating`; `section` says which of the field's cells it may
/// stand on, and a building overlapping one already seated is left out.
pub fn seat(
    seating: &mut Seating,
    book: &Book,
    block: &RmbBlock,
    ground: &Ground,
    field: &Field,
    section: &[bool],
    placement: ([f64; 2], u8),
) {
    let (at, turns) = placement;
    let quarter = 90.0 * f64::from(turns);
    let first_building = seating.buildings.len();
    let overlaps = |print: [f64; 4], others: &[Seated]| {
        others.iter().any(|other| {
            let theirs = other.footprint;
            print[0] < theirs[2] && print[2] > theirs[0] && print[1] < theirs[3] && print[3] > theirs[1]
        })
    };
    for row in &block.buildings {
        let Some(measure) = book.measure(row[0] as u32, true) else { continue };
        let origin = turned([row[1], row[2]], at, turns);
        let yaw = (row[4] + quarter) % 360.0;
        let print = footprint(measure, origin, yaw);
        let corners = [[print[0], print[1]], [print[2], print[1]], [print[2], print[3]], [print[0], print[3]]];
        if !corners.iter().all(|&corner| holds(field, section, corner)) || overlaps(print, &seating.buildings) {
            continue;
        }
        let Some((lowest, highest)) = under(ground, print, 0.3) else { continue };
        if highest - lowest > SEAT_RELIEF_M {
            continue;
        }
        let level = ((highest - SINK_M) * 20.0).round() / 20.0;
        if level - lowest > 0.12 {
            let base = lowest - FOOTING_M;
            let size = [print[2] - print[0] + 0.3, print[3] - print[1] + 0.3, level - base];
            let middle = [(print[0] + print[2]) / 2.0, (print[1] + print[3]) / 2.0, base];
            seating.solids.push(Solid::upright(Shape::Block, middle, size, Material::Stone));
        }
        seating.pads.push(Pad::flat(print, level));
        seating.buildings.push(Seated {
            model: row[0] as u32,
            at: [origin[0], origin[1], level + row[3]],
            yaw,
            building: true,
            footprint: print,
            purpose: row[5] as u8,
            open: false,
            grounded: false,
        });
    }
    let standing = &seating.buildings[first_building..];
    let level_at = |x: f64, y: f64| {
        standing
            .iter()
            .find(|seated| {
                x >= seated.footprint[0]
                    && x <= seated.footprint[2]
                    && y >= seated.footprint[1]
                    && y <= seated.footprint[3]
            })
            .map_or_else(|| ground.height_at(x, y), |seated| seated.at[2])
    };
    let mut props = Vec::new();
    for row in &block.props {
        let origin = turned([row[1], row[2]], at, turns);
        if !holds(field, section, origin) {
            continue;
        }
        let yaw = (row[4] + quarter) % 360.0;
        let print = book
            .measure(row[0] as u32, false)
            .map_or([origin[0], origin[1], origin[0], origin[1]], |measure| footprint(measure, origin, yaw));
        props.push(Seated {
            model: row[0] as u32,
            at: [origin[0], origin[1], level_at(origin[0], origin[1]) + row[3]],
            yaw,
            building: false,
            footprint: print,
            purpose: 0,
            open: false,
            grounded: true,
        });
    }
    let mut tiles = Vec::new();
    for (index, &byte) in ground_tiles(block).iter().enumerate() {
        let record = byte & 63;
        if record == GRASS || record == 0 || record > LAST_RECORD {
            continue;
        }
        let local = [((index % 16) as f64 + 0.5) * TILE_M, ((index / 16) as f64 + 0.5) * TILE_M];
        let middle = turned(local, at, turns);
        let covered = standing.iter().any(|seated| {
            let print = seated.footprint;
            middle[0] > print[0] && middle[0] < print[2] && middle[1] > print[1] && middle[1] < print[3]
        });
        // A block's open ground is worn only near its buildings: its yards and the streets between them, to a ragged
        // edge, so the block's square never shows on the land.
        let near = standing.iter().map(|seated| gap_to(seated.footprint, middle)).fold(f64::INFINITY, f64::min);
        let wear = YARD_M + YARD_WANDER_M * (0.5 + 0.5 * fbm(seed_of_block(at), middle[0] / 40.0, middle[1] / 40.0, 2));
        if !covered && near <= wear && holds(field, section, middle) {
            tiles.push(Tile { at: middle, byte, turns, corners: [0.0; 4] });
        }
    }
    seating.props.extend(props);
    seating.tiles.extend(tiles);
    seating.blocks.push(Placed { name: block.name.clone(), at, turns });
}

/// How far a point lies outside a footprint, metres; 0 inside it.
fn gap_to(print: [f64; 4], at: [f64; 2]) -> f64 {
    let across = (print[0] - at[0]).max(at[0] - print[2]).max(0.0);
    let down = (print[1] - at[1]).max(at[1] - print[3]).max(0.0);
    (across * across + down * down).sqrt()
}

/// A seed for a block's wear, from where it stands.
fn seed_of_block(at: [f64; 2]) -> u32 {
    land::exact::hash32(&[at[0].round() as i64, at[1].round() as i64])
}

/// The point of a seated block nearest its middle that a path can end at: on one of its streets' tiles if it has any,
/// clear of its buildings, else its middle.
#[must_use]
pub fn hub(seating: &Seating, at: [f64; 2]) -> [f64; 2] {
    seating
        .tiles
        .iter()
        .filter(|tile| distance(tile.at, at) <= BLOCK_M)
        .min_by(|first, second| distance(first.at, at).total_cmp(&distance(second.at, at)))
        .map_or(at, |tile| tile.at)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_quarter_turn_takes_a_block_s_north_to_its_east() {
        let middle = [1000.0, 2000.0];
        let north = [BLOCK_M / 2.0, 0.0];
        let turned_north = turned(north, middle, 1);
        assert!((turned_north[0] - (1000.0 + BLOCK_M / 2.0)).abs() < 1e-9 && (turned_north[1] - 2000.0).abs() < 1e-9);
        assert_eq!(turned(north, middle, 4), turned(north, middle, 0));
    }

    #[test]
    fn a_footprint_turned_a_quarter_swaps_its_width_and_depth() {
        let measure = crate::book::Measure {
            min: [-5.0, 0.0, -2.0],
            max: [5.0, 4.0, 2.0],
            grid: None,
            plan: Vec::new(),
            doors: Vec::new(),
        };
        let straight = footprint(&measure, [0.0, 0.0], 0.0);
        let quarter = footprint(&measure, [0.0, 0.0], 90.0);
        assert!((straight[2] - straight[0] - 10.0).abs() < 1e-9 && (straight[3] - straight[1] - 4.0).abs() < 1e-9);
        assert!((quarter[2] - quarter[0] - 4.0).abs() < 1e-9 && (quarter[3] - quarter[1] - 10.0).abs() < 1e-9);
    }
}
