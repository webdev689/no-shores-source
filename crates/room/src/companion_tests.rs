//! Officers ashore beside their player: they stand behind them on the players' side, follow them and are put back
//! when they stray, fight the factions' foes by gear's power at their level, are never struck by a player, are
//! knocked out and rest eight minutes, go when sent aboard or when their player leaves, and their kills are shared.

use super::*;
use crate::foes::pirate_in;
use crate::judging::How;
use crate::{EventKind, FoeSeen};
use ::foes::Role;
use combat::judge::Blow;
use combat::sight::apart;
use combat::{BlowKind, Stroke, Verdict};
use gear::Rarity;
use std::collections::BTreeMap;

/// Gives an officer a perk: the trait chosen in their first perk column, bought.
fn perk(officer: &mut Officer, id: &str) {
    let column = officer.columns().iter().position(|kind| kind.traits()).expect("a perk column");
    officer.layout = vec![vec![id.to_owned()]];
    officer.bought |= officer.node_bit(column, 0).unwrap();
    officer.chosen[column] = 0;
}

fn room() -> Room {
    Room::new(Vec::new(), (0.0, 0.0))
}

/// A player whose officers of these posts, at this level, are ashore with them, by their numbers.
fn with_officers(room: &mut Room, posts: &[Post], level: u8) -> (PlayerId, Vec<u32>) {
    let player = room.join().expect("a room with space");
    let character = &mut room.players.get_mut(&player).unwrap().character;
    let ids = posts
        .iter()
        .enumerate()
        .map(|(nth, post)| {
            let mut officer = Officer::new(0, *post, Rarity::Magic, level);
            (officer.given, officer.family) = (nth as u8 + 3, 7);
            let id = character.sign_on(officer).expect("room in the crew");
            character.crew.officers.get_mut(&id).unwrap().duty = Duty::Ashore;
            id
        })
        .collect();
    (player, ids)
}

/// Each companion standing, by officer number.
fn companions(room: &Room) -> BTreeMap<u32, (FighterId, Fighter)> {
    room.foes_seen().filter_map(|seen| Some((seen.companion?.officer, (seen.foe, seen.fighter)))).collect()
}

fn stand_player(room: &mut Room, player: PlayerId, x: f64, y: f64, facing: f64) {
    let fighter = &mut room.players.get_mut(&player).unwrap().fighter;
    fighter.body = movement::Body { facing, ..movement::standing(x, y) };
    fighter.aim = facing;
}

/// A foe of the Grey Tithe's at level `level`, `y` m north of the origin facing south.
fn tithe(room: &mut Room, level: u8, y: f64) -> FighterId {
    let foe = room.stand_foe(foe_type(2).unwrap(), Rank::Major, [0.0, y, 0.0], core::f64::consts::PI, None);
    room.gird(foe, level, None);
    foe
}

fn run(room: &mut Room, ticks: u64) {
    for _ in 0..ticks {
        room.tick();
    }
}

fn feet(fighter: &Fighter) -> [f64; 2] {
    [fighter.body.x, fighter.body.y]
}

#[test]
fn two_officers_ashore_stand_behind_their_leader_on_the_players_side_as_their_posts_types_at_their_level() {
    let mut room = room();
    let (player, ids) = with_officers(&mut room, &[Post::FirstMate, Post::Gunner, Post::Bosun], 6);
    room.players.get_mut(&player).unwrap().character.crew.officers.get_mut(&ids[2]).unwrap().duty = Duty::Aboard;
    stand_player(&mut room, player, 0.0, 0.0, 0.0);
    room.tick();
    let seen: Vec<FoeSeen> = room.foes_seen().collect();
    assert_eq!(seen.len(), 2, "two ashore, the third aboard");
    for (place, (foe, post)) in seen.iter().zip([Post::FirstMate, Post::Gunner]).enumerate() {
        let companion = foe.companion.expect("a companion");
        assert_eq!((companion.leader, companion.officer, companion.level), (player, ids[place], 6));
        assert_eq!((companion.given, companion.family), (place as u8 + 3, 7), "their names' places");
        assert_eq!((foe.foe_type, foe.faction, foe.level), (type_of(post), 0, 6));
        assert_eq!(foe.fighter.side, Side::Players);
    }
    // Facing north, their places are 1.8 m south of the leader, 1.1 m to the west and to the east.
    let [first, second] = [feet(&seen[0].fighter), feet(&seen[1].fighter)];
    assert!(apart(first, [-1.1, 1.8]) < 0.3 && apart(second, [1.1, 1.8]) < 0.3, "{first:?} {second:?}");
    assert_eq!(room.living_foes(), 0, "companions are not foes");
}

