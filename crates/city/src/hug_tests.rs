use super::*;
use crate::solids::Material;

/// How far a point of a shape's own frame lies from it as the page draws it (`solidMesh.ts`), a round as wide as it is
/// deep: a round a polygon of its faces at every height, a dome's outline straight between its rings; in the plane
/// through the shape's axis and the point, how far the point lies from the shape's outline there.
fn distance_to(shape: Shape, [width, depth, height]: [f64; 3], [x, y, z]: [f64; 3]) -> f64 {
    let (half_width, half_depth) = (width / 2.0, depth / 2.0);
    let outward = |reach: f64, up: f64| -> f64 {
        // The outline as its reach at each height, sampled finely; a point inside is no distance off.
        (0..=2000)
            .map(|step| {
                let at = height * f64::from(step) / 2000.0;
                let wide = reach_at(shape, half_width, at, height);
                let (out, rise) = ((reach - wide).max(0.0), (up - at).abs());
                if (0.0..=height).contains(&up) && reach <= reach_at(shape, half_width, up, height) {
                    0.0
                } else {
                    (out * out + rise * rise).sqrt()
                }
            })
            .fold(f64::INFINITY, f64::min)
    };
    match shape {
        Shape::Block => {
            let gap = |value: f64, low: f64, high: f64| (low - value).max(value - high).max(0.0);
            let (across, along, rise) =
                (gap(x, -half_width, half_width), gap(y, -half_depth, half_depth), gap(z, 0.0, height));
            (across * across + along * along + rise * rise).sqrt()
        }
        Shape::Gable => {
            let past = (y.abs() - half_depth).max(0.0);
            let across = outward(x.abs(), z);
            (across * across + past * past).sqrt()
        }
        Shape::Pyramid { .. } => {
            // Square at every height: how far the point lies outside the cross-section there, nearest over the height.
            let off_at = |at: f64| {
                let (wide, deep) = (reach_at(shape, half_width, at, height), reach_at(shape, half_depth, at, height));
                let (out_x, out_y) = ((x.abs() - wide).max(0.0), (y.abs() - deep).max(0.0));
                (out_x, out_y)
            };
            let (out_x, out_y) = off_at(z);
            if (0.0..=height).contains(&z) && out_x == 0.0 && out_y == 0.0 {
                return 0.0;
            }
            (0..=2000)
                .map(|step| {
                    let at = height * f64::from(step) / 2000.0;
                    let ((out_x, out_y), rise) = (off_at(at), z - at);
                    (out_x * out_x + out_y * out_y + rise * rise).sqrt()
                })
                .fold(f64::INFINITY, f64::min)
        }
        Shape::Column { .. } | Shape::Dome { .. } => {
            let sides = drawn(shape).0;
            let off_at = |at: f64| off_polygon(x, y, reach_at(shape, half_width, at, height), sides);
            if (0.0..=height).contains(&z) && off_at(z) == 0.0 {
                return 0.0;
            }
            (0..=2000)
                .map(|step| {
                    let at = height * f64::from(step) / 2000.0;
                    let (out, rise) = (off_at(at), z - at);
                    (out * out + rise * rise).sqrt()
                })
                .fold(f64::INFINITY, f64::min)
        }
        _ => outward((x * x + y * y).sqrt(), z),
    }
}

/// How many faces the page draws round a column or a dome, and a dome's rings from its base to its crown.
fn drawn(shape: Shape) -> (u32, u32) {
    match shape {
        Shape::Column { sides, .. } => (sides.max(3), 0),
        Shape::Dome { sides } => {
            let count = sides.max(4);
            (count, (f64::from(count) / 4.0).round().max(2.0) as u32)
        }
        _ => (0, 0),
    }
}

