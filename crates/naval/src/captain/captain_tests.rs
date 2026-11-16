use super::*;
use crate::arms::{LARGE_BOAT, PIRATE_SLOOP, SLOOP_ARMS};
use crate::damage::Hurt;
use sailing::SLOOP;

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

    fn her(&self) -> Her<'_> {
        Her {
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
    Sighting { ship, level: 0.0, hull_share: 1.0, wrecked: false, power: Power::player(&LARGE_BOAT, 1.0) }
}

fn captain(temper: Temper) -> Captain {
    Captain { temper, ..Captain::new(PIRATE_SLOOP, 7, 1.0, &SLOOP_ARMS) }
}

#[test]
fn one_pirate_in_four_is_bold() {
    let bold = (0..4000).filter(|seed| temper_of(*seed) == Temper::Bold).count();
    assert!((800..1200).contains(&bold), "{bold}");
}

#[test]
fn a_bold_captain_far_off_steers_to_meet_the_player_under_sail() {
    let deck = Deck::new();
    let mut her = captain(Temper::Bold);
    let helm = her.steer(&deck.her(), &player_at(600.0, 0.0), 0.1, &open);
    assert_eq!(her.mode, Mode::Engage);
    assert!(helm.steer > 0.5, "the player lies east: {}", helm.steer);
    assert!(helm.climb >= 0);
}

#[test]
fn within_reach_she_lays_her_starboard_side_abeam_of_a_player_off_her_starboard_beam() {
    let deck = Deck::new();
    let mut her = captain(Temper::Bold);
    let helm = her.steer(&deck.her(), &player_at(60.0, 0.0), 0.1, &open);
    assert_eq!(her.mode, Mode::Engage);
    // Making way north, she lays on his lead, a few degrees abaft his beam.
    assert!(helm.steer > 0.0 && helm.steer < 0.15, "she all but holds her heading: {}", helm.steer);
    assert_eq!(her.present.map(|present| present.side), Some(Side::Starboard));
}

#[test]
fn a_wary_captain_lets_a_stronger_ship_be_and_runs_once_struck() {
    let deck = Deck::new();
    let mut her = captain(Temper::Wary);
    her.steer(&deck.her(), &player_at(200.0, 0.0), 0.1, &open);
    assert_eq!(her.mode, Mode::Cruise);
    her.provoke();
    let helm = her.steer(&deck.her(), &player_at(200.0, 0.0), 0.1, &open);
    assert_eq!(her.mode, Mode::Flee);
    assert!(helm.steer < -0.5, "the player lies east, so she turns away west: {}", helm.steer);
}

#[test]
fn a_pirate_hulled_past_seventy_percent_runs_whatever_her_temper() {
    let mut deck = Deck::new();
    deck.damage.apply(Hurt { hull: 190.0, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    let mut her = captain(Temper::Bold);
    her.steer(&deck.her(), &player_at(200.0, 0.0), 0.1, &open);
    assert_eq!(her.mode, Mode::Flee);
}

#[test]
fn struck_she_brings_in_her_sails_and_comes_down_her_ladder() {
    let mut deck = Deck::new();
    deck.damage.apply(Hurt { hull: 200.0, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    let mut her = captain(Temper::Bold);
    let helm = her.steer(&deck.her(), &player_at(100.0, 0.0), 1.0, &open);
    assert_eq!((her.mode, her.sails, helm.climb), (Mode::Struck, 0.5, -1));
}

#[test]
fn a_chase_that_gains_nothing_for_150_seconds_is_given_up_and_the_player_spared() {
    let deck = Deck::new();
    let mut her = captain(Temper::Bold);
    let mut ticks = 0;
    while her.mode == Mode::Engage || ticks == 0 {
        her.steer(&deck.her(), &player_at(600.0, 0.0), 0.5, &open);
        ticks += 1;
        assert!(ticks < 400, "she never gave up");
    }
    assert!((300..=304).contains(&ticks), "{ticks}");
    assert_eq!(her.mode, Mode::Cruise);
    for _ in 0..500 {
        her.steer(&deck.her(), &player_at(100.0, 0.0), 0.5, &open);
        assert_eq!(her.mode, Mode::Cruise, "spared 300 s");
    }
}

#[test]
fn she_leaves_a_wrecked_player_after_thirty_seconds() {
    let deck = Deck::new();
    let mut her = captain(Temper::Bold);
    let wreck = Sighting { wrecked: true, hull_share: 0.0, ..player_at(100.0, 0.0) };
    for _ in 0..59 {
        her.steer(&deck.her(), &wreck, 0.5, &open);
        assert_eq!(her.mode, Mode::Engage);
        assert_eq!(her.aim(&deck.her(), &wreck, &mut Mulberry32::new(1)).run_out, None, "she never fires on a wreck");
    }
    her.steer(&deck.her(), &wreck, 0.5, &open);
    her.steer(&deck.her(), &wreck, 0.5, &open);
    assert_eq!(her.mode, Mode::Cruise);
}

#[test]
fn her_rudder_is_her_commanded_swing_as_a_share_of_her_own() {
    let deck = Deck::new();
    let mut her = captain(Temper::Bold);
    let most = swing_rate(&deck.ship, &SLOOP) * DEG;
    let helm = her.helm(&deck.her(), 0.2, 0.0);
    assert!((helm.steer - 0.2 / (4.0 * TURN_TAU) / most).abs() < 1e-12, "{}", helm.steer);
    assert_eq!(her.helm(&deck.her(), std::f64::consts::PI / 2.0, 0.0).steer, 1.0);
}

#[test]
fn her_rung_is_the_one_whose_way_is_nearest_her_share_of_sail() {
    let deck = Deck::new();
    let mut her = captain(Temper::Bold);
    her.sails = 1.0;
    assert_eq!(her.helm(&deck.her(), 0.0, 0.0).climb, 0, "sails set, as she wants");
    her.sails = 0.6;
    assert_eq!(her.helm(&deck.her(), 0.0, 0.0).climb, -1, "nearer her oars' way");
    her.sails = 0.0;
    let mut torn = Deck::new();
    torn.damage.apply(Hurt { hull: 0.0, sail: 96.0, crew: 0.0, fire: false }, 0.0, 0.0);
    her.sails = 1.0;
    assert_eq!(her.helm(&torn.her(), 0.0, 0.0).climb, -1, "no canvas to set");
}
