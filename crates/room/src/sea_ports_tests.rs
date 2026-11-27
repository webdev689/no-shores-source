use super::*;
use crate::harbour::{HELD, Harbours, REPAIR_MOST_S};
use crate::hostiles::Hostile;
use naval::damage::{Hurt, State};
use naval::fight::{CAPTAIN, PLAYER, Sailor};
use naval::ranks::{Commission, GREY_TITHE, Rank};

/// A new player handed the Sloop, as the Harbourmaster hands it over in the welcome: one the sea lets in.
pub(super) fn sailor() -> gear::Character {
    let mut character = gear::Character::starting();
    assert!(character.give_first_ship());
    character
}

/// One square continent 100 km a side, its north-west corner 100 km from the frame's, and two port cities' roadsteads
/// out at sea: the first 10 km east of where the tests' ships sail.
pub(super) fn sea() -> Sea {
    let text = r#"{ "continents": [{ "id": "continent-4", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    let mut sea = Sea::new(&world::layout::parse(text).unwrap(), crate::deck::test_deck(), 7, &[]);
    sea.harbour.harbours = Harbours {
        ports: vec![("east".into(), [60_000.0, 50_000.0]), ("far".into(), [5_000.0, 5_000.0])],
        ways: None,
        locked: Vec::new(),
    };
    sea
}

impl Sea {
    /// Sets a player's course as though their ship lay by a port city's roadstead: the tests' and the measurements'
    /// ships put to sea far from their port cities, so these stand aside while it is set.
    pub(crate) fn course_anywhere(
        &mut self,
        player: PlayerId,
        points: &[[f64; 2]],
        pace: u16,
    ) -> Result<(), crate::sea::CourseRefused> {
        let ports = std::mem::take(&mut self.harbour.harbours);
        let set = self.course(player, points, pace);
        self.harbour.harbours = ports;
        set
    }
}

/// Each piece floating for `player`.
pub(super) fn floating_for(sea: &Sea, player: PlayerId) -> impl Iterator<Item = &crate::flotsam::Floating> {
    sea.flotsam().iter().filter(move |piece| piece.player == player)
}

pub(super) fn ticks(sea: &mut Sea, count: usize) {
    for _ in 0..count {
        sea.tick();
    }
}

/// A sea with a player at rest at (50 km, 50 km) and a bold ship of `rank` `out` metres north of them, met next tick.
pub(super) fn met(out: f64, rank: Rank) -> (Sea, PlayerId) {
    let mut sea = sea();
    let player = sea.join();
    sea.course_anywhere(player, &[[50_000.0, 50_000.0]], 10).unwrap();
    let commission = Commission { faction: GREY_TITHE, rank };
    let bold = Hostile { level: 9, ..Hostile::standing(1, 7, commission, [50_000.0, 50_000.0 - out], 0.0, true) };
    sea.hostiles.sailing.push(bold);
    sea.tick();
    assert!(sea.fights.fighting(player));
    (sea, player)
}

pub(super) fn vessel_mut(sea: &mut Sea, player: PlayerId, ship: naval::shots::ShipId) -> &mut naval::fight::Vessel {
    sea.fights.of_mut(player).unwrap().0.fight.ships.get_mut(&ship).unwrap()
}

pub(super) fn told(sea: &Sea, player: PlayerId, code: f64) -> Option<Vec<f64>> {
    sea.harbour
        .told
        .iter()
        .find(|(to, numbers)| *to == player && numbers.first() == Some(&code))
        .map(|(_, numbers)| numbers.clone())
}

