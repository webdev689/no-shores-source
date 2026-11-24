//! A player's ship in a fight as its hull's class builds it (`class.rs`): its hull, canvas and men, its broadside's
//! weight spread over its guns, its reload, and what a captain makes of it before falling on it.

use super::*;
use crate::arms::Side;
use crate::captain::{Temper, wary_takes};
use crate::class::{CLASSES, class_of};
use crate::ranks::{GREY_TITHE, Rank};
use sailing::TICK_SECONDS;
use sailing::waters::Spot;

struct Open;

impl Waters for Open {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: -50.0, surface: Some(0.0) }
    }
}

const WIND: [f64; 2] = [1.5, 0.0];
const IDLE: Orders =
    Orders { helm: Helm { steer: 0.0, climb: 0 }, aim: None, fire: false, brace: false, load: None, boost: false };

fn at(x: f64, y: f64) -> Ship {
    Ship { x, y, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 }
}

/// A fight with a wary captain lying 60 m east of a player's ship of `hull`, both still and heading north.
fn alongside(hull: HullKind) -> Fight {
    let mut fight = Fight::begin(at(0.0, 0.0), Commission::default(), 1, &Open, 0.0).expect("a fight");
    fight.put_to_sea_kept(PLAYER, (at(0.0, 0.0), hull), [1.0; 3], &Open, 0.0);
    let captain = fight.ships.get_mut(&CAPTAIN).expect("its captain");
    captain.ship = at(60.0, 0.0);
    if let Sailor::Captain(command) = &mut captain.sailor {
        command.mind.temper = Temper::Wary;
        command.mind.cruise = 0.0;
    }
    fight
}

fn step(fight: &mut Fight, orders: &Orders, ticks: u32, from: u32) {
    for tick in from..from + ticks {
        fight.step(&[(PLAYER, *orders)], &Open, &|_| WIND, f64::from(tick) * TICK_SECONDS);
    }
}

#[test]
fn a_players_ship_puts_to_sea_in_its_hull_with_its_classs_hull_canvas_and_men() {
    for class in &CLASSES {
        let fight = alongside(class.hull);
        let player = fight.vessel(PLAYER).expect("the player's ship");
        let build = class.build();
        assert_eq!(player.hull, class.hull);
        assert_eq!(
            (player.damage.max_hull, player.damage.max_sail, player.damage.max_crew),
            (build.hull, build.sail, build.crew)
        );
        assert_eq!(player.arms().battery(Side::Starboard).len(), crate::arms::arms_of(class.hull).starboard.len());
    }
    let kept = {
        let mut fight = alongside(HullKind::Frigate);
        fight.put_to_sea_kept(PLAYER, (at(0.0, 0.0), HullKind::Frigate), [0.5, 0.25, 0.75], &Open, 0.0);
        fight.vessel(PLAYER).expect("the player's ship").damage.clone()
    };
    let frigate = class_of(HullKind::Frigate).build();
    let shares = [(frigate.hull * 0.5).round(), (frigate.sail * 0.25).round(), (frigate.crew * 0.75).round()];
    assert_eq!([kept.hull, kept.sail, kept.crew], shares, "{frigate:?}");
}

#[test]
fn its_broadside_weighs_its_classs_share_over_every_gun_of_its_side_and_reloads_at_its_pace() {
    let fire = Orders { aim: Some(Aim { bearing_deg: 90.0, range_m: 60.0, ray: None }), fire: true, ..IDLE };
    let reloads: Vec<u32> = CLASSES
        .iter()
        .map(|class| {
            let mut fight = alongside(class.hull);
            step(&mut fight, &fire, 1, 0);
            let arms = crate::arms::arms_of(class.hull);
            let balls: Vec<&crate::ballistics::Ball> =
                fight.balls.iter().filter(|ball| ball.shooter == PLAYER).collect();
            assert_eq!(balls.len(), arms.starboard.len(), "{:?}: every gun of its side", class.hull);
            for ball in balls {
                let share = arms.gun_share(Side::Starboard) * class.broadside;
                assert!((ball.gun.share - share).abs() < 1e-12, "{:?}: {} of {share}", class.hull, ball.gun.share);
            }
            let mut ticks = 1;
            while !fight.vessel(PLAYER).expect("afloat").guns.ready(Side::Starboard) {
                step(&mut fight, &IDLE, 1, ticks);
                ticks += 1;
            }
            ticks
        })
        .collect();
    for (class, ticks) in CLASSES.iter().zip(&reloads) {
        let against = f64::from(*ticks) / f64::from(reloads[0]);
        assert!(
            (against - class.reload).abs() < 0.02,
            "{:?} reloads in {ticks} ticks to the Sloop's {}",
            class.hull,
            reloads[0]
        );
    }
}

#[test]
fn a_wary_captain_needs_more_strength_to_fall_on_a_brig_and_more_again_on_a_frigate() {
    let commission = Commission { faction: GREY_TITHE, rank: Rank::Major };
    let least = |hull: HullKind| {
        (1..=400).map(|step| f64::from(step) * 0.05).find(|strength| wary_takes(commission, *strength, (hull, 1.0)))
    };
    let [sloop, brig, frigate] =
        [HullKind::Sloop, HullKind::Brig, HullKind::Frigate].map(|hull| least(hull).expect("some strength takes it"));
    assert!(sloop < brig && brig < frigate, "{sloop} < {brig} < {frigate}");
}
