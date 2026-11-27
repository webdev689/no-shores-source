//! A player's burst of speed in a fight: a tap drives its ship's sails and oars half again for a few seconds, and once
//! the burst is over it recharges before it may burst again. A ship that never taps sails as it always has.

/// How much harder a burst drives its ship's sails and oars, how long it lasts, and how long it then takes to
/// recharge (seconds).
pub const BURST_DRIVE: f64 = 1.5;
pub const BURST_S: f64 = 4.0;
pub const RECHARGE_S: f64 = 12.0;

/// A ship's burst: the seconds it still drives it, then the seconds left before it may burst again.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Boost {
    burst: f64,
    recharge: f64,
}

impl Boost {
    /// Whether it may burst: its last burst is over and recharged.
    #[must_use]
    pub fn ready(&self) -> bool {
        self.burst <= 0.0 && self.recharge <= 0.0
    }

    /// A tap: it bursts if it is ready. Answers whether it did.
    pub fn tap(&mut self) -> bool {
        let ready = self.ready();
        if ready {
            (self.burst, self.recharge) = (BURST_S, RECHARGE_S);
        }
        ready
    }

    /// The share of its sails' and oars' pull it gives: `BURST_DRIVE` while it bursts, else whole.
    #[must_use]
    pub fn drive(&self) -> f64 {
        if self.burst > 0.0 { BURST_DRIVE } else { 1.0 }
    }

    /// The share of its burst still to run, and the share of its recharge done (1 once it is ready).
    #[must_use]
    pub fn shares(&self) -> [f64; 2] {
        [self.burst / BURST_S, 1.0 - self.recharge / RECHARGE_S]
    }

    /// Its clocks run: its burst, then once that is over, its recharge.
    pub fn step(&mut self, seconds: f64) {
        let seconds = seconds.max(0.0);
        if self.burst > 0.0 {
            self.burst = (self.burst - seconds).max(0.0);
        } else {
            self.recharge = (self.recharge - seconds).max(0.0);
        }
    }

    /// Every number it holds, in a fixed order.
    #[must_use]
    pub fn numbers(&self) -> [f64; 2] {
        [self.burst, self.recharge]
    }
}

#[cfg(test)]
#[path = "boost_tests.rs"]
mod tests;
