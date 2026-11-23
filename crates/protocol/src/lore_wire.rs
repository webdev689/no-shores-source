//! The lore on the wire, carried with a player's gear: the ask that finds a chapter, the chapters they have found, and
//! those lying in their node for them, each by its number in the file (`gear::lore`).

use flatbuffers::{FlatBufferBuilder, Vector, WIPOffset};
use room::{PlayerId, Room};

/// A chapter of the lore lying in the node found, by its number in `item`.
pub const FIND_LORE: u8 = 74;

/// The chapters a player has found, by their numbers.
pub(crate) fn found_of<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    room: &Room,
    player: PlayerId,
) -> WIPOffset<Vector<'built, u16>> {
    builder.create_vector(&room.lore_found(player))
}

/// The chapters lying in the node that a player has not found: each its number, then its x and y.
pub(crate) fn here_of<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    room: &Room,
    player: PlayerId,
) -> WIPOffset<Vector<'built, f64>> {
    let here: Vec<f64> = room.lore_here(player).into_iter().flat_map(|(at, [x, y])| [f64::from(at), x, y]).collect();
    builder.create_vector(&here)
}
