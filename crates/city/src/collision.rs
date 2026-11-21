//! What a body runs into in a city: every solid of the plan reaching into a rectangle, as a box square to the world
//! (west, north, east, south, top, bottom), the shape the movement rules stand bodies against. Only the social space is
//! walked, so only what stands round it is ever asked for.

use crate::Plan;
use crate::solids::{Material, Shape, Solid};
use land::exact::sin_cos;

/// A box a body runs into: west, north, east and south edges, its top and its underside, metres.
pub type Box2 = [f64; 6];

/// Solids lower than this over their foot are stepped over and left out, metres.
const LEAST_HEIGHT_M: f64 = 0.3;
/// An arch's opening as a share of its width, as the page draws it (`solidMesh.ts`, `OPENING_WIDTH`).
const ARCH_OPENING_WIDTH: f64 = 0.8;

/// A solid as a box, its underside where it really is: a roof, a lintel or a hung lamp over the floor is walked under.
/// Natural rock and a module are their parts' boxes (a module's surfaces after its first carry none), so a body walks
/// under a cave roof, through a rock arch and into a stall; an arch is its jambs and the head over its crown, so a
/// body walks through it.
pub(crate) fn into_boxes(solid: &Solid) -> Vec<Box2> {
    if matches!(solid.material, Material::Paving | Material::Path | Material::Lawn | Material::Earth)
        || solid.size[2] < LEAST_HEIGHT_M
    {
        return Vec::new();
    }
    if crate::rock::is_rock(solid.shape) {
        return crate::rock::boxes(solid);
    }
    let own = |part: [f64; 6]| {
        let [west, north, east, south, bottom, top] = solid.bounds_of(part);
        [west, north, east, south, top, bottom]
    };
    let [width, depth, height] = solid.size;
    let (half_width, half_depth) = (width / 2.0, depth / 2.0);
    if let Shape::Arch { opening } = solid.shape {
        let radius = half_width * ARCH_OPENING_WIDTH;
        let crown = opening.clamp(0.05, 0.95) * height;
        return vec![
            own([-half_width, -half_depth, 0.0, -radius, half_depth, height]),
            own([radius, -half_depth, 0.0, half_width, half_depth, height]),
            own([-radius, -half_depth, crown, radius, half_depth, height]),
        ];
    }
    // A round column as three boxes inside its round, crossed, so none reaches past it into its corners.
    if matches!(solid.shape, Shape::Column { .. }) && solid.lean == 0.0 && solid.roll == 0.0 {
        let [x, y, z] = solid.at;
        return [22.5_f64, 45.0, 67.5]
            .map(|degrees| {
                let (sine, cosine) = sin_cos(degrees.to_radians());
                let [across, along] = [half_width * cosine, half_depth * sine];
                [x - across, y - along, x + across, y + along, z + height, z]
            })
            .to_vec();
    }
    // A block turned off the world's axes (a length of quay, a pier) in slices, so its boxes keep to it.
    if solid.shape == Shape::Block && solid.lean == 0.0 && solid.roll == 0.0 {
        return crate::rock::sliced(solid, vec![[-half_width, -half_depth, 0.0, half_width, half_depth, height]]);
    }
    vec![own([-half_width, -half_depth, 0.0, half_width, half_depth, height])]
}

