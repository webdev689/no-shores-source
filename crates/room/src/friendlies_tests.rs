use super::*;
use crate::clash::tests::at_sea;
use naval::ranks::{GREY_TITHE, Rank};
use world::traffic::{DWELL_S, SPEED_M_S};

/// The world's own traffic between its port cities.
fn traffic() -> Traffic {
    let (layout, ports) = crate::measure_tests::world();
    let waters = world::waters::Waters::new(&layout);
    Traffic::new(&layout, &waters, &ports)
}

const TIME: f64 = 1_795_000_000.0;

/// A friendly ship of the traffic under way at `TIME`, out on the open sea of its route.
fn under_way(traffic: &Traffic) -> TrafficShip {
    let centre = traffic.roadsteads.first().map_or([0.0; 2], |at| [at.x as f64, at.y as f64]);
    let ships = traffic.ships_near(centre, 2_000_000.0, TIME);
    let far = |ship: &&TrafficShip| ship.progress_m > 30_000.0 && ship.length_m - ship.progress_m > 30_000.0;
    ships.iter().find(far).cloned().expect("a ship under way, far from either port")
}

/// A Tithe ship of `rank`, bold or not, numbered 7, `off` metres east of `ship`.
fn tithe_by(ship: &TrafficShip, rank: Rank, bold: bool, off: f64) -> Hostile {
    let commission = Commission { faction: GREY_TITHE, rank };
    let hostile = at_sea(7, commission, ship.position[0] + off, bold);
    Hostile { y: ship.position[1], level: 12, sight_m: 9_000.0, ..hostile }
}

#[test]
fn a_bold_tithe_ship_within_engage_range_of_a_friendly_ship_under_way_attacks_it_and_takes_it_off_its_route() {
    let traffic = traffic();
    let ship = under_way(&traffic);
    let mut hostiles = Hostiles::default();
    hostiles.sailing.push(tithe_by(&ship, Rank::Minor, true, 0.0));
    let mut friendlies = Friendlies::default();
    let met = friendlies.meet(&mut hostiles, (Some(&traffic), &Open), TIME);
    assert_eq!(met.len(), 1, "they met");
    let (tithe, friend) = met[0];
    assert!(hostiles.sailing.is_empty(), "the Tithe ship left the sea for the clash");
    assert_eq!((tithe.id, friend.traffic), (7, ship.id));
    let hull = HullKind::numbered(ship.hull).expect("a hull the naval crate sails");
    assert_eq!((friend.hull, friend.level, friend.sight_m), (hull, 12, 9_000.0), "its own hull, the Tithe's level");
    assert_eq!((friend.x, friend.y), (ship.position[0], ship.position[1]));
    let far = traffic.roadsteads[ship.to_port];
    assert_eq!(friend.to, [far.x as f64, far.y as f64], "bound for its route's far port");
    assert_eq!(friendly_commission(), Commission { faction: naval::ranks::PLAYERS, rank: Rank::Major });
    let ends = TIME + (ship.length_m - ship.progress_m) / SPEED_M_S + DWELL_S;
    assert_eq!(friendlies.taken().collect::<Vec<_>>(), [ship.id], "its id taken");
    friendlies.sail(1.0, &[], (None, &Open), ends - 1.0);
    assert_eq!(friendlies.taken().count(), 1, "until its voyage would have ended");
    friendlies.sail(1.0, &[], (None, &Open), ends + 1.0);
    assert_eq!(friendlies.taken().count(), 0, "then its id is free");
}

