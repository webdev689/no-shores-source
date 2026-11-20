use super::*;
use crate::{input_bytes, read_input};
use gear::Vestige;
use room::{Input, ResourceNode};

fn asked_input(asked: Asked) -> Input {
    Input { sequence: 1, ask: Some(asked), spawn: room::SpawnAsk::by_role(2, 1), spawn_level: 14, ..Input::default() }
}

fn every_ask() -> Vec<Asked> {
    vec![
        Asked::Gear(Ask::Wear { item: 3, slot: Slot::Ranged }),
        Asked::Gear(Ask::TakeOff { slot: Slot::Legs }),
        Asked::Gear(Ask::Buy { item: 4, column: 6, node: 1 }),
        Asked::Gear(Ask::Choose { item: 4, column: 0, node: 2 }),
        Asked::Gear(Ask::Dismantle { item: 5 }),
        Asked::Gear(Ask::Identify { vestige: 6 }),
        Asked::Gear(Ask::Feed { item: 7 }),
        Asked::Gear(Ask::Store { item: 8 }),
        Asked::Gear(Ask::Withdraw { item: 9 }),
        Asked::Gear(Ask::StoreVestige { vestige: 10 }),
        Asked::Gear(Ask::WithdrawVestige { vestige: 11 }),
        Asked::Gear(Ask::Vend { vendor: gear::vendor::Vendor::Armsmith, ware: 3 }),
        Asked::Gear(Ask::WearEmblem { emblem: 12 }),
        Asked::Gear(Ask::BuyEmblem { emblem: 13 }),
        Asked::Gear(Ask::UseCrate),
        Asked::Gear(Ask::BuyCrate),
        Asked::Gather { node: 2 },
        Asked::Scavenge { wreck: 3 },
        Asked::Grant(Grant::Vestige { rarity: Rarity::Legendary, slot: Slot::Arms, level: 18 }),
        Asked::Grant(Grant::Named("gullwing".to_owned())),
        Asked::Grant(Grant::Item { kind: Kind::Crossbow, rarity: Rarity::Rare, level: 9 }),
        Asked::Grant(Grant::Materials(50)),
        Asked::Grant(Grant::Xp(12_345)),
        Asked::Grant(Grant::Status { status: combat::Status::Expose, on_foes: true, ticks: Some(150) }),
        Asked::Grant(Grant::Status { status: combat::Status::Veiled, on_foes: false, ticks: None }),
        Asked::Grant(Grant::ArtsReady),
        Asked::Art(gear::arts::ArtAsk::Wear { art: 3 }),
        Asked::Art(gear::arts::ArtAsk::SetCore { art: 2, slot: 1, fragment: 5 }),
        Asked::Grant(Grant::Ammo(360)),
        Asked::Grant(Grant::Crates(2)),
        Asked::Grant(Grant::Officers(7)),
        Asked::Grant(Grant::Worn(Kind::Thunderlock)),
    ]
}

#[test]
fn every_ask_crosses_the_wire_and_back() {
    for asked in every_ask() {
        let input = asked_input(asked.clone());
        assert_eq!(read_input(&input_bytes(&input)), Ok(input), "{asked:?}");
    }
}

#[test]
fn an_ask_the_room_does_not_know_reads_as_none() {
    let mut builder = FlatBufferBuilder::new();
    let ask = messages::Ask::create(&mut builder, &messages::AskArgs { kind: 99, ..Default::default() });
    let controls = Some(builder.create_vector(&[0.0; movement::floats::CONTROLS_FLOATS]));
    let input = messages::Input::create(
        &mut builder,
        &messages::InputArgs { sequence: 1, controls, ask: Some(ask), ..Default::default() },
    );
    builder.finish(input, None);
    assert_eq!(read_input(builder.finished_data()).map(|input| input.ask), Ok(None));
}

/// A room whose first player holds a granted Legendary sword worn, a Vestige carried, two Ammo crates and half their
/// ammunition, with a resource node spent and an Ammo box lying for them.
fn furnished() -> (Room, PlayerId) {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.furnish(Some([0.0, 0.0]), vec![ResourceNode { x: 0.0, y: 1.0, resource: 4 }]);
    let player = room.join().expect("a room with space");
    let ask = |room: &mut Room, sequence: u32, asked: Asked| {
        // As long after the last ask as the room takes them.
        for _ in 0..room::asks::ASK_EVERY_TICKS {
            room.tick();
        }
        room.input(player, Input { sequence, ask: Some(asked), ..Input::default() }).expect("taken");
        room.tick();
    };
    ask(&mut room, 1, Asked::Grant(Grant::Xp(190_000)));
    ask(&mut room, 2, Asked::Grant(Grant::Named("harbourwarden".to_owned())));
    let sword = room.player(player).and_then(|found| found.character.items.keys().max().copied()).expect("granted");
    ask(&mut room, 3, Asked::Gear(Ask::Wear { item: sword, slot: Slot::Melee }));
    ask(&mut room, 4, Asked::Gather { node: 0 });
    ask(&mut room, 5, Asked::Grant(Grant::Vestige { rarity: Rarity::Atheric, slot: Slot::Head, level: 20 }));
    // Each stock a count of its own, so a reader can tell them apart by their order.
    let mut kept = room.kept_character(player).expect("a player of the room");
    for (key, count) in STOCKS {
        kept = with_count(&kept, key, count);
    }
    assert!(room.restore_character(player, &kept), "the character kept again");
    ask(&mut room, 6, Asked::Grant(Grant::Crates(2)));
    ask(&mut room, 7, Asked::Grant(Grant::Ammo(gear::ammo::AMMO_FULL / 2)));
    room.lay_drop(player, Dropped::AmmoBox, [1.0, 2.0, 0.0]);
    (room, player)
}

