//! The Drowned Vale's encounters played through their rules: the Mending's walkers, stages and Mender; the Choir's
//! rounds, font and Scrivener; the Unlit Ways' Watchers; the Two Shores' rifts and Keepers; and the Steward's takings
//! and its laying bare.

use super::breach_tests::{at, breach, fell, run, stand_at, told};
use super::*;
use crate::encounters::encounters_tests::ticks;
use crate::{EventKind, PlayerId};

/// Stands a player at a socket of a space.
pub(super) fn put_at(room: &mut Room, player: PlayerId, space: &str, socket: &str) {
    let point = at(room, space, socket);
    stand_at(room, player, point);
}

/// A foe struck down where it stands.
pub(super) fn kill(room: &mut Room, id: FighterId) {
    let foe = room.foes.get_mut(&id).expect("standing");
    (foe.fighter.health, foe.fighter.action) = (0.0, combat::Action::Dead { elapsed: 0 });
}

/// Every player stood at a socket of a space, the encounter there begun.
pub(super) fn begin_at(room: &mut Room, players: &[PlayerId], space: &str, socket: &str) {
    let point = at(room, space, socket);
    for (nth, &player) in players.iter().enumerate() {
        stand_at(room, player, [point[0] + nth as f64 * 0.5, point[1], point[2]]);
    }
    room.tick();
}

/// The run with every encounter before `encounter` won and its seals open.
pub(super) fn won_to(tier: Tier, count: usize, encounter: usize) -> (Room, Vec<PlayerId>) {
    let (mut room, players) = run(tier, count);
    let mut breach_box = room.breach.take().expect("run");
    for before in MENDING..encounter {
        room.win_encounter(&mut breach_box, before);
    }
    room.breach = Some(breach_box);
    room.take_events();
    (room, players)
}

#[test]
fn the_mendings_walkers_fuse_into_the_open_seam_and_four_close_the_vale_over_the_company() {
    let (mut room, players) = run(Tier::Normal, 2);
    begin_at(&mut room, &players, "mending", "mender");
    assert_eq!(breach(&room).fights.mending.stage, 0);
    assert!(breach(&room).fights.mending.open(0) && !breach(&room).fights.mending.open(1), "the north seam first");
    for &player in &players {
        put_at(&mut room, player, "mending", "checkpoint");
    }
    let mut fused = 0;
    for _ in 0..240 * 60 {
        room.tick();
        fused = breach(&room).fights.mending.fusions();
        if fused >= mending::FUSIONS_MOST.0 {
            break;
        }
    }
    assert_eq!(fused, mending::FUSIONS_MOST.0, "unopposed, the walkers fuse");
    room.tick();
    assert!(players.iter().all(|player| room.players[player].fighter.dead()), "the vale closes over the company");
    ticks(&mut room, WIPE_TICKS + 2);
    assert_eq!(breach(&room).phases[MENDING], Phase::Waiting, "the attempt lost, the Mending waits again");
    assert_eq!(breach(&room).fights.mending.fusions(), 0, "its seams whole");
}

#[test]
fn the_mendings_stages_open_west_and_east_then_all_three_then_the_mender_whose_fall_wins_it() {
    let (mut room, players) = run(Tier::Normal, 2);
    begin_at(&mut room, &players, "mending", "mender");
    for stage in 1..=3_u8 {
        room.clock += mending::STAGE_TICKS;
        room.tick();
        assert_eq!(breach(&room).fights.mending.stage, stage);
    }
    let mending = &breach(&room).fights.mending;
    assert!(!mending.open(0), "no seam open once the Mender stands");
    let mender = mending.mender.expect("the Mender stands");
    assert_eq!(room.names.get(&mender), Some(&"The Mender"));
    kill(&mut room, mender);
    room.tick();
    assert_eq!(breach(&room).phases[MENDING], Phase::Won);
    assert!(breach(&room).open_seals.contains(&0), "the way to the Choir opens");
    assert_eq!(told(&mut room, EventKind::BreachWon), players.len());
}

