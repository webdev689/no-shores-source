use super::*;
use crate::clash::tests::at_sea;
use crate::pirates::Pirate;
use naval::fight::{CAPTAIN, End, HOSTILE_NEAR_M, Sailor};
use naval::ranks::{GREY_TITHE, Rank};

/// A ship of a fight, by its number.
fn sailed(fight: &Fight, id: naval::shots::ShipId) -> sailing::ship::Ship {
    fight.vessel(id).map(|vessel| vessel.ship).expect("a ship of the fight")
}

/// One square continent, 100 km a side, its north-west corner 100 km from the frame's.
fn sea() -> Sea {
    let text = r#"{ "continents": [{ "id": "square", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    Sea::new(&world::layout::parse(text).unwrap(), crate::deck::test_deck(), 7)
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
fn a_ship_sails_at_the_worlds_own_time_while_the_view_is_close_on_her() {
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
fn a_ship_is_turned_at_rest_by_her_facing_as_often_as_a_course_and_never_off_the_helm() {
    let mut sea = sea();
    let player = sea.join();
    assert_eq!(sea.face(player, 1.0), Err(CourseRefused::BadCourse), "not at sea yet");
    ticks(&mut sea, COURSE_EVERY_TICKS as usize);
    sea.course(player, &[[50_000.0, 150_000.0], [50_000.0, 50_000.0]], 60).unwrap();
    ticks(&mut sea, 30);
    let under_way = ship(&sea, player);
    assert_eq!(sea.face(player, 1.0), Ok(()));
    assert_eq!(ship(&sea, player), Ship { heading: 1.0, pace: 0, rate: 0, ..under_way }, "she comes to rest turned");
    assert_eq!(sea.face(player, 2.0), Err(CourseRefused::TooSoon), "a facing takes a course's turn");
    ticks(&mut sea, COURSE_EVERY_TICKS as usize);
    assert_eq!(sea.face(player, -std::f64::consts::FRAC_PI_2), Ok(()));
    assert!((ship(&sea, player).heading - 1.5 * std::f64::consts::PI).abs() < 1e-12, "a heading kept in one turn");
    ticks(&mut sea, COURSE_EVERY_TICKS as usize);
    assert_eq!(sea.face(player, f64::NAN), Err(CourseRefused::BadCourse));
    sea.leave_helm(player).unwrap();
    ticks(&mut sea, COURSE_EVERY_TICKS as usize);
    assert_eq!(sea.face(player, 0.5), Err(CourseRefused::OffTheHelm), "her helmsman keeps her as she lies");
    ticks(&mut sea, 10);
    assert_eq!((ship(&sea, player).x, ship(&sea, player).y), (under_way.x, under_way.y), "turning moves her nowhere");
}

/// A player at rest at sea far off the square continent, a bold pirate `out` metres north of them.
fn met_at_sea(out: f64) -> (Sea, PlayerId) {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 50_000.0]], 10).unwrap();
    let bold = Pirate { id: 1, seed: 7, x: 50_000.0, y: 50_000.0 - out, heading: 0.0, bold: true };
    sea.pirates.sailing.push(bold);
    (sea, player)
}

/// A ship at sea at x60, north from (50 km, 90 km), and a pirate `ahead` metres north of her heading north too.
fn voyage_on(ahead: f64, bold: bool) -> (Sea, PlayerId) {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 90_000.0], [50_000.0, 10_000.0]], 60).unwrap();
    let pirate = Pirate { id: 1, seed: 7, x: 50_000.0, y: 90_000.0 - ahead, heading: 0.0, bold };
    sea.pirates.sailing.push(pirate);
    (sea, player)
}