/// How far a point lies outside a polygon of `sides` faces whose corners stand `radius` out, the first on the x axis.
fn off_polygon(x: f64, y: f64, radius: f64, sides: u32) -> f64 {
    if radius <= 0.0 {
        return (x * x + y * y).sqrt();
    }
    let corner = |number: u32| {
        let (sine, cosine) = land::exact::sin_cos(std::f64::consts::TAU * f64::from(number) / f64::from(sides));
        [radius * cosine, radius * sine]
    };
    let (mut outside, mut nearest) = (false, f64::INFINITY);
    for number in 0..sides {
        let (from, to) = (corner(number), corner(number + 1));
        let (along_x, along_y) = (to[0] - from[0], to[1] - from[1]);
        let (east, south) = (x - from[0], y - from[1]);
        outside |= east * along_y - south * along_x > 0.0;
        let share = ((east * along_x + south * along_y) / (along_x * along_x + along_y * along_y)).clamp(0.0, 1.0);
        let (gap_x, gap_y) = (east - share * along_x, south - share * along_y);
        nearest = nearest.min((gap_x * gap_x + gap_y * gap_y).sqrt());
    }
    if outside { nearest } else { 0.0 }
}

/// A shape's outline: how far out it reaches at a height.
fn reach_at(shape: Shape, half: f64, up: f64, height: f64) -> f64 {
    match shape {
        Shape::Column { top, .. } | Shape::Pyramid { top } => half * (1.0 - (1.0 - top) * up / height),
        Shape::Dome { .. } => {
            // Straight between the rings, each at an equal step of a quarter-turn up the round.
            let rings = f64::from(drawn(shape).1);
            let ring = |number: f64| land::exact::sin_cos(std::f64::consts::FRAC_PI_2 * number / rings);
            (0..drawn(shape).1).map(f64::from).find(|&number| up <= height * ring(number + 1.0).0).map_or(
                0.0,
                |number| {
                    let ((low_sine, low_cosine), (high_sine, high_cosine)) = (ring(number), ring(number + 1.0));
                    let share = (up / height - low_sine) / (high_sine - low_sine);
                    half * (low_cosine + (high_cosine - low_cosine) * share)
                },
            )
        }
        Shape::Gable => half * (1.0 - up / height),
        _ => half,
    }
}

/// The points of a solid on a grid of its own frame, in the world.
fn cloud(solid: &Solid, steps: u32) -> Vec<[f64; 3]> {
    let [width, depth, height] = solid.size;
    let mut points = Vec::new();
    for i in 0..=steps {
        for j in 0..=steps {
            for k in 0..=steps {
                let share = |at: u32| f64::from(at) / f64::from(steps);
                let own = [(share(i) - 0.5) * width, (share(j) - 0.5) * depth, share(k) * height];
                if distance_to(solid.shape, solid.size, own) == 0.0 {
                    points.push(solid.place(own));
                }
            }
        }
    }
    points
}

fn gap_to_box(&[west, north, east, south, top, bottom]: &Box2, [x, y, z]: [f64; 3]) -> f64 {
    let gap = |value: f64, low: f64, high: f64| (low - value).max(value - high).max(0.0);
    let (across, along, rise) = (gap(x, west, east), gap(y, north, south), gap(z, bottom, top));
    (across * across + along * along + rise * rise).sqrt()
}

/// How far the farthest corner of any box stands from the solid (a box's farthest point from anything convex is a
/// corner), how far the farthest point of the solid lies from every box, and how many boxes there are: the rule's own
/// boxes, before any budget loosens them, its layers laid as they are and as terraces, the worse of the two.
fn misfit(solid: &Solid) -> (f64, f64, usize) {
    let layered = fitted(solid, &crate::collision::boxed(solid, 1.0, false));
    let terraced = fitted(solid, &crate::collision::boxed(solid, 1.0, true));
    (layered.0.max(terraced.0), layered.1.max(terraced.1), layered.2.max(terraced.2))
}

fn fitted(solid: &Solid, boxes: &[Box2]) -> (f64, f64, usize) {
    let standing_off = boxes
        .iter()
        .flat_map(|&[west, north, east, south, top, bottom]| {
            (0..8).map(move |corner| {
                let x = if corner & 1 == 0 { west } else { east };
                let y = if corner & 2 == 0 { north } else { south };
                let z = if corner & 4 == 0 { bottom } else { top };
                [x, y, z]
            })
        })
        .map(|corner| distance_to(solid.shape, solid.size, solid.own(corner)))
        .fold(0.0, f64::max);
    let left_out = cloud(solid, 16)
        .iter()
        .map(|&point| boxes.iter().map(|found| gap_to_box(found, point)).fold(f64::INFINITY, f64::min))
        .fold(0.0, f64::max);
    (standing_off, left_out, boxes.len())
}

