//! A patrol zone's foes hold its caverns and its runs: on Saltmere's zones as the bake makes them, each foes' site
//! stands its group the first time a player comes near it, and a player walked into a cavern or along a run meets the
//! group there.

use combat::Intent;
use layout::brief::AreaKind;
use movement::{Block, Controls};
use room::{Floor, Input, NodeKind, PlayerId, Room, Section};
use std::collections::BTreeSet;
use std::path::Path;

/// How near a player comes to a site before its group stands, as the room has it.
const SITE_NEAR_M: f64 = 150.0;

/// Continent 1's patrol zones as the bake makes them, each with its layout's runs and its caverns' middles.
fn zones() -> Vec<(bake::NodeFile, Vec<layout::runs::Run>, Vec<[f64; 2]>)> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let layout = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let continent = layout.continents.into_iter().find(|each| each.id == "continent-1").expect("the continent");
    let edits = land::edits::parse(&read("content/world/land/continent-1.json")).expect("its edits parse");
    let builders = bake::builders(&root).expect("the builders read");
    let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
    let mut landmass = land::landmass::generate(&continent, edits.clone()).expect("the continent generates");
    city::settle(&mut landmass, &city).expect("its city settles");
    let layouts = layout::settle::settle(&mut landmass, &builders.book, &builders.briefs);
    let nodes = bake::nodes_of(&continent, edits, &city, &builders).expect("the continent bakes");
    let patrols = nodes.into_iter().filter(|node| node.kind == NodeKind::Patrol);
    patrols
        .map(|node| {
            let laid = layouts.iter().find(|laid| laid.id == node.id).expect("the zone is laid");
            let caverns = laid.areas.iter().filter(|area| matches!(area.kind, AreaKind::Coven | AreaKind::Cave));
            let caverns = caverns.map(|area| area.at).collect();
            (node, laid.runs.clone(), caverns)
        })
        .collect()
}

fn apart(one: [f64; 2], two: [f64; 2]) -> f64 {
    libm::hypot(one[0] - two[0], one[1] - two[1])
}

fn feet(room: &Room, player: PlayerId) -> [f64; 2] {
    let body = room.player(player).expect("the player").fighter.body;
    [body.x, body.y]
}

/// The foes not standing before (`known`) that stand within 5 m of `site`: its group, as it stands.
fn stood_at(room: &Room, known: &BTreeSet<u32>, site: [f64; 2]) -> BTreeSet<u32> {
    let fresh = room.foes_seen().filter(|foe| !known.contains(&foe.foe));
    fresh.filter(|foe| apart([foe.fighter.body.x, foe.fighter.body.y], site) <= 5.0).map(|foe| foe.foe).collect()
}

/// Whether any foe of `group` is stirred.
fn stirred(room: &Room, group: &BTreeSet<u32>) -> bool {
    room.foes_seen().any(|foe| group.contains(&foe.foe) && foe.alert > 0)
}

/// The feet of the foe of `group` nearest the player.
fn nearest(room: &Room, group: &BTreeSet<u32>, player: PlayerId) -> Option<[f64; 2]> {
    let at = feet(room, player);
    let feet =
        room.foes_seen().filter(|foe| group.contains(&foe.foe)).map(|foe| [foe.fighter.body.x, foe.fighter.body.y]);
    feet.min_by(|one, two| apart(*one, at).total_cmp(&apart(*two, at)))
}

/// A room of the zone's, its foes sent away and only `site` named, so the group there is the one the player meets.
fn only(room: &mut Room, site: [f64; 2]) -> BTreeSet<u32> {
    room.clear_foes();
    room.set_foe_sites(&[site]);
    room.foes_seen().map(|foe| foe.foe).collect()
}

/// Walks the player a tick toward `to`, swinging at it from within 6 m if it is a foe (`foe`), so one that faces away
/// hears it even where the way up to it is barred.
fn step(room: &mut Room, player: PlayerId, to: [f64; 2], foe: bool) {
    let [x, y] = feet(room, player);
    let yaw = libm::atan2(to[0] - x, y - to[1]);
    let close = foe && apart([x, y], to) <= 6.0;
    let controls = Controls { forward: 1.0, yaw, ..Controls::default() };
    let attack = close.then_some(combat::Stroke::Down);
    let combat = combat::CombatInput { attack, ..combat::CombatInput::default() };
    let sequence = room.player(player).expect("the player").received + 1;
    let input = Input { sequence, intent: Intent { controls, combat }, seen: room.clock(), ..Input::default() };
    room.input(player, input).expect("in order");
    room.tick();
}