#[test]
fn a_voyage_eases_down_as_a_pirate_comes_near_along_her_way_and_is_held_by_her_to_the_worlds_time() {
    let (mut sea, player) = voyage_on(1_800.0, false);
    let mut sailed = Vec::new();
    for _ in 0..60 * 60 {
        sea.tick();
        let (ship, pirate) = (ship(&sea, player), sea.pirates()[0]);
        let (east, south) = (pirate.x - ship.x, pirate.y - ship.y);
        sailed.push(((east * east + south * south).sqrt(), ship.rate));
    }
    assert_eq!(sailed[0].1, 60, "1800 m off, ahead: the pace the player set");
    let inside = sailed.iter().position(|&(apart, _)| apart <= HOSTILE_NEAR_M).expect("she comes up on the pirate");
    let rates: Vec<u16> = sailed[..inside].iter().map(|&(_, rate)| rate).collect();
    assert!(rates.windows(2).all(|pair| pair[1] <= pair[0]), "easing down, never back up: {rates:?}");
    assert!(rates.last().is_some_and(|&rate| rate <= 5), "down to the near-enemy pace by her ring: {rates:?}");
    assert!(sailed[inside].0 > HOSTILE_NEAR_M - 2.0, "into her ring a metre at a time: {} m", sailed[inside].0);
    assert!(sailed[inside + 1..].iter().all(|&(_, rate)| rate == 1), "held to the world's time inside it");
}

#[test]
fn a_course_that_zigzags_toward_a_pirate_or_turns_toward_her_at_once_is_held_as_a_straight_one() {
    // A wary pirate 1640 m north, coming south; 10 m legs north and east by turns, so each tick ends on a leg abeam of
    // her.
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 90_000.0]], 100).unwrap();
    ticks(&mut sea, COURSE_EVERY_TICKS as usize);
    let zigzag: Vec<[f64; 2]> = (1..=64)
        .map(|leg| [50_000.0 + f64::from(leg / 2) * 10.0, 90_000.0 - f64::from((leg + 1) / 2) * 10.0])
        .collect();
    sea.course(player, &zigzag, 100).unwrap();
    let pirate = Pirate { id: 1, seed: 7, x: 50_000.0, y: 88_360.0, heading: std::f64::consts::PI, bold: false };
    sea.pirates.sailing.push(pirate);
    let mut rates = Vec::new();
    for _ in 0..30 {
        sea.tick();
        rates.push(ship(&sea, player).rate);
    }
    assert!(rates.iter().skip(10).all(|&rate| rate < 100), "held as she nears, as a straight course is: {rates:?}");
    assert!(rates.windows(2).all(|pair| pair[1] <= pair[0]), "easing down, never back up: {rates:?}");
}

#[test]
fn a_course_turned_toward_a_pirate_is_held_on_its_first_tick() {
    // At rest heading north with a wary pirate 1 km south: a course south at once.
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 90_000.0]], 100).unwrap();
    ticks(&mut sea, COURSE_EVERY_TICKS as usize);
    sea.pirates.sailing.push(Pirate { id: 1, seed: 7, x: 50_000.0, y: 91_000.0, heading: 0.0, bold: false });
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
fn a_voyage_at_speed_meets_a_bold_pirate_ahead_at_the_near_enemy_pace() {
    let (mut sea, player) = voyage_on(1_800.0, true);
    let mut last = 60;
    for _ in 0..60 * 60 {
        sea.tick();
        if sea.fights().next().is_some() {
            break;
        }
        last = ship(&sea, player).rate;
    }
    assert_eq!(sea.fights().next().map(|(fighting, _)| fighting), Some(player), "she took the player on");
    assert!(last <= 5, "the voyage came to her sight at x{last}");
}

#[test]
fn a_bold_pirate_in_sight_begins_a_fight_where_she_and_the_ship_lie() {
    let (mut sea, player) = met_at_sea(700.0);
    sea.tick();
    let (fighting, fought) = sea.fights().next().expect("a fight");
    assert_eq!(fighting, player);
    assert!(sea.pirates().is_empty(), "she left the sea for the fight");
    let captain = sailed(&fought.fight, CAPTAIN);
    assert!((captain.y - (50_000.0 - 700.0)).abs() < 1.0 && (captain.x - 50_000.0).abs() < 1e-6, "{captain:?}");
    assert_eq!((sailed(&fought.fight, PLAYER).rung, captain.rung), (0, SAILS_SET), "hove to, she under sail");
    assert_eq!(sea.course(player, &[[60_000.0, 50_000.0]], 10), Err(CourseRefused::Fighting));
}

#[test]
fn a_fight_steps_by_the_players_orders_and_moves_their_ship_with_it() {
    let (mut sea, player) = met_at_sea(700.0);
    sea.tick();
    let helm = Helm { steer: 1.0, crab: false, climb: 0 };
    sea.orders(player, Orders { helm, ..QUIET }).unwrap();
    ticks(&mut sea, 600);
    let fought = &sea.fights().next().unwrap().1.fight;
    let her = sailed(fought, PLAYER);
    assert!(her.heading != 0.0, "she answered her helm");
    assert_eq!(ship(&sea, player), Ship { x: her.x, y: her.y, heading: her.heading, pace: 0, rate: 0 });
    assert_eq!(sea.orders(2, QUIET), Err(CourseRefused::Fighting), "no fight, no orders");
}