#[test]
fn a_wary_tithe_ship_a_sea_with_no_traffic_and_a_ship_lying_at_its_roadstead_never_meet() {
    let traffic = traffic();
    let ship = under_way(&traffic);
    let mut friendlies = Friendlies::default();
    let mut hostiles = Hostiles::default();
    hostiles.sailing.push(tithe_by(&ship, Rank::Minor, false, 0.0));
    assert!(friendlies.meet(&mut hostiles, (Some(&traffic), &Open), TIME).is_empty(), "wary");
    hostiles.sailing.push(tithe_by(&ship, Rank::Elite, true, 0.0));
    assert!(friendlies.meet(&mut hostiles, (None, &Open), TIME).is_empty(), "a sea with no traffic");
    let later = TIME + (ship.length_m - ship.progress_m) / SPEED_M_S + 60.0;
    let lying = traffic.ship(ship.id, later).expect("arrived, lying at its roadstead");
    let mut hostiles = Hostiles::default();
    hostiles.sailing.push(tithe_by(&lying, Rank::Minor, true, 0.0));
    let met = friendlies.meet(&mut hostiles, (Some(&traffic), &Open), later);
    assert!(met.iter().all(|(_, friend)| friend.traffic != ship.id), "one lying at its roadstead is not attacked");
}

#[test]
fn a_friendly_ship_that_parted_from_a_tithe_ship_meets_it_again_only_once_they_were_out_of_range() {
    let tithe = Hostile { y: 0.0, ..at_sea(7, Commission { faction: GREY_TITHE, rank: Rank::Minor }, 0.0, true) };
    let (mut hostiles, mut friendlies) = (Hostiles::default(), Friendlies::default());
    hostiles.back_from_clash(vec![tithe]);
    let friend = crate::clash::tests::friend_at(5, HullKind::Sloop, 400.0);
    friendlies.back_from_clash(&[tithe.id], vec![friend]);
    assert!(friendlies.meet(&mut hostiles, (None, &Open), TIME).is_empty(), "they parted");
    friendlies.sailing[0].x = 2_000.0;
    assert!(friendlies.meet(&mut hostiles, (None, &Open), TIME).is_empty(), "out of range");
    friendlies.sailing[0].x = 400.0;
    let met = friendlies.meet(&mut hostiles, (None, &Open), TIME);
    assert_eq!(met.iter().map(|(one, other)| (one.id, other.traffic)).collect::<Vec<_>>(), [(7, 5)], "met again");
    assert!(friendlies.sailing.is_empty() && hostiles.sailing.is_empty(), "both left the sea for it");
}

/// Open water everywhere.
struct Open;

impl Chart for Open {
    fn open(&self, _: [f64; 2], _: [f64; 2]) -> bool {
        true
    }
    fn water(&self, _: [f64; 2]) -> Option<crate::sighting::WaterHere> {
        None
    }
    fn coast(&self, _: [f64; 2]) -> f64 {
        f64::INFINITY
    }
    fn lane(&self, _: [f64; 2]) -> Option<(f64, [f64; 2])> {
        None
    }
}

#[test]
fn a_friendly_ship_sails_on_for_its_far_port_at_the_traffics_speed_kept_while_a_player_keeps_it_then_gone() {
    let mut friendlies = Friendlies::default();
    let friend = Friendly {
        traffic: 5,
        hull: HullKind::Brig,
        seed: 3,
        level: 0,
        sight_m: 5_000.0,
        x: 0.0,
        y: 0.0,
        heading: 0.0,
        to: [10_000.0, 0.0],
        lane: None,
    };
    friendlies.back_from_clash(&[], vec![friend]);
    friendlies.sail(2.0, &[[0.0, 1_000.0]], (None, &Open), TIME);
    let sailed = friendlies.sailing[0];
    assert!((sailed.x - 2.0 * SPEED_M_S).abs() < 1e-9 && sailed.y.abs() < 1e-9, "east, at the traffic's speed");
    assert!((sailed.heading - core::f64::consts::FRAC_PI_2).abs() < 1e-12, "heading for its port");
    friendlies.sail(1.0, &[[0.0, 6_000.0]], (None, &Open), TIME);
    assert!(friendlies.sailing.is_empty(), "past 1.1 times its sight of every player, gone");
    friendlies.back_from_clash(&[], vec![Friendly { x: 9_998.0, ..friend }]);
    friendlies.sail(1.0, &[[9_000.0, 0.0]], (None, &Open), TIME);
    assert!(friendlies.sailing.is_empty(), "come to its port, gone");
}

