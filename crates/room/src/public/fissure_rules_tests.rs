//! The Fissure's rules one by one: its waves' timer, size and living cap, and their heroic Elites; the shards needed and
//! their cap; the reach a shard is taken and set within, one carried at a time and dropped by a carrier who leaves; the
//! growth standing in no one's way; a heroic chest without the bonus; a foe struck from afar as a part taken; and its
//! foes withdrawing into the crack at a walk.

use super::fissure::{SPIRES, Shard, WARDEN_NAME};
use super::fissure_tests::{chests, fissure, fissure_mut, lesser, seal_one};
use super::fixture::{FISSURE_AT, FISSURE_MINUTE, place, room_at, running, running_mut, standing, strike, ticks};
use super::{COUNTDOWN_TICKS, Heroic, Phase};
use crate::{PlayerId, Room};
use ::foes::Rank;
use ::foes::roster::{BULWARK, RAVAGER};
use combat::sight::apart;

/// A Fissure begun, its one player far off its ground.
fn begun() -> (Room, PlayerId) {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    place(&mut room, players[0], [0.0, 150.0]);
    room.tick();
    (room, players[0])
}

/// The foes a wave brought: forced now, as though its time had come.
fn forced_wave(room: &mut Room) -> Vec<combat::fighter::FighterId> {
    let before = running(room).foes.len();
    room.clock += 40 * 60;
    room.tick();
    running(room).foes[before..].to_vec()
}

#[test]
fn a_wave_comes_forty_seconds_after_the_last_while_three_stand_and_none_once_ten_are_living() {
    let (mut room, _) = begun();
    assert_eq!((fissure(&room).waves, lesser(&room).len()), (1, 3));
    ticks(&mut room, 40 * 60 - 10);
    assert_eq!(fissure(&room).waves, 1, "three standing: no wave before forty seconds");
    ticks(&mut room, 20);
    assert_eq!((fissure(&room).waves, lesser(&room).len()), (2, 6), "the next at forty seconds");
    ticks(&mut room, 2 * 40 * 60);
    assert_eq!((fissure(&room).waves, lesser(&room).len()), (4, 12), "nine living still brought one");
    ticks(&mut room, 2 * 40 * 60);
    assert_eq!((fissure(&room).waves, lesser(&room).len()), (4, 12), "twelve living: no more");
}

#[test]
fn a_wave_holds_one_more_for_each_player_beyond_the_first_and_six_at_most() {
    for players in 1..=7_u16 {
        let (mut room, _) = begun();
        fissure_mut(&mut room).players_most = players;
        let came = forced_wave(&mut room).len();
        assert_eq!(came, usize::from(players + 2).min(6), "{players} players");
    }
}

#[test]
fn a_heroic_fissures_waves_are_led_by_an_elite_bulwark_and_an_elite_ravager_by_turns() {
    let (mut room, _) = begun();
    running_mut(&mut room).heroic = Heroic::Met;
    let mut led = Vec::new();
    for _ in 0..4 {
        let came = forced_wave(&mut room);
        let first = &room.foes[&came[0]].brain;
        assert_eq!(first.rank, Rank::Elite, "an Elite leads it");
        let elites = came.iter().filter(|id| room.foes[*id].brain.rank == Rank::Elite).count();
        assert_eq!(elites, 1, "one Elite to a wave");
        led.push(first.foe_type.number);
        // Room for the next: this wave felled.
        for foe in came {
            let found = room.foes.get_mut(&foe).unwrap();
            (found.fighter.health, found.fighter.action) = (0.0, combat::fighter::Action::Dead { elapsed: 0 });
        }
    }
    assert_eq!(led, [BULWARK, RAVAGER, BULWARK, RAVAGER]);
}

#[test]
fn the_shards_needed_rise_six_a_player_beyond_the_first_to_forty_and_the_heroic_more_come_on_top() {
    let (mut room, _) = begun();
    for (players, needed) in [(1, 16), (2, 22), (4, 34), (5, 40), (9, 40)] {
        fissure_mut(&mut room).players_most = players;
        assert_eq!(fissure(&room).needed(), needed, "{players} players");
    }
    fissure_mut(&mut room).heroic_more = 7;
    assert_eq!(fissure(&room).needed(), 47, "the heroic turn's more past the forty");
}

