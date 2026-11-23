//! A garrison foe leashed to its place in its group: it gives its target up 50 m from its place or off the room's
//! navmesh, walks back healing, heeds no one on its way but a blow, and stands idle in its place again, its group then
//! walking its beat on; a foe with no post never does. A Boss or a Miniboss that leashes goes back to its first phase,
//! its called foes falling; and a garrison foe whose search finds no one walks home as well, heeding what it sees on
//! the way. A blow on a foe walking home fills no healing meter.

use super::beat::LAG;
use super::garrison_tests::{called_by, into_its_last_phase, levelled, node, run, section, shoot, stand_player};
use super::*;
use crate::{Input, PlayerId};
use ::foes::tuning::{HOME_REACHED, LEASH};
use combat::sight::wrap;
use movement::Controls;

/// A garrison foe of the room's first group: its id, its place at its post and the way it faces there.
type Posted = (FighterId, [f64; 3], f64);

fn group(room: &Room) -> Vec<Posted> {
    let post = &room.garrison[0];
    post.standing.iter().zip(&post.members).map(|(id, &(_, _, place, facing))| (*id, place, facing)).collect()
}

pub(super) fn feet(room: &Room, id: FighterId) -> [f64; 2] {
    let body = room.foes[&id].fighter.body;
    [body.x, body.y]
}

fn flat(point: [f64; 3]) -> [f64; 2] {
    [point[0], point[1]]
}

/// A garrison foe's place in its group now, which its leash is measured from.
pub(super) fn place_of(room: &Room, id: FighterId) -> [f64; 3] {
    room.foes[&id].brain.home().unwrap().at
}

/// A point `distance` from `from` inside the section, on the navmesh (`on`) or plainly off it: the first by
/// bearing, in sixty-fourths of a turn from north.
pub(super) fn point_at(room: &Room, from: [f64; 3], distance: f64, on: bool) -> [f64; 2] {
    (0..64)
        .map(|step| f64::from(step) * TAU / 64.0)
        .map(|turn| [from[0] + libm::sin(turn) * distance, from[1] - libm::cos(turn) * distance])
        .find(|&[x, y]| {
            let near = room.nav.nearest_point([x, y, room.floor.height_at(x, y)]);
            let off_by = near.map_or(f64::INFINITY, |near| apart(flat(near), [x, y]));
            let ring = &section().ring;
            inside(ring, x, y) && distance_to_ring(ring, x, y) >= 1.0 && if on { off_by < 1e-6 } else { off_by > 3.0 }
        })
        .unwrap_or_else(|| panic!("no point {distance} m from {from:?}, on the mesh: {on}"))
}

/// Stands the player 6 m before a foe of the group and waits for every foe of it to take the player as its target.
fn provoke(room: &mut Room, player: PlayerId) {
    let posted = group(room);
    let (_, place, facing) = posted[0];
    stand_player(room, player, [place[0] + libm::sin(facing) * 6.0, place[1] - libm::cos(facing) * 6.0]);
    for _ in 0..600 {
        if posted.iter().all(|(id, _, _)| room.foes[id].brain.target() == Some(player)) {
            return;
        }
        whole(room, player);
        run(room, 1);
    }
    panic!("the group never turned on the player");
}

/// The player kept whole, so a long chase goes on.
pub(super) fn whole(room: &mut Room, player: PlayerId) {
    let fighter = &mut room.players.get_mut(&player).unwrap().fighter;
    fighter.health = fighter.health_max;
}

pub(super) fn alert(room: &Room, id: FighterId) -> u8 {
    room.foes_seen().find(|foe| foe.foe == id).unwrap().alert
}