/// Open water, Overlook's home waters from `x` = 300 m east.
struct HomeEast;

impl Chart for HomeEast {
    fn open(&self, _: [f64; 2], _: [f64; 2]) -> bool {
        true
    }
    fn water(&self, at: [f64; 2]) -> Option<crate::sighting::WaterHere> {
        let holder = if at[0] >= 300.0 { world::waters::Holder::Home } else { world::waters::Holder::GreyTithe };
        Some(crate::sighting::WaterHere { holder, levels: None })
    }
    fn coast(&self, _: [f64; 2]) -> f64 {
        f64::INFINITY
    }
    fn lane(&self, _: [f64; 2]) -> Option<(f64, [f64; 2])> {
        None
    }
}

#[test]
fn no_tithe_ship_meets_a_friendly_ship_that_lies_in_home_waters() {
    let tithe = Hostile { y: 0.0, ..at_sea(7, Commission { faction: GREY_TITHE, rank: Rank::Minor }, 0.0, true) };
    let (mut hostiles, mut friendlies) = (Hostiles::default(), Friendlies::default());
    hostiles.back_from_clash(vec![tithe]);
    friendlies.back_from_clash(&[], vec![crate::clash::tests::friend_at(5, HullKind::Sloop, 400.0)]);
    assert!(friendlies.meet(&mut hostiles, (None, &HomeEast), TIME).is_empty(), "400 m off, inside home waters");
    friendlies.sailing[0].x = 200.0;
    assert_eq!(friendlies.meet(&mut hostiles, (None, &HomeEast), TIME).len(), 1, "out of them, it is attacked");
}

#[test]
fn a_friendly_ship_off_its_route_goes_back_to_it_and_follows_what_is_left_of_it_to_its_port() {
    let (layout, ports) = crate::measure_tests::world();
    let charted = crate::chart::Charted::new(&layout, &ports);
    let coasts = crate::sea::Coast::of(&layout);
    let chart = crate::chart::SeaChart { coasts: &coasts, charted: &charted, islands: &[] };
    let traffic = charted.traffic.as_ref().expect("the world's traffic");
    let centre = traffic.roadsteads.first().map_or([0.0; 2], |at| [at.x as f64, at.y as f64]);
    let ships = traffic.ships_near(centre, 3_000_000.0, TIME);
    let mut tried = 0;
    // Ships at every stage of every route, each taken and set 2 km off its way, as a fight leaves one.
    for ship in ships.iter().filter(|ship| ship.progress_m < ship.length_m).step_by(97).take(24) {
        tried += 1;
        let tithe = Hostile { level: 0, sight_m: 9_000.0, ..at_sea(7, Commission::default(), 0.0, true) };
        let friend = taken_of(traffic, ship, &tithe);
        let off = [friend.x - ship.direction[1] * 2_000.0, friend.y + ship.direction[0] * 2_000.0];
        if chart.water(off).is_none() {
            continue;
        }
        let mut friendlies = Friendlies::default();
        friendlies.back_from_clash(&[], vec![Friendly { x: off[0], y: off[1], ..friend }]);
        let mut arrived = false;
        for _ in 0..200_000 {
            let Some(at) = friendlies.sailing.first().map(|ship| [ship.x, ship.y]) else {
                arrived = true;
                break;
            };
            friendlies.sail(20.0, &[at], (Some(traffic), &chart), TIME);
        }
        let left = friendlies.sailing.first().map(|ship| [ship.x, ship.y]);
        assert!(arrived, "ship {} from {off:?} stuck at {left:?}, bound for {:?}", ship.id, friend.to);
    }
    assert!(tried >= 12, "{tried} ships tried");
}
