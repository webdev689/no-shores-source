use super::*;
use crate::captain::Temper;
use crate::damage::Hurt;
use crate::ranks::Commission;
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
const IDLE: Orders =
    Orders { helm: Helm { steer: 0.0, climb: 0 }, aim: None, fire: false, brace: false, load: None, boost: false };
const SECOND: u32 = 7;
const PIRATE: ShipId = 10;

fn sloop_at(x: f64, y: f64) -> Ship {
    Ship { x, y, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 }
}

/// Two players' Sloops at `first` and `second` (x east), and a captain of `temper` at the origin heading north.
fn fleet(first: f64, second: f64, temper: Temper) -> Fight {
    let mut fight = Fight::new(3);
    fight.put_to_sea(PLAYER, sloop_at(first, 0.0), &Open, 0.0);
    fight.put_to_sea(SECOND, sloop_at(second, 0.0), &Open, 0.0);
    fight
        .call_captain(PIRATE, &sloop_at(0.0, 0.0), Commission::default(), &Open, 0.0)
        .unwrap_or_else(|error| panic!("{error}"));
    let captain = fight.ships.get_mut(&PIRATE).unwrap_or_else(|| panic!("the captain"));
    captain.ship = sloop_at(0.0, 0.0);
    if let Sailor::Captain(command) = &mut captain.sailor {
        (command.mind.temper, command.mind.cruise) = (temper, 0.0);
    }
    fight
}

fn mind(fight: &Fight) -> &Captain {
    match fight.vessel(PIRATE).map(|vessel| &vessel.sailor) {
        Some(Sailor::Captain(command)) => &command.mind,
        _ => panic!("a captain sails it"),
    }
}

fn idle_both() -> Vec<(ShipId, Orders)> {
    vec![(PLAYER, IDLE), (SECOND, IDLE)]
}

fn run(fight: &mut Fight, orders: &[(ShipId, Orders)], ticks: u32) -> Vec<Event> {
    let start = fight.clock;
    (0..ticks).flat_map(|tick| fight.step(orders, &Open, &|_| WIND, start + f64::from(tick) * TICK_SECONDS)).collect()
}

#[test]
fn a_bold_captain_takes_on_the_nearer_player() {
    let mut fight = fleet(400.0, -200.0, Temper::Bold);
    run(&mut fight, &idle_both(), 1);
    assert_eq!(mind(&fight).target(), Some(SECOND));
}

#[test]
fn it_holds_the_ship_it_fights_against_one_a_little_nearer() {
    let mut fight = fleet(300.0, -330.0, Temper::Bold);
    run(&mut fight, &idle_both(), 1);
    assert_eq!(mind(&fight).target(), Some(PLAYER));
    // The other comes a little nearer than the one it fights, but not a fifth nearer.
    fight.ships.get_mut(&SECOND).unwrap_or_else(|| panic!("second")).ship = sloop_at(-280.0, 0.0);
    run(&mut fight, &idle_both(), 1);
    assert_eq!(mind(&fight).target(), Some(PLAYER), "held");
    fight.ships.get_mut(&SECOND).unwrap_or_else(|| panic!("second")).ship = sloop_at(-150.0, 0.0);
    run(&mut fight, &idle_both(), 1);
    assert_eq!(mind(&fight).target(), Some(SECOND), "far nearer, the captain turns on it");
}

#[test]
fn both_players_balls_strike_it_and_neither_strikes_the_other() {
    let mut fight = fleet(0.0, 0.0, Temper::Wary);
    // Both players abreast of it, one each side, 50 m off, heading north: it lies on one's starboard beam and
    // the other's port beam.
    fight.ships.get_mut(&PLAYER).unwrap_or_else(|| panic!("first")).ship = sloop_at(-50.0, 0.0);
    fight.ships.get_mut(&SECOND).unwrap_or_else(|| panic!("second")).ship = sloop_at(50.0, 0.0);
    let fire =
        |bearing_deg: f64| Orders { aim: Some(Aim { bearing_deg, range_m: 50.0, ray: None }), fire: true, ..IDLE };
    let mut events = run(&mut fight, &[(PLAYER, fire(90.0)), (SECOND, fire(-90.0))], 1);
    events.extend(run(&mut fight, &idle_both(), 120));
    let struck: Vec<(ShipId, ShipId)> = events
        .iter()
        .filter_map(|event| match event {
            Event::Shot(ShotEvent::Hit { shooter, target, .. }) => Some((*shooter, *target)),
            _ => None,
        })
        .collect();
    assert!(struck.iter().any(|(shooter, _)| *shooter == PLAYER), "{struck:?}");
    assert!(struck.iter().any(|(shooter, _)| *shooter == SECOND), "{struck:?}");
    assert!(struck.iter().all(|(_, target)| *target == PIRATE), "a player's ball strikes only it: {struck:?}");
}

