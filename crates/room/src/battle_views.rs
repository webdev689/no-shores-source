//! What the players in the sea's fights are sent: each one's view of their fight, kept for a fight that ended unseen.

use super::{FightSeen, Fights, SeaFight};
use crate::sea::Coast;
use crate::sea_weather::CoastWaters;
use naval::wire::view_numbers;

impl Fights {
    /// Each fighting player's view of their fight (the naval crate's numbers, their ship as its player's), its lay
    /// over the fight's waters now, its first captain's commission, and whether they may board (`alongside`); then
    /// the kept last views of fights that ended unseen.
    pub(crate) fn views<'fights>(
        &'fights self,
        coasts: &'fights [Coast],
        time: f64,
    ) -> impl Iterator<Item = FightSeen> + 'fights {
        let live = self.list.iter().flat_map(move |fought| self.seen(fought, coasts, time));
        live.chain(self.ended.iter().cloned())
    }

    /// Each of a fight's players' view of it.
    pub(super) fn seen<'fights>(
        &'fights self,
        fought: &'fights SeaFight,
        coasts: &'fights [Coast],
        time: f64,
    ) -> impl Iterator<Item = FightSeen> + 'fights {
        fought.crews.iter().map(move |(player, crew)| {
            let aim = crew.orders.aim;
            let waters = CoastWaters { coasts, swell: &fought.swell };
            let numbers = view_numbers(&fought.fight, crew.ship, &fought.events, aim.as_ref(), &waters, time);
            let may_board = self.alongside(*player).is_ok();
            FightSeen { player: *player, numbers, captain: fought.first_captain(), may_board }
        })
    }

    /// The views were taken into a snapshot: each fight ended by now was seen ended, and the unseen ones' kept views
    /// are let go.
    pub fn sent(&mut self) {
        for fought in &mut self.list {
            fought.over_sent = fought.fight.over().is_some();
        }
        self.ended.clear();
    }
}
