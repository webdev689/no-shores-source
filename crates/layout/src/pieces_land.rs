//! The set pieces inland: a mill and its wheel, a quarry stepped into its slope, the bones of something enormous, a
//! broken causeway, a cave's mouth, and the bridges that carry paths and gorges over rivers.

use crate::areas::Area;
use crate::field::{Field, Water, distance, ring_holds};
use crate::pieces::{Kit, ahead, fire, lantern, model, turn_along, yaw_toward};
use city::solids::{Material, Shape, Solid};

/// A mill: a stone mill house under a pitched roof, its wheel turned on its side against the house's flank, the
/// millstones and sacks of the yard, a fence round it.
pub fn mill(kit: &mut Kit, area: &Area, toward: [f64; 2]) {
    let middle = area.at;
    let turn = turn_along(toward);
    let base = kit.height(middle) - 0.6;
    kit.solid(
        Solid::upright(Shape::Block, [middle[0], middle[1], base], [9.0, 12.0, 6.8], Material::Stone).turned(turn),
    );
    kit.solid(
        Solid::upright(Shape::Gable, [middle[0], middle[1], base + 6.8], [9.8, 12.8, 4.2], Material::Roof).turned(turn),
    );
    let across = [-toward[1], toward[0]];
    let wheel = [middle[0] + across[0] * 5.6, middle[1] + across[1] * 5.6];
    let axle = kit.height(wheel) + 0.3;
    let wheel_solid = Solid {
        roll: std::f64::consts::FRAC_PI_2,
        ..Solid::upright(
            Shape::Column { sides: 14, top: 1.0 },
            [wheel[0], wheel[1], axle],
            [7.0, 7.0, 1.2],
            Material::Timber,
        )
    };
    kit.solid(wheel_solid.turned(turn));
    for stone in 0..2 {
        let at = ahead(middle, toward, 9.0, 0.4 + f64::from(stone) * 0.5);
        kit.stand(Shape::Column { sides: 12, top: 1.0 }, at, [1.8, 1.8, 0.45], 0.0, Material::Stone, 0.1);
    }
    for crate_number in 0..5 {
        let at = ahead(middle, toward, 8.5, -0.5 - f64::from(crate_number) * 0.12);
        let model = kit.pick(&model::CRATES);
        kit.prop(model, at, f64::from(crate_number) * 17.0);
    }
    fence(kit, middle, toward, 16.0);
}

/// A rail fence round a point at `radius`, open on the side toward the way in.
fn fence(kit: &mut Kit, middle: [f64; 2], toward: [f64; 2], radius: f64) {
    let panels = (std::f64::consts::TAU * radius / 3.2) as u32;
    for panel in 0..panels {
        let angle = std::f64::consts::TAU * f64::from(panel) / f64::from(panels);
        if !(0.5..=std::f64::consts::TAU - 0.5).contains(&angle) {
            continue;
        }
        let at = ahead(middle, toward, radius, angle);
        let model = kit.pick(&model::FENCES);
        kit.prop(model, at, angle.to_degrees());
    }
}

/// A quarry: faces of cut stone stepped down into the slope, blocks lying ready, rubble, a timber crane and a cart.
pub fn quarry(kit: &mut Kit, area: &Area, toward: [f64; 2]) {
    let middle = area.at;
    let turn = turn_along(toward);
    for step in 0..4 {
        let at = ahead(middle, toward, -6.0 - f64::from(step) * 4.0, 0.0);
        let base = kit.height(at) - 2.0;
        let width = 18.0 - f64::from(step) * 2.5;
        kit.solid(
            Solid::upright(
                Shape::Block,
                [at[0], at[1], base],
                [width, 3.6, 3.0 + f64::from(step) * 1.6],
                Material::Stone,
            )
            .turned(turn),
        );
    }
    for block in 0..6 {
        let at = ahead(middle, toward, 4.0 + kit.draw() * 6.0, -1.0 + f64::from(block) * 0.4);
        let size = [1.2 + kit.draw(), 0.9 + kit.draw() * 0.6, 0.8 + kit.draw() * 0.5];
        let spin = kit.draw();
        kit.stand(Shape::Block, at, size, spin, Material::Stone, 0.05);
    }
    let crane = ahead(middle, toward, 2.0, 0.9);
    kit.stand(Shape::Column { sides: 6, top: 0.9 }, crane, [0.5, 0.5, 7.5], 0.0, Material::Timber, 0.3);
    let beam_base = kit.height(crane) + 6.6;
    let beam = Solid {
        lean: std::f64::consts::FRAC_PI_2 - 0.2,
        ..Solid::upright(Shape::Block, [crane[0], crane[1], beam_base], [0.35, 0.35, 6.0], Material::Timber)
    };
    kit.solid(beam.turned(turn));
    let cart = kit.pick(&model::CARTS);
    kit.prop(cart, ahead(middle, toward, 6.0, -1.1), yaw_toward(toward));
    for rubble in 0..5 {
        let at = ahead(middle, toward, -2.0 + kit.draw() * 4.0, 1.4 + f64::from(rubble) * 0.25);
        let model = kit.pick(&model::ROCKS);
        let yaw = kit.draw() * 360.0;
        kit.prop(model, at, yaw);
    }
}

