use super::*;
use movement::{TICK_SECONDS, standing, step_body};

/// An input with these controls and no look.
fn input(sequence: u32, controls: &[f64]) -> Vec<u8> {
    input_bytes(sequence, controls, &Shown::default(), None)
}

/// The two players the client's test of the same bytes expects (messages.test.ts): one standing, one after half a
/// second's walk at a bearing of 0.3, swinging; and the dress the first sent.
pub fn players() -> Vec<Seen> {
    let walk = Controls { forward: 1.0, yaw: 0.3, ..Controls::default() };
    let walked = (0..30).fold(standing(1.5, -2.25), |body, _| step_body(&body, &walk, &[], TICK_SECONDS));
    let swinging = Shown { anim: "attack_sword".to_owned(), frame: 4, facing: 0.75 };
    vec![
        Seen { player: 7, acknowledged: 0, body: standing(1.5, -2.25), shown: Shown::default() },
        Seen { player: 9, acknowledged: 30, body: walked, shown: swinging },
    ]
}
const DRESSED: [(PlayerId, &str); 1] = [(7, r#"{"body":"male"}"#)];

/// The players a snapshot's bytes hold.
fn players_in(snapshot: &messages::Snapshot) -> Vec<Seen> {
    let players = snapshot.players().unwrap().iter();
    players
        .map(|seen| {
            let numbers: Vec<f64> = seen.body().unwrap().iter().collect();
            let anim = seen.anim().unwrap_or_default().to_owned();
            let shown = Shown { anim, frame: seen.frame(), facing: seen.facing() };
            Seen { player: seen.player(), acknowledged: seen.acknowledged(), body: body_of(&numbers).unwrap(), shown }
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
fn an_input_reads_back_as_its_number_controls_look_and_dress() {
    let shown = Shown { anim: "ride_gallop".to_owned(), frame: 3, facing: -1.5 };
    let bytes = input_bytes(42, &[1.0, -0.5, 0.3, 1.0, 0.0, 1.0, 0.0], &shown, Some("dressed"));
    let read = read_input(&bytes).unwrap();
    let controls =
        Controls { forward: 1.0, sideways: -0.5, yaw: 0.3, run: true, jump: false, crouch: true, mounted: false };
    assert_eq!(read, Input { sequence: 42, controls, shown, dress: Some("dressed".to_owned()) });
    assert_eq!(read_input(&input(1, &[0.0; 7])).unwrap().dress, None);
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
fn a_welcome_and_a_snapshot_read_back_to_the_bit() {
    let welcome = joined_bytes(7, &DRESSED);
    let joined = flatbuffers::root::<messages::FromRoom>(&welcome).unwrap();
    assert_eq!(joined.joined().map(|joined| joined.player()), Some(7));
    assert_eq!(dressed_in(joined.joined().unwrap().dressed()), vec![(7, DRESSED[0].1.to_owned())]);
    assert!(joined.snapshot().is_none());

    let players = players();
    let bytes = snapshot_bytes(1234, &players, &DRESSED);
    let snapshot = flatbuffers::root::<messages::FromRoom>(&bytes).unwrap().snapshot().unwrap();
    assert_eq!(snapshot.tick(), 1234);
    assert_eq!(players_in(&snapshot), players);
    assert_eq!(dressed_in(snapshot.dressed()), vec![(7, DRESSED[0].1.to_owned())]);
}

/// The client's test reads these bytes to check that what the server writes, the browser reads to the bit.
#[test]
fn the_bytes_for_the_clients_test_are_written() {
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).unwrap();
    std::fs::write(format!("{folder}/joined.bin"), joined_bytes(7, &DRESSED)).unwrap();
    std::fs::write(format!("{folder}/snapshot.bin"), snapshot_bytes(1234, &players(), &DRESSED)).unwrap();
}