/// Rounds as circles, so `distance_to` measures them exactly.
fn shapes() -> Vec<(Shape, [f64; 3])> {
    vec![
        (Shape::Block, [0.5, 25.0, 1.1]),
        (Shape::Block, [9.6, 5.8, 0.6]),
        (Shape::Column { sides: 8, top: 0.8 }, [0.55, 0.55, 17.9]),
        (Shape::Column { sides: 12, top: 1.0 }, [6.3, 6.3, 14.6]),
        (Shape::Column { sides: 6, top: 0.55 }, [0.55, 0.55, 3.6]),
        (Shape::Column { sides: 8, top: 1.4 }, [0.8, 0.8, 0.9]),
        (Shape::Dome { sides: 8 }, [1.6, 1.6, 0.7]),
        (Shape::Dome { sides: 16 }, [6.0, 6.0, 4.0]),
        (Shape::Pyramid { top: 0.6 }, [1.0, 1.0, 0.6]),
        (Shape::Gable, [9.8, 12.8, 4.2]),
    ]
}

#[test]
fn every_shape_upright_or_turned_is_boxed_within_keep_of_it_either_way() {
    for (shape, size) in shapes() {
        for turn in [0.0, 0.45, 2.02, -0.75] {
            let solid = Solid::upright(shape, [3.0, -2.0, 5.0], size, Material::Stone).turned(turn);
            let (standing_off, left_out, count) = misfit(&solid);
            assert!(standing_off <= KEEP_M + 1e-6, "{shape:?} {size:?} turned {turn}: off by {standing_off}");
            assert!(left_out <= KEEP_M + 1e-6, "{shape:?} {size:?} turned {turn}: {left_out} left out");
            assert!(count <= 2000, "{shape:?} {size:?} turned {turn}: {count} boxes");
        }
    }
}

#[test]
fn a_leaning_or_rolled_shape_is_boxed_within_keep_of_it_but_for_pieces_too_small_to_halve() {
    for (shape, size) in shapes() {
        // A great piece leans a little at most (a sea stack, a standing column); a small one may lie fallen.
        let great = size[0].max(size[1]) > 4.0;
        let poses: &[(f64, f64, f64)] = if great {
            &[(-0.75, 0.02, 0.0), (0.2, -0.01, 0.01)]
        } else {
            &[(-0.75, 0.3, 0.0), (1.3, 1.39, 0.0), (0.2, -0.1, 0.5)]
        };
        for &(turn, lean, roll) in poses {
            let solid = Solid { turn, lean, roll, ..Solid::upright(shape, [3.0, -2.0, 5.0], size, Material::Stone) };
            let (standing_off, left_out, count) = misfit(&solid);
            // A piece two metres long or less tilted so is boxed round its corners, at most its tilt's reach off; a
            // solid hardly tilted is boxed upright, as far off as its tilt moves it.
            let still = tilt_move(&solid);
            let reach = KEEP_M + if still <= STILL_M { still } else { TILTED_PIECE_M * tilt_reach(&solid) };
            assert!(standing_off <= reach + 1e-6, "{shape:?} {size:?} at {lean} {roll}: off by {standing_off}");
            assert!(left_out <= KEEP_M + 1e-6, "{shape:?} {size:?} at {lean} {roll}: {left_out} left out");
            assert!(count <= 2000, "{shape:?} {size:?} at {lean} {roll}: {count} boxes");
        }
    }
}

#[test]
fn a_square_solid_is_one_box_and_a_straight_column_one_layer() {
    let block = Solid::upright(Shape::Block, [0.0, 0.0, 2.0], [4.0, 1.0, 3.0], Material::Stone);
    assert_eq!(crate::collision::boxes(&block), vec![[-2.0, -0.5, 2.0, 0.5, 5.0, 2.0]]);
    assert_eq!(crate::collision::boxes(&block.turned(std::f64::consts::PI)).len(), 1);
    let stake =
        Solid::upright(Shape::Column { sides: 6, top: 1.0 }, [0.0, 0.0, 0.0], [0.5, 0.5, 4.0], Material::Timber);
    assert_eq!(crate::collision::boxes(&stake), vec![[-0.25, -0.25, 0.25, 0.25, 4.0, 0.0]]);
}

