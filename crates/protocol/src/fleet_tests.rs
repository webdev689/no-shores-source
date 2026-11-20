use super::*;
use naval::fight::{Aim, Fight, Orders, Refusal};
use naval::guns::SWIVEL;
use naval::ranks::{Commission, GREY_TITHE, Rank};
use room::fleet::{Call, Input, Levels, STANDING};
use sailing::ship::{Helm, Ship};
use sailing::waters::OpenSea;

fn looked() -> Input {
    let ray = Some([[200_001.5, 300_002.0, 6.5], [0.5, -0.25, -0.125]]);
    Input {
        sequence: 41,
        orders: Orders {
            helm: Helm { steer: -0.75, crab: true, climb: -1 },
            aim: Some(Aim { bearing_deg: -97.5, range_m: 64.25, ray }),
            fire: true,
            brace: false,
            load: Some(Shot::Chain),
        },
        put_to_sea: Some([200_000.0, 300_000.0, 1.25]),
        call: Call::Captain(Commission::default(), Levels::default()),
    }
}

#[test]
fn orders_read_back_as_their_number_helm_look_fire_load_putting_to_sea_and_call() {
    assert_eq!(read_orders(&orders_bytes(&looked())), Ok(looked()));
    let plain = Input { sequence: 2, orders: STANDING, put_to_sea: None, call: Call::SendOff };
    assert_eq!(read_orders(&orders_bytes(&plain)), Ok(plain));
    let ray_less = Input {
        orders: Orders { aim: Some(Aim { bearing_deg: 90.0, range_m: 10.0, ray: None }), ..STANDING },
        call: Call::None,
        ..plain
    };
    assert_eq!(read_orders(&orders_bytes(&ray_less)), Ok(ray_less));
}

#[test]
fn orders_whose_parts_are_not_of_their_shape_are_refused() {
    assert!(read_orders(b"not orders").is_err());
    let write = |aim: &[f64], put: &[f64], load: u8, call: u8| {
        let mut builder = flatbuffers::FlatBufferBuilder::new();
        let aim = Some(builder.create_vector(aim));
        let put_to_sea = Some(builder.create_vector(put));
        let args = messages::OrdersArgs { sequence: 1, aim, put_to_sea, load, call, ..messages::OrdersArgs::default() };
        let orders = messages::Orders::create(&mut builder, &args);
        builder.finish(orders, None);
        builder.finished_data().to_vec()
    };
    assert!(read_orders(&write(&[], &[], 0, 0)).is_ok());
    assert!(read_orders(&write(&[90.0], &[], 0, 0)).is_err(), "a look of one number");
    assert!(read_orders(&write(&[90.0, 1.0, 2.0], &[], 0, 0)).is_err(), "a look of three");
    assert!(read_orders(&write(&[], &[1.0, 2.0], 0, 0)).is_err(), "putting to sea in two numbers");
    assert!(read_orders(&write(&[], &[], 5, 0)).is_err(), "no fifth load");
    assert!(read_orders(&write(&[], &[], 0, 2)).is_err(), "no second call");
}

#[test]
fn a_call_names_the_faction_and_rank_of_the_captain_it_calls() {
    let boss = Input {
        call: Call::Captain(Commission { faction: GREY_TITHE, rank: Rank::Boss }, Levels::default()),
        ..looked()
    };
    assert_eq!(read_orders(&orders_bytes(&boss)), Ok(boss));
    let write = |call_faction: u8, call_rank: u8| {
        let mut builder = flatbuffers::FlatBufferBuilder::new();
        let args = messages::OrdersArgs { sequence: 1, call: 1, call_faction, call_rank, ..Default::default() };
        let orders = messages::Orders::create(&mut builder, &args);
        builder.finish(orders, None);
        read_orders(builder.finished_data()).map(|input| input.call)
    };
    assert_eq!(
        write(0, 0),
        Ok(Call::Captain(Commission::default(), Levels::default())),
        "a call that names none: a Major pirate"
    );
    assert_eq!(
        write(GREY_TITHE, 0),
        Ok(Call::Captain(Commission { faction: GREY_TITHE, rank: Rank::Major }, Levels::default()))
    );
    assert!(write(3, 2).is_err(), "no captain sails for a third faction");
    assert!(write(1, 6).is_err(), "no sixth rank");
}

