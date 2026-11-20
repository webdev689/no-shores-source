//! A room's world time: the wall's time at its first tick, which its winds are read at.

use sky::clock::world_seconds;

/// A room's world time at its first tick, seconds: what its host's wall read then, in milliseconds since 1970.
#[must_use]
pub fn epoch_of(unix_ms: f64) -> f64 {
    if unix_ms.is_finite() { world_seconds(unix_ms) } else { 0.0 }
}