#[test]
fn it_is_provoked_by_the_player_who_struck_it_only() {
    let mut fight = fleet(-50.0, 600.0, Temper::Wary);
    let fire = Orders { aim: Some(Aim { bearing_deg: 90.0, range_m: 50.0, ray: None }), fire: true, ..IDLE };
    run(&mut fight, &[(PLAYER, fire), (SECOND, IDLE)], 1);
    run(&mut fight, &idle_both(), 120);
    let mind = mind(&fight);
    assert_eq!(mind.target(), Some(PLAYER), "the wary captain fights the one who struck it");
    assert!(!mind.hostile_to(SECOND));
}

#[test]
fn a_captain_leaves_only_once_past_every_players_ship() {
    let mut fight = fleet(1950.0, 600.0, Temper::Wary);
    run(&mut fight, &idle_both(), 1);
    assert_eq!(fight.over(), None, "one player is near");
    fight.ships.get_mut(&SECOND).unwrap_or_else(|| panic!("second")).ship = sloop_at(-1950.0, 0.0);
    let events = run(&mut fight, &idle_both(), 1);
    assert!(events.contains(&Event::Gone { ship: PIRATE, end: End::Gone }));
    assert_eq!(fight.over(), Some(End::Gone));
    let lay = fight.vessel(PIRATE).map(|vessel| vessel.ship);
    run(&mut fight, &idle_both(), 60);
    assert_eq!(fight.vessel(PIRATE).map(|vessel| vessel.ship), lay, "gone, it is stepped no more");
}

#[test]
fn a_player_who_leaves_is_forgotten_and_their_rival_fought() {
    let mut fight = fleet(200.0, -400.0, Temper::Bold);
    run(&mut fight, &idle_both(), 1);
    assert_eq!(mind(&fight).target(), Some(PLAYER));
    fight.leave(PLAYER);
    assert_eq!(mind(&fight).target(), None);
    run(&mut fight, &[(SECOND, IDLE)], 1);
    assert_eq!(mind(&fight).target(), Some(SECOND));
}

