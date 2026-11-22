//! The game's one clock: a day from 09:00 UTC to the next, and a week from Tuesday 09:00 UTC, as Destiny 1's resets
//! ran. Everything that turns reads its day and week here. It holds no time of its own: the host passes the minutes
//! since Unix time began, so the server and every browser count alike.

/// A day, minutes.
pub const DAY_MINUTES: u64 = 1_440;
/// A week, minutes.
pub const WEEK_MINUTES: u64 = 7 * DAY_MINUTES;
/// 09:00 UTC, minutes into a day.
pub const RESET_MINUTE: u64 = 9 * 60;
/// Tuesday 6 January 1970 09:00 UTC: Unix day 0 was a Thursday, so the first Tuesday came five days on.
const FIRST_WEEK_MINUTE: u64 = 5 * DAY_MINUTES + RESET_MINUTE;

/// The day it is: how many daily resets have passed since Unix time began.
#[must_use]
pub fn day_of(unix_minutes: u64) -> u64 {
    (unix_minutes + DAY_MINUTES - RESET_MINUTE) / DAY_MINUTES
}

/// The week it is: how many Tuesday resets have passed since Unix time began.
#[must_use]
pub fn week_of(unix_minutes: u64) -> u64 {
    (unix_minutes + WEEK_MINUTES - FIRST_WEEK_MINUTE) / WEEK_MINUTES
}

/// Minutes until the day turns: one at 08:59 UTC, a whole day at 09:00.
#[must_use]
pub fn minutes_to_next_day(unix_minutes: u64) -> u64 {
    DAY_MINUTES - (unix_minutes + DAY_MINUTES - RESET_MINUTE) % DAY_MINUTES
}

/// Minutes until the week turns: one at Tuesday 08:59 UTC, a whole week at 09:00.
#[must_use]
pub fn minutes_to_next_week(unix_minutes: u64) -> u64 {
    WEEK_MINUTES - (unix_minutes + WEEK_MINUTES - FIRST_WEEK_MINUTE) % WEEK_MINUTES
}
