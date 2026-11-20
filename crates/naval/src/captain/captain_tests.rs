use super::*;
use crate::arms::{LARGE_BOAT, PIRATE_SLOOP, SLOOP_ARMS};
use crate::damage::Hurt;
use crate::ranks::{PIRATES, Rank};
use sailing::{HullKind, SLOOP};

const LEVEL: Pose = Pose { heave: 0.0, pitch: 0.0, roll: 0.0, aground: false };
const EAST_WIND: [f64; 2] = [1.5, 0.0];

fn open(_x: f64, _y: f64) -> bool {
    true
}

/// Her Sloop heading north under sail at 2.5 m/s, sound.
struct Deck {
    ship: Ship,
    damage: Damage,
    guns: Guns,
}

impl Deck {
    fn new() -> Self {
        let ship = Ship { x: 0.0, y: 0.0, heading: 0.0, ahead: 2.5, abeam: 0.0, turn: 0.0, sail_way: 2.5, rung: 2 };
        Self { ship, damage: Damage::new(&PIRATE_SLOOP, false), guns: Guns::new() }
    }

    fn own(&self) -> Own<'_> {
        Own {
            ship: &self.ship,
            pose: &LEVEL,
            damage: &self.damage,
            guns: &self.guns,
            arms: &SLOOP_ARMS,
            hull: &SLOOP,
            wind: EAST_WIND,
        }
    }
}