/// Lays a shard where a test wants it.
fn lay_shard(room: &mut Room, id: u32, [x, y]: [f64; 2]) {
    let until = room.clock + 60 * 60;
    fissure_mut(room).shards.push(Shard { id, at: [x, y, 0.0], until });
}

#[test]
fn a_shard_is_taken_within_a_metre_and_a_half_and_set_within_six_metres_of_the_middle() {
    let (mut room, player) = begun();
    let at = [FISSURE_AT[0] + 15.0, FISSURE_AT[1]];
    lay_shard(&mut room, 900, at);
    place(&mut room, player, [at[0] + 1.51, at[1]]);
    room.tick();
    assert!(!fissure(&room).carried.contains_key(&player), "just out of reach");
    place(&mut room, player, [at[0] + 1.49, at[1]]);
    room.tick();
    assert!(fissure(&room).carried.contains_key(&player), "just within it");
    let set = fissure(&room).set;
    place(&mut room, player, [FISSURE_AT[0] + 6.01, FISSURE_AT[1]]);
    room.tick();
    assert_eq!(fissure(&room).set, set, "just off the lip");
    place(&mut room, player, [FISSURE_AT[0] + 5.99, FISSURE_AT[1]]);
    room.tick();
    assert_eq!(fissure(&room).set, set + 1, "set at the lip");
}

#[test]
fn a_carrier_takes_one_shard_at_a_time_and_one_who_leaves_drops_theirs_where_they_last_stood() {
    let (mut room, player) = begun();
    let at = [FISSURE_AT[0] + 15.0, FISSURE_AT[1]];
    lay_shard(&mut room, 900, at);
    lay_shard(&mut room, 901, [at[0] + 0.5, at[1]]);
    place(&mut room, player, at);
    ticks(&mut room, 2);
    assert!(fissure(&room).carried.contains_key(&player));
    assert_eq!(fissure(&room).shards.iter().map(|shard| shard.id).collect::<Vec<_>>(), [901], "one left lying");
    let last = [at[0] + 3.0, at[1] + 2.0];
    place(&mut room, player, last);
    room.tick();
    room.leave(player);
    room.tick();
    assert!(fissure(&room).carried.is_empty());
    let dropped = fissure(&room).shards.iter().find(|shard| shard.id != 901).expect("theirs dropped").at;
    assert_eq!([dropped[0], dropped[1]], last, "where they last stood");
}

#[test]
fn the_growth_stands_in_no_ones_way_a_body_walks_through_where_it_rose() {
    let (mut room, _) = begun();
    let blocks = room.blocks.len();
    let needed = u32::from(fissure(&room).needed());
    fissure_mut(&mut room).set = u16::try_from((needed * super::fissure::HEROIC_AT_PERCENT).div_ceil(100)).unwrap();
    room.tick();
    let growth = fissure(&room).growth.expect("the growth rose");
    assert_eq!(room.blocks.len(), blocks, "no box stands with it");
    let at = room.foes[&growth].fighter.body;
    let across = ([at.x - 3.0, at.y, at.z + 1.0], [at.x + 3.0, at.y, at.z + 1.0]);
    assert!(
        combat::sight::clear_line(&room.blocks, &room.floor, across.0, across.1),
        "nothing stops a body or a blow there"
    );
}

#[test]
fn heroic_but_sealed_late_it_pays_the_heroic_chest_without_the_bonus() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    let player = players[0];
    room.tick();
    while running(&room).heroic == Heroic::NotYet {
        seal_one(&mut room, player);
    }
    let growth = fissure(&room).growth.unwrap();
    strike(&mut room, player, growth, 1.0e6);
    room.tick();
    assert_eq!(running(&room).heroic, Heroic::Met);
    running_mut(&mut room).ticks_left = COUNTDOWN_TICKS / 2 - 10;
    let needed = fissure(&room).needed();
    fissure_mut(&mut room).set = needed - 1;
    seal_one(&mut room, player);
    let warden = fissure(&room).warden.expect("the Warden came out");
    assert_eq!(room.foes_seen().find(|foe| foe.foe == warden).unwrap().name, WARDEN_NAME);
    strike(&mut room, player, warden, 1.0e7);
    room.tick();
    assert_eq!(running(&room).phase, Phase::Won);
    assert!(!running(&room).bonus);
    assert_eq!(chests(&room, player), [3], "heroic, the bonus lost");
}

