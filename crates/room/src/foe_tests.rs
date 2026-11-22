use super::*;
use crate::power::PLAYER_HARM;
use combat::fighter::Action;
use combat::shapes::{Shape, Telegraph, TelegraphOrder};
use combat::{Blow, BlowKind, CombatInput, Intent, Stroke, Verdict};
use core::f64::consts::{FRAC_PI_2, PI};
use movement::Controls;

fn room() -> Room {
    Room::new(Vec::new(), (0.0, 0.0))
}

const SWORDSMAN: u8 = 14;
const BRUTE: u8 = 15;
const SKIRMISHER: u8 = 13;

/// An ask for a Major of the type numbered `number`.
fn major(number: u8) -> Option<SpawnAsk> {
    Some(SpawnAsk::Foe { foe_type: number, rank: 2, shield: 0 })
}

const CLEAR: Option<SpawnAsk> = Some(SpawnAsk::Clear);

/// A player's input looking north, seeing the room as it stands, asking for a foe or not.
fn asking(room: &Room, sequence: u32, spawn: Option<SpawnAsk>, controls: Controls) -> Input {
    let arms = combat::arms_of("sword_iron", "", true).code();
    let intent = Intent { controls, combat: CombatInput::default() };
    Input { sequence, intent, arms, seen: room.clock(), spawn, ..Input::default() }
}

/// Runs the room `ticks` ticks with a player standing still, from input `first`; gives every event.
fn stand_still(room: &mut Room, player: PlayerId, first: u32, ticks: u32) -> Vec<Event> {
    let mut events = Vec::new();
    for sequence in first..first + ticks {
        let input = asking(room, sequence, None, Controls::default());
        room.input(player, input).unwrap();
        room.tick();
        events.extend(room.take_events());
    }
    events
}

#[test]
fn a_player_asks_for_foes_that_stand_before_them_and_sends_them_all_away() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    room.input(player, asking(&room, 1, major(SWORDSMAN), Controls::default())).unwrap();
    room.tick();
    let spawned: Vec<FoeSeen> = room.foes_seen().collect();
    assert_eq!(spawned.len(), 1);
    let foe = spawned[0];
    assert_eq!((foe.kind, foe.foe_type, foe.rank, foe.faction, foe.phase), (2, SWORDSMAN, 2, 2, 1));
    // The player looks north, though their body, never walked, faces south: the foe stands 5 m north, facing them.
    assert!((foe.fighter.body.y + 5.0).abs() < 0.5 && foe.fighter.body.x.abs() < 0.5, "{:?}", foe.fighter.body);
    assert!((foe.fighter.body.facing - PI).abs() < 1e-9, "it faces the player");
    assert!(room.take_events().iter().any(|event| event.kind == EventKind::Spawned && event.defender == foe.foe));
    room.input(player, asking(&room, 2, CLEAR, Controls::default())).unwrap();
    room.tick();
    let east = Controls { yaw: FRAC_PI_2, ..Controls::default() };
    room.input(player, asking(&room, 3, major(SWORDSMAN), east)).unwrap();
    room.tick();
    let foe = room.foes_seen().next().unwrap();
    assert!((foe.fighter.body.x - 5.0).abs() < 0.5 && foe.fighter.body.y.abs() < 0.5, "{:?}", foe.fighter.body);
    for sequence in 4..=22 {
        room.input(player, asking(&room, sequence, major(BRUTE), Controls::default())).unwrap();
        room.tick();
    }
    assert_eq!(room.foes_seen().count(), FOES_MOST, "never more than the most");
    room.input(player, asking(&room, 23, CLEAR, Controls::default())).unwrap();
    room.tick();
    assert_eq!(room.foes_seen().count(), 0);
}

