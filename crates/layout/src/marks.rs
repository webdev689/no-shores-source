//! What stands at a layout's beacons and resource nodes: a beacon's brazier on a stone plinth in a ring of standing
//! stones; and at each resource node the place its island's resource comes from (content/gear/resources.json), its
//! node standing before it: Brineglass's tide pool, Cairn Iron's cairn, Heartwood Resin's old stump, Sunstone's warm
//! stones, Goldgrass's tall grass, Mistbloom's flowers, Windthistle's thistles, Bog Pearl's black pool and
//! Rimecrystal's frost.

use crate::pieces::{Kit, ahead};
use crate::rocks::stone;
use crate::sites::{Site, SiteKind};
use city::solids::{Material, Shape, Solid};
use std::f64::consts::TAU;

/// Builds what stands at each beacon and resource site.
pub fn build(kit: &mut Kit, sites: &[Site]) {
    for site in sites {
        match (site.kind, site.holds.as_deref()) {
            (SiteKind::Beacon, _) => beacon(kit, site.at),
            (SiteKind::Resource, Some(resource)) => resource_place(kit, resource, site.at),
            _ => {}
        }
    }
}

/// A beacon: an iron brazier glowing on a stone plinth, in a ring of five standing stones.
fn beacon(kit: &mut Kit, at: [f64; 2]) {
    let ground = kit.height(at);
    kit.solid(Solid::upright(
        Shape::Column { sides: 8, top: 0.85 },
        [at[0], at[1], ground - 0.3],
        [1.6, 1.6, 1.5],
        Material::Stone,
    ));
    kit.solid(Solid::upright(
        Shape::Column { sides: 8, top: 1.4 },
        [at[0], at[1], ground + 1.2],
        [0.9, 0.9, 0.45],
        Material::Iron,
    ));
    kit.solid(Solid::upright(
        Shape::Pyramid { top: 0.2 },
        [at[0], at[1], ground + 1.55],
        [0.7, 0.7, 0.55],
        Material::Glow,
    ));
    let start = kit.draw() * TAU;
    for standing in 0..5 {
        let spot = ahead(at, [0.0, -1.0], 3.2, start + f64::from(standing) * TAU / 5.0);
        let lean = (kit.draw() - 0.5) * 0.12;
        let size = [0.6, 0.45, 1.4 + kit.draw() * 0.8];
        let upright = Solid::upright(Shape::Block, [spot[0], spot[1], kit.height(spot) - 0.3], size, Material::Stone);
        kit.solid(Solid { lean, ..upright.turned(start + f64::from(standing) * TAU / 5.0) });
    }
}

/// A landing zone's beacon fire: a stone fire basket burning on a low cairn of two courses of rubble.
pub(crate) fn landing_fire(kit: &mut Kit, at: [f64; 2]) {
    let stones = (Shape::Column { sides: 7, top: 0.8 }, Material::Rubble);
    part(kit, stones, at, 0.2, [2.2, 2.0, 0.7], 0.3, 0.0);
    part(kit, stones, at, -0.3, [1.5, 1.35, 0.7], 1.1, 0.0);
    part(kit, (Shape::Column { sides: 8, top: 1.4 }, Material::Stone), at, -0.95, [0.9, 0.9, 0.45], 0.0, 0.0);
    part(kit, (Shape::Pyramid { top: 0.2 }, Material::Glow), at, -1.3, [0.7, 0.7, 0.55], 0.0, 0.0);
}

/// A solid standing on the ground at `spot`, sunk `sunk` metres, turned `turn` and leaning `lean` radians.
fn part(
    kit: &mut Kit,
    (shape, material): (Shape, Material),
    spot: [f64; 2],
    sunk: f64,
    size: [f64; 3],
    turn: f64,
    lean: f64,
) {
    let upright = Solid::upright(shape, [spot[0], spot[1], kit.height(spot) - sunk], size, material);
    kit.solid(Solid { lean, ..upright.turned(turn) });
}

/// A stem on the ground at `spot`, turned `turn` and leaned `lean`, with its head set on its tip, sunk 5 cm onto it.
fn stem_and_head(
    kit: &mut Kit,
    spot: [f64; 2],
    stem: (Shape, Material, [f64; 3]),
    head: (Shape, Material, [f64; 3]),
    (turn, lean): (f64, f64),
) {
    let (shape, material, size) = stem;
    let upright = Solid::upright(shape, [spot[0], spot[1], kit.height(spot)], size, material).turned(turn);
    let stem = Solid { lean, ..upright };
    let [x, y, z] = stem.place([0.0, 0.0, size[2]]);
    kit.solid(stem);
    let (shape, material, size) = head;
    kit.solid(Solid::upright(shape, [x, y, z - 0.05], size, material).turned(turn));
}

