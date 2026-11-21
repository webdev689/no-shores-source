//! The Grey Tithe's raid: banners planted and three waves from the approach; Collectors plunder the stores they stand
//! at; the last wave broken with a store standing wins it, every store plundered fails it, as does its countdown; the
//! tithe-taker walks his round and leaves unless he is killed, which brings a fourth wave led by Marrow.

use super::fixture::{
    RAID_MINUTE, killed_by_a_foe, place, recovers_from_a_stagger, room_at, running, running_mut, standing, strike,
    ticks, told,
};
use super::raid::{MARROW_NAME, PLUNDER_TICKS, WAVE_GAP};
use super::seen::{BANNER, PLUNDERED, STORE};
use super::{Heroic, Phase, Play};
use crate::{Dropped, EventKind, PlayerId, Room};
use ::foes::roster::{COLLECTOR, TITHE_TAKER};
use combat::fighter::FighterId;

pub(super) fn raid(room: &Room) -> &super::raid::Raid {
    let Play::Raid(raid) = &running(room).play else { panic!("a raid") };
    raid
}

pub(super) fn taker(room: &Room) -> Option<FighterId> {
    raid(room).taker.as_ref().map(|taker| taker.foe)
}

/// A player breaks the wave standing: fells each of its foes in turn, then waits out the gap to the next.
pub(super) fn break_wave(room: &mut Room, player: PlayerId) {
    for foe in raid(room).wave_foes.clone() {
        if room.foes.get(&foe).is_some_and(|found| !found.fighter.dead()) {
            strike(room, player, foe, 1.0e7);
        }
    }
    room.tick();
    if running(room).phase == Phase::Running && raid(room).next_wave.is_some() {
        ticks(room, WAVE_GAP);
    }
}

pub(super) fn chests(room: &Room, player: PlayerId) -> Vec<u8> {
    let tier = |drop: &crate::Drop| if let Dropped::Chest { tier, .. } = drop.what { Some(tier) } else { None };
    room.drops_for(player).filter_map(tier).collect()
}

#[test]
fn breaking_three_waves_with_every_store_whole_wins_the_bonus_chest_and_the_tithe_march_out() {
    let (mut room, players) = room_at(RAID_MINUTE, 1);
    place(&mut room, players[0], [100.0, 0.0]);
    room.tick();
    let seen = room.public_seen().unwrap();
    assert_eq!((seen.kind, seen.stage, seen.stages, seen.needed), (2, 1, 3, 1000));
    assert_eq!(seen.marks.iter().filter(|mark| mark.kind == BANNER).count(), 2, "the banners planted");
    let collectors = raid(&room).collectors.len();
    assert_eq!(collectors, 2, "the first wave's Collectors make for the stores");
    let mut came = None;
    // Every wave's foes felled as they come; the tithe-taker left be, and the raid waits for him to go.
    while running(&room).phase == Phase::Running {
        came = came.or(taker(&room));
        break_wave(&mut room, players[0]);
    }
    assert!(!room.foes.contains_key(&came.expect("he came")), "he left unharmed");
    assert_eq!(running(&room).phase, Phase::Won, "the Tithe give up");
    assert_eq!(running(&room).heroic, Heroic::Missed);
    assert_eq!(chests(&room, players[0]), [2], "won, no store lost");
    assert_eq!(told(&mut room, EventKind::PublicStage).len(), 2, "the second and third waves came");
    let formed = raid(&room).formed;
    assert!(running(&room).withdrawing.iter().all(|(_, to, _)| *to == formed), "the Tithe march out");
}