#[test]
fn a_fight_that_ends_is_shown_once_and_the_player_sails_again() {
    let (mut sea, player) = met_at_sea(700.0);
    sea.tick();
    let fight = &mut sea.fights.get_mut(&player).unwrap().fight;
    if let Some(Sailor::Captain(command)) = fight.ships.get_mut(&CAPTAIN).map(|vessel| &mut vessel.sailor) {
        command.gone = Some(End::Gone);
    }
    assert_eq!(sea.fights().count(), 1, "shown in the snapshot after the tick it ended");
    sea.tick();
    assert_eq!(sea.fights().count(), 0);
    next_course(&mut sea, player, &[[60_000.0, 50_000.0]], 10).unwrap();
}

#[test]
fn a_wary_pirate_or_one_out_of_sight_begins_no_fight() {
    let (mut sea, _) = met_at_sea(900.0);
    sea.tick();
    assert_eq!(sea.fights().count(), 0);
    sea.pirates.sailing[0] = Pirate { bold: false, y: 50_000.0 - 500.0, ..sea.pirates.sailing[0] };
    sea.tick();
    assert_eq!(sea.fights().count(), 0);
}

#[test]
fn a_player_leaves_the_helm_only_at_sea_and_out_of_a_fight_and_walks_while_her_helmsman_keeps_her_course() {
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
        "nor a course off her heading"
    );
    assert_eq!(
        next_course(&mut sea, player, &[ahead, [on.x, on.y - 30_000.0]], 10),
        Err(CourseRefused::OffTheHelm),
        "nor a course of more than one point"
    );
    assert_eq!(
        next_course(&mut sea, player, &[ahead], 10),
        Ok(()),
        "straight on along her heading, at her pace: her helmsman sails on"
    );
    assert_eq!(next_course(&mut sea, player, &[ahead], 60), Ok(()), "at the pace the page eases her to for the view");
    assert_eq!(next_course(&mut sea, player, &[ahead], 7), Err(CourseRefused::BadPace), "but only a pace there is");
    next_course(&mut sea, player, &[ahead], 10).unwrap();
    let before = ship(&sea, player);
    let forward = Controls { forward: 1.0, ..Controls::default() };
    for sequence in 1..=30 {
        sea.walk(player, sequence, forward).unwrap();
        sea.tick();
    }
    assert!(ship(&sea, player).y < before.y - 50.0, "under way, she sails on under her helmsman");
    let (_, walking) = sea.aboard().next().expect("the player on deck");
    assert_eq!(walking.acknowledged, 30);
    assert!(walking.body.y < 2.7 - 1.0, "they walked forward from the wheel, in her frame: {}", walking.body.y);
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
    assert_eq!(sea.fights().count(), 1, "a bold pirate in sight begins the fight");
    assert_eq!(sea.aboard().count(), 0, "all hands: the player is back at the helm");
    assert_eq!(sea.leave_helm(player), Err(HelmRefused::Fighting));
}

#[test]
fn a_player_who_leaves_the_room_leaves_her_deck_too() {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 150_000.0]], 10).unwrap();
    sea.leave_helm(player).unwrap();
    sea.leave(player);
    assert_eq!(sea.aboard().count(), 0);
    assert_eq!(sea.take_helm(player), Err(HelmRefused::NoSuchPlayer));
}

#[test]
fn a_ship_met_at_sea_fights_under_her_own_faction_and_rank() {
    let (mut sea, _) = met_at_sea(700.0);
    let commission = sea.pirates()[0].commission();
    sea.tick();
    let (_, fought) = sea.fights().next().expect("a fight");
    let captain = fought.fight.vessel(CAPTAIN).and_then(naval::fight::Vessel::command);
    assert_eq!(captain.map(|command| command.her.commission), Some(commission));
    assert_eq!(sea.fight_views().map(|(_, _, shown)| shown).collect::<Vec<_>>(), [commission]);
}

