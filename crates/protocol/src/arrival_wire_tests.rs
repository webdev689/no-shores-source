//! What brings foes on the wire: every airship and crown a snapshot carries reads back whole, in the bytes the
//! client's test reads (`messages.test.ts`), and a snapshot with none carries none.
use crate::land::{Snapshot, snapshot_bytes};
use crate::protocol_tests::snapshot;
use crate::wire::overlook::wire as messages;

#[test]
fn every_airship_and_crown_crosses_whole_in_its_snapshot_and_none_costs_nothing() {
    let none = crate::public_wire_tests::public();
    let plain = Snapshot { public: None, ..snapshot(&[], &[], (&[], &[], &[]), &none) };
    let ship = room::ArrivalSeen {
        id: 3,
        kind: room::Bringer::Airship,
        at: [12.5, -40.25, 9.75],
        heading: 1.25,
        high: 24.0,
        began: 1000,
        hangs: 1480,
        leaves: 1800,
        gone: 2340,
    };
    let crown = room::ArrivalSeen { id: 4, kind: room::Bringer::Crown, heading: 2.5, high: 0.0, ..ship };
    let arrivals = [ship, crown];
    let bytes = snapshot_bytes(&Snapshot { arrivals: &arrivals, ..plain });
    // The client's test reads these bytes back (`messages.test.ts`).
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).unwrap();
    std::fs::write(format!("{folder}/arrivals.bin"), &bytes).unwrap();
    let seen = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").snapshot().expect("a snapshot");
    let read: Vec<_> = seen
        .arrivals()
        .iter()
        .flatten()
        .map(|each| {
            let at: Vec<f64> = each.at().iter().flatten().collect();
            (
                each.id(),
                each.kind(),
                at,
                each.heading(),
                each.high(),
                each.began(),
                each.hangs(),
                each.leaves(),
                each.gone(),
            )
        })
        .collect();
    let ship_read = (3, 1, vec![12.5, -40.25, 9.75], 1.25, 24.0, 1000, 1480, 1800, 2340);
    let crown_read = (4, 2, vec![12.5, -40.25, 9.75], 2.5, 0.0, 1000, 1480, 1800, 2340);
    assert_eq!(read, [ship_read, crown_read]);
    let bare = snapshot_bytes(&plain);
    let bare = flatbuffers::root::<messages::FromRoom>(&bare).expect("a message");
    assert!(bare.snapshot().expect("a snapshot").arrivals().is_none(), "none sent");
}
