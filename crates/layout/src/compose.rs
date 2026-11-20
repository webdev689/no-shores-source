//! Which RMB blocks each area stands and how: a hamlet is a tavern, houses, a shop and a temple in a cluster of one to
//! four blocks; a farm, a ruin, a keep, a graveyard, a coven, a shrine and a cave's mouth are each one block of their
//! kind. Every block is tried at all four quarter turns (and a cluster in each of its shapes) and stands where the
//! land holds most of its buildings. No block is used twice in one layout.

use crate::areas::Area;
use crate::book::{Book, RmbBlock};
use crate::brief::AreaKind;
use crate::field::Field;
use crate::seat::{Seating, fit, seat};
use city::grid::CELL_M as BLOCK_M;
use land::exact::hash32;
use land::ground::Ground;
use std::collections::BTreeSet;

/// The block families an area of a kind stands, one list a block: a hamlet's tavern, houses, shop and temple.
fn families(kind: AreaKind, blocks: u8) -> Vec<&'static [&'static str]> {
    const ONE_BLOCK_TOWNS: &[&str] = &["WAY0", "WAY1", "WAY2", "WAY3", "WAY5", "WAY6", "WAY7", "WAY8"];
    const SHOPS: &[&str] = &["GENR", "ALCH", "ARMR", "WEAP", "CLOT", "PAWN"];
    match kind {
        AreaKind::Hamlet if blocks <= 1 => vec![ONE_BLOCK_TOWNS],
        AreaKind::Hamlet => {
            [&["TVRN"][..], &["RESI"], SHOPS, &["TEMP"]].into_iter().take(usize::from(blocks.min(4))).collect()
        }
        AreaKind::Farm => vec![&["FARM"]],
        AreaKind::Ruin => vec![&["RUIN"]],
        AreaKind::Keep => vec![&["CAST"]],
        AreaKind::Graveyard => vec![&["GRVE"]],
        AreaKind::Coven => vec![&["WITC"]],
        AreaKind::Shrine => vec![&["SHRI"]],
        AreaKind::Cave => vec![&["DUNG"]],
        _ => Vec::new(),
    }
}

/// Whether an area of a kind stands RMB blocks.
#[must_use]
pub fn stands_blocks(kind: AreaKind) -> bool {
    !families(kind, 1).is_empty()
}

/// Where a cluster's blocks stand, in blocks across and down from its first, before it is turned.
fn shape(count: usize) -> &'static [[f64; 2]] {
    match count {
        0 | 1 => &[[0.0, 0.0]],
        2 => &[[0.0, 0.0], [1.0, 0.0]],
        3 => &[[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]],
        _ => &[[0.0, 0.0], [1.0, 0.0], [0.0, 1.0], [1.0, 1.0]],
    }
}

/// How wide the lanes and greens between a hamlet's blocks are, metres, how much wider some are, and how far a block
/// stands out of line with its neighbours.
const LANE_M: f64 = 10.0;
const LANE_WANDER_M: f64 = 22.0;
const OUT_OF_LINE_M: f64 = 14.0;
/// Where the brief asks for heights, how wide a hamlet's lanes are, metres, and how much wider some are: room between
/// its blocks for a ramp up from its plaza to each block's terrace (basins.rs).
const STEPPED_LANE_M: f64 = 44.0;
const STEPPED_WANDER_M: f64 = 10.0;

/// Where a cluster's block stands: its place in blocks from the cluster's middle, spaced by `across` and `down` (each a
/// spacing in blocks and a sideways shift in metres), turned with the cluster.
fn cluster_point(middle: [f64; 2], cell: [f64; 2], across: (f64, f64), down: (f64, f64), turns: u8) -> [f64; 2] {
    let local = [cell[0] * across.0 + down.1 / BLOCK_M, cell[1] * down.0 + across.1 / BLOCK_M];
    let shift = offset(local, turns);
    [middle[0] + shift[0], middle[1] + shift[1]]
}

/// An offset in blocks turned `turns` quarter turns clockwise, in metres.
fn offset(cell: [f64; 2], turns: u8) -> [f64; 2] {
    let [east, south] = [cell[0] * BLOCK_M, cell[1] * BLOCK_M];
    match turns % 4 {
        0 => [east, south],
        1 => [-south, east],
        2 => [-east, -south],
        _ => [south, -east],
    }
}