fn player_at(x: f64, y: f64) -> Sighting {
    let ship = Ship { x, y, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
    Sighting {
        id: 0,
        hull: HullKind::Sloop,
        ship,
        level: 0.0,
        hull_share: 1.0,
        wrecked: false,
        power: Power::player(&LARGE_BOAT, 1.0),
    }
}

/// Her helm against one player's ship, the only hull about her.
fn steer_against(mind: &mut Captain, deck: &Deck, enemy: &Sighting, seconds: f64) -> Helm {
    let traffic = [([enemy.ship.x, enemy.ship.y], velocity_of(&enemy.ship), course::pass_reach(&SLOOP_ARMS))];
    mind.steer(&deck.own(), (std::slice::from_ref(enemy), &traffic), seconds, &open)
}

fn captain(temper: Temper) -> Captain {
    Captain { temper, ..Captain::new(Commission::default(), 7, 1.0, &SLOOP_ARMS) }
}

#[test]
fn one_pirate_in_four_is_bold() {
    let bold = (0..4000).filter(|seed| temper_of(*seed) == Temper::Bold).count();
    assert!((800..1200).contains(&bold), "{bold}");
}

#[test]
fn a_bold_captain_far_off_steers_to_meet_the_player_under_sail() {
    let deck = Deck::new();
    let mut mind = captain(Temper::Bold);
    let helm = steer_against(&mut mind, &deck, &player_at(600.0, 0.0), 0.1);
    assert_eq!(mind.mode, Mode::Engage);
    assert!(helm.steer > 0.5, "the player lies east: {}", helm.steer);
    assert!(helm.climb >= 0);
}

#[test]
fn within_reach_she_lays_her_starboard_side_abeam_of_a_player_off_her_starboard_beam() {
    let deck = Deck::new();
    let mut mind = captain(Temper::Bold);
    let helm = steer_against(&mut mind, &deck, &player_at(60.0, 0.0), 0.1);
    assert_eq!(mind.mode, Mode::Engage);
    // Making way north, she lays on his lead, a few degrees abaft his beam.
    assert!(helm.steer > 0.0 && helm.steer < 0.15, "she all but holds her heading: {}", helm.steer);
    assert_eq!(mind.present.map(|present| present.side), Some(Side::Starboard));
}

#[test]
fn a_wary_captain_lets_a_stronger_ship_be_and_runs_once_struck() {
    let deck = Deck::new();
    let mut mind = captain(Temper::Wary);
    steer_against(&mut mind, &deck, &player_at(200.0, 0.0), 0.1);
    assert_eq!(mind.mode, Mode::Cruise);
    mind.provoke(0);
    let helm = steer_against(&mut mind, &deck, &player_at(200.0, 0.0), 0.1);
    assert_eq!(mind.mode, Mode::Flee);
    assert!(helm.steer < -0.5, "the player lies east, so she turns away west: {}", helm.steer);
}

#[test]
fn a_pirate_hulled_past_seventy_percent_runs_whatever_her_temper() {
    let mut deck = Deck::new();
    deck.damage.apply(Hurt { hull: 190.0, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    let mut mind = captain(Temper::Bold);
    steer_against(&mut mind, &deck, &player_at(200.0, 0.0), 0.1);
    assert_eq!(mind.mode, Mode::Flee);
}

#[test]
fn struck_she_brings_in_her_sails_and_comes_down_her_ladder() {
    let mut deck = Deck::new();
    deck.damage.apply(Hurt { hull: 200.0, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    let mut mind = captain(Temper::Bold);
    let helm = steer_against(&mut mind, &deck, &player_at(100.0, 0.0), 1.0);
    assert_eq!((mind.mode, mind.sails, helm.climb), (Mode::Struck, 0.5, -1));
}

#[test]
fn a_chase_that_gains_nothing_for_150_seconds_is_given_up_and_the_player_spared() {
    let deck = Deck::new();
    let mut mind = captain(Temper::Bold);
    let mut ticks = 0;
    while mind.mode == Mode::Engage || ticks == 0 {
        steer_against(&mut mind, &deck, &player_at(600.0, 0.0), 0.5);
        ticks += 1;
        assert!(ticks < 400, "she never gave up");
    }
    assert!((300..=304).contains(&ticks), "{ticks}");
    assert_eq!(mind.mode, Mode::Cruise);
    for _ in 0..500 {
        steer_against(&mut mind, &deck, &player_at(100.0, 0.0), 0.5);
        assert_eq!(mind.mode, Mode::Cruise, "spared 300 s");
    }
}

#[test]
fn she_leaves_a_wrecked_player_after_thirty_seconds() {
    let deck = Deck::new();
    let mut mind = captain(Temper::Bold);
    let wreck = Sighting { wrecked: true, hull_share: 0.0, ..player_at(100.0, 0.0) };
    for _ in 0..59 {
        steer_against(&mut mind, &deck, &wreck, 0.5);
        assert_eq!(mind.mode, Mode::Engage);
        assert_eq!(
            mind.aim(&deck.own(), Some(&wreck), &mut Mulberry32::new(1)).run_out,
            None,
            "she never fires on a wreck"
        );
    }
    steer_against(&mut mind, &deck, &wreck, 0.5);
    steer_against(&mut mind, &deck, &wreck, 0.5);
    assert_eq!(mind.mode, Mode::Cruise);
}

#[test]
fn her_rudder_is_her_commanded_swing_as_a_share_of_her_own() {
    let deck = Deck::new();
    let mut mind = captain(Temper::Bold);
    let most = swing_rate(&deck.ship, &SLOOP) * DEG;
    let helm = mind.helm(&deck.own(), 0.2, 0.0);
    assert!((helm.steer - 0.2 / (4.0 * TURN_TAU) / most).abs() < 1e-12, "{}", helm.steer);
    assert_eq!(mind.helm(&deck.own(), std::f64::consts::PI / 2.0, 0.0).steer, 1.0);
}

#[test]
fn her_rung_is_the_one_whose_way_is_nearest_her_share_of_sail() {
    let deck = Deck::new();
    let mut mind = captain(Temper::Bold);
    mind.sails = 1.0;
    assert_eq!(mind.helm(&deck.own(), 0.0, 0.0).climb, 0, "sails set, as she wants");
    mind.sails = 0.6;
    assert_eq!(mind.helm(&deck.own(), 0.0, 0.0).climb, -1, "nearer her oars' way");
    mind.sails = 0.0;
    let mut torn = Deck::new();
    torn.damage.apply(Hurt { hull: 0.0, sail: 96.0, crew: 0.0, fire: false }, 0.0, 0.0);
    mind.sails = 1.0;
    assert_eq!(mind.helm(&torn.own(), 0.0, 0.0).climb, -1, "no canvas to set");
}

#[test]
fn presented_she_keeps_station_on_six_tenths_of_her_sail_or_more() {
    let deck = Deck::new();
    let mut mind = captain(Temper::Bold);
    let plan = mind.engage(&deck.own(), &player_at(60.0, 0.0), 60.0, &open);
    assert!((PRESENT_SAILS..1.0).contains(&plan.sails), "{}", plan.sails);
}

#[test]
fn inside_her_dead_zone_she_opens_the_range_hard() {
    let deck = Deck::new();
    let mut mind = captain(Temper::Bold);
    let plan = mind.engage(&deck.own(), &player_at(1.5, 0.0), 1.5, &open);
    let lead = lead_point([0.0, 0.0], [1.5, 0.0], [0.0, 2.5], crate::guns::SWIVEL.speed);
    let wanted = wrap(heading_to([0.0, 0.0], lead) - (90.0 + 2.0 * RANGE_BEND_DEG) * DEG);
    assert!((wrap(plan.want - wanted)).abs() < 1e-9, "{} {}", plan.want, wanted);
}

#[test]
fn a_quarry_running_from_her_she_runs_down_and_sheers_out_to_its_beam() {
    let deck = Deck::new();
    let mut mind = captain(Temper::Bold);
    let running = Ship { ahead: 3.0, rung: 2, ..player_at(0.0, -60.0).ship };
    let quarry = Sighting { ship: running, ..player_at(0.0, -60.0) };
    let plan = mind.engage(&deck.own(), &quarry, 60.0, &open);
    assert!(plan.want > 0.3, "out to his starboard beam, not dead astern of him: {}", plan.want);
}

#[test]
fn her_lookout_reckons_her_turning_circle_at_her_own_pace_even_lying_still() {
    let mut deck = Deck::new();
    deck.ship = Ship { ahead: 0.0, sail_way: 0.0, ..deck.ship };
    let mind = captain(Temper::Bold);
    assert!(mind.lookout(&deck.own()).near < 30.0, "{}", mind.lookout(&deck.own()).near);
}

#[test]
fn an_elite_and_above_is_bold_whatever_her_seed_and_a_minor_or_major_as_her_seed_says() {
    for rank in Rank::ALL {
        let commission = Commission { faction: PIRATES, rank };
        for seed in 0..200 {
            let temper = Captain::new(commission, seed, 0.0, &SLOOP_ARMS).temper;
            let wanted = if rank >= Rank::Elite { Temper::Bold } else { temper_of(seed) };
            assert_eq!(temper, wanted, "{rank:?}, seed {seed}");
        }
    }
}

#[test]
fn hulled_to_28_percent_a_major_or_elite_runs_and_a_miniboss_or_boss_fights_on() {
    for (rank, mode) in [
        (Rank::Major, Mode::Flee),
        (Rank::Elite, Mode::Flee),
        (Rank::Miniboss, Mode::Engage),
        (Rank::Boss, Mode::Engage),
    ] {
        let commission = Commission { faction: PIRATES, rank };
        let mut deck = Deck::new();
        deck.damage = Damage::new(&commission.build(), false);
        let hull = (deck.damage.max_hull * 0.72).ceil();
        deck.damage.apply(Hurt { hull, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
        assert!(deck.damage.fighting(), "{rank:?} has not struck");
        let mut mind = Captain { temper: Temper::Bold, ..Captain::new(commission, 7, 1.0, &SLOOP_ARMS) };
        steer_against(&mut mind, &deck, &player_at(200.0, 0.0), 0.1);
        assert_eq!(mind.mode, mode, "{rank:?}");
    }
}
