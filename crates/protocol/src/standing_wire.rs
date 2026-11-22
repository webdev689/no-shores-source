//! What the gear message carries of where a player stands beyond their gear: the factions (pledge, reputation,
//! packages), each Art's level, XP and owned fragments, their cosmetics and those sold today, and in their social space
//! Shape while he is there and the factions' wares.

use crate::messages;
use flatbuffers::{FlatBufferBuilder, Vector, WIPOffset};
use gear::{At, Character};
use room::{PlayerId, Room};

/// The vectors and numbers `gear_bytes` adds to the gear message.
pub(crate) struct Standing<'built> {
    pub reputation: WIPOffset<Vector<'built, u64>>,
    pub packages: WIPOffset<Vector<'built, u32>>,
    pub art_levels: WIPOffset<Vector<'built, u8>>,
    pub art_xp: WIPOffset<Vector<'built, u32>>,
    pub art_owned: WIPOffset<Vector<'built, u8>>,
    pub cosmetics: WIPOffset<Vector<'built, u16>>,
    pub cosmetics_sold: WIPOffset<Vector<'built, u16>>,
    pub shape_place: u8,
    pub shape_wares: WIPOffset<Vector<'built, flatbuffers::ForwardsUOffset<messages::GearItem<'built>>>>,
    pub faction_wares: WIPOffset<Vector<'built, flatbuffers::ForwardsUOffset<messages::GearItem<'built>>>>,
}

/// A worn cosmetic's number; a worn id the catalogue does not hold never reaches here, as the character is made whole
/// when read (`earn_cosmetics_due`), so 0 is only a guard.
pub(crate) fn number_of_worn(id: &str) -> u16 {
    gear::cosmetics::number_of(id).unwrap_or_default()
}

/// Builds what the gear message carries beyond the gear, for a player of `room`.
pub(crate) fn standing_of<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    room: &Room,
    player: PlayerId,
    character: &Character,
) -> Standing<'built> {
    use gear::cosmetics::{Seller, sold_on};
    let factions = &gear::factions::factions().factions;
    let reputation: Vec<u64> = factions.iter().map(|faction| character.reputation(faction.id)).collect();
    let packages: Vec<u32> = factions.iter().map(|faction| character.packages(faction.id)).collect();
    let arts = &gear::arts::arts().arts;
    let art_levels: Vec<u8> = arts.iter().map(|art| character.art_level(art.id)).collect();
    let art_xp: Vec<u32> = arts.iter().map(|art| character.art_xp(art.id)).collect();
    let places = 0..u8::try_from(gear::arts::FRAGMENTS).unwrap_or(u8::MAX);
    let owned = |art: u8| {
        places.clone().filter(|place| character.owns_fragment(art, *place)).fold(0, |bits, place| bits | 1 << place)
    };
    let art_owned: Vec<u8> = arts.iter().map(|art| owned(art.id)).collect();
    let kept = character.cosmetics.kept.iter().filter_map(|id| gear::cosmetics::number_of(id));
    let cosmetics: Vec<u16> = kept.collect();
    let social = room.in_social_space(player);
    let sold: Vec<u16> = if social {
        [Seller::Tailor, Seller::Tack].into_iter().flat_map(|seller| sold_on(seller, room.day())).collect()
    } else {
        Vec::new()
    };
    let shape = room.shape_at().filter(|_| social);
    let week = gear::clock::week_of(room.minute);
    let shape_place = shape.map_or(crate::gear_wire::SHAPE_AWAY, |_| {
        u8::try_from(gear::shape::place(week)).unwrap_or(crate::gear_wire::SHAPE_AWAY)
    });
    let wares: Vec<_> = if shape.is_some() {
        gear::shape::wares(week)
            .into_iter()
            .enumerate()
            .map(|(place, mut ware)| {
                ware.id = u32::try_from(place).unwrap_or_default();
                let price = u32::from(gear::shape::price(ware.rarity));
                crate::gear_wire::item_offset(builder, &ware, At::Carried, price)
            })
            .collect()
    } else {
        Vec::new()
    };
    let mut faction_wares = Vec::new();
    for faction in factions.iter().filter(|_| social) {
        for (place, named) in gear::factions::wares(faction.id).into_iter().enumerate() {
            let ware = gear::vestige::named_item(u32::try_from(place).unwrap_or_default(), named, named.kind.slot());
            let (price, _) = gear::factions::factions().terms(named);
            faction_wares.push(crate::gear_wire::item_offset(builder, &ware, At::Carried, price));
        }
    }
    Standing {
        reputation: builder.create_vector(&reputation),
        packages: builder.create_vector(&packages),
        art_levels: builder.create_vector(&art_levels),
        art_xp: builder.create_vector(&art_xp),
        art_owned: builder.create_vector(&art_owned),
        cosmetics: builder.create_vector(&cosmetics),
        cosmetics_sold: builder.create_vector(&sold),
        shape_place,
        shape_wares: builder.create_vector(&wares),
        faction_wares: builder.create_vector(&faction_wares),
    }
}
