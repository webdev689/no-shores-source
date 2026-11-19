use super::fleet_door::{lay, predict};
use super::*;
use naval::fight::{Aim, Orders};
use naval::ranks::Commission;
use protocol::fleet::orders_bytes;
use protocol::wire::overlook::wire as messages;
use room::fleet::{Call, Input, STANDING};
use sailing::ship::Helm;

const AT: [f64; 3] = [200_000.0, 300_000.0, 0.5];

fn send(player: PlayerId, input: Input) -> i32 {
    input_of(player, &orders_bytes(&input))
}

fn input_of(player: PlayerId, bytes: &[u8]) -> i32 {
    super::input(player, bytes)
}

fn helm_at(sequence: u32) -> Helm {
    match sequence {
        2 => Helm { steer: 0.0, crab: false, climb: 1 },
        3 => Helm { steer: 0.0, crab: false, climb: 1 },
        sequence if sequence % 50 < 20 => Helm { steer: 0.6, crab: false, climb: 0 },
        _ => Helm { steer: -0.2, crab: false, climb: 0 },
    }
}

fn orders(sequence: u32) -> Input {
    Input { sequence, orders: Orders { helm: helm_at(sequence), ..STANDING }, put_to_sea: None, call: Call::None }
}

/// A vessel as a snapshot shows her: her number, her ship's numbers, her pose's, her hurts, and her last orders taken.
#[derive(Clone, Debug)]
struct Shown {
    id: u32,
    ship: Vec<f64>,
    pose: Vec<f64>,
    hurts: Vec<f64>,
    acknowledged: u32,
}

/// The vessels in a snapshot.
fn vessels_in(bytes: &[u8]) -> Vec<Shown> {
    let message = messages::root_as_from_room(bytes).unwrap();
    let vessels = message.snapshot().unwrap().vessels().unwrap();
    vessels
        .iter()
        .map(|vessel| {
            let ship = vessel.ship().unwrap().iter().collect();
            let pose = vessel.pose().unwrap().iter().collect();
            let hurts = vessel.hurts().unwrap().iter().collect();
            Shown { id: vessel.id(), ship, pose, hurts, acknowledged: vessel.acknowledged() }
        })
        .collect()
}

#[test]
fn a_fleet_room_puts_ships_to_sea_by_their_orders_and_shows_them() {
    open_fleet();
    let (first, second) = (room_join(), room_join());
    assert_eq!(send(first, Input { put_to_sea: Some(AT), ..orders(1) }), TAKEN);
    let elsewhere = Input { put_to_sea: Some([AT[0] + 80.0, AT[1], 2.0]), ..orders(1) };
    assert_eq!(send(second, elsewhere), TAKEN);
    assert_eq!(send(second, orders(5)), OUT_OF_ORDER);
    assert_eq!(input_of(second, b"not orders"), NOT_AN_INPUT);
    room_tick();
    let shown = vessels_in(&snapshot());
    assert_eq!(
        shown.iter().map(|vessel| (vessel.id, vessel.acknowledged)).collect::<Vec<_>>(),
        [(first, 1), (second, 1)]
    );
    assert_eq!(shown[0].ship[..2], AT[..2], "where she put to sea, her rudder swinging her that same tick");
    let welcome_bytes = joined(first);
    let welcome = messages::root_as_from_room(&welcome_bytes).unwrap();
    assert_eq!(welcome.joined().map(|joined| joined.player()), Some(first));
}

#[test]
fn a_browser_predicting_its_ship_by_the_door_agrees_with_the_room_to_the_bit() {
    open_fleet();
    let player = room_join();
    assert_eq!(send(player, Input { put_to_sea: Some(AT), ..orders(1) }), TAKEN);
    room_tick();
    let put = vessels_in(&snapshot())[0].clone();
    for sequence in 2..=200 {
        assert_eq!(send(player, orders(sequence)), TAKEN);
        room_tick();
    }
    let last = vessels_in(&snapshot())[0].clone();
    assert_eq!(last.acknowledged, 200);
    let (sail, max_sail) = (last.hurts[2], last.hurts[3]);
    let mut request = put.ship.clone();
    request.extend([0.0, sail, max_sail, 200.0 * movement::TICK_SECONDS, 0.0]);
    for sequence in 2..=200 {
        let helm = helm_at(sequence);
        request.extend([helm.steer, f64::from(u8::from(helm.crab)), f64::from(helm.climb)]);
    }
    let predicted = predict(&request);
    let bits = |numbers: &[f64]| numbers.iter().map(|number| number.to_bits()).collect::<Vec<_>>();
    assert_eq!(bits(&predicted[..8]), bits(&last.ship), "her ship, the same numbers to the bit");
    assert_eq!(bits(&predicted[8..]), bits(&last.pose), "her pose at the room's time");
    assert!(predict(&[1.0, 2.0]).is_empty(), "numbers that are not a ship");
    let mut wild = request.clone();
    wild.extend([3.0, 0.0, 0.0]);
    assert!(predict(&wild).is_empty(), "a rudder past its throw");
}

#[test]
fn a_look_lays_through_the_door_as_the_fight_lays_it() {
    open_fleet();
    let player = room_join();
    let called = Input { put_to_sea: Some(AT), call: Call::Captain(Commission::default()), ..orders(1) };
    assert_eq!(send(player, called), TAKEN);
    for _ in 0..3 {
        room_tick();
    }
    let (fight_preview, request) = with_open(|opened| {
        let Opened::Fleet(fleet) = opened else { panic!("a fleet room") };
        let fight = fleet.fight();
        let ships = fight.sighted();
        let own = ships.iter().find(|ship| ship.id == player).copied().unwrap();
        let her = ships.iter().find(|ship| ship.id != player).copied().unwrap();
        let (east, south) = (her.ship.x - own.ship.x, her.ship.y - own.ship.y);
        let bearing = (naval::captain::course::heading_to([0.0, 0.0], [east, south]) - own.ship.heading).to_degrees();
        let bearing = (bearing + 180.0).rem_euclid(360.0) - 180.0;
        let eye = [own.ship.x, own.ship.y, 2.0];
        let ray = [[eye[0], eye[1], eye[2]], [east, south, her.pose.heave + 0.6 - 2.0]];
        let aim = Aim { bearing_deg: bearing, range_m: (east * east + south * south).sqrt(), ray: Some(ray) };
        let time = fleet.time();
        let waters = sailing::waters::OpenSea { swell: fleet.weather().0 };
        let shown = fight.preview(player, &aim, &waters, time);
        let sighted = |ship: &naval::laying::Sighted| {
            let flag = f64::from(ship.flag.number());
            [f64::from(ship.id), flag]
                .into_iter()
                .chain(ship.ship.to_floats())
                .chain(ship.pose.to_floats())
                .chain([1.0])
        };
        let mut request: Vec<f64> = sighted(&own).collect();
        request.extend([1.0, aim.bearing_deg, aim.range_m, 1.0]);
        request.extend(ray.iter().flatten());
        request.push(time);
        request.extend(sighted(&her));
        (shown, request)
    })
    .unwrap();
    let answer = lay(&request);
    let shown = fight_preview.unwrap_or_else(|| panic!("a side bears on her"));
    assert_eq!(
        answer[..6],
        [
            1.0,
            shown.lay.side.index() as f64,
            shown.lay.elevation,
            shown.lay.reach,
            shown.radius,
            f64::from(u8::from(shown.on_target))
        ]
    );
    assert_eq!(answer.len(), 6 + 3 * 16);
    assert_eq!(answer[6..12], shown.launches[0]);
    assert!(lay(&request[..10]).is_empty(), "a request cut short");
}
