use super::*;
use combat::arms::{Arms, OffHand, Ranged, Stroke, WeaponClass};
use combat::fighter::{Action, Side, Weight, fighter, player};
use combat::shots::loose;
use combat::{CombatInput, Fighter};
use movement::{Controls, Flat, TICK_SECONDS, standing, step_body};
use room::{EventKind, How};

/// An input with these controls and nothing else.
fn input(sequence: u32, controls: Controls) -> Input {
    Input { sequence, intent: Intent { controls, ..Intent::default() }, ..Input::default() }
}

/// The two players the client's test of the same bytes expects (messages.test.ts): one standing inside, one after half
/// a second's walk at a bearing of 0.3, swinging a sword at its target, foe 12, warned with 432 ticks left; and the
/// dress the first sent.
pub fn players() -> Vec<Seen> {
    let walk = Controls { forward: 1.0, yaw: 0.3, ..Controls::default() };
    let walked = (0..30).fold(standing(1.5, -2.25), |body, _| step_body(&body, &walk, &[], &Flat, TICK_SECONDS));
    let swinging = Shown { anim: "attack_sword".to_owned(), frame: 4, facing: 0.75 };
    let sword = Arms { melee: WeaponClass::Sword, ranged: None, off_hand: OffHand::Empty };
    let mut fighting = player(walked, sword);
    fighting.target = Some(12);
    fighting.stamina = 88.0;
    vec![
        Seen {
            player: 7,
            acknowledged: 0,
            fighter: player(standing(1.5, -2.25), combat::arms::BARE_HANDS),
            standing: Standing::Inside,
            shown: Shown::default(),
        },
        Seen {
            player: 9,
            acknowledged: 30,
            fighter: fighting,
            standing: Standing::Warned { ticks_left: 432 },
            shown: swinging,
        },
    ]
}

/// The foe the client's test expects: a brute, foe 12, staggered with 40 of its 130 health gone.
pub fn foes() -> Vec<FoeSeen> {
    let warhammer = Arms { melee: WeaponClass::Warhammer, ranged: None, off_hand: OffHand::Empty };
    let mut brute = fighter(Side::Foes, standing(3.0, -6.0), warhammer, Weight::Heavy, 130.0, 70.0);
    brute.health = 90.0;
    brute.target = Some(9);
    brute.action = Action::Staggered { left: 30, cause: combat::fighter::Cause::Parried };
    vec![FoeSeen { foe: 12, kind: 3, fighter: brute }]
}

pub const EVENTS: [Event; 2] = [
    Event { tick: 1233, kind: EventKind::Parried, how: Some(How::Swing), striker: 12, defender: 9, amount: 0.0 },
    Event { tick: 1234, kind: EventKind::Hit, how: Some(How::Riposte), striker: 9, defender: 12, amount: 35.0 },
];

fn shots() -> Vec<Shot> {
    vec![loose(12, Ranged::Bow, [3.0, -6.0, 1.1], 0.5, 0.1, 1.0)]
}

const DRESSED: [(PlayerId, &str); 1] = [(7, r#"{"body":"male"}"#)];
/// The node and rect the client's test expects in the welcome.
const NODE: (&str, [f64; 4]) = ("overlook-social", [2_808_986.0, 1_201_139.0, 2_809_442.0, 1_201_455.5]);
/// The ships the client's test expects in the sea's snapshot.
const PIRATES: [Pirate; 1] = [Pirate { id: 4, seed: 9, x: 1_000.5, y: 2_000.25, heading: 1.5, bold: true }];

/// Deep, still water everywhere.
struct Open;

impl sailing::waters::Waters for Open {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> sailing::waters::Spot {
        sailing::waters::Spot { bed: -50.0, surface: Some(0.0) }
    }
}

/// A fight as a snapshot carries it: its player, and its view with the player's look laid to starboard and her port
/// guns run out (the client's test reads it back).
fn fights_seen() -> Vec<(PlayerId, Vec<f64>)> {
    let at = |x: f64, y: f64, heading: f64| sailing::ship::Ship {
        x,
        y,
        heading,
        ahead: 0.0,
        abeam: 0.0,
        turn: 0.0,
        sail_way: 0.0,
        rung: 2,
    };
    let fight = naval::fight::Fight::meet(at(0.0, 0.0, 0.0), at(0.0, -700.0, 3.0), 7, &Open, 0.0);
    let aim = naval::fight::Aim { bearing_deg: 90.0, range_m: 80.0 };
    let events = [naval::fight::Event::RunOut { side: naval::arms::Side::Port }];
    vec![(2, naval::wire::view_numbers(&fight, &events, Some(&aim)))]
}

const SHIPS: [(PlayerId, Ship); 2] = [
    (3, Ship { x: 50_000.0, y: 149_880.25, heading: 0.0, pace: 10 }),
    (4, Ship { x: 61_000.0, y: 149_000.0, heading: std::f64::consts::FRAC_PI_2, pace: 0 }),
];

fn snapshot<'snapshot>(
    players: &'snapshot [Seen],
    foes: &'snapshot [FoeSeen],
    shots: &'snapshot [Shot],
) -> Snapshot<'snapshot> {
    Snapshot { tick: 1234, players, dressed: &DRESSED, foes, events: &EVENTS, shots }
}