#[test]
fn a_foe_fights_a_player_who_stands_still_until_they_fall_and_they_stand_again() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    room.input(player, asking(&room, 1, major(SWORDSMAN), Controls::default())).unwrap();
    room.tick();
    let foe = room.foes_seen().next().unwrap().foe;
    let events = stand_still(&mut room, player, 2, 60 * 60);
    let hits: Vec<&Event> =
        events.iter().filter(|event| event.kind == EventKind::Hit && event.striker == foe).collect();
    assert!(hits.len() >= 4, "the swordsman walks in and strikes: {} hits", hits.len());
    assert!(events.iter().any(|event| event.kind == EventKind::Killed && event.defender == player));
    assert!(events.iter().any(|event| event.kind == EventKind::Respawned && event.defender == player));
}

#[test]
fn a_telegraphed_blow_found_by_no_one_overreaches_its_foe_and_one_on_a_player_waits_for_their_view() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    room.input(player, asking(&room, 1, major(BRUTE), Controls::default())).unwrap();
    room.tick();
    let foe = room.foes_seen().next().unwrap().foe;
    let brute = *room.fighter(foe).unwrap();
    let far = TelegraphOrder { shape: Shape::Slam, windup: 54, iron: true, feint_at: None, bearing: 0.0, ahead: 0.0 };
    room.telegraph_lands(foe, &brute, &Telegraph::begin(&far, [40.0, 40.0, 0.0]));
    assert!(matches!(room.fighter(foe).unwrap().action, Action::Overreach { .. }));
    // A slam on the player's own feet waits for their view, then knocks them down.
    let on_them = Telegraph::begin(&TelegraphOrder { bearing: 0.0, ..far }, [0.0, 1.0, 0.0]);
    room.telegraph_lands(foe, &brute, &on_them);
    assert_eq!(room.pending.len(), 1);
    let events = stand_still(&mut room, player, 2, 2);
    assert!(room.pending.is_empty());
    assert!(events.iter().any(|event| event.kind == EventKind::Hit && event.how == Some(How::Iron)));
}

#[test]
fn the_same_inputs_play_the_same_fight() {
    let play = || {
        let mut room = room();
        let player = room.join().expect("a room with space");
        for number in [13, SWORDSMAN, 16] {
            let sequence = room.players[&player].received + 1;
            room.input(player, asking(&room, sequence, major(number), Controls::default())).unwrap();
            room.tick();
        }
        stand_still(&mut room, player, 4, 600);
        room.fighters()
    };
    assert_eq!(play(), play());
}

