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

/// A Minor alongside the player, struck, and the player aboard her deck.
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
fn a_player_who_leaves_mid_fight_is_kept_with_her_hurts_as_the_fight_has_them_at_the_port_she_would_wash_up_at() {
    let (mut sea, player) = met(700.0, Rank::Major);
    vessel_mut(&mut sea, player, PLAYER).damage.hull = 120.0;
    let character = kept(&sea, player);
    assert_eq!(character.ship[0], 5_000, "the fight's hurts, not those she had before it");
    assert_eq!(character.ship_at, Some([60_000, 50_000]), "at the nearest port city's roadstead");
    let damage = &mut vessel_mut(&mut sea, player, PLAYER).damage;
    damage.apply(Hurt { hull: damage.hull, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    assert_eq!(damage.state, State::Sinking);
    assert_eq!(kept(&sea, player).ship, [1_000, 2_500, 5_000], "one going down is kept as a sunk ship comes back");
}

#[test]
fn back_at_sea_her_ship_lies_where_the_room_last_kept_her_not_where_the_page_first_put_her() {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[40_000.0, 40_000.0]], 10).unwrap();
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
fn a_repair_stops_as_she_heaves_to_for_a_fight_and_the_fight_starts_from_what_it_mended() {
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
    assert!(sea.harbour.repairs.under_way.is_empty(), "the repair stopped as she hove to");
    let damage = &sea.fights.of_mut(player).unwrap().0.fight.vessel(PLAYER).unwrap().damage;
    assert!((damage.hull - (damage.max_hull * mended).round()).abs() < 1.0 + 1e-9, "{} {mended}", damage.hull);
    ticks(&mut sea, 120);
    assert!(sea.harbour.repairs.under_way.is_empty() && Repair::takes(sea.berths[&player].kept) > 0.0);
}

#[test]
fn a_won_deck_holds_her_boarders_a_minute_then_sends_them_home_and_scuttles_her() {
    let (mut sea, player) = boarded();
    assert_eq!(sea.hold_left(&sea.decks()[0]), None, "her crew still fights");
    for foe in sea.decks.boarded[0].room.foes.values_mut() {
        foe.fighter.action = combat::Action::Dead { elapsed: 0 };
    }
    sea.tick();
    assert!(sea.on_deck(player));
    assert_eq!(sea.hold_left(&sea.decks()[0]), Some(HOLD_TICKS), "the boarders' minute, as the snapshot tells it");
    ticks(&mut sea, 600);
    assert_eq!(sea.hold_left(&sea.decks()[0]), Some(HOLD_TICKS - 600));
    ticks(&mut sea, HOLD_TICKS as usize - 602);
    assert!(sea.on_deck(player), "her hold is theirs for a minute");
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
    assert_eq!(sea.flotsam_for(player).count(), 3, "no character: every piece floats on beside her");
    sea.harbour.characters.insert(player, gear::Character::starting());
    let pieces: Vec<[f64; 2]> = sea.flotsam_for(player).map(|piece| piece.at).collect();
    if let Some(sailing) = sea.berths.get_mut(&player).and_then(|berth| berth.sailing.as_mut()) {
        sailing.ship.x = pieces[0][0];
        sailing.ship.y = pieces[0][1];
    }
    sea.tick();
    assert!(sea.flotsam_for(player).count() < 3, "with one, her ship gathers them");
}

#[test]
fn on_a_deck_her_own_ship_takes_no_orders_and_a_late_character_reaches_the_deck() {
    let (mut sea, player) = boarded();
    assert_eq!(sea.orders(player, crate::battle::QUIET), Err(crate::sea::CourseRefused::Fighting));
    let mut real = gear::Character::starting();
    real.materials.add_aurem(777);
    assert!(sea.restore_character(player, &real.to_json()));
    let on_deck = sea.deck_character(player).unwrap();
    assert_eq!(on_deck.materials.aurem, real.materials.aurem, "the deck fights with the real character");
    // Their gear is sent them from her deck room, which holds that character, once it changes.
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
