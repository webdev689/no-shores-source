use super::*;
use crate::garrison::garrison_tests::node;
use crate::{How, NodeKind, PlayerId, standing_on};
use combat::Verdict;
use combat::judge::{Blow, BlowKind};
use movement::Terrain;

/// A player joined and stood at `at`.
fn player_at(room: &mut Room, at: [f64; 2]) -> PlayerId {
    let player = room.join().expect("a player joins");
    room.players.get_mut(&player).unwrap().fighter.body = standing_on(&room.floor, &[], at[0], at[1]);
    player
}

/// A point of the room's navmesh `far` from `at`, 30 m or more from every spawn: round the compass from north.
fn on_mesh(room: &Room, at: [f64; 3], far: f64) -> [f64; 2] {
    (0..16)
        .map(|turn| f64::from(turn) * core::f64::consts::TAU / 16.0)
        .map(|way| [at[0] + libm::sin(way) * far, at[1] - libm::cos(way) * far])
        .find(|&[x, y]| {
            let ground = [x, y, room.floor.height_at(x, y)];
            let held = room.nav.nearest_point(ground).is_some_and(|near| apart([near[0], near[1]], [x, y]) < 0.5);
            held && room.spawn_points.iter().all(|&(sx, sy)| apart([x, y], [sx, sy]) >= 30.0)
        })
        .expect("the mesh holds a point that far")
}

/// A patrol's first group, brought by airship, and a player standing 20 m from it on the mesh, away from the landing.
fn brought() -> (Room, PlayerId, Vec<FighterId>) {
    let mut room = node(NodeKind::Patrol, "glade");
    let foes = room.garrison[0].standing.clone();
    let at = on_mesh(&room, room.garrison[0].at, 20.0);
    let player = player_at(&mut room, at);
    room.by_airship(&foes);
    (room, player, foes)
}

fn blow(striker: FighterId) -> Blow {
    Blow {
        striker,
        kind: BlowKind::Spell(1),
        from: [0.0, 0.0],
        damage: 30.0,
        poise: 10.0,
        guard: 0.0,
        parryable: true,
        blockable: true,
        knocks_down: false,
        through: 1.0,
        stagger: 1.0,
        element: 0,
        crit: false,
    }
}

fn run(room: &mut Room, ticks: u64) {
    for _ in 0..ticks {
        room.tick();
    }
}

/// Runs the room until its clock reads `tick`.
fn run_to(room: &mut Room, tick: u64) {
    while room.clock < tick {
        room.tick();
    }
}

#[test]
fn an_airship_flies_in_lets_its_foes_down_in_turn_each_built_and_flies_on() {
    let (room, _, foes) = brought();
    let ship = room.arrivals_seen()[0];
    let began = room.clock;
    assert_eq!((ship.kind, ship.began, ship.hangs, ship.high), (Bringer::Airship, began, began + FLY_IN, HANGS_HIGH));
    for (turn, foe) in foes.iter().enumerate() {
        let arrival = room.arrival_of(*foe).expect("arriving");
        let drops = ship.hangs + SETTLE + LET_DOWN_GAP * turn as u64;
        assert_eq!(arrival, FoeArrival { kind: Bringer::Airship, from: ship.id, drops, lands: drops + TITHE_BUILD });
    }
    let last = room.arrival_of(*foes.last().unwrap()).unwrap().lands;
    assert_eq!((ship.leaves, ship.gone), (last + LINGER, last + LINGER + FLY_OUT));
    // It hangs over the middle of where its foes stand, and comes in toward the player.
    let feet: Vec<[f64; 3]> = foes.iter().map(|id| room.foes[id].fighter.body).map(|b| [b.x, b.y, b.z]).collect();
    let middle = [0, 1, 2].map(|axis| feet.iter().map(|at| at[axis]).sum::<f64>() / feet.len() as f64);
    assert_eq!(ship.at, middle);
    let player = room.players.values().next().unwrap().fighter.body;
    let toward = bearing([ship.at[0], ship.at[1]], [player.x, player.y]);
    assert!(combat::sight::wrap(ship.heading - toward).abs() <= SWING + 1e-9, "{} toward {toward}", ship.heading);
}

#[test]
fn a_foe_arriving_is_seen_by_no_one_and_touched_by_nothing_until_it_lands() {
    let (mut room, player, foes) = brought();
    let foe = foes[0];
    assert!(room.fighters().iter().all(|(id, _)| !foes.contains(id)), "no foe sees one arriving, nor a blow finds it");
    assert!(room.foes_seen().any(|seen| seen.foe == foe && seen.arrival.is_some()), "the page sees it come");
    let health = room.foes[&foe].fighter.health;
    room.settle(&blow(player), How::Swing, foe, Verdict::Hit { damage: 30.0, poise: 10.0 }, None);
    assert_eq!(room.foes[&foe].fighter.health.to_bits(), health.to_bits(), "a blow on it does nothing");
    let lands = room.arrival_of(foe).unwrap().lands;
    run_to(&mut room, lands);
    assert!(room.arrival_of(foe).is_none() && room.fighters().iter().any(|(id, _)| *id == foe), "landed");
    room.settle(&blow(player), How::Swing, foe, Verdict::Hit { damage: 30.0, poise: 10.0 }, None);
    assert!(room.foes[&foe].fighter.health < health, "once landed, it is struck as any foe");
}

