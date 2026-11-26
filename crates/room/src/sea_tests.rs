use super::*;
use crate::clash::tests::at_sea;
use crate::hostiles::Hostile;
use naval::fight::{CAPTAIN, End, Fight, HOSTILE_NEAR_M, PLAYER, Sailor, Vessel};
use naval::ranks::{Commission, GREY_TITHE, Rank};
use sailing::ship::{Helm, SAILS_SET};

/// A ship of a fight, by its number.
fn sailed(fight: &Fight, id: naval::shots::ShipId) -> sailing::ship::Ship {
    fight.vessel(id).map(|vessel| vessel.ship).expect("a ship of the fight")
}

/// One square continent, 100 km a side, its north-west corner 100 km from the frame's: the fourth island, so the sea
/// round it is the Grey Tithe's.
fn sea() -> Sea {
    let text = r#"{ "continents": [{ "id": "continent-4", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    Sea::new(&world::layout::parse(text).unwrap(), crate::deck::test_deck(), 7, &[])
}

fn ship(sea: &Sea, player: PlayerId) -> Ship {
    sea.ships().find(|(each, _)| *each == player).map(|(_, ship)| ship).unwrap()
}

fn ticks(sea: &mut Sea, count: usize) {
    for _ in 0..count {
        sea.tick();
    }
}

/// Sets a course once the wait since the player's last is over.
fn next_course(sea: &mut Sea, player: PlayerId, points: &[[f64; 2]], pace: u16) -> Result<(), CourseRefused> {
    ticks(sea, COURSE_EVERY_TICKS as usize);
    sea.course(player, points, pace)
}

#[test]
fn a_ship_puts_to_sea_at_its_first_point_and_sails_north_at_its_pace() {
    let mut sea = sea();
    let player = sea.join();
    assert_eq!(sea.ships().count(), 0, "not at sea before its first course");
    sea.course(player, &[[50_000.0, 150_000.0], [50_000.0, 50_000.0]], 10).unwrap();
    assert_eq!(ship(&sea, player), Ship { x: 50_000.0, y: 150_000.0, heading: 0.0, pace: 10, rate: 0 });
    ticks(&mut sea, 60);
    let sailed = ship(&sea, player);
    assert!((sailed.y - (150_000.0 - 120.0)).abs() < 1e-6, "a second at 10 × 12 m/s: {}", sailed.y);
    assert_eq!(
        (sailed.x, sailed.heading, sailed.pace, sailed.rate),
        (50_000.0, 0.0, 10, 10),
        "an empty sea holds no one back"
    );
}

#[test]
fn a_ship_turns_onto_each_leg_and_comes_to_rest_at_its_course_end() {
    let mut sea = sea();
    let player = sea.join();
    let course = [[50_000.0, 150_000.0], [50_000.0, 149_000.0], [51_000.0, 149_000.0]];
    sea.course(player, &course, 100).unwrap();
    ticks(&mut sea, 60);
    let turned = ship(&sea, player);
    assert_eq!(turned.y, 149_000.0, "past the corner");
    assert!(turned.x > 50_000.0 && turned.heading == std::f64::consts::FRAC_PI_2, "heading east at {turned:?}");
    ticks(&mut sea, 60);
    assert_eq!(
        ship(&sea, player),
        Ship { x: 51_000.0, y: 149_000.0, heading: std::f64::consts::FRAC_PI_2, pace: 0, rate: 0 }
    );
}

#[test]
fn a_course_that_crosses_or_touches_a_coast_or_stands_on_land_is_refused_whole() {
    let mut sea = sea();
    let player = sea.join();
    let across = [[50_000.0, 150_000.0], [250_000.0, 150_000.0]];
    assert_eq!(sea.course(player, &across, 10), Err(CourseRefused::CrossesLand));
    assert_eq!(next_course(&mut sea, player, &[[150_000.0, 150_000.0]], 10), Err(CourseRefused::CrossesLand));
    assert_eq!(sea.ships().count(), 0, "a refused course puts no ship to sea");
    next_course(&mut sea, player, &[[50_000.0, 150_000.0]], 10).unwrap();
    // From where the ship is, the way to here grazes the continent's north-west corner.
    assert_eq!(next_course(&mut sea, player, &[[150_000.0, 50_000.0]], 10), Err(CourseRefused::CrossesLand));
    assert_eq!(next_course(&mut sea, player, &[[50_000.0, 50_000.0], [150_000.0, 50_000.0]], 10), Ok(()));
}

#[test]
fn a_pace_off_the_steps_a_point_off_the_frame_and_too_long_a_course_are_refused() {
    let mut sea = sea();
    let player = sea.join();
    assert_eq!(sea.course(player, &[[50_000.0, 150_000.0]], 7), Err(CourseRefused::BadPace));
    assert_eq!(next_course(&mut sea, player, &[[-5.0, 150_000.0]], 10), Err(CourseRefused::BadCourse));
    assert_eq!(next_course(&mut sea, player, &[[f64::NAN, 150_000.0]], 10), Err(CourseRefused::BadCourse));
    let long = vec![[50_000.0, 150_000.0]; COURSE_LIMIT + 1];
    assert_eq!(next_course(&mut sea, player, &long, 10), Err(CourseRefused::BadCourse));
    assert_eq!(next_course(&mut sea, player, &[], 10), Err(CourseRefused::BadCourse), "nothing to put to sea at");
    assert_eq!(sea.course(99, &[[50_000.0, 150_000.0]], 10), Err(CourseRefused::NoSuchPlayer));
}

