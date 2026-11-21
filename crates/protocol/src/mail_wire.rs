//! The game's mail on the wire: each letter waiting for a player, its words and what it holds, carried with their gear.

use crate::messages;
use flatbuffers::{FlatBufferBuilder, ForwardsUOffset, Vector, WIPOffset};
use gear::{At, Character};

/// Every letter waiting for a character, oldest first.
pub(crate) fn mail_offset<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    character: &Character,
) -> WIPOffset<Vector<'built, ForwardsUOffset<messages::GearLetter<'built>>>> {
    let letters: Vec<_> = character
        .mail
        .iter()
        .map(|letter| {
            let words = Some(builder.create_string(&letter.words));
            let vestige = letter.vestige.as_ref().map(|vestige| {
                let args = messages::GearVestigeArgs {
                    id: vestige.id,
                    rarity: vestige.rarity as u8,
                    slot: vestige.slot as u8,
                    level: vestige.level,
                    vaulted: false,
                };
                messages::GearVestige::create(builder, &args)
            });
            let item = letter.item.as_ref().map(|item| crate::gear_wire::item_offset(builder, item, At::Carried, 0));
            let args = messages::GearLetterArgs { id: letter.id, words, vestige, item };
            messages::GearLetter::create(builder, &args)
        })
        .collect();
    builder.create_vector(&letters)
}