#[test]
fn the_choirs_bells_wake_in_turn_and_broken_in_that_order_the_round_is_won() {
    let (mut room, players) = won_to(Tier::Normal, 1, CHOIR);
    begin_at(&mut room, &players, "choir", "font");
    ticks(&mut room, 2 * 60 + 3 * choir::WAKE_APART.0);
    let order = breach(&room).fights.choir.order.clone();
    assert_eq!(order.len(), choir::ROUNDS[0]);
    let bells: Vec<(usize, FighterId)> = breach(&room).fights.choir.bells.clone();
    assert_eq!(bells.len(), order.len(), "each woke at its frame");
    for place in &order {
        let (_, id) = bells.iter().find(|(at, _)| at == place).expect("its bell");
        kill(&mut room, *id);
        room.tick();
    }
    assert_eq!(breach(&room).fights.choir.round, 1, "the first round won");
    assert!(breach(&room).marked.is_empty());
}

#[test]
fn the_choirs_snapshot_shows_only_the_bells_woken_so_far_so_their_order_is_learnt_by_watching() {
    let (mut room, players) = won_to(Tier::Normal, 1, CHOIR);
    begin_at(&mut room, &players, "choir", "font");
    ticks(&mut room, 2 * 60 + 1);
    let seen = room.breach_seen().expect("a run's");
    let fight = &breach(&room).fights.choir;
    let woken: Vec<u8> =
        fight.order.iter().zip(&fight.woke).filter(|(_, woke)| woke.is_some()).map(|(place, _)| *place as u8).collect();
    assert!(!woken.is_empty() && woken.len() < fight.order.len(), "the round still waking");
    assert_eq!(seen.bells, woken);
}

#[test]
fn a_bell_broken_out_of_order_rings_and_rewrites_the_chapel_and_the_font_cleanses_then_rests() {
    let (mut room, players) = won_to(Tier::Normal, 2, CHOIR);
    begin_at(&mut room, &players, "choir", "lectern-2");
    ticks(&mut room, 2 * 60 + 3 * choir::WAKE_APART.0);
    let order = breach(&room).fights.choir.order.clone();
    let bells = breach(&room).fights.choir.bells.clone();
    let (_, last) = bells.iter().find(|(place, _)| *place == order[order.len() - 1]).expect("its bell");
    kill(&mut room, *last);
    room.tick();
    assert_eq!(breach(&room).marked.len(), players.len(), "the chapel Rewritten");
    assert_eq!(breach(&room).fights.choir.round, 0, "the round to try again");
    put_at(&mut room, players[0], "choir", "font");
    room.tick();
    assert_eq!(breach(&room).marked.len(), 1, "the font cleansed the one in its light");
    put_at(&mut room, players[1], "choir", "font");
    room.tick();
    assert_eq!(breach(&room).marked.len(), 1, "and rests a while after");
    put_at(&mut room, players[1], "choir", "lectern-3");
    ticks(&mut room, choir::MARK_LASTS);
    assert!(room.players[&players[1]].fighter.dead(), "the mark kept unwrites its player");
}

