//! How a passage zone plays for its players: a respawn however a body fell, a lamp lit for a dive, a body left fallen,
//! a Gauntlet run from the way in, and a vein gathered into the haul.

use super::passages_tests::{BAND, ISLAND, dive, diver, kill_all, lit_lamp, run, stand_at, web, zone_room};
use crate::{Input, PlayerId, Room, Standing};
use combat::fighter::Action;
use gear::dive::Route;
use passage::{Current, Deal, Mission, PieceKind, Plan};

/// The first skirmish over the weeks from 2_900 that runs `current`, as its room.
fn with_current(current: Current) -> (u64, Plan, Room) {
    let found = (2_900..2_990).find_map(|week| {
        let web = web(week);
        let zone = web.zones.iter().find(|zone| zone.deal == Deal::Skirmish && zone.currents.contains(&current))?;
        Plan::of(&web, zone.number).map(|plan| (week, plan))
    });
    let (week, plan) = found.expect("a skirmish with the current");
    let modifiers = gear::passages::week_modifiers(ISLAND, week);
    let room = Room::passage(&plan, BAND, modifiers, (ISLAND, week, Route::Public)).expect("a room");
    (week, plan, room)
}

/// The player fallen as the section kills a body past its ring, long enough to respawn, a find in their haul: the
/// reach's death alone, the body's health untouched.
fn section_dead(room: &mut Room, player: PlayerId) {
    let found = room.players.get_mut(&player).expect("in");
    found.character.gather(0);
    found.standing = Standing::Dead { ticks: reach::RESPAWN_TICKS, fell: false };
}

fn standing_again(room: &Room, player: PlayerId) -> bool {
    room.players[&player].standing == Standing::Inside
}

#[test]
fn a_respawn_after_the_section_killed_loses_the_haul_and_is_refused_in_gloom() {
    let (week, plan, mut room) = zone_room(Deal::Skirmish, None, Route::Public);
    let player = diver(&mut room, week, &plan);
    section_dead(&mut room, player);
    room.step_dead(player, Input { respawn: true, ..Input::default() }, room.clock, &[]);
    assert!(standing_again(&room, player), "stood again");
    assert!(dive(&room, player).is_some_and(|dive| dive.haul.is_empty()), "as any respawn, its haul lost");

    let (week, plan, mut room) = with_current(Current::Gloom);
    let player = diver(&mut room, week, &plan);
    section_dead(&mut room, player);
    room.step_dead(player, Input { respawn: true, ..Input::default() }, room.clock, &[]);
    assert!(!standing_again(&room, player), "the Gloom takes no respawn");
    room.tick();
    assert!(standing_again(&room, player), "alone and down in the dark, fallen back");
    assert!(dive(&room, player).is_some_and(|dive| dive.haul.is_empty()), "its haul lost");
}

#[test]
fn a_respawn_loses_the_vestiges_lying_for_the_player_with_the_haul() {
    let (week, plan, mut room) = zone_room(Deal::Skirmish, None, Route::Public);
    let player = diver(&mut room, week, &plan);
    let vestige = gear::Vestige::new(0, gear::Rarity::Rare, gear::Slot::Head, 5);
    room.lay_drop(
        player,
        crate::drops::Dropped::Vestige(vestige),
        [plan.sites.arrive[0] + 30.0, plan.sites.arrive[1], 0.0],
    );
    section_dead(&mut room, player);
    room.step_dead(player, Input { respawn: true, ..Input::default() }, room.clock, &[]);
    assert!(standing_again(&room, player), "stood again");
    run(&mut room, crate::drops::DROP_TICKS + 1);
    assert!(room.drops_for(player).next().is_none(), "nothing lying for them");
    assert!(dive(&room, player).is_some_and(|dive| dive.haul.vestiges.is_empty()), "nor lapsed into the new haul");
}

#[test]
fn a_lamp_lit_for_a_dive_stays_lit_for_it_through_a_round_begun_again_and_a_reconnect() {
    let (_, _, mut room, player) = lit_lamp();
    run(&mut room, super::passage_deal::AGAIN_TICKS + 2);
    let seen = room.passage_seen(player).expect("a zone");
    assert!(!seen.done && seen.lamp_lit, "begun again, still lit for them: {seen:?}");
    let character = room.players[&player].character.to_json();
    let again = room.join().expect("joined");
    assert!(room.restore_character(again, &character));
    assert!(room.passage_seen(again).is_some_and(|seen| seen.lamp_lit), "lit for the dive, not the room's player");
    kill_all(&mut room);
    run(&mut room, 2);
    assert!(!room.may_hold(again, super::Held::Lamp), "never lit twice");
}

