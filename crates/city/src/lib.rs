//! A port city's plan from its site, the same on the server and in every browser: World 2.0's settlement stages at a
//! city's scale (footprint, ways in, districts, terraces), its cells filled with Daggerfall's RMB blocks for the
//! forged models, its wall and harbour, its landmark, and its social space. Only the social space is walked; the rest
//! is seen.

pub mod articulation;
pub mod collision;
pub mod courtyard;
pub mod districts;
pub mod footprint;
pub mod grid;
pub mod landmarks;
pub mod landmarks_inland;
pub mod modules;
pub mod rmb;
pub mod rock;
pub mod social;
pub mod solids;
pub mod stations;
pub mod terraces;
pub mod walls;
pub mod ways;

use crate::districts::{District, fill};
use crate::footprint::{Footprint, SHORE_M};
use crate::grid::{Grid, SIDE_CELLS, index};
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

/// How far round the plaza the city must stand lower than it, and how much higher than that the plaza stands, metres:
/// over the roofs of the houses below, as Destiny 1's Tower stands over its City.
pub const OVERLOOK_M: f64 = 250.0;
pub const PLATFORM_RISE_M: f64 = 12.0;

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
    // The landmark and its plaza stand on one platform over the highest ground under both, so the plaza looks down
    // on the city round it; the landmark is planned twice, first only to learn how far its base reaches.
    let along = [-seaward[1], seaward[0]];
    let first =
        Site { centre, level: rounded(ground.height_at(centre[0], centre[1]).max(SHORE_M)), seaward, along, shore };
    let reach = landmark(&city.motif, &first, ground)
        .ok_or_else(|| format!("{}: no motif called {}", city.id, city.motif))?
        .reach;
    let base = [centre[0] - reach, centre[1] - reach, centre[0] + reach, centre[1] + reach];
    let plaza_at = social::plaza_bounds(centre, seaward, reach).0;
    let mut cell_footings = footings(ground, &grid, &footprint);
    let near_plaza =
        [plaza_at[0] - OVERLOOK_M, plaza_at[1] - OVERLOOK_M, plaza_at[2] + OVERLOOK_M, plaza_at[3] + OVERLOOK_M];
    let highest_near = (0..SIDE_CELLS * SIDE_CELLS)
        .filter_map(|at| match cell_footings[at] {
            Footing::Level { level } => {
                let bounds = grid.bounds(at % SIDE_CELLS, at / SIDE_CELLS);
                let near = bounds[2] > near_plaza[0]
                    && bounds[0] < near_plaza[2]
                    && bounds[3] > near_plaza[1]
                    && bounds[1] < near_plaza[3];
                near.then_some(level)
            }
            _ => None,
        })
        .fold(f64::MIN, f64::max);
    let level = terraces::platform_level(ground, &[base, plaza_at]).max(highest_near) + PLATFORM_RISE_M;
    let site = Site { level, ..first };
    let built =
        landmark(&city.motif, &site, ground).ok_or_else(|| format!("{}: no motif called {}", city.id, city.motif))?;
    let social = plaza(ground, centre, level, seaward, &built);
    // Only the cells under the landmark's base rise to the platform and are kept for it. The cells under the plaza keep
    // their own levels and are built on as any other: the plaza's pad stands over its own footprint, its parapet for a
    // wall, so what is built beneath it is hidden and the city runs right up to its foot, as round the Tower.
    let overlaps = |bounds: [f64; 4], other: [f64; 4]| {
        bounds[2] > other[0] && bounds[0] < other[2] && bounds[3] > other[1] && bounds[1] < other[3]
    };
    let base = [centre[0] - built.reach, centre[1] - built.reach, centre[0] + built.reach, centre[1] + built.reach];
    let reserved = |bounds: [f64; 4]| overlaps(bounds, base);
    let gate_rays = ways::gate_rays(ground, &footprint, seed);
    let gates: Vec<[f64; 2]> = gate_rays
        .iter()
        .map(|&ray| landmarks::ahead(centre, footprint.rays[ray].direction, footprint.rays[ray].reach))
        .collect();
    let harbour = ways::harbour(&footprint);
    let mut uses = vec![Use::Open; SIDE_CELLS * SIDE_CELLS];
    for row in 0..SIDE_CELLS {
        for column in 0..SIDE_CELLS {
            let bounds = grid.bounds(column, row);
            if reserved(bounds) && matches!(cell_footings[index(column, row)], Footing::Level { .. } | Footing::Steep) {
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
    // The plaza's pad stands over the cells under it: no terrace wall of theirs may cross it.
    works.extend(walls::retaining_walls(ground, &grid, &cell_footings).into_iter().filter(|wall| {
        let [west, north, east, south, _, _] = wall.bounds();
        !overlaps([west, north, east, south], social.bounds)
    }));
    let mut pads: Vec<Pad> = Vec::new();
    let mut cells = Vec::new();
    for row in 0..SIDE_CELLS {
        for column in 0..SIDE_CELLS {
            let footing = cell_footings[index(column, row)];
            if let Footing::Level { level } = footing {
                pads.push(Pad::flat(grid.bounds(column, row), level));
            }
            if footing != Footing::Outside {
                cells.push(Cell { column, row, footing, used: uses[index(column, row)].clone() });
            }
        }
    }
    pads.push(Pad::flat(social.bounds, level));
    let reach = built.reach;
    pads.push(Pad::flat([centre[0] - reach, centre[1] - reach, centre[0] + reach, centre[1] + reach], level));
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

/// Plans a landmass's city on its land and lays the plan's pads on its ground, so every later reading of the ground
/// stands on the city's terraces. The plan reads the ground without any pads. None for a landmass with no city.
pub fn settle(landmass: &mut land::landmass::Landmass, blocks: &Blocks) -> Result<Option<Plan>, String> {
    let Some(city) = landmass.edits.city.clone() else { return Ok(None) };
    landmass.surface.pads = land::pads::Pads::default();
    let planned = plan(&city, &landmass.surface, blocks)?;
    landmass.surface.pads = land::pads::Pads::from(planned.pads.clone());
    Ok(Some(planned))
}

/// The id of a city's social space as a node.
#[must_use]
pub fn social_id(city_id: &str) -> String {
    format!("{city_id}{}", land::sites::SOCIAL_SUFFIX)
}

/// Which cities' social spaces are open, and which Shape visits, by id (`content/world/social.json`, which the page
/// reads too): Overlook's alone for now, the other port cities' waiting, locked, for later.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SocialSpaces {
    open: Vec<String>,
    shape_visits: Vec<String>,
}

fn social_spaces() -> &'static SocialSpaces {
    static READ: std::sync::OnceLock<SocialSpaces> = std::sync::OnceLock::new();
    READ.get_or_init(|| {
        serde_json::from_str(include_str!("../../../content/world/social.json"))
            .expect("content/world/social.json reads: its test says so")
    })
}

/// Whether a city's social space is open.
#[must_use]
pub fn social_open(city_id: &str) -> bool {
    social_spaces().open.iter().any(|open| open == city_id)
}

/// Whether Shape visits a city's social space.
#[must_use]
pub fn shape_visits(city_id: &str) -> bool {
    social_spaces().shape_visits.iter().any(|visited| visited == city_id)
}

#[cfg(test)]
mod social_spaces_tests {
    #[test]
    fn only_overlooks_social_space_is_open_and_shape_visits_it_alone() {
        assert!(super::social_open("overlook") && super::shape_visits("overlook"));
        for city in ["sunspire", "rimeholt", "cairnwatch", "Overlook", ""] {
            assert!(!super::social_open(city) && !super::shape_visits(city), "{city}");
        }
    }
}
