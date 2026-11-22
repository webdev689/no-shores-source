//! A player's gear on the wire: the ask an input carries, read into the room's and written back for tests, and the
//! player's own gear, written for them alone whenever it changes, with every column of every item's nodes spelled out
//! so a browser draws them without the rules.

use crate::messages;
use flatbuffers::{FlatBufferBuilder, WIPOffset};
use gear::arts::ArtAsk;
use gear::item::NONE_CHOSEN;
use gear::{Ask, At, Item, Kind, Rarity, Slot};
use room::{Asked, Drop, Dropped, Grant, PlayerId, Room};

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
pub const USE_CRATE: u8 = 15;
pub const BUY_CRATE: u8 = 16;
/// A module fed into another: the kept one in `item`, the fed one in `count`.
pub const INFUSE: u8 = 17;
/// The crew's asks: an officer of the day signed on (`column` the faction, `node` the offer), one stationed (`item` the officer, `slot` the
/// duty: 0 aboard, 1 at their post, 2 ashore), paid off, and their nodes bought and chosen (`column`, `node`).
pub const RECRUIT: u8 = 58;
pub const STATION: u8 = 59;
pub const DISMISS: u8 = 60;
pub const TRAIN: u8 = 61;
pub const CHOOSE_OFFICER: u8 = 62;
pub const GATHER: u8 = 20;
/// One's chest from a public event opened, by its number among one's drops in `item`.
pub const OPEN_CHEST: u8 = 21;
pub const GRANT_VESTIGE: u8 = 30;
pub const GRANT_NAMED: u8 = 31;
pub const GRANT_ITEM: u8 = 32;
pub const GRANT_MATERIALS: u8 = 33;
pub const GRANT_XP: u8 = 34;
/// A status granted: its number (combat's) in `slot`, on the player (0) or every foe (1) in `node`, and its ticks in
/// `count`, 0 for its own time.
pub const GRANT_STATUS: u8 = 35;
/// The Test Ground's grant of the Anima full and both Tenets ready.
pub const GRANT_ARTS: u8 = 36;
/// The Ranged loadout's ammunition set to `count` parts of `gear::ammo::AMMO_FULL`, and `count` Ammo crates more.
pub const GRANT_AMMO: u8 = 37;
pub const GRANT_CRATES: u8 = 38;
/// A loadout of `item_kind` worn: one carried, or a Normal one handed out.
pub const GRANT_WORN: u8 = 39;
/// An Art worn, by its number in `column`; a fragment set in its Core, the Art in `column`, the slot (0 to 2) in
/// `slot` and the fragment's place in its Art's list (0 to 5) in `node`.
pub const WEAR_ART: u8 = 40;
pub const SET_CORE: u8 = 41;
/// A First Mate and a Bosun of `level` signed on and sent ashore.
pub const GRANT_OFFICERS: u8 = 43;
/// A sea island's wreck scavenged, by its place in the island's list in `node`.
pub const SCAVENGE: u8 = 63;
/// A gather let go of before it is done: E released.
pub const STOP_GATHER: u8 = 67;
/// The prologue played, which the room keeps with the character.
pub const FINISH_PROLOGUE: u8 = 68;
/// A bounty taken or turned in: its place on the board in `node`, the day of the board shown in `item`, as the gear's
/// `day` sends it.
pub const TAKE_BOUNTY: u8 = 69;
pub const TURN_IN_BOUNTY: u8 = 70;
/// A letter taken from the mail, by its number in `item`; and every letter there is room for.
pub const TAKE_LETTER: u8 = 71;
pub const TAKE_ALL_LETTERS: u8 = 72;
/// An Art, its number in `column`, set at `level` owning all its fragments: the Test Ground's grant.
pub const GRANT_ART_LEVEL: u8 = 42;
/// A Core slot with no fragment, as the gear message carries it.
pub const NO_FRAGMENT: u8 = 255;
/// A faction's asks, the faction's number in `column`: to pledge to it, to buy one of its wares (its place among
/// them in `node`), to collect a package.
pub const PLEDGE: u8 = 50;
pub const BUY_FACTION_WARE: u8 = 51;
pub const COLLECT_PACKAGE: u8 = 52;
/// An Art raised a level, or one of its fragments bought, at its faction's counter: the Art in `column`, the
/// fragment's place in `node`.
pub const RISE_ART: u8 = 53;
pub const BUY_FRAGMENT: u8 = 54;
/// A cosmetic worn, or bought from the Tailor or the Tack, by its number in `item`.
pub const WEAR_COSMETIC: u8 = 55;
pub const BUY_COSMETIC: u8 = 56;
/// One of Shape's wares of the week bought, by its place in `node`.
pub const BUY_FROM_SHAPE: u8 = 57;
/// A keeper spoken with, by their number in `column` (`gear::quests::keeper_key`), at their counter.
pub const SPEAK: u8 = 64;
/// A fragment chosen for a choice a house's road gave: the Art in `column`, the fragment's place in `node`.
pub const CHOOSE_FRAGMENT: u8 = 65;
/// A puzzle's point used, by its place among its goal's points in `column`.
pub const USE_POINT: u8 = 66;
/// A return to the player's ship asked, which the room answers before the page leaves for the sea.
pub const TO_SHIP: u8 = 73;
/// Shape's place on the gear message while he is away.
pub const SHAPE_AWAY: u8 = 255;