#[test]
fn a_voyage_sails_at_its_paces_way_by_the_canvas_it_keeps_never_under_half() {
    let mut sea = sea();
    let player = sea.join();
    sea.course_anywhere(player, &[[50_000.0, 50_000.0]], 10).unwrap();
    sea.tick();
    let ticks_waited = super::super::COURSE_EVERY_TICKS as usize;
    for (canvas, way) in [(0.8, 0.8), (0.2, 0.5)] {
        ticks(&mut sea, ticks_waited);
        sea.berths.get_mut(&player).unwrap().kept = [1.0, canvas, 1.0];
        // A course starts from where it is, to the whole metre.
        let from = sea.ships().find(|(each, _)| *each == player).unwrap().1.x.round();
        sea.course(player, &[[90_000.0, 50_000.0]], 10).unwrap();
        sea.tick();
        let gone = sea.ships().find(|(each, _)| *each == player).unwrap().1.x - from;
        let whole = 10.0 * super::super::SHIP_SPEED_M_S * movement::TICK_SECONDS;
        assert!((gone - whole * way).abs() < 1e-9, "{canvas}: {gone} of {whole}");
    }
}

#[test]
fn a_wary_ship_meets_a_player_whose_sloop_it_outguns_and_lets_a_sound_one_be() {
    let mut sea = sea();
    let player = sea.join();
    sea.course_anywhere(player, &[[50_000.0, 50_000.0]], 10).unwrap();
    let minor = Commission { faction: GREY_TITHE, rank: Rank::Minor };
    sea.hostiles.sailing.push(Hostile::standing(1, 7, minor, [50_000.0, 49_400.0], 0.0, false));
    sea.tick();
    assert!(!sea.fights.fighting(player), "a wary Minor lets a sound Sloop be");
    sea.berths.get_mut(&player).unwrap().kept = [0.3, 1.0, 1.0];
    sea.tick();
    assert!(sea.fights.fighting(player), "it falls on one holed under GRAPPLE_HULL");
}

#[test]
fn a_player_whose_ship_goes_down_washes_up_at_the_nearest_port_city_their_hurts_a_sunk_ships() {
    let (mut sea, player) = met(700.0, Rank::Major);
    let vessel = vessel_mut(&mut sea, player, PLAYER);
    vessel.damage.apply(Hurt { hull: vessel.damage.hull, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    assert_eq!(vessel.damage.state, State::Sinking);
    let mut washed = None;
    for _ in 0..25 * 60 {
        sea.tick();
        washed = washed.or_else(|| told(&sea, player, WASHED_UP));
    }
    assert_eq!(washed, Some(vec![WASHED_UP, washed.as_ref().unwrap()[1], 0.0, 1.0, 0.0]), "at the first port, sunk");
    let ship = sea.ships().find(|(each, _)| *each == player).unwrap().1;
    assert_eq!((ship.x, ship.y, ship.pace), (60_000.0, 50_000.0, 0), "moored at its roadstead");
    assert_eq!(sea.kept(player), Some((SUNK_KEPT, 0.0)));
    assert!(!sea.fights.fighting(player));
}

#[test]
fn a_ships_hurts_are_kept_after_a_fight_and_it_starts_the_next_with_them() {
    let (mut sea, player) = met(700.0, Rank::Major);
    vessel_mut(&mut sea, player, PLAYER).damage.hull = 120.0;
    if let Sailor::Captain(command) = &mut vessel_mut(&mut sea, player, CAPTAIN).sailor {
        command.gone = Some(naval::fight::End::Gone);
    }
    ticks(&mut sea, 2);
    assert!(!sea.fights.fighting(player));
    let (kept, _) = sea.kept(player).unwrap();
    assert!((kept[0] - 0.5).abs() < 1e-9, "{kept:?}");
    let bold = Hostile::standing(2, 9, Commission::default(), [50_000.0, 49_300.0], 0.0, true);
    sea.hostiles.sailing.push(bold);
    sea.tick();
    let hull = sea.fights.of_mut(player).unwrap().0.fight.vessel(PLAYER).unwrap().damage.hull;
    assert_eq!(hull, 120.0);
}

#[test]
fn a_ships_hurts_are_kept_in_the_players_character_across_sessions() {
    let mut sea = sea();
    let player = sea.join();
    sea.course_anywhere(player, &[[50_000.0, 50_000.0]], 10).unwrap();
    let mut character = sailor();
    character.ship = [5_000, 10_000, 2_500];
    assert!(sea.restore_character(player, &character.to_json()));
    assert_eq!(sea.kept(player), Some(([0.5, 1.0, 0.25], 0.0)));
    sea.stop_repair(player);
    let kept = gear::Character::from_json(&sea.kept_character(player).unwrap()).unwrap();
    assert_eq!(kept.ship, [5_000, 10_000, 2_500]);
}

#[test]
fn by_a_port_at_rest_a_ship_is_repaired_free_over_a_second_a_hundredth_and_sailing_stops_it_where_it_stood() {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[60_000.0, 50_000.0]], 10).unwrap();
    sea.tick();
    sea.berths.get_mut(&player).unwrap().kept = [0.6, 0.8, 1.0];
    assert_eq!(sea.repair(player), Ok(()));
    ticks(&mut sea, 20 * 60);
    let (kept, left) = sea.kept(player).unwrap();
    assert!((kept[0] - 0.8).abs() < 1e-6 && (left - 20.0).abs() < 1e-6, "{kept:?} {left}");
    ticks(&mut sea, 20 * 60 + 1);
    assert_eq!(sea.kept(player), Some(([1.0; 3], 0.0)));
    assert_eq!(sea.repair(player), Err(RepairRefused::Whole));
    sea.berths.get_mut(&player).unwrap().kept = [0.0; 3];
    sea.repair(player).unwrap();
    ticks(&mut sea, 30 * 60);
    sea.course(player, &[[58_500.0, 50_000.0]], 10).unwrap();
    let (kept, left) = sea.kept(player).unwrap();
    assert!((kept[0] - 30.0 / REPAIR_MOST_S).abs() < 1e-6 && left == 0.0, "stopped where it stood: {kept:?}");
    let far = sea.join();
    sea.course_anywhere(far, &[[50_000.0, 50_000.0]], 10).unwrap();
    sea.tick();
    sea.berths.get_mut(&far).unwrap().kept = [0.5; 3];
    assert_eq!(sea.repair(far), Err(RepairRefused::NotThere), "10 km from the nearest roadstead");
}