/// A player who stands still among five brutes, kept whole; `dominating`, they land a blow on one brute after another
/// ten times a second, each brute kept whole too. Answers the most brutes holding a turn at the player at once, and
/// how many on average, over the fight's last ten seconds; and the heat it ends at.
fn turns_at(dominating: bool) -> (usize, f64, f64) {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let brutes: Vec<FighterId> = (0..5_u32)
        .map(|index| {
            let bearing = (f64::from(index) * 30.0 - 60.0).to_radians();
            let (x, y) = (6.0 * libm::sin(bearing), -6.0 * libm::cos(bearing));
            let brute = ::foes::foe_type(15).expect("the pirates' brute");
            let (fighter, brain) =
                ::foes::spawn(brute, ::foes::Rank::Major, x, y, combat::sight::bearing([x, y], [0.0, 0.0]));
            let id = room.next_id();
            room.foes
                .insert(id, Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
            id
        })
        .collect();
    let (mut most, mut total) = (0, 0);
    for sequence in 1..=1500_u32 {
        room.input(player, asking(&room, sequence, None, Controls::default())).unwrap();
        room.tick();
        if dominating && sequence.is_multiple_of(6) {
            let brute = brutes[(sequence / 6) as usize % brutes.len()];
            let blow = Blow {
                striker: player,
                kind: BlowKind::Swing(Stroke::Down),
                from: [0.0, 0.0],
                damage: 25.0,
                poise: 0.0,
                guard: 0.0,
                parryable: true,
                blockable: true,
                knocks_down: false,
                through: 1.0,
                stagger: 1.0,
                element: 0,
                crit: false,
            };
            room.settle(&blow, How::Swing, brute, Verdict::Hit { damage: 25.0, poise: 0.0 }, None);
            room.foes.get_mut(&brute).unwrap().fighter.health = room.foes[&brute].fighter.health_max;
        }
        let whole = room.players[&player].fighter.health_max;
        room.players.get_mut(&player).unwrap().fighter.health = whole;
        if sequence > 900 {
            let (melee, _) = room.board.tokens_out(player);
            most = most.max(melee);
            total += melee;
        }
    }
    (most, total as f64 / 600.0, room.director.heat)
}

#[test]
fn a_dominating_player_meets_more_foes_in_their_turn_at_once_than_one_being_beaten() {
    let (dominating, beaten) = (turns_at(true), turns_at(false));
    assert!(dominating.2 >= 0.6 && beaten.2 < 0.25, "hot against cold: {dominating:?} against {beaten:?}");
    assert!(dominating.0 >= 3, "three brutes at once on the dominating player: {dominating:?}");
    assert!(dominating.1 > beaten.1, "more in their turn than on the beaten player: {dominating:?} {beaten:?}");
}

#[test]
fn the_same_inputs_give_the_same_heat_to_the_bit() {
    let heat = || turns_at(true).2.to_bits();
    assert_eq!(heat(), heat());
}

#[test]
fn the_room_answers_the_firing_spots_near_a_point_on_its_course() {
    use ::foes::Spots;
    let wall = Block { min_x: -4.0, min_y: -3.0, max_x: 4.0, max_y: -2.5, top: 3.0, bottom: 0.0 };
    let room = Room::new(vec![wall], (0.0, 6.0));
    let (centre, radius) = ([0.0, -1.0, 0.0], 3.0);
    let spots = room.spots().near(centre, radius);
    for spot in &spots {
        let (east, south) = (spot.point[0] - centre[0], spot.point[1] - centre[1]);
        assert!(east * east + south * south <= radius * radius, "{spot:?} is within {radius} m");
    }
    let beside: Vec<_> = spots.iter().filter(|spot| spot.point[1] > -2.5 && spot.point[1] < -0.5).collect();
    assert!(!beside.is_empty(), "spots just south of the wall: {spots:?}");
    assert!(beside.iter().all(|spot| spot.cover & 1 != 0), "covered from the north: {beside:?}");
    assert_eq!(spots, room.spots().near(centre, radius), "the same spots in the same order");
}

#[test]
fn a_crossbowman_fights_from_behind_the_room_s_cover() {
    const CROSSBOWMAN: u8 = 3;
    let wall = Block { min_x: -6.0, min_y: -13.5, max_x: -2.0, max_y: -13.0, top: 2.5, bottom: 0.0 };
    let mut room = Room::new(vec![wall], (0.0, 0.0));
    let player = room.join().expect("a room with space");
    room.input(player, asking(&room, 1, major(CROSSBOWMAN), Controls::default())).unwrap();
    room.tick();
    let foe = room.foes_seen().next().unwrap().foe;
    let (mut hidden, mut watched) = (0, 0);
    for sequence in 2..1200 {
        room.input(player, asking(&room, sequence, None, Controls::default())).unwrap();
        room.tick();
        let (crossbowman, them) = (*room.fighter(foe).unwrap(), *room.fighter(player).unwrap());
        // Its bolts fell the player who stands for them; then the fight is over and it goes to search where they fell.
        if them.dead() {
            break;
        }
        if sequence > 400 {
            assert!(
                (crossbowman.body.y + 14.7).abs() < 1.0 && crossbowman.body.x < 0.0,
                "by the wall: {:?}",
                crossbowman.body
            );
            hidden +=
                usize::from(!combat::sight::clear_line(&room.blocks, &room.floor, crossbowman.chest(), them.chest()));
            watched += 1;
        }
    }
    assert!(watched >= 400, "a fight long enough to watch: {watched} ticks");
    assert!(hidden > watched / 3, "and out of the player's sight behind it much of the time: {hidden} of {watched}");
}

/// A pirate swordsman put straight into the room at (x, y), facing `facing`.
fn put(room: &mut Room, x: f64, y: f64, facing: f64) -> FighterId {
    let (fighter, brain) =
        ::foes::spawn(::foes::foe_type(SWORDSMAN).expect("a type"), ::foes::Rank::Major, x, y, facing);
    let id = room.next_id();
    room.foes.insert(id, Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
    id
}

#[test]
fn the_room_sends_how_alert_each_foe_is_as_it_notices_hunts_searches_and_lets_go() {
    let wall = Block { min_x: 20.0, min_y: -40.0, max_x: 21.0, max_y: 40.0, top: 4.0, bottom: 0.0 };
    let mut room = Room::new(vec![wall], (0.0, 0.0));
    let player = room.join().expect("a room with space");
    room.input(player, asking(&room, 1, major(SWORDSMAN), Controls::default())).unwrap();
    room.tick();
    let mut states: Vec<u8> = Vec::new();
    for sequence in 2..=900 {
        if sequence == 60 {
            // The player slips behind the wall, out of the foe's sight.
            room.players.get_mut(&player).unwrap().fighter.body.x = 40.0;
        }
        room.input(player, asking(&room, sequence, None, Controls::default())).unwrap();
        room.tick();
        let alert = room.foes_seen().next().unwrap().alert;
        if states.last() != Some(&alert) {
            states.push(alert);
        }
    }
    assert_eq!(states, [1, 2, 3, 1, 0], "suspicious, alert, searching, letting go, idle");
}

#[test]
fn a_players_gunshot_alerts_a_foe_across_the_room_whose_shout_wakes_its_ally() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let near = put(&mut room, 0.0, 15.0, PI);
    let ally = put(&mut room, 0.0, 25.0, PI);
    let far = put(&mut room, 0.0, 40.0, PI);
    // A player holds only what their gear puts in their hands.
    crate::power::hold(&mut room, player, gear::Kind::Pistolet);
    let pistolet = combat::Arms { ranged: Some(combat::Ranged::Pistolet), ..combat::arms::BARE_HANDS }.code();
    let shoot = Intent { combat: CombatInput { shoot: true, ..CombatInput::default() }, ..Intent::default() };
    room.input(player, Input { sequence: 1, intent: shoot, arms: pistolet, seen: 0, ..Input::default() }).unwrap();
    let alerts =
        |room: &Room| [near, ally, far].map(|foe| room.foes_seen().find(|seen| seen.foe == foe).unwrap().alert);
    room.tick();
    room.tick();
    assert_eq!(alerts(&room), [3, 1, 0], "15 m off it searches where the shot was; 25 m off it is stirred");
    room.tick();
    assert_eq!(alerts(&room), [3, 3, 0], "its shout wakes the ally 10 m off, not one 25 m off");
}

#[test]
fn a_bosss_crew_comes_alert_to_the_foe_it_fights() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let (fighter, brain) = ::foes::spawn(::foes::foe_type(12).expect("the Boss"), ::foes::Rank::Boss, 0.0, -2.5, PI);
    let boss = room.next_id();
    room.foes.insert(boss, Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
    for sequence in 1..=400 {
        if sequence == 30 {
            let found = room.foes.get_mut(&boss).unwrap();
            found.fighter.health = 0.3 * found.fighter.health_max;
        }
        room.input(player, asking(&room, sequence, None, Controls::default())).unwrap();
        room.tick();
        let whole = room.players[&player].fighter.health_max;
        room.players.get_mut(&player).unwrap().fighter.health = whole;
        if room.foes.len() > 1 {
            room.input(player, asking(&room, sequence + 1, None, Controls::default())).unwrap();
            room.tick();
            let crew: Vec<u8> = room.foes_seen().filter(|seen| seen.foe != boss).map(|seen| seen.alert).collect();
            assert!(
                crew.len() == 2 && crew.iter().all(|alert| *alert >= 2),
                "alert from their first thought: {crew:?}"
            );
            return;
        }
    }
    panic!("the Boss called no crew");
}

#[test]
fn a_foe_sent_behind_a_wall_rounds_its_corner_rather_than_stick_there() {
    // A long wall, the place behind it, and two starts that left a foe pressed against one of its corners.
    let wall = Block { min_x: -10.0, min_y: -6.0, max_x: 10.0, max_y: -5.5, top: 2.5, bottom: 0.0 };
    let place = [0.0, 3.0, 0.0];
    for start in [[8.0, -6.5, 0.0], [-9.5, -9.0, 0.0]] {
        let mut room = Room::new(vec![wall], (place[0], place[1]));
        let start = room.nav.nearest_point(start).expect("the start is on the mesh");
        let (fighter, mut brain) =
            ::foes::spawn(::foes::foe_type(BRUTE).unwrap(), ::foes::Rank::Major, start[0], start[1], PI);
        let id = room.next_id();
        ::foes::notice(&mut brain, id, &::foes::Seen::Shouted { from: start, at: place }, 0);
        room.foes.insert(id, Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
        let reached = (0..60 * 30).any(|_| {
            room.tick();
            let body = room.foes[&id].fighter.body;
            combat::sight::apart([body.x, body.y], [place[0], place[1]]) < 1.6
        });
        assert!(reached, "from {start:?} it stuck at {:?}", room.foes[&id].fighter.body);
    }
}

#[test]
fn a_foe_walks_on_off_its_navmesh_to_a_player_standing_past_its_edge_and_strikes_them() {
    // The room's navmesh reaches 30 m round its spawn; the player stands 3 m past its eastern edge.
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    room.players.get_mut(&player).unwrap().fighter.body.x = 33.0;
    let (fighter, brain) =
        ::foes::spawn(::foes::foe_type(SWORDSMAN).unwrap(), ::foes::Rank::Minor, 22.0, 0.0, FRAC_PI_2);
    let foe = room.next_id();
    room.foes.insert(foe, Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
    let (mut closest, mut struck) = (f64::MAX, false);
    for sequence in 1..=600 {
        let input = asking(&room, sequence, None, Controls { yaw: -FRAC_PI_2, ..Controls::default() });
        room.input(player, input).unwrap();
        room.tick();
        struck |= room.take_events().iter().any(|event| event.striker == foe && event.defender == player);
        let whole = room.players[&player].fighter.health_max;
        room.players.get_mut(&player).unwrap().fighter.health = whole;
        let (me, them) = (room.players[&player].fighter.body, room.foes[&foe].fighter.body);
        closest = closest.min(combat::sight::apart([me.x, me.y], [them.x, them.y]));
    }
    assert!(closest < 2.0 && struck, "it came no nearer than {closest} m, and struck: {struck}");
}

#[test]
fn a_foe_sent_to_a_place_atop_a_wall_it_cannot_climb_goes_round_to_its_foot_rather_than_into_its_end() {
    // Its foe last seen standing on the wall, just over its northern face; the foe off the wall's eastern end.
    let wall = Block { min_x: -8.0, min_y: -0.5, max_x: 8.0, max_y: 0.5, top: 2.5, bottom: 0.0 };
    let place = [0.0, -0.4, 2.5];
    let mut room = Room::new(vec![wall], (0.0, 30.0));
    let start = room.nav.nearest_point([14.0, 0.0, 0.0]).expect("the start is on the mesh");
    let (fighter, mut brain) =
        ::foes::spawn(::foes::foe_type(BRUTE).unwrap(), ::foes::Rank::Major, start[0], start[1], -FRAC_PI_2);
    let id = room.next_id();
    ::foes::notice(&mut brain, id, &::foes::Seen::Shouted { from: start, at: place }, 0);
    room.foes.insert(id, Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
    let reached = (0..60 * 20).any(|_| {
        room.tick();
        let body = room.foes[&id].fighter.body;
        combat::sight::apart([body.x, body.y], [place[0], place[1]]) < 1.4
    });
    assert!(reached, "it stuck at {:?}", room.foes[&id].fighter.body);
}

#[test]
fn a_telegraphed_blow_a_leaving_player_ends_still_tells_its_foe_whether_it_landed() {
    let mut room = room();
    let (stays, leaves) = (room.join().expect("a room"), room.join().expect("with space"));
    let enforcer = ::foes::foe_type(4).expect("the Enforcer");
    let (fighter, brain) = ::foes::spawn(enforcer, ::foes::Rank::Elite, 0.0, -2.5, PI);
    let foe = room.next_id();
    room.foes.insert(foe, Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
    // The one who stays sees each tick at once; the one who leaves lags, so the blow waits on them alone.
    let waits_on_leaver = |room: &Room| {
        room.groups.values().any(|group| group.foe == foe && group.found && group.waiting == 1)
            && room.pending.iter().any(|pending| pending.defender == leaves)
    };
    for sequence in 1..=1800 {
        room.input(stays, asking(&room, sequence, None, Controls::default())).unwrap();
        room.tick();
        for player in [stays, leaves] {
            let whole = room.players[&player].fighter.health_max;
            room.players.get_mut(&player).unwrap().fighter.health = whole;
        }
        if waits_on_leaver(&room) {
            room.leave(leaves);
            // Told at the next tick, it acts on the word at its thought after.
            for next in 1..=2 {
                room.input(stays, asking(&room, sequence + next, None, Controls::default())).unwrap();
                room.tick();
            }
            let found = &room.foes[&foe];
            let told = found.brain.plan() == ::foes::brain::Plan::Recover
                || matches!(found.fighter.action, Action::Telegraph(_));
            assert!(told, "told its blow landed, it chains or its turn is spent at once");
            return;
        }
    }
    panic!("no telegraphed blow waited on the leaving player");
}

/// How many times the bearings turn back the way they came, ignoring steps under a hundredth of a radian.
fn turns_back(bearings: &[f64]) -> usize {
    let steps = bearings.windows(2).map(|pair| combat::sight::wrap(pair[1] - pair[0])).filter(|step| step.abs() > 0.01);
    let signs: Vec<f64> = steps.map(f64::signum).collect();
    signs.windows(2).filter(|pair| pair[0] != pair[1]).count()
}

#[test]
fn a_foe_walled_off_by_a_guard_that_turns_with_it_steps_round_one_way_rather_than_shake() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let minor = Some(SpawnAsk::Foe { foe_type: SWORDSMAN, rank: 1, shield: 0 });
    room.input(player, asking(&room, 1, minor, Controls::default())).unwrap();
    room.tick();
    let foe = room.foes_seen().next().unwrap().foe;
    let (mut aims, mut round) = (Vec::new(), Vec::new());
    for sequence in 2..=1200 {
        // The player's guard is up and their look follows the foe, as a soft lock does.
        let (me, them) = (room.players[&player].fighter.body, room.foes[&foe].fighter.body);
        let yaw = combat::sight::bearing([me.x, me.y], [them.x, them.y]);
        let mut input = asking(&room, sequence, None, Controls { yaw, ..Controls::default() });
        input.intent.combat.guard = true;
        room.input(player, input).unwrap();
        room.tick();
        aims.push(room.foes[&foe].fighter.aim);
        round.push(yaw);
    }
    let shakes = aims.windows(61).map(turns_back).max().unwrap_or(0);
    assert!(shakes <= 4, "its aim turned back and forth {shakes} times in a second");
    let most = round.windows(61).map(|second| combat::sight::wrap(second[60] - second[0]).abs()).fold(0.0, f64::max);
    assert!(most > 1.0, "it never stepped round the guard: at most {most} radians in a second");
}

#[test]
fn a_foe_backing_off_from_a_target_that_follows_it_walks_out_rather_than_shake() {
    for (number, pace) in [(SWORDSMAN, 0.3), (SWORDSMAN, 0.2), (SKIRMISHER, 0.3), (SKIRMISHER, 0.2), (BRUTE, 0.3)] {
        let mut room = room();
        let player = room.join().expect("a room with space");
        room.input(player, asking(&room, 1, major(number), Controls::default())).unwrap();
        room.tick();
        let foe = room.foes_seen().next().unwrap().foe;
        let mut sequence = 2;
        while !matches!(room.foes[&foe].fighter.action, Action::Attack(_)) {
            room.input(player, asking(&room, sequence, None, Controls::default())).unwrap();
            room.tick();
            sequence += 1;
        }
        let whole = room.foes[&foe].fighter.health_max;
        // Hurt as it swings, it backs off; the player follows it at a slow walk, 3 m back, looking at it.
        room.foes.get_mut(&foe).unwrap().fighter.health -= 0.3 * whole;
        let mut aims = Vec::new();
        for _ in 0..300 {
            let (me, them) = (room.players[&player].fighter.body, room.foes[&foe].fighter.body);
            let yaw = combat::sight::bearing([me.x, me.y], [them.x, them.y]);
            let forward = if combat::sight::apart([me.x, me.y], [them.x, them.y]) > 3.0 { pace } else { 0.0 };
            let input = asking(&room, sequence, None, Controls { forward, yaw, ..Controls::default() });
            room.input(player, input).unwrap();
            room.tick();
            sequence += 1;
            let whole = room.players[&player].fighter.health_max;
            room.players.get_mut(&player).unwrap().fighter.health = whole;
            aims.push(room.foes[&foe].fighter.aim);
        }
        let shakes = aims.windows(61).map(turns_back).max().unwrap_or(0);
        assert!(shakes <= 4, "type {number} at {pace}: its aim turned back and forth {shakes} times in a second");
    }
}

#[test]
fn a_shooter_caught_by_a_target_that_follows_it_fights_close_a_while_rather_than_shake() {
    const CROSSBOWMAN: u8 = 3;
    for pace in [0.2, 0.25, 0.3, 0.4] {
        let mut room = room();
        let player = room.join().expect("a room with space");
        room.input(player, asking(&room, 1, major(CROSSBOWMAN), Controls::default())).unwrap();
        room.tick();
        let foe = room.foes_seen().next().unwrap().foe;
        // As sturdy again as a player strikes hard, so the chase lasts the ten seconds watched.
        let sturdy = &mut room.foes.get_mut(&foe).unwrap().fighter;
        (sturdy.health, sturdy.health_max) = (sturdy.health * PLAYER_HARM, sturdy.health_max * PLAYER_HARM);
        let mut aims = Vec::new();
        // The player walks after it, looking at it, and swings at it within reach, till it falls.
        for sequence in 2..=1500 {
            let Some(them) = room.foes.get(&foe).filter(|found| !found.fighter.dead()).map(|found| found.fighter.body)
            else {
                break;
            };
            let me = room.players[&player].fighter.body;
            let yaw = combat::sight::bearing([me.x, me.y], [them.x, them.y]);
            let apart = combat::sight::apart([me.x, me.y], [them.x, them.y]);
            let forward = if apart > 1.6 { pace } else { 0.0 };
            let mut input = asking(&room, sequence, None, Controls { forward, yaw, ..Controls::default() });
            input.intent.combat.attack = (apart < 2.0 && sequence % 90 == 0).then_some(Stroke::Down);
            room.input(player, input).unwrap();
            room.tick();
            let whole = room.players[&player].fighter.health_max;
            room.players.get_mut(&player).unwrap().fighter.health = whole;
            aims.extend(room.foes.get(&foe).map(|found| found.fighter.aim));
        }
        assert!(aims.len() > 600, "at {pace}: the fight lasts");
        let shakes = aims.windows(61).map(turns_back).max().unwrap_or(0);
        assert!(shakes <= 4, "at {pace}: its aim turned back and forth {shakes} times in a second");
    }
}

#[test]
fn a_ward_beside_a_running_player_keeps_no_noise_it_never_thinks_about() {
    let mut room = room();
    let player = room.join().unwrap();
    let swordsman = ::foes::foe_type(SWORDSMAN).unwrap();
    let ward = room.stand_foe(swordsman, ::foes::Rank::Major, [0.0, -4.0, 0.0], 0.0, None);
    room.quests.wards.insert(ward);
    for sequence in 1..=600 {
        // The player runs a ring about the ward, every step a noise.
        let controls = Controls { forward: 1.0, run: true, yaw: f64::from(sequence) * 0.05, ..Controls::default() };
        room.input(player, asking(&room, sequence, None, controls)).unwrap();
        room.tick();
    }
    // At most what it was told this tick, before its next (empty) thought.
    let heard = format!("{:?}", room.foes[&ward].brain).matches("Heard(").count();
    assert!(heard <= 1, "{heard} noises kept");
}
