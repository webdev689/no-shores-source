//! The chests and searchable containers on the wire, carried with a player's gear: the ask that begins to open one,
//! E held, and those standing that the player has not opened, each by its number (`room::finds`).

use flatbuffers::{FlatBufferBuilder, Vector, WIPOffset};
use room::{PlayerId, Room};

/// A chest or a container begun to be opened, E held, by its number in `item`; let go of by the gather's stop.
pub const OPEN_FIND: u8 = 81;

/// The chests standing that a player has not opened: each its number, x, y, z, the way its front faces, and 1 for a
/// vault's chest, else 0.
pub(crate) fn chests_of<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    room: &Room,
    player: PlayerId,
) -> WIPOffset<Vector<'built, f64>> {
    let chests = room.chests_for(player).into_iter();
    let numbers: Vec<f64> = chests
        .flat_map(|(number, [x, y, z, facing])| {
            let vault = if room.vault_chest(number) { 1.0 } else { 0.0 };
            [f64::from(number), x, y, z, facing, vault]
        })
        .collect();
    builder.create_vector(&numbers)
}

/// The containers searchable that a player has not searched: each its number, its box across (west, north, east,
/// south), its foot, its top and its model.
pub(crate) fn searchables_of<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    room: &Room,
    player: PlayerId,
) -> WIPOffset<Vector<'built, f64>> {
    let held = room.searchables_for(player).into_iter();
    let numbers: Vec<f64> =
        held.flat_map(|(number, holder)| std::iter::once(f64::from(number)).chain(holder)).collect();
    builder.create_vector(&numbers)
}

#[cfg(test)]
#[path = "finds_wire_tests.rs"]
mod finds_wire_tests;
