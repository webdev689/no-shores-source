//! The passages: from an island's patrol zone, through the sealed doors at the ends of its runs, a web of small zones
//! across the island, twenty deep, drawn anew each week from the island and the week alone, so the server and every
//! browser lay the same web, the same zones and the same ground. A lamp stands in every zone at each fifth depth,
//! where a player keeps what they found and goes home or goes on. Deeper is harder: the island's band of foe levels
//! rises with depth to the top of the game's, so every island's deep is worth walking.

pub mod island;
pub mod plan;
pub mod web;
pub mod zone;

pub mod hollow;
mod sites;
mod under;

pub use island::{Island, island};
pub use plan::{Ground as Laid, Kind as PieceKind, Piece, Plan};
pub use sites::{Door, Sites};
pub use web::Web;
pub use zone::{Current, Deal, Form, Ground, Mission, Size, Zone};

/// How deep the web goes, and how often a lamp stands: in every zone at each multiple of it.
pub const DEPTHS: u8 = 20;
pub const LAMP_EVERY: u8 = 5;
/// The least ceiling a lamp stands under, its flame and its frame, metres.
pub const LAMP_CEILING_M: f64 = 3.8;
/// The highest a passage's foes stand before the strongest of difficulties, the top of the players' levels.
pub const LEVEL_TOP: u8 = 30;
/// The most a foe's level reaches anywhere (`gear::world::FOE_LEVEL_MOST`).
pub const LEVEL_MOST: u8 = 32;

/// Whether a zone at this depth holds a lamp.
#[must_use]
pub const fn has_lamp(depth: u8) -> bool {
    depth > 0 && depth.is_multiple_of(LAMP_EVERY)
}

/// The lamp's number at a depth, 1 for the first: depth 5's is 1, depth 20's is 4; none between them.
#[must_use]
pub const fn lamp_number(depth: u8) -> Option<u8> {
    if has_lamp(depth) { Some(depth / LAMP_EVERY) } else { None }
}

/// A zone's band of foe levels: the island's own, raised by round((LEVEL_TOP − its top) × ((depth − 1) ÷ 19)²), so
/// the first depths stand at the island's band and the deepest at the top of the game's.
#[must_use]
pub fn levels((low, high): (u8, u8), depth: u8) -> (u8, u8) {
    let share = f64::from(depth.clamp(1, DEPTHS) - 1) / f64::from(DEPTHS - 1);
    let rise = libm::round(f64::from(LEVEL_TOP.saturating_sub(high)) * share * share) as u8;
    (low.saturating_add(rise).min(LEVEL_MOST), high.saturating_add(rise).min(LEVEL_MOST))
}

/// How strong a zone's currents run at a depth: 1 at the first, 2 at the deepest.
#[must_use]
pub fn strength(depth: u8) -> f64 {
    1.0 + f64::from(depth.clamp(1, DEPTHS) - 1) / f64::from(DEPTHS - 1)
}

#[cfg(test)]
mod tests;
