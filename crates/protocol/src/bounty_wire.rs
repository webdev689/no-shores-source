//! The day's bounties as the gear message carries them to a player: each as it stands for their character.

use crate::messages;
use flatbuffers::{FlatBufferBuilder, WIPOffset};

/// The day's board as it stands for a character: a record of another day holds none of today's bounties.
pub(crate) fn bounties_of<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    character: &gear::Character,
    day: u64,
) -> WIPOffset<flatbuffers::Vector<'built, flatbuffers::ForwardsUOffset<messages::GearBounty<'built>>>> {
    let today = &character.activity.today;
    let current = today.day == day;
    let rows: Vec<_> = (0u8..)
        .zip(gear::bounties::board(day))
        .map(|(place, bounty)| {
            let count = today.bounties.get(&place).filter(|_| current).copied();
            let args = messages::GearBountyArgs {
                words: Some(builder.create_string(bounty.words)),
                target: bounty.target,
                count: count.unwrap_or(0),
                held: count.is_some(),
                paid: current && today.turned_in.contains(&place),
                pool: bounty.pool,
                name: Some(builder.create_string(bounty.name)),
                tier: bounty.tier,
            };
            messages::GearBounty::create(builder, &args)
        })
        .collect();
    builder.create_vector(&rows)
}
