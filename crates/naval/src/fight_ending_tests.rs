use super::*;
use crate::captain::{CHASE_GIVE_UP_S, Temper, wary_takes};
use crate::damage::{Hurt, SINK_SECONDS, Zone};
use crate::ranks::{PIRATES, Rank};
use crate::rigging::masts_of;
use crate::shots::ShotEvent;
use sailing::waters::Spot;

/// Deep, still water everywhere.
struct Open;

impl Waters for Open {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: -50.0, surface: Some(0.0) }
    }
}

const WIND: [f64; 2] = [1.5, 0.0];
const IDLE: Orders = Orders {
    helm: sailing::ship::Helm { steer: 0.0, climb: 0 },
    aim: None,
    fire: false,
    brace: false,
    load: None,
    boost: false,
};

fn at(x: f64, y: f64) -> Ship {
    Ship { x, y, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 }
}

/// A fight of the player's Sloop and a pirate Major lying 60 m east of it.
fn alongside() -> Fight {
    Fight::meet(at(0.0, 0.0), at(60.0, 0.0), Commission { faction: PIRATES, rank: Rank::Major }, 3, &Open, 0.0)
}

fn run(fight: &mut Fight, ticks: u32) -> Vec<Event> {
    (0..ticks).flat_map(|_| fight.step(&[(PLAYER, IDLE)], &Open, &|_| WIND, 0.0)).collect()
}

fn hit(target: ShipId, zone: Zone, point: [f64; 3], sail: Option<usize>, harm: f64) -> ShotEvent {
    let gun = crate::guns::Gun { hull: harm, sail: harm, ..crate::guns::SWIVEL };
    ShotEvent::Hit { shooter: PLAYER, target, zone, point, flight: 0.5, gun, shot: Shot::Round, sail, rigged: false }
}

fn strike_it(fight: &mut Fight) {
    let clock = fight.clock;
    let damage = &mut fight.ships.get_mut(&CAPTAIN).unwrap().damage;
    damage.apply(Hurt { hull: damage.max_hull * 0.8, sail: 0.0, crew: 0.0, fire: false }, clock, 0.0);
    assert_eq!(damage.state, State::Struck);
}

#[test]
fn a_captain_who_struck_lies_hove_to_ninety_seconds_and_is_then_scuttled() {
    let mut fight = alongside();
    run(&mut fight, 1);
    strike_it(&mut fight);
    if let Some(Sailor::Captain(command)) = fight.ships.get_mut(&CAPTAIN).map(|vessel| &mut vessel.sailor) {
        command.struck_at = Some(fight.clock);
    }
    let held = run(&mut fight, (STRUCK_HOLD_S * 60.0) as u32 - 2);
    assert!(!held.iter().any(|event| matches!(event, Event::Sinking { .. })));
    assert_eq!(fight.vessel(CAPTAIN).unwrap().damage.state, State::Struck);
    let due = run(&mut fight, 3);
    assert!(due.contains(&Event::Sinking { ship: CAPTAIN }), "{due:?}");
    assert!(due.contains(&Event::State { ship: CAPTAIN, state: State::Sinking }));
    let gone = run(&mut fight, (SINK_SECONDS * 60.0) as u32 + 2);
    assert!(gone.contains(&Event::Gone { ship: CAPTAIN, end: End::Sunk }), "it goes down over 20 s");
}

#[test]
fn a_captain_boarded_is_not_scuttled_and_its_boarding_is_told_once() {
    let mut fight = alongside();
    assert_eq!(fight.board(CAPTAIN), None, "it has not struck");
    strike_it(&mut fight);
    if let Some(Sailor::Captain(command)) = fight.ships.get_mut(&CAPTAIN).map(|vessel| &mut vessel.sailor) {
        command.struck_at = Some(fight.clock);
    }
    assert_eq!(fight.board(CAPTAIN), Some(Event::Boarding { ship: CAPTAIN }));
    assert_eq!(fight.board(CAPTAIN), None);
    run(&mut fight, (STRUCK_HOLD_S * 60.0) as u32 + 60);
    assert_eq!(fight.vessel(CAPTAIN).unwrap().damage.state, State::Struck);
    assert!(fight.vessel(CAPTAIN).unwrap().in_fight(), "it lies on, far from no one, for its boarders");
}

#[test]
fn its_colours_coming_down_and_its_going_down_are_told_as_their_own_events_on_their_tick() {
    let mut fight = alongside();
    let damage = &mut fight.ships.get_mut(&CAPTAIN).unwrap().damage;
    damage.hull = damage.max_hull * damage.struck_at + 1.0;
    damage.apply(Hurt { hull: 0.0, sail: 0.0, crew: 0.0, fire: true }, 0.0, 0.0);
    let mut struck = None;
    for _ in 0..600 {
        let events = run(&mut fight, 1);
        if events.contains(&Event::State { ship: CAPTAIN, state: State::Struck }) {
            struck = Some(events);
            break;
        }
    }
    let struck = struck.expect("its fire brings it to strike");
    assert!(struck.contains(&Event::Struck { ship: CAPTAIN }), "{struck:?}");
    let scuttled = fight.scuttle(CAPTAIN);
    assert_eq!(scuttled, vec![Event::State { ship: CAPTAIN, state: State::Sinking }, Event::Sinking { ship: CAPTAIN }]);
    assert!(fight.scuttle(CAPTAIN).is_empty(), "it is going down already");
}

