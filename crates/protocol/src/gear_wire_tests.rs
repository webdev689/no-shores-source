use super::*;
use gear::Vestige;
use gear::mail::{Posted, Source};
use room::{Input, ResourceNode};

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
    assert_eq!(gear.quest_counts().map(|counts| counts.iter().collect::<Vec<_>>()), Some(vec![0]), "the stranger");
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

/// A room whose first player holds a granted Legendary sword worn, a Vestige carried, two Ammo crates and half their
/// ammunition, with a resource node spent, an Ammo box and a Magic Vestige lying for them, and two letters in their
/// mail: a Rare Vestige for the arms at level 9 left lying, and a Magic hull at level 6 salvaged.
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
    let mut kept = gear::Character::from_json(&room.kept_character(player).expect("in")).expect("a character");
    kept.post(Source::LeftLying, Posted::Vestige(Vestige::new(0, Rarity::Rare, Slot::Arms, 9).from(gear::Source::Sea)));
    kept.post(Source::Salvage, Posted::Item(gear::Item::new(0, Kind::Hull, Rarity::Magic, 6, Slot::Hull)));
    assert!(room.restore_character(player, &kept.to_json()), "the character kept again");
    room.lay_drop(player, Dropped::Vestige(Vestige::new(90, Rarity::Magic, Slot::Head, 20)), [3.0, 2.0, 0.0]);
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
    room.lay_drop(player, Dropped::Chest { tier: 4, level: 9 }, [2.0, 1.0, 0.0]);
    room.tick();
    let bytes = gear_bytes(&room, player).expect("a player of the room");
    let gear = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear");
    let drops: Vec<_> = gear.drops().expect("drops").iter().collect();
    assert_eq!(drops.len(), 3);
    assert_eq!((drops[2].kind(), drops[2].tier(), drops[0].tier()), (3, 4, 0), "a heroic chest with the bonus");
    assert_eq!((drops[0].id(), drops[0].rarity(), drops[0].slot(), drops[0].kind()), (3, 2, Slot::Torso as u8, 0));
    assert_eq!(drops[0].at().map(|at| at.iter().collect::<Vec<_>>()), Some(vec![4.0, -6.0, 0.5]));
    assert_eq!(drops[0].from().map(|from| from.iter().collect::<Vec<_>>()), Some(vec![4.0, -6.0, 0.5]));
    let crystal = u8::try_from(room::VESTIGE_REST_TICKS - 1).expect("a tick");
    assert_eq!(drops[0].flying(), crystal, "a Vestige, a tick into its longer flight");
    let flying = u8::try_from(room::AMMO_REST_TICKS - 1).expect("a tick");
    assert_eq!((drops[1].kind(), drops[1].flying()), (2, flying), "a crate, a tick into its flight");
}

