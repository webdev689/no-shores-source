//! A player arriving in a passage zone: its foes leave them be from joining until ARRIVAL_GRACE after they arrive,
//! held or not, striking first ending it; and no band member stands or walks within BAND_OFF_ARRIVAL_M of the arrival,
//! nor, where the floor holds a post nearer, nearer than its post less a band's spread.

use super::passages_tests::{BAND, ISLAND, diver, web, zone_room};
use crate::garrison::SPREAD;
use crate::passages::passage_foes::BACK_MOST_M;
use crate::players::ARRIVAL_GRACE;
use crate::{Input, PlayerId, Room};
use combat::arms::Stroke;
use combat::sight::{apart, bearing};
use combat::{CombatInput, Intent};
use gear::dive::Route;
use passage::{BAND_OFF_ARRIVAL_M, Deal, Mission, POST_OFF_ARRIVAL_M, Plan};

/// How far a post's place on the navmesh may lie from its site's place, metres.
const MESH_SLACK_M: f64 = 1.0;

/// The foe of the zone nearest its arrival, stood 2 m ahead of it facing it, so a player there who is not left be is fought.
fn foe_beside_arrival(room: &mut Room, plan: &Plan) {
    let (arrive, facing) = (plan.sites.arrive, plan.sites.facing);
    let nearest = room
        .foes
        .iter()
        .min_by(|one, other| {
            let at = |foe: &crate::foes::Foe| apart([foe.fighter.body.x, foe.fighter.body.y], arrive);
            at(one.1).total_cmp(&at(other.1))
        })
        .map(|(id, _)| *id)
        .expect("a foe in the zone");
    let foe = room.foes.get_mut(&nearest).expect("standing");
    (foe.fighter.body.x, foe.fighter.body.y) =
        (arrive[0] + 2.0 * libm::sin(facing), arrive[1] - 2.0 * libm::cos(facing));
    foe.fighter.body.facing = bearing([foe.fighter.body.x, foe.fighter.body.y], arrive);
}

/// Whether the player has their full health and no foe fights them.
fn untouched(room: &Room, player: PlayerId) -> bool {
    let fighter = &room.players[&player].fighter;
    fighter.health >= fighter.health_max && !room.foes.values().any(|foe| foe.brain.fights() == Some(player))
}

/// Ticks the room, each tick the player's input standing still, as a page sends while no key is down.
fn stand_still(room: &mut Room, player: PlayerId, ticks: u64) {
    for _ in 0..ticks {
        let sequence = room.players[&player].received.wrapping_add(1);
        room.input(player, Input { sequence, seen: room.clock(), ..Input::default() }).expect("in order");
        room.tick();
    }
}

#[test]
fn a_player_standing_still_at_the_arrival_is_left_be_for_ten_seconds_above_and_under_ground() {
    assert_eq!(ARRIVAL_GRACE, 10 * 60, "10 s of ticks");
    for under in [false, true] {
        for deal in [Deal::Skirmish, Deal::Mission(Mission::Hunt)] {
            let (week, plan, mut room) = zone_room(deal, Some(under), Route::Public);
            let player = diver(&mut room, week, &plan);
            foe_beside_arrival(&mut room, &plan);
            stand_still(&mut room, player, ARRIVAL_GRACE - 1);
            assert!(untouched(&room, player), "under {under}, {deal:?}: left be for 10 s");
            assert!(room.left_be(player), "under {under}, {deal:?}: still in the grace");
            stand_still(&mut room, player, 1);
            assert!(!room.left_be(player), "under {under}, {deal:?}: 10 s on, the foes may fight them");
        }
    }
}

#[test]
fn a_player_held_while_the_page_brings_them_in_is_left_be_until_ten_seconds_after_they_are_let_play() {
    let (week, plan, mut room) = zone_room(Deal::Skirmish, Some(false), Route::Public);
    let player = diver(&mut room, week, &plan);
    assert!(room.hold(player, true));
    foe_beside_arrival(&mut room, &plan);
    stand_still(&mut room, player, 2 * ARRIVAL_GRACE);
    assert!(untouched(&room, player), "left be however long the page takes");
    assert!(room.hold(player, false));
    assert_eq!(room.players[&player].graced, room.clock() + ARRIVAL_GRACE);
    stand_still(&mut room, player, ARRIVAL_GRACE - 1);
    assert!(untouched(&room, player), "and 10 s after they arrive");
    assert!(room.hold(player, false));
    assert!(room.players[&player].graced <= room.clock() + 1, "let play again, no new grace");
}

