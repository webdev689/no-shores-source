//! An Elite Dungeon's encounters on the wire: the encounters the client's test expects read back to the bit, and what
//! they add to each snapshot.
use crate::encounter_wire::encounter_of;
use crate::land::{Snapshot, snapshot_bytes};
use crate::wire::overlook::wire as messages;
use room::encounters::{EncounterSeen, SealSeen};

/// The encounters the client's test expects: a Litany broken, a Weighing running two plates with the first held, an
/// Ascent waiting with none of two on its stone and a Holdfast's relic part drained; the Boss, number 31, warded at
/// one third with one ward broken, its anchors part stood on; a Reckoning 300 ticks off at the second anchor; Fury at
/// its fourth step, 3,600 ticks once to its start; its slam 90 ticks off. Every field differs from its neighbours, so a
/// swap shows.
pub(crate) static ENCOUNTER: std::sync::LazyLock<EncounterSeen> = std::sync::LazyLock::new(|| EncounterSeen {
    seals: vec![
        SealSeen { kind: 1, state: 2, progress: 1000, marks: vec![2, 2, 2, 2, 2], relic: 1000 },
        SealSeen { kind: 2, state: 1, progress: 450, marks: vec![1, 0], relic: 1000 },
        SealSeen { kind: 3, state: 0, progress: 0, marks: vec![0, 2], relic: 1000 },
        SealSeen { kind: 4, state: 1, progress: 120, marks: vec![1], relic: 640 },
    ],
    woken: true,
    boss: 31,
    ward: 2,
    wards_broken: 1,
    anchors: vec![1000, 333, 0],
    reckoning_ticks: 300,
    reckoning_at: 1,
    fury: 4,
    fury_ticks: 3_600,
    slam_ticks: 90,
});

fn bare() -> Snapshot<'static> {
    Snapshot {
        tick: 1,
        viewer: 0,
        middle: [0.0, 0.0],
        base: 0,
        gone_players: &[],
        gone_foes: &[],
        own_base: None,
        base_players: None,
        base_foes: None,
        players: &[],
        dressed: &[],
        foes: &[],
        events: &[],
        shots: &[],
        lines: &[],
        spells: &[],
        cache: &[],
        revives: None,
        public: None,
        plates: &[],
        encounter: None,
        darkness: false,
        reviving: &[],
    }
}

#[test]
fn an_elite_dungeons_encounters_cross_whole_and_a_room_without_them_sends_none() {
    let bytes = snapshot_bytes(&Snapshot { encounter: Some(&ENCOUNTER), ..bare() });
    let read = flatbuffers::root::<messages::FromRoom>(&bytes).unwrap().snapshot().unwrap();
    assert_eq!(encounter_of(&read).as_ref(), Some(&*ENCOUNTER));
    let none = snapshot_bytes(&bare());
    let read = flatbuffers::root::<messages::FromRoom>(&none).unwrap().snapshot().unwrap();
    assert_eq!(encounter_of(&read), None);
    let added = bytes.len() - none.len();
    // Measured: 240.
    assert!(added <= 248, "{added} bytes");
}

#[test]
fn a_rooms_own_encounters_cross_as_it_sees_them() {
    let mut room = room::Room::dungeon_run(
        &room::RunOf::Elite { place: "krakens-grotto".into() },
        gear::Difficulty::Normal,
        29_919_420,
    )
    .expect("a run");
    let player = room.join().expect("in");
    room.tick();
    let seen = room.encounter_seen().expect("its encounters");
    let bytes = snapshot_bytes(&Snapshot { viewer: player, encounter: Some(&seen), ..bare() });
    let read = flatbuffers::root::<messages::FromRoom>(&bytes).unwrap().snapshot().unwrap();
    assert_eq!(encounter_of(&read), Some(seen));
}