#[test]
fn a_players_mail_crosses_with_where_each_letters_holding_came_from_and_what_it_holds() {
    let (room, player) = furnished();
    let bytes = gear_bytes(&room, player).expect("a player of the room");
    let gear = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear");
    let letters: Vec<_> = gear.mail().expect("the mail").iter().collect();
    let kept = &room.player(player).expect("in").character.mail;
    assert_eq!(
        letters.iter().map(|letter| letter.id()).collect::<Vec<_>>(),
        kept.iter().map(|letter| letter.id).collect::<Vec<_>>()
    );
    assert_eq!(
        letters.iter().map(|letter| (letter.from(), letter.crowded())).collect::<Vec<_>>(),
        [(Source::LeftLying as u8, false), (Source::Salvage as u8, false)]
    );
    let vestige = letters[0].vestige().expect("its Vestige");
    assert_eq!((vestige.rarity(), vestige.slot(), vestige.level(), vestige.vaulted()), (2, Slot::Arms as u8, 9, false));
    assert!(letters[0].item().is_none() && letters[1].vestige().is_none());
    let item = letters[1].item().expect("its item");
    assert_eq!((item.kind(), item.rarity(), item.level(), item.at()), (Kind::Hull as u8, 1, 6, 0));
    assert!(item.columns().is_some_and(|columns| !columns.is_empty()), "its nodes spelled out");
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

/// Each of the Armorsmith's and the Weaponsmith's wares, the day's then the starter stock, bought in turn at the stall
/// takes the number the gear message before it said the next item takes. The page's test
/// (`client/src/player/gearLooks.test.ts`) reads the messages, the first before any is bought and one after each, each
/// its length in four bytes (little-endian) and then itself, to check that each ware is drawn as the piece it becomes.
#[test]
fn each_smiths_ware_bought_takes_the_number_sent_and_the_gear_for_the_clients_test_is_written() {
    use gear::vendor::{Vendor, WARES};
    let (mut room, player, _) = standing();
    // `furnished` sent seven asks.
    let mut sequence = 7;
    let mut ask = |room: &mut Room, asked: Asked| {
        for _ in 0..room::asks::ASK_EVERY_TICKS {
            room.tick();
        }
        sequence += 1;
        room.input(player, Input { sequence, ask: Some(asked), ..Input::default() }).expect("taken");
        room.tick();
        room.player(player).expect("in").answer
    };
    ask(&mut room, Asked::Grant(Grant::Materials(200)));
    let day = u32::try_from(room.day()).expect("a day");
    let mut written = Vec::new();
    let mut sent = |room: &Room| {
        let bytes = gear_bytes(room, player).expect("a player of the room");
        written.extend(u32::try_from(bytes.len()).expect("a length").to_le_bytes());
        written.extend(&bytes);
        let gear = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear");
        let stocked: usize = Vendor::ALL.into_iter().map(|vendor| WARES + vendor.starter_kinds().len()).sum();
        assert_eq!(gear.wares().map(|wares| wares.len()), Some(stocked), "every smith's whole stock at the stall");
        gear.next_id()
    };
    let mut next = sent(&room);
    for vendor in [Vendor::Armorsmith, Vendor::Weaponsmith] {
        for ware in 0..WARES + vendor.starter_kinds().len() {
            let held: Vec<u32> = room.player(player).expect("in").character.items.keys().copied().collect();
            let ware = u8::try_from(ware).expect("a place");
            assert_eq!(ask(&mut room, Asked::Gear(Ask::Vend { vendor, ware, day })), 0, "{vendor:?}'s {ware} bought");
            let items = &room.player(player).expect("in").character.items;
            let bought: Vec<u32> = items.keys().copied().filter(|id| !held.contains(id)).collect();
            assert_eq!(bought, [next], "{vendor:?}'s {ware} takes the number sent");
            next = sent(&room);
        }
    }
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).expect("the folder");
    std::fs::write(format!("{folder}/gear_vended.bin"), written).expect("written");
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
    character.allegiance.reputation = vec![5, 350_000, 0];
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
    assert_eq!(gear.reputation().map(|each| each.iter().collect::<Vec<_>>()), Some(vec![5, 350_000, 0]));
    assert_eq!(gear.packages().map(|each| each.iter().collect::<Vec<_>>()), Some(vec![0, 1, 0]), "rank 3");
    assert_eq!(gear.art_levels().map(|each| each.iter().collect::<Vec<_>>()), Some(vec![3, 1, 5]));
    assert_eq!(gear.art_xp().map(|each| each.iter().collect::<Vec<_>>()), Some(vec![700, 0, 0]));
    assert_eq!(gear.art_owned().map(|each| each.iter().collect::<Vec<_>>()), Some(vec![0b101, 0, 0b11_1111]));
    let barding = gear::cosmetics::number_of("ember_plate").expect("a barding");
    assert_eq!((gear.dye(), gear.barding()), (gear::cosmetics::number_of("own_colours").expect("the start"), barding));
    assert!(gear.cosmetics().is_some_and(|kept| kept.iter().any(|number| number == barding)));
    assert_eq!(
        gear.cosmetics_sold().map(|sold| sold.len()),
        Some(2 * gear::cosmetics::SOLD_A_DAY + 1),
        "the Tailor's, the Tack's and its Bay Horse"
    );
    assert_eq!(gear.shapes(), 9);
    let week = gear::clock::week_of(friday);
    assert_eq!(usize::from(gear.shape_place()), gear::shape::place(week));
    let wares: Vec<_> = gear.shape_wares().expect("his wares").iter().collect();
    assert_eq!(wares.len(), gear::shape::WARES);
    let atheric = u32::from(gear::shape::price(&gear::shape::wares(week)[5]));
    assert!(atheric == 13 || atheric == 23, "an Atheric's armour or weapon: {atheric}");
    assert_eq!((wares[0].price(), wares[5].price()), (7, atheric), "Legendary, then Atheric, in Shapes");
    let numbers: Vec<u32> = wares.iter().map(|ware| ware.id()).collect();
    let asked: Vec<u32> = (0..6).map(|ware| gear::shape::shown(week, ware)).collect();
    assert_eq!(numbers, asked, "each numbered as a page asks for it");
    assert_eq!(wares[0].named(), None, "his Legendary rolled, not named");
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
fn a_players_gear_says_whether_they_finished_the_prologue() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let done = |room: &Room| {
        let bytes = gear_bytes(room, player).expect("written");
        messages::root_as_from_room(&bytes).expect("read").gear().expect("gear").prologue_done()
    };
    assert!(!done(&room), "a new character has not");
    room.input(player, Input { sequence: 1, ask: Some(Asked::Gear(Ask::FinishPrologue)), ..Input::default() })
        .expect("taken");
    room.tick();
    assert!(done(&room));
}

