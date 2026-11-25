//! The ship's part of a player's gear message: its own power, its materials, its hands and its officers, and at a
//! pledged faction's counter in a social space the officers of the day; and the Harbourmaster's asks.

use crate::gear_wire::column_number;
use crate::messages;
use flatbuffers::{FlatBufferBuilder, WIPOffset};
use gear::Character;
use gear::crew::Officer;
use gear::crew::recruit::{offers, wage};
use gear::grid::{column_xp, cost};
use gear::ship::shipyard::ShipAsk;

/// The Harbourmaster's asks (`gear::ship::shipyard`), the hull's number in `column`: a hull bought, a ship kept sailed,
/// a dress bought by its number in `item`, a dress kept laid on a ship (`item` the dress), and a ship named (its
/// words' places in `node` and `slot`, 255 for no first word; `count` 1 for a renaming, 0 for the first, free name).
pub const BUY_SHIP: u8 = 86;
pub const SAIL_SHIP: u8 = 87;
pub const BUY_DRESS: u8 = 88;
pub const DRESS_SHIP: u8 = 89;
pub const NAME_SHIP: u8 = 90;

/// One of the Harbourmaster's asks as the room takes it, or none for a number out of range.
pub(crate) fn ship_asked(ask: &messages::Ask<'_>) -> Option<ShipAsk> {
    let (hull, item) = (ask.column(), ask.item());
    Some(match ask.kind() {
        BUY_SHIP => ShipAsk::Buy { hull },
        SAIL_SHIP => ShipAsk::Sail { hull },
        BUY_DRESS => ShipAsk::BuyDress { dress: u16::try_from(item).ok()? },
        DRESS_SHIP => ShipAsk::Dress { hull, dress: u16::try_from(item).ok()? },
        NAME_SHIP => ShipAsk::Name { hull, first: ask.node(), second: ask.slot(), renaming: ask.count() > 0 },
        _ => return None,
    })
}

/// One of the Harbourmaster's asks as an input carries it.
pub(crate) fn ship_ask_args<'built>(ask: ShipAsk, args: messages::AskArgs<'built>) -> messages::AskArgs<'built> {
    match ask {
        ShipAsk::Buy { hull } => messages::AskArgs { kind: BUY_SHIP, column: hull, ..args },
        ShipAsk::Sail { hull } => messages::AskArgs { kind: SAIL_SHIP, column: hull, ..args },
        ShipAsk::BuyDress { dress } => messages::AskArgs { kind: BUY_DRESS, item: u32::from(dress), ..args },
        ShipAsk::Dress { hull, dress } => {
            messages::AskArgs { kind: DRESS_SHIP, column: hull, item: u32::from(dress), ..args }
        }
        ShipAsk::Name { hull, first, second, renaming } => messages::AskArgs {
            kind: NAME_SHIP,
            column: hull,
            node: first,
            slot: second,
            count: u32::from(renaming),
            ..args
        },
    }
}

/// The hands its complement holds: its hull's class's (`naval::class`), the Sloop's for a player who keeps none.
fn hands_most(character: &Character) -> f64 {
    let hull = character.sailed_hull().and_then(sailing::HullKind::numbered).unwrap_or_default();
    naval::class::class_of(hull).build().crew
}

/// Each ship kept, as the gear message carries it.
fn fleet_offset<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    character: &Character,
) -> WIPOffset<flatbuffers::Vector<'built, flatbuffers::ForwardsUOffset<messages::GearKeptShip<'built>>>> {
    let ships: Vec<_> = character
        .fleet
        .ships
        .iter()
        .map(|ship| {
            let (name, dress) = (Some(builder.create_vector(&ship.name_numbers())), ship.dress.numbers());
            let dress = Some(builder.create_vector(&dress));
            let args = messages::GearKeptShipArgs { hull: ship.hull, name, named: ship.named, dress };
            messages::GearKeptShip::create(builder, &args)
        })
        .collect();
    builder.create_vector(&ships)
}

fn officer_offset<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    officer: &Officer,
    wage: u32,
) -> WIPOffset<messages::GearOfficer<'built>> {
    let columns: Vec<_> = officer
        .columns()
        .iter()
        .enumerate()
        .map(|(index, column)| {
            let names: Vec<_> = officer.traits_of(index).iter().map(|id| builder.create_string(id)).collect();
            let traits = Some(builder.create_vector(&names));
            let price = cost(officer.grade, officer.columns(), index);
            let args = messages::GearColumnArgs {
                kind: column_number(*column),
                traits,
                xp: column_xp(officer.grade, index),
                aurem: price.aurem,
                fragments: 0,
                essence: price.essence,
                resource: 0,
            };
            messages::GearColumn::create(builder, &args)
        })
        .collect();
    let columns = Some(builder.create_vector(&columns));
    let chosen = Some(builder.create_vector(&officer.chosen));
    let to_next = officer.to_next();
    let args = messages::GearOfficerArgs {
        id: officer.id,
        post: officer.post as u8,
        grade: officer.grade as u8,
        given: officer.given,
        family: officer.family,
        duty: crate::gear_wire::duty_code(officer.duty),
        level: officer.level(),
        to_next,
        trained: officer.trained,
        trained_most: officer.trained_most(),
        strength: officer.strength(),
        bought: officer.bought,
        chosen,
        columns,
        wage,
    };
    messages::GearOfficer::create(builder, &args)
}

/// The ship's part of the message. `counter` is the pledged faction, rank with it and the day where the player
/// stands at its counter, none elsewhere.
pub fn ship_offset<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    character: &Character,
    counter: Option<(u8, u32, u64)>,
) -> WIPOffset<messages::GearShip<'built>> {
    let officers: Vec<_> =
        character.crew.officers.values().map(|officer| officer_offset(builder, officer, 0)).collect();
    let offered = counter.map(|(faction, rank, day)| offers(faction, day, character.level(), rank)).unwrap_or_default();
    let offered: Vec<_> = offered
        .iter()
        .enumerate()
        .map(|(place, officer)| {
            let numbered = Officer { id: u32::try_from(place).unwrap_or_default(), ..officer.clone() };
            officer_offset(builder, &numbered, wage(officer.grade))
        })
        .collect();
    let held = character.materials.ship;
    let stocks = [held.timber, held.canvas, held.iron, held.heartwood];
    let men = f64::from(character.ship[2]) / f64::from(gear::character::SHIP_WHOLE);
    let (to_next, to_next_needs) = character.ship_to_next();
    let most = hands_most(character);
    let fleet = Some(fleet_offset(builder, character));
    let kept = gear::ship::fleet::dresses().iter().enumerate().filter(|(_, found)| character.keeps_dress(&found.id));
    let dresses: Vec<u16> = kept.filter_map(|(at, _)| u16::try_from(at).ok()).collect();
    let args = messages::GearShipArgs {
        xp: character.ship_xp,
        level: character.ship_level(),
        prestige: character.ship_prestige(),
        attack: character.ship_attack(),
        defense: character.ship_defense(),
        to_next,
        to_next_needs,
        stocks: Some(builder.create_vector(&stocks)),
        hands: (most * men).round() as u16,
        hands_most: most as u16,
        officers: Some(builder.create_vector(&officers)),
        offers: Some(builder.create_vector(&offered)),
        trim: Some(builder.create_vector(&character.ship_trim().to_floats())),
        pledge: room::crew::pledge_of(character).0,
        fleet,
        sailed: character.sailed_hull().unwrap_or_default(),
        dresses: Some(builder.create_vector(&dresses)),
    };
    messages::GearShip::create(builder, &args)
}
