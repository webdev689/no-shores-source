//! Locked seas: the sea of every island not named yet (`world::islands`) is closed. No course or travel
//! is taken into one, a ship about to cross into one stops at its edge, and a port in one is no port a ship washes up,
//! puts in or is repaired at; a ship the sea kept in one comes back at the starting port's roadstead.

use super::Sea;

impl Sea {
    /// Locks the sea of every island `named` does not name, and every port in one.
    pub fn lock_unnamed(&mut self, named: impl Fn(&str) -> bool) {
        self.chart.lock(named);
        let harbours = &mut self.harbour.harbours;
        harbours.locked = harbours.ports.iter().map(|(_, roadstead)| self.chart.locked(*roadstead)).collect();
    }

    /// Where a ship the sea kept at `at` comes back: there, unless it lies in a locked sea.
    pub(super) fn open_at(&self, at: [f64; 2]) -> Option<[f64; 2]> {
        (!self.chart.locked(at)).then_some(at)
    }
}