#[test]
fn a_garrison_foe_chased_50_m_from_its_post_walks_back_healing_heeds_no_one_and_stands_idle_there_again() {
    for kind in [NodeKind::Patrol, NodeKind::Boss] {
        // At the pass: its first group's beat leaves its post along a 28 m leg, its walk on watched along it.
        // At an island's highest levels at Abyss, every foe of the group shielded, it keeps its leash as any does.
        let mut room = levelled(kind, "pass", (26, 30));
        room.set_difficulty(gear::Difficulty::Abyss);
        for id in room.garrison[0].standing.clone() {
            let found = room.foes.get_mut(&id).unwrap();
            found.shield = Some(gear::element::Shield::whole(gear::Element::Blaze, found.fighter.health_max));
        }
        let player = room.join().unwrap();
        let posted = group(&room);
        let standing = room.garrison[0].standing.clone();
        provoke(&mut room, player);
        for (id, _, _) in &posted {
            let fighter = &mut room.foes.get_mut(id).unwrap().fighter;
            fighter.health = 0.7 * fighter.health_max;
        }
        // The player runs from the group to a point well past its leash, the group on their heels.
        let far = point_at(&room, room.garrison[0].at, LEASH + 6.0, true);
        let at = |room: &Room| [room.players[&player].fighter.body.x, room.players[&player].fighter.body.y];
        let mut sequence = 0;
        while posted.iter().any(|(id, _, _)| !room.foes[id].brain.returning()) {
            sequence += 1;
            assert!(sequence < 1200, "{kind:?}: the group gave up");
            let yaw = bearing(at(&room), far);
            let running = apart(at(&room), far) > 1.0;
            let controls = Controls { forward: if running { 1.0 } else { 0.0 }, run: true, yaw, ..Controls::default() };
            let intent = combat::Intent { controls, ..combat::Intent::default() };
            room.input(player, Input { sequence, intent, seen: room.clock(), ..Input::default() }).unwrap();
            whole(&mut room, player);
            run(&mut room, 1);
            for (id, _, _) in &posted {
                let gave_up = room.foes[id].brain.returning();
                let target = room.foes[id].brain.target();
                assert!(gave_up != (target == Some(player)), "{kind:?}: fights or walks back");
                assert!(gave_up || apart(at(&room), flat(place_of(&room, *id))) <= LEASH + 0.2, "never past its leash");
                if gave_up {
                    assert_eq!(alert(&room, *id), 0, "its fight given up");
                }
            }
        }
        // On its way back it pays no heed to the player standing in its path.
        let first = posted[0].0;
        let toward = bearing(feet(&room, first), flat(place_of(&room, first)));
        let [x, y] = feet(&room, first);
        stand_player(&mut room, player, [x + libm::sin(toward) * 4.0, y - libm::cos(toward) * 4.0]);
        let mut healths = Vec::new();
        for _ in 0..60 {
            healths.push(room.foes[&first].fighter.health);
            run(&mut room, 1);
            assert!(room.foes[&first].brain.returning() && room.foes[&first].brain.target().is_none());
        }
        let to = point_at(&room, room.garrison[0].at, 80.0, false);
        stand_player(&mut room, player, to);
        while room.foes[&first].brain.returning() {
            healths.push(room.foes[&first].fighter.health);
            run(&mut room, 1);
            assert!(healths.len() < 1500, "{kind:?}: it reached its post");
        }
        let most = room.foes[&first].fighter.health_max;
        assert!(healths.windows(2).all(|pair| pair[1] >= pair[0]), "its health only rises on the way");
        let middle = healths[healths.len() / 2];
        assert!(healths[0] < middle && middle < most, "{kind:?}: healing as it goes, not at once");
        run(&mut room, 600);
        back_in_group(&mut room, &posted, kind);
        assert_eq!(room.garrison[0].standing, standing, "{kind:?}: its group's record is its own still");
        assert_eq!(room.garrison[0].cleared_at, None);
    }
}

/// Every foe of the group back in it, whole and idle and walking back no longer: a group that holds its post stands at
/// its places facing as posted, and one that walks a beat walks it on, each foe keeping to its place.
pub(super) fn back_in_group(room: &mut Room, posted: &[Posted], kind: NodeKind) {
    if room.garrison[0].beat.is_none() {
        stands_home(room, posted, kind);
        return;
    }
    for (id, _, _) in posted {
        let fighter = room.foes[id].fighter;
        assert!(!room.foes[id].brain.returning(), "{kind:?}: home");
        assert!(fighter.health == fighter.health_max && alert(room, *id) == 0, "{kind:?}: whole and idle");
    }
    let leader = posted[0].0;
    let from = feet(room, leader);
    run(room, 600);
    assert!(apart(feet(room, leader), from) > 5.0, "{kind:?}: its group walks its beat on");
    for (id, _, _) in posted {
        assert!(apart(feet(room, *id), flat(place_of(room, *id))) <= LAG, "{kind:?}: each in its place in the group");
    }
}

/// Every foe of the group home: at its place, its body and its arms facing as it was posted, whole and idle.
fn stands_home(room: &Room, posted: &[Posted], kind: NodeKind) {
    for (id, place, facing) in posted {
        let fighter = room.foes[id].fighter;
        assert!(!room.foes[id].brain.returning(), "{kind:?}: home");
        assert!(apart(feet(room, *id), flat(*place)) <= HOME_REACHED + 0.05, "{kind:?}: at its place");
        let squared = [fighter.body.facing, fighter.aim].map(|bearing| wrap(bearing - facing).abs() < 0.02);
        assert_eq!(squared, [true, true], "{kind:?}: its body and its arms face as it was posted");
        assert!(fighter.health == fighter.health_max && alert(room, *id) == 0, "{kind:?}: whole and idle");
    }
}

