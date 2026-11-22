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
        Asked::StopGather,
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
        Asked::Gear(Ask::Pledge { faction: 2 }),
        Asked::Gear(Ask::BuyFactionWare { faction: 3, ware: 4 }),
        Asked::Gear(Ask::CollectPackage { faction: 1 }),
        Asked::Gear(Ask::RiseArt { art: 2, fragment: 4 }),
        Asked::Gear(Ask::BuyFragment { art: 3, fragment: 5 }),
        Asked::Gear(Ask::WearCosmetic { cosmetic: 17 }),
        Asked::Gear(Ask::BuyCosmetic { cosmetic: 26 }),
        Asked::Gear(Ask::BuyFromShape { ware: 5, shown: 61 }),
        Asked::Grant(Grant::ArtLevel { art: 3, level: 4 }),
        Asked::Grant(Grant::Worn(Kind::Thunderlock)),
        Asked::Gear(Ask::Speak { keeper: 12 }),
        Asked::Gear(Ask::ChooseFragment { art: 2, fragment: 4 }),
        Asked::UsePoint { point: 3 },
    ]
}

#[test]
fn asks_64_and_65_speak_with_a_keeper_by_column_and_choose_a_fragment_by_column_and_node() {
    let mut builder = FlatBufferBuilder::new();
    let speak = messages::Ask::create(&mut builder, &messages::AskArgs { kind: 64, column: 3, ..Default::default() });
    builder.finish(speak, None);
    let read = flatbuffers::root::<messages::Ask>(builder.finished_data()).expect("an ask");
    assert_eq!(asked_of(&read), Some(Asked::Gear(Ask::Speak { keeper: 3 })));
    let mut builder = FlatBufferBuilder::new();
    let choose = messages::AskArgs { kind: 65, column: 1, node: 5, ..Default::default() };
    let choose = messages::Ask::create(&mut builder, &choose);
    builder.finish(choose, None);
    let read = flatbuffers::root::<messages::Ask>(builder.finished_data()).expect("an ask");
    assert_eq!(asked_of(&read), Some(Asked::Gear(Ask::ChooseFragment { art: 1, fragment: 5 })));
}

/// The gear message a player of a node's room is sent, its character the one given.
fn quest_gear(character: &gear::Character) -> Vec<u8> {
    let ring = vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]];
    let section = room::Section { ring, spawns: vec![[0.0, 180.0]], falls_kill: false };
    let mut room =
        Room::garrisoned(room::Floor::Flat, Vec::new(), section, room::NodeKind::Social, ("saltgrass-downs", None));
    let beacon = gear::quests::Place { name: "The Old Beacon".to_owned(), at: [50.0, -20.0], radius: 30.0 };
    room.set_places(vec![beacon]);
    let player = room.join().expect("a room with space");
    assert!(room.restore_character(player, &character.to_json()));
    gear_bytes(&room, player).expect("a player of the room")
}

#[test]
fn the_gear_message_says_its_character_is_the_players_own_only_once_their_account_gave_it_back() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let claimed = |room: &Room| {
        let bytes = gear_bytes(room, player).expect("a player of the room");
        flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear").claimed()
    };
    assert!(!claimed(&room), "the character they joined with");
    assert!(!room.restore_character(player, "not a character"));
    assert!(!claimed(&room), "nothing given back");
    assert!(room.restore_character(player, &gear::Character::starting().to_json()));
    assert!(claimed(&room), "their own, as their account keeps it");
}

#[test]
fn a_player_with_no_character_kept_plays_the_rooms_as_their_own_and_their_page_shows_it() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let claimed = |room: &Room| {
        let bytes = gear_bytes(room, player).expect("a player of the room");
        flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear").claimed()
    };
    assert!(!claimed(&room), "a claim may still come");
    room.none_kept(player);
    assert!(claimed(&room), "none will: the room's is theirs");
}

