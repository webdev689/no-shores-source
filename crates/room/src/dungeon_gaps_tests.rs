use super::open;
use movement::Block;

const CELL: f64 = 0.4;

/// A solid's box, and its block trimmed by `cut` each way, as the bake trims a free-standing one.
fn solid(min_x: f64, max_x: f64, cut: f64) -> ([f64; 6], Block) {
    let block =
        Block { min_x: min_x + cut, min_y: 10.0 + cut, max_x: max_x - cut, max_y: 12.0 - cut, top: 2.0, bottom: 0.0 };
    ([min_x, 10.0, max_x, 12.0, 0.0, 1.0], block)
}

/// The cells the bake leaves open between two blocks along x: those walled neither side, less one eroded each side.
fn open_cells(west: &Block, east: &Block) -> f64 {
    (east.min_x / CELL).floor() - (west.max_x / CELL).ceil() - 2.0
}

#[test]
fn a_gap_a_body_fits_through_between_two_trimmed_solids_keeps_a_cell_open_inside_it() {
    // Lion-grasslands' dungeon 3 laid two props 0.96 m apart, trimmed alike to no cell between.
    let (west, east) = (solid(61.41, 63.49, 0.25), solid(64.45, 66.13, 0.25));
    let mut blocks = [west.1, east.1];
    assert!(open_cells(&blocks[0], &blocks[1]) < 1.0, "closed, trimmed alike");
    open(&mut blocks, &[west.0, east.0], (CELL, [0.0, 0.0]));
    assert!(open_cells(&blocks[0], &blocks[1]) >= 1.0, "a cell open: {blocks:?}");
    let kept = (blocks[0].max_x / CELL).ceil() + 1.0;
    assert!(kept * CELL >= 63.49 && (kept + 1.0) * CELL <= 64.45, "the open cell inside the gap");
    assert!(blocks[0].max_x < 63.49 && blocks[1].min_x > 64.45, "each still a block");
}

#[test]
fn a_gap_narrower_than_a_body_or_beside_untrimmed_solids_is_left_as_the_bake_trims_it() {
    let (west, east) = (solid(61.41, 63.49, 0.25), solid(64.1, 66.13, 0.25));
    let mut blocks = [west.1, east.1];
    open(&mut blocks, &[west.0, east.0], (CELL, [0.0, 0.0]));
    assert_eq!(blocks, [west.1, east.1], "0.61 m: no body fits");
    let (west, east) = (solid(61.41, 63.49, 0.0), solid(64.45, 66.13, 0.0));
    let mut blocks = [west.1, east.1];
    open(&mut blocks, &[west.0, east.0], (CELL, [0.0, 0.0]));
    assert_eq!(blocks, [west.1, east.1], "a pillar's and a landmark's are never cut");
}
