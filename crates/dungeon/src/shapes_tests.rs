use crate::lane::Lane;
use crate::shapes::{Ceiling, Roof, Shape, ceiling, outline};

/// Whether an outline's cells are one walk.
fn one_walk(takes: &[bool], width: usize) -> bool {
    let depth = takes.len() / width;
    let Some(first) = takes.iter().position(|&take| take) else { return false };
    let mut reached = vec![false; takes.len()];
    reached[first] = true;
    let mut todo = vec![first];
    while let Some(index) = todo.pop() {
        let (x, y) = (index % width, index / width);
        let near = [
            (x + 1 < width).then(|| index + 1),
            (x > 0).then(|| index - 1),
            (y + 1 < depth).then(|| index + width),
            (y > 0).then(|| index - width),
        ];
        for next in near.into_iter().flatten() {
            if takes[next] && !reached[next] {
                reached[next] = true;
                todo.push(next);
            }
        }
    }
    takes.iter().zip(&reached).all(|(&take, &seen)| !take || seen)
}

#[test]
fn every_outline_is_one_walk_inside_its_rectangle_and_touches_all_four_sides() {
    for shape in [Shape::Rectangle, Shape::Ell, Shape::Cross, Shape::Octagon, Shape::Alcoves, Shape::Cave] {
        for seed in 0..400 {
            let mut lane = Lane::new(seed);
            let (width, depth) = (lane.int(4, 7), lane.int(4, 7));
            let drawn = outline(shape, width, depth, &mut lane);
            assert_eq!(drawn.takes.len(), width * depth);
            assert!(one_walk(&drawn.takes, width), "{shape:?} {width} by {depth}, seed {seed}");
            if shape != Shape::Cave {
                let row = |y: usize| (0..width).any(|x| drawn.takes[y * width + x]);
                let column = |x: usize| (0..depth).any(|y| drawn.takes[y * width + x]);
                assert!(row(0) && row(depth - 1) && column(0) && column(width - 1), "{shape:?} fills its rectangle");
            }
        }
    }
}

#[test]
fn an_octagon_leaves_its_four_corner_cells_rock_and_a_cross_its_four_corner_blocks() {
    let mut lane = Lane::new(1);
    let octagon = outline(Shape::Octagon, 5, 4, &mut lane);
    let rock: Vec<usize> = (0..20).filter(|&index| !octagon.takes[index]).collect();
    assert_eq!(rock, [0, 4, 15, 19]);
    // A third of each side, so a cross of 6 by 4 leaves corners 2 wide and 1 deep.
    let cross = outline(Shape::Cross, 6, 4, &mut lane);
    let rows: Vec<String> =
        (0..4).map(|y| (0..6).map(|x| if cross.takes[y * 6 + x] { 'o' } else { '#' }).collect()).collect();
    assert_eq!(rows, ["##oo##", "oooooo", "oooooo", "##oo##"]);
}

#[test]
fn alcoves_are_single_cells_cut_one_deep_off_a_long_wall_with_rock_between() {
    let mut both = 0;
    for seed in 0..200 {
        let mut lane = Lane::new(seed);
        let (width, depth) = (lane.int(3, 7), 3);
        let drawn = outline(Shape::Alcoves, width, depth, &mut lane);
        let take = |x: usize, y: usize| drawn.takes[y * width + x];
        let mut rows = 0;
        for y in [0, depth - 1] {
            let alcoves: Vec<usize> = (0..width).filter(|&x| take(x, y)).collect();
            // A long wall without alcoves is the hall's own row.
            if alcoves.len() == width {
                continue;
            }
            rows += 1;
            let wanted: Vec<usize> = (1..width - 1).step_by(2).collect();
            assert_eq!(alcoves, wanted, "every second cell, never at an end: seed {seed}");
        }
        assert!(rows >= 1, "seed {seed}: a row of alcoves");
        both += usize::from(rows == 2);
        let hall = (1..depth - 1).all(|y| (0..width).all(|x| take(x, y)));
        assert!(hall, "seed {seed}: the hall between is whole");
    }
    assert!(both > 50 && both < 150, "alcoves along both walls in {both} of 200");
}

#[test]
fn a_great_cave_stands_rock_inside_with_its_own_cells_all_round_it() {
    let (mut stones, mut small) = (0, 0);
    for seed in 0..400 {
        let mut lane = Lane::new(seed);
        let (width, depth) = (lane.int(3, 6), lane.int(3, 6));
        let drawn = outline(Shape::Cave, width, depth, &mut lane);
        if width < 5 || depth < 5 {
            small += drawn.stones.len();
            continue;
        }
        assert!(!drawn.stones.is_empty() && drawn.stones.len() <= 2, "seed {seed}: one or two stones");
        for &(x, y) in &drawn.stones {
            stones += 1;
            assert!(!drawn.takes[y * width + x]);
            for ny in y - 1..=y + 1 {
                for nx in x - 1..=x + 1 {
                    let other_stone = (nx, ny) != (x, y) && drawn.stones.contains(&(nx, ny));
                    assert!((nx, ny) == (x, y) || (drawn.takes[ny * width + nx] && !other_stone), "seed {seed}");
                }
            }
        }
    }
    assert!(stones > 0 && small == 0, "{stones} stones in great caves, {small} in small ones");
}

#[test]
fn a_ceiling_is_rough_over_a_cave_a_dome_over_a_square_or_an_octagon_and_a_vault_along_a_long_room() {
    assert_eq!(ceiling(Shape::Cave, 4, 4, Roof::Arched), Ceiling::Cave);
    assert_eq!(ceiling(Shape::Rectangle, 4, 4, Roof::Rough), Ceiling::Cave);
    assert_eq!(ceiling(Shape::Rectangle, 4, 4, Roof::Arched), Ceiling::Dome);
    assert_eq!(ceiling(Shape::Octagon, 4, 6, Roof::Arched), Ceiling::Dome);
    assert_eq!(ceiling(Shape::Rectangle, 2, 3, Roof::Arched), Ceiling::Vault);
    assert_eq!(ceiling(Shape::Rectangle, 4, 5, Roof::Arched), Ceiling::Flat);
    assert_eq!(ceiling(Shape::Alcoves, 3, 3, Roof::Arched), Ceiling::Vault);
    assert_eq!(ceiling(Shape::Cross, 6, 6, Roof::Arched), Ceiling::Flat);
    assert_eq!(ceiling(Shape::Rectangle, 2, 6, Roof::Flat), Ceiling::Flat);
    let keys = [Ceiling::Flat, Ceiling::Vault, Ceiling::Dome, Ceiling::Cave].map(Ceiling::key);
    assert_eq!(keys, ["flat", "vault", "dome", "cave"]);
}
