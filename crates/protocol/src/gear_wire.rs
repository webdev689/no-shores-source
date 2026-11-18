//! A player's gear on the wire: the ask an input carries, read into the room's and written back for tests, and the
//! player's own gear, written for them alone whenever it changes, with every column of every item's nodes spelled out
//! so a browser draws them without the rules.

use crate::messages;
use flatbuffers::{FlatBufferBuilder, WIPOffset};
use gear::item::NONE_CHOSEN;
use gear::{Ask, At, Item, Kind, Rarity, Slot};
use room::{Asked, Drop, Grant, PlayerId, Room};

/// The asks, by the number an input sends.
pub const WEAR: u8 = 1;
pub const TAKE_OFF: u8 = 2;
pub const BUY: u8 = 3;
pub const CHOOSE: u8 = 4;
pub const DISMANTLE: u8 = 5;
pub const IDENTIFY: u8 = 6;
pub const FEED: u8 = 7;
pub const STORE: u8 = 8;
pub const WITHDRAW: u8 = 9;
pub const STORE_VESTIGE: u8 = 10;
pub const WITHDRAW_VESTIGE: u8 = 11;
pub const VEND: u8 = 12;
pub const WEAR_EMBLEM: u8 = 13;
pub const BUY_EMBLEM: u8 = 14;
pub const GATHER: u8 = 20;
pub const GRANT_VESTIGE: u8 = 30;
pub const GRANT_NAMED: u8 = 31;
pub const GRANT_ITEM: u8 = 32;
pub const GRANT_MATERIALS: u8 = 33;
pub const GRANT_XP: u8 = 34;

/// An ask as the room takes it, or none for a number or a name it does not know.
#[must_use]
pub fn asked_of(ask: &messages::Ask<'_>) -> Option<Asked> {
    let item = ask.item();
    let slot = || Slot::from_number(ask.slot());
    let (column, node) = (ask.column(), ask.node());
    Some(match ask.kind() {
        WEAR => Asked::Gear(Ask::Wear { item, slot: slot()? }),
        TAKE_OFF => Asked::Gear(Ask::TakeOff { slot: slot()? }),
        BUY => Asked::Gear(Ask::Buy { item, column, node }),
        CHOOSE => Asked::Gear(Ask::Choose { item, column, node }),
        DISMANTLE => Asked::Gear(Ask::Dismantle { item }),
        IDENTIFY => Asked::Gear(Ask::Identify { vestige: item }),
        FEED => Asked::Gear(Ask::Feed { item }),
        STORE => Asked::Gear(Ask::Store { item }),
        WITHDRAW => Asked::Gear(Ask::Withdraw { item }),
        STORE_VESTIGE => Asked::Gear(Ask::StoreVestige { vestige: item }),
        WITHDRAW_VESTIGE => Asked::Gear(Ask::WithdrawVestige { vestige: item }),
        VEND => Asked::Gear(Ask::Vend { vendor: gear::vendor::Vendor::from_number(column)?, ware: node }),
        WEAR_EMBLEM => Asked::Gear(Ask::WearEmblem { emblem: u16::try_from(item).ok()? }),
        BUY_EMBLEM => Asked::Gear(Ask::BuyEmblem { emblem: u16::try_from(item).ok()? }),
        GATHER => Asked::Gather { node },
        GRANT_VESTIGE => Asked::Grant(Grant::Vestige {
            rarity: Rarity::from_number(ask.rarity())?,
            slot: slot()?,
            level: ask.level(),
        }),
        GRANT_NAMED => Asked::Grant(Grant::Named(ask.named()?.to_owned())),
        GRANT_ITEM => Asked::Grant(Grant::Item {
            kind: Kind::from_number(ask.item_kind())?,
            rarity: Rarity::from_number(ask.rarity())?,
            level: ask.level(),
        }),
        GRANT_MATERIALS => Asked::Grant(Grant::Materials(u16::try_from(ask.count()).unwrap_or(u16::MAX))),
        GRANT_XP => Asked::Grant(Grant::Xp(ask.count())),
        _ => return None,
    })
}

