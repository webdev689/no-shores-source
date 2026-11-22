//! Plates as the messages carry them: what others read over each player's head (`room::Plate`).

use crate::messages;
use room::{Plate, PlayerId};

type Plates<'built> =
    flatbuffers::WIPOffset<flatbuffers::Vector<'built, flatbuffers::ForwardsUOffset<messages::Plate<'built>>>>;

/// Each player's plate as the messages carry it; a guest's name is left out.
pub(crate) fn plates_vector<'built>(
    builder: &mut flatbuffers::FlatBufferBuilder<'built>,
    plates: &[(PlayerId, Plate)],
) -> Plates<'built> {
    let each: Vec<_> = plates
        .iter()
        .map(|(player, plate)| {
            let name = (!plate.name.is_empty()).then(|| builder.create_string(&plate.name));
            let args = messages::PlateArgs { player: *player, name, level: plate.level, menu: plate.menu };
            messages::Plate::create(builder, &args)
        })
        .collect();
    builder.create_vector(&each)
}

/// The plates a message holds, as the room wrote them: for tests, and for a reader in Rust.
#[must_use]
pub fn plates_of(
    plates: Option<flatbuffers::Vector<'_, flatbuffers::ForwardsUOffset<messages::Plate<'_>>>>,
) -> Vec<(PlayerId, Plate)> {
    plates
        .map(|plates| {
            plates
                .iter()
                .map(|plate| {
                    let name = plate.name().unwrap_or_default().to_owned();
                    let read = Plate { name, level: plate.level(), menu: plate.menu() };
                    (plate.player(), read)
                })
                .collect()
        })
        .unwrap_or_default()
}
