use super::*;
use crate::{FOES_MOST, Floor, FoeSeen, Input, NODE_FOES_MOST, PlayerId, SpawnAsk, standing_on};
use combat::fighter::Action;
use combat::sight::wrap;
use movement::Block;
use serde_json::json;

const KINDS: [NodeKind; 4] = [NodeKind::Patrol, NodeKind::Mission, NodeKind::Dungeon, NodeKind::Boss];

/// Land rising 300 m a kilometre east and south, over 4 km square round the origin.
fn sloped() -> Floor {
    let grid = |data: Vec<f64>| {
        json!({ "width": 4, "height": 4, "left_m": -2000.0, "top_m": -2000.0, "cell_m": 1000.0,
            "first_column": 0, "first_row": 0, "data": data })
    };
    let rising: Vec<f64> = (0..16).map(|cell| f64::from(cell % 4 + cell / 4) * 300.0).collect();
    let ground = json!({ "land": grid(rising), "lake_level": vec![0.0; 16], "rivers": [], "roads": [], "towns": [],
        "coast": grid(vec![5000.0; 16]), "across": grid(vec![-50.0; 16]), "pads": [], "seed": 7 });
    Floor::Land(Box::new(serde_json::from_value(ground).unwrap()))
}

/// A section 400 m square round the origin, its two spawns near its southern edge.
pub(super) fn section() -> Section {
    Section {
        ring: vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]],
        spawns: vec![[0.0, 180.0], [15.0, 185.0]],
    }
}

pub(super) fn node(kind: NodeKind, id: &str) -> Room {
    Room::garrisoned(sloped(), Vec::new(), section(), kind, id)
}

/// Each group's foes as the seed draws them, in the order they stand.
fn drawn(kind: NodeKind, id: &str) -> Vec<Vec<(u8, Rank)>> {
    groups(kind, &mut draws_of(node_seed(id))).into_iter().map(|group| group.members).collect()
}

fn feet(foe: &FoeSeen) -> [f64; 2] {
    [foe.fighter.body.x, foe.fighter.body.y]
}

#[test]
fn each_kind_stands_its_drawn_groups_idle_on_the_ground_facing_out_and_clear_of_every_spawn() {
    let tithe_land = |members: &[(u8, Rank)], ranks: &[Rank]| {
        members.iter().all(|(number, rank)| {
            [RUNNER, COLLECTOR, CROSSBOWMAN, ENFORCER, MARKSMAN].contains(number) && ranks.contains(rank)
        })
    };
    for kind in KINDS {
        let room = node(kind, "glade");
        let groups = drawn(kind, "glade");
        assert_eq!(room.garrison.len(), groups.len(), "{kind:?}: every group drawn stands");
        let bands = |groups: &[Vec<(u8, Rank)>], ranks: &[Rank]| {
            (3..=4).contains(&groups.len())
                && groups.iter().all(|members| (2..=4).contains(&members.len()) && tithe_land(members, ranks))
        };
        match kind {
            NodeKind::Patrol => assert!(bands(&groups, &[Minor, Major]), "{groups:?}"),
            NodeKind::Mission => {
                assert_eq!(groups.last().unwrap(), &[(ENFORCER, Elite), (REEVE, Elite)]);
                assert!(bands(&groups[..groups.len() - 1], &[Minor, Major]), "{groups:?}");
            }
            NodeKind::Dungeon => {
                assert_eq!(groups[0], [(REEVE, Miniboss)], "a Reeve alone, as a Miniboss");
                assert!(bands(&groups[1..], &[Major, Elite]), "{groups:?}");
            }
            _ => {
                assert_eq!((groups.len(), groups[0][0], groups[0].len()), (1, (HIGH_ASSESSOR, Boss), 5));
                assert!(tithe_land(&groups[0][1..], &[Major]), "four Majors about him");
            }
        }
        let foes: Vec<FoeSeen> = room.foes_seen().collect();
        let stood: Vec<(u8, Rank)> =
            foes.iter().map(|foe| (foe.foe_type, Rank::ALL[usize::from(foe.rank) - 1])).collect();
        assert_eq!(stood, groups.concat(), "{kind:?}: the groups' foes in turn");
        for foe in &foes {
            let [x, y] = feet(foe);
            assert_eq!((foe.alert, foe.faction), (0, 1), "idle, of the Grey Tithe");
            assert!(reach::inside(&section().ring, x, y));
            assert!(section().spawns.iter().all(|&spawn| apart([x, y], spawn) >= SPAWN_CLEAR), "{kind:?} at {x}, {y}");
            assert_eq!(foe.fighter.body.z.to_bits(), room.floor.height_at(x, y).to_bits(), "on the sloped ground");
            assert!(room.nav.nearest_point([x, y, foe.fighter.body.z]).is_some(), "on the navmesh");
        }
        for post in &room.garrison {
            for (index, &(_, _, place, facing)) in post.members.iter().enumerate() {
                let leads =
                    index == 0 && matches!(kind, NodeKind::Dungeon | NodeKind::Boss) && post.members[0].1 >= Miniboss;
                let toward = if leads {
                    let [near_x, near_y] = respawn_point(&section(), place[0], place[1]).unwrap();
                    bearing([place[0], place[1]], [near_x, near_y])
                } else {
                    bearing([post.at[0], post.at[1]], [place[0], place[1]])
                };
                assert!(wrap(facing - toward).abs() < 0.3, "{kind:?}: faces {facing}, not {toward}");
            }
        }
    }
    assert!(node(NodeKind::Social, "glade").foes_seen().next().is_none(), "a social space holds no garrison");
}