#[test]
fn a_ship_sails_at_the_worlds_own_time_while_the_view_is_close_on_it() {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 150_000.0], [50_000.0, 50_000.0]], 60).unwrap();
    next_course(&mut sea, player, &[[50_000.0, 50_000.0]], WORLD_PACE).unwrap();
    let from = ship(&sea, player);
    ticks(&mut sea, 60);
    let on = ship(&sea, player);
    assert!((from.y - on.y - SHIP_SPEED_M_S).abs() < 1e-6, "a second at 12 m/s: {}", from.y - on.y);
    assert_eq!((on.pace, on.rate), (WORLD_PACE, WORLD_PACE));
}

#[test]
fn off_the_helm_their_planned_course_is_taken_again_at_another_pace_but_no_other_course() {
    let mut sea = sea();
    let player = sea.join();
    let planned = [[50_000.0, 150_000.0], [50_000.0, 50_000.0], [60_000.0, 40_000.0]];
    sea.course(player, &planned, 60).unwrap();
    sea.leave_helm(player).unwrap();
    let ahead = &planned[1..];
    assert_eq!(next_course(&mut sea, player, ahead, WORLD_PACE), Ok(()), "their course, at the world's own time");
    assert_eq!(ship(&sea, player).pace, WORLD_PACE);
    let elsewhere = [[50_000.0, 50_000.0], [40_000.0, 40_000.0]];
    assert_eq!(next_course(&mut sea, player, &elsewhere, WORLD_PACE), Err(CourseRefused::OffTheHelm));
}

#[test]
fn a_player_sets_one_course_each_half_second() {
    let mut sea = sea();
    let player = sea.join();
    let refused = [[50_000.0, 150_000.0], [250_000.0, 150_000.0]];
    assert_eq!(sea.course(player, &refused, 10), Err(CourseRefused::CrossesLand));
    assert_eq!(sea.course(player, &[[50_000.0, 150_000.0]], 10), Err(CourseRefused::TooSoon), "even after a refusal");
    ticks(&mut sea, COURSE_EVERY_TICKS as usize - 1);
    assert_eq!(sea.course(player, &[[50_000.0, 150_000.0]], 10), Err(CourseRefused::TooSoon), "a tick short");
    sea.tick();
    assert_eq!(sea.course(player, &[[50_000.0, 150_000.0]], 10), Ok(()));
}

#[test]
fn a_new_course_starts_from_where_the_ship_is_to_the_nearest_metre() {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 150_000.0], [50_700.0, 140_000.0]], 5).unwrap();
    ticks(&mut sea, COURSE_EVERY_TICKS as usize + 7);
    let between = ship(&sea, player);
    assert!(between.x.fract() != 0.0 && between.y.fract() != 0.0, "mid-metre at {between:?}");
    sea.course(player, &[[40_000.0, between.y.round()]], 5).unwrap();
    let started = ship(&sea, player);
    assert_eq!((started.x, started.y), (between.x.round(), between.y.round()));
    assert_eq!(started.heading, between.heading, "it keeps its heading until it sails");
    ticks(&mut sea, 1);
    assert_eq!(ship(&sea, player).heading, -std::f64::consts::FRAC_PI_2, "west along the judged leg");
}

#[test]
fn an_empty_course_brings_a_ship_to_rest_and_one_who_leaves_takes_their_ship() {
    let mut sea = sea();
    let (first, second) = (sea.join(), sea.join());
    sea.course(first, &[[50_000.0, 150_000.0], [50_000.0, 50_000.0]], 60).unwrap();
    sea.course(second, &[[60_000.0, 150_000.0], [60_000.0, 50_000.0]], 5).unwrap();
    ticks(&mut sea, COURSE_EVERY_TICKS as usize);
    sea.course(first, &[], 5).unwrap();
    let stopped = ship(&sea, first);
    ticks(&mut sea, 10);
    assert_eq!(ship(&sea, first), Ship { pace: 0, rate: 0, ..stopped });
    sea.leave(second);
    assert_eq!(sea.ships().map(|(player, _)| player).collect::<Vec<_>>(), vec![first]);
    assert_eq!(sea.clock(), COURSE_EVERY_TICKS + 10);
}

#[test]
fn a_ship_is_turned_at_rest_by_its_facing_as_often_as_a_course_and_never_off_the_helm() {
    let mut sea = sea();
    let player = sea.join();
    assert_eq!(sea.face(player, 1.0), Err(CourseRefused::BadCourse), "not at sea yet");
    ticks(&mut sea, COURSE_EVERY_TICKS as usize);
    sea.course(player, &[[50_000.0, 150_000.0], [50_000.0, 50_000.0]], 60).unwrap();
    ticks(&mut sea, 30);
    let under_way = ship(&sea, player);
    assert_eq!(sea.face(player, 1.0), Ok(()));
    assert_eq!(ship(&sea, player), Ship { heading: 1.0, pace: 0, rate: 0, ..under_way }, "it comes to rest turned");
    assert_eq!(sea.face(player, 2.0), Err(CourseRefused::TooSoon), "a facing takes a course's turn");
    ticks(&mut sea, COURSE_EVERY_TICKS as usize);
    assert_eq!(sea.face(player, -std::f64::consts::FRAC_PI_2), Ok(()));
    assert!((ship(&sea, player).heading - 1.5 * std::f64::consts::PI).abs() < 1e-12, "a heading kept in one turn");
    ticks(&mut sea, COURSE_EVERY_TICKS as usize);
    assert_eq!(sea.face(player, f64::NAN), Err(CourseRefused::BadCourse));
    sea.leave_helm(player).unwrap();
    ticks(&mut sea, COURSE_EVERY_TICKS as usize);
    assert_eq!(sea.face(player, 0.5), Err(CourseRefused::OffTheHelm), "its helmsman keeps it as it lies");
    ticks(&mut sea, 10);
    assert_eq!((ship(&sea, player).x, ship(&sea, player).y), (under_way.x, under_way.y), "turning moves it nowhere");
}