#[test]
fn collectors_standing_at_the_stores_plunder_them_and_every_store_plundered_fails_the_raid() {
    let (mut room, players) = room_at(RAID_MINUTE, 1);
    place(&mut room, players[0], [0.0, 150.0]);
    room.tick();
    let collectors: Vec<FighterId> = raid(&room).collectors.keys().copied().collect();
    for (nth, foe) in collectors.iter().enumerate() {
        assert_eq!(room.foes[foe].brain.foe_type.number, COLLECTOR);
        let store = raid(&room).stores[nth].0;
        let found = room.foes.get_mut(foe).unwrap();
        (found.fighter.body.x, found.fighter.body.y) = (store[0], store[1] - 1.5);
    }
    // Each Collector at its own store, the first at the first: the store plundered is that one, by it alone.
    for (nth, foe) in collectors.iter().enumerate() {
        running_mut(&mut room).play_raid_mut().collectors.insert(*foe, nth);
    }
    let raided = 0;
    ticks(&mut room, PLUNDER_TICKS as u64 - 5);
    assert!(raid(&room).stores[raided].1 > 0.0, "not yet plundered short of twenty seconds");
    ticks(&mut room, 10);
    assert!(raid(&room).stores[raided].1 <= 0.0, "plundered in twenty seconds");
    assert!(!running(&room).bonus, "a store lost");
    assert!(!told(&mut room, EventKind::StorePlundered).is_empty());
    let marks = room.public_seen().unwrap().marks;
    assert!(marks.iter().any(|mark| mark.kind == STORE && mark.state == PLUNDERED));
    for (at, health) in &mut running_mut(&mut room).play_raid_mut().stores {
        let _ = at;
        *health = 0.0;
    }
    room.tick();
    assert_eq!(running(&room).phase, Phase::Failed);
    assert!(chests(&room, players[0]).is_empty(), "failing leaves nothing");
}

#[test]
fn its_countdown_run_out_the_raid_fails_and_the_tithe_march_back_out() {
    let (mut room, _) = room_at(RAID_MINUTE, 1);
    room.tick();
    running_mut(&mut room).ticks_left = 1;
    room.tick();
    assert_eq!(running(&room).phase, Phase::Failed);
    ticks(&mut room, 8 * 60 + 1);
    assert!(standing(&room).is_empty(), "marched out");
}

#[test]
fn the_tithe_taker_killed_on_his_round_turns_it_heroic_and_marrow_must_be_broken_for_the_best_chest() {
    let (mut room, players) = room_at(RAID_MINUTE, 1);
    place(&mut room, players[0], [100.0, 0.0]);
    room.tick();
    break_wave(&mut room, players[0]);
    let found = taker(&room).expect("the tithe-taker came with the second wave");
    assert_eq!(room.foes[&found].brain.foe_type.number, TITHE_TAKER);
    assert_eq!(running(&room).heroic, Heroic::Offered);
    let from = room.foes[&found].fighter.body;
    ticks(&mut room, 120);
    let walked = room.foes[&found].fighter.body;
    assert!((walked.x - from.x).abs() + (walked.y - from.y).abs() > 1.0, "he walks his round");
    assert!(room.foes[&found].fighter.health == room.foes[&found].fighter.health_max, "fighting no one, hit by none");
    strike(&mut room, players[0], found, 1.0e7);
    room.tick();
    assert_eq!((running(&room).heroic, running(&room).stages), (Heroic::Met, 4));
    break_wave(&mut room, players[0]);
    assert_eq!(raid(&room).wave, 3);
    assert_eq!(raid(&room).wave_foes.len(), 7, "the third wave holds an Enforcer and a Marksman more");
    break_wave(&mut room, players[0]);
    assert_eq!(raid(&room).wave, 4);
    let marrow = raid(&room).wave_foes[0];
    assert_eq!(room.foes_seen().find(|foe| foe.foe == marrow).unwrap().name, MARROW_NAME);
    break_wave(&mut room, players[0]);
    assert_eq!(running(&room).phase, Phase::Won);
    assert_eq!(chests(&room, players[0]), [4]);
}

impl super::Running {
    fn play_raid_mut(&mut self) -> &mut super::raid::Raid {
        let Play::Raid(raid) = &mut self.play else { panic!("a raid") };
        raid
    }
}

#[test]
fn a_wave_the_room_has_no_room_for_waits_and_one_killed_late_still_brings_the_third_waves_heroic_strength() {
    let (mut room, players) = room_at(RAID_MINUTE, 1);
    place(&mut room, players[0], [100.0, 0.0]);
    room.foes_most = 0;
    room.tick();
    assert_eq!((raid(&room).wave, raid(&room).wave_foes.len()), (0, 0), "no room: no wave");
    room.foes_most = 32;
    ticks(&mut room, WAVE_GAP);
    assert_eq!(raid(&room).wave, 1, "it came once there was room");
    break_wave(&mut room, players[0]);
    let found = taker(&room).expect("the tithe-taker");
    for foe in raid(&room).wave_foes.clone() {
        strike(&mut room, players[0], foe, 1.0e7);
    }
    room.tick();
    ticks(&mut room, WAVE_GAP);
    assert_eq!((raid(&room).wave, raid(&room).wave_foes.len()), (3, 5), "the third wave, plain");
    strike(&mut room, players[0], found, 1.0e7);
    room.tick();
    assert_eq!((running(&room).heroic, raid(&room).wave_foes.len()), (Heroic::Met, 7), "its heroic two came");
}