/// An ask written as an input carries it: for tests, as a browser writes it.
pub fn ask_offset<'built>(builder: &mut FlatBufferBuilder<'built>, asked: &Asked) -> WIPOffset<messages::Ask<'built>> {
    let mut args = messages::AskArgs::default();
    match asked {
        Asked::Gear(ask) => match *ask {
            Ask::Wear { item, slot } => args = messages::AskArgs { kind: WEAR, item, slot: slot as u8, ..args },
            Ask::TakeOff { slot } => args = messages::AskArgs { kind: TAKE_OFF, slot: slot as u8, ..args },
            Ask::Buy { item, column, node } => args = messages::AskArgs { kind: BUY, item, column, node, ..args },
            Ask::Choose { item, column, node } => args = messages::AskArgs { kind: CHOOSE, item, column, node, ..args },
            Ask::Dismantle { item } => args = messages::AskArgs { kind: DISMANTLE, item, ..args },
            Ask::Identify { vestige } => args = messages::AskArgs { kind: IDENTIFY, item: vestige, ..args },
            Ask::Feed { item } => args = messages::AskArgs { kind: FEED, item, ..args },
            Ask::Store { item } => args = messages::AskArgs { kind: STORE, item, ..args },
            Ask::Withdraw { item } => args = messages::AskArgs { kind: WITHDRAW, item, ..args },
            Ask::StoreVestige { vestige } => args = messages::AskArgs { kind: STORE_VESTIGE, item: vestige, ..args },
            Ask::WithdrawVestige { vestige } => {
                args = messages::AskArgs { kind: WITHDRAW_VESTIGE, item: vestige, ..args };
            }
            Ask::Vend { vendor, ware } => {
                args = messages::AskArgs { kind: VEND, column: vendor as u8, node: ware, ..args };
            }
            Ask::WearEmblem { emblem } => {
                args = messages::AskArgs { kind: WEAR_EMBLEM, item: u32::from(emblem), ..args };
            }
            Ask::BuyEmblem { emblem } => args = messages::AskArgs { kind: BUY_EMBLEM, item: u32::from(emblem), ..args },
        },
        Asked::Gather { node } => args = messages::AskArgs { kind: GATHER, node: *node, ..args },
        Asked::Grant(Grant::Vestige { rarity, slot, level }) => {
            args = messages::AskArgs {
                kind: GRANT_VESTIGE,
                rarity: *rarity as u8,
                slot: *slot as u8,
                level: *level,
                ..args
            };
        }
        Asked::Grant(Grant::Named(named)) => {
            let named = builder.create_string(named);
            args = messages::AskArgs { kind: GRANT_NAMED, named: Some(named), ..args };
        }
        Asked::Grant(Grant::Item { kind, rarity, level }) => {
            let (item_kind, rarity) = (*kind as u8, *rarity as u8);
            args = messages::AskArgs { kind: GRANT_ITEM, item_kind, rarity, level: *level, ..args };
        }
        Asked::Grant(Grant::Materials(count)) => {
            args = messages::AskArgs { kind: GRANT_MATERIALS, count: u32::from(*count), ..args };
        }
        Asked::Grant(Grant::Xp(count)) => args = messages::AskArgs { kind: GRANT_XP, count: *count, ..args },
    }
    messages::Ask::create(builder, &args)
}

/// Where an item is, as the gear message numbers it: 0 carried, 1 the vault, 2 and on worn in the slot that many
/// less 2.
#[must_use]
pub fn at_number(at: At) -> u8 {
    match at {
        At::Carried => 0,
        At::Vault => 1,
        At::Worn(slot) => 2 + slot as u8,
    }
}

/// A column's kind as the gear message numbers it.
fn column_number(column: gear::grid::Column) -> u8 {
    match column {
        gear::grid::Column::Upgrade => 0,
        gear::grid::Column::Handling(_) => 1,
        gear::grid::Column::Finish(_) => 2,
        gear::grid::Column::Perk(_) => 3,
        gear::grid::Column::Signature => 4,
    }
}

fn item_offset<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    item: &Item,
    at: At,
    price: u32,
) -> WIPOffset<messages::GearItem<'built>> {
    let columns: Vec<_> = item
        .columns()
        .iter()
        .enumerate()
        .map(|(index, column)| {
            let names: Vec<_> = item.traits_of(index).iter().map(|id| builder.create_string(id)).collect();
            let traits = Some(builder.create_vector(&names));
            let cost = item.cost_of(index);
            let args = messages::GearColumnArgs {
                kind: column_number(*column),
                traits,
                xp: gear::grid::column_xp(item.rarity, index),
                aurem: cost.aurem,
                fragments: cost.fragments,
                essence: cost.essence,
                resource: cost.resource,
            };
            messages::GearColumn::create(builder, &args)
        })
        .collect();
    let columns = Some(builder.create_vector(&columns));
    let named = item.named.as_deref().map(|named| builder.create_string(named));
    let chosen = Some(builder.create_vector(&item.chosen));
    let args = messages::GearItemArgs {
        id: item.id,
        kind: item.kind as u8,
        rarity: item.rarity as u8,
        level: item.level,
        named,
        name: item.name,
        resource: item.resource.unwrap_or(NONE_CHOSEN),
        breach: item.breach,
        xp: item.xp,
        xp_most: item.xp_most(),
        bought: item.bought,
        chosen,
        bucket: item.bucket as u8,
        at: at_number(at),
        attack: item.attack().unwrap_or(0),
        defense: item.defense().unwrap_or(0),
        prestige: item.prestige(),
        columns,
        price,
        element: item.element.map_or(0, |element| element as u8),
    };
    messages::GearItem::create(builder, &args)
}