#[test]
fn a_players_gear_carries_their_days_and_weeks_record_as_kept() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let mut character = room.player(player).expect("in the room").character.clone();
    let cleared = [gear::Difficulty::Elite, gear::Difficulty::Abyss].into_iter().collect();
    character.activity.today = gear::activity::Today { day: 20_778, cleared, ..Default::default() };
    character.activity.this_week =
        gear::activity::ThisWeek { week: 2_968, elite: true, abyss: false, boon: true, ..Default::default() };
    assert!(room.restore_character(player, &character.to_json()));
    let bytes = gear_bytes(&room, player).expect("written");
    let gear = messages::root_as_from_room(&bytes).expect("read").gear().expect("gear");
    assert_eq!((gear.activity_day(), gear.activity_week()), (20_778, 2_968));
    assert_eq!(gear.cleared().map(|tiers| tiers.iter().collect::<Vec<u8>>()), Some(vec![1, 2]));
    assert_eq!((gear.week_elite(), gear.week_abyss(), gear.boon()), (true, false, true));
}

#[test]
fn a_players_gear_carries_each_playlists_daily_and_weekly_record_as_kept() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let mut character = room.player(player).expect("in the room").character.clone();
    character.activity.today = gear::activity::Today { day: 20_778, abyss_playlist: true, ..Default::default() };
    character.activity.this_week = gear::activity::ThisWeek { week: 2_968, elite_playlist: 2, ..Default::default() };
    assert!(room.restore_character(player, &character.to_json()));
    let bytes = gear_bytes(&room, player).expect("written");
    let gear = messages::root_as_from_room(&bytes).expect("read").gear().expect("gear");
    assert_eq!((gear.elite_playlist_taken(), gear.abyss_playlist_taken()), (false, true));
    assert_eq!((gear.elite_playlist_clears(), gear.abyss_playlist_clears()), (2, 0));
}

#[test]
fn a_players_gear_carries_its_day_and_board_and_no_bounty_held_from_another_day() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.furnish(Some([0.0, 0.0]), Vec::new());
    room.set_minute(29_919_420);
    let player = room.join().expect("a room with space");
    for (sequence, ask) in [(1, Ask::FinishPrologue), (2, Ask::TakeBounty { place: 2, day: 20_778 })] {
        room.input(player, Input { sequence, ask: Some(Asked::Gear(ask)), ..Input::default() }).expect("taken");
        for _ in 0..room::asks::ASK_EVERY_TICKS {
            room.tick();
        }
    }
    let read = |room: &Room| {
        let bytes = gear_bytes(room, player).expect("written");
        let gear = messages::root_as_from_room(&bytes).expect("read").gear().expect("gear");
        let rows: Vec<(String, u32, u32, bool, bool)> = gear
            .bounties()
            .expect("the board")
            .iter()
            .map(|bounty| {
                let words = bounty.words().unwrap_or_default().to_owned();
                (words, bounty.target(), bounty.count(), bounty.held(), bounty.paid())
            })
            .collect();
        (gear.day(), rows, gear.bounty_xp(), gear.bounty_aurem())
    };
    let bytes = gear_bytes(&room, player).expect("a player of the room");
    let tiers: Vec<u8> = messages::root_as_from_room(&bytes)
        .expect("read")
        .gear()
        .expect("gear")
        .bounties()
        .expect("the board")
        .iter()
        .map(|bounty| bounty.tier())
        .collect();
    assert_eq!(tiers, gear::bounties::board(20_778).map(|bounty| bounty.tier).to_vec(), "each bounty's tier crosses");
    let (day, rows, xp, aurem) = read(&room);
    assert_eq!((day, rows.len()), (20_778, 6));
    assert_eq!(rows[2], ("Sink or take 3 ships.".to_owned(), 3, 0, true, false));
    assert_eq!(rows.iter().filter(|row| row.3).count(), 1);
    assert_eq!((xp, aurem), (600, 36));
    room.set_minute(29_919_420 + 1_440);
    let (day, next, ..) = read(&room);
    assert_eq!(day, 20_779);
    assert!(next.iter().all(|row| !row.3 && row.2 == 0), "yesterday's bounty is held no more");
}