/// The player waits up to 10 s for `group` to come at them, then goes up to it and strikes at it; whether it was
/// stirred.
fn meets(room: &mut Room, player: PlayerId, group: &BTreeSet<u32>) -> bool {
    for tick in 0..1200 {
        if stirred(room, group) {
            return true;
        }
        match nearest(room, group, player).filter(|_| tick >= 600) {
            Some(foe) => step(room, player, foe, true),
            None => room.tick(),
        }
    }
    false
}

#[test]
fn a_player_walked_into_each_cavern_and_along_each_run_of_saltmere_meets_the_group_there() {
    let zones = zones();
    assert_eq!(zones.len(), 3, "Saltmere's three zones");
    let mut caverns_met = 0;
    for (node, runs, caverns) in &zones {
        let held = |run: &layout::runs::Run| run.beats.split_last().map_or(&[][..], |(_, held)| held).to_vec();
        let beats: Vec<[f64; 2]> = runs.iter().flat_map(|run| held(run).into_iter().map(|beat| beat.at)).collect();
        let mut named: Vec<[f64; 2]> = beats.iter().chain(caverns).copied().collect();
        let mut written = node.foes.clone();
        let order = |one: &[f64; 2], two: &[f64; 2]| one[0].total_cmp(&two[0]).then(one[1].total_cmp(&two[1]));
        named.sort_by(order);
        written.sort_by(order);
        assert_eq!(written, named, "{}: its runs' beats but their ends, and its caverns", node.id);
        let blocks = node.boxes.iter().map(Block::from_floats).collect();
        let section = Section { ring: node.ring.clone(), spawns: node.spawns.clone(), falls_kill: false };
        let levels = gear::world::island_levels(&node.continent);
        let floor = Floor::Land(Box::new(node.ground.clone()));
        let mut room = Room::garrisoned(floor, blocks, section, node.kind, (&node.id, levels));
        room.set_island(&node.continent);
        // Each cavern and run walked by a player just joined, whole whatever the last one met.
        let mut player = room.join().expect("a player joins");
        let mut fresh = |room: &mut Room| {
            room.leave(player);
            player = room.join().expect("a player joins");
            player
        };
        for &site in caverns {
            let player = fresh(&mut room);
            let known = only(&mut room, site);
            assert!(room.put_player(player, site[0], site[1] + SITE_NEAR_M + 10.0));
            room.tick();
            assert!(stood_at(&room, &known, site).is_empty(), "{}: none stands before a player is near", node.id);
            assert!(room.put_player(player, site[0], site[1] + 100.0));
            room.tick();
            room.tick();
            let group = stood_at(&room, &known, site);
            assert!(group.len() >= 2, "{}: the cavern's group stands at {site:?}", node.id);
            assert!(room.put_player(player, site[0], site[1]));
            assert!(meets(&mut room, player, &group), "{}: the cavern's group at {site:?} meets the player", node.id);
            caverns_met += 1;
        }
        for run in runs {
            // From 8 m inside its area's floor, in through its mouth and along its line, beat by beat.
            let toward = [run.line[1][0] - run.line[0][0], run.line[1][1] - run.line[0][1]];
            let length = libm::hypot(toward[0], toward[1]).max(1e-9);
            let inside = [run.mouth[0] - toward[0] / length * 8.0, run.mouth[1] - toward[1] / length * 8.0];
            let player = fresh(&mut room);
            assert!(room.put_player(player, inside[0], inside[1]));
            let held = held(run);
            let mut known = only(&mut room, held[0].at);
            let (mut next, mut beat, mut group) = (0, 0, BTreeSet::new());
            let mut met = vec![false; held.len()];
            for _ in 0..20_000 {
                let Some(&to) = run.line.get(next) else { break };
                if group.is_empty() && beat < held.len() {
                    group = stood_at(&room, &known, held[beat].at);
                }
                let there = apart(feet(&room, player), to) < 1.5;
                if !there {
                    step(&mut room, player, to, false);
                } else {
                    next += 1;
                }
                // The beat's group, which stood as the player came near it, meets them on their way in, or at its
                // middle at the latest.
                let middle = there && held.get(beat).is_some_and(|held| held.at == to);
                if group.len() >= 2 && (stirred(&room, &group) || (middle && meets(&mut room, player, &group))) {
                    met[beat] = true;
                } else if !middle {
                    continue;
                }
                (beat, group) = (beat + 1, BTreeSet::new());
                // The next beat's group alone, so the player walks on unharmed by this one's.
                if let Some(following) = held.get(beat) {
                    known = only(&mut room, following.at);
                }
            }
            assert!(met.iter().all(|met| *met), "{}: {} meets its beats' groups: {met:?}", node.id, run.name);
        }
    }
    assert!(caverns_met >= 1, "the Hollow Coven at the least");
}
