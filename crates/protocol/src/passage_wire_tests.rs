use crate::messages;
use crate::passage_wire::{NOT_HOLDING, ask_args, asked_of, passages_of, seen_offset};
use flatbuffers::FlatBufferBuilder;
use gear::dive::{Route, Start};
use room::{Asked, PassageAsk, PassageSeen};

#[test]
fn every_ask_of_the_passages_crosses_as_it_was_asked() {
    let asks = [
        PassageAsk::GoOn { mouth: 2 },
        PassageAsk::Kindle { lamp: 1 },
        PassageAsk::LightLamp,
        PassageAsk::GoHome,
        PassageAsk::Begin { mouth: 1, route: Route::Company, lamp: Some(3) },
        PassageAsk::Begin { mouth: 0, route: Route::Public, lamp: None },
    ];
    for ask in asks {
        let mut builder = FlatBufferBuilder::new();
        let args = ask_args(ask, messages::AskArgs::default());
        let written = messages::Ask::create(&mut builder, &args);
        builder.finish_minimal(written);
        let read = flatbuffers::root::<messages::Ask>(builder.finished_data()).expect("an ask");
        assert_eq!(asked_of(&read), Some(Asked::Passage(ask)));
    }
}

#[test]
fn a_dive_its_haul_and_the_lamps_cross_in_the_gear_and_a_zones_deal_in_the_snapshot() {
    let mut character = gear::Character::starting();
    let start =
        Start { island: "continent-1", week: 2_900, route: Route::Company, mouth: 2, zone: 14, depth: 4, lamp: None };
    character.begin_dive(&start).expect("begun");
    character.passage.as_mut().expect("diving").here = true;
    character.gather(3);
    character.activity.this_week(2_900).passage_lamps.entry("continent-1".to_owned()).or_default().insert(2);
    let mut builder = FlatBufferBuilder::new();
    let (dive, lamps, _) = passages_of(&mut builder, &character, 0);
    let args = messages::GearArgs { dive, island_lamps: lamps, ..messages::GearArgs::default() };
    let written = messages::Gear::create(&mut builder, &args);
    builder.finish_minimal(written);
    let gear = flatbuffers::root::<messages::Gear>(builder.finished_data()).expect("gear");
    let dive = gear.dive().expect("a dive");
    assert_eq!(
        (dive.island(), dive.zone(), dive.depth(), dive.route(), dive.mouth()),
        (Some("continent-1"), 14, 4, 1, 2)
    );
    assert_eq!(dive.haul().and_then(|haul| haul.resources()).map(|resources| resources.get(3)), Some(3));
    let lamps = gear.island_lamps().expect("lamps");
    assert_eq!(lamps.get(0).lamps().map(|lit| lit.iter().collect::<Vec<u8>>()), Some(vec![2]));

    let seen = PassageSeen {
        deal: "kindle",
        done: false,
        lit: 0b101,
        broken: 0,
        held: 0.0,
        left: 0.0,
        wave: 2,
        open: false,
        lamp_lit: false,
        holding: None,
    };
    let mut builder = FlatBufferBuilder::new();
    let written = seen_offset(&mut builder, &seen);
    builder.finish_minimal(written);
    let read = flatbuffers::root::<messages::PassageSeen>(builder.finished_data()).expect("a deal");
    assert_eq!((read.deal(), read.lit(), read.wave(), read.holding()), (Some("kindle"), 0b101, 2, NOT_HOLDING));
}