/// The stocks as a character keeps them, each with the count `furnished` gives it, in the gear message's order.
const STOCKS: [(&str, u16); 5] =
    [("weapon_fragments", 11), ("armor_fragments", 12), ("weapon_essence", 13), ("armor_essence", 14), ("fruit", 2)];

/// A kept character's text with the count under `key` set to `count`.
fn with_count(text: &str, key: &str, count: u16) -> String {
    let field = format!("\"{key}\":");
    let start = text.find(&field).expect("the field") + field.len();
    let end = start + text[start..].find(|character: char| !character.is_ascii_digit()).expect("its end");
    format!("{}{count}{}", &text[..start], &text[end..])
}

#[test]
fn a_players_stocks_cross_in_the_order_the_browser_names_them() {
    let (room, player) = furnished();
    let bytes = gear_bytes(&room, player).expect("a player of the room");
    let gear = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear");
    let stocks: Vec<u16> = gear.stocks().expect("stocks").iter().collect();
    assert_eq!(stocks, STOCKS.map(|(_, count)| count));
}

#[test]
fn a_players_own_gear_crosses_whole_with_every_column_spelled_out() {
    let (room, player) = furnished();
    let bytes = gear_bytes(&room, player).expect("a player of the room");
    let message = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message");
    let gear = message.gear().expect("the gear");
    assert!(message.snapshot().is_none() && message.joined().is_none());
    assert_eq!((gear.level(), gear.answered(), gear.answer(), gear.at_reader()), (20, 7, 0, true));
    assert_eq!((gear.ammo(), gear.ammo_most(), gear.ammo_share()), (0, 0, 0.5), "no Ranged worn, half kept");
    assert_eq!((gear.crates(), gear.crate_price()), (2, gear::ammo::CRATE_PRICE), "sold at the stall");
    assert_eq!(gear.spent().map(|spent| spent.iter().collect::<Vec<_>>()), Some(vec![0]));
    assert_eq!(gear.resources().map(|resources| resources.get(4)), Some(3), "three gathered");
    let items: Vec<_> = gear.items().expect("items").iter().collect();
    assert_eq!(items.len(), 10, "the starting kit, its four modules and the sword");
    let sword = items.iter().find(|item| item.named() == Some("harbourwarden")).expect("the Legendary");
    assert_eq!((sword.at(), sword.attack(), sword.xp_most()), (2, 248, 90_000), "worn in the main hand");
    let columns: Vec<_> = sword.columns().expect("its columns").iter().collect();
    assert_eq!(columns.iter().map(|column| column.kind()).collect::<Vec<_>>(), [1, 0, 3, 0, 2, 3, 0, 0, 0]);
    let first: Vec<&str> = columns[0].traits().expect("traits").iter().collect();
    assert_eq!(first, ["light_grip", "weighted", "keen_edge"]);
    assert_eq!((columns[8].essence(), columns[8].aurem(), columns[8].xp()), (6, 1_500, 90_000));
    assert_eq!(columns[1].resource(), 10);
    let vestiges: Vec<_> = gear.vestiges().expect("Vestiges").iter().collect();
    assert_eq!((vestiges.len(), vestiges[0].rarity(), vestiges[0].slot()), (1, 4, Slot::Head as u8));
    let cores: Vec<u8> = gear.cores().expect("the Cores").iter().collect();
    assert_eq!((gear.art(), cores), (1, vec![NO_FRAGMENT; 9]), "Storm worn, every Core empty");
    assert!(gear.anima() > 0.0 && gear.anima() < 0.01, "a new room's Anima, charging");
    let tenets = gear.tenets().map(|tenets| tenets.iter().collect::<Vec<_>>());
    assert_eq!(tenets, Some(vec![1.0, 1.0]), "both Tenets ready");
    assert!(gear_bytes(&room, 99).is_none());
}