/// The dresses a message holds.
fn dressed_in(
    dressed: Option<flatbuffers::Vector<'_, flatbuffers::ForwardsUOffset<messages::Dressed<'_>>>>,
) -> Vec<(u32, String)> {
    dressed.unwrap().iter().map(|each| (each.player(), each.dress().unwrap_or_default().to_owned())).collect()
}

#[test]
fn an_input_reads_back_as_its_number_intent_look_dress_arms_view_ask_and_respawn() {
    let shown = Shown { anim: "ride_gallop".to_owned(), frame: 3, facing: -1.5 };
    let controls = Controls { forward: 1.0, sideways: -0.5, yaw: 0.3, run: true, crouch: true, ..Controls::default() };
    let combat =
        CombatInput { attack: Some(Stroke::Up), guard: true, dodge: false, shoot: true, pitch: -0.2, telegraph: None };
    let sent = Input {
        sequence: 42,
        intent: Intent { controls, combat },
        shown,
        dress: Some("dressed".to_owned()),
        arms: Arms { melee: WeaponClass::Dagger, ranged: None, off_hand: OffHand::Shield }.code(),
        seen: 977,
        spawn: Some(3),
        respawn: true,
    };
    assert_eq!(read_input(&input_bytes(&sent)).unwrap(), sent);
    let plain = read_input(&input_bytes(&input(1, Controls::default()))).unwrap();
    let asked = (plain.dress, plain.spawn, plain.intent.combat, plain.respawn);
    assert_eq!(asked, (None, None, CombatInput::default(), false));
}

#[test]
fn bytes_that_are_not_an_input_and_numbers_of_the_wrong_count_are_refused() {
    assert!(read_input(&[]).is_err());
    assert!(read_input(&[0xff; 7]).is_err());
    let whole = input_bytes(&input(1, Controls::default()));
    assert!(read_input(&whole[..whole.len() / 2]).is_err());
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let controls = Some(builder.create_vector(&[0.0; 6]));
    let short = messages::Input::create(&mut builder, &messages::InputArgs { controls, ..Default::default() });
    builder.finish(short, None);
    assert_eq!(read_input(builder.finished_data()), Err("controls are 7 numbers, not 6".to_owned()));
}

#[test]
fn a_course_reads_back_as_its_points_and_pace_and_odd_numbers_are_refused() {
    let points = [[50_000.0, 150_000.5], [51_000.0, 149_000.0]];
    assert_eq!(read_course(&course_bytes(&points, 20)), Ok((points.to_vec(), 20)));
    assert_eq!(read_course(&course_bytes(&[], 5)), Ok((Vec::new(), 5)));
    assert!(read_course(&[1, 2, 3]).is_err());
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let odd = Some(builder.create_vector(&[1.0, 2.0, 3.0]));
    let course = messages::Course::create(&mut builder, &messages::CourseArgs { points: odd, pace: 5, orders: None });
    builder.finish(course, None);
    assert_eq!(read_course(builder.finished_data()), Err("a course's points are pairs, not 3 numbers".to_owned()));
}

#[test]
fn every_standing_crosses_and_comes_back() {
    for standing in [Standing::Inside, Standing::Warned { ticks_left: 599 }, Standing::Dead { ticks: 241 }] {
        let (kind, ticks) = standing_parts(standing);
        assert_eq!(standing_of(kind, ticks), standing);
    }
}