#[test]
fn the_scrivener_stands_warded_until_the_lodestone_is_grounded_beside_it_and_a_blotted_desk_holds_it() {
    let (mut room, players) = won_to(Tier::Normal, 2, CHOIR);
    begin_at(&mut room, &players, "choir", "lectern-2");
    room.breach.as_mut().expect("run").fights.choir.round = choir::ROUNDS.len() - 1;
    room.breach.as_mut().expect("run").fights.choir.round_from = room.clock + 1_000_000;
    let mut breach_box = room.breach.take().expect("run");
    let mut fight = std::mem::take(&mut breach_box.fights.choir);
    room.wake_scrivener(&mut breach_box, &mut fight);
    breach_box.fights.choir = fight;
    room.breach = Some(breach_box);
    let scrivener = breach(&room).fights.choir.scrivener.expect("it stands");
    let health = room.foes[&scrivener].fighter.health;
    room.foes.get_mut(&scrivener).expect("it").fighter.health = health / 2.0;
    room.tick();
    assert_eq!(room.foes[&scrivener].fighter.health, health, "warded, it takes nothing");
    let plinth = at(&room, "choir", "plinth");
    stand_at(&mut room, players[0], plinth);
    assert!(room.take_lodestone(players[0]));
    let body = room.foes[&scrivener].fighter.body;
    stand_at(&mut room, players[0], [body.x + 3.0, body.y, body.z]);
    assert!(room.ground_lodestone(players[0]));
    assert!(breach(&room).fights.choir.warded.is_none(), "its ward broken");
    room.breach.as_mut().expect("run").fights.choir.next_mark = room.clock;
    room.tick();
    let (desk, _) = breach(&room).fights.choir.marked_desk.expect("a desk marked");
    let marked = room.breach.as_ref().expect("run").plan.numbered("choir", "lectern")[desk].0;
    stand_at(&mut room, players[1], marked);
    ticks(&mut room, choir::MARK_SHOWS + 1);
    assert!(!breach(&room).fights.choir.moved, "blotted, it could not write itself there");
    assert!(breach(&room).fights.choir.warded.is_none(), "and its ward stays down");
    kill(&mut room, scrivener);
    room.tick();
    assert_eq!(breach(&room).phases[CHOIR], Phase::Won);
    assert!(breach(&room).chests.contains(&1), "the Unwritten Page lies for a Scrivener that never moved");
}

#[test]
fn a_watcher_sees_a_player_in_its_light_and_at_normal_unwrites_them_and_at_hard_the_company() {
    for tier in Tier::ALL {
        let (mut room, players) = won_to(tier, 2, WAYS);
        begin_at(&mut room, &players, "ways", "heart");
        put_at(&mut room, players[0], "ways", "checkpoint");
        let (id, post, _) = breach(&room).fights.ways.watchers[0];
        let watcher = room.foes[&id].fighter.body;
        let (sine, cosine) = (libm::sin(post), libm::cos(post));
        let ahead = [watcher.x + sine * 5.0, watcher.y - cosine * 5.0, watcher.z - 0.5];
        for _ in 0..ways::SEEN_TICKS + 5 {
            stand_at(&mut room, players[1], ahead);
            room.breach.as_mut().expect("run").fights.ways.watchers[0].2 = -1.0;
            room.tick();
        }
        assert!(breach(&room).fights.ways.seen, "{tier:?}: seen");
        if tier == Tier::Hard {
            ticks(&mut room, ways::SEEN_TO_WIPE + 1);
            assert!(players.iter().all(|player| room.players[player].fighter.dead()), "the company unwritten");
        } else {
            assert!(room.players[&players[1]].fighter.dead() && !room.players[&players[0]].fighter.dead());
        }
    }
}

#[test]
fn a_rift_held_open_carries_a_body_through_and_back_and_its_keepers_fall_rewrites_its_shore() {
    let (mut room, players) = won_to(Tier::Normal, 2, SHORES);
    begin_at(&mut room, &players, "hall", "plinth");
    let warden = breach(&room).fights.shores.warden.expect("the Warden stands");
    kill(&mut room, warden);
    room.tick();
    assert!(breach(&room).lodestone.lying_at().is_some(), "the Lodestone on the hall's plinth");
    put_at(&mut room, players[0], "hall", "mooring-was");
    ticks(&mut room, shores::OPENS_TICKS + 1);
    assert!(breach(&room).fights.shores.rifts[0].open);
    put_at(&mut room, players[1], "hall", "rift-was");
    room.tick();
    let arrival = at(&room, "hall-was", "arrival");
    let body = room.players[&players[1]].fighter.body;
    assert!(combat::sight::apart([body.x, body.y], [arrival[0], arrival[1]]) < 1.0, "carried into what was");
    room.tick();
    let keeper = breach(&room).fights.shores.keepers[0].expect("its Keeper stands");
    let post = at(&room, "hall-was", "keeper");
    assert!(room.nav.nearest_point(post).is_some(), "its shore's ground baked for it to walk");
    kill(&mut room, keeper);
    room.tick();
    assert!(breach(&room).marked.contains_key(&players[1]), "Rewritten in its shore");
    put_at(&mut room, players[1], "hall-was", "rift");
    room.tick();
    let body = room.players[&players[1]].fighter.body;
    assert!(!room.someone_in(breach(&room), "hall-was") && body.z > 50.0, "carried back to the hall");
}