/// A player at rest at sea far off the square continent, a bold hostile `out` metres north of them.
fn met_at_sea(out: f64) -> (Sea, PlayerId) {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 50_000.0]], 10).unwrap();
    let bold = Hostile::standing(1, 7, Commission::default(), [50_000.0, 50_000.0 - out], 0.0, true);
    sea.hostiles.sailing.push(bold);
    (sea, player)
}

/// A ship at sea at x60, north from (50 km, 90 km), and a hostile `ahead` metres north of it, heading north too.
fn voyage_on(ahead: f64, bold: bool) -> (Sea, PlayerId) {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 90_000.0], [50_000.0, 10_000.0]], 60).unwrap();
    let hostile = Hostile::standing(1, 7, Commission::default(), [50_000.0, 90_000.0 - ahead], 0.0, bold);
    sea.hostiles.sailing.push(hostile);
    (sea, player)
}

#[test]
fn a_voyage_eases_down_as_a_wary_ship_comes_near_along_its_way_and_is_never_held_by_it_to_the_worlds_time() {
    let (mut sea, player) = voyage_on(1_800.0, false);
    let mut sailed = Vec::new();
    for _ in 0..60 * 60 {
        sea.tick();
        let (ship, hostile) = (ship(&sea, player), sea.hostiles()[0]);
        let (east, south) = (hostile.x - ship.x, hostile.y - ship.y);
        sailed.push(((east * east + south * south).sqrt(), ship.rate));
    }
    assert_eq!(sailed[0].1, 60, "1800 m off, ahead: the pace the player set");
    let inside = sailed.iter().position(|&(apart, _)| apart <= HOSTILE_NEAR_M).expect("it comes up on the hostile");
    let rates: Vec<u16> = sailed[..inside].iter().map(|&(_, rate)| rate).collect();
    assert!(rates.windows(2).all(|pair| pair[1] <= pair[0]), "easing down, never back up: {rates:?}");
    assert!(rates.last().is_some_and(|&rate| rate <= 5), "down to the near-enemy pace by its ring: {rates:?}");
    assert!(sailed[inside].0 > HOSTILE_NEAR_M - 2.0, "into its ring a metre at a time: {} m", sailed[inside].0);
    // It will not engage a whole Sloop, so inside its ring the ladder caps the pace and nothing holds it.
    assert!(sailed[inside + 1..].iter().all(|&(_, rate)| rate >= 5), "never held to the world's time: {sailed:?}");
}

#[test]
fn a_course_that_zigzags_toward_a_hostile_or_turns_toward_it_at_once_is_held_as_a_straight_one() {
    // A wary hostile 1640 m north, coming south; 10 m legs north and east by turns, so each tick ends on a leg abeam of
    // it.
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 90_000.0]], 100).unwrap();
    ticks(&mut sea, COURSE_EVERY_TICKS as usize);
    let zigzag: Vec<[f64; 2]> = (1..=64)
        .map(|leg| [50_000.0 + f64::from(leg / 2) * 10.0, 90_000.0 - f64::from((leg + 1) / 2) * 10.0])
        .collect();
    sea.course(player, &zigzag, 100).unwrap();
    let hostile = Hostile::standing(1, 7, Commission::default(), [50_000.0, 88_360.0], std::f64::consts::PI, false);
    sea.hostiles.sailing.push(hostile);
    let mut rates = Vec::new();
    for _ in 0..30 {
        sea.tick();
        rates.push(ship(&sea, player).rate);
    }
    assert!(rates.iter().skip(10).all(|&rate| rate < 100), "held as it nears, as a straight course is: {rates:?}");
    assert!(rates.windows(2).all(|pair| pair[1] <= pair[0]), "easing down, never back up: {rates:?}");
}

#[test]
fn a_course_turned_toward_a_hostile_is_held_on_its_first_tick() {
    // At rest heading north with a wary hostile 1 km south: a course south at once.
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 90_000.0]], 100).unwrap();
    ticks(&mut sea, COURSE_EVERY_TICKS as usize);
    sea.hostiles.sailing.push(Hostile::standing(1, 7, Commission::default(), [50_000.0, 91_000.0], 0.0, false));
    sea.course(player, &[[50_000.0, 99_000.0]], 100).unwrap();
    sea.tick();
    assert!(ship(&sea, player).rate < 100, "held on the first tick: x{}", ship(&sea, player).rate);
}

#[test]
fn a_facing_a_hair_under_north_is_north() {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 90_000.0]], 10).unwrap();
    ticks(&mut sea, COURSE_EVERY_TICKS as usize);
    assert_eq!(sea.face(player, -1e-20), Ok(()));
    assert_eq!(ship(&sea, player).heading, 0.0);
}

#[test]
fn a_voyage_at_speed_meets_a_bold_hostile_ahead_at_the_near_enemy_pace() {
    let (mut sea, player) = voyage_on(1_800.0, true);
    let mut last = 60;
    for _ in 0..60 * 60 {
        sea.tick();
        if sea.fights().next().is_some() {
            break;
        }
        last = ship(&sea, player).rate;
    }
    assert_eq!(sea.fights().next().map(|(fighting, _)| fighting), Some(player), "it took the player on");
    assert!(last <= 5, "the voyage came to its sight at x{last}");
}

