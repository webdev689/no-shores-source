//! The set pieces of the shore: the landing players come ashore at, a jetty and its stores, a wreck heeled over on
//! the strand, and a lighthouse on the point.

use crate::areas::Area;
use crate::pieces::{Kit, ahead, fire, lantern, model, turn_along, yaw_toward};
use city::solids::{Material, Shape, Solid};

/// How far a jetty or the landing's boardwalk reaches toward the sea at most, metres.
const JETTY_M: f64 = 34.0;

/// A boardwalk of planks on piles from a point toward the sea, as far as `reach` or the first deep water: a deck at
/// the height of its first plank, piles driven into the ground or the seabed under it. Answers its far end.
fn boardwalk(kit: &mut Kit, from: [f64; 2], seaward: [f64; 2], reach: f64, width: f64) -> [f64; 2] {
    let deck = kit.height(from).max(0.0) + 1.1;
    let turn = turn_along(seaward);
    let mut end = from;
    let steps = (reach / 2.0) as u32;
    for step in 0..steps {
        let at = ahead(from, seaward, f64::from(step) * 2.0 + 1.0, 0.0);
        let below = kit.height(at);
        if below < -3.0 {
            break;
        }
        kit.solid(
            Solid::upright(Shape::Block, [at[0], at[1], deck - 0.25], [width, 2.05, 0.25], Material::Timber)
                .turned(turn),
        );
        if step % 2 == 0 {
            let across = [-seaward[1], seaward[0]];
            for side in [-0.5, 0.5] {
                let pile = [at[0] + across[0] * width * side, at[1] + across[1] * width * side];
                let bottom = below.min(deck) - 1.0;
                kit.solid(Solid::upright(
                    Shape::Column { sides: 6, top: 1.0 },
                    [pile[0], pile[1], bottom],
                    [0.35, 0.35, deck + 0.9 - bottom],
                    Material::Timber,
                ));
            }
        }
        end = at;
    }
    end
}

/// The landing: open ground by the shore, a boardwalk out over the water where the sea is near, a signal lantern,
/// stores stacked by the path inland and a boat drawn up on the shingle.
pub fn landing(kit: &mut Kit, area: &Area, seaward: [f64; 2]) {
    let middle = area.at;
    let toward = if seaward == [0.0, 0.0] { [0.0, -1.0] } else { seaward };
    let shore = (0..40).map(|step| ahead(middle, toward, f64::from(step) * 4.0, 0.0)).find(|&at| !kit.dry(at));
    if let Some(water) = shore {
        let start = ahead(water, toward, -6.0, 0.0);
        boardwalk(kit, start, toward, JETTY_M, 3.0);
        let yaw = yaw_toward(toward);
        kit.prop(model::SHIP, ahead(water, toward, -14.0, 0.55), yaw + 70.0);
    }
    lantern(kit, ahead(middle, toward, 6.0, 0.9), 4.2);
    lantern(kit, ahead(middle, toward, 6.0, -0.9), 4.2);
    for crate_number in 0..6 {
        let at =
            ahead(middle, toward, -9.0 - f64::from(crate_number % 3) * 0.9, 1.6 + f64::from(crate_number / 3) * 0.12);
        let model = kit.pick(&model::CRATES);
        let yaw = kit.draw() * 30.0;
        kit.prop(model, at, yaw);
    }
    let sign = kit.pick(&model::SIGNPOSTS);
    kit.prop(sign, ahead(middle, toward, -12.0, -0.5), yaw_toward(toward));
}

/// A jetty and its stores: a long boardwalk out over the water, a lantern at its end, crates and carts on the shore.
pub fn dock(kit: &mut Kit, area: &Area, seaward: [f64; 2]) {
    let middle = area.at;
    let toward = if seaward == [0.0, 0.0] { [0.0, -1.0] } else { seaward };
    let end = boardwalk(kit, middle, toward, JETTY_M * 1.4, 4.0);
    lantern(kit, end, 3.0);
    for crate_number in 0..10 {
        let at =
            ahead(middle, toward, -5.0 - f64::from(crate_number % 4) * 0.9, -1.2 + f64::from(crate_number / 4) * 0.3);
        let model = kit.pick(&model::CRATES);
        let yaw = kit.draw() * 90.0;
        kit.prop(model, at, yaw);
    }
    let cart = kit.pick(&model::CARTS);
    kit.prop(cart, ahead(middle, toward, -9.0, 0.8), yaw_toward(toward) + 90.0);
}

/// A wreck: a ship driven up the strand and broken, its hull sunk in the sand, its ribs and a snapped mast lying
/// about it, a fire where the wreckers picked it over.
pub fn wreck(kit: &mut Kit, area: &Area, seaward: [f64; 2]) {
    let middle = area.at;
    let toward = if seaward == [0.0, 0.0] { [0.0, -1.0] } else { seaward };
    let yaw = yaw_toward(toward) + 35.0 + kit.draw() * 30.0;
    kit.prop(model::SHIP, middle, yaw);
    let along = turn_along([-toward[1], toward[0]]);
    for rib in 0..6 {
        let at = ahead(middle, toward, 16.0 + f64::from(rib) * 2.4, -0.4);
        let base = kit.height(at) - 0.6;
        let rib_solid = Solid {
            roll: 0.5,
            ..Solid::upright(Shape::Arch { opening: 0.9 }, [at[0], at[1], base], [6.0, 0.4, 3.0], Material::Timber)
        };
        kit.solid(rib_solid.turned(along));
    }
    let mast = ahead(middle, toward, -14.0, 0.7);
    let base = kit.height(mast) - 0.2;
    kit.solid(
        Solid {
            lean: 1.35,
            ..Solid::upright(
                Shape::Column { sides: 8, top: 0.8 },
                [mast[0], mast[1], base],
                [0.6, 0.6, 16.0],
                Material::Timber,
            )
        }
        .turned(along + 0.6),
    );
    fire(kit, ahead(middle, toward, -18.0, -0.6), 1.4);
}

