//! The walks' grain: each piece of a walk in its walk's, a joint in the grain of the walk on top there, and two
//! pieces of a different grain never level with each other.

use super::tests::{planned, ring_bounds};

#[test]
fn where_a_walk_overlaps_another_piece_of_flagstones_one_of_another_grain_lies_under_it() {
    // A walk's pieces wear its grain, every other piece of flagstones the world's (`walkGrain.ts`): two of a different
    // grain level with each other would show both in turn.
    use crate::solids::Material;
    let (_, plan) = planned();
    let social = &plan.social;
    let flags: Vec<_> =
        social.solids.iter().enumerate().filter(|(_, solid)| solid.material == Material::Path).collect();
    let grain = |index: usize| grain_key(social, index);
    let [west, north, east, south] = ring_bounds(&social.ring);
    let mut level = Vec::new();
    let mut y = north;
    while y < south {
        let mut x = west;
        while x < east {
            let over: Vec<_> = flags.iter().filter(|(_, solid)| covers(solid, [x, y])).collect();
            let top = over.iter().map(|(_, solid)| solid.at[2] + solid.size[2]).fold(f64::MIN, f64::max);
            let topmost: Vec<_> = over.iter().filter(|(_, solid)| solid.at[2] + solid.size[2] > top - 0.001).collect();
            if topmost.iter().any(|(index, _)| grain(*index) != grain(topmost[0].0)) {
                level.push([x, y]);
            }
            x += 0.5;
        }
        y += 0.5;
    }
    assert!(
        level.is_empty(),
        "{} points where two grains lie level, e.g. {:?}",
        level.len(),
        &level[..level.len().min(4)]
    );
}

/// Whether `solid`'s top covers the point, a centimetre inside its edge.
fn covers(solid: &crate::solids::Solid, [x, y]: [f64; 2]) -> bool {
    let ([dx, dy], (sine, cosine)) = ([x - solid.at[0], y - solid.at[1]], libm::sincos(solid.turn));
    let (across, along) = (dx * cosine + dy * sine, -dx * sine + dy * cosine);
    match solid.shape {
        crate::solids::Shape::Column { .. } => libm::hypot(across, along) < solid.size[0] / 2.0 - 0.01,
        _ => across.abs() < solid.size[0] / 2.0 - 0.01 && along.abs() < solid.size[1] / 2.0 - 0.01,
    }
}

/// The grain a piece of `social`'s solids wears, as its turn and the line it runs along, in thousandths and
/// centimetres: none for the world's.
fn grain_key(social: &crate::social::Social, index: usize) -> Option<(i64, i64)> {
    social.grains.iter().find(|grain| grain.solid == index).map(|grain| {
        let (sine, cosine) = libm::sincos(grain.turn);
        let line = grain.middle[0] * cosine + grain.middle[1] * sine;
        ((grain.turn * 1e3).round() as i64, (line * 1e2).round() as i64)
    })
}

#[test]
fn where_walks_meet_the_joint_runs_in_the_grain_of_the_walk_on_top_and_a_walk_either_way_runs_one() {
    use crate::solids::{Material, Shape};
    let (_, plan) = planned();
    let social = &plan.social;
    let path = |solid: &crate::solids::Solid| solid.material == Material::Path;
    let strips: Vec<usize> = (0..social.solids.len())
        .filter(|&index| matches!(social.solids[index].shape, Shape::Block) && grain_key(social, index).is_some())
        .filter(|&index| path(&social.solids[index]) && social.solids[index].size[0] > 3.0)
        .collect();
    let mut joints = 0;
    for (index, round) in social.solids.iter().enumerate() {
        if !(path(round) && matches!(round.shape, Shape::Column { .. }) && grain_key(social, index).is_some()) {
            continue;
        }
        joints += 1;
        // The strips covering the joint's middle, the one on top first.
        let mut over: Vec<usize> = strips
            .iter()
            .copied()
            .filter(|&strip| {
                let solid = &social.solids[strip];
                let ([dx, dy], (sine, cosine)) =
                    ([round.at[0] - solid.at[0], round.at[1] - solid.at[1]], libm::sincos(solid.turn));
                (dx * cosine + dy * sine).abs() < solid.size[0] / 2.0
                    && (-dx * sine + dy * cosine).abs() < solid.size[1] / 2.0 + 0.01
            })
            .collect();
        over.sort_by(|one, two| social.solids[*two].size[2].total_cmp(&social.solids[*one].size[2]));
        let top = over.first().unwrap_or_else(|| panic!("no walk at the joint at {:?}", round.at));
        assert_eq!(grain_key(social, index), grain_key(social, *top), "the joint at {:?}", round.at);
    }
    assert!(joints > 20, "{joints} joints");
    // Every grain's turn lies within a half turn.
    assert!(social.grains.iter().all(|grain| (0.0..std::f64::consts::PI).contains(&grain.turn)));
}