#[test]
fn a_bold_hostile_in_sight_begins_a_fight_where_it_and_the_ship_lie() {
    let (mut sea, player) = met_at_sea(700.0);
    sea.tick();
    let (fighting, fought) = sea.fights().next().expect("a fight");
    assert_eq!(fighting, player);
    assert!(sea.hostiles().is_empty(), "it left the sea for the fight");
    let captain = sailed(&fought.fight, CAPTAIN);
    assert!((captain.y - (50_000.0 - 700.0)).abs() < 1.0 && (captain.x - 50_000.0).abs() < 0.01, "{captain:?}");
    assert_eq!((sailed(&fought.fight, PLAYER).rung, captain.rung), (0, SAILS_SET), "hove to, it under sail");
    assert_eq!(sea.course(player, &[[60_000.0, 50_000.0]], 10), Err(CourseRefused::Fighting));
}

#[test]
fn a_fight_steps_by_the_players_orders_and_moves_their_ship_with_it() {
    let (mut sea, player) = met_at_sea(700.0);
    sea.tick();
    let helm = Helm { steer: 1.0, climb: 0 };
    sea.orders(player, Orders { helm, ..QUIET }).unwrap();
    ticks(&mut sea, 600);
    let fought = &sea.fights().next().unwrap().1.fight;
    let other = sailed(fought, PLAYER);
    assert!(other.heading != 0.0, "it answered its helm");
    assert_eq!(ship(&sea, player), Ship { x: other.x, y: other.y, heading: other.heading, pace: 0, rate: 0 });
    assert_eq!(sea.orders(2, QUIET), Err(CourseRefused::Fighting), "no fight, no orders");
}

#[test]
fn a_fight_that_ends_is_shown_once_and_the_player_sails_again() {
    let (mut sea, player) = met_at_sea(700.0);
    sea.tick();
    let fight = &mut sea.fights.of_mut(player).unwrap().0.fight;
    if let Some(Sailor::Captain(command)) = fight.ships.get_mut(&CAPTAIN).map(|vessel| &mut vessel.sailor) {
        command.gone = Some(End::Gone);
    }
    assert_eq!(sea.fights().count(), 1, "shown in the snapshot after the tick it ended");
    sea.tick();
    assert_eq!(sea.fights().count(), 0);
    next_course(&mut sea, player, &[[60_000.0, 50_000.0]], 10).unwrap();
}

#[test]
fn a_wary_hostile_or_one_out_of_sight_begins_no_fight() {
    let (mut sea, _) = met_at_sea(900.0);
    sea.tick();
    assert_eq!(sea.fights().count(), 0);
    sea.hostiles.sailing[0] = Hostile { bold: false, y: 50_000.0 - 500.0, ..sea.hostiles.sailing[0] };
    sea.tick();
    assert_eq!(sea.fights().count(), 0);
}

#[test]
fn a_player_leaves_the_helm_only_at_sea_and_out_of_a_fight_and_walks_while_their_helmsman_keeps_their_course() {
    let mut sea = sea();
    let player = sea.join();
    assert_eq!(sea.leave_helm(player), Err(HelmRefused::NotAtSea));
    sea.course(player, &[[50_000.0, 150_000.0], [50_000.0, 50_000.0]], 10).unwrap();
    assert_eq!(sea.leave_helm(player), Ok(()));
    assert_eq!(sea.leave_helm(player), Err(HelmRefused::AlreadyThere));
    assert_eq!(next_course(&mut sea, player, &[[60_000.0, 150_000.0]], 10), Err(CourseRefused::OffTheHelm));
    let on = ship(&sea, player);
    let ahead = [on.x, on.y - 20_000.0];
    assert_eq!(
        next_course(&mut sea, player, &[[on.x + 5_000.0, on.y - 20_000.0]], 10),
        Err(CourseRefused::OffTheHelm),
        "nor a course off its heading"
    );
    assert_eq!(
        next_course(&mut sea, player, &[ahead, [on.x, on.y - 30_000.0]], 10),
        Err(CourseRefused::OffTheHelm),
        "nor a course of more than one point"
    );
    assert_eq!(
        next_course(&mut sea, player, &[ahead], 10),
        Ok(()),
        "straight on along its heading, at its pace: its helmsman sails on"
    );
    assert_eq!(next_course(&mut sea, player, &[ahead], 60), Ok(()), "at the pace the page eases it to for the view");
    assert_eq!(next_course(&mut sea, player, &[ahead], 7), Err(CourseRefused::BadPace), "but only a pace there is");
    next_course(&mut sea, player, &[ahead], 10).unwrap();
    let before = ship(&sea, player);
    let forward = Controls { forward: 1.0, ..Controls::default() };
    for sequence in 1..=30 {
        sea.walk(player, sequence, forward).unwrap();
        sea.tick();
    }
    assert!(ship(&sea, player).y < before.y - 50.0, "under way, it sails on under its helmsman");
    let (_, walking) = sea.aboard().next().expect("the player on deck");
    assert_eq!(walking.acknowledged, 30);
    assert!(walking.body.y < 2.7 - 1.0, "they walked forward from the wheel, in its frame: {}", walking.body.y);
    assert_eq!(sea.take_helm(player), Err(HelmRefused::NotAtTheWheel));
    let back = Controls { forward: -1.0, ..Controls::default() };
    for sequence in 31..=60 {
        sea.walk(player, sequence, back).unwrap();
        sea.tick();
    }
    assert_eq!(sea.take_helm(player), Ok(()), "back at the wheel");
    assert_eq!(sea.walk(player, 61, forward), Err(WalkRefused::NotAboard));
    assert_eq!(sea.aboard().count(), 0);
}

