//! A landmark's great masses dressed as built stone: a cornice of trim along each block's top and pilasters standing
//! out along its faces a bay apart, so a wall a hundred metres long reads as masonry from the plaza and from the sea,
//! its pilasters throwing their shadows, and not as a box.

use crate::solids::{Material, Shape, Solid};
use land::exact::sin_cos;

/// A block at least this wide and deep, and this high, metres, is a mass worth dressing; a thinner one is a wall or a
/// pier, which reads as built already.
const LEAST_SIDE_M: f64 = 24.0;
const LEAST_HEIGHT_M: f64 = 6.0;
/// The bays between pilasters as near as a face's length allows, metres.
const BAY_M: f64 = 9.0;
/// A pilaster's width along its face and how far it stands out, metres.
const PILASTER_M: [f64; 2] = [1.6, 0.5];
/// The cornice's height and how far it overhangs the face, metres.
const CORNICE_M: [f64; 2] = [1.0, 0.6];

/// The solids with every great upright block of stone dressed: pilasters round its faces and a cornice on its top.
#[must_use]
pub fn articulated(solids: Vec<Solid>) -> Vec<Solid> {
    let mut dressed = Vec::with_capacity(solids.len());
    for solid in solids {
        let worth = solid.shape == Shape::Block
            && solid.material == Material::Stone
            && solid.lean == 0.0
            && solid.roll == 0.0
            && solid.size[0].min(solid.size[1]) >= LEAST_SIDE_M
            && solid.size[2] >= LEAST_HEIGHT_M;
        dressed.push(solid);
        if worth {
            dressed.extend(dress(&solid));
        }
    }
    dressed
}

/// A block's pilasters and cornice, turned as it is turned.
fn dress(block: &Solid) -> Vec<Solid> {
    let (sine, cosine) = sin_cos(block.turn);
    // The block's own x across and y along, in the world's east and south.
    let own_x = [cosine, sine];
    let own_y = [-sine, cosine];
    let [width, depth, height] = block.size;
    let place = |across: f64, along: f64| {
        [block.at[0] + own_x[0] * across + own_y[0] * along, block.at[1] + own_x[1] * across + own_y[1] * along]
    };
    let mut solids = Vec::new();
    // Each face: its middle's offset from the block's middle (across, along), its length, and which way it runs.
    let faces = [
        ([width / 2.0, 0.0], depth, false),
        ([-width / 2.0, 0.0], depth, false),
        ([0.0, depth / 2.0], width, true),
        ([0.0, -depth / 2.0], width, true),
    ];
    let pilaster_height = height - CORNICE_M[0];
    for ([across, along], length, runs_across) in faces {
        let bays = libm::round(length / BAY_M).max(1.0);
        let pitch = length / bays;
        let out = PILASTER_M[1] / 2.0;
        let mut bay = 1.0;
        while bay < bays {
            let step = pitch * bay - length / 2.0;
            let [x, y] = if runs_across {
                place(step, along + along.signum() * out)
            } else {
                place(across + across.signum() * out, step)
            };
            let size = if runs_across {
                [PILASTER_M[0], PILASTER_M[1], pilaster_height]
            } else {
                [PILASTER_M[1], PILASTER_M[0], pilaster_height]
            };
            solids.push(Solid::upright(Shape::Block, [x, y, block.at[2]], size, Material::Stone).turned(block.turn));
            bay += 1.0;
        }
    }
    let overhang = 2.0 * CORNICE_M[1];
    let cornice = Solid::upright(
        Shape::Block,
        [block.at[0], block.at[1], block.at[2] + height - CORNICE_M[0]],
        [width + overhang, depth + overhang, CORNICE_M[0]],
        Material::Trim,
    );
    solids.push(cornice.turned(block.turn));
    solids
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_great_block_gets_pilasters_round_it_and_a_cornice_and_a_thin_wall_is_left_alone() {
        let base = Solid::upright(Shape::Block, [100.0, 200.0, 10.0], [90.0, 45.0, 18.0], Material::Stone);
        let wall = Solid::upright(Shape::Block, [0.0, 0.0, 10.0], [200.0, 4.0, 12.0], Material::Stone);
        let dressed = articulated(vec![base, wall]);
        let cornices: Vec<&Solid> = dressed.iter().filter(|solid| solid.material == Material::Trim).collect();
        assert_eq!(cornices.len(), 1, "only the great block is dressed");
        let pilasters = dressed.len() - 3;
        assert_eq!(pilasters, 2 * (10 - 1) + 2 * (5 - 1), "a pilaster between each two bays round all four faces");
        let [west, north, east, south, _, top] = base.bounds();
        for solid in &dressed[1..dressed.len() - 2] {
            let [its_west, its_north, its_east, its_south, bottom, high] = solid.bounds();
            let outside = its_west < west || its_east > east || its_north < north || its_south > south;
            let near =
                its_west > west - 1.0 && its_east < east + 1.0 && its_north > north - 1.0 && its_south < south + 1.0;
            assert!(outside && near, "{solid:?}");
            assert!((bottom - 10.0).abs() < 1e-9 && high < top, "{solid:?}");
        }
    }

    #[test]
    fn a_turned_block_is_dressed_on_its_own_faces() {
        let turned = Solid::upright(Shape::Block, [0.0, 0.0, 0.0], [60.0, 30.0, 10.0], Material::Stone)
            .turned(core::f64::consts::FRAC_PI_2);
        let dressed = articulated(vec![turned]);
        let [west, north, east, south, _, _] = turned.bounds();
        for solid in &dressed[1..] {
            let [its_west, its_north, its_east, its_south, _, _] = solid.bounds();
            let near =
                its_west > west - 1.5 && its_east < east + 1.5 && its_north > north - 1.5 && its_south < south + 1.5;
            assert!(near, "{solid:?}");
        }
    }
}