#[test]
fn a_drop_lying_for_a_player_crosses_with_what_it_is_and_where_it_lies() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let vestige = Vestige { id: 3, rarity: Rarity::Rare, slot: Slot::Torso, level: 7 };
    room.lay_drop(player, Dropped::Vestige(vestige), [4.0, -6.0, 0.5]);
    room.lay_drop(player, Dropped::Crate, [1.0, 1.0, 0.0]);
    room.tick();
    let bytes = gear_bytes(&room, player).expect("a player of the room");
    let gear = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear");
    let drops: Vec<_> = gear.drops().expect("drops").iter().collect();
    assert_eq!(drops.len(), 2);
    assert_eq!((drops[0].id(), drops[0].rarity(), drops[0].slot(), drops[0].kind()), (3, 2, Slot::Torso as u8, 0));
    assert_eq!(drops[0].at().map(|at| at.iter().collect::<Vec<_>>()), Some(vec![4.0, -6.0, 0.5]));
    assert_eq!(drops[0].from().map(|from| from.iter().collect::<Vec<_>>()), Some(vec![4.0, -6.0, 0.5]));
    let flying = u8::try_from(room::REST_TICKS - 1).expect("a tick");
    assert_eq!((drops[1].kind(), drops[1].flying()), (2, flying), "a crate, a tick into its flight");
}

/// The client's test reads these bytes, to check that the gear the server writes the browser reads to the bit.
#[test]
fn the_gear_for_the_clients_test_is_written() {
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).expect("the folder");
    let (room, player) = furnished();
    std::fs::write(format!("{folder}/gear.bin"), gear_bytes(&room, player).expect("written")).expect("written");
}

#[test]
fn a_ruins_plaza_sells_nothing_and_a_port_citys_its_wares() {
    use room::asks::{Counter, CounterKind};
    let sold = |counters: Vec<Counter>| {
        let mut room = Room::new(Vec::new(), (0.0, 0.0));
        room.counters = Some(counters);
        let player = room.join().expect("a room with space");
        room.tick();
        let bytes = gear_bytes(&room, player).expect("a player of the room");
        let gear = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear");
        (
            gear.wares().map_or(0, |wares| wares.len()),
            gear.emblems_sold().map_or(0, |sold| sold.len()),
            gear.crate_price(),
        )
    };
    let port = vec![Counter { kind: CounterKind::Reader, at: [500.0, 500.0] }];
    let (wares, emblems, price) = sold(port);
    assert!(wares > 0 && emblems > 0 && price > 0, "a port city's plaza shows the day's wares anywhere on it");
    assert_eq!(sold(Vec::new()), (0, 0, 0), "a ruin's plaza, with no counters, shows none");
}

#[test]
fn the_ships_part_carries_its_power_stores_hands_and_each_officer_in_their_grid() {
    let (mut room, player) = furnished();
    for _ in 0..room::asks::ASK_EVERY_TICKS {
        room.tick();
    }
    room.input(player, Input { sequence: 8, ask: Some(Asked::Grant(Grant::Officers(6))), ..Input::default() })
        .expect("taken");
    room.tick();
    let character = room.player(player).map(|found| found.character.clone()).expect("a player of the room");
    let bytes = gear_bytes(&room, player).expect("a player of the room");
    let gear = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear");
    let ship = gear.ship().expect("the ship's part");
    assert_eq!(
        (ship.level(), ship.attack(), ship.defense(), ship.prestige()),
        (character.ship_level(), character.ship_attack(), character.ship_defense(), character.ship_prestige()),
    );
    let held = character.materials.ship;
    let stocks: Vec<u16> = ship.stocks().expect("its stocks").iter().collect();
    assert_eq!(stocks, [held.timber, held.canvas, held.iron, held.heartwood], "Timber, Canvas, Iron, Heartwood");
    assert_eq!((ship.hands(), ship.hands_most()), (10, 10), "a whole crew of the Sloop's ten");
    let officers: Vec<_> = ship.officers().expect("its officers").iter().collect();
    assert_eq!(officers.len(), 2, "the First Mate and the Bosun granted");
    for (shown, kept) in officers.iter().zip(character.crew.officers.values()) {
        assert_eq!((shown.id(), shown.post(), shown.grade()), (kept.id, kept.post as u8, kept.grade as u8));
        assert_eq!((shown.given(), shown.family(), shown.level()), (kept.given, kept.family, kept.level()));
        assert_eq!(shown.duty(), 2, "both sent ashore");
        assert_eq!(shown.columns().map(|columns| columns.len()), Some(kept.columns().len()), "their grid whole");
        assert!((shown.to_next() - kept.to_next()).abs() < 1e-12);
    }
    assert_eq!(ship.offers().map(|offers| offers.len()), Some(0), "none offered away from a counter");
    assert_eq!(ship.trim().map(|trim| trim.len()), Some(character.ship_trim().to_floats().len()));
}
