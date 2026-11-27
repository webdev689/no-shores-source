//! A dungeon's ground as its navmesh is baked from it: the lowest span of each column as the terrain (a flight's
//! slope where it is one, rock a wall), and the rock between each span and the one over it as a block with a bottom,
//! its top the upper storey's floor, so a path walks every storey and goes between them only by a flight; over a
//! column's top span, unless it is the top storey's open to the sky as a line sees it, rock up to a wall's height.

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
    /// floor, over the cell's square; and over the top span where a line meets its ceiling (`span_reach`), from it
    /// up to a wall's height over the top storey, as the rock of a column open on no storey stands.
    pub(crate) fn slabs(&self) -> Vec<Block> {
        let mut slabs = Vec::new();
        for column in 0..self.columns * self.rows {
            let (min_x, min_y) =
                ((column % self.columns) as f64 * self.cell, (column / self.columns) as f64 * self.cell);
            let (max_x, max_y) = (min_x + self.cell, min_y + self.cell);
            let spans = self.spans_of(column);
            for pair in spans.windows(2) {
                slabs.push(Block { min_x, min_y, max_x, max_y, top: pair[1].floor, bottom: pair[0].ceiling });
            }
            let top = storey_floor(0) + WALL_RISE_M;
            if let Some(last) = spans.last().filter(|last| self.span_reach(last).1.is_finite() && last.ceiling < top) {
                slabs.push(Block { min_x, min_y, max_x, max_y, top, bottom: last.ceiling });
            }
        }
        slabs
    }
}
