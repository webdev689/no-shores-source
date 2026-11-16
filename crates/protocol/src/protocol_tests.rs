use super::*;
use combat::arms::{Arms, OffHand, Ranged, Stroke, WeaponClass};
use combat::fighter::{Action, Side, Weight, fighter, player};
use combat::shots::loose;
use combat::{CombatInput, Fighter};
use movement::{Controls, TICK_SECONDS, standing, step_body};
use room::{EventKind, How};

/// An input with these controls and nothing else.
fn input(sequence: u32, controls: Controls) -> Input {
    Input { sequence, intent: Intent { controls, ..Intent::default() }, ..Input::default() }
}

/// The two players the client's test of the same bytes expects (messages.test.ts): one standing, one after half a
/// second's walk at a bearing of 0.3, swinging a sword at its target, foe 12; and the dress the first sent.
pub fn players() -> Vec<Seen> {
    let walk = Controls { forward: 1.0, yaw: 0.3, ..Controls::default() };
    let walked = (0..30).fold(standing(1.5, -2.25), |body, _| step_body(&body, &walk, &[], TICK_SECONDS));
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
            shown: Shown::default(),
        },
        Seen { player: 9, acknowledged: 30, fighter: fighting, shown: swinging },
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
fn an_input_reads_back_as_its_number_intent_look_dress_arms_view_and_ask() {
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
    };
    assert_eq!(read_input(&input_bytes(&sent)).unwrap(), sent);
    let plain = read_input(&input_bytes(&input(1, Controls::default()))).unwrap();
    assert_eq!((plain.dress, plain.spawn, plain.intent.combat), (None, None, CombatInput::default()));
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
fn a_welcome_and_a_snapshot_read_back_to_the_bit() {
    let welcome = joined_bytes(7, &DRESSED);
    let joined = flatbuffers::root::<messages::FromRoom>(&welcome).unwrap();
    assert_eq!(joined.joined().map(|joined| joined.player()), Some(7));
    assert_eq!(dressed_in(joined.joined().unwrap().dressed()), vec![(7, DRESSED[0].1.to_owned())]);

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
}

/// The client's test reads these bytes to check that what the server writes, the browser reads to the bit.
#[test]
fn the_bytes_for_the_clients_test_are_written() {
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).unwrap();
    let (players, foes, shots) = (players(), foes(), shots());
    std::fs::write(format!("{folder}/joined.bin"), joined_bytes(7, &DRESSED)).unwrap();
    std::fs::write(format!("{folder}/snapshot.bin"), snapshot_bytes(&snapshot(&players, &foes, &shots))).unwrap();
}
