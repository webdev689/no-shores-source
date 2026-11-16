//! The landmarks that stand on their own ground: Elmhaven's Great Hall, Sunspire's Sun Dome, Goldreach's Granary Ring,
//! Mistfall's Stepped Temple and Windmere's Windwall.

use crate::landmarks::{Landmark, Site, ahead, block, column, round_point, turn_toward};
use crate::solids::{Material, Shape, Solid};
use land::ground::Ground;
use std::f64::consts::FRAC_PI_2;

/// Elmhaven's Great Hall: a timber hall of six tiers, each roofed, rising to a gilded spire 190 m up.
pub fn great_hall(site: &Site) -> Landmark {
    let turn = turn_toward(site.along);
    let mut solids = Vec::new();
    for tier in 0..6 {
        let shrink = 1.0 - 0.15 * f64::from(tier);
        let (width, depth, base) = (64.0 * shrink, 130.0 * shrink, site.level + 24.0 * f64::from(tier));
        solids.push(block(site.centre, base, [width, depth, 14.0], Material::Timber).turned(turn));
        let roof = Solid::upright(
            Shape::Gable,
            [site.centre[0], site.centre[1], base + 14.0],
            [width + 6.0, depth + 6.0, 14.0],
            Material::Roof,
        );
        solids.push(roof.turned(turn));
    }
    solids.push(column(site.centre, site.level + 148.0, 7.0, 42.0, 0.0, Material::Gold));
    Landmark { solids, reach: 80.0 }
}

/// Sunspire's Sun Dome: a ziggurat of five tiers, a golden dome on a drum, and a needle spire 340 m up.
pub fn sun_dome(site: &Site) -> Landmark {
    let mut solids: Vec<Solid> = (0..5)
        .map(|tier| {
            let side = 400.0 - 80.0 * f64::from(tier);
            block(site.centre, site.level + 24.0 * f64::from(tier), [side, side, 24.0], Material::Stone)
        })
        .collect();
    let top = site.level + 120.0;
    for step in 0..5 {
        // The stair up the seaward face: one flight a tier, each landing on the next tier's edge.
        let out = 200.0 - 40.0 * f64::from(step) - 6.0;
        let at = ahead(site.centre, site.seaward, out);
        solids.push(
            block(at, site.level + 24.0 * f64::from(step), [30.0, 30.0, 24.0], Material::Trim)
                .turned(turn_toward(site.seaward)),
        );
    }
    solids.extend([
        column(site.centre, top, 96.0, 8.0, 1.0, Material::Trim),
        Solid::upright(
            Shape::Dome { sides: 32 },
            [site.centre[0], site.centre[1], top + 8.0],
            [90.0, 90.0, 45.0],
            Material::Gold,
        ),
        column(site.centre, top + 53.0, 8.0, 170.0, 0.0, Material::Gold),
    ]);
    Landmark { solids, reach: 210.0 }
}

/// Goldreach's Granary Ring: nine round towers, walled between, round a round keep with a tall conical roof.
pub fn granary_ring(site: &Site, ground: &Ground) -> Landmark {
    const TOWERS: usize = 9;
    let mut solids = vec![
        column(site.centre, site.level, 68.0, 100.0, 1.0, Material::Plaster),
        column(site.centre, site.level + 100.0, 80.0, 40.0, 0.0, Material::Roof),
    ];
    let points: Vec<[f64; 2]> =
        (0..TOWERS).map(|tower| round_point(site.centre, 170.0, tower as f64 / TOWERS as f64)).collect();
    for (tower, point) in points.iter().enumerate() {
        let foot = ground.height_at(point[0], point[1]).max(site.level - 6.0);
        solids.push(column(*point, foot, 24.0, 60.0, 1.0, Material::Plaster));
        solids.push(column(*point, foot + 60.0, 29.0, 22.0, 0.0, Material::Roof));
        let next = points[(tower + 1) % TOWERS];
        let (east, south) = (next[0] - point[0], next[1] - point[1]);
        let chord = (east * east + south * south).sqrt();
        let middle = [(point[0] + next[0]) / 2.0, (point[1] + next[1]) / 2.0];
        let wall_foot = ground.height_at(middle[0], middle[1]).max(site.level - 6.0);
        let wall = block(middle, wall_foot, [5.0, chord - 22.0, 14.0], Material::Plaster);
        solids.push(wall.turned(turn_toward([east / chord, south / chord])));
    }
    Landmark { solids, reach: 190.0 }
}

/// Mistfall's Stepped Temple: nine steps of a pyramid, a stair up its seaward face, and a shrine on top 170 m up.
pub fn stepped_temple(site: &Site) -> Landmark {
    let turn = turn_toward(site.seaward);
    let mut solids = Vec::new();
    for step in 0..9 {
        let side = 220.0 - 22.0 * f64::from(step);
        solids.push(block(site.centre, site.level + 16.0 * f64::from(step), [side, side, 16.0], Material::Stone));
        let landing = ahead(site.centre, site.seaward, side / 2.0 + 5.0);
        solids
            .push(block(landing, site.level + 16.0 * f64::from(step), [24.0, 10.0, 16.0], Material::Trim).turned(turn));
    }
    let top = site.level + 144.0;
    solids.extend([
        block(site.centre, top, [30.0, 30.0, 16.0], Material::Plaster),
        Solid::upright(
            Shape::Pyramid { top: 0.0 },
            [site.centre[0], site.centre[1], top + 16.0],
            [38.0, 38.0, 22.0],
            Material::Roof,
        ),
    ]);
    Landmark { solids, reach: 120.0 }
}

/// Windmere's Windwall: a circle of standing stones round an altar, and seven windmill towers on the ring past it,
/// their sails to the sea wind.
pub fn windwall(site: &Site, ground: &Ground) -> Landmark {
    const STONES: usize = 24;
    const MILLS: usize = 7;
    let mut solids = vec![block(site.centre, site.level, [10.0, 6.0, 3.0], Material::Stone)];
    for stone in 0..STONES {
        let share = stone as f64 / STONES as f64;
        let at = round_point(site.centre, 60.0, share);
        let outward = [(at[0] - site.centre[0]) / 60.0, (at[1] - site.centre[1]) / 60.0];
        solids.push(block(at, site.level - 1.0, [4.0, 3.0, 15.0], Material::Stone).turned(turn_toward(outward)));
    }
    let facing = turn_toward(site.seaward);
    for mill in 0..MILLS {
        let at = round_point(site.centre, 260.0, (mill as f64 + 0.5) / MILLS as f64);
        let foot = ground.height_at(at[0], at[1]);
        solids.push(column(at, foot, 20.0, 110.0, 0.7, Material::Stone));
        solids.push(column(at, foot + 110.0, 17.0, 14.0, 0.0, Material::Roof));
        let hub = ahead(at, site.seaward, 9.0);
        for blade in 0..4 {
            let sail = Solid::upright(Shape::Block, [hub[0], hub[1], foot + 100.0], [3.5, 0.8, 38.0], Material::Timber);
            solids.push(Solid { roll: FRAC_PI_2 * f64::from(blade) + 0.4, ..sail.turned(facing) });
        }
    }
    Landmark { solids, reach: 80.0 }
}