/// `count` spots round `at` between `from` and `to` metres out, each at a turn of its own.
fn round(kit: &mut Kit, at: [f64; 2], count: u32, (from, to): (f64, f64)) -> Vec<([f64; 2], f64)> {
    let start = kit.draw() * TAU;
    (0..count)
        .map(|each| {
            let angle = start + f64::from(each) * TAU / f64::from(count) + (kit.draw() - 0.5) * 0.6;
            (ahead(at, [0.0, -1.0], from + kit.draw() * (to - from), angle), angle)
        })
        .collect()
}

/// The place an island's resource comes from, by its id.
fn resource_place(kit: &mut Kit, resource: &str, at: [f64; 2]) {
    match resource {
        "brineglass" => brineglass(kit, at),
        "cairn_iron" => cairn_iron(kit, at),
        "heartwood_resin" => heartwood_resin(kit, at),
        "sunstone" => sunstone(kit, at),
        "goldgrass_seed" => goldgrass(kit, at),
        "mistbloom" => mistbloom(kit, at),
        "windthistle" => windthistle(kit, at),
        "bog_pearl" => bog_pearl(kit, at),
        "rimecrystal" => rimecrystal(kit, at),
        _ => {}
    }
}

/// Brineglass: a tide pool ringed with wet stones, salt grown pale as glass in shards at its rim.
fn brineglass(kit: &mut Kit, at: [f64; 2]) {
    let rim = round(kit, at, 8, (1.5, 1.8));
    // Level at the lowest ground under its rim, so on a slope it is neither buried nor afloat.
    let low = rim.iter().map(|&(spot, _)| kit.height(spot)).fold(kit.height(at), f64::min);
    let pool = Solid::upright(
        Shape::Column { sides: 12, top: 1.0 },
        [at[0], at[1], low - 0.02],
        [3.0, 3.0, 0.06],
        Material::Water,
    );
    kit.solid(pool);
    for (spot, _) in rim {
        let across = 0.5 + kit.draw() * 0.5;
        stone(kit, Shape::Dome { sides: 6 }, [spot[0], spot[1], kit.height(spot)], [across, across * 0.8, 0.35], 0.2);
    }
    for (spot, angle) in round(kit, at, 7, (0.9, 1.4)) {
        let tall = 0.4 + kit.draw() * 0.6;
        let shard = (Shape::Pyramid { top: 0.1 }, Material::Bone);
        let tipped = (kit.draw() - 0.5) * 0.7;
        part(kit, shard, spot, 0.05, [0.22, 0.22, tall], angle, tipped);
    }
}

/// Cairn Iron: a highland cairn of stacked stones, rust-dark iron seams weathering out of it, ore at its foot.
fn cairn_iron(kit: &mut Kit, at: [f64; 2]) {
    for (tier, (across, rise)) in [(2.4, 0.0), (1.7, 0.6), (1.0, 1.1)].into_iter().enumerate() {
        let spot = [at[0] + (kit.draw() - 0.5) * 0.2, at[1] + (kit.draw() - 0.5) * 0.2];
        let stones = (Shape::Column { sides: 7, top: 0.8 }, Material::Rubble);
        let turned = kit.draw() * TAU;
        part(kit, stones, spot, 0.2 - rise, [across, across * 0.9, 0.75], turned, 0.0);
        let seam = ahead(spot, [0.0, -1.0], across * 0.42, f64::from(tier as u8) * 2.1 + kit.draw());
        let iron = (Shape::Block, Material::Iron);
        part(kit, iron, seam, 0.1 - rise, [0.14, across * 0.5, 0.55], f64::from(tier as u8) * 2.1, 0.0);
    }
    for (spot, angle) in round(kit, at, 5, (1.5, 2.2)) {
        let across = 0.3 + kit.draw() * 0.3;
        part(kit, (Shape::Dome { sides: 6 }, Material::Iron), spot, 0.05, [across, across, 0.25], angle, 0.0);
    }
}

