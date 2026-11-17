use super::*;

const OPEN: fn([f64; 2], [f64; 2]) -> bool = |_, _| true;

/// Steps the pirates `seconds` a second at a time round ships that stay where they are, answering every meeting.
fn sail(pirates: &mut Pirates, seconds: u32, ships: &[(PlayerId, [f64; 2], bool)]) -> Vec<(PlayerId, Pirate)> {
    (0..seconds).flat_map(|_| pirates.tick(1.0, ships, OPEN)).collect()
}

#[test]
fn no_pirate_comes_before_the_first_roll_and_each_comes_on_the_ring_clear_of_the_player() {
    let mut pirates = Pirates::default();
    let ship = [500_000.0, 500_000.0];
    sail(&mut pirates, 29, &[(1, ship, true)]);
    assert!(pirates.sailing.is_empty(), "nothing before half a minute, and nothing while fighting");
    let mut launched = Vec::new();
    for _ in 0..4 * 3600 {
        pirates.tick(1.0, &[(1, ship, true)], OPEN);
        // A fighting player is never met, so every pirate stays to be seen.
        for pirate in &pirates.sailing {
            if !launched.iter().any(|&(id, _)| id == pirate.id) {
                launched.push((pirate.id, apart([pirate.x, pirate.y], ship)));
            }
        }
    }
    assert!(launched.is_empty(), "a fighting player is sent no one");
    for _ in 0..4 * 3600 {
        pirates.sailing.retain(|pirate| !pirate.bold);
        pirates.tick(1.0, &[(1, ship, false)], OPEN);
        for pirate in &pirates.sailing {
            if !launched.iter().any(|&(id, _)| id == pirate.id) {
                launched.push((pirate.id, apart([pirate.x, pirate.y], ship)));
            }
        }
        let near = pirates.sailing.iter().filter(|pirate| apart([pirate.x, pirate.y], ship) <= DESPAWN_BEYOND);
        assert!(near.count() <= DENSITY);
    }
    // About one roll in 100 s, a pirate on 0.24 of them: some 35 in four hours.
    assert!((15..70).contains(&launched.len()), "{} pirates in four hours", launched.len());
    for &(_, out) in &launched {
        assert!((SPAWN_RING[0]..=SPAWN_RING[1] + PIRATE_WAY_M_S).contains(&out), "launched {out} m out");
    }
}

#[test]
fn a_pirate_far_from_every_player_leaves_the_sea_and_one_near_another_stays() {
    let mut pirates = Pirates::default();
    let pirate = |id: u32, x: f64| Pirate { id, seed: id, x, y: 0.0, heading: 0.0, bold: false };
    pirates.sailing = vec![pirate(1, 3_000.0), pirate(2, 10_000.0)];
    let ships = [(1, [0.0, 0.0], false), (2, [11_000.0, 0.0], false)];
    pirates.tick(1.0, &ships, OPEN);
    assert_eq!(pirates.sailing.iter().map(|pirate| pirate.id).collect::<Vec<_>>(), [2]);
}

#[test]
fn a_bold_pirate_in_sight_of_a_player_meets_them_and_a_wary_one_sails_by() {
    let mut pirates = Pirates::default();
    let pirate = |id: u32, bold: bool| Pirate { id, seed: id, x: 700.0, y: 0.0, heading: 0.0, bold };
    pirates.sailing = vec![pirate(1, false), pirate(2, true)];
    let met = pirates.tick(1.0, &[(5, [0.0, 0.0], false)], OPEN);
    assert_eq!(met.iter().map(|(player, pirate)| (*player, pirate.id)).collect::<Vec<_>>(), [(5, 2)]);
    assert_eq!(pirates.sailing.len(), 1, "the one met leaves the sea for her fight");
    pirates.sailing.push(pirate(3, true));
    assert!(pirates.tick(1.0, &[(5, [0.0, 0.0], true)], OPEN).is_empty(), "no meeting for a player fighting");
}

#[test]
fn a_pirate_goes_about_at_land_and_none_comes_where_land_lies_between() {
    let mut pirates = Pirates::default();
    pirates.sailing = vec![Pirate { id: 1, seed: 1, x: 0.0, y: 0.0, heading: 0.0, bold: false }];
    pirates.tick(1.0, &[(1, [0.0, 500.0], false)], |_, _| false);
    assert_eq!((pirates.sailing[0].y, pirates.sailing[0].heading), (0.0, TAU / 2.0));
    let mut walled = Pirates::default();
    for _ in 0..4 * 3600 {
        walled.tick(1.0, &[(1, [0.0, 0.0], false)], |_, _| false);
    }
    assert!(walled.sailing.is_empty());
}

#[test]
fn the_same_courses_make_the_same_pirates() {
    let run = || {
        let mut pirates = Pirates::default();
        sail(&mut pirates, 3600, &[(1, [0.0, 0.0], false), (2, [5_000.0, 0.0], false)]);
        pirates.sailing
    };
    assert_eq!(run(), run());
}
