//! The grid that finds a body's near blocks answers every rule exactly as the whole list does: scattered blocks of
//! every size (a few spanning everything, one endless), asked at points inside, beside and far past them.

use movement::blocks::{ceiling_at, ground_at, room_at, slide, wall_ahead};
use movement::{Block, Blocks, Flat, Near, TUNING, standing};

/// A small generator of numbers in [0, 1), the same every run.
struct Numbers(u64);

impl Numbers {
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1_442_695_040_888_963_407);
        (self.0 >> 11) as f64 / (1_u64 << 53) as f64
    }
}

fn scattered(numbers: &mut Numbers) -> Vec<Block> {
    let mut blocks: Vec<Block> = (0..600)
        .map(|_| {
            let (x, y) = (numbers.next() * 200.0 - 100.0, numbers.next() * 200.0 - 100.0);
            let (width, depth) = (0.1 + numbers.next() * 6.0, 0.1 + numbers.next() * 6.0);
            let bottom = if numbers.next() < 0.3 { 1.0 + numbers.next() * 3.0 } else { -1.0 };
            Block {
                min_x: x,
                min_y: y,
                max_x: x + width,
                max_y: y + depth,
                top: bottom + 0.2 + numbers.next() * 3.0,
                bottom,
            }
        })
        .collect();
    blocks.push(Block { min_x: -300.0, min_y: -300.0, max_x: 300.0, max_y: 300.0, top: 0.1, bottom: -1.0 });
    blocks.push(Block {
        min_x: f64::NEG_INFINITY,
        min_y: 40.0,
        max_x: f64::INFINITY,
        max_y: 41.0,
        top: 9.0,
        bottom: 5.0,
    });
    blocks
}

#[test]
fn the_grid_answers_every_rule_as_the_whole_list_does() {
    let mut numbers = Numbers(7);
    let list = scattered(&mut numbers);
    let grid = Blocks::new(list.clone());
    assert_eq!(grid.all(), list.as_slice());
    for _ in 0..20_000 {
        let (x, y) = (numbers.next() * 260.0 - 130.0, numbers.next() * 260.0 - 130.0);
        let z = numbers.next() * 4.0 - 0.5;
        let (x, y) = if numbers.next() < 0.05 { (x * 1e4, y * 1e4) } else { (x, y) };
        assert_eq!(ground_at(&list, &Flat, x, y, z).to_bits(), ground_at(&grid, &Flat, x, y, z).to_bits());
        assert_eq!(ceiling_at(&list, x, y, z).to_bits(), ceiling_at(&grid, x, y, z).to_bits());
        assert_eq!(room_at(&list, x, y, z, TUNING.height), room_at(&grid, x, y, z, TUNING.height));
        let body = movement::Body { z, ..standing(x, y) };
        let bearing = numbers.next() * 6.3;
        assert_eq!(
            wall_ahead(&list, &body, bearing),
            wall_ahead(&grid, &body, bearing),
            "the same block, first in order"
        );
        let (move_x, move_y) = (numbers.next() - 0.5, numbers.next() - 0.5);
        assert_eq!(slide(&list, &Flat, &body, move_x, move_y), slide(&grid, &Flat, &body, move_x, move_y));
    }
}

#[test]
fn every_block_a_point_could_meet_is_near_it_in_the_lists_order() {
    let mut numbers = Numbers(11);
    let list = scattered(&mut numbers);
    let grid = Blocks::new(list.clone());
    for _ in 0..5_000 {
        let (x, y) = (numbers.next() * 220.0 - 110.0, numbers.next() * 220.0 - 110.0);
        let reach = TUNING.radius;
        let could: Vec<&Block> = list
            .iter()
            .filter(|block| {
                x > block.min_x - reach && x < block.max_x + reach && y > block.min_y - reach && y < block.max_y + reach
            })
            .collect();
        let near: Vec<&Block> = grid.near(x, y).collect();
        // The grid holds its own copy of the blocks, so they are told apart by value (no two are alike here).
        let kept: Vec<&Block> = near.iter().copied().filter(|block| could.contains(block)).collect();
        assert_eq!(kept, could, "every one, in order, at ({x}, {y})");
    }
    assert_eq!(Blocks::new(Vec::new()).near(0.0, 0.0).count(), 0, "no blocks, none near");
    assert_eq!(Blocks::default().near(1e9, f64::NAN).count(), 0, "a course not yet set holds none");
}