/// The bones of something enormous: a ribcage of arches half sunk in the ground, a skull with its tusks, the
/// vertebrae of its spine running off into the grass.
pub fn bones(kit: &mut Kit, area: &Area, toward: [f64; 2]) {
    let middle = area.at;
    let along = turn_along(toward);
    for rib in 0..7 {
        let at = ahead(middle, toward, f64::from(rib) * 3.6 - 10.0, 0.0);
        let base = kit.height(at) - 1.5;
        let span = 13.0 - (f64::from(rib) - 3.0).abs() * 1.4;
        let rib_solid = Solid {
            lean: 0.08 * (f64::from(rib) - 3.0),
            ..Solid::upright(
                Shape::Arch { opening: 0.92 },
                [at[0], at[1], base],
                [span, 0.9, span * 0.75],
                Material::Bone,
            )
        };
        kit.solid(rib_solid.turned(along + std::f64::consts::FRAC_PI_2));
    }
    let skull = ahead(middle, toward, 18.0, 0.0);
    let base = kit.height(skull) - 1.2;
    kit.solid(
        Solid::upright(Shape::Dome { sides: 14 }, [skull[0], skull[1], base], [7.0, 9.0, 4.5], Material::Bone)
            .turned(along),
    );
    let across = [-toward[1], toward[0]];
    for side in [-1.0, 1.0] {
        let root =
            [skull[0] + across[0] * 2.8 * side + toward[0] * 3.0, skull[1] + across[1] * 2.8 * side + toward[1] * 3.0];
        let tusk = Solid {
            lean: 0.9,
            roll: 0.25 * side,
            ..Solid::upright(
                Shape::Column { sides: 8, top: 0.15 },
                [root[0], root[1], base + 1.0],
                [1.1, 1.1, 9.0],
                Material::Bone,
            )
        };
        kit.solid(tusk.turned(along));
    }
    for bone in 0..6 {
        let at = ahead(middle, toward, -14.0 - f64::from(bone) * 2.6, 0.12 * f64::from(bone));
        kit.stand(Shape::Column { sides: 8, top: 0.9 }, at, [1.6, 1.6, 1.2], along, Material::Bone, 0.4);
    }
}

/// A causeway: a raised road of paving on stone piers running across the area, broken at its middle where a span
/// has fallen, its stones lying below.
pub fn causeway(kit: &mut Kit, area: &Area, toward: [f64; 2]) {
    let middle = area.at;
    let turn = turn_along(toward);
    let deck = kit.height(middle).max(0.5) + 2.4;
    let spans = (area.radius * 1.6 / 6.0) as i32;
    for span in -spans / 2..=spans / 2 {
        if span.abs() <= 1 {
            let fallen = ahead(middle, toward, f64::from(span) * 6.0, 0.4);
            let spin = kit.draw();
            kit.stand(Shape::Block, fallen, [3.0, 2.2, 1.0], spin, Material::Stone, 0.3);
            continue;
        }
        let at = ahead(middle, toward, f64::from(span) * 6.0, 0.0);
        let ground = kit.height(at).min(deck - 0.5);
        kit.solid(
            Solid::upright(Shape::Block, [at[0], at[1], ground - 0.5], [3.4, 2.0, deck - ground], Material::Stone)
                .turned(turn),
        );
        kit.solid(Solid::upright(Shape::Block, [at[0], at[1], deck], [4.6, 6.0, 0.35], Material::Paving).turned(turn));
        let across = [-toward[1], toward[0]];
        for side in [-1.0, 1.0] {
            let rail = [at[0] + across[0] * 2.15 * side, at[1] + across[1] * 2.15 * side];
            kit.solid(
                Solid::upright(Shape::Block, [rail[0], rail[1], deck + 0.35], [0.3, 6.0, 0.9], Material::Stone)
                    .turned(turn),
            );
        }
    }
}

/// A cave's mouth in the slope, rocks heaped round it, a fire burning before it.
pub fn cave(kit: &mut Kit, area: &Area, toward: [f64; 2]) {
    let middle = area.at;
    let mouth = kit.pick(&model::CAVE_MOUTHS);
    kit.prop(mouth, middle, yaw_toward([-toward[0], -toward[1]]));
    for rock in 0..9 {
        let at = ahead(middle, toward, -2.0 + kit.draw() * 3.0, 0.9 + f64::from(rock) * 0.5);
        let model = kit.pick(&model::ROCKS);
        let yaw = kit.draw() * 360.0;
        kit.prop(model, at, yaw);
    }
    fire(kit, ahead(middle, toward, 9.0, 0.3), 1.2);
    lantern(kit, ahead(middle, toward, 5.0, 1.1), 2.4);
}