#[test]
fn the_warden_is_posted_where_it_climbs_out_clear_of_the_spires_still_standing_round_the_middle() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    let player = players[0];
    room.tick();
    while running(&room).heroic == Heroic::NotYet {
        seal_one(&mut room, player);
    }
    let growth = fissure(&room).growth.unwrap();
    strike(&mut room, player, growth, 1.0e6);
    room.tick();
    let needed = fissure(&room).needed();
    fissure_mut(&mut room).set = needed - 1;
    seal_one(&mut room, player);
    let warden = fissure(&room).warden.expect("the Warden came out");
    assert_eq!(fissure(&room).spires.len(), SPIRES.len(), "the spires stand until it falls");
    let post = room.foes[&warden].brain.home().expect("a post").at;
    let body = room.foes[&warden].fighter.body;
    assert!(apart([post[0], post[1]], [body.x, body.y]) < 0.5, "posted where it climbed out");
    // A body's width clear of every spire, so a fight round its post never wedges against one.
    let clear = |spire: &movement::Block| {
        let gap_x = (spire.min_x - post[0]).max(post[0] - spire.max_x).max(0.0);
        let gap_y = (spire.min_y - post[1]).max(post[1] - spire.max_y).max(0.0);
        (gap_x * gap_x + gap_y * gap_y).sqrt() > 2.0 * movement::TUNING.radius
    };
    assert!(fissure(&room).spires.iter().all(clear), "its post {post:?} is clear of the spires");
}

#[test]
fn a_player_who_only_struck_one_of_its_foes_from_afar_took_part_and_gets_a_chest() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 2);
    let (far, sealer) = (players[0], players[1]);
    place(&mut room, far, [0.0, 150.0]);
    room.tick();
    let foe = lesser(&room)[0];
    strike(&mut room, far, foe, 1.0);
    let needed = fissure(&room).needed();
    fissure_mut(&mut room).set = needed - 1;
    place(&mut room, far, [0.0, 150.0]);
    seal_one(&mut room, sealer);
    assert_eq!(running(&room).phase, Phase::Won);
    assert_eq!(running(&room).parts[&super::Who::Player(far)].present, 0, "never on its ground");
    assert_eq!(chests(&room, far).len(), 1, "struck one of its foes");
}

#[test]
fn failed_its_foes_walk_back_into_the_crack_at_four_metres_a_second_and_are_gone_there() {
    let (mut room, _) = begun();
    let foe = lesser(&room)[0];
    // Formed under its crown (`arrivals.rs`), it walks.
    while room.arriving(foe) {
        room.tick();
    }
    let found = room.foes.get_mut(&foe).unwrap();
    (found.fighter.body.x, found.fighter.body.y) = (FISSURE_AT[0] + 20.0, FISSURE_AT[1]);
    running_mut(&mut room).ticks_left = 1;
    room.tick();
    assert_eq!(running(&room).phase, Phase::Failed);
    let (_, to, _) = *running(&room).withdrawing.iter().find(|(id, _, _)| *id == foe).expect("it withdraws");
    let out = |room: &Room| {
        let body = room.foes[&foe].fighter.body;
        apart([body.x, body.y], [to[0], to[1]])
    };
    let mut was = out(&room);
    for second in 0..3 {
        ticks(&mut room, 60);
        let now = out(&room);
        assert!((3.6..=4.4).contains(&(was - now)), "second {second}: {} m nearer, at a walk", was - now);
        was = now;
    }
    ticks(&mut room, 3 * 60);
    assert!(!room.foes.contains_key(&foe) && !standing(&room).contains(&foe), "gone into the crack");
}

#[test]
fn on_saltmeres_real_grounds_the_fissure_opens_and_its_foes_hunt_a_player_by_its_growth() {
    for (zone, mut room, _, ground) in super::raid_tests::saltmeres_rooms() {
        let minute =
            (15_000..15_030).find(|minute| super::schedule(zone, *minute) == Some((super::Kind::Fissure, *minute)));
        room.minute = minute.expect("a Fissure within half an hour");
        let player = room.join().expect("room for a player");
        let [x, y, z] = room.on_ground(ground.growth);
        let body = &mut room.players.get_mut(&player).expect("the player").fighter.body;
        (body.x, body.y, body.z) = (x, y, z);
        let blocks = room.blocks.len();
        room.tick();
        assert_eq!(room.blocks.len(), blocks + 4, "{zone}: its spires stand");
        let foes = lesser(&room);
        assert!(foes.len() >= 3, "{zone}: its first wave poured out");
        ticks(&mut room, 60);
        for foe in foes {
            let brain = &room.foes[&foe].brain;
            assert!(!brain.returning() && brain.target() == Some(player), "{zone}: {foe} hunts the player");
        }
        let foe = lesser(&room)[0];
        strike(&mut room, player, foe, 1.0e7);
        room.tick();
        let shard = fissure(&room).shards.last().expect("a shard dropped").at;
        let near = room.nav.nearest_point(shard).expect("the navmesh");
        assert!(apart([near[0], near[1]], [shard[0], shard[1]]) < 1e-6, "{zone}: the shard lies on the navmesh");
    }
}

