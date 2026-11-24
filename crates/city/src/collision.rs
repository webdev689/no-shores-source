//! What a body runs into in a city: every solid of the plan reaching into a rectangle, as a box square to the world
//! (west, north, east, south, top, bottom), the shape the movement rules stand bodies against. Only the social space is
//! walked, so only what stands round it is ever asked for.

use crate::Plan;
use crate::hug::KEEP_M;
use crate::solids::{Material, Shape, Solid};

/// A box a body runs into: west, north, east and south edges, its top and its underside, metres.
pub type Box2 = [f64; 6];

/// Solids lower than this over their foot are stepped over and left out, metres.
const LEAST_HEIGHT_M: f64 = 0.3;
/// An arch's opening as a share of its width, as the page draws it (`solidMesh.ts`, `OPENING_WIDTH`).
pub(crate) const ARCH_OPENING_WIDTH: f64 = 0.8;

/// The most of a solid's boxes over any one 2 m square of ground (a cell of the movement rules' grid, whose every box a
/// tick tests), and the most boxes a square metre of its footprint, though never fewer than `FEWEST_ALLOWED`: what a
/// room's file and a tick may spend on one solid. One boxed within `KEEP_M` that costs more (a wide dome, a landmark's
/// spire leaning out of true) is boxed with its keep a quarter looser at a time until it fits.
pub const MOST_OVER_A_CELL: usize = 64;
pub(crate) const MOST_A_SQUARE_METRE: f64 = 1.0;
pub(crate) const FEWEST_ALLOWED: usize = 256;
const CELL_M: f64 = 2.0;
pub const LOOSER: f64 = 1.25;
pub const MOST_LOOSENINGS: u32 = 20;

/// A solid as boxes that keep within 0.45 m of it (`hug`), or as near as its cost allows (`kept`), each underside where
/// it really is: a roof, a lintel or a hung lamp over the floor is walked under. Natural rock and a module are their
/// parts' boxes (a module's surfaces after its first carry none), so a body walks under a cave roof, through a rock
/// arch and into a stall; an arch is its jambs and the head over its crown, so a body walks through it.
#[must_use]
pub fn boxes(solid: &Solid) -> Vec<Box2> {
    kept(solid).0
}

/// A solid's boxes and how many times `KEEP_M` they keep within, within the budget above. Layers take the fewest
/// boxes; a layered solid whose layers crowd the ground takes terraces at the same keep before it loosens.
#[must_use]
pub fn kept(solid: &Solid) -> (Vec<Box2>, f64) {
    let [width, depth, _] = solid.size;
    let allowed = allowed_over(width * depth);
    // A try stops as soon as it takes more boxes than allowed, so a great spire's tight tries cost no more than one.
    let fitting = |terraced: bool, loosened: f64| {
        boxed_at_most(solid, loosened, terraced, allowed).filter(|found| crowding(found) <= MOST_OVER_A_CELL)
    };
    let terraced = crate::hug::is_layered(solid.shape);
    let mut loosened = 1.0;
    for _ in 0..MOST_LOOSENINGS {
        if let Some(found) = fitting(false, loosened).or_else(|| if terraced { fitting(true, loosened) } else { None })
        {
            return (found, loosened);
        }
        loosened *= LOOSER;
    }
    (boxed(solid, loosened, false), loosened)
}

/// Whether a solid is boxed as if it stood upright: a built one leaning or rolling so little no point of it moves
/// further than `STILL_M` (rock keeps its own tilt).
fn is_still(solid: &Solid) -> bool {
    !crate::rock::is_rock(solid.shape) && crate::hug::tilt_move(solid) <= crate::hug::STILL_M
}

/// How many boxes a piece of this footprint may take, square metres.
fn allowed_over(footprint: f64) -> usize {
    FEWEST_ALLOWED.max(floor_count(footprint * MOST_A_SQUARE_METRE))
}

/// Whether a piece of this footprint (square metres) may stand as these boxes: few enough, and none crowding the
/// ground. A prop is held to it as a solid is.
#[must_use]
pub fn affordable(boxes: &[Box2], footprint: f64) -> bool {
    boxes.len() <= allowed_over(footprint) && crowding(boxes) <= MOST_OVER_A_CELL
}

/// How many whole boxes `share` allows, none for less than one.
fn floor_count(share: f64) -> usize {
    let whole = share.floor();
    if whole >= 1.0 { whole as usize } else { 0 }
}

/// The most boxes whose footprints reach into any one cell of a `CELL_M` grid laid from their north-west corner.
pub(crate) fn crowding(boxes: &[Box2]) -> usize {
    let west = boxes.iter().map(|found| found[0]).fold(f64::INFINITY, f64::min);
    let north = boxes.iter().map(|found| found[1]).fold(f64::INFINITY, f64::min);
    let east = boxes.iter().map(|found| found[2]).fold(f64::NEG_INFINITY, f64::max);
    let south = boxes.iter().map(|found| found[3]).fold(f64::NEG_INFINITY, f64::max);
    if !(west <= east && north <= south) {
        return 0;
    }
    let cell = |from: f64, at: f64| floor_count((at - from) / CELL_M);
    let (columns, rows) = (cell(west, east) + 1, cell(north, south) + 1);
    let mut counts = vec![0_usize; columns * rows];
    for &[box_west, box_north, box_east, box_south, ..] in boxes {
        for row in cell(north, box_north)..=cell(north, box_south) {
            for column in cell(west, box_west)..=cell(west, box_east) {
                counts[row * columns + column] += 1;
            }
        }
    }
    counts.into_iter().max().unwrap_or(0)
}