/// A lighthouse on the point: a tall tapering stone tower, a gallery, a lantern room that glows, a keeper's hut.
pub fn lighthouse(kit: &mut Kit, area: &Area) {
    let middle = area.at;
    let base = kit.height(middle) - 1.0;
    let height = 22.0 + kit.draw() * 6.0;
    kit.solid(Solid::upright(
        Shape::Column { sides: 16, top: 0.7 },
        [middle[0], middle[1], base],
        [7.0, 7.0, height],
        Material::Plaster,
    ));
    let top = base + height;
    kit.solid(Solid::upright(
        Shape::Column { sides: 16, top: 1.0 },
        [middle[0], middle[1], top],
        [6.2, 6.2, 0.4],
        Material::Stone,
    ));
    kit.solid(Solid::upright(
        Shape::Column { sides: 8, top: 1.0 },
        [middle[0], middle[1], top + 0.4],
        [3.0, 3.0, 2.6],
        Material::Glow,
    ));
    kit.solid(Solid::upright(
        Shape::Dome { sides: 12 },
        [middle[0], middle[1], top + 3.0],
        [3.6, 3.6, 1.8],
        Material::Iron,
    ));
    let hut = ahead(middle, [0.0, 1.0], 9.0, kit.draw() * 6.0);
    let hut_base = kit.height(hut) - 0.3;
    kit.solid(Solid::upright(Shape::Block, [hut[0], hut[1], hut_base], [5.0, 4.0, 2.8], Material::Stone));
    kit.solid(Solid::upright(Shape::Gable, [hut[0], hut[1], hut_base + 2.8], [5.4, 4.4, 1.8], Material::Roof));
}

/// A graveyard of ships: great hulls and smaller ones driven up and left at every angle, half sunk in the ground,
/// their masts snapped and their timbers, crates and rigging strewn between them, a fire where scavengers camp. Its
/// middle, where its way ends, holds the salvage heaped there and the scavengers' fire, and the greatest hull lies
/// behind it from the way in.
pub fn hulks(kit: &mut Kit, area: &Area, toward: [f64; 2]) {
    let middle = area.at;
    let salvage = kit.pick(&model::CRATES);
    kit.prop(salvage, middle, yaw_toward(toward));
    // Out round the open middle, where its way ends and the way round it runs (`clearing::round_rim`).
    let hulls: [(u32, f64, f64); 5] = [
        (model::GREAT_SHIP, 60.0, 2.8),
        (model::SHIP, 46.0, 1.1),
        (model::SHIP, 50.0, 3.4),
        (model::GREAT_SHIP, 64.0, 4.9),
        (model::SHIP, 44.0, 2.3),
    ];
    for (number, &(hull, out, angle)) in hulls.iter().enumerate() {
        let at = ahead(middle, toward, out.min(area.radius * 0.7), angle + kit.draw() * 0.3);
        let yaw = yaw_toward(toward) + 40.0 * number as f64 + kit.draw() * 50.0;
        kit.prop(hull, at, yaw);
        // Its snapped mast stands askew by it, within the ground the hull covers, which every way goes round: one
        // lying its length along the ground would lie across a way that keeps off only its foot.
        let mast = [at[0] + kit.draw() * 4.0 - 2.0, at[1] + kit.draw() * 4.0 - 2.0];
        let base = kit.height(mast) - 0.3;
        let (lean, turn, length) =
            (0.15 + kit.draw() * 0.3, kit.draw() * std::f64::consts::TAU, 7.0 + kit.draw() * 5.0);
        let column = Shape::Column { sides: 8, top: 0.8 };
        let upright = Solid::upright(column, [mast[0], mast[1], base], [0.55, 0.55, length], Material::Timber);
        kit.solid(Solid { lean, ..upright }.turned(turn));
    }
    for plank in 0..24 {
        let at = ahead(middle, toward, kit.draw() * area.radius * 0.8, f64::from(plank) * 0.27);
        if kit.draw() < 0.5 {
            let model = kit.pick(&model::CRATES);
            let yaw = kit.draw() * 360.0;
            kit.prop(model, at, yaw);
        } else {
            let spin = kit.draw() * 3.0;
            let size = [0.35, 3.0 + kit.draw() * 4.0, 0.12];
            kit.stand(Shape::Block, at, size, spin, Material::Timber, 0.02);
        }
    }
    // The scavengers' fire beside the salvage at the middle, in the open ground the hulls leave there.
    fire(kit, ahead(middle, toward, 10.0, 1.6), 1.6);
}
