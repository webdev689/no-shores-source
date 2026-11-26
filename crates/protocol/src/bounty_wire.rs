//! The day's bounties as the gear message carries them to a player: each as it stands for their character.

use crate::messages;
use flatbuffers::{FlatBufferBuilder, WIPOffset};
use gear::bounties::{Bounty, bounty_at, faction_at, faction_board, faction_places, town_places};
use std::collections::BTreeMap;

/// The bounties a character pledged to `pledge` is shown on a day, holding `held` that day under the factions' keys:
/// the town's eight (the passages' two at their places after the factions'), the pledged faction's three, then any
/// other faction's they hold (a pledge switched since it was taken), each by its place.
fn shown(pledge: u8, held: &BTreeMap<u8, u32>, day: u64) -> Vec<(u8, Bounty)> {
    let mut rows: Vec<(u8, Bounty)> = town_places().zip(gear::bounties::board(day)).collect();
    if let Some(own) = faction_board(day, pledge) {
        rows.extend(faction_places(pledge).zip(own));
    }
    let others = held.keys().filter(|place| faction_at(**place).is_some_and(|by| by != 0 && by != pledge));
    rows.extend(others.filter_map(|place| bounty_at(day, *place).map(|bounty| (*place, bounty))));
    rows
}

/// The day's board as it stands for a character: a record of another day holds none of today's bounties.
pub(crate) fn bounties_of<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    character: &gear::Character,
    day: u64,
) -> WIPOffset<flatbuffers::Vector<'built, flatbuffers::ForwardsUOffset<messages::GearBounty<'built>>>> {
    let recorded = &character.activity.today;
    let fresh = gear::activity::Today::default();
    let today = if recorded.day == day { recorded } else { &fresh };
    let rows: Vec<_> = shown(character.allegiance.pledge, &today.faction_bounties, day)
        .into_iter()
        .map(|(place, bounty)| {
            let count = today.held(place).get(&place).copied();
            let args = messages::GearBountyArgs {
                words: Some(builder.create_string(bounty.words)),
                target: bounty.target,
                count: count.unwrap_or(0),
                held: count.is_some(),
                paid: today.paid(place).contains(&place),
                pool: bounty.pool,
                name: Some(builder.create_string(bounty.name)),
                tier: bounty.tier,
                place,
                faction: bounty.faction,
            };
            messages::GearBounty::create(builder, &args)
        })
        .collect();
    builder.create_vector(&rows)
}

#[cfg(test)]
#[path = "bounty_wire_tests.rs"]
mod bounty_wire_tests;