#[test]
fn a_companion_follows_their_leader_and_stops_within_their_heel_of_their_place() {
    let mut room = room();
    let (player, ids) = with_officers(&mut room, &[Post::FirstMate], 3);
    stand_player(&mut room, player, 0.0, 0.0, 0.0);
    room.tick();
    stand_player(&mut room, player, 0.0, -12.0, 0.0);
    run(&mut room, 300);
    let (_, companion) = companions(&room)[&ids[0]];
    let place = [0.0, -12.0 + 1.8];
    assert!(apart(feet(&companion), place) <= 2.5 + 0.3, "walked up behind: {:?}", feet(&companion));
    assert!(apart(feet(&companion), place) > 0.5, "stopped at their heel, not on the place itself");
    let speed = libm::hypot(companion.body.vx, companion.body.vy);
    assert!(speed < 0.5, "and stands: {speed}");
}

#[test]
fn a_companion_40_m_from_their_leader_or_6_m_below_them_is_put_back_at_their_place() {
    let mut room = room();
    let (player, ids) = with_officers(&mut room, &[Post::Bosun], 3);
    stand_player(&mut room, player, 0.0, 0.0, 0.0);
    room.tick();
    stand_player(&mut room, player, 0.0, -41.0, 0.0);
    room.tick();
    let (id, companion) = companions(&room)[&ids[0]];
    assert!(apart(feet(&companion), [0.0, -41.0 + 1.8]) < 0.5, "at once: {:?}", feet(&companion));
    let fighter = &mut room.foes.get_mut(&id).unwrap().fighter;
    fighter.body.z = -7.0;
    room.tick();
    let (_, companion) = companions(&room)[&ids[0]];
    assert!(companion.body.z > -1.0 && apart(feet(&companion), [0.0, -41.0 + 1.8]) < 0.5, "back up beside them");
}

#[test]
fn a_companion_fights_a_factions_foe_near_their_leader_and_their_kill_pays_the_leader_and_the_officers_ashore() {
    let mut room = room();
    let (player, ids) = with_officers(&mut room, &[Post::FirstMate], 1);
    stand_player(&mut room, player, 0.0, 0.0, 0.0);
    room.tick();
    let (companion, _) = companions(&room)[&ids[0]];
    let foe = tithe(&mut room, 1, -8.0);
    let mut landed = false;
    for _ in 0..3600 {
        // The leader kept whole and out of it, so only the companion's blows reach the foe.
        let fighter = &mut room.players.get_mut(&player).unwrap().fighter;
        fighter.health = fighter.health_max;
        room.tick();
        let events = room.take_events();
        landed |= events.iter().any(|event| event.striker == companion && event.defender == foe);
        if room.foes[&foe].fighter.dead() {
            break;
        }
    }
    assert!(landed, "the companion struck the foe");
    let left = room.foes[&foe].fighter;
    assert!(
        left.dead(),
        "and felled it: {} of {} left, companion {:?}",
        left.health,
        left.health_max,
        room.companion(companion)
    );
    let character = &room.players[&player].character;
    assert!(character.xp > 0, "the leader shares the companion's kill");
    let officer = &character.crew.officers[&ids[0]];
    assert!(officer.xp > Officer::new(0, Post::FirstMate, Rarity::Magic, 1).xp, "and the officer ashore earns");
}