#[test]
fn the_same_node_stands_the_same_garrison_every_time_and_another_node_its_own() {
    let stood = |id: &str| node(NodeKind::Mission, id).foes_seen().collect::<Vec<FoeSeen>>();
    assert_eq!(stood("glade"), stood("glade"));
    assert_ne!(stood("glade"), stood("meadow"));
    let dungeon = node(NodeKind::Dungeon, "glade");
    let farthest =
        |at: [f64; 3]| section().spawns.iter().map(|&spawn| apart([at[0], at[1]], spawn)).fold(f64::MAX, f64::min);
    let reeve = farthest(dungeon.garrison[0].at);
    assert!(dungeon.garrison.iter().all(|post| farthest(post.at) <= reeve + 1.0), "the Reeve at the farthest post");
}

#[test]
fn players_join_a_garrisoned_node_at_its_spawns_in_turn_whatever_numbers_its_foes_took() {
    let mut room = node(NodeKind::Mission, "glade");
    let joined: Vec<PlayerId> = (0..3).map(|_| room.join().unwrap()).collect();
    let at: Vec<[f64; 2]> =
        joined.iter().map(|id| [room.players[id].fighter.body.x, room.players[id].fighter.body.y]).collect();
    assert_eq!(at, [section().spawns[0], section().spawns[1], section().spawns[0]]);
}

/// Kills every foe of a post's group still there.
pub(super) fn clear(room: &mut Room, post: usize) {
    for id in room.garrison[post].standing.clone() {
        let Some(found) = room.foes.get_mut(&id) else { continue };
        found.fighter.health = 0.0;
        found.fighter.action = Action::Dead { elapsed: 0 };
    }
}

/// Stands a player at (x, y), looking north and asking nothing.
pub(super) fn stand_player(room: &mut Room, player: PlayerId, at: [f64; 2]) {
    let found = room.players.get_mut(&player).unwrap();
    found.fighter.body = standing_on(&room.floor, &[], at[0], at[1]);
}

pub(super) fn run(room: &mut Room, ticks: u64) {
    for _ in 0..ticks {
        room.tick();
    }
}

#[test]
fn a_cleared_group_stands_again_two_minutes_after_its_last_fell_once_no_player_is_within_40_m() {
    let mut room = node(NodeKind::Patrol, "glade");
    let player = room.join().unwrap();
    stand_player(&mut room, player, [-150.0, -150.0]);
    let before: Vec<FoeSeen> = room.foes_seen().filter(|foe| room.garrison[0].standing.contains(&foe.foe)).collect();
    clear(&mut room, 0);
    run(&mut room, 1);
    let fell = room.clock();
    assert_eq!(room.garrison[0].cleared_at, Some(fell));
    run(&mut room, STAND_AGAIN - 1);
    assert!(room.garrison[0].cleared_at.is_some(), "not before two minutes");
    let at = room.garrison[0].at;
    stand_player(&mut room, player, [at[0] + CLEAR_AROUND - 1.0, at[1]]);
    run(&mut room, 120);
    assert!(room.garrison[0].cleared_at.is_some(), "not with a player within 40 m");
    stand_player(&mut room, player, [at[0] + CLEAR_AROUND + 1.0, at[1]]);
    run(&mut room, 1);
    assert_eq!(room.garrison[0].cleared_at, None, "at once when the player stands off");
    let again: Vec<FoeSeen> = room.foes_seen().filter(|foe| room.garrison[0].standing.contains(&foe.foe)).collect();
    assert_eq!(again.len(), before.len());
    for (new, old) in again.iter().zip(&before) {
        assert!(new.foe != old.foe && new.alert == 0 && !new.fighter.dead());
        assert_eq!(
            (new.foe_type, new.rank, feet(new), new.fighter.body.facing),
            (old.foe_type, old.rank, feet(old), old.fighter.body.facing)
        );
    }
}

