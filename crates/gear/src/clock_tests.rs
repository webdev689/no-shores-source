//! The game's one clock: the day turning at 09:00 UTC, the week at Tuesday's, and the time to each.

use crate::clock::{DAY_MINUTES, WEEK_MINUTES, day_of, minutes_to_next_day, minutes_to_next_week, week_of};

/// Minutes since 1970 at a Tuesday, 09:00 UTC: a week's turn.
const TUESDAY_NINE: u64 = 29_915_100;

#[test]
fn a_day_turns_at_nine_utc() {
    assert_eq!(day_of(TUESDAY_NINE - 1), 20_774);
    assert_eq!(day_of(TUESDAY_NINE), 20_775);
    assert_eq!(day_of(TUESDAY_NINE + DAY_MINUTES - 1), 20_775);
    assert_eq!(day_of(TUESDAY_NINE + DAY_MINUTES), 20_776);
    assert_eq!((day_of(0), day_of(539), day_of(540)), (0, 0, 1), "the first reset came nine hours in");
}

#[test]
fn a_week_turns_on_tuesday_at_nine_utc() {
    assert_eq!(week_of(TUESDAY_NINE - 1), 2_967);
    assert_eq!(week_of(TUESDAY_NINE), 2_968);
    assert_eq!(week_of(TUESDAY_NINE + 3 * DAY_MINUTES), 2_968, "Friday is the same week");
    assert_eq!(week_of(TUESDAY_NINE + WEEK_MINUTES - 1), 2_968);
    assert_eq!(week_of(TUESDAY_NINE + WEEK_MINUTES), 2_969);
    assert_eq!((week_of(7_739), week_of(7_740)), (0, 1), "Unix day 0 was a Thursday");
}

#[test]
fn the_countdowns_reach_the_next_turn() {
    assert_eq!((minutes_to_next_day(TUESDAY_NINE - 1), minutes_to_next_day(TUESDAY_NINE)), (1, DAY_MINUTES));
    assert_eq!((minutes_to_next_week(TUESDAY_NINE - 1), minutes_to_next_week(TUESDAY_NINE)), (1, WEEK_MINUTES));
    assert_eq!(minutes_to_next_week(29_919_420), 5_760, "Friday 09:00: four days to Tuesday's");
    for minute in [0, 539, 540, TUESDAY_NINE + 777] {
        assert_eq!(day_of(minute + minutes_to_next_day(minute)), day_of(minute) + 1);
        assert_eq!(week_of(minute + minutes_to_next_week(minute)), week_of(minute) + 1);
    }
}
