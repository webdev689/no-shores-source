//! The water each player's ship lies in, by its name: the chat's Region channel at sea is the water's own.

use super::Sea;
use crate::PlayerId;

impl Sea {
    /// The name of the water a player's ship lies in; none before it puts to sea, or for a point the chart reads as
    /// land.
    #[must_use]
    pub fn water_name(&self, player: PlayerId) -> Option<&'static str> {
        let (_, ship) = self.ships().find(|(id, _)| *id == player)?;
        world::waters::name_of(self.chart.water_id([ship.x, ship.y])?)
    }
}
