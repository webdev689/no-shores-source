//! A boss's ring: a wall round a circle on the map that no body crosses while it stands, however it moves. A body is
//! kept on the side its feet stood before its step, its edge clear of the wall by its radius: one inside stays inside,
//! one outside stays out. The wall has no top, so nothing climbs, mantles or leaps over it.

use crate::body::{Body, TUNING};

/// A ring's centre (x east, y south) and its radius, in metres.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Fence {
    pub x: f64,
    pub y: f64,
    pub radius: f64,
}

impl Fence {
    /// Whether (x, y) stands inside the ring; on it counts as inside.
    #[must_use]
    pub fn holds(&self, x: f64, y: f64) -> bool {
        let (east, south) = (x - self.x, y - self.y);
        east * east + south * south <= self.radius * self.radius
    }

    /// Whether two points stand on the same side of the ring.
    #[must_use]
    pub fn same_side(&self, a: [f64; 2], b: [f64; 2]) -> bool {
        self.holds(a[0], a[1]) == self.holds(b[0], b[1])
    }

    /// The body after its step, `after`, kept on the side of the ring `before` stood on: pushed along the line from the
    /// centre back to the wall less its radius inside, or past it by its radius outside, and its speed toward the wall
    /// taken off so a fall or a leap does not press on through it.
    #[must_use]
    pub fn keep(&self, before: &Body, after: Body) -> Body {
        let inside = self.holds(before.x, before.y);
        let reach = if inside { self.radius - TUNING.radius } else { self.radius + TUNING.radius };
        let (mut east, mut south) = (after.x - self.x, after.y - self.y);
        let mut apart = (east * east + south * south).sqrt();
        let clear = if inside { apart <= reach } else { apart >= reach };
        if clear {
            return after;
        }
        if apart == 0.0 {
            // Outside a moment ago and now on the centre: put back the way it came, or east if it came from there too.
            (east, south) = (before.x - self.x, before.y - self.y);
            apart = (east * east + south * south).sqrt();
            if apart == 0.0 {
                (east, south, apart) = (1.0, 0.0, 1.0);
            }
        }
        let (out_east, out_south) = (east / apart, south / apart);
        let toward = after.vx * out_east + after.vy * out_south;
        let pressing = if inside { toward > 0.0 } else { toward < 0.0 };
        let (vx, vy) =
            if pressing { (after.vx - toward * out_east, after.vy - toward * out_south) } else { (after.vx, after.vy) };
        let reach = reach.max(0.0);
        Body { x: self.x + out_east * reach, y: self.y + out_south * reach, vx, vy, ..after }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::body::standing;

    const RING: Fence = Fence { x: 100.0, y: 50.0, radius: 20.0 };

    fn apart(body: &Body) -> f64 {
        ((body.x - RING.x).powi(2) + (body.y - RING.y).powi(2)).sqrt()
    }

    #[test]
    fn a_body_inside_walking_at_the_wall_stops_its_radius_short_of_it() {
        let before = standing(119.5, 50.0);
        let after = Body { vx: 4.0, vy: 1.0, ..standing(119.9, 50.0) };
        let kept = RING.keep(&before, after);
        assert!((apart(&kept) - (20.0 - TUNING.radius)).abs() < 1e-9, "{}", apart(&kept));
        assert!(kept.vx.abs() < 1e-9 && (kept.vy - 1.0).abs() < 1e-9, "only its speed along the wall is kept");
    }

    #[test]
    fn a_body_outside_is_kept_out_and_one_well_clear_moves_as_it_stepped() {
        let kept = RING.keep(&standing(121.0, 50.0), standing(119.0, 50.0));
        assert!((apart(&kept) - (20.0 + TUNING.radius)).abs() < 1e-9 && kept.x > RING.x + 20.0);
        let clear = standing(110.0, 52.0);
        assert_eq!(RING.keep(&standing(110.0, 51.0), clear), clear);
        assert_eq!(RING.keep(&standing(140.0, 50.0), standing(141.0, 50.0)), standing(141.0, 50.0));
    }

    #[test]
    fn a_leap_from_inside_clear_across_the_ring_lands_back_inside_on_its_line() {
        let kept = RING.keep(&standing(115.0, 50.0), standing(130.0, 50.0));
        assert!(RING.holds(kept.x, kept.y) && (kept.y - 50.0).abs() < 1e-9 && kept.x > 119.0);
    }

    #[test]
    fn a_body_straddling_the_wall_as_it_rises_goes_to_the_side_its_feet_are_on() {
        let on_the_line = standing(120.0, 50.0);
        let kept = RING.keep(&on_the_line, on_the_line);
        assert!((apart(&kept) - (20.0 - TUNING.radius)).abs() < 1e-9, "the line itself counts inside");
        let just_out = standing(120.1, 50.0);
        assert!(apart(&RING.keep(&just_out, just_out)) > 20.0 + TUNING.radius - 1e-9);
        assert_eq!(RING.same_side([100.0, 50.0], [120.0, 50.0]), true);
        assert_eq!(RING.same_side([100.0, 50.0], [120.1, 50.0]), false);
    }

    #[test]
    fn a_body_from_outside_put_on_the_centre_goes_back_out_the_way_it_came() {
        let kept = RING.keep(&standing(100.0, 80.0), standing(100.0, 50.0));
        assert!(kept.y > 50.0 + 20.0 && (kept.x - 100.0).abs() < 1e-9);
    }
}
