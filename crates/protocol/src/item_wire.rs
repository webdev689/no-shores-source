//! An item as the gear message carries it: its kind, rarity, level, name, nodes and the content it came from, and
//! each column of its nodes with what a node costs. The gear, the mail, a faction's wares and the ship's officers all
//! write theirs here.

use crate::gear_wire::at_number;
use crate::messages;
use flatbuffers::{FlatBufferBuilder, WIPOffset};
use gear::item::NONE_CHOSEN;
use gear::{At, Item};

/// A column's kind as the gear message numbers it.
pub(crate) fn column_number(column: gear::grid::Column) -> u8 {
    match column {
        gear::grid::Column::Upgrade => 0,
        gear::grid::Column::Handling(_) => 1,
        gear::grid::Column::Finish(_) => 2,
        gear::grid::Column::Perk(_) => 3,
        gear::grid::Column::Signature => 4,
    }
}

/// An item where it is (`at`), priced at a vendor's `price` (0 for one held).
pub(crate) fn item_offset<'built>(
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
        hard: item.hard,
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
        source: item.source as u8,
    };
    messages::GearItem::create(builder, &args)
}