/// Saltmere's three zones' node files as the bake writes them, baked once for every test that opens them.
fn saltmeres_nodes() -> &'static [bake::NodeFile] {
    static BAKED: std::sync::OnceLock<Vec<bake::NodeFile>> = std::sync::OnceLock::new();
    BAKED.get_or_init(|| {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let read =
            |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
        let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
        let continent =
            world.continents.into_iter().find(|continent| continent.id == "continent-1").expect("continent-1");
        let edits = land::edits::parse(&read("content/world/land/continent-1.json")).expect("the edits parse");
        let builders = bake::builders(&root).expect("the builders read");
        let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
        let nodes = bake::nodes_of(&continent, edits, &city, &builders).expect("continent-1 bakes");
        nodes.into_iter().filter(|node| super::ZONES.contains(&node.id.as_str())).collect()
    })
}

/// Saltmere's three zones' rooms as their node files open them, each with both its grounds.
pub(super) fn saltmeres_rooms() -> Vec<(&'static str, Room, super::RaidGround, super::FissureGround)> {
    super::ZONES
        .into_iter()
        .map(|zone| {
            let node = saltmeres_nodes().iter().find(|node| node.id == zone).expect("the zone bakes");
            let read = node.grounds.clone().expect("its grounds");
            let (raid, fissure) = (read.raid.expect("its raid"), read.fissure.expect("its Fissure"));
            let raid = super::RaidGround {
                at: raid.at,
                radius: raid.radius,
                stores: raid.stores,
                approach: raid.approach,
                banners: raid.banners,
            };
            let fissure = super::FissureGround { at: fissure.at, radius: fissure.radius, growth: fissure.growth };
            let section = crate::Section { ring: node.ring.clone(), spawns: node.spawns.clone(), falls_kill: false };
            let blocks = node.boxes.iter().map(movement::Block::from_floats).collect();
            let floor = crate::Floor::Land(Box::new(node.ground.clone()));
            let levels = gear::world::island_levels(&node.continent);
            let mut room = Room::garrisoned(floor, blocks, section, node.kind, (zone, levels));
            let grounds = super::Grounds { fissure: Some(fissure.clone()), raid: Some(raid.clone()) };
            room.open_public(zone, grounds, None);
            (zone, room, raid, fissure)
        })
        .collect()
}

#[test]
fn on_saltmeres_real_grounds_the_raiders_come_in_and_make_for_their_home_on_the_navmesh() {
    for (zone, mut room, ground, _) in saltmeres_rooms() {
        let minute =
            (15_000..15_030).find(|minute| super::schedule(zone, *minute) == Some((super::Kind::Raid, *minute)));
        room.minute = minute.expect("a raid within half an hour");
        // A player at the far store from where the raiders come in.
        let player = room.join().expect("room for a player");
        let far = ground.stores.iter().copied().max_by(|one, two| {
            let out = |at: &[f64; 2]| combat::sight::apart(*at, ground.approach);
            out(one).total_cmp(&out(two))
        });
        let [x, y, z] = room.on_ground(far.expect("its stores"));
        let body = &mut room.players.get_mut(&player).expect("the player").fighter.body;
        (body.x, body.y, body.z) = (x, y, z);
        room.tick();
        let on_mesh = |point: [f64; 3]| {
            room.nav
                .nearest_point(point)
                .is_some_and(|near| combat::sight::apart([near[0], near[1]], [point[0], point[1]]) < 1e-6)
        };
        let home = raid(&room).home;
        assert!(combat::sight::apart([home[0], home[1]], ground.at) < 5.0, "{zone}: home is by the stores' middle");
        assert!(on_mesh(raid(&room).approach), "{zone}: the approach {:?} is on the navmesh", raid(&room).approach);
        assert!(on_mesh(home), "{zone}: the raiders' home {home:?} is on the navmesh");
        assert!(room.nav.find_path(raid(&room).approach, home).is_some(), "{zone}: a way in");
        let formed = raid(&room).formed;
        assert!(on_mesh(formed), "{zone}: where its waves form {formed:?} is on the navmesh");
        assert!(room.nav.find_path(formed, home).is_some(), "{zone}: a way in from where they form");
        let out = combat::sight::apart(ground.at, ground.formed());
        assert!(running(&room).leash >= out + 16.0 - 1e-9, "{zone}: they fight 16 m past where they form, {out} m out");
        let wave = raid(&room).wave_foes.clone();
        assert!(wave.iter().all(|id| room.foes[id].brain.target().is_some()), "{zone}: every raider hunts");
    }
}