/// A solid's boxes with its keep `loosened` times over, its layers `terraced` or not.
pub(crate) fn boxed(solid: &Solid, loosened: f64, terraced: bool) -> Vec<Box2> {
    boxed_at_most(solid, loosened, terraced, usize::MAX).unwrap_or_default()
}

/// A solid's boxes as `boxed`, or none once they number more than `most` or a part's halving stops short of its keep;
/// with no bound (`usize::MAX`), every box, a piece that halving stops short of boxed whole.
fn boxed_at_most(solid: &Solid, loosened: f64, terraced: bool, most: usize) -> Option<Vec<Box2>> {
    let (shaped, keep) = crate::hug::keeps_of(solid.shape);
    // A solid still enough is boxed upright. A round standing so whose width and depth differ by twice `KEEP_M` at
    // most is boxed as a circle of their mean, square to the world, as a circle is the same however it is turned: its
    // boxes are its parts, so its parts may stand all of `KEEP_M` off it, less how far the circle stands off it.
    let still = is_still(solid);
    // The page's faces lie inside the round the parts keep to: the parts keep that much closer to it, and a keep too
    // tight to leave room for it does not fit.
    let sag = crate::hug::facet_sag(solid.shape, solid.size);
    let [width, depth, height] = solid.size;
    let round =
        matches!(solid.shape, Shape::Column { .. } | Shape::Dome { .. }) && (width - depth).abs() <= 2.0 * KEEP_M;
    let (solid, shaped) = if still && round {
        let mean = (width + depth) / 2.0;
        let circle = Solid { size: [mean, mean, height], turn: 0.0, lean: 0.0, roll: 0.0, ..*solid };
        (circle, KEEP_M - (width - depth).abs() / 4.0)
    } else if still {
        (Solid { lean: 0.0, roll: 0.0, ..*solid }, shaped)
    } else {
        (*solid, shaped)
    };
    let budget = shaped * loosened - sag;
    if budget < shaped * loosened / 2.0 && most != usize::MAX {
        return None;
    }
    let mut found = Vec::new();
    for part in crate::hug::shape_parts(solid.shape, solid.size, budget.max(shaped * loosened / 2.0), terraced) {
        // A part halving cannot keep so close does not fit at this keep either.
        let kept = if most == usize::MAX {
            crate::hug::part_boxes(&solid, part, keep * loosened)
        } else {
            crate::hug::part_boxes_kept(&solid, part, keep * loosened)?
        };
        found.extend(kept);
        if found.len() > most {
            return None;
        }
    }
    Some(found)
}

/// A city's solid as its boxes, but for the ground's own surfaces and what is stepped over.
pub(crate) fn into_boxes(solid: &Solid) -> Vec<Box2> {
    if matches!(solid.material, Material::Paving | Material::Path | Material::Lawn | Material::Earth)
        || solid.size[2] < LEAST_HEIGHT_M
    {
        return Vec::new();
    }
    boxes(solid)
}

/// The plan's solids reaching into `bounds` (west, north, east, south), as boxes. A solid is boxed only where its box
/// round its turned corners, grown by `KEEP_M`, reaches in: a solid boxed upright or as a circle reaches that much
/// further at most.
#[must_use]
pub fn boxes_within(plan: &Plan, bounds: [f64; 4]) -> Vec<Box2> {
    let reaches = |solid: &&Solid| {
        let [west, north, east, south, ..] = solid.bounds();
        west - KEEP_M <= bounds[2]
            && east + KEEP_M >= bounds[0]
            && north - KEEP_M <= bounds[3]
            && south + KEEP_M >= bounds[1]
    };
    plan.social
        .solids
        .iter()
        .chain(&plan.landmark)
        .chain(&plan.works)
        .filter(reaches)
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
        let layers = into_boxes(&roof);
        // Layered as its slopes narrow, the lowest as wide as the roof's foot, none under it.
        assert_eq!(layers[0][..4], [-5.0, -40.0, 5.0, 40.0]);
        assert_eq!(layers[0][5], 16.0);
        assert!(layers.iter().all(|&[.., top, bottom]| bottom >= 16.0 && top <= 19.0) && layers.len() > 1);
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
    fn a_turned_length_of_quay_is_boxed_in_strips_that_keep_to_it() {
        let quay = Solid::upright(Shape::Block, [0.0, 0.0, -4.0], [8.0, 90.0, 7.0], Material::Stone).turned(-1.16);
        let boxes = into_boxes(&quay);
        assert!(boxes.len() > 10, "{}", boxes.len());
        // Every box's middle lies within the quay's half width (and a strip's slant) of its middle line.
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
