use super::tests::{met, sea, ticks, told, vessel_mut};
use super::*;
use crate::harbour::Repair;
use crate::sea::decks::HOLD_TICKS;
use naval::damage::{Hurt, State};
use naval::fight::{CAPTAIN, PLAYER, Sailor};
use naval::ranks::{Commission, Rank};

fn kept(sea: &Sea, player: PlayerId) -> gear::Character {
    gear::Character::from_json(&sea.kept_character(player).unwrap()).unwrap()
}

/// A Minor alongside the player, struck, and the player aboard its deck.
fn boarded() -> (Sea, PlayerId) {
    let (mut sea, player) = met(20.0, Rank::Minor);
    let clock = sea.fights.of_mut(player).unwrap().0.fight.clock;
    let vessel = vessel_mut(&mut sea, player, CAPTAIN);
    vessel.damage.apply(Hurt { hull: vessel.damage.max_hull * 0.8, sail: 0.0, crew: 0.0, fire: false }, clock, 0.0);
    if let Sailor::Captain(command) = &mut vessel.sailor {
        command.struck_at = Some(clock);
    }
    sea.board(player).unwrap();
    (sea, player)
}

#[test]
fn a_player_who_leaves_mid_fight_is_kept_with_their_hurts_as_the_fight_has_them_at_the_port_they_would_wash_up_at() {
    let (mut sea, player) = met(700.0, Rank::Major);
    vessel_mut(&mut sea, player, PLAYER).damage.hull = 120.0;
    let character = kept(&sea, player);
    assert_eq!(character.ship[0], 5_000, "the fight's hurts, not those they had before it");
    assert_eq!(character.ship_at, Some([60_000, 50_000]), "at the nearest port city's roadstead");
    let damage = &mut vessel_mut(&mut sea, player, PLAYER).damage;
    damage.apply(Hurt { hull: damage.hull, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    assert_eq!(damage.state, State::Sinking);
    assert_eq!(kept(&sea, player).ship, [1_000, 2_500, 5_000], "one going down is kept as a sunk ship comes back");
}

#[test]
fn back_at_sea_their_ship_lies_where_the_room_last_kept_it_not_where_the_page_first_put_it() {
    let mut sea = sea();
    let player = sea.join();
    sea.course_anywhere(player, &[[40_000.0, 40_000.0]], 10).unwrap();
    let mut character = gear::Character::starting();
    character.ship_at = Some([60_000, 50_000]);
    assert!(sea.restore_character(player, &character.to_json()));
    let ship = sea.ships().find(|(each, _)| *each == player).unwrap().1;
    assert_eq!((ship.x, ship.y, ship.pace), (60_000.0, 50_000.0, 0));
    assert_eq!(
        told(&sea, player, crate::harbour::MOORED).map(|numbers| numbers[2..4].to_vec()),
        Some(vec![60_000.0, 50_000.0])
    );
    assert_eq!(kept(&sea, player).ship_at, Some([60_000, 50_000]));
}

#[test]
fn a_repair_stops_as_the_ship_heaves_to_for_a_fight_and_the_fight_starts_from_what_it_mended() {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[58_000.0, 50_000.0]], 10).unwrap();
    sea.tick();
    sea.berths.get_mut(&player).unwrap().kept = [0.5, 1.0, 1.0];
    sea.repair(player).unwrap();
    ticks(&mut sea, 10 * 60);
    let mended = sea.harbour.repairs.under_way[&player].now()[0];
    let bold = crate::pirates::Pirate::standing(1, 7, Commission::default(), [58_000.0, 49_300.0], 0.0, true);
    sea.pirates.sailing.push(bold);
    sea.tick();
    assert!(sea.fights.fighting(player));
    assert!(sea.harbour.repairs.under_way.is_empty(), "the repair stopped as the ship hove to");
    let damage = &sea.fights.of_mut(player).unwrap().0.fight.vessel(PLAYER).unwrap().damage;
    assert!((damage.hull - (damage.max_hull * mended).round()).abs() < 1.0 + 1e-9, "{} {mended}", damage.hull);
    ticks(&mut sea, 120);
    assert!(sea.harbour.repairs.under_way.is_empty() && Repair::takes(sea.berths[&player].kept) > 0.0);
}