#[test]
fn a_turned_parapet_is_strips_that_keep_to_it_not_one_box_round_its_corners() {
    let rail = Solid::upright(Shape::Block, [0.0, 0.0, 10.0], [0.5, 25.0, 1.1], Material::Trim).turned(0.45);
    let boxes = crate::collision::boxes(&rail);
    let area: f64 = boxes.iter().map(|&[west, north, east, south, ..]| (east - west) * (south - north)).sum();
    // Drawn, the rail covers 12.5 m^2; the one box round its corners covered about 117.
    assert!(area < 12.5 * 3.5, "{area}");
    assert!(boxes.iter().all(|&[.., top, bottom]| top == 11.1 && bottom == 10.0));
}

#[test]
fn strips_of_a_turned_footprint_reach_no_further_past_it_than_keep() {
    let (sine, cosine) = sin_cos(0.6);
    let turned = |x: f64, y: f64| [x * cosine - y * sine + 4.0, x * sine + y * cosine - 1.0];
    let corners = [turned(-10.0, -3.0), turned(10.0, -3.0), turned(10.0, 3.0), turned(-10.0, 3.0)];
    let boxes = strips(corners, 0.0, 2.0, KEEP_M);
    for &[west, north, east, south, ..] in &boxes {
        for [x, y] in [[west, north], [east, north], [east, south], [west, south]] {
            let (x, y) = (x - 4.0, y + 1.0);
            let (own_x, own_y) = (x * cosine + y * sine, -x * sine + y * cosine);
            let gap = |value: f64, half: f64| (value.abs() - half).max(0.0);
            let (across, along) = (gap(own_x, 10.0), gap(own_y, 3.0));
            assert!((across * across + along * along).sqrt() <= KEEP_M + 1e-9, "{own_x} {own_y}");
        }
    }
}

#[test]
fn an_upright_arch_is_walked_through_under_its_crown_turned_or_not() {
    for turn in [0.0, 2.02] {
        let arch = Solid::upright(Shape::Arch { opening: 0.8 }, [0.0, 0.0, 0.0], [10.0, 1.0, 10.0], Material::Trim)
            .turned(turn);
        let boxes = crate::collision::boxes(&arch);
        let (sine, cosine) = sin_cos(turn);
        // Points on the opening's middle line, through its depth, under the crown and a hand inside its jambs.
        for across in [-3.0, 0.0, 3.0] {
            for along in [-0.5, 0.0, 0.5] {
                for up in [0.5, 4.0, 7.0] {
                    let at = [across * cosine - along * sine, across * sine + along * cosine, up];
                    let held = boxes.iter().any(|found| gap_to_box(found, at) == 0.0);
                    assert!(!held, "at {turn}: a box over the opening at {across} {along} {up}");
                }
            }
        }
    }
}

