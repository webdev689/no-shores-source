use super::*;

fn near(actual: f64, wanted: f64) -> bool {
    (actual - wanted).abs() < 1e-9
}

#[test]
fn a_swivel_loaded_with_round_shot_is_itself() {
    assert_eq!(loaded(&SWIVEL, Shot::Round), SWIVEL);
}

#[test]
fn grape_is_slower_wider_and_kills_men_as_dfos_table_has_it() {
    let grape = loaded(&SWIVEL, Shot::Grape);
    assert!(near(grape.speed, 45.1) && near(grape.yaw_spread_deg, 3.12) && near(grape.pitch_spread_deg, 1.92));
    assert!(near(grape.radius_m, 0.52) && near(grape.reload_s, 3.6));
    assert!(near(grape.hull, 1.0) && near(grape.sail, 1.2) && near(grape.crew, 8.0));
}

#[test]
fn chain_tears_canvas_and_heated_shot_burns() {
    let chain = loaded(&SWIVEL, Shot::Chain);
    assert!(
        near(chain.speed, 49.5) && near(chain.sail, 8.0) && near(chain.radius_m, 0.37) && near(chain.reload_s, 4.6)
    );
    let heated = loaded(&SWIVEL, Shot::Heated);
    assert!(near(heated.reload_s, 6.4) && near(heated.hull, 4.25) && near(heated.radius_m, 0.07));
    assert!(near(fire_chance(Shot::Heated), 0.45) && near(fire_chance(Shot::Round), FIRE_CHANCE));
    assert!(rig_fire(Shot::Heated) && !rig_fire(Shot::Chain));
}

#[test]
fn grape_reaches_whole_to_1_2_seconds_and_half_by_2_6() {
    assert!(near(shot_reach(Shot::Grape, 1.2), 1.0));
    assert!(near(shot_reach(Shot::Grape, 1.9), 0.75));
    assert!(near(shot_reach(Shot::Grape, 2.6), 0.5) && near(shot_reach(Shot::Grape, 9.0), 0.5));
    assert!(near(shot_reach(Shot::Round, 9.0), 1.0));
}

#[test]
fn the_loads_cycle_round_grape_chain_heated_both_ways() {
    assert_eq!(Shot::Round.next(1), Shot::Grape);
    assert_eq!(Shot::Heated.next(1), Shot::Round);
    assert_eq!(Shot::Round.next(-1), Shot::Heated);
    assert!(Shot::CYCLE.iter().all(|shot| Shot::named(shot.name()) == Some(*shot)));
    assert_eq!(Shot::named("canister"), None);
}
