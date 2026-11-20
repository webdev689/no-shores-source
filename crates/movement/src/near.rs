//! Finding the blocks near a body without walking every block: a grid over the blocks' footprints, built once when
//! the blocks are set, that answers for a point every block that could hold it within a body's radius, in the order
//! the blocks were given. Every rule still tests each answered block itself, and the blocks left out could not have
//! held the point, so a rule answers exactly what it would over the whole list, to the bit.

use crate::blocks::Block;
use crate::body::TUNING;

/// Blocks a rule can ask for the ones near a point: every block that could hold (x, y) within a body's radius, in the
/// order they were given, and any others it likes.
pub trait Near {
    fn near(&self, x: f64, y: f64) -> impl Iterator<Item = &Block>;

    /// Every block, in the order given.
    fn all(&self) -> &[Block];
}

impl Near for [Block] {
    fn near(&self, _x: f64, _y: f64) -> impl Iterator<Item = &Block> {
        self.iter()
    }

    fn all(&self) -> &[Block] {
        self
    }
}

impl<const N: usize> Near for [Block; N] {
    fn near(&self, _x: f64, _y: f64) -> impl Iterator<Item = &Block> {
        self.iter()
    }

    fn all(&self) -> &[Block] {
        self
    }
}

impl Near for Vec<Block> {
    fn near(&self, _x: f64, _y: f64) -> impl Iterator<Item = &Block> {
        self.iter()
    }

    fn all(&self) -> &[Block] {
        self
    }
}

/// The side of a cell, metres, at its smallest: about a body's reach, so a point's cell holds few blocks.
const SMALLEST_CELL: f64 = 2.0;

/// The most cells the grid has, so a block spanning a whole node costs a few hundred kilobytes at most.
const MOST_CELLS: f64 = 16_384.0;

/// Blocks with a grid over them: each cell lists, in the blocks' order, every block whose footprint grown by a body's
/// radius reaches into it.
#[derive(Clone, Debug)]
pub struct Blocks {
    list: Vec<Block>,
    west: f64,
    north: f64,
    cell: f64,
    columns: usize,
    rows: usize,
    /// Where each cell's list starts in `members`; one more than there are cells.
    starts: Vec<u32>,
    members: Vec<u32>,
}

impl Blocks {
    /// The grid over `list`.
    #[must_use]
    pub fn new(list: Vec<Block>) -> Self {
        let grown = |block: &Block| {
            let reach = TUNING.radius;
            [block.min_x - reach, block.min_y - reach, block.max_x + reach, block.max_y + reach]
        };
        let finite = list.iter().map(grown).filter(|edges| edges.iter().all(|edge| edge.is_finite()));
        let [west, north, east, south] = finite.fold(
            [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY],
            |[west, north, east, south], [min_x, min_y, max_x, max_y]| {
                [west.min(min_x), north.min(min_y), east.max(max_x), south.max(max_y)]
            },
        );
        let mut index = Self {
            list,
            west: 0.0,
            north: 0.0,
            cell: SMALLEST_CELL,
            columns: 1,
            rows: 1,
            starts: Vec::new(),
            members: Vec::new(),
        };
        if west <= east && north <= south {
            let (width, depth) = (east - west, south - north);
            index.cell = SMALLEST_CELL.max(libm::sqrt(width * depth / MOST_CELLS)).max(width.max(depth) / 1024.0);
            index.west = west;
            index.north = north;
            index.columns = cells_across(width, index.cell);
            index.rows = cells_across(depth, index.cell);
        }
        index.fill(grown);
        index
    }

    /// Stands `block` among them, after the rest, the grid laid again: a course closing a way while it is played.
    pub fn push(&mut self, block: Block) {
        let mut list = std::mem::take(&mut self.list);
        list.push(block);
        *self = Self::new(list);
    }

    /// Takes out the block at `index` (the order kept for the rest), the grid laid again: a course opening a way.
    pub fn remove(&mut self, index: usize) -> Block {
        let mut list = std::mem::take(&mut self.list);
        let taken = list.remove(index);
        *self = Self::new(list);
        taken
    }

    /// Lists each block in every cell its grown footprint reaches, counting first so the lists sit in one array.
    fn fill(&mut self, grown: impl Fn(&Block) -> [f64; 4]) {
        let spans: Vec<[usize; 4]> = self
            .list
            .iter()
            .map(|block| {
                let [min_x, min_y, max_x, max_y] = grown(block);
                [self.column(min_x), self.row(min_y), self.column(max_x), self.row(max_y)]
            })
            .collect();
        let mut counts = vec![0_u32; self.columns * self.rows + 1];
        for &[west, north, east, south] in &spans {
            for row in north..=south {
                (west..=east).for_each(|column| counts[row * self.columns + column + 1] += 1);
            }
        }
        for cell in 1..counts.len() {
            counts[cell] += counts[cell - 1];
        }
        let mut next = counts.clone();
        self.members = vec![0; counts.last().map_or(0, |&total| total as usize)];
        for (number, &[west, north, east, south]) in spans.iter().enumerate() {
            for row in north..=south {
                for column in west..=east {
                    let slot = &mut next[row * self.columns + column];
                    self.members[*slot as usize] = u32::try_from(number).expect("fewer than 4 billion blocks");
                    *slot += 1;
                }
            }
        }
        self.starts = counts;
    }

    /// The column holding `x`: the same rounding for a point as for a block's edge, so a point inside a grown
    /// footprint always falls in a column the block is listed in. Points past the grid fall in its edge columns.
    fn column(&self, x: f64) -> usize {
        clamped(libm::floor((x - self.west) / self.cell), self.columns)
    }

    fn row(&self, y: f64) -> usize {
        clamped(libm::floor((y - self.north) / self.cell), self.rows)
    }
}

impl Near for Blocks {
    fn near(&self, x: f64, y: f64) -> impl Iterator<Item = &Block> {
        let cell = self.row(y) * self.columns + self.column(x);
        let (start, end) = (self.starts[cell] as usize, self.starts[cell + 1] as usize);
        self.members[start..end].iter().map(|&number| &self.list[number as usize])
    }

    fn all(&self) -> &[Block] {
        &self.list
    }
}

impl core::ops::Deref for Blocks {
    type Target = [Block];

    fn deref(&self) -> &[Block] {
        &self.list
    }
}

/// No blocks: one empty cell, so a door asked to step before it holds a course answers open ground.
impl Default for Blocks {
    fn default() -> Self {
        Self::new(Vec::new())
    }
}

impl From<Vec<Block>> for Blocks {
    fn from(list: Vec<Block>) -> Self {
        Self::new(list)
    }
}

/// How many cells of side `cell` cover `length`, at least one.
fn cells_across(length: f64, cell: f64) -> usize {
    clamped(libm::floor(length / cell), usize::MAX) + 1
}

/// A cell's number, kept on the grid: NaN and anything below it to the first, anything past it to the last.
fn clamped(cell: f64, cells: usize) -> usize {
    if cell >= 0.0 { (cell.min(1e9) as usize).min(cells - 1) } else { 0 }
}