#[test]
fn a_captain_that_sinks_lays_what_floats_for_the_player_who_fought_it_and_their_ship_gathers_it() {
    let (mut sea, player) = met(60.0, Rank::Minor);
    if let Some(vessel) = sea.fights.of_mut(player).map(|(fought, _)| fought.fight.ships.get_mut(&CAPTAIN).unwrap()) {
        vessel.damage.hull = 0.0;
        vessel.damage.scuttle();
    }
    let mut laid = Vec::new();
    for _ in 0..22 * 60 {
        sea.tick();
        laid.extend(sea.take_told().into_iter().filter(|(_, numbers)| numbers[0] == 17.0));
    }
    assert_eq!(laid.len(), 3, "a Minor lays three pieces for its one player");
    assert!(laid.iter().all(|(to, _)| *to == player));
    let pieces: Vec<_> = floating_for(&sea, player).copied().collect();
    assert_eq!(pieces.len(), 3);
    assert!(pieces.iter().all(|piece| piece.level == 9), "rolled at its level");
    // Its ship brought onto them gathers them, each told with what it held, the ship's materials among it.
    sea.harbour.characters.insert(player, sailor());
    let mut held = Vec::new();
    for piece in pieces {
        let ship = &mut sea.berths.get_mut(&player).unwrap().sailing.as_mut().unwrap().ship;
        [ship.x, ship.y] = piece.at;
        sea.tick();
        held.extend(sea.take_told().into_iter().filter(|(_, numbers)| numbers[0] == HELD));
    }
    assert_eq!(held.len(), 3, "each piece told: {held:?}");
    let materials = |numbers: &[f64]| numbers[6..10].iter().sum::<f64>();
    assert!(held.iter().all(|(_, numbers)| numbers.len() == 11 && materials(numbers) > 0.0), "{held:?}");
    let stock = sea.harbour.characters[&player].materials.ship;
    let told: f64 = held.iter().map(|(_, numbers)| materials(numbers)).sum();
    assert_eq!(told, f64::from(stock.timber + stock.canvas + stock.iron + stock.heartwood), "what it took, told");
}

