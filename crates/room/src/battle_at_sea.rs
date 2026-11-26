//! The sea's fights as the sea round them reads them: where their captains lie, for the held map, and home waters
//! ending them.
use super::{Fights, ShipId};
use naval::damage::State;
use naval::fight::{End, Event, Sailor};

impl Fights {
    /// Every captain still afloat and unstruck in a fight whose players all lie inside home waters (`home`) breaks off
    /// and sails off, as one out of reach does, the fight told with its next tick: home waters shelter a player whole.
    pub fn break_off_home(&mut self, home: impl Fn([f64; 2]) -> bool) {
        for fought in &mut self.list {
            let at = |ship: ShipId| fought.fight.vessel(ship).map(|vessel| [vessel.ship.x, vessel.ship.y]);
            if !fought.crews.values().all(|crew| at(crew.ship).is_some_and(&home)) {
                continue;
            }
            for (&id, vessel) in &mut fought.fight.ships {
                let afloat = vessel.damage.state == State::Afloat;
                let Sailor::Captain(command) = &mut vessel.sailor else { continue };
                if afloat && command.gone.is_none() {
                    command.gone = Some(End::Gone);
                    fought.pending.push(Event::Gone { ship: id, end: End::Gone });
                }
            }
        }
    }

    /// Where each captain still in a fight with players lies: none that has sunk or sailed off.
    pub fn captains_at(&self) -> impl Iterator<Item = [f64; 2]> + '_ {
        self.list.iter().flat_map(|fought| {
            let vessels = fought.hostiles.keys().filter_map(|id| fought.fight.vessel(*id));
            vessels.filter(|vessel| vessel.in_fight()).map(|vessel| [vessel.ship.x, vessel.ship.y])
        })
    }
}
