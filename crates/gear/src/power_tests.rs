use crate::power::{by_player, foe_health_times, gap, level, on_player, xp_for_level, xp_level};

#[test]
fn xp_levels_a_player_to_twenty_and_no_further() {
    assert_eq!(xp_for_level(2), 1_000);
    assert_eq!(xp_for_level(3), 3_000);
    assert_eq!(xp_for_level(20), 190_000);
    assert_eq!(xp_level(0), 1);
    assert_eq!(xp_level(999), 1);
    assert_eq!(xp_level(1_000), 2);
    assert_eq!(xp_level(189_999), 19);
    assert_eq!(xp_level(190_000), 20);
    assert_eq!(xp_level(u64::MAX), 20);
}

#[test]
fn past_twenty_the_armours_prestige_sets_the_level_as_at_destiny_1s_launch() {
    let at_twenty = xp_for_level(20);
    assert_eq!(level(at_twenty - 1, 120), 19, "Prestige counts for nothing before level 20");
    assert_eq!(level(at_twenty, 20), 20);
    assert_eq!(level(at_twenty, 21), 21);
    assert_eq!(level(at_twenty, 60), 24, "four Rares at 15");
    assert_eq!(level(at_twenty, 108), 28, "four Legendaries at 27");
    assert_eq!(level(at_twenty, 111), 29, "three Legendaries and an Atheric at 30");
    assert_eq!(level(at_twenty, 120), 30);
    assert_eq!(level(at_twenty, 999), 30);
}

#[test]
fn a_blow_rises_with_attack_up_to_the_foes_level_and_falls_away_below_it() {
    let close = |left: f64, right: f64| (left - right).abs() < 1e-12;
    assert!(close(by_player(300, 20, 20), libm::pow(1.07, 20.0)), "300 reaches level 20");
    assert!(close(by_player(300, 25, 25), libm::pow(1.07, 20.0)), "and no further");
    assert!(close(by_player(150, 20, 20), libm::pow(1.07, 10.0)), "150 reaches level 10");
    assert!(close(by_player(300, 20, 5), libm::pow(1.07, 5.0)), "a low foe takes only its own level's");
    assert!(close(by_player(300, 19, 20), libm::pow(1.07, 20.0) * 0.67));
    assert_eq!(by_player(300, 16, 20), 0.0, "four levels below, a player strikes nothing");
    assert_eq!(gap(30, 1), 1.0, "being above earns no bonus");
    assert_eq!([gap(9, 10), gap(8, 10), gap(7, 10)], [0.67, 0.56, 0.47]);
}

#[test]
fn a_matched_player_fells_a_foe_in_the_same_blows_at_every_level() {
    for foe_level in 1..=20_u8 {
        let attack = u32::from(foe_level) * 15;
        let share = by_player(attack, foe_level, foe_level) / foe_health_times(foe_level);
        assert!((share - 1.0).abs() < 1e-9, "level {foe_level}: {share}");
    }
}

#[test]
fn defense_meets_a_foes_level_and_a_player_below_it_is_struck_harder() {
    let close = |left: f64, right: f64| (left - right).abs() < 1e-12;
    assert!(close(on_player(900, 20, 20), 1.0), "Defense 900 meets level 20");
    assert!(close(on_player(450, 20, 20), libm::pow(1.07, 10.0)), "half of it, ten levels short");
    assert!(close(on_player(1_350, 28, 30), 1.5), "two levels below: half again");
    assert!(close(on_player(1_350, 10, 30), 2.0), "four or more below: double");
    assert!(close(on_player(0, 1, 0), 1.0), "a level 0 foe asks nothing of Defense");
}