#[test]
fn a_body_left_fallen_comes_back_after_two_minutes_whole_but_without_its_haul() {
    let (week, plan, mut room) = zone_room(Deal::Skirmish, None, Route::Public);
    let player = diver(&mut room, week, &plan);
    let found = room.players.get_mut(&player).expect("in");
    found.character.gather(0);
    (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    let kept = room.kept_character(player).expect("kept");
    let minute = room.minute;
    let (_, _, mut later) = zone_room(Deal::Skirmish, None, Route::Public);
    later.set_minute(minute + gear::left::BODY_KEPT_MINUTES + 1);
    let back = later.join().expect("joined");
    assert!(later.restore_character(back, &kept));
    assert!(!later.players[&back].fighter.dead(), "the body no longer holds");
    assert!(dive(&later, back).is_some_and(|dive| dive.haul.is_empty()), "left fallen: as a respawn, its haul lost");
}

#[test]
fn a_gauntlet_is_run_from_the_way_in_and_its_seconds_left_from_each_ones_arrival() {
    let (week, plan, mut room) = zone_room(Deal::Mission(Mission::Gauntlet), None, Route::Public);
    let first = diver(&mut room, week, &plan);
    let far = room.far_mouth().expect("a far mouth");
    run(&mut room, 1);
    stand_at(&mut room, first, far);
    run(&mut room, 2);
    assert!(room.passage_seen(first).is_some_and(|seen| seen.done), "the first round, run");
    let waiting = diver(&mut room, week, &plan);
    stand_at(&mut room, waiting, far);
    let keep = |room: &mut Room, ticks: u64| {
        for _ in 0..ticks {
            kill_all(room);
            for found in room.players.values_mut() {
                found.fighter.health = 1e9;
            }
            room.tick();
        }
    };
    keep(&mut room, super::passage_deal::AGAIN_TICKS + 5);
    assert!(room.passage_seen(first).is_some_and(|seen| !seen.done), "no one lingering at the far mouth ends it");
    assert!(dive(&room, waiting).is_some_and(|dive| dive.paid.is_empty()), "no newcomer paid for waiting there");
    keep(&mut room, 30 * 60);
    let late = diver(&mut room, week, &plan);
    keep(&mut room, 1);
    let left = |player| room.passage_seen(player).map(|seen| seen.left).expect("a zone");
    assert!((left(late) - 90.0).abs() < 0.5 && (left(waiting) - 60.0).abs() < 0.5, "{} {}", left(late), left(waiting));
}

#[test]
fn a_veins_gather_is_refused_against_the_hauls_stock() {
    let (week, plan, mut room) = zone_room(Deal::Vein, None, Route::Public);
    let player = diver(&mut room, week, &plan);
    let resource = usize::from(room.resource_nodes[0].resource);
    let found = room.players.get_mut(&player).expect("in");
    found.character.materials.add(gear::character::Stuff::Resource(resource), gear::character::STOCK_MOST);
    assert_eq!(room.gather_refused(player, 0), None, "a full stock at home takes nothing from the haul");
    let found = room.players.get_mut(&player).expect("in");
    let haul = &mut found.character.passage.as_mut().expect("diving").haul;
    haul.materials.add(gear::character::Stuff::Resource(resource), gear::character::STOCK_MOST);
    assert_eq!(room.gather_refused(player, 0), Some(crate::asks::STOCK_FULL));
}

/// The first zone over the weeks from 2_900 that `wanted` picks, laid.
fn plan_where(wanted: impl Fn(&passage::Zone) -> bool) -> (u64, Plan) {
    let found = (2_900..2_990).find_map(|week| {
        let web = web(week);
        let zone = web.zones.iter().find(|zone| wanted(zone))?;
        Plan::of(&web, zone.number).map(|plan| (week, plan))
    });
    found.expect("a zone as wanted")
}

fn room_of(week: u64, plan: &Plan) -> Room {
    let modifiers = gear::passages::week_modifiers(ISLAND, week);
    Room::passage(plan, BAND, modifiers, (ISLAND, week, Route::Public)).expect("a room")
}

/// Each foe standing, by its type's number and rank.
fn standing(room: &Room) -> Vec<(u8, foes::Rank)> {
    room.foes
        .values()
        .filter(|foe| !foe.fighter.dead())
        .map(|foe| (foe.brain.foe_type.number, foe.brain.rank))
        .collect()
}

#[test]
fn crowded_holds_as_many_bands_and_the_most_is_by_the_zones_size() {
    let (week, plan) = plan_where(|zone| zone.deal == Deal::Skirmish && zone.currents.contains(&Current::Crowded));
    let crowded = room_of(week, &plan);
    let mut plain = plan.clone();
    plain.zone.currents.retain(|current| *current != Current::Crowded);
    let plain = room_of(week, &plain);
    assert_eq!(crowded.garrison.len(), plain.garrison.len(), "Crowded's bands bigger, not fewer");
    for (size, most) in [(passage::Size::Small, 7), (passage::Size::Medium, 9), (passage::Size::Large, 12)] {
        let (week, plan) =
            plan_where(|zone| zone.deal == Deal::Skirmish && zone.size == size && zone.currents.is_empty());
        let room = room_of(week, &plan);
        assert_eq!(room.zone_foes_most(), most, "{size:?}");
        assert!(room.living_foes() <= most, "{size:?}: {}", room.living_foes());
    }
}

#[test]
fn a_company_raises_the_most_its_waves_and_its_great_foes_health() {
    let (week, plan) = plan_where(|zone| zone.deal == Deal::Lamp && passage::lamp_number(zone.depth) == Some(2));
    let mut room = room_of(week, &plan);
    let great = |room: &Room| {
        room.foes.values().find(|foe| foe.brain.rank == foes::Rank::Miniboss).map(|foe| foe.fighter.health_max)
    };
    let (alone, most) = (great(&room).expect("its Miniboss"), room.zone_foes_most());
    for _ in 0..4 {
        diver(&mut room, week, &plan);
    }
    run(&mut room, 1);
    assert_eq!(room.zone_foes_most(), most + 9, "three a player past the first");
    let toughened = great(&room).expect("its Miniboss");
    assert!((toughened / alone - 2.5).abs() < 1e-6, "half its health again a player past the first: {toughened}");

    let (week, plan, mut room) = zone_room(Deal::Mission(Mission::Kindle), None, Route::Public);
    let (one, _) = (diver(&mut room, week, &plan), diver(&mut room, week, &plan));
    run(&mut room, 1);
    let first = room.zone().expect("a zone").round.wave_foes.len();
    let (week_alone, plan_alone, mut alone) = zone_room(Deal::Mission(Mission::Kindle), None, Route::Public);
    diver(&mut alone, week_alone, &plan_alone);
    run(&mut alone, 1);
    let lone = alone.zone().expect("a zone").round.wave_foes.len();
    assert_eq!(first, lone + 1, "the same wave as one player's and a foe more");
    let at =
        |kind: PieceKind| plan.pieces.iter().find(|piece| piece.kind == kind).map(|piece| [piece.at[0], piece.at[1]]);
    let lamp = at(PieceKind::Kindle(0)).expect("a dead lamp");
    stand_at(&mut room, one, [lamp[0] + 1.0, lamp[1]]);
    let foe = *room.zone().expect("a zone").round.wave_foes.first().expect("a wave");
    room.foes.get_mut(&foe).expect("standing").fighter.body =
        crate::standing_on(&room.floor, &room.blocks, lamp[0] + 4.0, lamp[1]);
    let refused = super::passages_tests::refusal(gear::Refusal::FoesNear);
    assert_eq!(room.ask_passage(one, crate::PassageAsk::Kindle { lamp: 0 }), refused, "no kindling with a foe near");
}

#[test]
fn a_reliquary_opens_to_e_held_and_calls_its_keepers_and_a_vein_is_its_nodes_gathered() {
    let (week, plan, mut room) = zone_room(Deal::Reliquary, None, Route::Public);
    let player = diver(&mut room, week, &plan);
    kill_all(&mut room);
    run(&mut room, 2);
    assert!(room.passage_seen(player).is_some_and(|seen| !seen.done), "its guard down is not enough");
    let chest = plan.pieces.iter().find(|piece| piece.kind == PieceKind::Reliquary).expect("a reliquary").at;
    stand_at(&mut room, player, [chest[0] + 1.0, chest[1]]);
    assert_eq!(room.ask_passage(player, crate::PassageAsk::Open), 0);
    assert!(room.zone().is_some_and(|zone| zone.round.waves == 1), "its keepers called");
    for _ in 0..super::passage_holds::OPEN_TICKS + 2 {
        kill_all(&mut room);
        room.players.get_mut(&player).expect("in").fighter.health = 1e9;
        room.tick();
    }
    assert!(room.passage_seen(player).is_some_and(|seen| seen.done), "opened");

    let (week, plan, mut room) = zone_room(Deal::Vein, None, Route::Public);
    let player = diver(&mut room, week, &plan);
    run(&mut room, 1);
    assert!(room.passage_seen(player).is_some_and(|seen| !seen.done));
    for node in 0..u8::try_from(room.resource_nodes.len()).expect("few") {
        // Its first gather's wave comes while its bands stand.
        if node > 0 {
            kill_all(&mut room);
        }
        let waves = room.zone().expect("a zone").round.waves;
        room.vein_gathered(player, node);
        assert_eq!(room.zone().expect("a zone").round.waves, waves + 1, "each gather calls a wave");
    }
    run(&mut room, 1);
    assert!(room.passage_seen(player).is_some_and(|seen| seen.done), "every node gathered, its guard standing or not");
}

#[test]
fn a_holds_ring_a_gauntlets_far_mouth_and_the_deals_targets_are_marked() {
    let (_, plan) = plan_where(|zone| zone.deal == Deal::Mission(Mission::Hold));
    let ring = plan.pieces.iter().find(|piece| piece.kind == PieceKind::Ring).expect("its ring");
    assert_eq!([ring.at[0], ring.at[1]], plan.sites.spots[0]);
    let (_, _, room) = zone_room(Deal::Mission(Mission::Gauntlet), None, Route::Public);
    let sites = &room.zone().expect("a zone").sites;
    assert_eq!(sites.far_mouth().map(|far| sites.onward[far].at), room.far_mouth());
    for (mission, name) in
        [(Mission::Hunt, "The Marked"), (Mission::Reckoning, "Collector"), (Mission::Sever, "Tally Post")]
    {
        let (_, _, room) = zone_room(Deal::Mission(mission), None, Route::Public);
        assert!(room.names.values().any(|named| *named == name), "{mission:?}: {name}");
    }
}

#[test]
fn the_depth_sets_who_stands_a_strand_the_deck_crew_and_the_fourth_lamp_a_boss() {
    use foes::roster::{DECKHAND, HOOKMAN, PISTOLEER, RUNNER, TITHE_MATE};
    let (week, plan) = plan_where(|zone| {
        zone.deal == Deal::Skirmish
            && zone.depth >= 16
            && zone.ground != passage::Ground::Open { form: passage::Form::Strand }
    });
    let deep = standing(&room_of(week, &plan));
    assert!(deep.iter().all(|(_, rank)| *rank != foes::Rank::Minor), "no Minors deep: {deep:?}");
    let (week, plan) = plan_where(|zone| {
        zone.deal == Deal::Skirmish && zone.ground == passage::Ground::Open { form: passage::Form::Strand }
    });
    let strand = standing(&room_of(week, &plan));
    let deck = [DECKHAND, HOOKMAN, PISTOLEER, foes::roster::BOSUN, TITHE_MATE];
    assert!(strand.iter().all(|(number, _)| deck.contains(number)), "the deck crew: {strand:?}");
    assert!(strand.iter().all(|(number, _)| *number != RUNNER));
    let (week, plan) = plan_where(|zone| zone.deal == Deal::Lamp && passage::lamp_number(zone.depth) == Some(3));
    assert!(standing(&room_of(week, &plan)).contains(&(TITHE_MATE, foes::Rank::Miniboss)), "the third lamp's");
    let (week, plan) = plan_where(|zone| zone.deal == Deal::Lamp && passage::lamp_number(zone.depth) == Some(4));
    let bosses: Vec<u8> = gear::activities::ISLAND_PLACES[0].elite.iter().map(|dungeon| dungeon.boss).collect();
    let guard = standing(&room_of(week, &plan));
    assert!(guard.iter().any(|(number, rank)| *rank == foes::Rank::Boss && bosses.contains(number)), "{guard:?}");
}

#[test]
fn a_waves_foes_take_the_zones_currents() {
    let (week, plan) =
        plan_where(|zone| zone.deal == Deal::Mission(Mission::Kindle) && zone.currents.contains(&Current::Crowded));
    let mut room = room_of(week, &plan);
    diver(&mut room, week, &plan);
    run(&mut room, 1);
    let crowded = room.zone().expect("a zone").round.wave_foes.len();
    let mut plain = plan.clone();
    plain.zone.currents.retain(|current| *current != Current::Crowded);
    let mut room = room_of(week, &plain);
    diver(&mut room, week, &plain);
    run(&mut room, 1);
    let alone = room.zone().expect("a zone").round.wave_foes.len();
    assert!(crowded > alone, "Crowded's more in a wave: {crowded} against {alone}");
}

#[test]
fn a_band_held_back_stands_for_a_company_and_never_for_one_alone() {
    let held = (2_900..2_990).find_map(|week| {
        let web = web(week);
        web.zones.iter().filter(|zone| zone.deal == Deal::Skirmish).find_map(|zone| {
            let plan = Plan::of(&web, zone.number)?;
            let room = room_of(week, &plan);
            room.zone().is_some_and(|zone| !zone.held.is_empty()).then_some((week, plan))
        })
    });
    let (week, plan) = held.expect("a skirmish with a band held back");
    let guards = |room: &Room| room.zone().expect("a zone").round.guards.len();
    let mut alone = room_of(week, &plan);
    let player = diver(&mut alone, week, &plan);
    let before = guards(&alone);
    for _ in 0..3 {
        kill_all(&mut alone);
        alone.players.get_mut(&player).expect("in").fighter.health = 1e9;
        alone.tick();
    }
    assert_eq!(guards(&alone), before, "no band more for one alone");
    let mut company = room_of(week, &plan);
    for _ in 0..4 {
        diver(&mut company, week, &plan);
    }
    run(&mut company, 2);
    assert!(guards(&company) > before, "a band more for a company of four");
}

#[test]
fn a_deals_own_waves_are_held_apart_from_its_bands_and_a_strand_hunt_is_led_by_the_deck_crew() {
    let (week, mut plan) = plan_where(|zone| zone.deal == Deal::Vein);
    plan.zone.currents.push(Current::Crowded);
    let mut room = room_of(week, &plan);
    let player = diver(&mut room, week, &plan);
    run(&mut room, 1);
    for node in 0..u8::try_from(room.resource_nodes.len()).expect("few") {
        room.vein_gathered(player, node);
    }
    let zone = room.zone().expect("a zone");
    let waves =
        zone.round.wave_foes.iter().filter(|id| room.foes.get(id).is_some_and(|foe| !foe.fighter.dead())).count();
    let most = match zone.zone.size {
        passage::Size::Small => 7,
        passage::Size::Medium => 9,
        passage::Size::Large => 12,
    };
    assert!(waves <= most + room.crowding(), "{waves} waves' foes past {most}");
    let strand = passage::Ground::Open { form: passage::Form::Strand };
    let (week, plan) = plan_where(|zone| zone.deal == Deal::Mission(Mission::Hunt) && zone.ground == strand);
    let room = room_of(week, &plan);
    let post = room.zone().expect("a zone").round.guards[0];
    let leader = room.garrison[post].standing[0];
    let deck = [foes::roster::BOSUN, foes::roster::TITHE_MATE];
    assert!(deck.contains(&room.foes[&leader].brain.foe_type.number), "the deck crew's Elite leads it");
}

/// Gathers every node of the room's vein as `player` through the gather ask, its foes kept down meanwhile.
fn gather_vein(room: &mut Room, player: PlayerId) {
    for node in 0..u8::try_from(room.resource_nodes.len()).expect("few") {
        let spot = room.resource_nodes[usize::from(node)];
        stand_at(room, player, [spot.x + 0.5, spot.y]);
        kill_all(room);
        room.answer(player, crate::asks::Asked::Gather { node });
        for _ in 0..=crate::asks::GATHER_TICKS {
            kill_all(room);
            room.tick();
        }
    }
}

#[test]
fn a_public_veins_nodes_return_as_a_patrols_so_one_who_gathered_them_after_a_round_can_finish_the_next() {
    let (week, plan, mut room) = zone_room(Deal::Vein, None, Route::Public);
    let first = diver(&mut room, week, &plan);
    run(&mut room, 1);
    for node in 0..u8::try_from(room.resource_nodes.len()).expect("few") {
        room.vein_gathered(first, node);
    }
    run(&mut room, 1);
    assert!(room.zone().is_some_and(|zone| zone.round.done_at.is_some()), "the round done");
    let late = diver(&mut room, week, &plan);
    gather_vein(&mut room, late);
    assert!(room.players[&late].spent.len() == room.resource_nodes.len(), "every node gathered while it was done");
    run(&mut room, super::passage_deal::AGAIN_TICKS);
    assert!(room.zone().is_some_and(|zone| zone.round.done_at.is_none()), "begun again");
    room.set_minute(room.minute + crate::patrol::RETURN_MINUTES);
    run(&mut room, 1);
    gather_vein(&mut room, late);
    run(&mut room, 1);
    assert!(room.passage_seen(late).is_some_and(|seen| seen.done), "alone, they finish the next round");
}

/// The first day from 20_000 whose board posts the passages' bounty for `deed`, its place on the board, and a minute
/// of it.
fn day_posting(deed: gear::objectives::Deed) -> (u64, u8, u64) {
    let wanted = gear::objectives::Objective::Passage(deed);
    for day in 20_000.. {
        let Some(index) = gear::bounties::board(day).iter().position(|bounty| bounty.objective == wanted) else {
            continue;
        };
        let mut minute = day * gear::clock::DAY_MINUTES;
        while gear::clock::day_of(minute) < day {
            minute += gear::clock::minutes_to_next_day(minute).max(1);
        }
        return (day, gear::bounties::town_places().nth(index).expect("a town place"), minute);
    }
    unreachable!("the days run on")
}

#[test]
fn a_vein_counts_toward_the_bounties_of_those_its_cache_paid_once_a_dive_whoever_gathered_which_node() {
    let (day, place, minute) = day_posting(gear::objectives::Deed::Vein);
    let (week, plan, mut room) = zone_room(Deal::Vein, None, Route::Public);
    room.set_minute(minute);
    let (one, other) = (diver(&mut room, week, &plan), diver(&mut room, week, &plan));
    for id in [one, other] {
        room.players.get_mut(&id).expect("in").character.activity.today(day).bounties.insert(place, 0);
    }
    let count = |room: &Room, id: PlayerId| room.players[&id].character.activity.today.bounties[&place];
    let nodes = u8::try_from(room.resource_nodes.len()).expect("few");
    for node in 0..nodes {
        room.vein_gathered(if node < nodes / 2 { one } else { other }, node);
    }
    run(&mut room, 1);
    assert_eq!((count(&room, one), count(&room, other)), (1, 1), "each gathered half, each was paid");
    run(&mut room, super::passage_deal::AGAIN_TICKS + 1);
    for node in 0..nodes {
        kill_all(&mut room);
        room.vein_gathered(one, node);
    }
    run(&mut room, 1);
    assert_eq!(count(&room, one), 1, "the next round's vein, its cache paid already this dive, counts nothing more");
}

#[test]
fn a_gauntlet_pays_each_runner_by_their_own_time_though_two_reach_its_far_mouth_together() {
    let (week, plan, mut room) = zone_room(Deal::Mission(Mission::Gauntlet), None, Route::Public);
    let early = diver(&mut room, week, &plan);
    run(&mut room, super::passage_deal::GAUNTLET_TICKS + 2);
    let fresh = diver(&mut room, week, &plan);
    run(&mut room, 2);
    let far = room.far_mouth().expect("a far mouth");
    for id in [early, fresh] {
        stand_at(&mut room, id, far);
    }
    run(&mut room, 2);
    assert!(dive(&room, fresh).is_some_and(|dive| dive.paid == [plan.zone.number]), "in their 90 s");
    assert!(dive(&room, early).is_some_and(|dive| dive.paid.is_empty() && dive.done), "late: open, no cache");
}

#[test]
fn a_hunt_begun_again_marks_its_first_band_though_fewer_players_are_there() {
    let (week, plan) =
        plan_where(|zone| zone.deal == Deal::Mission(Mission::Hunt) && zone.size == passage::Size::Large);
    let mut room = room_of(week, &plan);
    let company: Vec<PlayerId> = (0..4).map(|_| diver(&mut room, week, &plan)).collect();
    let keep = |room: &mut Room, ticks: u64, marked: Option<usize>| {
        for _ in 0..ticks {
            if let Some(post) = marked {
                for id in room.garrison[post].standing.clone() {
                    let foe = room.foes.get_mut(&id).expect("standing");
                    (foe.fighter.health, foe.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
                }
            }
            for found in room.players.values_mut() {
                found.fighter.health = 1e9;
            }
            room.tick();
        }
    };
    keep(&mut room, 2, None);
    let first = room.zone().expect("a zone").round.guards[0];
    keep(&mut room, 2, Some(first));
    assert!(room.zone().is_some_and(|zone| zone.round.done_at.is_some()), "the Marked down: done");
    for &player in &company[1..] {
        room.leave(player);
    }
    keep(&mut room, super::passage_deal::AGAIN_TICKS + 2, None);
    assert!(room.zone().is_some_and(|zone| zone.round.done_at.is_none()), "begun again");
    let marked: Vec<_> =
        room.names.iter().filter(|(id, named)| **named == "The Marked" && room.foes.contains_key(id)).collect();
    let leads_first = marked.iter().any(|(id, _)| room.garrison[first].standing.first() == Some(id));
    assert!(leads_first, "the Marked leads the first band again: {marked:?}");
}

#[test]
fn a_late_gauntlet_runner_back_from_a_reload_is_still_late() {
    let (week, plan, mut room) = zone_room(Deal::Mission(Mission::Gauntlet), None, Route::Public);
    let early = diver(&mut room, week, &plan);
    assert!(room.own(early, "runner"));
    run(&mut room, super::passage_deal::GAUNTLET_TICKS + 2);
    let character = room.players[&early].character.to_json();
    room.leave(early);
    let again = room.join().expect("joined");
    assert!(room.restore_character(again, &character));
    assert!(room.own(again, "runner"), "owned after its character is given back, as the server does");
    run(&mut room, 2);
    let far = room.far_mouth().expect("a far mouth");
    stand_at(&mut room, again, far);
    run(&mut room, 2);
    assert!(dive(&room, again).is_some_and(|dive| dive.paid.is_empty() && dive.done), "late still: open, no cache");
}

#[test]
fn a_public_round_begun_again_stands_only_the_bands_the_players_there_now_make_room_for() {
    let held = (2_900..2_990).find_map(|week| {
        let web = web(week);
        web.zones.iter().filter(|zone| zone.deal == Deal::Skirmish).find_map(|zone| {
            let plan = Plan::of(&web, zone.number)?;
            let room = room_of(week, &plan);
            room.zone().is_some_and(|zone| !zone.held.is_empty()).then_some((week, plan))
        })
    });
    let (week, plan) = held.expect("a skirmish with a band held back");
    let mut room = room_of(week, &plan);
    let company: Vec<PlayerId> = (0..4).map(|_| diver(&mut room, week, &plan)).collect();
    run(&mut room, 2);
    let guards = |room: &Room| room.zone().expect("a zone").round.guards.len();
    let raised = guards(&room);
    let living = |room: &Room| {
        let posts = room.zone().expect("a zone").round.guards.clone();
        let standing = posts.iter().filter_map(|&post| room.garrison.get(post)).flat_map(|post| post.standing.clone());
        standing.filter(|id| room.foes.get(id).is_some_and(|foe| !foe.fighter.dead())).count()
    };
    for _ in 0..4 {
        kill_all(&mut room);
        room.tick();
    }
    assert!(room.passage_seen(company[0]).is_some_and(|seen| seen.done));
    for &id in &company[1..] {
        room.leave(id);
    }
    run(&mut room, super::passage_deal::AGAIN_TICKS + 2);
    assert!(living(&room) <= room.zone_foes_most(), "one alone faces {} of {}", living(&room), room.zone_foes_most());
    for _ in 1..4 {
        diver(&mut room, week, &plan);
    }
    run(&mut room, 2);
    assert_eq!(guards(&room), raised, "the company back, its bands stand again");
}
