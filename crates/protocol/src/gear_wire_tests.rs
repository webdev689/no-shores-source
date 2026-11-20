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
        Asked::Gear(Ask::Vend { vendor: gear::vendor::Vendor::Weaponsmith, ware: 3, day: 20_400 }),
        Asked::Gear(Ask::WearEmblem { emblem: 12 }),
        Asked::Gear(Ask::BuyEmblem { emblem: 13 }),
        Asked::Gear(Ask::UseCrate),
        Asked::Gear(Ask::BuyCrate),
        Asked::Gather { node: 2 },
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
        Asked::Gear(Ask::Pledge { faction: 2 }),
        Asked::Gear(Ask::BuyFactionWare { faction: 3, ware: 4 }),
        Asked::Gear(Ask::CollectPackage { faction: 1 }),
        Asked::Gear(Ask::RiseArt { art: 2, fragment: 4 }),
        Asked::Gear(Ask::BuyFragment { art: 3, fragment: 5 }),
        Asked::Gear(Ask::WearCosmetic { cosmetic: 17 }),
        Asked::Gear(Ask::BuyCosmetic { cosmetic: 26 }),
        Asked::Gear(Ask::BuyFromShape { ware: 5 }),
        Asked::Grant(Grant::ArtLevel { art: 3, level: 4 }),
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
    assert_eq!((gear.level(), gear.answered(), gear.answer(), gear.at_mage()), (20, 7, 0, true));
    assert_eq!((gear.ammo(), gear.ammo_most(), gear.ammo_share()), (0, 0, 0.5), "no Ranged worn, half kept");
    assert_eq!((gear.crates(), gear.crate_price()), (2, gear::ammo::CRATE_PRICE), "sold at the stall");
    assert_eq!(gear.spent().map(|spent| spent.iter().collect::<Vec<_>>()), Some(vec![0]));
    assert_eq!(gear.resources().map(|resources| resources.get(4)), Some(3), "three gathered");
    let items: Vec<_> = gear.items().expect("items").iter().collect();
    assert_eq!(items.len(), 6, "the starting kit and the sword");
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
    let vestige = Vestige::new(3, Rarity::Rare, Slot::Torso, 7);
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

#[test]
fn a_patrols_players_are_sent_its_entrances_and_no_one_else_is() {
    let ring = vec![[-800.0, -800.0], [800.0, -800.0], [800.0, 800.0], [-800.0, 800.0]];
    let section = room::Section { ring, spawns: vec![[0.0, 0.0]] };
    let mut room = Room::node(room::Floor::Flat, Vec::new(), section);
    room.start_patrol("saltgrass-downs", 0);
    let player = room.join().expect("a room with space");
    let read = |room: &Room| {
        let bytes = gear_bytes(room, player).expect("a player of the room");
        let gear = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear");
        gear.dungeons().map(|dungeons| dungeons.iter().collect::<Vec<f64>>())
    };
    let sent = read(&room).expect("the entrances");
    let entrances = room.entrances();
    assert_eq!(sent.len(), entrances.len() * 5);
    for (numbers, entrance) in sent.chunks_exact(5).zip(entrances) {
        let [x, y, z] = entrance.at;
        assert_eq!(numbers, [x, y, z, entrance.yaw, entrance.model as f64]);
    }
    let mut course = Room::new(Vec::new(), (0.0, 0.0));
    assert_eq!(course.join(), Some(player));
    assert_eq!(read(&course), None);
}

/// The client's test reads these bytes, to check that the gear the server writes the browser reads to the bit: the
/// furnished player's away from a social space, and `standing`'s at the stall while Shape is here.
#[test]
fn the_gear_for_the_clients_test_is_written() {
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).expect("the folder");
    let (room, player) = furnished();
    std::fs::write(format!("{folder}/gear.bin"), gear_bytes(&room, player).expect("written")).expect("written");
    let (room, player, _) = standing();
    std::fs::write(format!("{folder}/gear_shape.bin"), gear_bytes(&room, player).expect("written")).expect("written");
}

/// Each faction piece, as the page is sent it, and the layers the room lets its colour stand on in a dress others see,
/// for the page's test that every layer it dresses one in is among them (`client/src/player/dressLayers.test.ts`).
#[test]
fn the_layers_a_faction_piece_s_colour_may_stand_on_are_written() {
    let pieces: Vec<String> = gear::catalogue::catalogue()
        .items
        .iter()
        .filter(|named| named.faction.is_some())
        .map(|named| {
            let slot = named.kind.slot();
            let on: Vec<String> =
                gear::cosmetics::layers_of(slot, named.kind).iter().map(|on| format!("{on:?}")).collect();
            let (id, kind, at) = (&named.id, named.kind as u8, at_number(gear::At::Worn(slot)));
            let ranged = slot == gear::Slot::Ranged;
            let factions = &gear::factions::factions().factions;
            let faction =
                factions.iter().find(|faction| Some(&faction.key) == named.faction.as_ref()).expect("its own");
            // The colour the room lets it show: a cape's is its faction's dye, any other piece's its faction's own.
            let colour = if slot == gear::Slot::Cloak { &faction.dye } else { &faction.key };
            let on = on.join(",");
            format!(r#"{{"named":{id:?},"kind":{kind},"at":{at},"ranged":{ranged},"colour":{colour:?},"on":[{on}]}}"#)
        })
        .collect();
    assert_eq!(pieces.len(), 21, "seven pieces a faction");
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).expect("the folder");
    std::fs::write(format!("{folder}/dress_layers.json"), format!("[{}]", pieces.join(","))).expect("written");
}

