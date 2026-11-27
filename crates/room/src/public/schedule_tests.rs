//! The clock: the Saltgrass Downs runs one event every fifteen minutes, the Fissure and the raid in turn; a room
//! opened during an event starts it with what its start minute leaves; and two rooms of the zone agree on the clock.

use super::fixture::{FISSURE_MINUTE, ZONE, room_at, running};
use super::{COUNTDOWN_TICKS, Kind, PERIOD_MINUTES, TICKS_PER_MINUTE, ZONES, schedule};

#[test]
fn across_a_day_the_saltgrass_downs_starts_an_event_every_fifteen_minutes_the_fissure_and_the_raid_in_turn() {
    let day = 20_000 * 1_440_u64;
    let mut starts = Vec::new();
    for minute in day..day + 1_440 {
        for zone in ZONES {
            let (kind, start) = schedule(zone, minute).expect("an event zone");
            assert!(start <= minute && minute < start + PERIOD_MINUTES, "{zone} at {minute}: its slot holds it");
            if start == minute {
                starts.push((minute, kind));
            }
        }
    }
    assert_eq!(ZONES, ["saltgrass-downs"], "Saltmere's one patrol zone alone holds events");
    assert_eq!(starts.len(), 1_440 / 15, "one start every fifteen minutes");
    assert!(starts.windows(2).all(|pair| pair[1].0 - pair[0].0 == 15), "fifteen minutes apart");
    assert!(starts.windows(2).all(|pair| pair[0].1 != pair[1].1), "the Fissure and the raid in turn");
    assert_eq!(schedule("the-glade", day), None, "a zone holding no events");
    assert_eq!(schedule("gullwing-vale", day), None, "a zone cut from its island holds none");
}

#[test]
fn an_event_begins_in_the_first_tick_its_minute_comes_and_a_room_opened_during_it_takes_what_is_left() {
    let (mut room, _) = room_at(FISSURE_MINUTE - 1, 0);
    room.tick();
    assert!(room.public.as_ref().unwrap().running.is_none(), "not yet its minute");
    room.minute = FISSURE_MINUTE;
    room.tick();
    assert_eq!((running(&room).kind, running(&room).ticks_left), (Kind::Fissure, COUNTDOWN_TICKS - 1));
    let (mut late, _) = room_at(FISSURE_MINUTE + 3, 0);
    late.tick();
    assert_eq!(running(&late).ticks_left, COUNTDOWN_TICKS - 3 * TICKS_PER_MINUTE - 1, "three minutes gone");
    let (mut past, _) = room_at(FISSURE_MINUTE + 9, 0);
    past.tick();
    assert!(past.public.as_ref().unwrap().running.is_none(), "its countdown ran out before the room opened");
    let (mut unset, _) = room_at(0, 0);
    unset.tick();
    assert!(unset.public_seen().unwrap().kind == 0, "no event before the host sets the minute");
}

#[test]
fn two_rooms_of_the_zone_agree_on_the_clock_each_showing_the_raid_next_thirteen_minutes_on() {
    let (mut one, _) = room_at(FISSURE_MINUTE + 2, 0);
    let (mut other, _) = room_at(FISSURE_MINUTE + 2, 0);
    one.tick();
    other.tick();
    let (one, other) = (one.public_seen().unwrap(), other.public_seen().unwrap());
    assert_eq!((one.kind, one.next_kind), (Kind::Fissure as u8, Kind::Raid as u8));
    assert_eq!(u64::from(one.next_ticks), 13 * TICKS_PER_MINUTE);
    assert_eq!((other.kind, other.next_kind, other.next_ticks), (one.kind, one.next_kind, one.next_ticks));
    assert_eq!(ZONE, ZONES[0]);
}

/// A Fissure begun with a player at its ground, then minutes passing with no tick, as for a room left empty.
fn left_running(minutes: u64) -> crate::Room {
    let (mut room, _) = room_at(FISSURE_MINUTE, 1);
    room.tick();
    assert!(!super::fixture::standing(&room).is_empty(), "its first wave stands");
    room.minute += minutes;
    room.take_events();
    room.tick();
    room
}

#[test]
fn a_room_whose_minute_jumps_keeps_its_event_to_the_countdown_its_start_minute_leaves() {
    let room = left_running(3);
    assert!(running(&room).ticks_left <= COUNTDOWN_TICKS - 3 * TICKS_PER_MINUTE, "three minutes gone");
}

#[test]
fn a_room_whose_minute_jumps_past_its_events_end_ends_it_quietly_and_begins_the_next_on_time() {
    let mut room = left_running(10);
    assert!(room.public.as_ref().unwrap().running.is_none(), "its time is past");
    let events = room.take_events();
    let shown = |kind| events.iter().any(|event: &crate::Event| event.kind == kind);
    assert!(!shown(crate::EventKind::PublicFailed) && !shown(crate::EventKind::PublicWon), "no result shown");
    let events_foes = room.foes.values().count();
    assert_eq!(events_foes, 0, "its foes gone");
    let room = left_running(super::COUNTDOWN_MINUTES);
    assert!(room.public.as_ref().unwrap().running.is_none(), "come back as its end minute comes: past too");
    let mut room = left_running(PERIOD_MINUTES);
    assert_eq!((running(&room).kind, running(&room).start), (Kind::Raid, FISSURE_MINUTE + PERIOD_MINUTES));
    assert!(room.take_events().iter().all(|event| event.kind != crate::EventKind::PublicFailed));
}

#[test]
fn a_room_opened_late_in_a_minute_runs_its_event_out_and_shows_the_whole_result_as_its_minutes_come() {
    let (mut room, _) = room_at(FISSURE_MINUTE + 3, 0);
    room.tick();
    // Opened at 3:59 into the event: its next minute comes a second later, then one every minute.
    let (mut ticked, mut failed_at) = (1_u64, None);
    while room.public.as_ref().unwrap().running.is_some() {
        if ticked % TICKS_PER_MINUTE == 60 {
            room.minute += 1;
        }
        room.tick();
        ticked += 1;
        if failed_at.is_none() && room.take_events().iter().any(|event| event.kind == crate::EventKind::PublicFailed) {
            failed_at = Some(ticked);
        }
        assert!(ticked < COUNTDOWN_TICKS, "the event ends");
    }
    let failed_at = failed_at.expect("its countdown ran out and it failed, shown");
    assert_eq!(ticked - failed_at, super::RESULT_TICKS, "its result shown its whole time");
}

/// A day of every zone's slots, for the page's tests to check its own reading of the schedule against
/// (client/src/game/publicLaw.test.ts).
#[test]
fn a_day_of_the_schedule_is_written_for_the_page_to_agree_with() {
    let first = 20_000 * 1_440_u64;
    // A day and the slots after it, so the page can look ahead from its last minute.
    let minutes = first..first + 1_440 + 2 * PERIOD_MINUTES + 30;
    let zones: serde_json::Map<String, serde_json::Value> = ZONES
        .into_iter()
        .map(|zone| {
            let slots = minutes.clone().map(|minute| {
                let (kind, start) = schedule(zone, minute).expect("an event zone");
                serde_json::json!([kind as u8, start])
            });
            (zone.to_owned(), slots.collect())
        })
        .collect();
    let written = serde_json::json!({ "first": first, "countdown": super::COUNTDOWN_MINUTES, "zones": zones });
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).expect("the folder");
    std::fs::write(format!("{folder}/schedule.json"), written.to_string()).expect("written");
}