/// A player at rest at (50 km, 50 km), and 1 km north of them two ships 400 m apart heading north: a bold Elite of
/// the Grey Tithe, then one of `second`, bold or not as asked. Neither is within sight of the player.
fn rivals_at_sea(second: Commission, bold: bool) -> (Sea, PlayerId) {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 50_000.0]], 10).unwrap();
    let elite = Commission { faction: GREY_TITHE, rank: Rank::Elite };
    sea.pirates.sailing.extend([at_sea(1, elite, 49_800.0, true), at_sea(2, second, 50_200.0, bold)]);
    for pirate in &mut sea.pirates.sailing {
        pirate.y = 49_000.0;
    }
    (sea, player)
}

#[test]
fn rival_ships_meet_at_sea_with_no_player_near_fight_where_the_fight_has_them_and_the_winner_sails_on() {
    let (mut sea, player) = rivals_at_sea(Commission::default(), false);
    sea.tick();
    assert_eq!(sea.clashes().len(), 1, "they met");
    assert!(sea.pirates.sailing.is_empty() && sea.fights().next().is_none(), "they left the sea, with no player");
    ticks(&mut sea, 120);
    assert!(sea.clashes()[0].fight.clock > 1.9, "the fight they began goes on: none of them left it");
    let fought: Vec<[f64; 2]> =
        sea.clashes()[0].fight.ships.values().map(|vessel| [vessel.ship.x, vessel.ship.y]).collect();
    let shown: Vec<[f64; 2]> = sea.pirates().iter().map(|pirate| [pirate.x, pirate.y]).collect();
    assert_eq!(shown, fought, "shown at sea where the fight has them");
    assert_eq!(sea.pirates().iter().map(|pirate| pirate.id).collect::<Vec<_>>(), [1, 2]);
    let Some(loser) = sea.clashes[0].fight.ships.get_mut(&(CAPTAIN + 1)) else { panic!("the second ship") };
    let hull = loser.damage.hull - loser.damage.max_hull * 0.2;
    loser.damage.apply(naval::damage::Hurt { hull, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    sea.tick();
    assert!(sea.clashes().is_empty(), "the second struck");
    let sailing: Vec<(u32, [f64; 2])> =
        sea.pirates.sailing.iter().map(|pirate| (pirate.id, [pirate.x, pirate.y])).collect();
    assert_eq!(sailing.len(), 1);
    assert_eq!(sailing[0].0, 1, "the winner sails on");
    assert!(sea.fights().next().is_none() && ship(&sea, player).pace == 0, "the player never fought");
}

#[test]
fn a_player_who_comes_within_sight_of_a_clash_joins_it_and_its_captains_choose_whom_to_fight() {
    let (mut sea, player) = rivals_at_sea(Commission::default(), false);
    sea.tick();
    next_course(&mut sea, player, &[[50_000.0, 49_200.0]], 5).unwrap();
    for _ in 0..60 * 60 {
        sea.tick();
        if sea.fights().next().is_some() {
            break;
        }
    }
    let (fighting, fought) = sea.fights().next().expect("she joined the fight");
    assert_eq!((fighting, fought.fight.ships.len()), (player, 3), "her Sloop, and both captains");
    assert!(sea.clashes().is_empty() && sea.pirates().is_empty(), "the fight is hers now");
    assert_eq!((sailed(&fought.fight, PLAYER).rung, ship(&sea, player).pace), (0, 0), "hove to");
    let others_at = 2 + 2 * naval::wire::VESSEL_NUMBERS + 4;
    let views: Vec<Vec<f64>> = sea.fight_views().map(|(_, view, _)| view).collect();
    assert_eq!(views[0][others_at..others_at + 3], [1.0, 2.0, 2.0], "her view shows the other: the pirates' Major");
    sea.tick();
    let fought = &sea.fights().next().expect("the fight goes on").1.fight;
    let elite = fought.vessel(CAPTAIN).and_then(Vessel::command).map(|command| command.her.target());
    assert_eq!(elite, Some(Some(CAPTAIN + 1)), "the Elite holds her nearer rival against the player");
}

#[test]
fn ships_of_one_faction_never_meet_at_sea() {
    let (mut sea, _) = rivals_at_sea(Commission { faction: GREY_TITHE, rank: Rank::Major }, true);
    ticks(&mut sea, 600);
    assert!(sea.clashes().is_empty());
    assert_eq!(sea.pirates.sailing.len(), 2);
}