#[test]
fn a_rifts_mooring_let_go_before_it_opens_lets_its_opening_fall_back() {
    let (mut room, players) = won_to(Tier::Normal, 1, SHORES);
    begin_at(&mut room, &players, "hall", "plinth");
    let warden = breach(&room).fights.shores.warden.expect("the Warden stands");
    kill(&mut room, warden);
    room.tick();
    put_at(&mut room, players[0], "hall", "mooring-was");
    ticks(&mut room, shores::OPENS_TICKS / 2);
    assert!(breach(&room).fights.shores.rifts[0].held > 0, "opening while held");
    put_at(&mut room, players[0], "hall", "plinth");
    ticks(&mut room, shores::OPENS_TICKS / 2 + 1);
    assert_eq!(breach(&room).fights.shores.rifts[0].held, 0, "let go as long, it falls back whole");
}

#[test]
fn at_hard_the_lodestones_last_bearer_through_a_rift_is_turned_back_from_it_and_told() {
    let (mut room, players) = won_to(Tier::Hard, 2, SHORES);
    begin_at(&mut room, &players, "hall", "plinth");
    let warden = breach(&room).fights.shores.warden.expect("the Warden stands");
    kill(&mut room, warden);
    room.tick();
    put_at(&mut room, players[0], "hall", "plinth");
    assert!(room.take_lodestone(players[0]));
    put_at(&mut room, players[1], "hall", "mooring-was");
    ticks(&mut room, shores::OPENS_TICKS + 1);
    put_at(&mut room, players[0], "hall", "rift-was");
    room.tick();
    assert!(room.someone_in(breach(&room), "hall-was"), "carried through with it");
    put_at(&mut room, players[0], "hall-was", "rift");
    room.tick();
    room.take_events();
    put_at(&mut room, players[0], "hall", "rift-was");
    room.tick();
    let (body, mouth) = (room.players[&players[0]].fighter.body, at(&room, "hall", "rift-was"));
    assert!(!room.someone_in(breach(&room), "hall-was"), "not through with it again");
    assert!(combat::sight::apart([body.x, body.y], [mouth[0], mouth[1]]) > shores::RIFT_REACH_M, "turned back");
    assert_eq!(told(&mut room, EventKind::Carried), 1, "and told so");
}

/// Lesser foes stood at a space's first mouth until the encounter, or the room, would stand no more.
fn filled(room: &mut Room, space: &str) {
    let mut breach_box = room.breach.take().expect("run");
    let (mouth, _) = breach_box.plan.numbered(space, "mouth")[0];
    for _ in 0..crate::NODE_FOES_MOST {
        room.stand_breach_foe(&mut breach_box, (::foes::roster::HUSK, ::foes::Rank::Minor), mouth, None);
    }
    room.breach = Some(breach_box);
}

