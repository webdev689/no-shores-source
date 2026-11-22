use super::*;
use crate::arms::Side;
use crate::fight::fitting::{Fitting, Trim};
use crate::fight::{CAPTAIN, Event, Fight, Orders, PLAYER};
use crate::guns::{SWIVEL, Shot};
use crate::ranks::Commission;
use crate::shots::ShotEvent;
use sailing::ship::{Helm, Ship};
use sailing::waters::{Spot, Waters};

struct Open;

impl Waters for Open {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: -50.0, surface: Some(0.0) }
    }
}

const STILL: Helm = Helm { steer: 0.0, climb: 0 };
const IDLE: Orders = Orders { helm: STILL, aim: None, fire: false, brace: false, load: None, boost: false };

/// A fight with its captain lying `east` metres off the player's starboard beam, the player fitted with `trim`.
fn abeam(east: f64, trim: Option<Trim>) -> Fight {
    let ship = Ship { x: 0.0, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
    let mut fight = Fight::begin(ship, Commission::default(), 3, &Open, 0.0).expect("a fight");
    if let Some(other_ship) = fight.ships.get_mut(&CAPTAIN) {
        other_ship.ship = Ship { x: east, y: 0.0, ..ship };
    }
    if let Some(trim) = trim {
        fight.fit(PLAYER, Fitting { trim, ..Fitting::default() });
    }
    fight
}

fn ball(shooter: ShipId, target: ShipId, zone: Zone) -> ShotEvent {
    ShotEvent::Hit {
        shooter,
        target,
        zone,
        point: [0.0, 0.0, 1.0],
        flight: 0.0,
        gun: SWIVEL,
        shot: Shot::Round,
        sail: None,
        rigged: false,
    }
}

fn strike(fight: &mut Fight, shooter: ShipId, target: ShipId, zone: Zone) -> Vec<Event> {
    let mut events = Vec::new();
    fight.strike(&ball(shooter, target, zone), &mut events);
    events
}

#[test]
fn from_the_deep_holes_a_hull_twice_as_hard_below_the_waterline_alone() {
    let fight = abeam(80.0, Some(Trim { holing: 2.0, ..Trim::default() }));
    assert!((fight.fitted_gun(SWIVEL, PLAYER, CAPTAIN, Zone::Holed).hull - SWIVEL.hull * 2.0).abs() < 1e-12);
    assert_eq!(fight.fitted_gun(SWIVEL, PLAYER, CAPTAIN, Zone::Hull), SWIVEL);
    assert_eq!(fight.fitted_gun(SWIVEL, CAPTAIN, PLAYER, Zone::Holed), SWIVEL, "its own hull takes as before");
}

#[test]
fn feeding_reloads_its_guns_at_once_when_its_ball_sinks_a_ship() {
    for feeding in [true, false] {
        let mut fight = abeam(80.0, Some(Trim { feeding, ..Trim::default() }));
        if let Some(own) = fight.ships.get_mut(&PLAYER) {
            own.guns.fired(Side::Port, 1.0, true);
            own.guns.fired(Side::Starboard, 1.0, true);
        }
        if let Some(captain) = fight.ships.get_mut(&CAPTAIN) {
            captain.damage.hull = 1.0;
        }
        let events = strike(&mut fight, PLAYER, CAPTAIN, Zone::Hull);
        assert!(events.iter().any(|event| matches!(event, Event::State { state: State::Sinking, .. })));
        let guns = &fight.ships[&PLAYER].guns;
        assert_eq!(guns.ready(Side::Port) && guns.ready(Side::Starboard), feeding, "feeding {feeding}");
    }
    let mut fight = abeam(80.0, Some(Trim { feeding: true, ..Trim::default() }));
    if let Some(own) = fight.ships.get_mut(&PLAYER) {
        own.guns.fired(Side::Port, 1.0, true);
    }
    strike(&mut fight, PLAYER, CAPTAIN, Zone::Hull);
    assert!(!fight.ships[&PLAYER].guns.ready(Side::Port), "a ball that sinks nothing reloads nothing");
}

#[test]
fn living_bone_mends_a_hundredth_of_its_hull_a_second_afloat_never_past_its_whole() {
    let mut fight = abeam(80.0, Some(Trim { mend: 0.01, ..Trim::default() }));
    let whole = fight.ships[&PLAYER].damage.max_hull;
    if let Some(own) = fight.ships.get_mut(&PLAYER) {
        own.damage.hull = whole * 0.5;
    }
    fight.exotics(2.0);
    assert!((fight.ships[&PLAYER].damage.hull - whole * 0.52).abs() < 1e-9);
    fight.exotics(100.0);
    assert!((fight.ships[&PLAYER].damage.hull - whole).abs() < 1e-9);
    let mut plain = abeam(80.0, None);
    if let Some(own) = plain.ships.get_mut(&PLAYER) {
        own.damage.hull = whole * 0.5;
    }
    plain.exotics(2.0);
    assert!((plain.ships[&PLAYER].damage.hull - whole * 0.5).abs() < 1e-12, "none without it");
}

#[test]
fn hard_to_kill_leaves_it_a_tenth_of_its_hull_once_a_fight() {
    let mut fight = abeam(80.0, Some(Trim { last_stand: 0.1, carpenter: 1.0, ..Trim::default() }));
    let whole = fight.ships[&PLAYER].damage.max_hull;
    if let Some(own) = fight.ships.get_mut(&PLAYER) {
        own.damage.hull = 1.0;
    }
    strike(&mut fight, CAPTAIN, PLAYER, Zone::Hull);
    assert_eq!(fight.ships[&PLAYER].damage.state, State::Afloat);
    assert!((fight.ships[&PLAYER].damage.hull - whole * 0.1).abs() < 1e-9);
    assert_eq!(
        fight.fittings[&PLAYER].patching, 0.0,
        "a ball it stood through took nothing for its Carpenter to patch"
    );
    // Refitted each tick, it keeps its stand spent.
    fight.fit(PLAYER, Fitting { trim: Trim { last_stand: 0.1, ..Trim::default() }, ..Fitting::default() });
    if let Some(own) = fight.ships.get_mut(&PLAYER) {
        own.damage.hull = 1.0;
    }
    strike(&mut fight, CAPTAIN, PLAYER, Zone::Hull);
    assert_eq!(fight.ships[&PLAYER].damage.state, State::Sinking, "only once");
}

#[test]
fn own_wind_keeps_its_way_with_torn_canvas() {
    let wind = Fitting { trim: Trim { own_wind: true, way: 1.1, ..Trim::default() }, ..Fitting::default() };
    assert!((wind.way_share(0.3) - 1.1).abs() < 1e-12);
}

#[test]
fn squall_gives_three_hundredths_more_way_a_ball_that_struck_it_for_six_seconds_to_fifteen() {
    let mut fight = abeam(80.0, Some(Trim { squall: 0.03, ..Trim::default() }));
    let way = |fight: &Fight| fight.fitting(PLAYER).expect("fitted").way_share(1.0);
    strike(&mut fight, CAPTAIN, PLAYER, Zone::Rig);
    assert!((way(&fight) - 1.03).abs() < 1e-12);
    for _ in 0..7 {
        strike(&mut fight, CAPTAIN, PLAYER, Zone::Rig);
    }
    assert!((way(&fight) - 1.15).abs() < 1e-12, "to fifteen hundredths");
    fight.clock += 5.9;
    fight.exotics(0.0);
    assert!((way(&fight) - 1.15).abs() < 1e-12);
    fight.clock += 0.1;
    fight.exotics(0.0);
    assert!((way(&fight) - 1.0).abs() < 1e-12, "gone after six seconds");
}

#[test]
fn web_slows_the_turn_of_a_ship_its_balls_strike_in_the_rigging_for_six_seconds() {
    let mut fight = abeam(80.0, Some(Trim { web: 0.3, ..Trim::default() }));
    strike(&mut fight, PLAYER, CAPTAIN, Zone::Hull);
    assert_eq!(fight.hampered(CAPTAIN), (1.0, 1.0), "a ball in its hull does not");
    strike(&mut fight, PLAYER, CAPTAIN, Zone::Rig);
    assert!((fight.hampered(CAPTAIN).1 - 0.7).abs() < 1e-12);
    // A webbed captain turns slower than the same captain free, struck in the rigging again each second.
    let mut free = abeam(25.0, Some(Trim { web: 0.3, ..Trim::default() }));
    let mut webbed = abeam(25.0, Some(Trim { web: 0.3, ..Trim::default() }));
    let (mut turned_free, mut turned_webbed) = (0.0, 0.0);
    for tick in 0..400 {
        if tick % 60 == 0 {
            strike(&mut webbed, PLAYER, CAPTAIN, Zone::Rig);
            strike(&mut free, PLAYER, CAPTAIN, Zone::Hull);
        }
        let before = [free.ships[&CAPTAIN].ship.heading, webbed.ships[&CAPTAIN].ship.heading];
        free.step(&[(PLAYER, IDLE)], &Open, &|_| [6.0, 0.0], 0.0);
        webbed.step(&[(PLAYER, IDLE)], &Open, &|_| [6.0, 0.0], 0.0);
        let turned = |was: f64, now: f64| {
            (now - was + std::f64::consts::PI).rem_euclid(std::f64::consts::TAU) - std::f64::consts::PI
        };
        turned_free = f64::max(turned_free, turned(before[0], free.ships[&CAPTAIN].ship.heading).abs());
        turned_webbed = f64::max(turned_webbed, turned(before[1], webbed.ships[&CAPTAIN].ship.heading).abs());
    }
    assert!(turned_free > 0.0, "it turns at all");
    assert!(turned_webbed < turned_free * 0.8, "its fastest turn a tick: {turned_webbed} against {turned_free}");
    fight.clock += 6.0;
    fight.exotics(0.0);
    assert_eq!(fight.hampered(CAPTAIN), (1.0, 1.0));
}

#[test]
fn snare_slows_a_foe_within_thirty_metres_of_it() {
    let near = abeam(25.0, Some(Trim { snare: 0.15, ..Trim::default() }));
    assert!((near.hampered(CAPTAIN).0 - 0.85).abs() < 1e-12);
    assert_eq!(near.hampered(PLAYER), (1.0, 1.0), "never itself");
    assert_eq!(abeam(40.0, Some(Trim { snare: 0.15, ..Trim::default() })).hampered(CAPTAIN), (1.0, 1.0));
    // A snared captain covers less ground than the same captain unsnared, under sail or, its canvas gone, at its oars.
    for canvas in [true, false] {
        let mut free = abeam(25.0, None);
        let mut snared = abeam(25.0, Some(Trim { snare: 0.15, ..Trim::default() }));
        for fight in [&mut free, &mut snared] {
            // Under way already: its sails set, or with no canvas at its oars.
            if let Some(captain) = fight.ships.get_mut(&CAPTAIN) {
                captain.ship.rung = if canvas { sailing::ship::SAILS_SET } else { 1 };
                if !canvas {
                    captain.damage.sail = 0.0;
                }
            }
        }
        let (mut went_free, mut went_snared) = (0.0, 0.0);
        for _ in 0..400 {
            // The player's ship kept 20 m off it, so it stays within the Snare's reach.
            for fight in [&mut free, &mut snared] {
                let captain = fight.ships[&CAPTAIN].ship;
                if let Some(player) = fight.ships.get_mut(&PLAYER) {
                    player.ship = Ship { x: captain.x + 20.0, y: captain.y, ..player.ship };
                }
            }
            let before = [free.ships[&CAPTAIN].ship, snared.ships[&CAPTAIN].ship];
            free.step(&[(PLAYER, IDLE)], &Open, &|_| [6.0, 0.0], 0.0);
            snared.step(&[(PLAYER, IDLE)], &Open, &|_| [6.0, 0.0], 0.0);
            let moved = |was: Ship, now: Ship| libm::hypot(now.x - was.x, now.y - was.y);
            went_free += moved(before[0], free.ships[&CAPTAIN].ship);
            went_snared += moved(before[1], snared.ships[&CAPTAIN].ship);
        }
        assert!(went_free > 1.0, "it moves at all, canvas {canvas}: {went_free}");
        assert!(went_snared < went_free * 0.95, "canvas {canvas}: {went_snared} against {went_free}");
    }
}

#[test]
fn a_ship_fitted_with_none_of_them_fights_the_same_to_the_bit() {
    let mut plain = abeam(60.0, None);
    let mut fitted = abeam(60.0, None);
    fitted
        .fit(PLAYER, Fitting { dealt: [(CAPTAIN, 1.0)].into(), taken: [(CAPTAIN, 1.0)].into(), ..Fitting::default() });
    let aim = crate::fight::Aim { bearing_deg: 90.0, range_m: 60.0, ray: None };
    let firing = Orders { aim: Some(aim), fire: true, ..IDLE };
    let mut hits = 0;
    for _ in 0..600 {
        let one = plain.step(&[(PLAYER, firing)], &Open, &|_| [6.0, 2.0], 0.0);
        let other = fitted.step(&[(PLAYER, firing)], &Open, &|_| [6.0, 2.0], 0.0);
        hits += one.iter().filter(|event| matches!(event, Event::Hit { ship: PLAYER, .. })).count();
        assert_eq!(one, other);
    }
    assert!(hits == 0, "the captain held its fire, so its balls strike it here");
    for zone in [Zone::Hull, Zone::Holed, Zone::Rig, Zone::Hull, Zone::Hull] {
        assert_eq!(strike(&mut plain, CAPTAIN, PLAYER, zone), strike(&mut fitted, CAPTAIN, PLAYER, zone));
        plain.exotics(1.0);
        fitted.exotics(1.0);
    }
    assert_eq!((plain.ships, plain.balls), (fitted.ships, fitted.balls));
}

#[test]
fn a_ball_in_the_rigging_takes_the_canvas_and_crew_perks_and_not_the_hull_ones() {
    // Canvas lost and men cut down by many balls in the player's rigging, by its trim, made whole after each.
    let tally = |trim: Trim| {
        let mut fight = abeam(80.0, Some(trim));
        let whole = (fight.ships[&PLAYER].damage.sail, fight.ships[&PLAYER].damage.crew);
        let (mut sail, mut crew) = (0.0, 0.0);
        for _ in 0..400 {
            strike(&mut fight, CAPTAIN, PLAYER, Zone::Rig);
            let damage = &mut fight.ships.get_mut(&PLAYER).expect("in").damage;
            sail += whole.0 - damage.sail;
            crew += whole.1 - damage.crew;
            (damage.sail, damage.crew) = whole;
        }
        (sail, crew)
    };
    let plain = tally(Trim::default());
    let canvas = tally(Trim { sail_taken: 0.5, ..Trim::default() });
    let hull = tally(Trim { hull_taken: 0.5, ..Trim::default() });
    let men = tally(Trim { crew_taken: 0.5, ..Trim::default() });
    assert!(plain.0 > 0.0 && plain.1 > 0.0, "rigging hits tear canvas and cut down men: {plain:?}");
    assert!(canvas.0 < plain.0 * 0.6, "canvas perks reach a rigging hit: {canvas:?} against {plain:?}");
    assert!((hull.0 - plain.0).abs() < plain.0 * 0.05, "hull perks do not: {hull:?} against {plain:?}");
    assert!(men.1 < plain.1 * 0.7, "crew perks reach it too: {men:?} against {plain:?}");
}

#[test]
fn a_ball_through_a_squall_ships_canvas_into_its_hull_fills_it_once() {
    let mut fight = abeam(80.0, Some(Trim { squall: 0.03, ..Trim::default() }));
    let way = |fight: &Fight| fight.fitting(PLAYER).expect("fitted").way_share(1.0);
    let hit = |zone: Zone, sail: Option<usize>, rigged: bool| ShotEvent::Hit {
        shooter: CAPTAIN,
        target: PLAYER,
        zone,
        point: [0.0, 0.0, 1.0],
        flight: 0.0,
        gun: SWIVEL,
        shot: Shot::Round,
        sail,
        rigged,
    };
    let mut events = Vec::new();
    // As `step_balls` tells one ball through its canvas and on into its hull.
    fight.strike(&hit(Zone::Rig, Some(0), false), &mut events);
    fight.strike(&hit(Zone::Holed, None, true), &mut events);
    assert!((way(&fight) - 1.03).abs() < 1e-12, "one ball, one squall: {}", way(&fight));
}