#[test]
fn a_node_s_room_holds_more_foes_than_a_course_s_counting_only_the_living_when_a_group_stands_again() {
    assert_eq!(Room::new(Vec::new(), (0.0, 0.0)).foes_most, FOES_MOST);
    let mut room = node(NodeKind::Patrol, "glade");
    assert_eq!((room.foes_most, FOES_MOST, NODE_FOES_MOST), (NODE_FOES_MOST, 12, 24));
    clear(&mut room, 0);
    let group = room.garrison[0].members.len();
    let far = [-150.0, -150.0, room.floor.height_at(-150.0, -150.0)];
    let mut fillers = Vec::new();
    while room.living_foes() + group <= NODE_FOES_MOST {
        fillers.push(room.stand_foe(foe_type(RUNNER).unwrap(), Minor, far, 0.0, None));
    }
    run(&mut room, STAND_AGAIN + 1);
    assert!(room.garrison[0].cleared_at.is_some(), "no room for it among the living");
    for id in fillers {
        room.foes.get_mut(&id).unwrap().fighter.action = Action::Dead { elapsed: 0 };
    }
    run(&mut room, 1);
    assert!(room.foes.len() > NODE_FOES_MOST, "the fallen still lie there, past the limit");
    assert_eq!(room.garrison[0].cleared_at, None, "but only the living are counted");
}

#[test]
fn corvane_calls_crossbowmen_behind_him_then_collectors_to_his_sides_on_the_ground() {
    let mut room = node(NodeKind::Boss, "glade");
    let corvane = room.garrison[0].standing[0];
    // Fallen foes fill the room: they never hold back his calls.
    let far = [-150.0, -150.0, room.floor.height_at(-150.0, -150.0)];
    while room.foes.len() < NODE_FOES_MOST {
        let id = room.stand_foe(foe_type(RUNNER).unwrap(), Minor, far, 0.0, None);
        room.foes.get_mut(&id).unwrap().fighter.action = Action::Dead { elapsed: 0 };
    }
    let called = |room: &Room, from: FighterId| room.foes_seen().filter(|foe| foe.foe > from).collect::<Vec<FoeSeen>>();
    let last = *room.foes.keys().last().unwrap();
    room.foes.get_mut(&corvane).unwrap().fighter.health *= 0.6;
    run(&mut room, 240);
    let boss = room.foes[&corvane].fighter;
    let summons = called(&room, last);
    assert_eq!(
        summons.iter().map(|foe| (foe.foe_type, foe.rank)).collect::<Vec<_>>(),
        [(CROSSBOWMAN, 1), (CROSSBOWMAN, 1)]
    );
    for foe in &summons {
        let [x, y] = feet(foe);
        let ahead = (x - boss.body.x) * libm::sin(boss.aim) - (y - boss.body.y) * libm::cos(boss.aim);
        assert!(
            (ahead + 3.0).abs() < 0.6 && (apart([x, y], [boss.body.x, boss.body.y]) - 3.35).abs() < 0.6,
            "behind him"
        );
        assert_eq!(foe.fighter.body.z.to_bits(), room.floor.height_at(x, y).to_bits(), "on the ground");
    }
    let last = *room.foes.keys().last().unwrap();
    room.foes.get_mut(&corvane).unwrap().fighter.health = 0.3 * room.foes[&corvane].fighter.health_max;
    run(&mut room, 240);
    let seizure = called(&room, last);
    assert_eq!(
        seizure.iter().map(|foe| (foe.foe_type, foe.rank)).collect::<Vec<_>>(),
        [(COLLECTOR, 2), (COLLECTOR, 2)]
    );
    for foe in &seizure {
        assert!((apart(feet(foe), [boss.body.x, boss.body.y]) - 1.5).abs() < 0.6, "at his sides");
    }
}

#[test]
fn a_foe_asked_for_on_a_platform_stands_on_its_top() {
    let platform = Block { min_x: -10.0, min_y: -10.0, max_x: 10.0, max_y: 10.0, top: 1.6 };
    let mut room = Room::new(vec![platform], (0.0, 0.0));
    let player = room.join().unwrap();
    room.players.get_mut(&player).unwrap().fighter.body.z = 1.6;
    let spawn = Some(SpawnAsk::Foe { foe_type: COLLECTOR, rank: 2 });
    room.input(player, Input { sequence: 1, spawn, ..Input::default() }).unwrap();
    run(&mut room, 60);
    let foe = room.foes_seen().next().unwrap();
    assert!((foe.fighter.body.z - 1.6).abs() < 1e-9, "on the platform's top, not inside it: {:?}", foe.fighter.body);
}