#[test]
fn striking_first_ends_an_arrivals_grace() {
    let (week, plan, mut room) = zone_room(Deal::Skirmish, Some(false), Route::Public);
    let player = diver(&mut room, week, &plan);
    stand_still(&mut room, player, 1);
    assert!(room.players[&player].graced > room.clock());
    let sequence = room.players[&player].received.wrapping_add(1);
    let combat = CombatInput { attack: Some(Stroke::Down), ..CombatInput::default() };
    let intent = Intent { combat, ..Intent::default() };
    room.input(player, Input { sequence, intent, seen: room.clock(), ..Input::default() }).expect("in order");
    room.tick();
    assert_eq!(room.players[&player].graced, 0, "striking ends it");
}

#[test]
fn no_band_member_stands_or_walks_within_25_m_of_a_zones_arrival_or_nearer_than_its_post_allows() {
    assert_eq!(BAND_OFF_ARRIVAL_M, crate::garrison::SPAWN_CLEAR, "the garrison keeps its members that far off");
    let mut zones = 0;
    for week in 2_900..2_903 {
        let web = web(week);
        for zone in &web.zones {
            let Some(plan) = Plan::of(&web, zone.number) else { continue };
            // An under-ground Vault stands its dungeon's own garrison (`stand_dungeon_garrison`), not bands on posts.
            if plan.zone.deal == Deal::Vault && matches!(plan.ground, passage::Laid::Under(_)) {
                continue;
            }
            let modifiers = gear::passages::week_modifiers(ISLAND, week);
            let mut room = Room::passage(&plan, BAND, modifiers, (ISLAND, week, Route::Public)).expect("a room");
            let posts: Vec<usize> = room.zone().map(|zone| zone.round.guards.clone()).unwrap_or_default();
            let held = room.zone().map_or(0, |zone| zone.held.len());
            match plan.zone.deal {
                Deal::Mission(Mission::Kindle | Mission::Hold | Mission::Ambush) => {}
                Deal::Lamp => assert!(!posts.is_empty(), "week {week} zone {}: its guard stood", zone.number),
                // A band on each post, stood or held back for room: none lost to the arrival's clearance.
                _ => assert_eq!(posts.len() + held, plan.sites.posts.len(), "week {week} zone {}", zone.number),
            }
            zones += 1;
            // A Hunt's marked band walks its round the longest: a minute and a half sees it round.
            let ticks = if plan.zone.deal == Deal::Mission(Mission::Hunt) { 90 * 60 } else { 1 };
            for tick in 0..ticks {
                if tick % 30 == 0 {
                    // Read each time, so a band held back and stood since is measured too.
                    let posts: Vec<usize> = room.zone().map(|zone| zone.round.guards.clone()).unwrap_or_default();
                    for &post in &posts {
                        // BAND_OFF_ARRIVAL_M where the post stands so far and a band's spread out (the mesh holding it
                        // a little off the site's place), else the post's distance less the spread and the metres its
                        // spawn may go back.
                        let at = room.garrison[post].at;
                        let post_off = apart([at[0], at[1]], plan.sites.arrive);
                        let least = if post_off >= POST_OFF_ARRIVAL_M + MESH_SLACK_M {
                            BAND_OFF_ARRIVAL_M
                        } else {
                            post_off - SPREAD - f64::from(BACK_MOST_M) - MESH_SLACK_M
                        };
                        for id in &room.garrison[post].standing {
                            let Some(foe) = room.foes.get(id) else { continue };
                            let off = apart([foe.fighter.body.x, foe.fighter.body.y], plan.sites.arrive);
                            assert!(off >= least, "week {week} zone {} {:?}: {off:.1} m", zone.number, zone.deal);
                        }
                    }
                }
                room.tick();
            }
        }
    }
    assert!(zones > 20, "{zones} zones");
}