#[test]
fn a_fight_calls_a_player_off_the_helm_back_to_it_and_one_in_a_fight_keeps_it() {
    let (mut sea, player) = met_at_sea(700.0);
    sea.leave_helm(player).unwrap();
    sea.tick();
    assert_eq!(sea.fights().count(), 1, "a bold hostile in sight begins the fight");
    assert_eq!(sea.aboard().count(), 0, "all hands: the player is back at the helm");
    assert_eq!(sea.leave_helm(player), Err(HelmRefused::Fighting));
}

#[test]
fn a_player_who_leaves_the_room_leaves_their_deck_too() {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 150_000.0]], 10).unwrap();
    sea.leave_helm(player).unwrap();
    sea.leave(player);
    assert_eq!(sea.aboard().count(), 0);
    assert_eq!(sea.take_helm(player), Err(HelmRefused::NoSuchPlayer));
}

#[test]
fn a_ship_met_at_sea_fights_under_its_own_faction_and_rank() {
    let (mut sea, _) = met_at_sea(700.0);
    let commission = sea.hostiles()[0].commission;
    sea.tick();
    let (_, fought) = sea.fights().next().expect("a fight");
    let captain = fought.fight.vessel(CAPTAIN).and_then(naval::fight::Vessel::command);
    assert_eq!(captain.map(|command| command.mind.commission), Some(commission));
    assert_eq!(sea.fight_views().into_iter().map(|seen| seen.captain).collect::<Vec<_>>(), [commission]);
}

/// A player at rest at (50 km, 50 km), and 1 km north of them two ships 400 m apart heading north: a Major of the
/// Grey Tithe, bold or not as asked, then a friendly ship off its route in a Schooner. Neither is within sight of
/// the player.
fn friendly_at_sea(bold: bool) -> (Sea, PlayerId) {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 50_000.0]], 10).unwrap();
    let major = Commission { faction: GREY_TITHE, rank: Rank::Major };
    sea.hostiles.sailing.push(Hostile { y: 49_000.0, ..at_sea(1, major, 49_800.0, bold) });
    let friend = crate::clash::tests::friend_at(77, sailing::HullKind::Schooner, 50_200.0);
    sea.friendlies.back_from_clash(&[], vec![crate::friendlies::Friendly { y: 49_000.0, ..friend }]);
    (sea, player)
}