/// A player's own gear, as the room sends it to them alone; none for a player the room does not hold.
#[must_use]
pub fn gear_bytes(room: &Room, player: PlayerId) -> Option<Vec<u8>> {
    let found = room.player(player)?;
    let character = &found.character;
    let held = &character.materials;
    let mut builder = FlatBufferBuilder::new();
    let items: Vec<_> = character.items.values().map(|(item, at)| item_offset(&mut builder, item, *at, 0)).collect();
    // In a social space, the day's wares, each numbered by its place among its vendor's.
    let emblems: Vec<u16> = character.emblems.iter().filter_map(|id| gear::emblems::number_of(id)).collect();
    // In a social space, the emblems the Tailor sells that day.
    let emblems_sold = if room.in_social_space(player) { gear::emblems::sold_on(room.day) } else { Vec::new() };
    let wares: Vec<_> = if room.in_social_space(player) {
        gear::vendor::Vendor::ALL
            .into_iter()
            .flat_map(|vendor| gear::vendor::wares(vendor, room.day, character.level()))
            .enumerate()
            .map(|(place, mut ware)| {
                ware.id = u32::try_from(place % gear::vendor::WARES).unwrap_or_default();
                let price = gear::vendor::price(ware.rarity);
                item_offset(&mut builder, &ware, At::Carried, price)
            })
            .collect()
    } else {
        Vec::new()
    };
    let wares = Some(builder.create_vector(&wares));
    let items = Some(builder.create_vector(&items));
    let vestiges: Vec<_> = character
        .vestiges
        .values()
        .map(|(vestige, vaulted)| {
            let args = messages::GearVestigeArgs {
                id: vestige.id,
                rarity: vestige.rarity as u8,
                slot: vestige.slot as u8,
                level: vestige.level,
                vaulted: *vaulted,
            };
            messages::GearVestige::create(&mut builder, &args)
        })
        .collect();
    let vestiges = Some(builder.create_vector(&vestiges));
    let drops: Vec<Drop> = room.drops_for(player).copied().collect();
    let drops: Vec<_> = drops
        .iter()
        .map(|drop| {
            let at = Some(builder.create_vector(&drop.at));
            let vestige = drop.vestige;
            let args =
                messages::GearDropArgs { id: vestige.id, rarity: vestige.rarity as u8, slot: vestige.slot as u8, at };
            messages::GearDrop::create(&mut builder, &args)
        })
        .collect();
    let drops = Some(builder.create_vector(&drops));
    let stocks = [held.weapon_fragments, held.armor_fragments, held.weapon_essence, held.armor_essence, held.fruit];
    let nodes: Vec<f64> = room
        .nodes_for(player)
        .flat_map(|(index, node)| [f64::from(index), node.x, node.y, f64::from(node.resource)])
        .collect();
    let (to_next, to_next_needs) = character.to_next();
    let arms: Vec<u32> = room::arms_allowed(character).into_iter().map(combat::Arms::code).collect();
    let args = messages::GearArgs {
        xp: character.xp,
        level: character.level(),
        prestige: character.prestige(),
        defense: character.defense(),
        aurem: held.aurem,
        stocks: Some(builder.create_vector(&stocks)),
        resources: Some(builder.create_vector(&held.resources)),
        items,
        vestiges,
        drops,
        spent: Some(builder.create_vector(&found.spent)),
        at_reader: room.at_reader(player),
        answer: found.answer,
        identified: found.identified,
        answered: found.answered,
        nodes: Some(builder.create_vector(&nodes)),
        wares,
        trim: Some(builder.create_vector(&found.trim.to_floats())),
        to_next,
        to_next_needs,
        fruit_growing: character.fruit_growing().unwrap_or(-1.0),
        arms: Some(builder.create_vector(&arms)),
        emblems: Some(builder.create_vector(&emblems)),
        emblem: gear::emblems::number_of(&character.emblem).unwrap_or_default(),
        emblems_sold: Some(builder.create_vector(&emblems_sold)),
    };
    let gear = messages::Gear::create(&mut builder, &args);
    let message =
        messages::FromRoom::create(&mut builder, &messages::FromRoomArgs { gear: Some(gear), ..Default::default() });
    builder.finish(message, None);
    Some(builder.finished_data().to_vec())
}

#[cfg(test)]
#[path = "gear_wire_tests.rs"]
mod gear_wire_tests;