/// Stands every area's blocks, an area at a time in the order placed, into one seating; where the brief asks for
/// `heights`, a hamlet's lanes are wide enough for the ramps up to its blocks' terraces.
#[must_use]
pub fn stand(
    areas: &[Area],
    (blocks_wanted, moduled): (&[u8], &[bool]),
    book: &Book,
    (ground, field): (&Ground, &Field),
    (seed, heights): (u32, bool),
) -> Seating {
    let (lane, wander) = if heights { (STEPPED_LANE_M, STEPPED_WANDER_M) } else { (LANE_M, LANE_WANDER_M) };
    let section: Vec<bool> =
        (0..field.columns * field.rows).map(|at| field.claimed[at] && field.inside[at] >= 12.0).collect();
    let mut seating = Seating::default();
    let mut used: BTreeSet<String> = BTreeSet::new();
    // An area standing a module (`modules`) stands no blocks.
    for (number, area) in areas.iter().enumerate().filter(|(number, _)| !moduled.get(*number).copied().unwrap_or(false))
    {
        let lists = families(area.kind, blocks_wanted.get(number).copied().unwrap_or(1));
        let chosen: Vec<&RmbBlock> = lists
            .iter()
            .enumerate()
            .filter_map(|(slot, prefixes)| {
                let family: Vec<&RmbBlock> =
                    book.family(prefixes).into_iter().filter(|block| !used.contains(&block.name)).collect();
                if family.is_empty() {
                    return None;
                }
                let pick = hash32(&[i64::from(seed), number as i64, slot as i64]) as usize % family.len();
                used.insert(family[pick].name.clone());
                Some(family[pick])
            })
            .collect();
        if chosen.is_empty() {
            continue;
        }
        let cells = shape(chosen.len());
        let middle = cells.iter().fold([0.0, 0.0], |sum, cell| [sum[0] + cell[0], sum[1] + cell[1]]);
        let middle = [middle[0] / cells.len() as f64, middle[1] / cells.len() as f64];
        // A hamlet's blocks stand apart, across lanes and greens of their own width, a little out of line: a village
        // grown a house at a time, never a grid.
        let spread = |slot: usize, axis: i64| {
            let draw =
                |salt: i64| f64::from(hash32(&[i64::from(seed), number as i64, slot as i64, salt]) % 1000) / 1000.0;
            (1.0 + (lane + wander * draw(axis)) / BLOCK_M, (draw(axis + 7) - 0.5) * 2.0 * OUT_OF_LINE_M)
        };
        let mut best: Option<(f64, u8)> = None;
        for turns in 0..4_u8 {
            let held: f64 = chosen
                .iter()
                .zip(cells)
                .enumerate()
                .map(|(slot, (block, cell))| {
                    let at = cluster_point(
                        area.at,
                        [cell[0] - middle[0], cell[1] - middle[1]],
                        spread(slot, 0),
                        spread(slot, 1),
                        turns,
                    );
                    (0..4).map(|own| fit(book, block, field, &section, at, own)).fold(0.0, f64::max)
                })
                .sum();
            if best.is_none_or(|(top, _)| held > top + 1e-9) {
                best = Some((held, turns));
            }
        }
        let Some((_, turns)) = best else { continue };
        for (slot, (block, cell)) in chosen.iter().zip(cells).enumerate() {
            let at = cluster_point(
                area.at,
                [cell[0] - middle[0], cell[1] - middle[1]],
                spread(slot, 0),
                spread(slot, 1),
                turns,
            );
            // Each block takes the quarter turn the land holds best, so neighbours face their own ways.
            let own = (0..4_u8)
                .map(|own| (fit(book, block, field, &section, at, own), own))
                .fold((f64::NEG_INFINITY, 0), |top, next| if next.0 > top.0 + 1e-9 { next } else { top })
                .1;
            seat(&mut seating, book, block, ground, field, &section, (at, own));
        }
    }
    seating
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_hamlet_of_three_blocks_stands_a_tavern_houses_and_a_shop() {
        let lists = families(AreaKind::Hamlet, 3);
        assert_eq!(lists.len(), 3);
        assert_eq!(lists[0], &["TVRN"]);
        assert_eq!(families(AreaKind::Hamlet, 1).len(), 1);
        assert!(families(AreaKind::Wilds, 2).is_empty());
    }

    #[test]
    fn a_cluster_turned_a_half_turn_stands_the_other_way() {
        assert_eq!(offset([1.0, 0.0], 2), [-BLOCK_M, -0.0]);
        assert_eq!(shape(3).len(), 3);
    }
}
