//! What the passages are worth to the gear: the week's two modifiers on each island's passages, drawn on their own
//! stream, the same kinds the dungeons' runs take, never one kind twice.

use crate::activities::{MODIFIER_KINDS, Modifier, burning, drawn};

/// The passages' draws, apart from the activities' own (`activities::DAY_MODIFIER` and the rest).
const PASSAGE_MODIFIERS: u64 = 6;

/// An island's passages' two modifiers for a week, by the island's continent's id: two kinds, each different, a Burn
/// naming the week's Art.
#[must_use]
pub fn week_modifiers(island: &str, week: u64) -> [Modifier; 2] {
    // The island folds into the period, so each island's passages draw their own pair.
    let period = week.wrapping_mul(64).wrapping_add(u64::from(island_number(island)));
    let first = drawn(period, PASSAGE_MODIFIERS, 0, MODIFIER_KINDS);
    let other = drawn(period, PASSAGE_MODIFIERS, 1, MODIFIER_KINDS - 1);
    let second = if other >= first { other + 1 } else { other };
    let art = burning(period, PASSAGE_MODIFIERS, 2);
    [Modifier::of_kind(first, art), Modifier::of_kind(second, art)]
}

/// A small number for an island's id, the same every time: FNV-1a over its bytes, folded to 16 bits.
fn island_number(island: &str) -> u16 {
    let hash = island.bytes().fold(0x811c_9dc5_u32, |hash, byte| (hash ^ u32::from(byte)).wrapping_mul(0x0100_0193));
    (hash ^ (hash >> 16)) as u16
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_week_draws_two_different_modifiers_for_each_island() {
        for week in 2_900..2_960 {
            let [first, second] = week_modifiers("continent-1", week);
            assert_ne!(first.kind(), second.kind(), "week {week}");
        }
        let weeks = |island: &str| (2_900..2_920).map(|week| week_modifiers(island, week)).collect::<Vec<_>>();
        assert_ne!(weeks("continent-1"), weeks("continent-2"), "each island its own");
    }
}
