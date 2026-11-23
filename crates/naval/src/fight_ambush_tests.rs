use super::*;
use crate::ranks::{Commission, Rank};
use sailing::ship::Helm;
use sailing::waters::Spot;

/// Deep, still water everywhere.
struct Open;

impl Waters for Open {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: -50.0, surface: Some(0.0) }
    }
}

const WIND: [f64; 2] = [1.5, 0.0];
const IDLE: Orders =
    Orders { helm: Helm { steer: 0.0, climb: 0 }, aim: None, fire: false, brace: false, load: None, boost: false };

fn sloop_at(x: f64, y: f64, heading: f64) -> Ship {
    Ship { x, y, heading, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 }
}

/// The story's ambush: three Tithe Majors set round the player's Sloop, each heading for it.
fn story_ambush() -> Fight {
    let major =
        Commission::of(crate::ranks::GREY_TITHE, Rank::Major).unwrap_or_else(|| panic!("the Tithe sails Majors"));
    let captains = [
        (sloop_at(-240.0, -720.0, 0.3), major, 2),
        (sloop_at(40.0, -820.0, 3.1), major, 3),
        (sloop_at(270.0, -670.0, 5.9), major, 4),
    ];
    Fight::ambush(sloop_at(0.0, 0.0, 0.0), &captains, 1, &Open, 0.0).unwrap_or_else(|error| panic!("{error}"))
}

fn captain_ids(fight: &Fight) -> Vec<ShipId> {
    fight.ships.iter().filter(|(_, vessel)| vessel.command().is_some()).map(|(id, _)| *id).collect()
}

#[test]
fn an_ambush_left_unfought_is_never_won_her_never_sunk_and_no_captain_sails_off() {
    let mut fight = story_ambush();
    let mut events = Vec::new();
    for tick in 0..(900 * 60) {
        events.extend(fight.step(&[(PLAYER, IDLE)], &Open, &|_| WIND, f64::from(tick) * TICK_SECONDS));
    }
    let player = &fight.ships[&PLAYER];
    assert_eq!(player.damage.state, State::Afloat, "the captains' balls never sink it");
    assert!(player.damage.hull >= 1.0, "a ball or a fire leaves it a point of hull: {}", player.damage.hull);
    assert!(player.damage.hull < player.damage.max_hull * 0.5, "it was fought hard: {}", player.damage.hull);
    let told = events.iter().any(|event| matches!(event, Event::State { ship: PLAYER, .. }));
    assert!(!told, "its state never changes");
    assert!(!events.iter().any(|event| matches!(event, Event::Gone { .. })), "no captain leaves an unsunk ambush");
    assert_eq!(fight.over(), None);
    assert!(!fight.beaten(), "an ambush is won only by beating its captains");
}

#[test]
fn an_ambush_is_beaten_once_every_captain_has_struck_or_gone_down() {
    let mut fight = story_ambush();
    let ids = captain_ids(&fight);
    assert_eq!(ids.len(), 3);
    let set = |fight: &mut Fight, id: ShipId, state: State| {
        fight.ships.get_mut(&id).unwrap_or_else(|| panic!("{id}")).damage.state = state;
    };
    assert!(!fight.beaten());
    set(&mut fight, ids[0], State::Struck);
    set(&mut fight, ids[1], State::Sinking);
    assert!(!fight.beaten(), "one captain still fights");
    set(&mut fight, ids[2], State::Sunk);
    assert!(fight.beaten());
    set(&mut fight, ids[0], State::Afloat);
    assert!(!fight.beaten(), "a captain afloat again fights on");
}

#[test]
fn a_fight_that_is_no_ambush_is_never_beaten_and_its_captains_still_sail_off() {
    let mut fight = Fight::begin(sloop_at(0.0, 0.0, 0.0), Commission::default(), 5, &Open, 0.0)
        .unwrap_or_else(|error| panic!("{error}"));
    let id = captain_ids(&fight)[0];
    fight.ships.get_mut(&id).unwrap_or_else(|| panic!("{id}")).damage.state = State::Struck;
    assert!(!fight.beaten(), "only an ambush is won by its captains striking");
    // A captain afloat far from every foe leaves a fight that is no ambush; one struck lies hove to for boarders.
    let vessel = fight.ships.get_mut(&id).unwrap_or_else(|| panic!("{id}"));
    (vessel.damage.state, vessel.ship) = (State::Afloat, sloop_at(5000.0, 0.0, 0.0));
    let events = fight.step(&[(PLAYER, IDLE)], &Open, &|_| WIND, 0.0);
    assert!(events.iter().any(|event| matches!(event, Event::Gone { end: End::Gone, .. })), "{events:?}");
}

#[test]
fn an_ambushs_captain_far_off_and_struck_stays_in_it() {
    let mut fight = story_ambush();
    let id = captain_ids(&fight)[0];
    let vessel = fight.ships.get_mut(&id).unwrap_or_else(|| panic!("{id}"));
    vessel.damage.state = State::Struck;
    vessel.ship = sloop_at(5000.0, 0.0, 0.0);
    let events = fight.step(&[(PLAYER, IDLE)], &Open, &|_| WIND, 0.0);
    assert!(!events.iter().any(|event| matches!(event, Event::Gone { .. })), "{events:?}");
    assert!(fight.ships[&id].in_fight());
}