#[test]
fn a_bold_tithe_ship_attacks_a_friendly_ship_with_no_player_near_and_the_winner_sails_on() {
    let (mut sea, player) = friendly_at_sea(true);
    sea.tick();
    assert_eq!(sea.clashes().len(), 1, "it attacked");
    assert!(sea.hostiles.sailing.is_empty() && sea.friendlies.sailing.is_empty(), "both left the sea for it");
    assert!(sea.fights().next().is_none(), "with no player");
    ticks(&mut sea, 120);
    assert!(sea.clashes()[0].fight.clock > 1.9, "the fight they began goes on: none of them left it");
    let fought: Vec<[f64; 2]> =
        sea.clashes()[0].fight.ships.values().map(|vessel| [vessel.ship.x, vessel.ship.y]).collect();
    let shown: Vec<[f64; 2]> = sea.hostiles().iter().map(|ship| [ship.x, ship.y]).collect();
    let friends: Vec<[f64; 2]> = sea.friendlies().iter().map(|ship| [ship.x, ship.y]).collect();
    assert_eq!([shown, friends].concat(), fought, "shown at sea where the fight has them");
    assert_eq!(sea.friendlies().iter().map(|ship| ship.traffic).collect::<Vec<_>>(), [77]);
    let Some(loser) = sea.clashes[0].fight.ships.get_mut(&CAPTAIN) else { panic!("the Tithe ship") };
    let hull = loser.damage.hull - loser.damage.max_hull * 0.1;
    loser.damage.apply(naval::damage::Hurt { hull, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    sea.tick();
    assert!(sea.clashes().is_empty(), "the Tithe ship struck");
    assert!(sea.hostiles.sailing.is_empty(), "and left the sea");
    assert_eq!(sea.friendlies.sailing.iter().map(|ship| ship.traffic).collect::<Vec<_>>(), [77], "it sails on");
    assert!(sea.fights().next().is_none() && ship(&sea, player).pace == 0, "the player never fought");
}

#[test]
fn a_player_who_comes_within_sight_of_a_clash_joins_it_beside_the_friendly_ship() {
    let (mut sea, player) = friendly_at_sea(true);
    sea.tick();
    next_course(&mut sea, player, &[[50_000.0, 49_200.0]], 5).unwrap();
    for _ in 0..60 * 60 {
        sea.tick();
        if sea.fights().next().is_some() {
            break;
        }
    }
    let (fighting, fought) = sea.fights().next().expect("they joined the fight");
    assert_eq!((fighting, fought.fight.ships.len()), (player, 3), "their Sloop, the Tithe ship and the friendly one");
    assert!(sea.clashes().is_empty() && sea.hostiles().is_empty() && sea.friendlies().is_empty(), "theirs now");
    assert_eq!((sailed(&fought.fight, PLAYER).rung, ship(&sea, player).pace), (0, 0), "hove to");
    let friendly = fought.fight.vessel(CAPTAIN + 1).expect("the friendly ship");
    assert_eq!(friendly.flag(), naval::shots::Flag::Player, "on the players' side");
    let others_at = 2 + 2 * naval::wire::VESSEL_NUMBERS + 4;
    let views: Vec<Vec<f64>> = sea.fight_views().into_iter().map(|seen| seen.numbers).collect();
    let others = &views[0][others_at..others_at + 4];
    assert_eq!(others, [1.0, 2.0, 0.0, 2.0], "their view shows it: one other, ship 2, a friendly ship's, a Major");
    sea.tick();
    let fought = &sea.fights().next().expect("the fight goes on").1.fight;
    let friend = fought.vessel(CAPTAIN + 1).and_then(Vessel::command).map(|command| command.mind.target());
    assert_eq!(friend, Some(Some(CAPTAIN)), "the friendly ship fights the Tithe's, never the player");
}

#[test]
fn a_fight_beside_a_friendly_ship_is_won_once_the_tithe_ship_is_beaten_and_the_friendly_ship_sails_on() {
    let (mut sea, player) = friendly_at_sea(true);
    sea.tick();
    next_course(&mut sea, player, &[[50_000.0, 49_200.0]], 5).unwrap();
    (0..60 * 60).find(|_| {
        sea.tick();
        sea.fights().next().is_some()
    });
    let fought = sea.fights.of_mut(player).expect("their fight").0;
    assert!(fought.hostiles.values().all(|hostile| hostile.id == 1), "the Tithe ship alone is paid for");
    assert_eq!(fought.friends.values().map(|friend| friend.traffic).collect::<Vec<_>>(), [77]);
    let Some(tithe) = fought.fight.ships.get_mut(&CAPTAIN) else { panic!("the Tithe ship") };
    let hull = tithe.damage.hull;
    tithe.damage.apply(naval::damage::Hurt { hull, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    (0..3 * 60 * 60).find(|_| {
        sea.tick();
        sea.fights().next().is_none()
    });
    assert!(sea.fights().next().is_none(), "the fight is won");
    assert_eq!(sea.friendlies.sailing.iter().map(|ship| ship.traffic).collect::<Vec<_>>(), [77], "it sails on");
}

#[test]
fn a_friendly_ship_that_strikes_leaves_the_fight_at_once_and_sails_on_while_the_player_fights_on() {
    let (mut sea, player) = friendly_at_sea(true);
    sea.tick();
    next_course(&mut sea, player, &[[50_000.0, 49_200.0]], 5).unwrap();
    (0..60 * 60).find(|_| {
        sea.tick();
        sea.fights().next().is_some()
    });
    let fought = sea.fights.of_mut(player).expect("their fight").0;
    let Some(friend) = fought.fight.ships.get_mut(&(CAPTAIN + 1)) else { panic!("the friendly ship") };
    let hull = friend.damage.max_hull * 0.95;
    friend.damage.apply(naval::damage::Hurt { hull, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    ticks(&mut sea, 2);
    let (_, fought) = sea.fights().next().expect("the player fights on with the Tithe ship");
    assert!(fought.friends.is_empty(), "the friendly ship left it");
    assert_eq!(sea.friendlies.sailing.iter().map(|ship| ship.traffic).collect::<Vec<_>>(), [77], "and sails on");
}

#[test]
fn a_wary_tithe_ship_never_attacks_and_two_tithe_ships_never_meet() {
    let (mut sea, _) = friendly_at_sea(false);
    ticks(&mut sea, 600);
    assert!(sea.clashes().is_empty(), "a wary one sails by");
    let elite = Commission { faction: GREY_TITHE, rank: Rank::Elite };
    sea.hostiles.sailing.push(Hostile { y: 49_000.0, ..at_sea(2, elite, 49_600.0, true) });
    sea.friendlies.sailing.clear();
    ticks(&mut sea, 600);
    assert!(sea.clashes().is_empty(), "no Tithe ship attacks another");
    assert_eq!(sea.hostiles.sailing.len(), 2);
}

#[test]
fn a_captain_of_each_rank_at_sea_meets_a_player_in_its_ranks_hull() {
    for rank in crate::sighting::RANKS_AT_SEA {
        let (mut sea, _) = met_at_sea(700.0);
        sea.hostiles.sailing[0].commission.rank = rank;
        sea.tick();
        let (_, fought) = sea.fights().next().expect("a fight");
        let hull = fought.fight.vessel(CAPTAIN).map(|vessel| vessel.hull);
        assert_eq!(hull, Some(rank.hull()), "{rank:?}");
        let shown: Vec<_> = sea.fight_views().into_iter().map(|seen| seen.captain.hull()).collect();
        assert_eq!(shown, [rank.hull()], "{rank:?}: the snapshot names its hull");
    }
}

/// A ship at sea at x60, north from (50 km, 400 km), and a ship of the hostiles ahead heading south at it: as far out
/// as one comes for that pace, and sighted from that far.
fn met_head_on(bold: bool) -> (Sea, PlayerId) {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 400_000.0], [50_000.0, 10_000.0]], 60).unwrap();
    let sight = crate::sighting::sight_for(60.0, 1.0);
    let ahead = [50_000.0, 400_000.0 - 0.9 * sight];
    let hostile = Hostile { sight_m: sight, ..Hostile::standing(1, 7, Commission::default(), ahead, PI, bold) };
    sea.hostiles.sailing.push(hostile);
    (sea, player)
}

#[test]
fn a_ship_met_head_on_on_a_voyage_stays_in_sight_half_a_minute_and_more() {
    let (mut sea, player) = met_head_on(false);
    let mut in_sight = 0;
    for _ in 0..10 * 60 * 60 {
        sea.tick();
        let at = ship(&sea, player);
        let Some(hostile) = sea.hostiles().first().copied() else { break };
        if hostile.sees([at.x, at.y]) {
            in_sight += 1;
        }
    }
    assert!(in_sight >= 30 * 60, "in sight {} s", in_sight / 60);
}

#[test]
fn a_bold_ship_met_head_on_holds_the_voyage_down_before_it_takes_the_player_on() {
    let (mut sea, player) = met_head_on(true);
    let mut last = 60;
    for _ in 0..10 * 60 * 60 {
        sea.tick();
        if sea.fights().next().is_some() {
            break;
        }
        last = ship(&sea, player).rate;
    }
    assert_eq!(sea.fights().next().map(|(fighting, _)| fighting), Some(player), "it took the player on");
    assert!(last <= 5, "the voyage came to it at x{last}");
}

/// The number of the ship a test sets at sea by hand, past any the sea's own rolls send in ten minutes.
const SET_AT_SEA: u32 = 900;

/// A ship at sea at x60 from (50 km, 400 km) on `course`, and a bold ship of the hostiles `out` metres off at `at`
/// heading `heading`, sighted from as far as a voyage at that pace sights it.
fn come_for_on(course: &[[f64; 2]], at: [f64; 2], heading: f64, bold: bool) -> (Sea, PlayerId) {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, course, 60).unwrap();
    let sight = crate::sighting::sight_for(60.0, 1.0);
    let hostile =
        Hostile { sight_m: sight, ..Hostile::standing(SET_AT_SEA, 7, Commission::default(), at, heading, bold) };
    sea.hostiles.sailing.push(hostile);
    (sea, player)
}

/// The ticks until the player's fight with the ship set at sea (`SET_AT_SEA`) begins, within ten minutes, every other
/// the sea sends meanwhile let go at once.
fn fight_within_ten_minutes(sea: &mut Sea) -> Option<usize> {
    (0..10 * 60 * 60).find(|_| {
        sea.hostiles.sailing.retain(|hostile| hostile.id == SET_AT_SEA);
        sea.tick();
        sea.fights().next().is_some()
    })
}

#[test]
fn a_bold_ship_sighted_within_its_meeting_cone_meets_a_voyage_that_holds_its_course() {
    // A Major 6 degrees off his course, 0.95 of his sight ahead, heading across it: he sails on north at x60.
    let off = 6.0_f64.to_radians();
    let out = 0.95 * crate::sighting::sight_for(60.0, 1.0);
    let at = [50_000.0 + libm::sin(off) * out, 400_000.0 - libm::cos(off) * out];
    let (mut sea, player) = come_for_on(&[[50_000.0, 400_000.0], [50_000.0, 10_000.0]], at, PI * 1.5, true);
    let mut least = 60;
    let met = (0..10 * 60 * 60).find(|_| {
        sea.tick();
        least = least.min(ship(&sea, player).rate.max(1));
        sea.fights().next().is_some()
    });
    assert!(met.is_some_and(|ticks| ticks < 60 * 60), "it met him within a minute: {met:?}");
    assert!(least <= 5, "the hold eased him only as it came near along his way: x{least}");
}

#[test]
fn a_bold_ship_off_its_meeting_cone_cannot_meet_a_voyage_that_holds_its_course() {
    // A Major 30 degrees off his course, outside its cone: its way cannot meet his.
    let off = 30.0_f64.to_radians();
    let out = 0.95 * crate::sighting::sight_for(60.0, 1.0);
    let at = [50_000.0 + libm::sin(off) * out, 400_000.0 - libm::cos(off) * out];
    let (mut sea, _) = come_for_on(&[[50_000.0, 400_000.0], [50_000.0, 10_000.0]], at, PI * 1.5, true);
    assert!(fight_within_ten_minutes(&mut sea).is_none(), "it cannot reach him");
}

#[test]
fn a_player_who_turns_away_from_a_bold_ship_outruns_it() {
    // It is 10 km north of him; he sails south, away from it.
    let course = [[50_000.0, 400_000.0], [50_000.0, 900_000.0]];
    let (mut sea, player) = come_for_on(&course, [50_000.0, 390_000.0], std::f64::consts::PI, true);
    assert!(fight_within_ten_minutes(&mut sea).is_none(), "evaded");
    assert!(ship(&sea, player).rate == 60, "away from it, never held: x{}", ship(&sea, player).rate);
}

#[test]
fn a_player_who_chases_a_wary_ship_to_within_750_m_begins_the_fight_with_it() {
    // It sails south toward him, wary; he sails north to it.
    let course = [[50_000.0, 400_000.0], [50_000.0, 380_000.0]];
    let (mut sea, player) = come_for_on(&course, [50_000.0, 390_000.0], std::f64::consts::PI, false);
    sea.chase(player, Some(SET_AT_SEA));
    assert!(fight_within_ten_minutes(&mut sea).is_some(), "the player brought the fight");
    let (mut unchased, _) = come_for_on(&course, [50_000.0, 390_000.0], std::f64::consts::PI, false);
    assert!(fight_within_ten_minutes(&mut unchased).is_none(), "a wary ship not chased sails by");
}

#[test]
fn a_fight_with_a_chased_wary_ship_who_will_not_engage_ends_once_it_is_out_of_reach_for_its_give_up_time() {
    let course = [[50_000.0, 400_000.0], [50_000.0, 380_000.0]];
    let (mut sea, player) = come_for_on(&course, [50_000.0, 390_000.0], std::f64::consts::PI, false);
    sea.chase(player, Some(SET_AT_SEA));
    fight_within_ten_minutes(&mut sea).expect("the chase brings the fight");
    // At a fight's pace (`FIGHT_PACE`) it is a while longer out of the chaser's reach before its give-up time runs.
    let bound = (naval::captain::CHASE_GIVE_UP_S + 240.0) as usize * 60;
    let lasted = (0..bound).find(|_| {
        sea.tick();
        !sea.fights.fighting(player)
    });
    assert!(lasted.is_some(), "it broke off within its give-up time and the fight ended for the player too");
}

/// Overlook's island west and the Grey Tithe's east, home waters giving way to the Tithe's 10 km off Overlook's coast: a
/// point 200 m inside their edge, and one 400 m outside it.
fn by_home_waters() -> (Sea, [f64; 2], [f64; 2]) {
    let text = r#"{ "continents": [
        { "id": "continent-1", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] },
        { "id": "continent-4", "outline": [[400000, 100000], [500000, 100000], [500000, 200000], [400000, 200000]] }
    ], "isles": [] }"#;
    let sea = Sea::new(&world::layout::parse(text).unwrap(), crate::deck::test_deck(), 7, &[]);
    let edge = (200_000..350_000)
        .step_by(100)
        .map(f64::from)
        .find(|&x| sea.chart.home([x, 150_000.0]) && !sea.chart.home([x + 100.0, 150_000.0]));
    let edge = edge.expect("the edge of home waters");
    let (inside, outside) = ([edge - 200.0, 150_000.0], [edge + 400.0, 150_000.0]);
    assert!(sea.chart.home(inside) && !sea.chart.home(outside));
    (sea, inside, outside)
}