#[test]
fn a_call_carries_its_captains_level_and_the_callers_ship_level_to_thirty() {
    let levels = Levels { captain: 30, ship: 7 };
    let called = Input { call: Call::Captain(Commission::default(), levels), ..looked() };
    assert_eq!(read_orders(&orders_bytes(&called)), Ok(called));
    let write = |call_level: u8, ship_level: u8| {
        let mut builder = flatbuffers::FlatBufferBuilder::new();
        let args = messages::OrdersArgs { sequence: 1, call: 1, call_level, ship_level, ..Default::default() };
        let orders = messages::Orders::create(&mut builder, &args);
        builder.finish(orders, None);
        read_orders(builder.finished_data()).map(|input| input.call)
    };
    assert!(write(31, 1).is_err(), "no captain past level 30");
    assert!(write(1, 31).is_err(), "no ship past level 30");
}

/// The fleet the client's test reads (messages.test.ts): two players' ships at known places and one captain's, and
/// events of every kind.
pub fn fleet() -> (Fight, Vec<(u64, Event)>) {
    let swell = land::sea::Swell::default();
    let waters = OpenSea { swell: &swell };
    let mut fight = Fight::new(5);
    let at = |x: f64, y: f64, heading: f64| Ship {
        x,
        y,
        heading,
        ahead: 1.5,
        abeam: -0.25,
        turn: 3.0,
        sail_way: 1.0,
        rung: 2,
    };
    fight.put_to_sea(3, at(200_000.0, 300_000.0, 0.5), &waters, 10.0);
    fight.put_to_sea(4, at(200_060.0, 300_010.0, 2.0), &waters, 10.0);
    fight
        .call_captain(
            9,
            &at(200_000.0, 300_000.0, 0.5),
            Commission { faction: GREY_TITHE, rank: Rank::Elite },
            &waters,
            10.0,
        )
        .unwrap_or_else(|error| panic!("{error}"));
    let hit = ShotEvent::Hit {
        shooter: 3,
        target: 9,
        zone: naval::damage::Zone::Holed,
        point: [1.0, 2.0, 0.5],
        flight: 1.0,
        gun: SWIVEL,
        shot: Shot::Round,
        sail: None,
    };
    let events = vec![
        (7, Event::Shot(ShotEvent::Muzzle { shooter: 3, point: [1.0, 2.0, 3.0], launch: [50.0, 2.0, 4.0] })),
        (8, Event::Shot(hit)),
        (8, Event::Shot(ShotEvent::Splash { shooter: 9, point: [4.0, 5.0, -0.25] })),
        (8, Event::Shot(ShotEvent::Gone { shooter: 9 })),
        (9, Event::RunOut { ship: 9, side: naval::arms::Side::Starboard }),
        (9, Event::State { ship: 9, state: naval::damage::State::Struck }),
        (10, Event::Refused { ship: 4, refusal: Refusal::Reloading { side: naval::arms::Side::Port, left: 2.5 } }),
        (10, Event::NoSail { ship: 4, wrecked: true }),
        (10, Event::Load { ship: 3, shot: Shot::Grape }),
        (11, Event::Gone { ship: 9, end: naval::fight::End::Sunk }),
        (12, Event::Ram { ship: 9, by: 4, point: [7.0, 8.0, 1.0], dealt: 27.0 }),
        (13, Event::Hit { ship: 9, at: [2.0, -3.0, 1.5], part: naval::fight::Part::Sail }),
        (13, Event::SailLost { ship: 9, sail: 2 }),
        (13, Event::MastFell { ship: 9, mast: 1 }),
        (13, Event::Struck { ship: 9 }),
        (14, Event::Sinking { ship: 9 }),
        (14, Event::Splash { at: [4.0, 5.0] }),
        (15, Event::Flotsam { id: 21, at: [6.0, 7.0], kind: naval::fight::Piece::Chest }),
        (16, Event::Gathered { id: 21, by: 3 }),
        (16, Event::Boarding { ship: 9 }),
    ];
    (fight, events)
}

