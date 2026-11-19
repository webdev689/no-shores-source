//! Lightning over the world, the same for everyone. The map is cut into cells and time into slots; a cell's storm
//! at the start of a slot sets the odds that it strikes in it, and where and when the strike falls come from the
//! cell's and the slot's hash. Any window of time asks the same question of each slot, so strikes never differ by
//! when or how often a browser asks.

use crate::air::Air;
use crate::weather::storm_at;
use land::exact::rand01;

/// The cell's side, metres, and the slot's length, seconds.
pub const CELL_M: f64 = 4000.0;
pub const SLOT_S: f64 = 6.0;
/// The odds a cell strikes in a slot under a whole storm, and the share of strikes that reach the ground.
pub const STRIKE_ODDS: f64 = 0.18;
pub const TO_GROUND: f64 = 0.3;
const SEED: u32 = 0x5C1E_B017;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Strike {
    pub x: f64,
    pub y: f64,
    pub at_s: f64,
    pub to_ground: bool,
    /// How bright and loud it is, a half to 1.
    pub power: f64,
}

/// Every strike within `radius_m` of (x, y) from `from_s` up to `to_s`, in the place's air, earliest first.
#[must_use]
pub fn strikes_near(air: &Air, x: f64, y: f64, radius_m: f64, from_s: f64, to_s: f64) -> Vec<Strike> {
    let mut strikes = Vec::new();
    let (first_slot, last_slot) = ((from_s / SLOT_S).floor() as i64, (to_s / SLOT_S).floor() as i64);
    let (low_x, high_x) = (((x - radius_m) / CELL_M).floor() as i64, ((x + radius_m) / CELL_M).floor() as i64);
    let (low_y, high_y) = (((y - radius_m) / CELL_M).floor() as i64, ((y + radius_m) / CELL_M).floor() as i64);
    for slot in first_slot..=last_slot {
        let start = slot as f64 * SLOT_S;
        for cell_y in low_y..=high_y {
            for cell_x in low_x..=high_x {
                let draw = |salt: i64| rand01(SEED, &[cell_x, cell_y, slot, salt]);
                let (centre_x, centre_y) = ((cell_x as f64 + 0.5) * CELL_M, (cell_y as f64 + 0.5) * CELL_M);
                let (across, down) = (centre_x - x, centre_y - y);
                // The cheap draw first: a cell that cannot strike even under a whole storm needs no weather read.
                if draw(0) >= STRIKE_ODDS || (across * across + down * down).sqrt() > radius_m + CELL_M {
                    continue;
                }
                if draw(0) >= STRIKE_ODDS * storm_at(air, centre_x, centre_y, start) {
                    continue;
                }
                let strike = Strike {
                    x: (cell_x as f64 + draw(1)) * CELL_M,
                    y: (cell_y as f64 + draw(2)) * CELL_M,
                    at_s: start + draw(3) * SLOT_S,
                    to_ground: draw(4) < TO_GROUND,
                    power: 0.5 + 0.5 * draw(5),
                };
                if (from_s..to_s).contains(&strike.at_s) {
                    strikes.push(strike);
                }
            }
        }
    }
    strikes.sort_by(|first, second| first.at_s.total_cmp(&second.at_s));
    strikes
}
