//! Stage E, World 2.0's terraces at a city's scale: every cell the city builds on is levelled to its own ground's mean,
//! so a city on a hill climbs it in steps, each block flat as Daggerfall's are. A cell too steep to level, or whose
//! level would stand too far from a built neighbour's, is left as it is: a slope garden between the terraces.

use crate::footprint::{Footprint, SHORE_M};
use crate::grid::{CELL_M, Grid, SIDE_CELLS, index, neighbours};
use land::ground::{Ground, WaterAt};
use serde::Serialize;

/// The most a cell's own ground may span, metres, and the most its level may differ from a built neighbour's.
pub const CELL_SPAN_M: f64 = 14.0;
pub const STEP_M: f64 = 12.0;
/// Levels are rounded to this, metres, so a terrace's height reads as a mason's.
pub const LEVEL_ROUND_M: f64 = 0.25;
/// Samples a side when a cell's ground is surveyed.
const SURVEY: usize = 5;

/// What a cell's ground is, before the city builds on it.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(tag = "ground", rename_all = "lowercase")]
pub enum Footing {
    /// Past the footprint.
    Outside,
    /// The sea, a lake or the low shore: the harbour, never levelled.
    Shore,
    /// Too steep to level: left as it is.
    Steep,
    /// Levelled to `level` metres.
    Level { level: f64 },
}

/// A cell's ground surveyed: its mean, lowest and highest dry ground, and whether any of it is wet or shore.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Survey {
    mean: f64,
    low: f64,
    high: f64,
    shore: bool,
}

fn survey(ground: &Ground, bounds: [f64; 4]) -> Survey {
    let (mut sum, mut low, mut high, mut shore) = (0.0, f64::MAX, f64::MIN, false);
    let step = CELL_M / SURVEY as f64;
    for row in 0..SURVEY {
        for column in 0..SURVEY {
            let (x, y) = (bounds[0] + (column as f64 + 0.5) * step, bounds[1] + (row as f64 + 0.5) * step);
            let height = ground.height_at(x, y);
            let wet = matches!(ground.water_at(x, y), WaterAt::Sea | WaterAt::Lake { .. });
            shore |= wet || height < SHORE_M;
            sum += height;
            low = low.min(height);
            high = high.max(height);
        }
    }
    Survey { mean: sum / (SURVEY * SURVEY) as f64, low, high, shore }
}

/// A level rounded as the city's masons round it.
#[must_use]
pub fn rounded(level: f64) -> f64 {
    (level / LEVEL_ROUND_M).round() * LEVEL_ROUND_M
}

/// Every cell's footing, row by row: the footprint's cells surveyed and levelled, then any cell standing too far
/// from a built neighbour let go, the steeper first, until every built pair steps by no more than `STEP_M`.
#[must_use]
pub fn footings(ground: &Ground, grid: &Grid, footprint: &Footprint) -> Vec<Footing> {
    let mut spans = vec![0.0; SIDE_CELLS * SIDE_CELLS];
    let mut footings: Vec<Footing> = (0..SIDE_CELLS * SIDE_CELLS)
        .map(|at| {
            let (column, row) = (at % SIDE_CELLS, at / SIDE_CELLS);
            let centre = grid.centre(column, row);
            if !footprint.holds(centre[0], centre[1], 0.0) {
                return Footing::Outside;
            }
            let found = survey(ground, grid.bounds(column, row));
            spans[at] = found.high - found.low;
            if found.shore {
                Footing::Shore
            } else if spans[at] > CELL_SPAN_M {
                Footing::Steep
            } else {
                Footing::Level { level: rounded(found.mean) }
            }
        })
        .collect();
    loop {
        let mut worst: Option<(f64, usize)> = None;
        for row in 0..SIDE_CELLS {
            for column in 0..SIDE_CELLS {
                let Footing::Level { level } = footings[index(column, row)] else { continue };
                let breaks = neighbours(column, row).any(|(next_column, next_row)| {
                    matches!(footings[index(next_column, next_row)], Footing::Level { level: next } if (next - level).abs() > STEP_M)
                });
                let span = spans[index(column, row)];
                if breaks && worst.is_none_or(|(most, _)| span > most) {
                    worst = Some((span, index(column, row)));
                }
            }
        }
        let Some((_, at)) = worst else { break };
        footings[at] = Footing::Steep;
    }
    footings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levels_round_to_a_quarter_metre() {
        assert_eq!(rounded(12.13), 12.25);
        assert_eq!(rounded(12.12), 12.0);
        assert_eq!(rounded(-0.1), 0.0);
    }
}