#[test]
fn a_hurt_ship_mends_unless_a_captain_who_would_take_it_lies_near_it() {
    let mut fight = fleet(300.0, 5000.0, Temper::Bold);
    for id in [PLAYER, SECOND] {
        let player = fight.ships.get_mut(&id).unwrap_or_else(|| panic!("{id}"));
        player.damage.apply(Hurt { hull: 200.0, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    }
    run(&mut fight, &idle_both(), 60 * 20);
    let hull = |id: ShipId| fight.vessel(id).map_or(-1.0, |vessel| vessel.damage.hull);
    assert_eq!(hull(PLAYER), 40.0, "it lies within 700 m of a bold pirate");
    assert!(hull(SECOND) > 40.0, "far off, its hands mend it");
}

#[test]
fn a_player_with_no_orders_lies_where_they_were_and_one_late_catches_up() {
    let mut fight = fleet(400.0, -400.0, Temper::Wary);
    let sail = Orders { helm: Helm { steer: 0.0, climb: 1 }, ..IDLE };
    let rowing = Orders { helm: Helm { climb: 0, ..sail.helm }, ..IDLE };
    run(&mut fight, &[(PLAYER, sail), (SECOND, sail)], 1);
    run(&mut fight, &[(PLAYER, rowing), (SECOND, rowing)], 30);
    let second_before = fight.vessel(SECOND).map(|vessel| vessel.ship);
    run(&mut fight, &[(PLAYER, rowing)], 1);
    assert_eq!(fight.vessel(SECOND).map(|vessel| vessel.ship), second_before, "no orders, no step");
    run(&mut fight, &[(PLAYER, rowing), (SECOND, rowing), (SECOND, rowing)], 1);
    let ship_of = |id: ShipId| fight.vessel(id).map(|vessel| vessel.ship);
    let (first, second) = (ship_of(PLAYER), ship_of(SECOND));
    assert_eq!(first.map(|ship| ship.y), second.map(|ship| ship.y), "two orders in a tick catch them up to the bit");
}

#[test]
fn a_captain_is_called_onto_the_ring_round_the_ship_it_is_called_to() {
    let mut fight = Fight::new(9);
    fight.put_to_sea(PLAYER, sloop_at(5000.0, -300.0), &Open, 0.0);
    fight
        .call_captain(PIRATE, &sloop_at(5000.0, -300.0), Commission::default(), &Open, 0.0)
        .unwrap_or_else(|error| panic!("{error}"));
    let off = fight.vessel(PIRATE).map_or([0.0; 2], |vessel| [vessel.ship.x - 5000.0, vessel.ship.y + 300.0]);
    assert!((SPAWN_RING[0]..=SPAWN_RING[1]).contains(&(off[0] * off[0] + off[1] * off[1]).sqrt()));
    assert_eq!(fight.over(), None, "it is in the fight");
    assert_eq!(Fight::new(9).over(), None, "a fight with no captain has not ended");
}

#[test]
fn two_captains_balls_pass_each_other_by() {
    let mut fight = fleet(0.0, 4000.0, Temper::Bold);
    fight.ships.get_mut(&PLAYER).unwrap_or_else(|| panic!("first")).ship = sloop_at(120.0, 0.0);
    fight
        .call_captain(PIRATE + 1, &sloop_at(60.0, 0.0), Commission::default(), &Open, 0.0)
        .unwrap_or_else(|error| panic!("{error}"));
    fight.ships.get_mut(&(PIRATE + 1)).unwrap_or_else(|| panic!("second captain")).ship = sloop_at(60.0, 0.0);
    let events = run(&mut fight, &idle_both(), 60 * 40);
    let struck_pirates = events.iter().any(|event| {
        matches!(event, Event::Shot(ShotEvent::Hit { target, .. }) if *target == PIRATE || *target == PIRATE + 1)
    });
    assert!(!struck_pirates, "a pirate's ball strikes no pirate");
}

#[test]
fn an_ambush_sets_every_captain_on_the_player_at_once_and_each_closes_and_fires_on_her() {
    let pirate = |x: f64, y: f64| (Ship { heading: 1.0, ..sloop_at(x, y) }, Commission::default(), 0);
    let captains = [pirate(380.0, 0.0), pirate(-300.0, 200.0), pirate(0.0, -400.0)];
    let mut fight =
        Fight::ambush(sloop_at(0.0, 0.0), &captains, 9, &Open, 0.0).unwrap_or_else(|error| panic!("{error}"));
    let ids: Vec<ShipId> = (CAPTAIN..).take(3).collect();
    for id in &ids {
        let Some(Sailor::Captain(command)) = fight.vessel(*id).map(|vessel| &vessel.sailor) else { panic!("{id}") };
        assert_eq!(command.mind.temper, Temper::Bold, "{id} comes to fight whatever its temper");
    }
    let apart = |fight: &Fight, id: ShipId| {
        let (captain, player) = (&fight.ships[&id].ship, &fight.ships[&PLAYER].ship);
        libm::hypot(captain.x - player.x, captain.y - player.y)
    };
    let first: Vec<f64> = ids.iter().map(|id| apart(&fight, *id)).collect();
    let mut fired = BTreeMap::new();
    let mut nearest = first.clone();
    for tick in 0..(240 * 60) {
        for event in fight.step(&[(PLAYER, IDLE)], &Open, &|_| WIND, f64::from(tick) * TICK_SECONDS) {
            if let Event::Shot(ShotEvent::Muzzle { shooter, .. }) = event {
                *fired.entry(shooter).or_insert(0) += 1;
            }
        }
        for (at, id) in ids.iter().enumerate() {
            nearest[at] = nearest[at].min(apart(&fight, *id));
        }
    }
    for (at, id) in ids.iter().enumerate() {
        assert!(nearest[at] < first[at] - 50.0, "{id} closed from {} only to {}", first[at], nearest[at]);
        assert!(fired.get(id).copied().unwrap_or(0) >= 1, "{id} fired on it: {fired:?}");
    }
}