/// The living foes a foe called.
pub(super) fn called_by(room: &Room, caller: FighterId) -> Vec<FighterId> {
    let called = room.foes.iter().filter(|(_, found)| found.caller == Some(caller) && !found.fighter.dead());
    called.map(|(id, _)| *id).collect()
}

/// A Boss cut to a third of its health: it roars into each of its phases in turn, calling each one's foes.
pub(super) fn into_its_last_phase(room: &mut Room, boss: FighterId) {
    let found = room.foes.get_mut(&boss).unwrap();
    found.fighter.health = 0.3 * found.fighter.health_max;
    run(room, 600);
}

/// A player's ball of `damage` through a foe's chest from a step south of it, over a tick.
pub(super) fn shoot(room: &mut Room, player: PlayerId, foe: FighterId, damage: f64) {
    let body = room.foes[&foe].fighter.body;
    let from = [body.x, body.y + 1.0, body.z + combat::tuning::CHEST];
    let mut ball = combat::shots::loose(player, combat::Ranged::Pistolet, from, 0.0, 0.0, 1.0);
    ball.damage = damage;
    room.shots.push(ball);
    run(room, 1);
}

/// A player's ball through a foe's chest, too heavy for any guard; answers the tick it fell.
fn shoot_dead(room: &mut Room, player: PlayerId, foe: FighterId) -> u64 {
    shoot(room, player, foe, 1.0e6);
    assert!(room.foes[&foe].fighter.dead(), "shot dead");
    room.clock()
}

/// A Boss with `calls` foes called falls: they fall in the same tick, each told as slain, and lie their time with it.
fn falls_with_its_calls(room: &mut Room, player: PlayerId, boss: FighterId, calls: usize) {
    let called = called_by(room, boss);
    assert_eq!(called.len(), calls, "every call came");
    room.take_events();
    let fell = shoot_dead(room, player, boss);
    let slain: Vec<FighterId> = room
        .take_events()
        .iter()
        .filter(|event| event.kind == crate::EventKind::Killed && event.tick == fell)
        .map(|event| event.defender)
        .collect();
    for id in called.iter().chain([&boss]) {
        assert!(slain.contains(id), "{id} slain in the tick its Boss fell: {slain:?}");
        let fallen = room.foes[id].fighter;
        assert!(fallen.dead() && fallen.health == 0.0);
    }
    run(room, u64::from(combat::tuning::FOE_GONE));
    assert!(called.iter().chain([&boss]).all(|id| !room.foes.contains_key(id)), "gone once they have lain their time");
}

#[test]
fn a_boss_s_called_foes_fall_in_the_tick_it_falls_so_its_next_fight_s_calls_all_come() {
    for (number, calls) in [(12, 2), (HIGH_ASSESSOR, 4)] {
        let mut room = Room::new(Vec::new(), (0.0, 0.0));
        let player = room.join().unwrap();
        // Idle foes off at the far side fill the room but for the Boss and its calls.
        for index in 0..FOES_MOST - 1 - calls {
            let at = [index as f64 * 3.0 - 15.0, 25.0, 0.0];
            room.stand_foe(foe_type(RUNNER).unwrap(), Minor, at, 0.0, None);
        }
        let boss = foe_type(number).unwrap();
        let first = room.stand_foe(boss, Boss, [0.0, -20.0, 0.0], core::f64::consts::PI, None);
        into_its_last_phase(&mut room, first);
        falls_with_its_calls(&mut room, player, first, calls);
        let second = room.stand_foe(boss, Boss, [0.0, -20.0, 0.0], core::f64::consts::PI, None);
        into_its_last_phase(&mut room, second);
        assert_eq!(called_by(&room, second).len(), calls, "type {number}: its next fight's calls all come");
    }
}

#[test]
fn corvane_s_called_foes_fall_with_him_in_his_node_and_he_calls_them_all_anew_when_his_group_stands_again() {
    let mut room = node(NodeKind::Boss, "glade");
    let player = room.join().unwrap();
    let corvane = room.garrison[0].standing[0];
    into_its_last_phase(&mut room, corvane);
    falls_with_its_calls(&mut room, player, corvane, 4);
    assert_eq!(room.garrison[0].cleared_at, None, "his escort stands: his group is not cleared");
    clear(&mut room, 0);
    run(&mut room, STAND_AGAIN + 1);
    let again = room.garrison[0].standing[0];
    assert!(again != corvane && room.garrison[0].cleared_at.is_none(), "his group stood again");
    into_its_last_phase(&mut room, again);
    assert_eq!(called_by(&room, again).len(), 4);
}