#[test]
fn a_won_deck_holds_its_boarders_a_minute_then_sends_them_home_and_scuttles_it() {
    let (mut sea, player) = boarded();
    assert_eq!(sea.hold_left(&sea.decks()[0]), None, "its crew still fights");
    for foe in sea.decks.boarded[0].room.foes.values_mut() {
        foe.fighter.action = combat::Action::Dead { elapsed: 0 };
    }
    sea.tick();
    assert!(sea.on_deck(player));
    assert_eq!(sea.hold_left(&sea.decks()[0]), Some(HOLD_TICKS), "the boarders' minute, as the snapshot tells it");
    ticks(&mut sea, 600);
    assert_eq!(sea.hold_left(&sea.decks()[0]), Some(HOLD_TICKS - 600));
    ticks(&mut sea, HOLD_TICKS as usize - 602);
    assert!(sea.on_deck(player), "its hold is theirs for a minute");
    ticks(&mut sea, 2);
    assert!(!sea.on_deck(player) && sea.decks().is_empty());
    let state = sea.fights.of_mut(player).unwrap().0.fight.vessel(CAPTAIN).unwrap().damage.state;
    assert_eq!(state, State::Sinking);
}

#[test]
fn what_floats_is_gathered_only_by_a_player_whose_character_the_room_holds() {
    let (mut sea, player) = met(60.0, Rank::Minor);
    let vessel = vessel_mut(&mut sea, player, CAPTAIN);
    vessel.damage.hull = 0.0;
    vessel.damage.scuttle();
    ticks(&mut sea, 22 * 60);
    assert_eq!(sea.flotsam_for(player).count(), 3, "no character: every piece floats on beside it");
    sea.harbour.characters.insert(player, gear::Character::starting());
    let pieces: Vec<[f64; 2]> = sea.flotsam_for(player).map(|piece| piece.at).collect();
    if let Some(sailing) = sea.berths.get_mut(&player).and_then(|berth| berth.sailing.as_mut()) {
        sailing.ship.x = pieces[0][0];
        sailing.ship.y = pieces[0][1];
    }
    sea.tick();
    assert!(sea.flotsam_for(player).count() < 3, "with one, their ship gathers them");
}

#[test]
fn on_a_deck_their_own_ship_takes_no_orders_and_a_late_character_reaches_the_deck() {
    let (mut sea, player) = boarded();
    assert_eq!(sea.orders(player, crate::battle::QUIET), Err(crate::sea::CourseRefused::Fighting));
    let mut real = gear::Character::starting();
    real.materials.add_aurem(777);
    assert!(sea.restore_character(player, &real.to_json()));
    let on_deck = sea.deck_character(player).unwrap();
    assert_eq!(on_deck.materials.aurem, real.materials.aurem, "the deck fights with the real character");
    // Their gear is sent them from the captain's deck room, which holds that character, once it changes.
    let (room, boarder) = sea.deck_gear_change(player).expect("the boarder's gear, first sent");
    assert_eq!(room.kept_character(boarder).and_then(|text| gear::Character::from_json(&text)), Some(on_deck));
    assert!(sea.deck_gear_change(player).is_none(), "sent once until it changes");
}