#[test]
fn a_solid_too_costly_to_box_closely_is_boxed_more_loosely_within_its_budget_leaving_none_of_it_out() {
    let roof = Solid::upright(Shape::Gable, [0.0; 3], [74.0, 34.0, 16.0], Material::Roof).turned(0.7);
    let dome = Solid::upright(Shape::Dome { sides: 14 }, [0.0; 3], [30.0, 30.0, 14.0], Material::Stone).turned(0.5);
    let upright = Solid::upright(Shape::Pyramid { top: 0.0 }, [0.0; 3], [32.0, 32.0, 26.0], Material::Roof);
    let pyramid = Solid { lean: 0.05, ..upright }.turned(0.4);
    let small = Solid::upright(Shape::Gable, [0.0; 3], [4.0, 5.0, 2.0], Material::Roof).turned(0.3);
    let tusk = Solid {
        lean: 0.6,
        ..Solid::upright(Shape::Column { sides: 12, top: 0.5 }, [0.0; 3], [5.0, 5.0, 14.0], Material::Stone)
    }
    .turned(0.2);
    for solid in [roof, dome, pyramid, small, tusk] {
        let (boxes, loosened) = crate::collision::kept(&solid);
        let (standing_off, left_out, count) = fitted(&solid, &boxes);
        let crowded = crate::collision::crowding(&boxes);
        let tilted = tilt_move(&solid);
        let reach = KEEP_M * loosened + if tilted <= STILL_M { tilted } else { TILTED_PIECE_M * tilt_reach(&solid) };
        let [width, depth, _] = solid.size;
        let allowed =
            (width * depth * crate::collision::MOST_A_SQUARE_METRE).max(crate::collision::FEWEST_ALLOWED as f64);
        assert!(crowded <= crate::collision::MOST_OVER_A_CELL, "{:?}: {crowded} boxes over a cell", solid.shape);
        assert!(count as f64 <= allowed, "{:?}: {count} boxes", solid.shape);
        assert!(standing_off <= reach + 1e-6, "{:?}: {standing_off} m off at {loosened}x", solid.shape);
        assert!(left_out <= KEEP_M + 1e-6, "{:?}: {left_out} m of it left out", solid.shape);
        // Loosened only as far as it must be: a quarter tighter breaks the budget.
        if loosened > 1.0 {
            for terraced in [false, true] {
                let tighter = crate::collision::boxed(&solid, loosened / 1.25, terraced);
                let crowded = crate::collision::crowding(&tighter) > crate::collision::MOST_OVER_A_CELL;
                assert!(tighter.len() as f64 > allowed || crowded, "{:?}: a quarter tighter fits", solid.shape);
            }
        }
    }
    let (_, loosened) = crate::collision::kept(&small);
    assert!((loosened - 1.0).abs() < 1e-12, "a small turned roof keeps within KEEP_M: {loosened}x");
    let tower = Solid::upright(Shape::Column { sides: 12, top: 1.0 }, [0.0; 3], [6.3, 6.3, 14.6], Material::Stone);
    assert!((crate::collision::kept(&tower.turned(0.6)).1 - 1.0).abs() < 1e-12, "a straight tower keeps within KEEP_M");
}

#[test]
fn a_shape_tilted_past_a_right_angle_is_boxed_where_it_is_drawn() {
    // A mill's sails roll round their hub a quarter-turn apart, past a right angle and past a half-turn.
    let sail = Solid::upright(Shape::Block, [3.0, -2.0, 60.0], [2.0, 0.3, 12.0], Material::Stone);
    for (lean, roll) in [(std::f64::consts::PI, 0.0), (0.0, 1.97), (0.0, 3.54), (0.0, 5.11), (-4.0, 0.0)] {
        let solid = Solid { lean, roll, ..sail }.turned(0.6);
        let (boxes, loosened) = crate::collision::kept(&solid);
        let (standing_off, left_out, _) = fitted(&solid, &boxes);
        let reach = KEEP_M * loosened + TILTED_PIECE_M * tilt_reach(&solid);
        assert!(left_out <= KEEP_M + 1e-6, "at {lean} {roll}: {left_out} m of it left out");
        assert!(standing_off <= reach + 1e-6, "at {lean} {roll}: off by {standing_off}");
    }
}

#[test]
fn a_great_slab_leaning_a_little_is_loosened_when_halving_cannot_keep_it_close() {
    // Halving stops at 256 pieces; past that its pieces' boxes stand off, so the solid must count as loosened.
    for (size, lean) in [([0.6, 200.0, 150.0], 0.05), ([0.4, 120.0, 90.0], 0.04), ([1.0, 300.0, 40.0], 0.02)] {
        let solid = Solid { lean, ..Solid::upright(Shape::Block, [0.0; 3], size, Material::Stone) }.turned(0.3);
        let (boxes, loosened) = crate::collision::kept(&solid);
        let (standing_off, left_out, _) = fitted(&solid, &boxes);
        let reach = KEEP_M * loosened + TILTED_PIECE_M * tilt_reach(&solid);
        assert!(standing_off <= reach + 1e-6, "{size:?} at {lean}: off by {standing_off} kept {loosened}x");
        assert!(left_out <= KEEP_M + 1e-6, "{size:?} at {lean}: {left_out} m of it left out");
    }
}
