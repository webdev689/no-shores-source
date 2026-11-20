//! The ship's part of a player's gear message: her own power, her materials, her hands and her officers, and at a
//! pledged faction's counter in a social space the officers of the day.

use crate::gear_wire::column_number;
use crate::messages;
use flatbuffers::{FlatBufferBuilder, WIPOffset};
use gear::Character;
use gear::crew::Officer;
use gear::crew::recruit::{offers, wage};
use gear::grid::{column_xp, cost};

/// The hands a ship's complement holds: the Sloop's, as a captain's Sloop is manned.
pub const HANDS_MOST: f64 = naval::arms::PIRATE_SLOOP.crew;

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
    let (to_next, _) = gear::power::to_next(u64::from(officer.xp), 0);
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
    let args = messages::GearShipArgs {
        xp: character.ship_xp,
        level: character.ship_level(),
        prestige: character.ship_prestige(),
        attack: character.ship_attack(),
        defense: character.ship_defense(),
        to_next,
        to_next_needs,
        stocks: Some(builder.create_vector(&stocks)),
        hands: (HANDS_MOST * men).round() as u16,
        hands_most: HANDS_MOST as u16,
        officers: Some(builder.create_vector(&officers)),
        offers: Some(builder.create_vector(&offered)),
        trim: Some(builder.create_vector(&character.ship_trim().to_floats())),
    };
    messages::GearShip::create(builder, &args)
}