#[test]
fn a_beaten_boarder_whose_ship_is_going_down_comes_back_as_a_sunk_ship_does() {
    let (mut sea, player) = boarded();
    let damage = &mut vessel_mut(&mut sea, player, PLAYER).damage;
    damage.apply(Hurt { hull: damage.hull, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    let boarder = sea.decks.boarded[0].aboard[&player];
    sea.decks.boarded[0].room.players.get_mut(&boarder).unwrap().fighter.action = combat::Action::Dead { elapsed: 0 };
    sea.tick();
    assert_eq!(sea.kept(player).map(|(kept, _)| kept), Some(crate::harbour::SUNK_KEPT));
}

#[test]
fn a_boarder_comes_over_the_captains_rail_on_the_side_their_own_ship_lies() {
    for (aside, side) in [(-12.0, -1.0), (12.0, 1.0)] {
        let (mut sea, player) = met(20.0, Rank::Minor);
        let clock = sea.fights.of_mut(player).unwrap().0.fight.clock;
        let heading = vessel_mut(&mut sea, player, CAPTAIN).ship.heading;
        let other = vessel_mut(&mut sea, player, CAPTAIN).ship;
        // Its starboard lies a quarter turn clockwise of its heading.
        let own = &mut vessel_mut(&mut sea, player, PLAYER).ship;
        (own.x, own.y) = (other.x + aside * libm::cos(heading), other.y + aside * libm::sin(heading));
        let vessel = vessel_mut(&mut sea, player, CAPTAIN);
        vessel.damage.apply(Hurt { hull: vessel.damage.max_hull * 0.8, sail: 0.0, crew: 0.0, fire: false }, clock, 0.0);
        if let Sailor::Captain(command) = &mut vessel.sailor {
            command.struck_at = Some(clock);
        }
        sea.board(player).unwrap();
        let deck = &sea.decks()[0];
        let body = deck.room.player(deck.aboard[&player]).unwrap().fighter.body;
        assert!(body.x * side > 0.4 && body.y.abs() < 1e-9, "{side}: {body:?}");
    }
}

#[test]
fn a_sea_that_keeps_characters_sails_no_course_before_the_keeper_answers_then_the_ship_lies_where_the_keeper_kept_it() {
    let mut sea = sea();
    sea.keep_characters();
    let player = sea.join();
    assert_eq!(sea.course(player, &[[40_000.0, 40_000.0]], 10), Ok(()), "held, not refused");
    sea.tick();
    assert!(sea.ships().all(|(each, _)| each != player), "not at sea before the keeper answered");
    let mut character = gear::Character::starting();
    character.ship_at = Some([60_000, 50_000]);
    assert!(sea.restore_character(player, &character.to_json()));
    sea.tick();
    let ship = sea.ships().find(|(each, _)| *each == player).unwrap().1;
    assert_eq!(
        (ship.x, ship.y, ship.pace),
        (60_000.0, 50_000.0, 0),
        "where the room kept it, the page's spawn dropped"
    );
}

#[test]
fn a_page_whose_character_is_not_kept_sails_its_held_course_once_the_keeper_says_so() {
    let mut sea = sea();
    sea.keep_characters();
    let player = sea.join();
    sea.course(player, &[[58_000.0, 50_000.0]], 10).unwrap();
    sea.course(player, &[[58_500.0, 50_000.0]], 10).unwrap();
    sea.tick();
    assert!(sea.ships().all(|(each, _)| each != player));
    sea.none_kept(player);
    let ship = sea.ships().find(|(each, _)| *each == player).unwrap().1;
    assert_eq!((ship.x, ship.y), (58_500.0, 50_000.0), "the latest course held, put to sea at its first point");
    sea.none_kept(player);
    ticks(&mut sea, 31);
    assert_eq!(sea.course(player, &[[40_000.0, 40_000.0]], 10), Ok(()), "and sails as any ship does after");
    let mut character = gear::Character::starting();
    character.ship_at = Some([60_000, 50_000]);
    let unkept_by_the_page = sea.join();
    sea.none_kept(unkept_by_the_page);
    assert!(sea.restore_character(unkept_by_the_page, &character.to_json()));
}

#[test]
fn a_ship_puts_to_sea_only_by_a_port_citys_roadstead_and_a_new_character_lies_at_overlooks() {
    let mut sea = sea();
    sea.harbour.harbours.ports.push(("overlook".into(), [10_000.0, 10_000.0]));
    sea.keep_characters();
    let far_out = sea.join();
    sea.course(far_out, &[[40_000.0, 40_000.0], [41_000.0, 40_000.0]], 10).unwrap();
    sea.none_kept(far_out);
    assert!(sea.ships().all(|(each, _)| each != far_out), "the page's word puts no ship to sea far from a port");
    ticks(&mut sea, 31);
    assert_eq!(sea.course(far_out, &[[40_000.0, 40_000.0]], 10), Err(crate::sea::CourseRefused::BadCourse));
    // A new character, kept with no place yet, puts to sea by Overlook alone: at its roadstead, wherever else the page
    // asked, or put it before the keeper answered.
    let new = sea.join();
    sea.course(new, &[[40_000.0, 40_000.0]], 10).unwrap();
    let by_east = sea.join();
    sea.none_kept(by_east);
    sea.course(by_east, &[[58_000.0, 50_000.0]], 10).unwrap();
    for player in [new, by_east] {
        assert!(sea.restore_character(player, &gear::Character::starting().to_json()));
        let ship = sea.ships().find(|(each, _)| *each == player).unwrap().1;
        assert_eq!((ship.x, ship.y, ship.pace), (10_000.0, 10_000.0, 0));
        let moored = told(&sea, player, crate::harbour::MOORED).map(|numbers| numbers[2..4].to_vec());
        assert_eq!(moored, Some(vec![10_000.0; 2]));
    }
    // The page's own start off Overlook's harbour, within reach of its roadstead, is where it sails from.
    let off_harbour = sea.join();
    sea.course(off_harbour, &[[11_500.0, 11_000.0], [12_000.0, 12_000.0]], 10).unwrap();
    assert!(sea.restore_character(off_harbour, &gear::Character::starting().to_json()));
    let ship = sea.ships().find(|(each, _)| *each == off_harbour).unwrap().1;
    assert_eq!((ship.x, ship.y, ship.pace), (11_500.0, 11_000.0, 10));
}

#[test]
fn a_character_given_back_mid_fight_ends_that_fight_and_the_ship_lies_where_the_room_last_kept_it() {
    let (mut sea, player) = met(700.0, Rank::Major); // the page put it to sea at (50 km, 50 km)
    let mut character = gear::Character::starting();
    character.ship_at = Some([5_000, 6_000]);
    assert!(sea.restore_character(player, &character.to_json()));
    assert!(!sea.fights.fighting(player), "their fight from the page's spawn is over for them");
    let ship = sea.ships().find(|(each, _)| *each == player).unwrap().1;
    assert_eq!((ship.x, ship.y), (5_000.0, 6_000.0));
    sea.tick();
    assert_eq!(kept(&sea, player).ship_at, Some([5_000, 6_000]), "and is kept there, not by the page's spawn");
}

/// Takes the change flagged for a player's character at sea, if one is due, as the room's door does for its gear.
fn change(sea: &mut Sea, player: PlayerId) -> bool {
    sea.take_character_change(player).is_some()
}

#[test]
fn a_character_given_back_or_washed_up_or_hurt_or_repaired_at_sea_is_flagged_changed_once_and_not_too_often() {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[58_000.0, 50_000.0]], 10).unwrap();
    assert!(!change(&mut sea, player), "no character held, nothing to send");
    assert!(sea.restore_character(player, &gear::Character::starting().to_json()));
    assert!(change(&mut sea, player), "given back");
    assert!(!change(&mut sea, player), "once");
    sea.keep_hurts(player, [0.5, 1.0, 1.0]);
    assert!(!change(&mut sea, player), "not again within GEAR_EVERY_TICKS");
    ticks(&mut sea, crate::players::GEAR_EVERY_TICKS as usize);
    assert!(change(&mut sea, player), "a fight's hurts, once the wait is over");
    sea.repair(player).unwrap();
    ticks(&mut sea, 60);
    assert!(!change(&mut sea, player), "a repair under way changes it every tick but is not sent every tick");
    ticks(&mut sea, 50 * 60);
    assert!(change(&mut sea, player), "a repair done");
    ticks(&mut sea, 20);
    sea.wash_up(player, [50_000.0, 50_000.0], false);
    assert!(change(&mut sea, player), "washed up");
}

