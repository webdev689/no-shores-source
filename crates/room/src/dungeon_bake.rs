//! A dungeon's ground as its navmesh is baked from it: the lowest span of each column as the terrain (a flight's
//! slope where it is one, rock a wall), and the rock between each span and the one over it as a block with a bottom,
//! its top the upper storey's floor, so a path walks every storey and goes between them only by a flight.

use crate::dungeon_ground::DungeonGround;
use dungeon::storey_floor;
use movement::heights::WALL_RISE_M;
use movement::{Block, Terrain};

/// The lowest floor of each column of a dungeon's ground.
pub(crate) struct Lowest<'ground>(pub &'ground DungeonGround);

impl Terrain for Lowest<'_> {
    /// The lowest span's floor or slope; a wall's height over the top storey where the column is rock.
    fn height_at(&self, x: f64, y: f64) -> f64 {
        let ground = self.0;
        ground
            .column_at(x, y)
            .and_then(|column| ground.spans_of(column).first())
            .map_or(storey_floor(0) + WALL_RISE_M, |span| ground.span_floor(span, x, y))
    }
}

impl DungeonGround {
    /// The rock between each span of a column and the one over it: from the lower one's ceiling up to the upper one's
    /// floor, over the cell's square.
    pub(crate) fn slabs(&self) -> Vec<Block> {
        let mut slabs = Vec::new();
        for column in 0..self.columns * self.rows {
            let (min_x, min_y) =
                ((column % self.columns) as f64 * self.cell, (column / self.columns) as f64 * self.cell);
            for pair in self.spans_of(column).windows(2) {
                let (max_x, max_y) = (min_x + self.cell, min_y + self.cell);
                slabs.push(Block { min_x, min_y, max_x, max_y, top: pair[1].floor, bottom: pair[0].ceiling });
            }
        }
        slabs
    }
}