#[test]
fn an_encounters_great_foes_and_bells_stand_though_its_lesser_foes_fill_it() {
    let (mut room, players) = run(Tier::Normal, 2);
    begin_at(&mut room, &players, "mending", "mender");
    filled(&mut room, "mending");
    for _ in 1..=3 {
        room.clock += mending::STAGE_TICKS;
        room.tick();
    }
    assert!(breach(&room).fights.mending.mender.is_some(), "the Mender stands");
    let (mut room, players) = won_to(Tier::Normal, 1, CHOIR);
    begin_at(&mut room, &players, "choir", "font");
    filled(&mut room, "choir");
    ticks(&mut room, 2 * 60 + 3 * choir::WAKE_APART.0);
    assert_eq!(breach(&room).fights.choir.bells.len(), choir::ROUNDS[0], "every bell of the round stands");
    let (mut room, players) = won_to(Tier::Normal, 2, STEWARD);
    begin_at(&mut room, &players, "court", "chest");
    filled(&mut room, "court");
    room.breach.as_mut().expect("run").fights.steward.next_taking = room.clock;
    room.tick();
    let away = breach(&room).fights.steward.away.clone().expect("taken");
    assert_eq!(away.bells.len(), 5, "every bell of the shore stands");
}

#[test]
fn the_steward_takes_half_the_company_into_a_shore_and_grounded_at_its_feet_lies_bare() {
    let (mut room, players) = won_to(Tier::Normal, 8, STEWARD);
    begin_at(&mut room, &players, "court", "chest");
    let boss = breach(&room).fights.steward.boss.expect("the Steward stands");
    room.breach.as_mut().expect("run").fights.steward.next_taking = room.clock;
    room.tick();
    let away = breach(&room).fights.steward.away.clone().expect("taken");
    assert_eq!(away.taken.len(), steward::TAKES, "four of eight");
    assert!(away.taken.iter().all(|player| breach(&room).marked.contains_key(player)), "each Rewritten");
    assert_eq!(away.bells.len(), 5);
    for place in &away.order {
        let (_, id) = away.bells.iter().find(|(at, _)| at == place).expect("its bell");
        kill(&mut room, *id);
        room.tick();
    }
    assert!(breach(&room).fights.steward.away.as_ref().is_some_and(|away| away.done), "the way back opens");
    let left: Vec<PlayerId> = players.iter().copied().filter(|player| !away.taken.contains(player)).collect();
    put_at(&mut room, left[0], "court", "mooring-was");
    for &player in &away.taken {
        put_at(&mut room, player, "court-was", "rift");
    }
    room.tick();
    room.tick();
    assert!(breach(&room).fights.steward.away.is_none(), "every one of them home");
    let body = room.foes[&boss].fighter.body;
    stand_at(&mut room, players[0], [body.x + 2.0, body.y, body.z]);
    let mut breach_box = room.breach.take().expect("run");
    breach_box.lodestone.stone = lodestone::Stone::Borne(players[0]);
    room.breach = Some(breach_box);
    assert!(room.ground_lodestone(players[0]));
    assert_eq!(room.bare_times(boss), steward::BARE_BLOW, "laid bare");
    fell(&mut room, players[0]);
}

#[test]
fn no_blow_harms_a_watcher() {
    let (mut room, players) = won_to(Tier::Normal, 1, WAYS);
    begin_at(&mut room, &players, "ways", "heart");
    let (id, _, _) = breach(&room).fights.ways.watchers[0];
    let whole = room.foes[&id].fighter.health_max;
    room.foes.get_mut(&id).expect("standing").fighter.health = 1.0;
    room.tick();
    assert_eq!(room.foes[&id].fighter.health, whole, "its health held whole");
}

#[test]
fn the_ways_are_won_once_every_living_player_of_the_company_stands_on_the_broken_stair() {
    let (mut room, players) = won_to(Tier::Normal, 3, WAYS);
    begin_at(&mut room, &players, "ways", "heart");
    put_at(&mut room, players[0], "stair", "start");
    fell(&mut room, players[2]);
    room.tick();
    assert!(matches!(breach(&room).phases[WAYS], Phase::Running(_)), "one still in the streets");
    let (stair, _) = breach(&room).plan.socket("stair", "start").expect("its start");
    stand_at(&mut room, players[1], [stair[0] + 1.0, stair[1], stair[2]]);
    room.tick();
    assert_eq!(breach(&room).phases[WAYS], Phase::Won, "the living all on the Stair, the fallen not waited for");
    assert!(breach(&room).chests.contains(&2), "unseen, the heart's house opened as they passed");
}
