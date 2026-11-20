//! What stands at a layout's beacons and resource nodes, so each is a place in the land before its activity comes: a
//! beacon's brazier on a stone plinth in a ring of standing stones; ore as a broken outcrop seamed with metal; salvage
//! as broken timbers and stores; herbs by a gatherer's drying rack; timber as a stack of felled logs by a stump.

use crate::pieces::{Kit, ahead, model};
use crate::rocks::stone;
use crate::sites::{Site, SiteKind};
use city::solids::{Material, Shape, Solid};
use std::f64::consts::{FRAC_PI_2, TAU};

/// Builds what stands at each beacon and resource site.
pub fn build(kit: &mut Kit, sites: &[Site]) {
    for site in sites {
        match (site.kind, site.holds.as_deref()) {
            (SiteKind::Beacon, _) => beacon(kit, site.at),
            (SiteKind::Resource, Some("ore")) => ore(kit, site.at),
            (SiteKind::Resource, Some("salvage")) => salvage(kit, site.at),
            (SiteKind::Resource, Some("herbs")) => herbs(kit, site.at),
            (SiteKind::Resource, Some(_)) => timber(kit, site.at),
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

/// Ore: a broken outcrop of rubble seamed with metal, and its spoil round it.
fn ore(kit: &mut Kit, at: [f64; 2]) {
    let ground = kit.height(at);
    for _ in 0..3 {
        let spot = [at[0] + (kit.draw() - 0.5) * 3.0, at[1] + (kit.draw() - 0.5) * 3.0];
        let size = [2.0 + kit.draw() * 1.5, 1.6 + kit.draw() * 1.2, 1.6 + kit.draw() * 1.4];
        stone(kit, Shape::Pyramid { top: 0.4 }, [spot[0], spot[1], kit.height(spot)], size, 0.2);
    }
    for seam in 0..4 {
        let angle = f64::from(seam) * 1.4 + kit.draw();
        let spot = ahead(at, [0.0, -1.0], 0.8 + kit.draw() * 0.6, angle);
        let roll = (kit.draw() - 0.5) * 0.9;
        let upright = Solid::upright(Shape::Block, [spot[0], spot[1], ground + 0.2], [0.18, 1.4, 1.3], Material::Iron);
        kit.solid(Solid { roll, ..upright.turned(angle) });
    }
    for _ in 0..5 {
        let spot = ahead(at, [0.0, -1.0], 2.5 + kit.draw() * 2.5, kit.draw() * TAU);
        let across = 0.4 + kit.draw() * 0.5;
        stone(kit, Shape::Dome { sides: 6 }, [spot[0], spot[1], kit.height(spot)], [across, across, 0.3], 0.3);
    }
}

/// Salvage: broken timbers of a hull or a cart, and the stores spilt from it.
fn salvage(kit: &mut Kit, at: [f64; 2]) {
    let ground = kit.height(at);
    let turn = kit.draw() * TAU;
    for rib in 0..4 {
        let spot = ahead(at, [0.0, -1.0], f64::from(rib) * 1.1 - 1.6, turn);
        let lean = 0.5 + kit.draw() * 0.5;
        let upright = Solid::upright(
            Shape::Block,
            [spot[0], spot[1], ground - 0.3],
            [0.25, 0.3, 2.4 + kit.draw()],
            Material::Timber,
        );
        kit.solid(Solid { lean, ..upright.turned(turn + FRAC_PI_2) });
    }
    for _ in 0..3 {
        let spot = ahead(at, [0.0, -1.0], 2.0 + kit.draw() * 2.0, kit.draw() * TAU);
        let model = kit.pick(&model::CRATES);
        let yaw = kit.draw() * 360.0;
        kit.prop(model, spot, yaw);
    }
}

/// Herbs: a gatherer's drying rack of two posts and a bar hung with bundles.
fn herbs(kit: &mut Kit, at: [f64; 2]) {
    let ground = kit.height(at);
    let turn = kit.draw() * TAU;
    for side in [-1.0, 1.0] {
        let post = ahead(at, [0.0, -1.0], side * 1.1, turn + FRAC_PI_2);
        kit.solid(Solid::upright(
            Shape::Column { sides: 6, top: 1.0 },
            [post[0], post[1], ground - 0.2],
            [0.14, 0.14, 1.9],
            Material::Timber,
        ));
    }
    let bar =
        Solid::upright(Shape::Block, [at[0], at[1], ground + 1.6], [2.4, 0.1, 0.1], Material::Timber).turned(turn);
    kit.solid(bar);
    for bundle in 0..5 {
        let spot = ahead(at, [0.0, -1.0], f64::from(bundle) * 0.45 - 0.9, turn + FRAC_PI_2);
        kit.solid(Solid::upright(
            Shape::Pyramid { top: 0.5 },
            [spot[0], spot[1], ground + 1.15],
            [0.22, 0.22, 0.45],
            Material::Plaster,
        ));
    }
}

/// Timber: felled logs stacked three, two and one, and the stump of the last tree with its axe.
fn timber(kit: &mut Kit, at: [f64; 2]) {
    let turn = kit.draw() * TAU;
    let across = 0.55;
    // Rolled onto its side about its own y, a log runs along its own x from where it stands: so each stands half its
    // length back along it, and the stack's logs lie side by side along its own y.
    let (sine, cosine) = land::exact::sin_cos(turn);
    let (along, beside) = ([cosine, sine], [-sine, cosine]);
    let point = |from: [f64; 2], way: [f64; 2], out: f64| [from[0] + way[0] * out, from[1] + way[1] * out];
    // On the lowest ground under the stack, so no log's end hangs over a slope.
    let ground = [-2.3, 0.0, 2.3]
        .into_iter()
        .flat_map(|length| [-0.85, 0.0, 0.85].map(|width| point(point(at, along, length), beside, width)))
        .map(|spot| kit.height(spot))
        .fold(f64::INFINITY, f64::min);
    for (layer, count) in [(0, 3), (1, 2), (2, 1)] {
        for log in 0..count {
            let side = (f64::from(log) - f64::from(count - 1) / 2.0) * across;
            let length = 4.0 + kit.draw() * 0.6;
            let spot = point(point(at, beside, side), along, -length / 2.0);
            let upright = Solid::upright(
                Shape::Column { sides: 8, top: 1.0 },
                [spot[0], spot[1], ground + across / 2.0 + f64::from(layer) * across * 0.85],
                [across, across, length],
                Material::Timber,
            );
            kit.solid(Solid { roll: FRAC_PI_2, ..upright.turned(turn) });
        }
    }
    let stump = ahead(at, [0.0, -1.0], 3.0, turn);
    kit.solid(Solid::upright(
        Shape::Column { sides: 8, top: 0.95 },
        [stump[0], stump[1], kit.height(stump) - 0.1],
        [0.8, 0.8, 0.6],
        Material::Timber,
    ));
    kit.solid(
        Solid::upright(Shape::Block, [stump[0], stump[1], kit.height(stump) + 0.5], [0.08, 0.5, 0.25], Material::Iron)
            .turned(turn),
    );
}