#[test]
fn what_their_ship_gathers_at_sea_flags_their_character_changed() {
    let (mut sea, player) = met(60.0, Rank::Minor);
    let vessel = vessel_mut(&mut sea, player, CAPTAIN);
    vessel.damage.hull = 0.0;
    vessel.damage.scuttle();
    ticks(&mut sea, 22 * 60);
    assert!(sea.restore_character(player, &gear::Character::starting().to_json()));
    ticks(&mut sea, 20);
    assert!(change(&mut sea, player));
    ticks(&mut sea, 20);
    assert!(!change(&mut sea, player));
    let piece = sea.flotsam_for(player).next().unwrap().at;
    if let Some(sailing) = sea.berths.get_mut(&player).and_then(|berth| berth.sailing.as_mut()) {
        (sailing.ship.x, sailing.ship.y) = (piece[0], piece[1]);
    }
    sea.tick();
    assert!(sea.flotsam_for(player).count() < 3);
    assert!(change(&mut sea, player), "gathered");
}

#[test]
fn a_disconnect_on_a_captains_deck_saves_the_deck_rooms_character_with_their_hurts_at_the_nearest_port() {
    let (mut sea, player) = boarded();
    vessel_mut(&mut sea, player, PLAYER).damage.hull = 120.0;
    sea.tick();
    let last = kept(&sea, player);
    sea.leave(player);
    assert_eq!(last.ship[0], 5_000);
    assert_eq!(last.ship_at, Some([60_000, 50_000]), "nearest port");
}

#[test]
fn a_sea_of_a_harder_tier_shuts_to_a_character_below_its_level_and_keeps_none() {
    let mut sea = sea();
    sea.set_difficulty(gear::Difficulty::Elite);
    let player = sea.join();
    let low = gear::Character::starting();
    assert_eq!(sea.shut(&low).map(gear::gate::Shut::reason).as_deref(), Some("Elite seas open at level 10."));
    assert!(!sea.restore_character(player, &low.to_json()), "never given");
    assert!(!sea.harbour.characters.contains_key(&player), "nor held");
    sea.set_difficulty(gear::Difficulty::Normal);
    assert_eq!(sea.shut(&low), None, "the Normal sea is open to anyone");
    assert!(sea.restore_character(player, &low.to_json()));
}
