//! The public events on the wire: the event the client's test expects, and what a zone's events add to a snapshot.
use super::*;

/// The public event the client's test expects: a heroic Fissure in its second stage, eleven of fourteen shards set,
/// its bonus held, 27.5 m round, its window's ticks 1,234, with its fissure and a shard carried by player 9.
pub(crate) fn public() -> room::public::PublicSeen {
    let mark = |kind: u8, id: u32, at: [f64; 3], health: f32, state: u8| room::public::PublicMark {
        kind,
        id,
        at,
        health,
        state,
    };
    room::public::PublicSeen {
        kind: 1,
        phase: 1,
        ground: [10.0, -20.5, 3.25],
        radius: 27.5,
        ticks_left: 12_000,
        next_kind: 2,
        next_ground: [140.0, 60.0, 4.5],
        next_ticks: 25_200,
        stage: 2,
        stages: 2,
        progress: 11,
        needed: 14,
        heroic: 2,
        heroic_ticks: 1_234,
        bonus: true,
        marks: vec![mark(1, 0, [10.0, -20.5, 3.25], 0.25, 0), mark(5, 9, [12.0, -18.0, 3.5], 1.0, 0)],
        next_wave_ticks: 1_500,
    }
}

/// What a zone's events add to each snapshot: waiting (the hamlet's three stores), and a busy Fissure (its fissure
/// and growth, twenty shards lying and four carried).
fn public_bytes() -> (usize, usize) {
    let bare = Snapshot {
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
        plates: &[],
        foes: &[],
        events: &[],
        shots: &[],
        lines: &[],
        spells: &[],
        cache: &[],
        revives: None,
        public: None,
        encounter: None,
        breach: None,
    };
    let mark =
        |kind: u8, id: u32| room::public::PublicMark { kind, id, at: [512.25, -301.5, 12.75], health: 0.5, state: 1 };
    let waiting =
        room::public::PublicSeen { kind: 0, phase: 0, marks: (1..=3).map(|id| mark(3, id)).collect(), ..public() };
    let mut marks = vec![mark(1, 0), mark(2, 77)];
    marks.extend((1..=20).map(|id| mark(4, id)));
    marks.extend((1..=4).map(|id| mark(5, id)));
    let busy = room::public::PublicSeen { marks, ..public() };
    let none = snapshot_bytes(&bare).len();
    let size = |seen: &room::public::PublicSeen| snapshot_bytes(&Snapshot { public: Some(seen), ..bare }).len() - none;
    (size(&waiting), size(&busy))
}

#[test]
fn a_zone_s_events_add_few_bytes_to_each_snapshot_their_marks_packed_as_structs() {
    let (waiting, busy) = public_bytes();
    // Measured: 256 and 808.
    assert!(waiting <= 260 && busy <= 820, "waiting {waiting} bytes, busy {busy}");
}