/// Heartwood Resin: the broad stump of an old tree on its roots, amber bled down its bark and pooled at its foot.
fn heartwood_resin(kit: &mut Kit, at: [f64; 2]) {
    part(kit, (Shape::Column { sides: 10, top: 0.85 }, Material::Timber), at, 0.1, [1.6, 1.6, 1.3], 0.0, 0.0);
    for (spot, angle) in round(kit, at, 5, (0.8, 1.0)) {
        // Its own +y faces the stump: leaned back, it rises into the stump and dives into the ground outward.
        part(kit, (Shape::Block, Material::Timber), spot, 0.15, [0.35, 1.1, 0.35], angle, -0.5);
    }
    for (_, angle) in round(kit, at, 6, (0.0, 0.0)) {
        let rise = 0.3 + kit.draw() * 0.8;
        // On the bark: the stump narrows from 0.8 m round at its foot (0.1 m down) to 0.68 m at its top (1.3 m up).
        let bark = 0.8 - 0.12 * (rise + 0.1) / 1.3;
        let spot = ahead(at, [0.0, -1.0], bark, angle);
        part(kit, (Shape::Dome { sides: 6 }, Material::Gold), spot, -rise, [0.22, 0.18, 0.2], angle, 0.0);
    }
    for (spot, angle) in round(kit, at, 3, (1.0, 1.2)) {
        part(kit, (Shape::Dome { sides: 8 }, Material::Gold), spot, 0.02, [0.5, 0.4, 0.08], angle, 0.0);
    }
}

/// Sunstone: desert stones bedded in sand, some of them holding the day's heat and glowing with it.
fn sunstone(kit: &mut Kit, at: [f64; 2]) {
    let turned = kit.draw() * TAU;
    part(kit, (Shape::Dome { sides: 10 }, Material::Earth), at, 0.15, [3.2, 2.8, 0.35], turned, 0.0);
    for (spot, _) in round(kit, at, 3, (0.3, 1.2)) {
        let across = 0.8 + kit.draw() * 0.6;
        stone(kit, Shape::Pyramid { top: 0.4 }, [spot[0], spot[1], kit.height(spot)], [across, across * 0.8, 0.9], 0.2);
    }
    for (spot, angle) in round(kit, at, 6, (0.6, 1.5)) {
        let across = 0.3 + kit.draw() * 0.25;
        part(kit, (Shape::Dome { sides: 6 }, Material::Glow), spot, 0.0, [across, across * 0.85, 0.3], angle, 0.0);
    }
}

/// Goldgrass: a stand of the tall grass gone gold, leaning every way, its seed heads at the top.
fn goldgrass(kit: &mut Kit, at: [f64; 2]) {
    for (spot, angle) in round(kit, at, 18, (0.1, 1.5)) {
        let tall = 1.2 + kit.draw() * 0.7;
        let lean = 0.1 + kit.draw() * 0.3;
        part(kit, (Shape::Pyramid { top: 0.0 }, Material::Straw), spot, 0.05, [0.14, 0.14, tall], angle, lean);
    }
}

/// Mistbloom: a low mound of leaves, pale flowers open over it.
fn mistbloom(kit: &mut Kit, at: [f64; 2]) {
    let turned = kit.draw() * TAU;
    part(kit, (Shape::Dome { sides: 10 }, Material::Verdant), at, 0.1, [2.6, 2.2, 0.55], turned, 0.0);
    for (spot, angle) in round(kit, at, 9, (0.3, 1.2)) {
        let stem = (Shape::Column { sides: 5, top: 1.0 }, Material::Verdant, [0.05, 0.05, 0.6]);
        stem_and_head(kit, spot, stem, (Shape::Dome { sides: 6 }, Material::Linen, [0.3, 0.3, 0.16]), (angle, 0.15));
    }
}

/// Windthistle: thistles on the open steppe, their heads gone to white down.
fn windthistle(kit: &mut Kit, at: [f64; 2]) {
    for (spot, angle) in round(kit, at, 8, (0.2, 1.4)) {
        let tall = 0.7 + kit.draw() * 0.5;
        let shade = if kit.draw() < 0.5 { Material::Crimson } else { Material::Linen };
        let stem = (Shape::Column { sides: 5, top: 0.7 }, Material::Verdant, [0.08, 0.08, tall]);
        stem_and_head(kit, spot, stem, (Shape::Dome { sides: 6 }, shade, [0.26, 0.26, 0.24]), (angle, 0.1));
        for (leaf, turn) in round(kit, spot, 2, (0.15, 0.2)) {
            part(kit, (Shape::Pyramid { top: 0.0 }, Material::Verdant), leaf, 0.0, [0.3, 0.06, 0.35], turn, 0.7);
        }
    }
}

