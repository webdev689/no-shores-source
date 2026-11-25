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
    assert!(first >= 3, "a wave of two to four and one more: {first}");
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
