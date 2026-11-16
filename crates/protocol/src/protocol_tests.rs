use super::*;
use movement::{TICK_SECONDS, standing, step_body};

fn input(sequence: u32, controls: &[f64]) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let controls = Some(builder.create_vector(controls));
    let input = messages::Input::create(&mut builder, &messages::InputArgs { sequence, controls });
    builder.finish(input, None);
    builder.finished_data().to_vec()
}

/// The two players the client's test of the same bytes expects (messages.test.ts): one standing, one after half a
/// second's walk at a bearing of 0.3.
pub fn players() -> Vec<Seen> {
    let walk = Controls { forward: 1.0, yaw: 0.3, ..Controls::default() };
    let walked = (0..30).fold(standing(1.5, -2.25), |body, _| step_body(&body, &walk, &[], TICK_SECONDS));
    vec![
        Seen { player: 7, acknowledged: 0, body: standing(1.5, -2.25) },
        Seen { player: 9, acknowledged: 30, body: walked },
    ]
}

#[test]
fn an_input_reads_back_as_its_number_and_controls() {
    let (sequence, controls) = read_input(&input(42, &[1.0, -0.5, 0.3, 1.0, 0.0, 1.0, 0.0])).unwrap();
    assert_eq!(sequence, 42);
    let expected =
        Controls { forward: 1.0, sideways: -0.5, yaw: 0.3, run: true, jump: false, crouch: true, mounted: false };
    assert_eq!(controls, expected);
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
    let welcome = joined_bytes(7);
    let joined = flatbuffers::root::<messages::FromRoom>(&welcome).unwrap();
    assert_eq!(joined.joined().map(|joined| joined.player()), Some(7));
    assert!(joined.snapshot().is_none());

    let players = players();
    let bytes = snapshot_bytes(1234, &players);
    let snapshot = flatbuffers::root::<messages::FromRoom>(&bytes).unwrap().snapshot().unwrap();
    assert_eq!(snapshot.tick(), 1234);
    let read: Vec<Seen> = snapshot
        .players()
        .unwrap()
        .iter()
        .map(|seen| {
            let numbers: Vec<f64> = seen.body().unwrap().iter().collect();
            Seen { player: seen.player(), acknowledged: seen.acknowledged(), body: body_of(&numbers).unwrap() }
        })
        .collect();
    assert_eq!(read, players);
}

/// The client's test reads these bytes to check that what the server writes, the browser reads to the bit.
#[test]
fn the_bytes_for_the_clients_test_are_written() {
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).unwrap();
    std::fs::write(format!("{folder}/joined.bin"), joined_bytes(7)).unwrap();
    std::fs::write(format!("{folder}/snapshot.bin"), snapshot_bytes(1234, &players())).unwrap();
}