#[test]
fn a_ship_in_home_waters_is_never_held_by_a_bold_hostile_outside_them() {
    let (mut sea, at, off) = by_home_waters();
    let player = sea.join();
    sea.course(player, &[at, [at[0], at[1] - 10_000.0]], 60).unwrap();
    sea.hostiles.sailing.push(Hostile::standing(1, 7, Commission::default(), off, 0.0, true));
    sea.tick();
    assert!(libm::hypot(off[0] - at[0], off[1] - at[1]) < HOSTILE_NEAR_M);
    assert_eq!(ship(&sea, player).rate, 60, "its pace is its own");
}

#[test]
fn nothing_meets_a_ship_in_home_waters_neither_a_wary_ship_that_would_take_it_nor_a_fight_by_their_edge() {
    let (mut sea, at, off) = by_home_waters();
    let player = sea.join();
    sea.course(player, &[at], 10).unwrap();
    sea.berths.get_mut(&player).unwrap().kept = [0.3, 1.0, 1.0];
    let minor = Commission { faction: naval::ranks::GREY_TITHE, rank: Rank::Minor };
    sea.hostiles.sailing.push(Hostile::standing(1, 7, minor, off, 0.0, false));
    ticks(&mut sea, 2);
    assert!(!sea.fights.fighting(player), "a wary Minor that would take a holed Sloop");
    // Another player met just outside, their fight within sight of the one inside.
    let other = sea.join();
    sea.course(other, &[off], 10).unwrap();
    sea.hostiles.sailing.push(Hostile::standing(2, 7, Commission::default(), [off[0] + 500.0, off[1]], 0.0, true));
    ticks(&mut sea, 2);
    assert!(sea.fights.fighting(other) && !sea.fights.fighting(player), "the fight by their edge");
}

