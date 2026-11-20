//! World time: seconds from a fixed instant, read off the wall by a room's host. A day lasts one real hour.

/// Real seconds a day lasts.
pub const DAY_S: f64 = 3600.0;
/// The instant world time counts from, milliseconds since 1970 (UTC): a midnight.
pub const EPOCH_UNIX_MS: f64 = 1_793_491_200_000.0;

/// World time, seconds, at a moment given in milliseconds since 1970.
#[must_use]
pub fn world_seconds(unix_ms: f64) -> f64 {
    (unix_ms - EPOCH_UNIX_MS) / 1000.0
}

/// How far through its day world time is: 0 at midnight, a half at noon.
#[must_use]
pub fn day_fraction(world_s: f64) -> f64 {
    let days = world_s / DAY_S;
    days - days.floor()
}

/// The hour of the day, 0 to 24.
#[must_use]
pub fn hour(world_s: f64) -> f64 {
    day_fraction(world_s) * 24.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_day_is_an_hour_and_the_epoch_is_midnight() {
        assert!(day_fraction(world_seconds(EPOCH_UNIX_MS)).abs() < 1e-12);
        assert!((hour(world_seconds(EPOCH_UNIX_MS + 1_800_000.0)) - 12.0).abs() < 1e-9, "half an hour on is noon");
        assert!((hour(world_seconds(EPOCH_UNIX_MS + 3_600_000.0 * 5.0 + 900_000.0)) - 6.0).abs() < 1e-9);
        assert!((hour(-900.0) - 18.0).abs() < 1e-9, "a quarter hour before the epoch is six in the evening");
    }
}