#[test]
fn a_welcome_and_snapshots_read_back_to_the_bit() {
    let welcome = joined_bytes(7, &DRESSED, Some(NODE));
    let joined = flatbuffers::root::<messages::FromRoom>(&welcome).unwrap().joined().unwrap();
    assert_eq!((joined.player(), joined.node()), (7, Some(NODE.0)));
    assert_eq!(joined.bounds().unwrap().iter().collect::<Vec<_>>(), NODE.1);
    assert_eq!(dressed_in(joined.dressed()), vec![(7, DRESSED[0].1.to_owned())]);
    let plain = joined_bytes(7, &[], None);
    let plain = flatbuffers::root::<messages::FromRoom>(&plain).unwrap().joined().unwrap();
    assert_eq!((plain.node(), plain.bounds().is_none()), (None, true));

    let (players, foes, shots) = (players(), foes(), shots());
    let bytes = snapshot_bytes(&snapshot(&players, &foes, &shots));
    let read = flatbuffers::root::<messages::FromRoom>(&bytes).unwrap().snapshot().unwrap();
    assert_eq!(read.tick(), 1234);
    let fighters: Vec<Fighter> = read
        .players()
        .unwrap()
        .iter()
        .map(|seen| Fighter::from_floats(&seen.fighter().unwrap().iter().collect::<Vec<f64>>().try_into().unwrap()))
        .collect();
    assert_eq!(fighters, players.iter().map(|seen| seen.fighter).collect::<Vec<_>>());
    let bodies: Vec<_> = read
        .players()
        .unwrap()
        .iter()
        .map(|seen| body_of(&seen.fighter().unwrap().iter().take(22).collect::<Vec<_>>()))
        .collect();
    assert_eq!(bodies, players.iter().map(|seen| Some(seen.fighter.body)).collect::<Vec<_>>());
    let standings: Vec<Standing> =
        read.players().unwrap().iter().map(|seen| standing_of(seen.standing(), seen.standing_ticks())).collect();
    assert_eq!(standings, players.iter().map(|seen| seen.standing).collect::<Vec<_>>());
    let foe = read.foes().unwrap().get(0);
    let glance: [f64; combat::floats::GLANCE_FLOATS] =
        foe.glance().unwrap().iter().collect::<Vec<_>>().try_into().unwrap();
    assert_eq!((foe.id(), foe.kind(), glance), (12, 3, foes[0].fighter.glance()));
    let events: Vec<_> =
        read.events().unwrap().iter().map(|event| (event.tick(), event.kind(), event.how(), event.amount())).collect();
    assert_eq!(events, vec![(1233, 3, 1, 0.0), (1234, 1, 2, 35.0)]);
    let flying = read.shots().unwrap().get(0);
    assert_eq!((flying.owner(), flying.ranged()), (12, 1));
    assert_eq!(flying.at().unwrap().iter().collect::<Vec<_>>(), shots[0].at.to_vec());
    assert!(read.ships().is_none());

    let bytes = sea_snapshot_bytes(77, &SHIPS, &PIRATES, &fights_seen());
    let sea = flatbuffers::root::<messages::FromRoom>(&bytes).unwrap().snapshot().unwrap();
    let ships: Vec<(PlayerId, Ship)> = sea
        .ships()
        .unwrap()
        .iter()
        .map(|ship| (ship.player(), Ship { x: ship.x(), y: ship.y(), heading: ship.heading(), pace: ship.pace() }))
        .collect();
    assert_eq!((sea.tick(), ships), (77, SHIPS.to_vec()));
    let pirate = sea.pirates().unwrap().get(0);
    assert_eq!((pirate.id(), pirate.x(), pirate.y(), pirate.heading()), (4, 1_000.5, 2_000.25, 1.5));
    let fight = sea.fights().unwrap().get(0);
    assert_eq!((fight.player(), fight.view().unwrap().iter().collect::<Vec<_>>()), (2, fights_seen()[0].1.clone()));
}

#[test]
fn orders_cross_in_a_course_message_and_a_course_without_them_is_a_course() {
    let orders = Orders {
        helm: sailing::ship::Helm { steer: 0.5, crab: false, climb: -1 },
        aim: None,
        fire: true,
        brace: false,
        load: None,
    };
    assert_eq!(read_sea_input(&orders_bytes(&orders)), Ok(SeaInput::Orders(orders)));
    assert_eq!(read_sea_input(&course_bytes(&[[1.0, 2.0]], 5)), Ok(SeaInput::Course(vec![[1.0, 2.0]], 5)));
}

/// The client's test reads these bytes to check that what the server writes, the browser reads to the bit.
#[test]
fn the_bytes_for_the_clients_test_are_written() {
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).unwrap();
    let (players, foes, shots) = (players(), foes(), shots());
    std::fs::write(format!("{folder}/joined.bin"), joined_bytes(7, &DRESSED, Some(NODE))).unwrap();
    std::fs::write(format!("{folder}/snapshot.bin"), snapshot_bytes(&snapshot(&players, &foes, &shots))).unwrap();
    std::fs::write(format!("{folder}/sea.bin"), sea_snapshot_bytes(77, &SHIPS, &PIRATES, &fights_seen())).unwrap();
}