#[test]
fn a_boarder_fights_a_captains_crew_on_its_deck_opens_its_hold_and_it_is_scuttled_when_the_last_leaves() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    assert!(sea.board(player).is_err(), "it has not struck");
    let clock = sea.fights.of_mut(player).unwrap().0.fight.clock;
    let vessel = vessel_mut(&mut sea, player, CAPTAIN);
    vessel.damage.apply(Hurt { hull: vessel.damage.max_hull * 0.8, sail: 0.0, crew: 0.0, fire: false }, clock, 0.0);
    vessel.ship.ahead = 0.0;
    if let Sailor::Captain(command) = &mut vessel.sailor {
        command.struck_at = Some(clock);
    }
    assert_eq!(sea.board(player), Ok(()));
    assert!(sea.on_deck(player));
    sea.tick();
    let events = &sea.fights.of_mut(player).unwrap().0.events;
    assert!(events.contains(&naval::fight::Event::Boarding { ship: CAPTAIN }), "told with the next tick's");
    assert_eq!(sea.course(player, &[[50_500.0, 50_000.0]], 10), Err(crate::sea::CourseRefused::Fighting));
    assert_eq!(sea.decks()[0].room.foes.len(), 3, "a Minor's three hands");
    assert_eq!(sea.leave_deck(player), Err(crate::sea::decks::LeaveRefused::Fighting));
    for foe in sea.decks.boarded[0].room.foes.values_mut() {
        foe.fighter.action = combat::Action::Dead { elapsed: 0 };
    }
    sea.tick();
    let hold = floating_for(&sea, player).count();
    assert_eq!(hold, 6, "its hold: what floats, twice over");
    assert_eq!(sea.leave_deck(player), Ok(()));
    assert!(!sea.on_deck(player) && sea.decks().is_empty());
    let state = sea.fights.of_mut(player).unwrap().0.fight.vessel(CAPTAIN).unwrap().damage.state;
    assert_eq!(state, State::Sinking, "scuttled once the last boarder left it");
}

#[test]
fn boarders_all_beaten_on_its_deck_wash_up_with_their_ships_hurts_and_it_is_scuttled() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    let clock = sea.fights.of_mut(player).unwrap().0.fight.clock;
    let vessel = vessel_mut(&mut sea, player, CAPTAIN);
    vessel.damage.apply(Hurt { hull: vessel.damage.max_hull * 0.8, sail: 0.0, crew: 0.0, fire: false }, clock, 0.0);
    sea.board(player).unwrap();
    vessel_mut(&mut sea, player, PLAYER).damage.hull = 120.0;
    let boarder = sea.decks.boarded[0].aboard[&player];
    sea.decks.boarded[0].room.players.get_mut(&boarder).unwrap().fighter.action = combat::Action::Dead { elapsed: 0 };
    sea.tick();
    assert!(!sea.on_deck(player) && !sea.fights.fighting(player));
    assert_eq!(
        told(&sea, player, WASHED_UP).map(|numbers| numbers[2..].to_vec()),
        Some(vec![0.0, 0.0, 0.0]),
        "beaten, not sunk"
    );
    let (hurts, _) = sea.kept(player).unwrap();
    assert!((hurts[0] - 0.5).abs() < 1e-9, "moored with its hurts: {hurts:?}");
}

