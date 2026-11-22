//! A held lay settles, as Black Flag's broadside narrows the longer it is held: a player's volley fired the moment its
//! lay is taken scatters wider than its gun's own, and one held `SETTLE_S` scatters as the gun's own.

use super::{Fight, Orders};
use crate::shots::ShipId;
use sailing::TICK_SECONDS;

/// How long a held lay takes to settle, seconds.
pub const SETTLE_S: f64 = 1.5;
/// How much wider than its gun's own a lay just taken scatters.
pub const FIRST_SPREAD: f64 = 2.0;

/// How long a player has held their lay, by the orders that held it, and on which side.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Held {
    starboard: bool,
    seconds: f64,
}

/// How much wider than its gun's own a lay held `seconds` scatters: `FIRST_SPREAD` at once, settling evenly to the
/// gun's own over `SETTLE_S`.
#[must_use]
pub fn spread_after(seconds: f64) -> f64 {
    1.0 + (FIRST_SPREAD - 1.0) * (1.0 - (seconds / SETTLE_S).clamp(0.0, 1.0))
}

impl Fight {
    /// Each player's held lay counted on by their orders, one tick an order: an order holding a lay on the side held
    /// is a tick longer, one on the other side begins again, and one holding none lets it go. A player with no
    /// orders this tick keeps theirs as it was.
    pub(super) fn hold_lays(&mut self, orders: &[(ShipId, Orders)]) {
        for (id, order) in orders {
            let Some(aim) = order.aim.as_ref() else {
                self.held.remove(id);
                continue;
            };
            let starboard = aim.bearing_deg >= 0.0;
            let kept = self.held.get(id).filter(|held| held.starboard == starboard);
            let seconds = kept.map_or(0.0, |held| held.seconds + TICK_SECONDS);
            self.held.insert(*id, Held { starboard, seconds });
        }
    }

    /// How much wider than its gun's own `id`'s lay scatters now (`spread_after`); a lay not held yet, the widest.
    #[must_use]
    pub fn spread_of(&self, id: ShipId) -> f64 {
        self.held.get(&id).map_or(FIRST_SPREAD, |held| spread_after(held.seconds))
    }
}

#[cfg(test)]
mod tests {
    use super::{FIRST_SPREAD, SETTLE_S, spread_after};
    use crate::fight::{Aim, CAPTAIN, Fight, Orders, PLAYER};
    use crate::ranks::Commission;
    use sailing::TICK_SECONDS;
    use sailing::ship::{Helm, Ship};
    use sailing::waters::{Spot, Waters};

    struct Open;
    impl Waters for Open {
        fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
            Spot { bed: -50.0, surface: Some(0.0) }
        }
    }

    const IDLE: Orders =
        Orders { helm: Helm { steer: 0.0, climb: 0 }, aim: None, fire: false, brace: false, load: None, boost: false };
    const SETTLED_TICKS: u32 = 91;

    fn laid(bearing_deg: f64, fire: bool) -> Orders {
        Orders { aim: Some(Aim { bearing_deg, range_m: 60.0, ray: None }), fire, ..IDLE }
    }

    /// A fight with the captain 60 m off the player's starboard beam, both still.
    fn fight() -> Fight {
        let ship = |x: f64| Ship { x, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
        let mut fight =
            Fight::begin(ship(0.0), Commission::default(), 3, &Open, 0.0).unwrap_or_else(|error| panic!("{error}"));
        if let Some(captain) = fight.ships.get_mut(&CAPTAIN) {
            captain.ship = ship(60.0);
        }
        fight
    }

    fn run(fight: &mut Fight, orders: Orders, ticks: u32) {
        for tick in 0..ticks {
            fight.step(&[(PLAYER, orders)], &Open, &|_| [1.5, 0.0], f64::from(tick) * TICK_SECONDS);
        }
    }

    #[test]
    fn a_lay_just_taken_scatters_twice_as_wide_and_settles_evenly_over_a_second_and_a_half() {
        assert!((spread_after(0.0) - FIRST_SPREAD).abs() < 1e-12);
        assert!((spread_after(SETTLE_S / 2.0) - (1.0 + FIRST_SPREAD) / 2.0).abs() < 1e-12);
        assert!((spread_after(SETTLE_S) - 1.0).abs() < 1e-12 && (spread_after(60.0) - 1.0).abs() < 1e-12);
    }

    #[test]
    fn a_held_lay_settles_tick_by_tick_and_is_begun_again_on_the_other_side_or_let_go() {
        let mut fight = fight();
        assert!((fight.spread_of(PLAYER) - FIRST_SPREAD).abs() < 1e-12, "none held, the widest");
        run(&mut fight, laid(90.0, false), SETTLED_TICKS);
        assert!((fight.spread_of(PLAYER) - 1.0).abs() < 1e-9, "held a second and a half, the gun's own");
        fight.step(&[], &Open, &|_| [1.5, 0.0], 2.0);
        assert!((fight.spread_of(PLAYER) - 1.0).abs() < 1e-9, "a tick with no orders keeps it");
        run(&mut fight, laid(-90.0, false), 1);
        assert!((fight.spread_of(PLAYER) - FIRST_SPREAD).abs() < 1e-12, "the other side begins again");
        run(&mut fight, laid(-90.0, false), SETTLED_TICKS);
        run(&mut fight, IDLE, 1);
        assert!((fight.spread_of(PLAYER) - FIRST_SPREAD).abs() < 1e-12, "let go, it begins again");
    }

    #[test]
    fn a_volley_fired_at_once_scatters_wider_than_one_held_and_its_preview_shows_a_wider_zone() {
        // Laid well out on the water, where the zone is wider than its least.
        let aim = Aim { bearing_deg: 90.0, range_m: 250.0, ray: None };
        let mut quick = fight();
        let wide = quick.preview(PLAYER, &aim, &Open, 0.0).unwrap_or_else(|| panic!("a side bears"));
        run(&mut quick, laid(90.0, true), 1);
        let mut held = fight();
        run(&mut held, laid(90.0, false), SETTLED_TICKS);
        let narrow = held.preview(PLAYER, &aim, &Open, 0.0).unwrap_or_else(|| panic!("a side bears"));
        assert!(wide.radius > narrow.radius * 1.5, "{} against {}", wide.radius, narrow.radius);
        assert!((wide.spread - FIRST_SPREAD).abs() < 1e-12 && (narrow.spread - 1.0).abs() < 1e-9);
        run(&mut held, laid(90.0, true), 1);
        let spread_of = |fight: &Fight| {
            let ball = fight.balls.iter().find(|ball| ball.shooter == PLAYER);
            ball.unwrap_or_else(|| panic!("a ball fired")).gun.yaw_spread_deg
        };
        let ratio = spread_of(&quick) / spread_of(&held);
        assert!((ratio - FIRST_SPREAD).abs() < 1e-9, "fired at once, twice the held volley's scatter: {ratio}");
    }
}