#[test]
fn the_gear_message_carries_the_quest_walked_its_counts_what_is_earned_and_where_its_place_stands() {
    let bytes = quest_gear(&gear::Character::starting());
    let gear = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear");
    let list = |vector: Option<flatbuffers::Vector<'_, u8>>| vector.map(|found| found.iter().collect::<Vec<_>>());
    assert_eq!((gear.quest(), gear.quest_task(), gear.art()), (1, 0, 0), "the opening, no Art worn");
    assert_eq!(gear.quest_counts().map(|counts| counts.iter().collect::<Vec<_>>()), Some(vec![0, 0, 0]));
    assert_eq!((list(gear.quests_done()), list(gear.arts_earned())), (Some(vec![0; 4]), Some(vec![0; 3])));
    assert_eq!(gear.quest_at().map(|at| at.len()), Some(0), "no place of the opening's is here");
    let mut pledged = gear::Character::starting();
    pledged.allegiance.pledge = 1;
    pledged.quests.roads.get_mut("house").unwrap().done = true;
    pledged.quests.set_task(1, 3);
    pledged.quests.choices[0] = 2;
    pledged.arts.earned = Some(vec![gear::arts::EARNED_ART, 0, 0]);
    pledged.arts.worn = 1;
    let bytes = quest_gear(&pledged);
    let gear = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear");
    assert_eq!((gear.quest(), gear.quest_task(), gear.art()), (2, 3, 1), "the Stormcallers' fourth task, Storm worn");
    assert_eq!((list(gear.quests_done()), list(gear.arts_earned())), (Some(vec![1, 0, 0, 0]), Some(vec![1, 0, 0])));
    assert_eq!(list(gear.fragment_choices()), Some(vec![2, 0, 0]));
    pledged.quests.set_task(1, 0);
    let bytes = quest_gear(&pledged);
    let gear = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear");
    let at = gear.quest_at().map(|at| at.iter().collect::<Vec<_>>());
    assert_eq!(at, Some(vec![50.0, -20.0, 30.0]), "the Old Beacon, here");
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
    // A gather is held two seconds before it is done.
    for _ in 0..room::asks::GATHER_TICKS {
        room.tick();
    }
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
fn a_room_without_arts_says_no_art_is_worn() {
    let (mut room, player) = furnished();
    room.forbid_arts();
    room.tick();
    let bytes = gear_bytes(&room, player).expect("a player of the room");
    let gear = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear");
    assert_eq!((gear.art(), gear.anima()), (0, 0.0), "no Art, and no Anima charging");
    let tenets = gear.tenets().map(|tenets| tenets.iter().collect::<Vec<_>>());
    assert_eq!(tenets, Some(vec![0.0, 0.0]), "nor any Tenet");
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
    let section = room::Section { ring, spawns: vec![[0.0, 0.0]], falls_kill: false };
    let mut room = Room::node(room::Floor::Flat, Vec::new(), section);
    room.start_patrol("saltgrass-downs", 0, &[]);
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
    let port = vec![Counter { kind: CounterKind::Mage, at: [500.0, 500.0] }];
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

/// The file's first step of a kind: its quest, task and goal.
fn first_step(kind: gear::quests::GoalKind) -> (usize, usize, &'static gear::quests::GoalDef) {
    let defs = &gear::quests::quests().quests;
    let mut found = defs.iter().enumerate().flat_map(|(quest, def)| {
        def.tasks.iter().enumerate().flat_map(move |(task, at)| at.goals.iter().map(move |goal| (quest, task, goal)))
    });
    found.find(|(_, _, goal)| goal.kind() == kind).expect("a road takes one")
}

/// The gear message a player on a step is sent: their road at `task` of quest `quest`, in a room of `node` holding
/// `places`, a tick on.
fn step_gear(node: &str, places: &[(&str, [f64; 2], f64)], quest: usize, task: usize, at: [f64; 2]) -> Vec<u8> {
    let ring = vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]];
    let section = room::Section { ring, spawns: vec![[0.0, 180.0]], falls_kill: false };
    let mut room = Room::garrisoned(room::Floor::Flat, Vec::new(), section, room::NodeKind::Social, (node, None));
    let place = |&(name, at, radius): &(&str, [f64; 2], f64)| gear::quests::Place { name: name.to_owned(), at, radius };
    room.set_places(places.iter().map(place).collect());
    let mut character = gear::Character::starting();
    character.allegiance.pledge = gear::quests::quests().quests[quest].faction;
    character.quests.set_task(quest, task);
    let player = room.join().expect("a room with space");
    assert!(room.restore_character(player, &character.to_json()));
    assert!(room.put_player(player, at[0], at[1]));
    room.tick();
    gear_bytes(&room, player).expect("a player of the room")
}

#[test]
fn the_gear_message_carries_a_steps_figure_points_ward_clock_and_failures() {
    use gear::quests::{Goal, GoalKind};
    let (quest, task, goal) = first_step(GoalKind::Escort);
    let Goal::Escort(walk) = &goal.goal else { unreachable!("an escort") };
    let places = [(walk.from.as_str(), [0.0, 100.0], 65.0), (walk.to.as_str(), [0.0, -100.0], 70.0)];
    let escort = step_gear(&walk.node, &places, quest, task, [0.0, 160.0]);
    let gear = flatbuffers::root::<messages::FromRoom>(&escort).expect("a message").gear().expect("the gear");
    let look = gear::quests::speaker_place(&walk.who).expect("it speaks") as f64 + 1.0;
    let figures: Vec<f64> = gear.quest_figures().map(|it| it.iter().collect()).unwrap_or_default();
    assert_eq!(figures, [look, 0.0, 100.0, 0.0, figures.get(4).copied().unwrap_or(0.0), 0.0], "its figure waiting");
    let goals = gear::quests::quests().quests[quest].tasks[task].goals.len();
    assert_eq!((gear.quest_clock(), gear.quest_fails().map(|it| it.len())), (-1.0, Some(goals)));
    let (quest, task, goal) = first_step(GoalKind::Puzzle);
    let Goal::Puzzle(lit) = &goal.goal else { unreachable!("a puzzle") };
    let puzzle = step_gear(&lit.node, &[(lit.place.as_str(), [0.0, 0.0], 30.0)], quest, task, [0.0, 20.0]);
    let gear = flatbuffers::root::<messages::FromRoom>(&puzzle).expect("a message").gear().expect("the gear");
    assert_eq!(gear.quest_points().map(|it| it.len()), Some(lit.points.len() * 3), "its points, each x, y and lit");
    let (quest, task, goal) = first_step(GoalKind::Defend);
    let Goal::Defend(held) = &goal.goal else { unreachable!("a defence") };
    let defence = step_gear(&held.node, &[(held.place.as_str(), [0.0, 0.0], 60.0)], quest, task, [0.0, 10.0]);
    let gear = flatbuffers::root::<messages::FromRoom>(&defence).expect("a message").gear().expect("the gear");
    assert_eq!(gear.quest_ward().map(|it| it.iter().collect::<Vec<_>>()), Some(vec![0.0, 0.0, 1.0]), "its ward whole");
}
