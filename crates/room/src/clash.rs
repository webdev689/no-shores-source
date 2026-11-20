//! Rival ships that meet at sea with no player in the fight: a bold captain and a ship of another faction in her
//! sight fight it out on the naval crate's fight of many ships, stepped by the room, each ship where the fight has
//! her. It lasts while any of them fights on (her mode `Engage`): then one who struck, sank or runs leaves the sea,
//! and the rest sail on. A player who comes within sight of one of its ships joins it, and it becomes their fight.

use crate::pirates::{Pirate, Pirates};
use crate::sea::Coast;
use crate::sea_weather::CoastWaters;
use land::sea::Swell;
use naval::captain::{ENGAGE_RANGE, Mode};
use naval::fight::{CAPTAIN, Fight, Vessel};
use naval::shots::ShipId;
use sailing::ship::{SAILS_SET, Ship};

/// A ship at sea at a point, on a heading, at a rung of her ladder, lying still: her hull is her captain's or the
/// player's Sloop.
#[must_use]
pub fn ship_at(x: f64, y: f64, heading: f64, rung: i8) -> Ship {
    Ship { x, y, heading, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung }
}

/// A fight among captains met at sea: the fight, the ship each of them sailed as at sea, by her number in it, and the
/// swell and the wind where it began, kept while it lasts.
#[derive(Debug)]
pub struct Clash {
    pub fight: Fight,
    crews: Vec<(ShipId, Pirate)>,
    pub swell: Swell,
    pub wind: [f64; 2],
}

impl Clash {
    /// The fight of two ships that met, each where she lay and under her sails, the bold one first, under the swell and
    /// the wind of `weather`: her seed draws the fight's chances.
    #[must_use]
    pub(crate) fn begin(met: [Pirate; 2], (swell, wind): (Swell, [f64; 2]), coasts: &[Coast], time: f64) -> Clash {
        let waters = CoastWaters { coasts, swell: &swell };
        let crews: Vec<(ShipId, Pirate)> = (CAPTAIN..).zip(met).collect();
        let captains: Vec<_> = crews
            .iter()
            .map(|(_, pirate)| (ship_at(pirate.x, pirate.y, pirate.heading, SAILS_SET), pirate.commission, pirate.seed))
            .collect();
        Clash { fight: Fight::among(&captains, &waters, time), crews, swell, wind }
    }

    /// Each of its ships by her number in the fight, as she sailed at sea.
    #[must_use]
    pub fn crews(&self) -> &[(ShipId, Pirate)] {
        &self.crews
    }

    /// Each of its ships still in the fight as a ship at sea, where the fight has her.
    pub fn ships(&self) -> impl Iterator<Item = Pirate> + '_ {
        self.crews.iter().filter_map(|(id, pirate)| {
            let ship = self.fight.vessel(*id).filter(|vessel| vessel.in_fight())?.ship;
            Some(Pirate { x: ship.x, y: ship.y, heading: ship.heading, ..*pirate })
        })
    }

    /// Whether it is over: none of its captains fights on.
    #[must_use]
    pub fn settled(&self) -> bool {
        let mut captains = self.fight.ships.values().filter(|vessel| vessel.in_fight()).filter_map(Vessel::command);
        !captains.any(|command| command.her.mode == Mode::Engage)
    }

    /// The ships that sail on once it is over, where the fight left them: each afloat, unstruck and not running.
    #[must_use]
    pub fn sail_on(&self) -> Vec<Pirate> {
        let sails_on = |vessel: &Vessel| {
            vessel.damage.fighting() && vessel.command().is_some_and(|command| command.her.mode != Mode::Flee)
        };
        let afloat = self.crews.iter().filter_map(|(id, pirate)| {
            let ship = self.fight.vessel(*id).filter(|vessel| sails_on(vessel))?.ship;
            Some(Pirate { x: ship.x, y: ship.y, heading: ship.heading, ..*pirate })
        });
        afloat.collect()
    }
}

fn apart(from: [f64; 2], to: [f64; 2]) -> f64 {
    let (east, south) = (to[0] - from[0], to[1] - from[1]);
    (east * east + south * south).sqrt()
}

/// One tick of the clashes at sea, each player's ship at `players`: each steps, with no orders, under its own weather
/// on the waters of `coasts`; one with no ship a
/// player keeps at sea (within 1.1 times her sight) leaves the sea, as a ship at sea does; and one that is over sends
/// the ships that sail on back to sea.
pub(crate) fn step_clashes(
    clashes: &mut Vec<Clash>,
    pirates: &mut Pirates,
    players: &[[f64; 2]],
    (coasts, time): (&[Coast], f64),
) {
    let near = |clash: &Clash| clash.ships().any(|ship| players.iter().any(|&at| ship.kept_by(at)));
    clashes.retain(near);
    for clash in clashes.iter_mut() {
        let waters = CoastWaters { coasts, swell: &clash.swell };
        clash.fight.step(&[], &waters, clash.wind, time);
    }
    for clash in clashes.iter().filter(|clash| clash.settled()) {
        pirates.back_from_clash(clash.sail_on());
    }
    clashes.retain(|clash| !clash.settled());
}

/// The clash a player at `at` comes within sight of, the first of any, taken from the sea for their fight.
pub fn sighted(clashes: &mut Vec<Clash>, at: [f64; 2]) -> Option<Clash> {
    let index =
        clashes.iter().position(|clash| clash.ships().any(|ship| apart(at, [ship.x, ship.y]) <= ENGAGE_RANGE))?;
    Some(clashes.remove(index))
}

#[cfg(test)]
#[path = "clash_tests.rs"]
pub(crate) mod tests;