/// The furnished player pledged to the Lamplighters at rank 3, with Arts at levels 3, 1 and 5, the Ember Plate
/// barding worn and 9 Shapes, at the stall on a Friday noon, UTC, while Shape is here; and that minute.
fn standing() -> (Room, PlayerId, u64) {
    let (mut room, player) = furnished();
    let kept = room.kept_character(player).expect("a player of the room");
    let mut character = gear::Character::from_json(&kept).expect("a character");
    character.allegiance.pledge = 2;
    character.allegiance.reputation = vec![5, 35_000, 0];
    character.arts.levels = vec![3, 1, 5];
    character.arts.xp = vec![700, 0, 0];
    character.arts.owned = Some(vec![0b101, 0, 0b11_1111]);
    character.keep_cosmetic("ember_plate");
    character.cosmetics.barding = "ember_plate".to_owned();
    character.add_shapes(9);
    assert!(room.restore_character(player, &character.to_json()), "kept again");
    room.counters = Some(Vec::new());
    room.shape_spots = vec![[0.0, 0.0]; gear::shape::PLACES];
    // Friday at noon, UTC, in the week of 1,793,491,200 s after 1970.
    let friday = 1_793_491_200 / 60 + 19 * 1_440 + 12 * 60;
    room.set_minute(friday);
    (room, player, friday)
}

#[test]
fn where_a_player_stands_with_factions_arts_cosmetics_and_shape_crosses_whole() {
    let (mut room, player, friday) = standing();
    let bytes = gear_bytes(&room, player).expect("a player of the room");
    let gear = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear");
    assert_eq!(gear.pledge(), 2);
    assert_eq!(gear.reputation().map(|each| each.iter().collect::<Vec<_>>()), Some(vec![5, 35_000, 0]));
    assert_eq!(gear.packages().map(|each| each.iter().collect::<Vec<_>>()), Some(vec![0, 1, 0]), "rank 3");
    assert_eq!(gear.art_levels().map(|each| each.iter().collect::<Vec<_>>()), Some(vec![3, 1, 5]));
    assert_eq!(gear.art_xp().map(|each| each.iter().collect::<Vec<_>>()), Some(vec![700, 0, 0]));
    assert_eq!(gear.art_owned().map(|each| each.iter().collect::<Vec<_>>()), Some(vec![0b101, 0, 0b11_1111]));
    let barding = gear::cosmetics::number_of("ember_plate").expect("a barding");
    assert_eq!((gear.dye(), gear.barding()), (gear::cosmetics::number_of("own_colours").expect("the start"), barding));
    assert!(gear.cosmetics().is_some_and(|kept| kept.iter().any(|number| number == barding)));
    assert_eq!(
        gear.cosmetics_sold().map(|sold| sold.len()),
        Some(2 * gear::cosmetics::SOLD_A_DAY),
        "the Tailor's, the Tack's"
    );
    assert_eq!(gear.shapes(), 9);
    let week = gear::shape::week_of(friday);
    assert_eq!(usize::from(gear.shape_place()), gear::shape::place(week));
    let wares: Vec<_> = gear.shape_wares().expect("his wares").iter().collect();
    assert_eq!(wares.len(), gear::shape::WARES);
    assert_eq!((wares[0].price(), wares[5].price()), (7, 15), "Legendary, then Atheric, in Shapes");
    let sold: Vec<_> = gear.faction_wares().expect("the factions' wares").iter().collect();
    let each: usize =
        gear::factions::factions().factions.iter().map(|faction| gear::factions::wares(faction.id).len()).sum();
    assert_eq!(sold.len(), each, "every faction's");
    let hood = sold.iter().find(|ware| ware.named() == Some("lamplighters_hood")).expect("the Lamplighters' hood");
    let numbers = gear::factions::factions();
    assert_eq!((hood.id(), hood.price(), hood.level(), hood.defense() > 0), (1, numbers.armour_aurem, 20, true));
    let bow = sold.iter().find(|ware| ware.named() == Some("nightpin")).expect("the Veiled's bow");
    assert_eq!((bow.id(), bow.price(), bow.attack() > 0), (6, numbers.weapon_aurem, true));
    room.set_minute(friday - 2 * 1_440);
    let bytes = gear_bytes(&room, player).expect("a player of the room");
    let gear = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear");
    assert_eq!((gear.shape_place(), gear.shape_wares().map(|wares| wares.len())), (SHAPE_AWAY, Some(0)), "away");
    room.counters = None;
    assert!(room.put_player(player, 500.0, 500.0), "far from the stall");
    let bytes = gear_bytes(&room, player).expect("a player of the room");
    let gear = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear");
    assert_eq!(gear.faction_wares().map(|wares| wares.len()), Some(0), "none away from a social space");
}