#[test]
fn a_player_never_harms_a_companion_and_one_beaten_down_is_knocked_out_rests_eight_minutes_and_comes_back() {
    let mut room = room();
    let (player, ids) = with_officers(&mut room, &[Post::Lookout], 2);
    let (other_player, other_ids) = with_officers(&mut room, &[Post::Carpenter], 2);
    room.tick();
    let id = room.companion_of(player, ids[0]).unwrap();
    let other = room.companion_of(other_player, other_ids[0]).unwrap();
    let before = room.foes[&id].fighter;
    let blow = |striker| Blow {
        striker,
        kind: BlowKind::Swing(Stroke::Down),
        from: [0.0, 0.0],
        damage: 500.0,
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
    let hit = Verdict::Hit { damage: 500.0, poise: 0.0 };
    room.settle(&blow(player), How::Swing, id, hit, Some(gear::Slot::Melee));
    room.settle(&blow(other), How::Swing, id, hit, None);
    assert_eq!(room.foes[&id].fighter.health, before.health, "neither their player nor another's companion");
    let (foe_type, rank) = pirate_in(Role::Brute).unwrap();
    let foe = room.stand_foe(foe_type, rank, [0.0, -3.0, 0.0], 0.0, None);
    room.foes.get_mut(&foe).unwrap().fighter.side = Side::Faction(1);
    room.settle(&blow(foe), How::Swing, id, hit, None);
    let knocked = room.foes[&id].fighter;
    assert!(knocked.health == 1.0 && !knocked.dead(), "held at 1, never killed");
    assert!(!room.take_events().iter().any(|event| event.kind == EventKind::Killed), "no kill told");
    room.tick();
    assert_eq!(room.companion_of(player, ids[0]), None, "they leave the fight");
    room.clock += KNOCKED_OUT_TICKS - 2;
    room.tick();
    assert_eq!(room.companion_of(player, ids[0]), None, "resting yet");
    room.tick();
    let back = room.foes[&room.companion_of(player, ids[0]).expect("ashore again")].fighter;
    assert_eq!(back.health, back.health_max, "rested, they come ashore again whole");
}

#[test]
fn a_companion_goes_when_their_officer_is_sent_aboard_or_their_leader_leaves_and_a_deck_has_none() {
    let mut room = room();
    let (player, ids) = with_officers(&mut room, &[Post::FirstMate, Post::Carpenter], 4);
    room.tick();
    assert_eq!(companions(&room).len(), 2);
    let dice = gear::dice::Dice { seed: 0, tick: 0, player };
    let character = &mut room.players.get_mut(&player).unwrap().character;
    let asked = gear::Ask::Station { officer: ids[0], duty: Duty::Posted };
    assert!(character.ask(asked, gear::Here::default(), &dice).is_ok(), "stationed at their post");
    room.tick();
    assert_eq!(companions(&room).keys().copied().collect::<Vec<_>>(), vec![ids[1]], "the posted one goes");
    room.leave(player);
    room.tick();
    assert!(companions(&room).is_empty() && room.foes.is_empty(), "and the other with their leader");

    let mut deck = Room::deck(&crate::deck::test_deck(), 1, Rank::Minor, 1);
    let crew = deck.foes.len();
    let spot = crate::deck_fight::rail_spot(&crate::deck::test_deck(), 1.0);
    let boarder = deck.board_at(spot).unwrap();
    let character = &mut deck.players.get_mut(&boarder).unwrap().character;
    let id = character.sign_on(Officer::new(0, Post::Bosun, Rarity::Magic, 1)).unwrap();
    character.crew.officers.get_mut(&id).unwrap().duty = Duty::Ashore;
    deck.tick();
    assert_eq!(deck.foes.len(), crew, "no companion on a boarded deck");
}

#[test]
fn a_companion_strikes_and_is_struck_as_a_player_matched_to_their_level_with_brawler_harder() {
    let mut room = room();
    let (_, ids) = with_officers(&mut room, &[Post::FirstMate], 10);
    room.tick();
    let (id, _) = companions(&room)[&ids[0]];
    let foe = tithe(&mut room, 10, -30.0);
    let times = room.companion_times(id, foe).unwrap();
    assert!((times - gear::power::by_player(150, 10, 10)).abs() < 1e-9, "a weapon of their level's Attack");
    assert!((room.companion_times(foe, id).unwrap() - 1.0).abs() < 1e-9, "a foe of their level reaches no further");
    let high = tithe(&mut room, 13, -30.0);
    assert!(room.companion_times(high, id).unwrap() > 1.0, "one above their level strikes harder");
    room.ashore.standing.get_mut(&id).unwrap().brawler = true;
    assert!((room.companion_times(id, foe).unwrap() - times * 1.1).abs() < 1e-9, "Brawler adds a tenth");
    assert_eq!(room.companion_times(foe, high), None, "between foes, nothing of theirs");
}

#[test]
fn weathered_gives_a_companion_more_health_and_steady_nerve_more_poise() {
    let mut room = room();
    let (player, ids) = with_officers(&mut room, &[Post::FirstMate, Post::Bosun], 5);
    let officers = &mut room.players.get_mut(&player).unwrap().character.crew.officers;
    perk(officers.get_mut(&ids[0]).unwrap(), "weathered");
    perk(officers.get_mut(&ids[1]).unwrap(), "steady_nerve");
    room.tick();
    let standing = companions(&room);
    let plain = |post| ::foes::spawn(foe_type(type_of(post)).unwrap(), Rank::Major, 0.0, 0.0, 0.0).0;
    let (weathered, steady) = (standing[&ids[0]].1, standing[&ids[1]].1);
    assert!((weathered.health_max - plain(Post::FirstMate).health_max * 1.15).abs() < 1e-9);
    assert!((steady.poise_max - plain(Post::Bosun).poise_max * 1.2).abs() < 1e-9);
    assert!((steady.health_max - plain(Post::Bosun).health_max).abs() < 1e-9, "their health their type's");
}

#[test]
fn a_players_ball_passes_their_companion_and_sending_foes_away_or_a_status_on_them_leaves_companions_be() {
    let mut room = room();
    let (player, ids) = with_officers(&mut room, &[Post::Bosun], 2);
    stand_player(&mut room, player, 0.0, 0.0, 0.0);
    room.tick();
    let id = room.companion_of(player, ids[0]).unwrap();
    room.foes.get_mut(&id).unwrap().fighter.body = movement::standing(0.0, -3.0);
    tithe(&mut room, 1, -8.0);
    let at = room.players[&player].fighter.chest();
    let ball = combat::shots::loose(player, combat::Ranged::Pistolet, at, 0.0, 0.0, 1.0);
    let stop = room.shoot_seen(&ball, &room.fighters());
    assert!(stop[1] < -6.0, "through the companion to the foe: {stop:?}");
    room.grant_status(player, combat::Status::Expose, true, Some(60));
    assert_eq!(room.foes[&id].fighter.statuses.left(combat::Status::Expose), 0, "no status on a companion");
    room.spawns.push((player, crate::SpawnAsk::Clear, 0));
    room.tick();
    assert_eq!(room.companion_of(player, ids[0]), Some(id), "sending the foes away leaves the companion");
    assert_eq!(room.living_foes(), 0);
}