#[test]
fn a_fight_takes_the_weather_where_it_began_and_keeps_it() {
    let (mut sea, player) = met(700.0, Rank::Major);
    let (swell, wind) = sea.weather.at([50_000.0, 50_000.0], 1.0 / 60.0);
    let fought = &sea.fights.of_mut(player).unwrap().0;
    assert_eq!((fought.swell.bearing, fought.wind), (swell.bearing, wind));
    ticks(&mut sea, 120);
    assert_eq!(sea.fights.of_mut(player).unwrap().0.wind, wind, "kept while it lasts");
}

#[test]
fn a_ship_that_goes_down_counts_once_toward_the_sea_bounty_of_each_kept_player_who_fought_her() {
    let (mut sea, player) = met(60.0, Rank::Elite);
    let friday_nine = 29_919_420;
    sea.minute = friday_nine;
    let day = gear::clock::day_of(friday_nine);
    let place = gear::bounties::board(day)
        .iter()
        .position(|bounty| matches!(bounty.objective, gear::objectives::Objective::Sink { .. }))
        .and_then(|place| u8::try_from(place).ok())
        .expect("the board holds a sea bounty");
    let mut character = sailor();
    character.activity.today = gear::activity::Today { day, bounties: [(place, 0)].into(), ..Default::default() };
    assert!(sea.restore_character(player, &character.to_json()));
    let fought = &mut sea.fights.of_mut(player).unwrap().0;
    fought.fought.push(player);
    let vessel = fought.fight.ships.get_mut(&CAPTAIN).unwrap();
    vessel.damage.hull = 0.0;
    vessel.damage.scuttle();
    sea.harbour.changed.clear();
    ticks(&mut sea, 22 * 60);
    let held = &sea.harbour.characters[&player];
    assert_eq!(held.activity.today.bounties.get(&place), Some(&1), "once, though listed twice among her fighters");
    assert!(sea.harbour.changed.contains(&player), "the count is saved and sent");
}

#[test]
fn what_a_fight_owes_a_player_who_rejoined_goes_to_their_new_number_once() {
    let (mut sea, ada) = met(20.0, Rank::Minor);
    assert!(sea.own(ada, "ada"));
    let ben = sea.join();
    sea.course_anywhere(ben, &[[50_010.0, 50_000.0]], 10).unwrap();
    sea.tick();
    assert!(sea.fights.fighting(ben), "ben keeps the fight going");
    sea.leave(ada);
    let again = sea.join();
    assert!(sea.own(again, "ada"));
    sea.course_anywhere(again, &[[49_990.0, 50_000.0]], 10).unwrap();
    sea.tick();
    assert!(sea.fights.fighting(again), "back in the same fight");
    let captain = sea.fights.of_mut(ben).unwrap().0.fight.ships.get_mut(&CAPTAIN).unwrap();
    captain.damage.apply(Hurt { hull: 1e6, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    ticks(&mut sea, (naval::damage::SINK_SECONDS * 60.0) as usize + 10);
    let count = |player| sea.harbour.flotsam.pieces.iter().filter(|piece| piece.player == player).count();
    assert!(count(ben) > 0, "it sank and floats for ben");
    assert_eq!((count(ada), count(again)), (0, count(ben)), "nothing for the old number, once for the new");
}

#[test]
fn a_repair_begun_unkept_stops_as_the_kept_character_comes_and_mends_nothing_of_theirs() {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[60_000.0, 50_000.0]], 10).unwrap();
    sea.tick();
    sea.berths.get_mut(&player).unwrap().kept = [0.5; 3];
    assert_eq!(sea.repair(player), Ok(()), "by a port, played unkept");
    let mut character = sailor();
    character.ship = [1_000, 1_000, 1_000];
    character.ship_at = Some([50_000, 50_000]);
    assert!(sea.restore_character(player, &character.to_json()));
    ticks(&mut sea, 100 * 60);
    let (kept, left) = sea.kept(player).unwrap();
    assert!((kept[0] - 0.1).abs() < 1e-6 && left == 0.0, "the kept ship, 10 km from a port, as it was: {kept:?}");
}