#[test]
fn on_harder_seas_the_tithe_taker_stands_at_the_events_raised_level() {
    let (mut room, players) = room_at(RAID_MINUTE, 1);
    room.public.as_mut().unwrap().level = 5;
    room.difficulty = gear::Difficulty::Elite;
    place(&mut room, players[0], [100.0, 0.0]);
    room.tick();
    break_wave(&mut room, players[0]);
    let found = taker(&room).expect("the tithe-taker came with the second wave");
    assert_eq!(room.foes[&found].level, gear::Difficulty::Elite.raise(5));
}

#[test]
fn the_tithe_taker_killed_late_brings_the_heroic_strength_eased_for_a_small_party() {
    let (mut room, players) = room_at(RAID_MINUTE, 1);
    place(&mut room, players[0], [100.0, 0.0]);
    room.tick();
    break_wave(&mut room, players[0]);
    let found = taker(&room).expect("the tithe-taker");
    break_wave(&mut room, players[0]);
    assert_eq!(raid(&room).wave, 3);
    strike(&mut room, players[0], found, 1.0e7);
    room.tick();
    let came: Vec<u8> = raid(&room).wave_foes[5..].iter().map(|id| room.foes[id].brain.foe_type.number).collect();
    assert_eq!(came, [::foes::roster::ENFORCER, ::foes::roster::CROSSBOWMAN], "a lone player meets no Marksman");
}

#[test]
fn a_tithe_taker_the_room_has_no_room_for_with_the_second_wave_comes_once_it_has() {
    let (mut room, players) = room_at(RAID_MINUTE, 1);
    place(&mut room, players[0], [100.0, 0.0]);
    room.tick();
    room.foes_most = 5;
    break_wave(&mut room, players[0]);
    assert_eq!((raid(&room).wave, raid(&room).wave_foes.len()), (2, 5), "the second wave filled the room");
    assert!(taker(&room).is_none() && running(&room).heroic == Heroic::NotYet, "no room for him yet");
    room.foes_most = super::EVENT_FOES_MOST;
    room.tick();
    assert!(taker(&room).is_some() && running(&room).heroic == Heroic::Offered, "he comes once there is room");
}

#[test]
fn a_zone_whose_garrison_fills_its_own_places_still_stands_its_events_fullest_wave() {
    let (mut room, players) = room_at(RAID_MINUTE, 16);
    for player in &players {
        place(&mut room, *player, [100.0, 0.0]);
    }
    let husk = ::foes::foe_type(::foes::roster::HUSK).unwrap();
    for nth in 0..crate::NODE_FOES_MOST {
        room.stand_foe(husk, ::foes::Rank::Minor, [-150.0 + nth as f64 * 2.0, 150.0, 0.0], 0.0, None);
    }
    assert_eq!(room.others_most(), crate::NODE_FOES_MOST, "the garrison keeps a node's own places");
    room.tick();
    assert_eq!(raid(&room).wave_foes.len(), 5 + 3, "the first wave and its three Runners more for a full party");
    let mut running = room.public.as_mut().unwrap().running.take().unwrap();
    let member = (::foes::roster::RUNNER, ::foes::Rank::Minor);
    let more = (0..super::EVENT_ROOM)
        .map_while(|_| room.stand_event_foe(&mut running, member, ([100.0, -30.0, 0.0], 0.0), ([100.0, 0.0, 0.0], 0)))
        .count();
    assert_eq!(5 + 3 + more, super::EVENT_ROOM, "the event has every place it keeps, and no more");
}

#[test]
fn a_broken_wave_tells_the_page_how_long_until_the_next() {
    let (mut room, players) = room_at(RAID_MINUTE, 1);
    place(&mut room, players[0], [100.0, 0.0]);
    room.tick();
    assert_eq!(room.public_seen().unwrap().next_wave_ticks, 0, "a wave standing: none on its way");
    for foe in raid(&room).wave_foes.clone() {
        strike(&mut room, players[0], foe, 1.0e7);
    }
    room.tick();
    assert_eq!(room.public_seen().unwrap().next_wave_ticks, u32::try_from(WAVE_GAP).unwrap());
    ticks(&mut room, 60);
    assert_eq!(room.public_seen().unwrap().next_wave_ticks, u32::try_from(WAVE_GAP - 60).unwrap());
}

