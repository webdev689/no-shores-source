//! The engagement course, as DFO's: far off she steers to intercept; a quarry running from her she runs down astern
//! and then sheers out to its beam; else she brings the side that costs least to bear on where her balls will meet
//! it, bent off the beam to open or close her range, and once presented keeps station with sail.

use super::*;

impl Captain {
    pub(super) fn engage(
        &mut self,
        her: &Her,
        enemy: &Sighting,
        apart: f64,
        is_water: &impl Fn(f64, f64) -> bool,
    ) -> Plan {
        let ship = her.ship;
        let range = self.build.range_m.max(self.dead_zone);
        let reach = lay(ship, her.pose, her.arms, Side::Starboard, her.guns.load, 0.0, None).reach;
        let vel = self.enemy_vel.unwrap_or_else(|| velocity_of(&enemy.ship));
        let own = pace(her.hull, her.wind, self.way_share(her));
        let (me, them) = ([ship.x, ship.y], [enemy.ship.x, enemy.ship.y]);
        if apart > (range * CLOSE_FROM).max(reach) {
            self.present = None;
            return Plan { want: intercept(me, own, them, vel).1, sails: 1.0, track: false };
        }
        let my = velocity_of(ship);
        let rel = [vel[0] - my[0], vel[1] - my[1]];
        let away = (vel[0] * (them[0] - me[0]) + vel[1] * (them[1] - me[1])) / apart.max(1e-6);
        if length(vel[0], vel[1]) > 0.3 {
            let running = heading_to([0.0, 0.0], vel);
            let off_bow = wrap(heading_to(them, me) - running).abs();
            if away > CHASE_AWAY * own && off_bow > ABAFT_DEG * DEG {
                let (_, starboard) = frame(running);
                let side =
                    if (me[0] - them[0]) * starboard[0] + (me[1] - them[1]) * starboard[1] >= 0.0 { 1.0 } else { -1.0 };
                let out = if apart > range * CHASE_SHEER { 0.0 } else { range };
                self.present = None;
                let berth = [them[0] + starboard[0] * side * out, them[1] + starboard[1] * side * out];
                return Plan { want: intercept(me, own, berth, vel).1, sails: 1.0, track: false };
            }
        }
        let lead = lead_point(me, them, rel, her.guns.gun().speed);
        let rate = swing_rate(ship, her.hull).max(1.0) * DEG;
        let reach_held = reach * aim::RUN_OUT_REACH;
        let holds_lead = |present: Option<Present>, side: Side| {
            let lead_d = distance(me, lead);
            if present.is_some_and(|held| held.side == side && held.lays) {
                return lead_d <= reach_held;
            }
            let abeam = wrap(heading_to(me, lead) - side.sign() * 90.0 * DEG);
            let round = wrap(abeam - ship.heading).abs() / rate + 4.0 * TURN_TAU + aim::RUN_OUT_S;
            lead_d + away.max(0.0) * round <= reach_held
        };
        let close_in = if away > 0.0 {
            libm::asin(((away + CHASE_MARGIN * own) / length_of(ship).max(0.5)).clamp(0.0, 1.0))
        } else {
            0.0
        };
        let dead = self.dead_zone;
        let bend = |present: Option<Present>, side: Side| {
            let in_reach = apart <= reach * PRESENT_WITHIN && apart >= (range * POINT_BLANK).max(dead);
            if her.guns.ready(side) && in_reach && holds_lead(present, side) {
                return 0.0;
            }
            if apart < dead {
                return -2.0 * RANGE_BEND_DEG * DEG;
            }
            let bent = ((apart - range) / range).clamp(-1.0, 1.0) * RANGE_BEND_DEG * DEG;
            if apart > range { bent.max(close_in) } else { bent }
        };
        let heading_for = |present: Option<Present>, side: Side| {
            wrap(heading_to(me, lead) - side.sign() * (90.0 * DEG - bend(present, side)))
        };
        if self.present.is_none_or(|held| self.clock - held.at >= NAV_EVERY_S) {
            let look = self.lookout(her);
            let near = land::Lookout { near: f64::INFINITY, ..look };
            let cost = |side: Side| {
                let heading = heading_for(self.present, side);
                let turn = wrap(heading - ship.heading).abs() / rate;
                let foul = if course_clear(me, heading, look.near, is_water, &near) { 0.0 } else { 1e4 };
                turn.max(her.guns.left(side)) + foul
            };
            let held = self.present.map(|present| present.side);
            let weighed =
                |side: Side| cost(side) + if held.is_some_and(|kept| kept != side) { SIDE_HOLD_S } else { 0.0 };
            let best = [Side::Starboard, Side::Port].into_iter().fold(held.unwrap_or(Side::Starboard), |best, side| {
                if weighed(side) < weighed(best) { side } else { best }
            });
            let lays = held == Some(best) && self.present.is_some_and(|present| present.lays);
            self.present = Some(Present { side: best, at: self.clock, lays });
        }
        let Some(present) = self.present else {
            return Plan { want: heading_to(me, them), sails: 1.0, track: false };
        };
        let want = heading_for(Some(present), present.side);
        self.present = Some(Present { lays: bend(Some(present), present.side) == 0.0, ..present });
        let window = fire_window(me, lead, Some(enemy.ship.heading), her.arms, self.build.skill);
        let presented = her.guns.ready(present.side)
            && apart <= reach * PRESENT_WITHIN
            && wrap(want - ship.heading).abs() < 30.0 * DEG
            && window >= 0.0;
        if !presented {
            return Plan { want, sails: 1.0, track: true };
        }
        let (forward, _) = frame(ship.heading);
        let wanted = vel[0] * forward[0]
            + vel[1] * forward[1]
            + PRESENT_GAIN * ((lead[0] - me[0]) * forward[0] + (lead[1] - me[1]) * forward[1]);
        let best = (own * point_of_sail(off_run_deg(forward, her.wind))).max(0.5);
        Plan { want, sails: (wanted / best).clamp(PRESENT_SAILS, 1.0), track: true }
    }
}
