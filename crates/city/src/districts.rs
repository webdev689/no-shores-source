//! Stages C and D: World 2.0's districts, each kind seeded where its rule wants it and every built cell given to the
//! nearest seed, then each district's cells filled with RMB blocks of its own kinds, as Daggerfall's towns mix them.

use crate::footprint::Footprint;
use crate::grid::{CELL_M, Grid, REACH_CELLS, SIDE_CELLS, index};
use crate::rmb::Blocks;
use crate::terraces::Footing;
use crate::{Use, footprint::Stop};
use land::exact::{noise2, rand01};
use serde::Serialize;

/// A district's kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum District {
    Market,
    Noble,
    Temple,
    Guild,
    Harbour,
    Residential,
}

/// How many seeds each kind sows in a city.
const SEEDS: [(District, usize); 6] = [
    (District::Market, 3),
    (District::Noble, 2),
    (District::Temple, 3),
    (District::Guild, 3),
    (District::Harbour, 3),
    (District::Residential, 12),
];

/// The blocks a district stands, as shares out of ten: its own kinds first, then the houses and shops round them.
fn mix(district: District) -> &'static [(u32, &'static [&'static str])] {
    const SHOPS: &[&str] = &["ALCH", "ARMR", "BANK", "BOOK", "CLOT", "FURN", "GEMS", "GENR", "LIBR", "PAWN", "WEAP"];
    const GUILDS: &[&str] = &[
        "MAGE", "FIGH", "DARK", "THIE", "KCAN", "KDRA", "KFLA", "KHAW", "KHOR", "KOWL", "KRAV", "KROS", "KSCA", "KWHE",
    ];
    match district {
        District::Market => &[(3, &["MARK"]), (5, SHOPS), (2, &["TVRN"])],
        District::Noble => &[(4, &["PALA"]), (4, &["MANR"]), (2, &["BANK", "LIBR", "GEMS"])],
        District::Temple => &[(5, &["TEMP"]), (2, &["GRVE"]), (3, &["RESI"])],
        District::Guild => &[(5, GUILDS), (2, SHOPS), (3, &["RESI"])],
        District::Harbour => &[(4, &["TVRN"]), (2, &["GENR", "PAWN", "MARK"]), (4, &["RESI"])],
        District::Residential => &[(7, &["RESI"]), (2, SHOPS), (1, &["TVRN"])],
    }
}