/// An officer's duty by its number on the wire.
fn duty_of(number: u8) -> Option<gear::crew::Duty> {
    use gear::crew::Duty;
    [Duty::Aboard, Duty::Posted, Duty::Ashore].get(usize::from(number)).copied()
}

/// An officer's duty's number on the wire.
#[must_use]
pub fn duty_code(duty: gear::crew::Duty) -> u8 {
    use gear::crew::Duty;
    match duty {
        Duty::Aboard => 0,
        Duty::Posted => 1,
        Duty::Ashore => 2,
    }
}

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
        VEND => Asked::Gear(Ask::Vend { vendor: gear::vendor::Vendor::from_number(column)?, ware: node, day: item }),
        WEAR_EMBLEM => Asked::Gear(Ask::WearEmblem { emblem: u16::try_from(item).ok()? }),
        BUY_EMBLEM => Asked::Gear(Ask::BuyEmblem { emblem: u16::try_from(item).ok()? }),
        USE_CRATE => Asked::Gear(Ask::UseCrate),
        BUY_CRATE => Asked::Gear(Ask::BuyCrate),
        FINISH_PROLOGUE => Asked::Gear(Ask::FinishPrologue),
        TAKE_BOUNTY => Asked::Gear(Ask::TakeBounty { place: node, day: u64::from(item) }),
        TURN_IN_BOUNTY => Asked::Gear(Ask::TurnInBounty { place: node, day: u64::from(item) }),
        TAKE_LETTER => Asked::Gear(Ask::TakeLetter { letter: item }),
        TAKE_ALL_LETTERS => Asked::Gear(Ask::TakeAllLetters),
        INFUSE => Asked::Gear(Ask::Infuse { item, fed: ask.count() }),
        RECRUIT => Asked::Gear(Ask::Recruit { faction: column, offer: node }),
        STATION => Asked::Gear(Ask::Station { officer: item, duty: duty_of(ask.slot())? }),
        DISMISS => Asked::Gear(Ask::Dismiss { officer: item }),
        TRAIN => Asked::Gear(Ask::Train { officer: item, column, node }),
        CHOOSE_OFFICER => Asked::Gear(Ask::ChooseOfficer { officer: item, column, node }),
        GATHER => Asked::Gather { node },
        OPEN_CHEST => Asked::OpenChest { chest: item },
        STOP_GATHER => Asked::StopGather,
        SCAVENGE => Asked::Scavenge { wreck: node },
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
        GRANT_STATUS => Asked::Grant(Grant::Status {
            status: combat::Status::from_number(ask.slot())?,
            on_foes: node == 1,
            ticks: Some(ask.count()).filter(|ticks| *ticks > 0),
        }),
        GRANT_ARTS => Asked::Grant(Grant::ArtsReady),
        WEAR_ART => Asked::Art(ArtAsk::Wear { art: column }),
        SET_CORE => Asked::Art(ArtAsk::SetCore { art: column, slot: ask.slot(), fragment: node }),
        GRANT_AMMO => Asked::Grant(Grant::Ammo(u16::try_from(ask.count()).unwrap_or(u16::MAX))),
        GRANT_CRATES => Asked::Grant(Grant::Crates(u16::try_from(ask.count()).unwrap_or(u16::MAX))),
        GRANT_OFFICERS => Asked::Grant(Grant::Officers(ask.level())),
        GRANT_WORN => Asked::Grant(Grant::Worn(Kind::from_number(ask.item_kind())?)),
        GRANT_ART_LEVEL => Asked::Grant(Grant::ArtLevel { art: column, level: ask.level() }),
        PLEDGE => Asked::Gear(Ask::Pledge { faction: column }),
        BUY_FACTION_WARE => Asked::Gear(Ask::BuyFactionWare { faction: column, ware: node }),
        COLLECT_PACKAGE => Asked::Gear(Ask::CollectPackage { faction: column }),
        RISE_ART => Asked::Gear(Ask::RiseArt { art: column, fragment: node }),
        BUY_FRAGMENT => Asked::Gear(Ask::BuyFragment { art: column, fragment: node }),
        WEAR_COSMETIC => Asked::Gear(Ask::WearCosmetic { cosmetic: u16::try_from(item).ok()? }),
        BUY_COSMETIC => Asked::Gear(Ask::BuyCosmetic { cosmetic: u16::try_from(item).ok()? }),
        BUY_FROM_SHAPE => Asked::Gear(Ask::BuyFromShape { ware: node, shown: item }),
        SPEAK => Asked::Gear(Ask::Speak { keeper: column }),
        CHOOSE_FRAGMENT => Asked::Gear(Ask::ChooseFragment { art: column, fragment: node }),
        USE_POINT => Asked::UsePoint { point: column },
        TO_SHIP => Asked::ToShip,
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
            Ask::Vend { vendor, ware, day } => {
                args = messages::AskArgs { kind: VEND, column: vendor as u8, node: ware, item: day, ..args };
            }
            Ask::WearEmblem { emblem } => {
                args = messages::AskArgs { kind: WEAR_EMBLEM, item: u32::from(emblem), ..args };
            }
            Ask::BuyEmblem { emblem } => args = messages::AskArgs { kind: BUY_EMBLEM, item: u32::from(emblem), ..args },
            Ask::UseCrate => args = messages::AskArgs { kind: USE_CRATE, ..args },
            Ask::BuyCrate => args = messages::AskArgs { kind: BUY_CRATE, ..args },
            Ask::Infuse { item, fed } => args = messages::AskArgs { kind: INFUSE, item, count: fed, ..args },
            Ask::Recruit { faction, offer } => {
                args = messages::AskArgs { kind: RECRUIT, column: faction, node: offer, ..args }
            }
            Ask::Station { officer, duty } => {
                args = messages::AskArgs { kind: STATION, item: officer, slot: duty_code(duty), ..args };
            }
            Ask::Dismiss { officer } => args = messages::AskArgs { kind: DISMISS, item: officer, ..args },
            Ask::Train { officer, column, node } => {
                args = messages::AskArgs { kind: TRAIN, item: officer, column, node, ..args };
            }
            Ask::ChooseOfficer { officer, column, node } => {
                args = messages::AskArgs { kind: CHOOSE_OFFICER, item: officer, column, node, ..args };
            }
            Ask::Pledge { faction } => args = messages::AskArgs { kind: PLEDGE, column: faction, ..args },
            Ask::BuyFactionWare { faction, ware } => {
                args = messages::AskArgs { kind: BUY_FACTION_WARE, column: faction, node: ware, ..args };
            }
            Ask::CollectPackage { faction } => {
                args = messages::AskArgs { kind: COLLECT_PACKAGE, column: faction, ..args };
            }
            Ask::RiseArt { art, fragment } => {
                args = messages::AskArgs { kind: RISE_ART, column: art, node: fragment, ..args };
            }
            Ask::BuyFragment { art, fragment } => {
                args = messages::AskArgs { kind: BUY_FRAGMENT, column: art, node: fragment, ..args };
            }
            Ask::WearCosmetic { cosmetic } => {
                args = messages::AskArgs { kind: WEAR_COSMETIC, item: u32::from(cosmetic), ..args };
            }
            Ask::BuyCosmetic { cosmetic } => {
                args = messages::AskArgs { kind: BUY_COSMETIC, item: u32::from(cosmetic), ..args };
            }
            Ask::BuyFromShape { ware, shown } => {
                args = messages::AskArgs { kind: BUY_FROM_SHAPE, node: ware, item: shown, ..args };
            }
            Ask::Speak { keeper } => args = messages::AskArgs { kind: SPEAK, column: keeper, ..args },
            Ask::ChooseFragment { art, fragment } => {
                args = messages::AskArgs { kind: CHOOSE_FRAGMENT, column: art, node: fragment, ..args };
            }
            Ask::FinishPrologue => args = messages::AskArgs { kind: FINISH_PROLOGUE, ..args },
            Ask::TakeLetter { letter } => args = messages::AskArgs { kind: TAKE_LETTER, item: letter, ..args },
            Ask::TakeAllLetters => args = messages::AskArgs { kind: TAKE_ALL_LETTERS, ..args },
            Ask::TakeBounty { place, day } => {
                let item = u32::try_from(day).unwrap_or(u32::MAX);
                args = messages::AskArgs { kind: TAKE_BOUNTY, item, node: place, ..args };
            }
            Ask::TurnInBounty { place, day } => {
                let item = u32::try_from(day).unwrap_or(u32::MAX);
                args = messages::AskArgs { kind: TURN_IN_BOUNTY, item, node: place, ..args };
            }
        },
        Asked::Gather { node } => args = messages::AskArgs { kind: GATHER, node: *node, ..args },
        Asked::OpenChest { chest } => args = messages::AskArgs { kind: OPEN_CHEST, item: *chest, ..args },
        Asked::Scavenge { wreck } => args = messages::AskArgs { kind: SCAVENGE, node: *wreck, ..args },
        Asked::StopGather => args = messages::AskArgs { kind: STOP_GATHER, ..args },
        Asked::UsePoint { point } => args = messages::AskArgs { kind: USE_POINT, column: *point, ..args },
        Asked::ToShip => args = messages::AskArgs { kind: TO_SHIP, ..args },
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
        Asked::Grant(Grant::Worn(kind)) => {
            args = messages::AskArgs { kind: GRANT_WORN, item_kind: *kind as u8, ..args };
        }
        Asked::Grant(Grant::Materials(count)) => {
            args = messages::AskArgs { kind: GRANT_MATERIALS, count: u32::from(*count), ..args };
        }
        Asked::Grant(Grant::Xp(count)) => args = messages::AskArgs { kind: GRANT_XP, count: *count, ..args },
        Asked::Grant(Grant::Status { status, on_foes, ticks }) => {
            let (slot, node, count) = (*status as u8, u8::from(*on_foes), ticks.unwrap_or(0));
            args = messages::AskArgs { kind: GRANT_STATUS, slot, node, count, ..args };
        }
        Asked::Grant(Grant::ArtsReady) => args = messages::AskArgs { kind: GRANT_ARTS, ..args },
        Asked::Art(ArtAsk::Wear { art }) => args = messages::AskArgs { kind: WEAR_ART, column: *art, ..args },
        Asked::Art(ArtAsk::SetCore { art, slot, fragment }) => {
            let (column, slot, node) = (*art, *slot, *fragment);
            args = messages::AskArgs { kind: SET_CORE, column, slot, node, ..args };
        }
        Asked::Grant(Grant::Ammo(count)) => {
            args = messages::AskArgs { kind: GRANT_AMMO, count: u32::from(*count), ..args }
        }
        Asked::Grant(Grant::Crates(count)) => {
            args = messages::AskArgs { kind: GRANT_CRATES, count: u32::from(*count), ..args };
        }
        Asked::Grant(Grant::Officers(level)) => {
            args = messages::AskArgs { kind: GRANT_OFFICERS, level: *level, ..args };
        }
        Asked::Grant(Grant::ArtLevel { art, level }) => {
            args = messages::AskArgs { kind: GRANT_ART_LEVEL, column: *art, level: *level, ..args };
        }
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
pub(crate) fn column_number(column: gear::grid::Column) -> u8 {
    match column {
        gear::grid::Column::Upgrade => 0,
        gear::grid::Column::Handling(_) => 1,
        gear::grid::Column::Finish(_) => 2,
        gear::grid::Column::Perk(_) => 3,
        gear::grid::Column::Signature => 4,
    }
}

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
    let scavenged = builder.create_vector(&room.scavenged(player));
    let items: Vec<_> = character.items.values().map(|(item, at)| item_offset(&mut builder, item, *at, 0)).collect();
    let emblems: Vec<u16> = character.emblems.iter().filter_map(|id| gear::emblems::number_of(id)).collect();
    // In a social space, the emblems the Tailor sells that day.
    let emblems_sold = if room.in_social_space(player) { gear::emblems::sold_on(room.day()) } else { Vec::new() };
    // In a social space, the day's wares, each numbered by its place among its vendor's.
    let wares: Vec<_> = if room.in_social_space(player) {
        gear::vendor::Vendor::ALL
            .into_iter()
            .flat_map(|vendor| {
                let level = if vendor.for_ship() { character.ship_level() } else { character.level() };
                gear::vendor::wares(vendor, room.day(), level)
            })
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
    let drops: Vec<Drop> = room.drops_for(player).cloned().collect();
    let drops: Vec<_> = drops
        .iter()
        .map(|drop| {
            let (at, from) = (Some(builder.create_vector(&drop.at)), Some(builder.create_vector(&drop.from)));
            let (kind, rarity, slot, tier) = match &drop.what {
                Dropped::Vestige(vestige) => (0, vestige.rarity as u8, vestige.slot as u8, 0),
                Dropped::AmmoBox => (1, 0, 0, 0),
                Dropped::Crate => (2, 0, 0, 0),
                Dropped::Chest { tier, .. } => (3, 0, 0, *tier),
            };
            let flying = u8::try_from(drop.rests.saturating_sub(room.clock())).unwrap_or(u8::MAX);
            let args = messages::GearDropArgs { id: drop.id, rarity, slot, at, kind, from, flying, tier };
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
    let arts = gear::arts::arts().arts.iter();
    let cores: Vec<u8> = arts.flat_map(|art| character.core_of(art.id)).map(|set| set.unwrap_or(NO_FRAGMENT)).collect();
    let casting = found.casting;
    let ship = Some(crate::ship_wire::ship_offset(&mut builder, character, room.recruiting_at(player)));
    let more = crate::standing_wire::standing_of(&mut builder, room, player, character);
    // In a patrol, its entrances: x, y, the ground's height, the yaw and the model, each.
    let dungeons: Vec<f64> = room
        .entrances()
        .iter()
        .flat_map(|entrance| [entrance.at[0], entrance.at[1], entrance.at[2], entrance.yaw, entrance.model as f64])
        .collect();
    let dungeons = (!dungeons.is_empty()).then(|| builder.create_vector(&dungeons));
    let quests = crate::quest_wire::quests_of(&mut builder, room, player, character);
    let (today, this_week) = (&character.activity.today, &character.activity.this_week);
    let cleared: Vec<u8> = gear::Difficulty::ALL
        .into_iter()
        .enumerate()
        .filter(|(_, tier)| today.cleared.contains(tier))
        .filter_map(|(number, _)| u8::try_from(number).ok())
        .collect();
    let cleared = Some(builder.create_vector(&cleared));
    let bounties = crate::bounty_wire::bounties_of(&mut builder, character, room.day());
    let (bounty_xp, bounty_aurem) = gear::bounties::bounty_pay(character.level());
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
        at_mage: room.at_mage(player),
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
        // A room without Arts, or a player with none worn, says none is worn (0 is no Art's number).
        art: if room.arts_on() { character.worn_art().map_or(0, |art| art.id) } else { 0 },
        cores: Some(builder.create_vector(&cores)),
        anima: if room.arts_on() { casting.anima } else { 0.0 },
        tenets: Some(builder.create_vector(&if room.arts_on() { casting.tenets } else { [0.0; 2] })),
        ammo: character.shots(),
        ammo_most: character.ammo_most().unwrap_or(0),
        ammo_share: f64::from(character.ammo) / f64::from(gear::ammo::AMMO_FULL),
        crates: u8::try_from(held.crates).unwrap_or(u8::MAX),
        crate_price: if room.in_social_space(player) { gear::ammo::CRATE_PRICE } else { 0 },
        ship,
        pledge: character.allegiance.pledge,
        reputation: Some(more.reputation),
        packages: Some(more.packages),
        art_levels: Some(more.art_levels),
        art_xp: Some(more.art_xp),
        art_owned: Some(more.art_owned),
        cosmetics: Some(more.cosmetics),
        dye: crate::standing_wire::number_of_worn(&character.cosmetics.dye),
        coat: crate::standing_wire::number_of_worn(&character.cosmetics.coat),
        barding: crate::standing_wire::number_of_worn(&character.cosmetics.barding),
        cosmetics_sold: Some(more.cosmetics_sold),
        shapes: held.shapes,
        shape_place: more.shape_place,
        shape_wares: Some(more.shape_wares),
        faction_wares: Some(more.faction_wares),
        day: u32::try_from(room.day()).unwrap_or(u32::MAX),
        quest: quests.quest,
        quest_task: quests.task,
        quest_counts: Some(quests.counts),
        quests_done: Some(quests.done),
        arts_earned: Some(quests.earned),
        fragment_choices: Some(quests.choices),
        quest_at: Some(quests.at),
        quest_clock: quests.clock,
        quest_fails: Some(quests.fails),
        quest_points: Some(quests.points),
        quest_figures: Some(quests.figures),
        quest_ward: Some(quests.ward),
        claimed: found.claimed,
        scavenged: Some(scavenged),
        dungeons,
        prologue_done: character.story.prologue,
        activity_day: u32::try_from(today.day).unwrap_or(u32::MAX),
        cleared,
        activity_week: u32::try_from(this_week.week).unwrap_or(u32::MAX),
        week_elite: this_week.elite,
        week_abyss: this_week.abyss,
        boon: this_week.boon,
        bounties: Some(bounties),
        bounty_xp,
        bounty_aurem,
        mail: Some(crate::mail_wire::mail_offset(&mut builder, character)),
        recharge: room.recharge_times(),
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