#[test]
fn a_fleet_snapshot_reads_back_as_every_ship_and_what_happened() {
    let (fight, events) = fleet();
    let bytes = fleet_snapshot_bytes((77, 1_790_000_000.0), &fight, &|ship| (ship == 3).then_some(12), &events);
    let read = flatbuffers::root::<messages::FromRoom>(&bytes).unwrap().snapshot().unwrap();
    assert_eq!((read.tick(), read.fight_clock(), read.world_start()), (77, 0.0, 1_790_000_000.0));
    let vessels: Vec<_> = read.vessels().unwrap().iter().collect();
    assert_eq!(
        vessels.iter().map(|vessel| (vessel.id(), vessel.captain())).collect::<Vec<_>>(),
        [(3, false), (4, false), (9, true)]
    );
    let first = fight.vessel(3).unwrap();
    assert_eq!(vessels[0].ship().unwrap().iter().collect::<Vec<_>>(), first.ship.to_floats().to_vec());
    assert_eq!(vessels[0].pose().unwrap().iter().collect::<Vec<_>>(), first.pose.to_floats().to_vec());
    assert_eq!(
        vessels[0].hurts().unwrap().iter().collect::<Vec<_>>(),
        [240.0, 240.0, 96.0, 96.0, 10.0, 10.0],
        "its hull, canvas and ten hands"
    );
    assert_eq!((vessels[0].acknowledged(), vessels[1].acknowledged()), (12, 0));
    assert_eq!((vessels[0].load(), vessels[2].mode()), (1, 0), "round shot, cruising");
    let colours: Vec<_> = vessels.iter().map(|vessel| (vessel.faction(), vessel.rank())).collect();
    assert_eq!(colours, [(0, 0), (0, 0), (1, 3)], "players' ships, then a Grey Tithe Elite");
    let hulls: Vec<u8> = vessels.iter().map(messages::Vessel::hull).collect();
    assert_eq!(hulls, [0, 0, 1], "players' Sloops, then the Elite's Schooner");
    let kinds: Vec<_> =
        read.naval().unwrap().iter().map(|event| (event.tick(), event.kind(), event.ship(), event.detail())).collect();
    assert_eq!(
        kinds,
        [
            (7, MUZZLE, 3, 0),
            (8, HIT, 9, 1),
            (8, SPLASH, 9, 0),
            (9, RUN_OUT, 9, 1),
            (9, STATE, 9, 1),
            (10, REFUSED, 4, 3),
            (10, NO_SAIL, 4, 1),
            (10, LOAD, 3, 2),
            (11, GONE, 9, 0),
            (12, RAM, 9, 0),
            (13, STRUCK_AT, 9, 1),
            (13, SAIL_LOST, 9, 2),
            (13, MAST_FELL, 9, 1),
            (13, STRUCK, 9, 0),
            (14, SINKING, 9, 0),
            (15, FLOTSAM, 21, 2),
            (16, GATHERED, 21, 0),
            (16, BOARDING, 9, 0)
        ],
        "a ball flown out of reckoning is not told"
    );
    let refused = read.naval().unwrap().get(5);
    assert_eq!((refused.side(), refused.left()), (0, 2.5));
    assert!(read.players().is_none() && read.ships().is_none());
}

/// The client's test reads these bytes to check that what the server writes of a fleet, the browser reads.
#[test]
fn the_fleet_bytes_for_the_clients_test_are_written() {
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).unwrap();
    let (fight, events) = fleet();
    let bytes = fleet_snapshot_bytes((77, 1_790_000_000.0), &fight, &|ship| (ship == 3).then_some(12), &events);
    std::fs::write(format!("{folder}/fleet.bin"), bytes).unwrap();
}