/// Fills every open built cell with a block of its district, never the same block as the cell west or north of it
/// where the district has another.
pub fn fill(grid: &Grid, footings: &[Footing], uses: &mut [Use], footprint: &Footprint, blocks: &Blocks, seed: u32) {
    let middle = (REACH_CELLS, REACH_CELLS);
    let centre_level = match footings[index(middle.0, middle.1)] {
        Footing::Level { level } => level,
        _ => 0.0,
    };
    let radius = footprint.rays.iter().map(|ray| ray.reach).fold(CELL_M, f64::max);
    let shore: Vec<[f64; 2]> = footprint
        .rays
        .iter()
        .filter(|ray| ray.stop == Stop::Shore)
        .map(|ray| {
            [footprint.centre[0] + ray.direction[0] * ray.reach, footprint.centre[1] + ray.direction[1] * ray.reach]
        })
        .collect();
    let avenues: Vec<[f64; 2]> = (0..SIDE_CELLS * SIDE_CELLS)
        .filter(|&at| uses[at] == Use::Avenue)
        .map(|at| grid.centre(at % SIDE_CELLS, at / SIDE_CELLS))
        .collect();
    let nearest = |points: &[[f64; 2]], at: [f64; 2]| {
        points
            .iter()
            .map(|point| ((point[0] - at[0]) * (point[0] - at[0]) + (point[1] - at[1]) * (point[1] - at[1])).sqrt())
            .fold(f64::MAX, f64::min)
    };
    let open: Vec<(usize, [f64; 2], f64)> = (0..SIDE_CELLS * SIDE_CELLS)
        .filter_map(|at| match (&uses[at], footings[at]) {
            (Use::Open, Footing::Level { level }) => Some((at, grid.centre(at % SIDE_CELLS, at / SIDE_CELLS), level)),
            _ => None,
        })
        .collect();
    let mut seeds: Vec<(District, [f64; 2])> = Vec::new();
    for (district, count) in SEEDS {
        let score = |&(at, point, level): &(usize, [f64; 2], f64)| {
            let out = ((point[0] - footprint.centre[0]) * (point[0] - footprint.centre[0])
                + (point[1] - footprint.centre[1]) * (point[1] - footprint.centre[1]))
                .sqrt()
                / radius;
            let rise = (level - centre_level) / 40.0;
            match district {
                District::Market => -out - nearest(&avenues, point) / 600.0,
                District::Noble => rise - out,
                District::Temple => rise - 0.5 * out,
                District::Guild => -(out - 0.45).abs() - nearest(&avenues, point) / 800.0,
                District::Harbour => -nearest(&shore, point) / radius,
                District::Residential => rand01(seed, &[9, at as i64]),
            }
        };
        let mut ranked: Vec<&(usize, [f64; 2], f64)> = open.iter().collect();
        ranked.sort_by(|first, second| score(second).total_cmp(&score(first)).then(first.0.cmp(&second.0)));
        let spacing = radius / 6.0;
        let mut sown = 0;
        for &&(_, point, _) in &ranked {
            if sown == count {
                break;
            }
            let apart = seeds.iter().all(|(_, seeded)| {
                ((seeded[0] - point[0]) * (seeded[0] - point[0]) + (seeded[1] - point[1]) * (seeded[1] - point[1]))
                    .sqrt()
                    >= spacing
            });
            if apart {
                seeds.push((district, point));
                sown += 1;
            }
        }
    }
    if seeds.is_empty() {
        return;
    }
    for &(at, point, _) in &open {
        // The borders wander, as World 2.0's do, so no district is a straight-edged cell of the plan.
        let warp = |salt: u32| 0.4 * radius / 6.0 * noise2(seed + salt, point[0] / 900.0, point[1] / 900.0);
        let (warped_x, warped_y) = (point[0] + warp(3), point[1] + warp(4));
        let district = seeds
            .iter()
            .min_by(|first, second| {
                let distance = |seeded: &[f64; 2]| {
                    (seeded[0] - warped_x) * (seeded[0] - warped_x) + (seeded[1] - warped_y) * (seeded[1] - warped_y)
                };
                distance(&first.1).total_cmp(&distance(&second.1))
            })
            .map_or(District::Residential, |seeded| seeded.0);
        let (column, row) = (at % SIDE_CELLS, at / SIDE_CELLS);
        let roll = (rand01(seed, &[5, column as i64, row as i64]) * 10.0) as u32;
        let mut share = 0;
        let mut family: &[&str] = &["RESI"];
        for (part, prefixes) in mix(district) {
            share += part;
            if roll < share {
                family = prefixes;
                break;
            }
        }
        let names = blocks.family(family);
        if names.is_empty() {
            continue;
        }
        let neighbour = |column: Option<usize>, row: Option<usize>| match column
            .zip(row)
            .map(|(next_column, next_row)| &uses[index(next_column, next_row)])
        {
            Some(Use::Block { block, .. }) => Some(block.clone()),
            _ => None,
        };
        let (west, north) = (neighbour(column.checked_sub(1), Some(row)), neighbour(Some(column), row.checked_sub(1)));
        let first = (rand01(seed, &[6, column as i64, row as i64]) * names.len() as f64) as usize;
        let block = (0..names.len())
            .map(|step| names[(first + step) % names.len()])
            .find(|name| west.as_deref() != Some(*name) && north.as_deref() != Some(*name))
            .unwrap_or(names[first % names.len()]);
        uses[at] = Use::Block { district, block: block.to_owned() };
    }
}
