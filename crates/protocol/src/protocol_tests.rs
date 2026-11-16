use super::*;
use movement::{Flat, TICK_SECONDS, standing, step_body};

/// An input with these controls and no look.
fn input(sequence: u32, controls: &[f64]) -> Vec<u8> {
    input_bytes(sequence, controls, &Shown::default(), None, false)
}

/// The two players the client's test of the same bytes expects (messages.test.ts): one standing inside, one after half
/// a second's walk at a bearing of 0.3, swinging, warned with 432 ticks left; and the dress the first sent.
pub fn players() -> Vec<Seen> {
    let walk = Controls { forward: 1.0, yaw: 0.3, ..Controls::default() };
    let walked = (0..30).fold(standing(1.5, -2.25), |body, _| step_body(&body, &walk, &[], &Flat, TICK_SECONDS));
    let swinging = Shown { anim: "attack_sword".to_owned(), frame: 4, facing: 0.75 };
    vec![
        Seen {
            player: 7,
            acknowledged: 0,
            body: standing(1.5, -2.25),
            standing: Standing::Inside,
            shown: Shown::default(),
        },
        Seen {
            player: 9,
            acknowledged: 30,
            body: walked,
            standing: Standing::Warned { ticks_left: 432 },
            shown: swinging,
        },
    ]
}
const DRESSED: [(PlayerId, &str); 1] = [(7, r#"{"body":"male"}"#)];
/// The node and rect the client's test expects in the welcome.
const NODE: (&str, [f64; 4]) = ("overlook-social", [2_808_986.0, 1_201_139.0, 2_809_442.0, 1_201_455.5]);
/// The ships the client's test expects in the sea's snapshot.
const SHIPS: [(PlayerId, Ship); 2] = [
    (3, Ship { x: 50_000.0, y: 149_880.25, heading: 0.0, pace: 10 }),
    (4, Ship { x: 61_000.0, y: 149_000.0, heading: std::f64::consts::FRAC_PI_2, pace: 0 }),
];

/// The players a snapshot's bytes hold.
fn players_in(snapshot: &messages::Snapshot) -> Vec<Seen> {
    let players = snapshot.players().unwrap().iter();
    players
        .map(|seen| {
            let numbers: Vec<f64> = seen.body().unwrap().iter().collect();
            let anim = seen.anim().unwrap_or_default().to_owned();
            let shown = Shown { anim, frame: seen.frame(), facing: seen.facing() };
            Seen {
                player: seen.player(),
                acknowledged: seen.acknowledged(),
                body: body_of(&numbers).unwrap(),
                standing: standing_of(seen.standing(), seen.standing_ticks()),
                shown,
            }
        })
        .collect()
}

/// The dresses a message holds.
fn dressed_in(
    dressed: Option<flatbuffers::Vector<'_, flatbuffers::ForwardsUOffset<messages::Dressed<'_>>>>,
) -> Vec<(u32, String)> {
    dressed.unwrap().iter().map(|each| (each.player(), each.dress().unwrap_or_default().to_owned())).collect()
}

#[test]
fn an_input_reads_back_as_its_number_controls_look_dress_and_respawn() {
    let shown = Shown { anim: "ride_gallop".to_owned(), frame: 3, facing: -1.5 };
    let bytes = input_bytes(42, &[1.0, -0.5, 0.3, 1.0, 0.0, 1.0, 0.0], &shown, Some("dressed"), true);
    let read = read_input(&bytes).unwrap();
    let controls =
        Controls { forward: 1.0, sideways: -0.5, yaw: 0.3, run: true, jump: false, crouch: true, mounted: false };
    assert_eq!(read, Input { sequence: 42, controls, shown, dress: Some("dressed".to_owned()), respawn: true });
    let plain = read_input(&input(1, &[0.0; 7])).unwrap();
    assert_eq!((plain.dress, plain.respawn), (None, false));
}

#[test]
fn bytes_that_are_not_an_input_and_controls_of_the_wrong_count_are_refused() {
    assert!(read_input(&[]).is_err());
    assert!(read_input(&[0xff; 7]).is_err());
    let whole = input(1, &[0.0; 7]);
    assert!(read_input(&whole[..whole.len() / 2]).is_err());
    assert_eq!(read_input(&input(1, &[0.0; 6])), Err("controls are 7 numbers, not 6".to_owned()));
}

#[test]
fn a_course_reads_back_as_its_points_and_pace_and_odd_numbers_are_refused() {
    let points = [[50_000.0, 150_000.5], [51_000.0, 149_000.0]];
    assert_eq!(read_course(&course_bytes(&points, 20)), Ok((points.to_vec(), 20)));
    assert_eq!(read_course(&course_bytes(&[], 5)), Ok((Vec::new(), 5)));
    assert!(read_course(&[1, 2, 3]).is_err());
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let odd = Some(builder.create_vector(&[1.0, 2.0, 3.0]));
    let course = messages::Course::create(&mut builder, &messages::CourseArgs { points: odd, pace: 5 });
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

    let players = players();
    let bytes = snapshot_bytes(1234, &players, &DRESSED);
    let snapshot = flatbuffers::root::<messages::FromRoom>(&bytes).unwrap().snapshot().unwrap();
    assert_eq!(snapshot.tick(), 1234);
    assert_eq!(players_in(&snapshot), players);
    assert_eq!(dressed_in(snapshot.dressed()), vec![(7, DRESSED[0].1.to_owned())]);
    assert!(snapshot.ships().is_none());

    let bytes = sea_snapshot_bytes(77, &SHIPS);
    let sea = flatbuffers::root::<messages::FromRoom>(&bytes).unwrap().snapshot().unwrap();
    let ships: Vec<(PlayerId, Ship)> = sea
        .ships()
        .unwrap()
        .iter()
        .map(|ship| (ship.player(), Ship { x: ship.x(), y: ship.y(), heading: ship.heading(), pace: ship.pace() }))
        .collect();
    assert_eq!((sea.tick(), ships), (77, SHIPS.to_vec()));
}

/// The client's test reads these bytes to check that what the server writes, the browser reads to the bit.
#[test]
fn the_bytes_for_the_clients_test_are_written() {
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).unwrap();
    std::fs::write(format!("{folder}/joined.bin"), joined_bytes(7, &DRESSED, Some(NODE))).unwrap();
    std::fs::write(format!("{folder}/snapshot.bin"), snapshot_bytes(1234, &players(), &DRESSED)).unwrap();
    std::fs::write(format!("{folder}/sea.bin"), sea_snapshot_bytes(77, &SHIPS)).unwrap();
}
