//! The asks across the wire: every ask the page sends, there and back, the keepers' two by their places, and an ask
//! no room knows.

use super::*;
use crate::{input_bytes, read_input};
use room::Input;

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
        Asked::Gear(Ask::FinishPrologue),
        Asked::Gear(Ask::TakeBounty { place: 3, day: 20_778 }),
        Asked::Gear(Ask::TurnInBounty { place: 5, day: 20_778 }),
        Asked::Gear(Ask::Infuse { item: 4, fed: 9 }),
        Asked::Gear(Ask::Recruit { faction: 2, offer: 1 }),
        Asked::Gear(Ask::Station { officer: 3, duty: gear::crew::Duty::Posted }),
        Asked::Gear(Ask::Dismiss { officer: 3 }),
        Asked::Gear(Ask::Train { officer: 3, column: 1, node: 2 }),
        Asked::Gear(Ask::ChooseOfficer { officer: 3, column: 1, node: 2 }),
        Asked::Gather { node: 2 },
        Asked::OpenChest { chest: 41 },
        Asked::StopGather,
        Asked::Scavenge { wreck: 3 },
        Asked::FindLore { chapter: 300 },
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
        Asked::ToShip,
        Asked::Gear(Ask::TakeLetter { letter: 41 }),
        Asked::Gear(Ask::TakeAllLetters),
        Asked::Gear(Ask::Ship(ShipAsk::Buy { hull: 2 })),
        Asked::Gear(Ask::Ship(ShipAsk::Sail { hull: 1 })),
        Asked::Gear(Ask::Ship(ShipAsk::BuyDress { dress: 37 })),
        Asked::Gear(Ask::Ship(ShipAsk::Dress { hull: 3, dress: 25 })),
        Asked::Gear(Ask::Ship(ShipAsk::Name { hull: 0, first: 4, second: 9, renaming: false })),
        Asked::Gear(Ask::Ship(ShipAsk::Name {
            hull: 2,
            first: gear::ship::fleet::NO_WORD,
            second: 31,
            renaming: true,
        })),
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