#[test]
fn a_garrison_foe_keeps_its_target_within_50_m_of_its_place_and_gives_it_up_past_that_or_off_the_navmesh() {
    let mut room = node(NodeKind::Patrol, "glade");
    let player = room.join().unwrap();
    provoke(&mut room, player);
    let first = group(&room)[0].0;
    let place = place_of(&room, first);
    let to = point_at(&room, place, LEASH - 2.0, true);
    stand_player(&mut room, player, to);
    run(&mut room, 2);
    assert_eq!(room.foes[&first].brain.target(), Some(player), "48 m off, it fights on");
    let to = point_at(&room, place, LEASH + 1.0, true);
    stand_player(&mut room, player, to);
    run(&mut room, 1);
    assert!(room.foes[&first].brain.returning() && room.foes[&first].brain.target().is_none(), "51 m off");

    let mut room = node(NodeKind::Patrol, "glade");
    let player = room.join().unwrap();
    provoke(&mut room, player);
    let first = group(&room)[0].0;
    let off = point_at(&room, place_of(&room, first), LEASH - 10.0, false);
    stand_player(&mut room, player, off);
    run(&mut room, 1);
    assert!(room.foes[&first].brain.returning(), "off the navmesh, 40 m off, it gives up");

    // A foe a player asked for has no post: it fights on wherever its target leads.
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().unwrap();
    let foe = room.stand_foe(foe_type(COLLECTOR).unwrap(), Major, [0.0, -4.0, 0.0], core::f64::consts::PI, None);
    run(&mut room, 60);
    assert_eq!(room.foes[&foe].brain.target(), Some(player));
    stand_player(&mut room, player, [0.0, LEASH + 10.0]);
    run(&mut room, 30);
    assert!(!room.foes[&foe].brain.returning() && room.foes[&foe].brain.target() == Some(player));
}

#[test]
fn a_blow_on_a_garrison_foe_walking_back_brings_it_back_to_the_fight() {
    let mut room = node(NodeKind::Patrol, "glade");
    let player = room.join().unwrap();
    provoke(&mut room, player);
    let first = group(&room)[0].0;
    let to = point_at(&room, place_of(&room, first), LEASH + 1.0, true);
    stand_player(&mut room, player, to);
    run(&mut room, 30);
    assert!(room.foes[&first].brain.returning());
    let [x, y] = feet(&room, first);
    stand_player(&mut room, player, [x, y + 3.0]);
    shoot(&mut room, player, first, 1.0);
    run(&mut room, 1);
    assert!(!room.foes[&first].brain.returning(), "back to the fight");
    assert_eq!((room.foes[&first].brain.target(), alert(&room, first)), (Some(player), 2));
    run(&mut room, 60);
    assert_eq!(room.foes[&first].brain.target(), Some(player), "and fights on");
}

#[test]
fn a_garrison_foe_shot_from_off_its_navmesh_as_it_walks_home_fills_no_healing_meter() {
    let mut room = node(NodeKind::Patrol, "glade");
    let player = room.join().unwrap();
    provoke(&mut room, player);
    let first = group(&room)[0].0;
    let off = point_at(&room, place_of(&room, first), LEASH - 10.0, false);
    stand_player(&mut room, player, off);
    run(&mut room, 1);
    let found = room.players.get_mut(&player).unwrap();
    (found.fighter.charges, found.fighter.meter) = (0, 0.0);
    for _ in 0..20 {
        assert!(room.foes[&first].brain.returning(), "it gives the fight up again at once");
        shoot(&mut room, player, first, 1.0);
    }
    let fighter = room.players[&player].fighter;
    assert_eq!((fighter.charges, fighter.meter), (0, 0.0), "no fight, no charge");
}

#[test]
fn a_boss_or_a_miniboss_that_leashes_goes_back_to_its_first_phase_its_called_foes_fall_and_its_next_fight_is_fresh() {
    // Its next fight's calls drop nothing, so a leash cannot be pulled again and again for them.
    for (kind, calls) in [(NodeKind::Boss, 4), (NodeKind::Dungeon, 0)] {
        let mut room = node(kind, "glade");
        let (leader, place, _) = group(&room)[0];
        into_its_last_phase(&mut room, leader);
        // Joined only now, so no foe of the node has fought them while the leader was brought to its last phase.
        let player = room.join().unwrap();
        let last = room.foes[&leader].brain.phase();
        let called = called_by(&room, leader);
        assert!(last > 1 && called.len() == calls, "{kind:?}: in phase {last}, {} called", called.len());
        assert!(
            called.iter().all(|id| !room.quests.spoilless.contains(id)),
            "{kind:?}: a first fight's calls drop loot"
        );
        provoke(&mut room, player);
        room.take_events();
        let to = point_at(&room, place, LEASH + 1.0, true);
        stand_player(&mut room, player, to);
        run(&mut room, 1);
        let slain: Vec<FighterId> = room.take_events().iter().map(|event| event.defender).collect();
        let brain = &room.foes[&leader].brain;
        assert!(brain.returning() && brain.phase() == 1, "{kind:?}: its first phase as its leash begins");
        assert!(called.iter().all(|id| room.foes[id].fighter.dead() && slain.contains(id)), "its called foes fall");
        let fresh = ::foes::spawn(brain.foe_type, brain.rank, 0.0, 0.0, 0.0).1;
        assert_eq!((brain.numbers(), brain.might()), (fresh.numbers(), fresh.might()), "its first phase's numbers");
        let away = point_at(&room, place, 80.0, false);
        stand_player(&mut room, player, away);
        run(&mut room, 1200);
        assert!(!room.foes[&leader].brain.returning() && room.foes[&leader].brain.phase() == 1, "{kind:?}: home");
        assert_eq!(room.foes[&leader].fighter.might, fresh.might(), "it strikes as in its first phase");
        into_its_last_phase(&mut room, leader);
        assert_eq!(room.foes[&leader].brain.phase(), last, "{kind:?}: every phase comes again");
        let again = called_by(&room, leader);
        assert_eq!(again.len(), calls, "{kind:?}: and every call");
        assert!(again.iter().all(|id| room.quests.spoilless.contains(id)), "{kind:?}: dropping nothing");
    }
}