/// The plan's solids reaching into `bounds` (west, north, east, south), as boxes.
#[must_use]
pub fn boxes_within(plan: &Plan, bounds: [f64; 4]) -> Vec<Box2> {
    plan.social
        .solids
        .iter()
        .chain(&plan.landmark)
        .chain(&plan.works)
        .flat_map(into_boxes)
        .filter(|found| {
            found[0] <= bounds[2] && found[2] >= bounds[0] && found[1] <= bounds[3] && found[3] >= bounds[1]
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paving_and_low_kerbs_are_stepped_over() {
        let paving = Solid::upright(Shape::Block, [0.0, 0.0, 10.0], [100.0, 100.0, 0.05], Material::Paving);
        let kerb = Solid::upright(Shape::Block, [0.0, 0.0, 10.0], [5.0, 1.0, 0.2], Material::Stone);
        let parapet = Solid::upright(Shape::Block, [0.0, 0.0, 9.0], [5.0, 1.0, 2.1], Material::Stone);
        assert_eq!(into_boxes(&paving), Vec::<Box2>::new());
        assert_eq!(into_boxes(&kerb), Vec::<Box2>::new());
        assert_eq!(into_boxes(&parapet), vec![[-2.5, -0.5, 2.5, 0.5, 11.1, 9.0]]);
    }

    #[test]
    fn a_roof_over_the_floor_comes_back_with_its_underside() {
        let roof = Solid::upright(Shape::Gable, [0.0, 0.0, 16.0], [10.0, 80.0, 3.0], Material::Roof);
        let column = Solid::upright(Shape::Block, [0.0, 0.0, 10.0], [1.0, 1.0, 6.0], Material::Stone);
        assert_eq!(into_boxes(&roof), vec![[-5.0, -40.0, 5.0, 40.0, 19.0, 16.0]]);
        assert_eq!(into_boxes(&column), vec![[-0.5, -0.5, 0.5, 0.5, 16.0, 10.0]]);
    }

    #[test]
    fn an_arch_is_walked_through_under_its_crown() {
        let arch = Solid::upright(Shape::Arch { opening: 0.8 }, [0.0, 0.0, 0.0], [10.0, 1.0, 10.0], Material::Trim);
        let boxes = into_boxes(&arch);
        assert_eq!(boxes.len(), 3, "two jambs and the head");
        assert!(
            boxes.iter().all(|&[west, _, east, _, _, bottom]| east <= -4.0 + 1e-9
                || west >= 4.0 - 1e-9
                || bottom >= 8.0 - 1e-9)
        );
    }

    #[test]
    fn a_modules_later_surfaces_run_into_nothing() {
        let Some(number) = crate::modules::number_of("old-stones") else { panic!("the Old Stones are a module") };
        let standing = crate::modules::solids(number, [0.0, 0.0, 0.0], 0.0);
        assert!(!into_boxes(&standing[0]).is_empty(), "the first surface carries the parts");
        for later in &standing[1..] {
            assert_eq!(into_boxes(later), Vec::<Box2>::new(), "a later surface is no box of its own");
        }
    }

    #[test]
    fn a_turned_length_of_quay_is_boxed_in_slices_that_keep_to_it() {
        let quay = Solid::upright(Shape::Block, [0.0, 0.0, -4.0], [8.0, 90.0, 7.0], Material::Stone).turned(-1.16);
        let boxes = into_boxes(&quay);
        assert!(boxes.len() > 10, "{}", boxes.len());
        // Every box's middle lies within the quay's half width (and a slice's lean) of its middle line.
        let way = {
            let [east, south, _] = quay.place([0.0, 1.0, 0.0]);
            [east, south]
        };
        for [west, north, east, south, top, bottom] in boxes {
            let (x, y) = ((west + east) / 2.0, (north + south) / 2.0);
            let off = (x * way[1] - y * way[0]).abs();
            assert!(off < 4.0 + 1.0 && top == 3.0 && bottom == -4.0, "{off} {top} {bottom}");
        }
        let square = Solid::upright(Shape::Block, [0.0, 0.0, 0.0], [8.0, 90.0, 7.0], Material::Stone);
        assert_eq!(into_boxes(&square), vec![[-4.0, -45.0, 4.0, 45.0, 7.0, 0.0]]);
    }

    #[test]
    fn natural_rock_is_its_parts_boxes() {
        let arch = Solid::upright(Shape::RockArch { seed: 3 }, [0.0, 0.0, 0.0], [12.0, 5.0, 10.0], Material::Rubble);
        let boxes = into_boxes(&arch);
        assert_eq!(boxes, crate::rock::boxes(&arch));
        assert!(
            boxes.len() > 1
                && !boxes.iter().any(|&[west, _, east, _, _, bottom]| west < 0.0 && east > 0.0 && bottom < 2.0)
        );
    }
}