#[test]
fn a_wave_forms_out_of_sight_beyond_the_approach_and_marches_in() {
    let (mut room, players) = room_at(RAID_MINUTE, 1);
    // At the store farthest from the approach: out of a Crossbowman's reach from where its wave forms.
    place(&mut room, players[0], [100.0, 10.0]);
    room.tick();
    let middle = [super::fixture::RAID_AT[0], super::fixture::RAID_AT[1]];
    let approach = raid(&room).approach;
    let out = |room: &Room, id: &FighterId| {
        let body = room.foes[id].fighter.body;
        combat::sight::apart([body.x, body.y], middle)
    };
    let wave = raid(&room).wave_foes.clone();
    let approach_out = combat::sight::apart([approach[0], approach[1]], middle);
    assert!(wave.iter().all(|id| out(&room, id) > approach_out + 8.0), "formed beyond the approach");
    let formed: Vec<f64> = wave.iter().map(|id| out(&room, id)).collect();
    ticks(&mut room, 3 * 60);
    assert!(wave.iter().zip(&formed).all(|(id, was)| out(&room, id) < was - 5.0), "they march in");
}

#[test]
fn the_tithe_taker_keeps_his_way_from_tick_to_tick_and_lets_it_go_once_killed() {
    let (mut room, players) = room_at(RAID_MINUTE, 1);
    place(&mut room, players[0], [100.0, 0.0]);
    room.tick();
    break_wave(&mut room, players[0]);
    let found = taker(&room).expect("the tithe-taker");
    ticks(&mut room, 2);
    assert!(room.inert_ways.contains_key(&found), "his way kept for the next tick");
    strike(&mut room, players[0], found, 1.0e7);
    ticks(&mut room, 2);
    assert!(!room.inert_ways.contains_key(&found), "let go");
}

#[test]
fn the_garrison_keeps_a_nodes_own_places_beside_the_events_living_foes() {
    let (mut room, players) = room_at(RAID_MINUTE, 1);
    place(&mut room, players[0], [100.0, 0.0]);
    room.tick();
    let event = standing(&room).len();
    assert!(event > 0);
    assert_eq!(room.others_most(), crate::NODE_FOES_MOST + event, "the event's own never count against the garrison");
}

#[test]
fn the_tithe_taker_staggered_comes_out_of_it_though_the_room_moves_him_himself() {
    let (mut room, players) = room_at(RAID_MINUTE, 1);
    place(&mut room, players[0], [100.0, 0.0]);
    room.tick();
    break_wave(&mut room, players[0]);
    let found = taker(&room).expect("the tithe-taker came with the second wave");
    recovers_from_a_stagger(&mut room, found);
}

#[test]
fn the_tithe_taker_killed_by_no_player_leaves_the_heroic_task_to_them() {
    let (mut room, players) = room_at(RAID_MINUTE, 1);
    place(&mut room, players[0], [100.0, 0.0]);
    room.tick();
    break_wave(&mut room, players[0]);
    let found = taker(&room).expect("the tithe-taker came with the second wave");
    let foe = standing(&room).into_iter().find(|id| *id != found).expect("a raider standing");
    killed_by_a_foe(&mut room, found, foe);
    room.tick();
    assert_ne!(running(&room).heroic, Heroic::Met, "a foe met no task of the players'");
}

#[test]
fn failed_with_the_tithe_taker_on_his_round_he_leaves_no_mark_behind() {
    let (mut room, players) = room_at(RAID_MINUTE, 1);
    place(&mut room, players[0], [100.0, 0.0]);
    room.tick();
    break_wave(&mut room, players[0]);
    assert!(taker(&room).is_some(), "the tithe-taker came with the second wave");
    running_mut(&mut room).ticks_left = 1;
    room.tick();
    assert_eq!(running(&room).phase, Phase::Failed);
    assert!(taker(&room).is_none(), "his round is over");
    for _ in 0..super::RESULT_TICKS - 1 {
        let marks = room.public_seen().unwrap().marks;
        assert!(marks.iter().all(|mark| mark.kind != super::seen::TITHE_TAKER), "no mark of him at the approach");
        room.tick();
    }
}