/// Bog Pearl: a pool of black water in a rim of dark mud, shellfish heaped on its edge, a dull pearl or two among them.
fn bog_pearl(kit: &mut Kit, at: [f64; 2]) {
    let turned = kit.draw() * TAU;
    part(kit, (Shape::Dome { sides: 12 }, Material::Black), at, 0.12, [3.2, 2.9, 0.22], turned, 0.0);
    part(kit, (Shape::Column { sides: 12, top: 1.0 }, Material::Water), at, -0.08, [2.3, 2.1, 0.04], 0.0, 0.0);
    for (spot, angle) in round(kit, at, 9, (1.2, 1.6)) {
        let across = 0.22 + kit.draw() * 0.14;
        part(kit, (Shape::Dome { sides: 6 }, Material::Bone), spot, -0.05, [across, across * 0.7, 0.12], angle, 0.3);
    }
    for (spot, angle) in round(kit, at, 2, (1.3, 1.45)) {
        part(kit, (Shape::Dome { sides: 8 }, Material::Linen), spot, -0.03, [0.12, 0.12, 0.1], angle, 0.0);
    }
}

/// Rimecrystal: a frozen rock, spikes of frost that never melts grown out of it and round it.
fn rimecrystal(kit: &mut Kit, at: [f64; 2]) {
    stone(kit, Shape::Dome { sides: 7 }, [at[0], at[1], kit.height(at)], [2.0, 1.7, 0.9], 0.15);
    for (spot, angle) in round(kit, at, 9, (0.9, 1.4)) {
        let tall = 0.5 + kit.draw() * 0.9;
        let lean = (kit.draw() - 0.5) * 0.8;
        part(kit, (Shape::Pyramid { top: 0.05 }, Material::Bone), spot, 0.1, [0.3, 0.26, tall], angle, lean);
    }
    // Bedded in the rock: sunk a quarter of its 0.9 m, it stands about 0.68 m at its crown and 0.6 m a third of a
    // metre off it.
    for (spot, angle) in round(kit, at, 3, (0.0, 0.35)) {
        let tall = 0.4 + kit.draw() * 0.5;
        part(kit, (Shape::Pyramid { top: 0.05 }, Material::Bone), spot, -0.5, [0.24, 0.2, tall], angle, 0.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::book::Book;
    use crate::seat::Seating;
    use land::edits::Edits;
    use land::grid::Grid;
    use land::ground::Ground;

    #[test]
    fn every_islands_pile_rests_on_the_ground_or_on_itself_in_colours_of_its_own() {
        let land = Grid::new(40, 40, -1000.0, -1000.0, 50.0).like(100.0);
        let coast = land.like(land::relief::COAST_REACH_M);
        let ground = Ground::new(&land, &coast, &vec![0.0; land.data.len()], &[], &Edits::default(), 1);
        let book = Book::default();
        for continent in 1..=9 {
            let resource = crate::resources::of(&format!("continent-{continent}")).expect("each island's resource");
            let mut seating = Seating::default();
            let mut kit = Kit { ground: &ground, book: &book, seed: 7, draws: 0, into: &mut seating };
            resource_place(&mut kit, resource, [0.0, 0.0]);
            let solids = &seating.solids;
            assert!(!solids.is_empty(), "{resource} has a pile");
            for (nth, solid) in solids.iter().enumerate() {
                // A climate's wall pictures read as a wall's, not as salt, frost or pearl.
                assert!(!matches!(solid.material, Material::Plaster | Material::Trim), "{resource}: {solid:?}");
                let [west, north, east, south, bottom, _] = solid.bounds();
                let on_ground = bottom <= ground.height_at(solid.at[0], solid.at[1]) + 0.02;
                let on_another = solids.iter().enumerate().any(|(other, under)| {
                    let [its_west, its_north, its_east, its_south, low, top] = under.bounds();
                    let over = its_west < east && its_east > west && its_north < south && its_south > north;
                    other != nth && low < bottom && top >= bottom && over
                });
                assert!(on_ground || on_another, "{resource}: part {nth} afloat: {solid:?}");
            }
        }
    }
}