#[test]
fn every_daily_list_a_player_is_sent_turns_at_nine_utc_and_not_at_midnight() {
    use room::asks::{Counter, CounterKind};
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.counters = Some(vec![Counter { kind: CounterKind::Mage, at: [500.0, 500.0] }]);
    let player = room.join().expect("a room with space");
    let character = room.player(player).expect("in the room").character.clone();
    // What the player is sent at a minute, and what the rules sell on a day: the smiths' wares and the Shipwright's
    // modules, the Tailor's emblems, the Tailor's and the Tack's cosmetics, and the day they are of.
    let sent = |room: &mut Room, minute: u64| {
        room.set_minute(minute);
        let bytes = gear_bytes(room, player).expect("written");
        let gear = messages::root_as_from_room(&bytes).expect("read").gear().expect("gear");
        let wares: Vec<(u8, u8)> =
            gear.wares().expect("wares").iter().map(|ware| (ware.kind(), ware.rarity())).collect();
        let emblems: Vec<u16> = gear.emblems_sold().expect("emblems").iter().collect();
        let cosmetics: Vec<u16> = gear.cosmetics_sold().expect("cosmetics").iter().collect();
        (u64::from(gear.day()), wares, emblems, cosmetics)
    };
    let sold = |day: u64| {
        use gear::cosmetics::{Seller, sold_on};
        let wares = gear::vendor::Vendor::ALL
            .into_iter()
            .flat_map(|vendor| {
                let level = if vendor.for_ship() { character.ship_level() } else { character.level() };
                gear::vendor::stock(vendor, day, level)
            })
            .map(|ware| (ware.kind as u8, ware.rarity as u8))
            .collect();
        let cosmetics = [Seller::Tailor, Seller::Tack].into_iter().flat_map(|seller| sold_on(seller, day)).collect();
        (day, wares, gear::emblems::sold_on(day), cosmetics)
    };
    let friday_nine = 29_919_420;
    assert_eq!(sent(&mut room, friday_nine - 9 * 60), sold(20_777), "Friday midnight, UTC: Thursday's day still");
    assert_eq!(sent(&mut room, friday_nine - 1), sold(20_777), "08:59");
    assert_eq!(sent(&mut room, friday_nine), sold(20_778), "09:00, a new day");
    assert_ne!(sold(20_777).2, sold(20_778).2, "the Tailor's emblems turn");
    assert_ne!(sold(20_777).3, sold(20_778).3, "and the dyes, coats and bardings");
}

#[test]
fn a_players_gear_carries_each_bountys_pool_and_name() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.set_minute(29_919_420);
    let player = room.join().expect("a room with space");
    let bytes = gear_bytes(&room, player).expect("written");
    let gear = messages::root_as_from_room(&bytes).expect("read").gear().expect("gear");
    let bounties = gear.bounties().expect("the board");
    let pools: Vec<u8> = bounties.iter().map(|bounty| bounty.pool()).collect();
    assert_eq!(pools, [0, 0, 1, 1, 2, 2], "two on land, two at sea, two in dungeons");
    let names: Vec<&str> = gear::bounties::board(20_778).iter().map(|bounty| bounty.name).collect();
    assert_eq!(bounties.iter().map(|bounty| bounty.name().unwrap_or_default()).collect::<Vec<_>>(), names);
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

#[test]
fn the_gear_message_carries_how_much_longer_an_art_recharges_in_the_room() {
    let recharge = |room: &Room, player: PlayerId| {
        let bytes = gear_bytes(room, player).expect("a player of the room");
        flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear").recharge()
    };
    let mut plain = Room::new(Vec::new(), (0.0, 0.0));
    let player = plain.join().expect("a room with space");
    assert!((recharge(&plain, player) - 1.0).abs() < 1e-9, "no run: as tuned");
    // A day whose modifier is Trickle, its dungeon of the day run at Elite.
    let day = (0..400).find(|&day| gear::activities::modifier_of_the_day(day) == gear::activities::Modifier::Trickle);
    let day = day.expect("a Trickle day");
    let (patrol, number) = gear::activities::dungeon_of_the_day(day, "continent-1").expect("its dungeon");
    let minute = day * 24 * 60;
    assert_eq!(gear::clock::day_of(minute), day);
    let of = room::RunOf::Patrol { patrol: patrol.to_owned(), number };
    let mut run = Room::dungeon_run(&of, gear::Difficulty::Elite, minute).expect("its run");
    let player = run.join().expect("a room with space");
    assert!((recharge(&run, player) - 1.5).abs() < 1e-9, "Trickle: half as long again");
}
