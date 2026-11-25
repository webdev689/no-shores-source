//! The passages on the wire: a player's asks of them, their dive with its haul, each island's lamps and their Atheric
//! bounties in their gear, and a passage zone's deal in their snapshot.

use crate::item_wire::item_offset;
use crate::messages;
use flatbuffers::{FlatBufferBuilder, WIPOffset};
use gear::Character;
use gear::dive::Route;
use room::{Asked, PassageAsk, PassageSeen};

/// The passages' asks' numbers: go on through the onward mouth `column`; kindle the dead lamp `column`; light the
/// lamp; go home; begin a dive at the patrol zone's mouth `column`, its route `slot` (0 public, 1 a company's) and the
/// lamp `node` to begin at (0 for none).
pub const PASSAGE_GO_ON: u8 = 82;
pub const PASSAGE_KINDLE: u8 = 83;
pub const PASSAGE_LIGHT: u8 = 84;
pub const PASSAGE_HOME: u8 = 85;
pub const PASSAGE_BEGIN: u8 = 86;
/// A hold's target as it crosses with none under way.
pub const NOT_HOLDING: u8 = 254;

/// An ask of the passages as a browser wrote it; none for any other kind.
#[must_use]
pub fn asked_of(ask: &messages::Ask<'_>) -> Option<Asked> {
    let column = ask.column();
    Some(Asked::Passage(match ask.kind() {
        PASSAGE_GO_ON => PassageAsk::GoOn { mouth: column },
        PASSAGE_KINDLE => PassageAsk::Kindle { lamp: column },
        PASSAGE_LIGHT => PassageAsk::LightLamp,
        PASSAGE_HOME => PassageAsk::GoHome,
        PASSAGE_BEGIN => {
            let route = if ask.slot() == 1 { Route::Company } else { Route::Public };
            PassageAsk::Begin { mouth: column, route, lamp: (ask.node() > 0).then_some(ask.node()) }
        }
        _ => return None,
    }))
}

/// An ask of the passages' fields, as a browser writes them.
#[must_use]
pub fn ask_args(ask: PassageAsk, args: messages::AskArgs<'_>) -> messages::AskArgs<'_> {
    match ask {
        PassageAsk::GoOn { mouth } => messages::AskArgs { kind: PASSAGE_GO_ON, column: mouth, ..args },
        PassageAsk::Kindle { lamp } => messages::AskArgs { kind: PASSAGE_KINDLE, column: lamp, ..args },
        PassageAsk::LightLamp => messages::AskArgs { kind: PASSAGE_LIGHT, ..args },
        PassageAsk::GoHome => messages::AskArgs { kind: PASSAGE_HOME, ..args },
        PassageAsk::Begin { mouth, route, lamp } => messages::AskArgs {
            kind: PASSAGE_BEGIN,
            column: mouth,
            slot: u8::from(route == Route::Company),
            node: lamp.unwrap_or(0),
            ..args
        },
    }
}

/// The passages' part of a player's gear: their dive, each island's lamps and their Atheric bounties, each left out
/// when there is none.
pub type Passages<'built> = (
    Option<WIPOffset<messages::GearDive<'built>>>,
    Option<WIPOffset<flatbuffers::Vector<'built, flatbuffers::ForwardsUOffset<messages::GearIslandLamps<'built>>>>>,
    Option<WIPOffset<flatbuffers::Vector<'built, flatbuffers::ForwardsUOffset<messages::GearAthericBounty<'built>>>>>,
);

/// A character's passages as their gear carries them.
pub fn passages_of<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    character: &Character,
    day: u64,
) -> Passages<'built> {
    let dive = character.passage.as_ref().map(|dive| {
        let haul = &dive.haul;
        let vestiges: Vec<_> = haul
            .vestiges
            .iter()
            .map(|vestige| {
                let args = messages::GearVestigeArgs {
                    id: 0,
                    rarity: vestige.rarity as u8,
                    slot: vestige.slot as u8,
                    level: vestige.level,
                    vaulted: false,
                    source: vestige.source as u8,
                };
                messages::GearVestige::create(builder, &args)
            })
            .collect();
        let vestiges = Some(builder.create_vector(&vestiges));
        let items: Vec<_> = haul.items.iter().map(|item| item_offset(builder, item, gear::At::Carried, 0)).collect();
        let items = Some(builder.create_vector(&items));
        let held = &haul.materials;
        let stocks = [held.weapon_fragments, held.armor_fragments, held.weapon_essence, held.armor_essence];
        let stocks = Some(builder.create_vector(&stocks));
        let resources = Some(builder.create_vector(&held.resources));
        let lantern = haul.lantern.as_deref().map(|id| builder.create_string(id));
        let haul = messages::GearHaul::create(
            builder,
            &messages::GearHaulArgs { vestiges, items, stocks, resources, lantern },
        );
        let island = Some(builder.create_string(&dive.island));
        let args = messages::GearDiveArgs {
            island,
            week: u32::try_from(dive.week).unwrap_or(u32::MAX),
            zone: dive.zone,
            depth: dive.depth,
            lamp: dive.lamp,
            route: u8::from(dive.route == Route::Company),
            mouth: dive.mouth,
            done: dive.done,
            haul: Some(haul),
            homeward: dive.homeward,
        };
        messages::GearDive::create(builder, &args)
    });
    let (today, week) = (&character.activity.today, &character.activity.this_week);
    let today_lamps = if today.day == day { today.passage_lamp.clone() } else { Default::default() };
    let islands: std::collections::BTreeSet<&String> = week.passage_lamps.keys().chain(&today_lamps).collect();
    let lamps: Vec<_> = islands
        .into_iter()
        .map(|island| {
            let lit: Vec<u8> =
                week.passage_lamps.get(island).map(|lamps| lamps.iter().copied().collect()).unwrap_or_default();
            let (island_name, lamps) = (Some(builder.create_string(island)), Some(builder.create_vector(&lit)));
            let args =
                messages::GearIslandLampsArgs { island: island_name, lamps, day_lamp: today_lamps.contains(island) };
            messages::GearIslandLamps::create(builder, &args)
        })
        .collect();
    let lamps = (!lamps.is_empty()).then(|| builder.create_vector(&lamps));
    let held = &character.atheric_bounties;
    let bounties: Vec<_> = held
        .held
        .iter()
        .map(|(id, &(step, count))| (id, step, count, false))
        .chain(held.finished.iter().map(|id| (id, 0, 0, true)))
        .map(|(id, step, count, finished)| {
            let id = Some(builder.create_string(id));
            messages::GearAthericBounty::create(builder, &messages::GearAthericBountyArgs { id, step, count, finished })
        })
        .collect();
    let bounties = (!bounties.is_empty()).then(|| builder.create_vector(&bounties));
    (dive, lamps, bounties)
}

/// A passage zone's deal as a player's snapshot carries it.
pub fn seen_offset<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    seen: &PassageSeen,
) -> WIPOffset<messages::PassageSeen<'built>> {
    let deal = Some(builder.create_string(seen.deal));
    let (holding, holding_share) = seen.holding.unwrap_or((NOT_HOLDING, 0.0));
    let args = messages::PassageSeenArgs {
        deal,
        done: seen.done,
        lit: seen.lit,
        broken: seen.broken,
        held: seen.held,
        left: seen.left,
        wave: seen.wave,
        open: seen.open,
        lamp_lit: seen.lamp_lit,
        holding,
        holding_share,
    };
    messages::PassageSeen::create(builder, &args)
}

#[cfg(test)]
#[path = "passage_wire_tests.rs"]
mod passage_wire_tests;