/// A patrol's first group, hurt and led 20 m from its post by a player who then leaves: its foes lose them and search.
fn searching() -> (Room, Vec<Posted>) {
    let mut room = node(NodeKind::Patrol, "glade");
    let player = room.join().unwrap();
    provoke(&mut room, player);
    let posted = group(&room);
    for (id, _, _) in &posted {
        let fighter = &mut room.foes.get_mut(id).unwrap().fighter;
        fighter.health = 0.7 * fighter.health_max;
    }
    let out = point_at(&room, room.garrison[0].at, 20.0, true);
    stand_player(&mut room, player, out);
    for _ in 0..180 {
        whole(&mut room, player);
        run(&mut room, 1);
    }
    room.leave(player);
    (room, posted)
}

#[test]
fn a_garrison_foe_whose_search_finds_no_one_walks_home_healing_and_stands_idle_there() {
    let (mut room, posted) = searching();
    let first = posted[0].0;
    let place = place_of(&room, first);
    let (mut searched, mut healths, mut farthest) = (false, Vec::new(), 0.0_f64);
    for _ in 0..2400 {
        run(&mut room, 1);
        searched |= alert(&room, first) == 3;
        if room.foes[&first].brain.returning() {
            assert!(searched, "it searched first");
            healths.push(room.foes[&first].fighter.health);
            farthest = farthest.max(apart(feet(&room, first), flat(place)));
        }
        if !healths.is_empty() && posted.iter().all(|(id, _, _)| !room.foes[id].brain.returning()) {
            break;
        }
    }
    assert!(farthest > 10.0, "it walked home from where it searched: {farthest} m");
    assert!(healths.windows(2).all(|pair| pair[1] >= pair[0]) && healths[0] < healths[healths.len() / 2]);
    run(&mut room, 300);
    back_in_group(&mut room, &posted, NodeKind::Patrol);
}

#[test]
fn a_garrison_foe_turning_home_sheds_its_expose_and_the_immunity_after_a_charge() {
    let (mut room, posted) = searching();
    let (first, _, _) = posted[0];
    let fighter = &mut room.foes.get_mut(&first).unwrap().fighter;
    fighter.statuses.held[combat::Status::Expose as usize].ticks = 100_000;
    fighter.statuses.charge_immune = 100_000;
    for _ in 0..2400 {
        if room.foes[&first].brain.returning() {
            break;
        }
        run(&mut room, 1);
    }
    assert!(room.foes[&first].brain.returning(), "on its way home");
    run(&mut room, 1);
    let statuses = room.foes[&first].fighter.statuses;
    assert!(!statuses.has(combat::Status::Expose) && statuses.charge_immune == 0, "{statuses:?}");
}

#[test]
fn a_garrison_foe_walking_home_from_its_search_takes_a_player_it_sees_on_the_way() {
    let (mut room, posted) = searching();
    let first = posted[0].0;
    let place = place_of(&room, first);
    for _ in 0..2400 {
        if room.foes[&first].brain.returning() && apart(feet(&room, first), flat(place)) > 6.0 {
            break;
        }
        run(&mut room, 1);
    }
    assert!(room.foes[&first].brain.returning(), "on its way home");
    let player = room.join().unwrap();
    let toward = bearing(feet(&room, first), flat(place));
    let [x, y] = feet(&room, first);
    stand_player(&mut room, player, [x + libm::sin(toward) * 5.0, y - libm::cos(toward) * 5.0]);
    run(&mut room, 60);
    assert_eq!(room.foes[&first].brain.target(), Some(player), "it sees them and turns on them");
    assert!(!room.foes[&first].brain.returning());
}
