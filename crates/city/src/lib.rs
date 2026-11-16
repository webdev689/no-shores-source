//! A port city's plan from its site, the same on the server and in every browser: World 2.0's settlement stages at a
//! city's scale (footprint, ways in, districts, terraces), its cells filled with Daggerfall's RMB blocks for the
//! forged models, its wall and harbour, its landmark, and its social space. Only the social space is walked; the rest
//! is seen. See the Cities note in the bible.

pub mod districts;
pub mod footprint;
pub mod grid;
pub mod landmarks;
pub mod landmarks_inland;
pub mod rmb;
pub mod social;
pub mod solids;
pub mod terraces;
pub mod walls;
pub mod ways;

use crate::districts::{District, fill};
use crate::footprint::{Footprint, SHORE_M};
use crate::grid::{CELL_M, Grid, SIDE_CELLS, index};
use crate::landmarks::{Site, landmark};
use crate::rmb::Blocks;
use crate::social::{Social, plaza};
use crate::solids::Solid;
use crate::terraces::{Footing, footings, rounded};
use land::exact::seed_of;
use land::ground::Ground;
pub use land::pads::Pad;
use land::sites::City;
use serde::Serialize;

/// What a cell is used for.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "use", rename_all = "lowercase")]
pub enum Use {
    /// Not built: past the wall, the shore, a slope garden.
    Open,
    /// The landmark's own ground, or the social space's.
    Landmark,
    /// An avenue or a gate's square.
    Avenue,
    /// A block of a district: the RMB block that stands in it.
    Block { district: District, block: String },
}

/// One cell of the plan.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Cell {
    pub column: usize,
    pub row: usize,
    #[serde(flatten)]
    pub footing: Footing,
    #[serde(flatten)]
    pub used: Use,
}

/// A city's plan.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Plan {
    pub id: String,
    pub name: String,
    pub motif: String,
    pub centre: [f64; 2],
    pub grid: Grid,
    pub footprint: Footprint,
    pub cells: Vec<Cell>,
    pub gates: Vec<[f64; 2]>,
    pub harbour: Option<[f64; 2]>,
    pub landmark: Vec<Solid>,
    /// The wall, its towers and gatehouses, the quay and piers, and the terraces' retaining walls.
    pub works: Vec<Solid>,
    pub social: Social,
    /// The levels the city sets the land to, in order: later pads stand over earlier ones.
    pub pads: Vec<Pad>,
}

/// Plans a city on the land as the generator and the owner left it, before any city's pads. Fails for a motif the
/// planner does not know, or a site the sea surrounds.
pub fn plan(city: &City, ground: &Ground, blocks: &Blocks) -> Result<Plan, String> {
    let centre = [city.centre.x as f64, city.centre.y as f64];
    let seed = seed_of(0x0C17, &city.id);
    let grid = Grid::round(centre);
    let footprint = Footprint::cast(ground, centre);
    let seaward =
        footprint.seaward().ok_or_else(|| format!("{}: a port city needs a shore within its reach", city.id))?;
    let shore = footprint.rays[footprint.ray_toward(seaward[0], seaward[1])].reach;
    let level = rounded(ground.height_at(centre[0], centre[1]).max(SHORE_M));
    let site = Site { centre, level, seaward, along: [-seaward[1], seaward[0]], shore };
    let built =
        landmark(&city.motif, &site, ground).ok_or_else(|| format!("{}: no motif called {}", city.id, city.motif))?;
    let social = plaza(ground, centre, level, seaward, &built);
    let mut cell_footings = footings(ground, &grid, &footprint);
    let reserved = |bounds: [f64; 4]| {
        let landmark_reach = built.reach + 2.0 * CELL_M;
        let middle = [(bounds[0] + bounds[2]) / 2.0, (bounds[1] + bounds[3]) / 2.0];
        let near_landmark =
            (middle[0] - centre[0]).abs() < landmark_reach && (middle[1] - centre[1]).abs() < landmark_reach;
        let near_plaza = bounds[2] > social.bounds[0] - CELL_M
            && bounds[0] < social.bounds[2] + CELL_M
            && bounds[3] > social.bounds[1] - CELL_M
            && bounds[1] < social.bounds[3] + CELL_M;
        near_landmark || near_plaza
    };
    let gate_rays = ways::gate_rays(ground, &footprint, seed);
    let gates: Vec<[f64; 2]> = gate_rays
        .iter()
        .map(|&ray| landmarks::ahead(centre, footprint.rays[ray].direction, footprint.rays[ray].reach))
        .collect();
    let harbour = ways::harbour(&footprint);
    let mut uses = vec![Use::Open; SIDE_CELLS * SIDE_CELLS];
    for row in 0..SIDE_CELLS {
        for column in 0..SIDE_CELLS {
            if reserved(grid.bounds(column, row))
                && matches!(cell_footings[index(column, row)], Footing::Level { .. } | Footing::Steep)
            {
                uses[index(column, row)] = Use::Landmark;
                cell_footings[index(column, row)] = Footing::Level { level };
            }
        }
    }
    for start in gates.iter().chain(harbour.iter()) {
        let Some(cell) = ways::built_cell_near(&grid, &cell_footings, *start) else { continue };
        for (column, row) in ways::avenue(&cell_footings, cell).unwrap_or_default() {
            if uses[index(column, row)] == Use::Open {
                uses[index(column, row)] = Use::Avenue;
            }
        }
    }
    fill(&grid, &cell_footings, &mut uses, &footprint, blocks, seed);
    let mut works = walls::city_wall(ground, &footprint, &gate_rays);
    works.extend(walls::harbour_works(&footprint));
    works.extend(walls::retaining_walls(ground, &grid, &cell_footings));
    let mut pads: Vec<Pad> = Vec::new();
    let mut cells = Vec::new();
    for row in 0..SIDE_CELLS {
        for column in 0..SIDE_CELLS {
            let footing = cell_footings[index(column, row)];
            if let Footing::Level { level } = footing {
                pads.push(Pad { bounds: grid.bounds(column, row), level });
            }
            if footing != Footing::Outside {
                cells.push(Cell { column, row, footing, used: uses[index(column, row)].clone() });
            }
        }
    }
    pads.push(Pad { bounds: social.bounds, level });
    let reach = built.reach;
    pads.push(Pad { bounds: [centre[0] - reach, centre[1] - reach, centre[0] + reach, centre[1] + reach], level });
    Ok(Plan {
        id: city.id.clone(),
        name: city.name.clone(),
        motif: city.motif.clone(),
        centre,
        grid,
        footprint,
        cells,
        gates,
        harbour,
        landmark: built.solids,
        works,
        social,
        pads,
    })
}
