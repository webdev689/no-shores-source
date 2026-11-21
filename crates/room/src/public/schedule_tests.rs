//! The clock: each of Saltmere's zones runs one event every fifteen minutes, alternating its two, the zones five
//! minutes apart; a room opened during an event starts it with what its start minute leaves; and two zones' rooms
//! agree on the clock.

use super::fixture::{FISSURE_MINUTE, ZONE, room_at, running};
use super::{COUNTDOWN_TICKS, Kind, PERIOD_MINUTES, TICKS_PER_MINUTE, ZONES, schedule};

#[test]
fn across_a_day_one_event_starts_on_saltmere_every_five_minutes_each_zone_alternating_its_two() {
    let day = 20_000 * 1_440_u64;
    let mut starts = Vec::new();
    for minute in day..day + 1_440 {
        for zone in ZONES {
            let (kind, start) = schedule(zone, minute).expect("an event zone");
            assert!(start <= minute && minute < start + PERIOD_MINUTES, "{zone} at {minute}: its slot holds it");
            if start == minute {
                starts.push((minute, zone, kind));
            }
        }
    }
    assert_eq!(starts.len(), 1_440 / 5, "one start every five minutes");
    assert!(starts.windows(2).all(|pair| pair[1].0 - pair[0].0 == 5 && pair[1].1 != pair[0].1));
    for zone in ZONES {
        let own: Vec<Kind> = starts.iter().filter(|(_, at, _)| *at == zone).map(|(_, _, kind)| *kind).collect();
        assert_eq!(own.len(), 96);
        assert!(own.windows(2).all(|pair| pair[0] != pair[1]), "{zone} alternates its two");
    }
    assert!(starts.windows(2).all(|pair| pair[0].2 != pair[1].2), "the zone after runs the other event");
    assert_eq!(schedule("the-glade", day), None, "a zone holding no events");
    assert_eq!(schedule("gullwing-vale", 4), None, "before its first slot");
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
fn two_zones_rooms_agree_on_the_clock_each_showing_the_next_the_other_runs_five_minutes_on() {
    let (mut downs, _) = room_at(FISSURE_MINUTE + 2, 0);
    let (mut vale, _) = super::fixture::room_at(FISSURE_MINUTE + 2, 0);
    vale.public.as_mut().unwrap().zone = ZONES[1];
    downs.tick();
    vale.tick();
    let (downs, vale) = (downs.public_seen().unwrap(), vale.public_seen().unwrap());
    assert_eq!((downs.kind, downs.next_kind), (Kind::Fissure as u8, Kind::Raid as u8));
    let (vale_kind, vale_start) = schedule(ZONES[1], FISSURE_MINUTE + 5).unwrap();
    assert_eq!((vale.next_kind, vale_start), (vale_kind as u8, FISSURE_MINUTE + 5), "the Vale's comes next");
    assert_eq!(u64::from(vale.next_ticks), 3 * TICKS_PER_MINUTE, "three minutes on");
    assert_eq!(u64::from(downs.next_ticks), 13 * TICKS_PER_MINUTE);
    assert_ne!(vale_kind as u8, downs.kind, "neighbours run different events at once");
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