#[test]
fn a_walk_running_straight_through_a_joint_shows_its_own_flags_across_its_width_there() {
    use crate::solids::{Material, Shape};
    let (_, plan) = planned();
    let social = &plan.social;
    let flags: Vec<usize> =
        (0..social.solids.len()).filter(|&index| social.solids[index].material == Material::Path).collect();
    let top_grain = |point: [f64; 2]| {
        let over: Vec<usize> = flags.iter().copied().filter(|&index| covers(&social.solids[index], point)).collect();
        let top = over
            .iter()
            .map(|&index| social.solids[index].at[2] + social.solids[index].size[2])
            .fold(f64::MIN, f64::max);
        over.into_iter()
            .find(|&index| social.solids[index].at[2] + social.solids[index].size[2] > top - 0.001)
            .and_then(|index| grain_key(social, index))
    };
    let (mut through, mut broken) = (0, Vec::new());
    for round in social
        .solids
        .iter()
        .filter(|solid| solid.material == Material::Path && matches!(solid.shape, Shape::Column { .. }))
    {
        // The walks' strips ending at the joint, each with the way it leaves it.
        let leaving: Vec<(usize, [f64; 2])> = flags
            .iter()
            .filter(|&&index| matches!(social.solids[index].shape, Shape::Block) && social.solids[index].size[0] > 3.0)
            .filter_map(|&index| {
                let solid = &social.solids[index];
                let ([dx, dy], (sine, cosine)) =
                    ([round.at[0] - solid.at[0], round.at[1] - solid.at[1]], libm::sincos(solid.turn));
                let (across, along) = (dx * cosine + dy * sine, -dx * sine + dy * cosine);
                let way = [-sine * -along.signum(), cosine * -along.signum()];
                (across.abs() < 0.01 && (along.abs() - solid.size[1] / 2.0).abs() < 0.01).then_some((index, way))
            })
            .collect();
        // Of the walks running straight through, the one the joint wears the grain of must show across its width.
        let straight: Vec<(usize, [f64; 2])> = leaving
            .iter()
            .copied()
            .filter(|&(_, way)| leaving.iter().any(|&(_, other)| way[0] * other[0] + way[1] * other[1] < -0.99999))
            .collect();
        let index = social.solids.iter().position(|solid| std::ptr::eq(solid, round)).unwrap_or(0);
        if straight.is_empty() {
            continue;
        }
        assert!(
            straight.iter().any(|&(one, _)| grain_key(social, one) == grain_key(social, index)),
            "the joint at {:?}",
            round.at
        );
        for &(one, way) in
            straight.iter().filter(|&&(one, _)| grain_key(social, one) == grain_key(social, index)).take(1)
        {
            through += 1;
            let across = [-way[1], way[0]];
            for step in -6..6 {
                for side in -3..=3 {
                    let (along, aside) = ((f64::from(step) + 0.5) * 0.3, f64::from(side) * 0.5);
                    let point = [
                        round.at[0] + way[0] * along + across[0] * aside,
                        round.at[1] + way[1] * along + across[1] * aside,
                    ];
                    if top_grain(point) != grain_key(social, one) {
                        broken.push(point);
                    }
                }
            }
        }
    }
    assert!(through > 10, "{through} walks running through a joint");
    assert!(
        broken.is_empty(),
        "{} points where another walk shows over one running through, e.g. {:?}",
        broken.len(),
        &broken[..broken.len().min(4)]
    );
}

#[test]
fn the_plaza_and_the_walks_floors_beside_it_are_paved_in_one_grain() {
    use crate::solids::Material;
    let (_, plan) = planned();
    let social = &plan.social;
    let level = social.level;
    let floors: Vec<usize> = (0..social.solids.len())
        .filter(|&index| {
            let solid = &social.solids[index];
            solid.material == Material::Paving
                && (solid.at[2] + solid.size[2] - level).abs() < 1e-6
                && solid.size[0] > 4.0
        })
        .collect();
    assert!(floors.len() > 3, "{} floors", floors.len());
    let grains: Vec<_> = floors.iter().map(|&index| grain_key(social, index)).collect();
    assert!(grains[0].is_some() && grains.iter().all(|grain| *grain == grains[0]), "{grains:?}");
}

#[test]
fn the_platforms_stone_bands_never_lie_level_where_they_cross() {
    use crate::solids::Material;
    let (_, plan) = planned();
    let social = &plan.social;
    let bands: Vec<_> = social
        .solids
        .iter()
        .filter(|solid| {
            solid.material == Material::Stone && solid.size[2] < 0.05 && (solid.at[2] - social.level).abs() < 1e-6
        })
        .collect();
    assert!(bands.len() > 1, "{} bands", bands.len());
    let [west, north, east, south] = ring_bounds(&social.ring);
    let mut level = Vec::new();
    let mut y = north;
    while y < south {
        let mut x = west;
        while x < east {
            let tops: Vec<f64> =
                bands.iter().filter(|solid| covers(solid, [x, y])).map(|solid| solid.size[2]).collect();
            if tops.iter().enumerate().any(|(k, one)| tops[k + 1..].iter().any(|two| (one - two).abs() < 0.001)) {
                level.push([x, y]);
            }
            x += 0.5;
        }
        y += 0.5;
    }
    assert!(
        level.is_empty(),
        "{} points where two bands lie level, e.g. {:?}",
        level.len(),
        &level[..level.len().min(4)]
    );
}