/// A room whose garrison's mesh, baked 35 m round a point 20 m in from its spawn, ends 2 m short of the Fissure's
/// square (its 25 m and 16 m past), a garrison foe on its own part, posted where it stands or `post_back` metres back
/// from it on that part, and the player standing at `at` on the square's part alone: how far the foe stands from the
/// player before and after three seconds.
fn garrison_beside_the_square(at: [f64; 3], post_back: f64) -> (f64, f64) {
    let section = crate::Section {
        ring: vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]],
        spawns: vec![[0.0, -42.0]],
        falls_kill: false,
    };
    let mut room = Room::node(crate::Floor::Flat, Vec::new(), section);
    room.open_public(super::fixture::ZONE, super::fixture::grounds(), None);
    // Between events: the ground's square stands joined to the room's mesh, and no event's foe is about.
    room.minute = FISSURE_MINUTE + 10;
    let player = room.join().expect("room for the player");
    room.tick();
    assert!(super::fixture::public(&room).running.is_none(), "between events");
    let home = [FISSURE_AT[0], FISSURE_AT[1] + 45.0, 0.0];
    let placed =
        |at: [f64; 3]| room.nav.nearest_point_from(home, at).map(|near| apart([near[0], near[1]], [at[0], at[1]]));
    assert!(placed(home).is_some_and(|off| off < 1e-6), "the foe stands on the garrison's part");
    let post = [home[0], home[1] + post_back, home[2]];
    assert!(placed(post).is_some_and(|off| off < 1e-6), "its post on the garrison's part");
    assert!(room.nav.nearest_point(at).is_some_and(|near| apart([near[0], near[1]], [at[0], at[1]]) < 1e-6));
    assert!(placed(at).is_none_or(|off| off > 1.0), "the player stands on the ground's part alone");
    let husk = ::foes::foe_type(::foes::roster::HUSK).expect("a husk");
    let foe = room.stand_foe(husk, Rank::Major, home, 0.0, None);
    // Posted as a garrison's foe is, so it leashes to its place.
    room.foes.get_mut(&foe).unwrap().brain.posted_at(post, 0.0);
    place(&mut room, player, [at[0], at[1]]);
    let near = |room: &Room| {
        let body = room.foes[&foe].fighter.body;
        apart([body.x, body.y], [at[0], at[1]])
    };
    let was = near(&room);
    ticks(&mut room, 3 * 60);
    (was, near(&room))
}

#[test]
fn a_garrison_foe_goes_for_a_player_close_by_on_an_event_grounds_own_square_but_not_for_one_far_off() {
    // Close, 6 m off: the owner's rule, a foe gives up only on a player far away, wherever the player stands.
    let (was, now) = garrison_beside_the_square([FISSURE_AT[0], FISSURE_AT[1] + 39.0, 0.0], 0.0);
    assert!(now < was - 0.5, "it stood {was} m from a player close by and is still {now} m off");
    // Far, 25 m off, on ground its routes do not reach from its post: it lets them be.
    let (was, now) = garrison_beside_the_square([FISSURE_AT[0], FISSURE_AT[1] + 20.0, 0.0], 0.0);
    assert!(now >= was - 0.5, "it walked from {was} m to {now} m at a player far off it has no way to");
    // Close to it but past its leash, its post 45 m back, on ground its routes do not reach: it lets them be too.
    let (was, now) = garrison_beside_the_square([FISSURE_AT[0], FISSURE_AT[1] + 39.0, 0.0], 45.0);
    assert!(now >= was - 0.5, "it walked from {was} m to {now} m at a player past its leash it has no way to");
}