#[test]
fn a_foe_arriving_neither_thinks_nor_steps_and_takes_up_its_hunt_afresh_as_it_lands() {
    let (mut room, player, foes) = brought();
    let foe = foes[0];
    let clock = room.clock;
    let was = room.players[&player].fighter.body;
    room.foes.get_mut(&foe).unwrap().brain.hunt(player, [was.x, was.y, was.z], clock);
    let stood = room.foes[&foe].fighter.body;
    let lands = room.arrival_of(foe).unwrap().lands;
    run_to(&mut room, lands - 1);
    let body = room.foes[&foe].fighter.body;
    assert_eq!([body.x, body.y].map(f64::to_bits), [stood.x, stood.y].map(f64::to_bits), "it waits where it stood");
    run(&mut room, 1);
    assert!(room.arrival_of(foe).is_none());
    assert_eq!(room.foes[&foe].brain.fights(), Some(player), "landed, it hunts the player it came for");
    run(&mut room, 60);
    let moved = room.foes[&foe].fighter.body;
    assert!(apart([moved.x, moved.y], [stood.x, stood.y]) > 0.5, "and goes for them");
}

#[test]
fn what_brought_foes_is_gone_once_it_has_flown_off_and_a_ship_coming_over_another_s_ground_hangs_higher_later() {
    let (mut room, _, foes) = brought();
    let first = room.arrivals_seen()[0];
    // A second ship to the same ground: its foes the same group's, stood again for the test.
    let more: Vec<FighterId> = room.garrison[1].standing.clone();
    for id in &more {
        let to = room.foes[&foes[0]].fighter.body;
        room.foes.get_mut(id).unwrap().fighter.body = to;
    }
    room.by_airship(&more);
    let second = room.arrivals_seen()[1];
    assert_eq!((second.began, second.high), (first.began + SECOND_SHIP_LAG, HANGS_HIGH + HIGHER_EACH));
    run_to(&mut room, first.gone);
    assert_eq!(room.arrivals_seen().len(), 1, "the first is gone");
    run_to(&mut room, second.gone);
    assert!(room.arrivals_seen().is_empty() && room.arrivals.foes.is_empty());
}

#[test]
fn a_ship_carries_six_and_the_rest_go_in_a_second() {
    let mut room = node(NodeKind::Patrol, "glade");
    let foes: Vec<FighterId> = room.garrison.iter().flat_map(|post| post.standing.clone()).take(8).collect();
    assert_eq!(foes.len(), 8, "the fixture's garrison holds eight");
    room.by_airship(&foes);
    let froms: Vec<u32> = foes.iter().map(|id| room.arrival_of(*id).unwrap().from).collect();
    assert_eq!(froms, [vec![1; SHIP_MOST], vec![2; 8 - SHIP_MOST]].concat());
}

#[test]
fn no_airship_flies_where_no_sky_is_and_its_foes_stand_as_stood() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let _ = room.join();
    let foe = crate::arts::arts_tests::stand_foe(&mut room, 3.0, 0.0, 100.0);
    room.by_airship(&[foe]);
    assert!(room.arrivals_seen().is_empty() && room.arrival_of(foe).is_none(), "a course has no sky to fly");
}

#[test]
fn a_crown_forms_its_foes_form_under_it_in_turn_and_it_breaks() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let foes: Vec<FighterId> =
        (0..3).map(|nth| crate::arts::arts_tests::stand_foe(&mut room, 3.0 + f64::from(nth), 0.0, 100.0)).collect();
    room.under_crown(&foes);
    let crown = room.arrivals_seen()[0];
    assert_eq!((crown.kind, crown.hangs), (Bringer::Crown, crown.began + CROWN_FORMS));
    for (turn, foe) in foes.iter().enumerate() {
        let drops = crown.hangs + CROWN_GAP * turn as u64;
        assert_eq!(
            room.arrival_of(*foe).unwrap(),
            FoeArrival { kind: Bringer::Crown, from: crown.id, drops, lands: drops + LATTICE_BUILD }
        );
    }
    let last = crown.hangs + CROWN_GAP * 2 + LATTICE_BUILD;
    assert_eq!((crown.leaves, crown.gone), (last + CROWN_HOLDS, last + CROWN_HOLDS + CROWN_BREAKS));
    assert!((crown.at[0] - 4.0).abs() < 1e-9, "over their middle");
}

#[test]
fn a_called_foe_is_built_where_it_stands() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let foe = crate::arts::arts_tests::stand_foe(&mut room, 3.0, 0.0, 100.0);
    room.as_called(foe);
    let arrival = room.arrival_of(foe).unwrap();
    assert_eq!((arrival.kind, arrival.from, arrival.drops, arrival.lands), (Bringer::Called, 0, 0, CALLED_BUILD));
    assert!(room.arrivals_seen().is_empty(), "nothing brings it");
    run(&mut room, CALLED_BUILD);
    assert!(room.arrival_of(foe).is_none());
}