#[test]
fn an_ended_fight_is_shown_in_the_next_snapshot_however_many_ticks_ran_before_it_and_never_twice() {
    let end = |sea: &mut Sea, player: PlayerId| {
        let fight = &mut sea.fights.of_mut(player).unwrap().0.fight;
        if let Some(Sailor::Captain(command)) = fight.ships.get_mut(&CAPTAIN).map(|vessel| &mut vessel.sailor) {
            command.gone = Some(End::Gone);
        }
    };
    let (mut sea, player) = met_at_sea(700.0);
    sea.tick();
    end(&mut sea, player);
    ticks(&mut sea, 2);
    assert_eq!(sea.fights().count(), 0, "the player sails again");
    let shown: Vec<PlayerId> = sea.fight_views().into_iter().map(|seen| seen.player).collect();
    assert_eq!(shown, [player], "its last view, though a tick ran past it");
    sea.fights_sent();
    assert!(sea.fight_views().is_empty(), "once");
    // Shown in the snapshot of the tick it ended, it is not shown again.
    let (mut sea, player) = met_at_sea(700.0);
    sea.tick();
    end(&mut sea, player);
    assert_eq!(sea.fight_views().len(), 1);
    sea.fights_sent();
    ticks(&mut sea, 2);
    assert!(sea.fight_views().is_empty(), "not twice");
}

#[test]
fn a_ships_water_is_named_once_it_puts_to_sea() {
    let mut sea = sea();
    let player = sea.join();
    assert_eq!(sea.water_name(player), None, "no water before its first course");
    sea.course(player, &[[50_000.0, 150_000.0], [50_000.0, 50_000.0]], 10).unwrap();
    assert_eq!(sea.water_name(player), Some("The Sunscorch Coves"), "the fourth island's water");
}