#[test]
fn a_ball_that_strikes_it_is_told_where_in_its_own_frame_and_on_which_part() {
    let mut fight = alongside();
    let mut events = Vec::new();
    fight.strike(&hit(CAPTAIN, Zone::Hull, [61.0, -2.0, 1.5], None, 1.0), &mut events);
    let Some(Event::Hit { ship: CAPTAIN, at, part: Part::Hull }) =
        events.iter().find(|event| matches!(event, Event::Hit { .. })).copied()
    else {
        panic!("{events:?}")
    };
    // Heading north, its bow is north (y falling) and its starboard east.
    let heave = fight.vessel(CAPTAIN).unwrap().pose.heave;
    assert!((at[0] - 2.0).abs() < 1e-9 && (at[1] - 1.0).abs() < 1e-9 && (at[2] - (1.5 - heave)).abs() < 1e-9, "{at:?}");
}

#[test]
fn a_sail_tears_away_as_its_harm_passes_its_due_and_a_bare_mast_struck_again_falls() {
    let mut fight = alongside();
    let max_sail = fight.vessel(CAPTAIN).unwrap().damage.max_sail;
    let mut events = Vec::new();
    for _ in 0..40 {
        fight.strike(&hit(CAPTAIN, Zone::Rig, [60.0, 0.0, 8.0], Some(1), 30.0), &mut events);
        if events.iter().any(|event| matches!(event, Event::SailLost { .. })) {
            break;
        }
    }
    assert!(events.contains(&Event::SailLost { ship: CAPTAIN, sail: 1 }), "{events:?}");
    let vessel = fight.vessel(CAPTAIN).unwrap();
    assert!(vessel.damage.sail <= (max_sail * vessel.rigging.standing()).floor(), "its drive loses its share");
    let mut events = Vec::new();
    for _ in 0..40 {
        fight.strike(&hit(CAPTAIN, Zone::Rig, [60.0, 0.0, 8.0], Some(0), 30.0), &mut events);
        if events.iter().any(|event| matches!(event, Event::SailLost { sail: 0, .. })) {
            break;
        }
    }
    fight.strike(&hit(CAPTAIN, Zone::Rig, [60.0, 0.0, 8.0], Some(0), 30.0), &mut events);
    assert!(events.contains(&Event::MastFell { ship: CAPTAIN, mast: masts_of(HullKind::Sloop)[0] }), "{events:?}");
    assert!(
        events.iter().any(|event| matches!(event, Event::Hit { part: Part::Rig, .. })),
        "a bare spar's hit is its rig"
    );
    let target = crate::laying::Sighted::of(CAPTAIN, fight.vessel(CAPTAIN).unwrap()).target();
    assert!(target.up.iter().all(|up| !up), "a ball passes where its fallen mast stood");
}

#[test]
fn a_players_ship_goes_down_at_none_and_is_no_ones_enemy_as_it_does() {
    let mut fight = alongside();
    let mut events = Vec::new();
    fight.ships.get_mut(&PLAYER).unwrap().damage.hull = 1.0;
    fight.strike(&hit(PLAYER, Zone::Hull, [0.0, 0.0, 1.5], None, 5.0), &mut events);
    assert!(events.contains(&Event::State { ship: PLAYER, state: State::Sinking }));
    let stepped = run(&mut fight, (SINK_SECONDS * 60.0) as u32 + 2);
    assert!(stepped.contains(&Event::State { ship: PLAYER, state: State::Sunk }));
    assert!(fight.sightings(CAPTAIN).is_empty());
}

#[test]
fn a_wary_captain_falls_on_a_sloop_it_outguns_or_one_nearly_gone() {
    let minor = Commission { faction: PIRATES, rank: Rank::Minor };
    let elite = Commission { faction: PIRATES, rank: Rank::Elite };
    assert!(!wary_takes(minor, 1.0, 1.0), "a Minor does not outgun a sound Sloop");
    assert!(wary_takes(minor, 1.0, 0.3), "holed under GRAPPLE_HULL");
    for commission in [minor, elite] {
        let taken: Vec<bool> = (0..=20).map(|share| wary_takes(commission, 1.0, f64::from(share) / 20.0)).collect();
        assert!(
            taken.windows(2).all(|pair| pair[0] || !pair[1]),
            "the weaker it finds a Sloop, the likelier the captain falls on it"
        );
    }
    let mind = crate::captain::Captain::new(elite, 0, 0.0, crate::arms::arms_of(elite.hull()));
    let prize = crate::captain::odds::Power::player(&crate::arms::LARGE_BOAT, 0.6);
    let odds = crate::captain::odds::odds(
        &mind.power(&elite.damage()),
        &prize,
        [crate::arms::arms_of(elite.hull()), crate::arms::arms_of(HullKind::Sloop)],
    );
    assert_eq!(wary_takes(elite, 1.0, 0.6), odds >= crate::captain::WARY_ODDS, "DFO's odds of five to four");
}

#[test]
fn a_wary_captain_who_will_not_engage_breaks_off_once_out_of_reach_for_its_give_up_time() {
    let commission = Commission { faction: PIRATES, rank: Rank::Minor };
    let seed = (1..).find(|seed| crate::captain::temper_for(commission, *seed) == Temper::Wary).unwrap();
    assert!(!wary_takes(commission, 1.0, 1.0), "it will not fall on a whole Sloop");
    let mut fight = Fight::meet(at(0.0, 0.0), at(0.0, -400.0), commission, seed, &Open, 0.0);
    let early = run(&mut fight, ((CHASE_GIVE_UP_S - 5.0) * 60.0) as u32);
    assert!(!early.iter().any(|event| matches!(event, Event::Gone { .. })), "not before its give-up time");
    let late = run(&mut fight, 10 * 60);
    assert!(late.contains(&Event::Gone { ship: CAPTAIN, end: End::Gone }), "it has broken off: {:?}", fight.over());
    assert_eq!(fight.over(), Some(End::Gone), "and the fight is over for both");
}