/// A bridge deck's thickness, metres: thick enough to be a collider (a body stands on it, not in the water under it).
pub const DECK_M: f64 = 0.5;
/// How far a bridge's rails stand out past its walked width's edge, metres: a rail laid in lengths on a slant boxes up
/// to 0.6 m wider than itself (halls.rs), so no rail's box reaches onto the way.
const RAIL_OUT_M: f64 = 0.8;
/// How far a deck reaches out along a lower bank to meet the land at the other's height, metres, at the most.
const BANK_REACH_M: f64 = 12.0;

/// A bridge over a river from bank to bank, `width` the way's walked width over it: a timber deck 0.3 m over the land
/// at its higher end, 3 m past each bank and on out along a lower bank (2 m at a time) until its two ends' land stands
/// within 0.15 m, so a body steps onto it at either end; on piles, with rails either side. Each is recorded, so it is
/// moved as a whole when the land under it settles.
pub fn bridge(kit: &mut Kit, banks: [[f64; 2]; 2], width: f64) {
    let [from, to] = banks;
    let (east, south) = (to[0] - from[0], to[1] - from[1]);
    let length = (east * east + south * south).sqrt();
    if length < 1.0 {
        return;
    }
    let way = [east / length, south / length];
    let (mut back, mut on) = (3.0, 3.0);
    loop {
        let (low_back, low_on) = (kit.height(ahead(from, way, -back, 0.0)), kit.height(ahead(to, way, on, 0.0)));
        if low_back < low_on - 0.15 && back < 3.0 + BANK_REACH_M {
            back += 2.0;
        } else if low_on < low_back - 0.15 && on < 3.0 + BANK_REACH_M {
            on += 2.0;
        } else {
            break;
        }
    }
    let (start, end) = (ahead(from, way, -back, 0.0), ahead(to, way, on, 0.0));
    let deck = kit.height(start).max(kit.height(end)) + 0.3;
    let span = distance(start, end);
    let middle = [(start[0] + end[0]) / 2.0, (start[1] + end[1]) / 2.0];
    let rail_out = width / 2.0 + RAIL_OUT_M;
    // Deck and rails in lengths, so on a slant each length's box keeps close to it and a body walks the deck.
    let mut lengths = Vec::new();
    crate::halls::wall(&mut lengths, start, end, deck - DECK_M, deck, 2.0 * (rail_out + 0.1), Material::Timber);
    let across = [-way[1], way[0]];
    let aside = |at: [f64; 2], side: f64| [at[0] + across[0] * rail_out * side, at[1] + across[1] * rail_out * side];
    for side in [-1.0, 1.0] {
        crate::halls::wall(&mut lengths, aside(start, side), aside(end, side), deck, deck + 1.0, 0.2, Material::Timber);
    }
    for length in lengths {
        kit.solid(length);
    }
    for side in [-1.0, 1.0] {
        let rail = aside(middle, side);
        for pile in 0..=(span / 4.0) as u32 {
            let at = ahead([rail[0], rail[1]], way, f64::from(pile) * 4.0 - span / 2.0, 0.0);
            let bottom = kit.height(at).min(deck) - 1.5;
            kit.solid(Solid::upright(
                Shape::Column { sides: 6, top: 1.0 },
                [at[0], at[1], bottom],
                [0.4, 0.4, deck + 1.1 - bottom],
                Material::Timber,
            ));
        }
    }
    kit.into.bridges.push([start[0], start[1], end[0], end[1], rail_out + 0.3]);
}

/// A footbridge wherever a gorge out of a claim (its capsule) meets a river on `field` inside the section (`ring`),
/// along the gorge.
pub fn footbridges(kit: &mut Kit, field: &Field, [x1, y1, x2, y2, _]: [f64; 5], ring: &[[f64; 2]]) {
    let steps = (distance([x1, y1], [x2, y2]) / 2.0).ceil() as usize;
    let along = |step: usize| {
        let share = step as f64 / steps.max(1) as f64;
        [x1 + (x2 - x1) * share, y1 + (y2 - y1) * share]
    };
    let wet = |step: usize| {
        let [x, y] = along(step);
        field.cell_of(x, y).is_some_and(|(column, row)| field.water[field.index(column, row)] == Water::River)
    };
    let mut entered = None;
    for step in 1..=steps {
        match (wet(step - 1), wet(step), entered) {
            (false, true, _) => entered = Some(step - 1),
            (true, false, Some(bank)) => {
                let banks = [along(bank), along(step)];
                if banks.iter().all(|at| ring_holds(ring, at[0], at[1])) {
                    bridge(kit, banks, crate::paths::Tier::Footpath.width());
                }
                entered = None;
            }
            _ => {}
        }
    }
}
