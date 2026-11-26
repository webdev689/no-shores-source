//! A Grey Tithe ship and the friendly ship it attacked, fighting at sea with no player in the fight: the naval crate's
//! fight of many ships, stepped by the room, each ship where the fight has it. The friendly ship flies the players'
//! flag. It lasts while either fights on (its mode `Engage`): then one who struck, sank or runs leaves the sea, and the
//! rest sail on, the Tithe ship as hostile ships do, the friendly one for its port (`friendlies`). A player who comes
//! within sight of one of its ships joins it, on the friendly side, and it becomes their fight.

use crate::friendlies::{Friendlies, Friendly, friendly_commission};
use crate::hostiles::{Hostile, Hostiles};
use crate::sea::Coast;
use crate::sea_weather::CoastWaters;
use combat::sight::apart;
use land::sea::Swell;
use naval::captain::{ENGAGE_RANGE, Mode};
use naval::fight::{CAPTAIN, Fight, Vessel};
use naval::night::runs_dark;
use naval::ranks::PLAYERS;
use naval::shots::ShipId;
use sailing::ship::{SAILS_SET, Ship};

/// A ship at sea at a point, on a heading, at a rung of its ladder, lying still: its hull is its captain's or the
/// player's Sloop.
#[must_use]
pub fn ship_at(x: f64, y: f64, heading: f64, rung: i8) -> Ship {
    Ship { x, y, heading, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung }
}

/// A Tithe ship's attack on a friendly ship at sea: the fight, the ship each sailed as at sea, by its number in it, and
/// the swell and the wind where it began, kept while it lasts.
#[derive(Debug)]
pub struct Clash {
    pub fight: Fight,
    crews: Vec<(ShipId, Hostile)>,
    friends: Vec<(ShipId, Friendly)>,
    pub swell: Swell,
    pub wind: [f64; 2],
}

/// A ship of the fight that `stays`, where the fight has it, with what it sailed as at sea.
fn sailing<T: Copy>(fight: &Fight, (id, at_sea): &(ShipId, T), stays: impl Fn(&Vessel) -> bool) -> Option<(Ship, T)> {
    Some((fight.vessel(*id).filter(|vessel| stays(vessel))?.ship, *at_sea))
}

/// A friendly ship that has left its fight (struck, or with no foe left) and is afloat, where the fight left it.
pub(crate) fn sailed_off(fight: &Fight, (id, friend): (ShipId, Friendly)) -> Option<Friendly> {
    let ship = fight.vessel(id).filter(|vessel| afloat(vessel) && !vessel.in_fight())?.ship;
    Some(Friendly { x: ship.x, y: ship.y, heading: ship.heading, ..friend })
}

/// Tells a fight the daylight over it at `unix_s` (seconds since the Unix epoch, as a room's world start counts),
/// read where its first ship lies: by night its captains' lookouts see a ship only as far as her lanterns show her
/// (`naval::night`).
pub(crate) fn light_fight(fight: &mut Fight, unix_s: f64) {
    if let Some(vessel) = fight.ships.values().next() {
        let world_s = sky::clock::world_seconds(unix_s * 1000.0);
        fight.daylight = sky::heavens::heavens_at(vessel.ship.y, world_s).daylight();
    }
}

/// Whether a ship is still afloat: neither going down nor sunk, whether or not it struck or runs.
pub(crate) fn afloat(vessel: &Vessel) -> bool {
    !matches!(vessel.damage.state, naval::damage::State::Sinking | naval::damage::State::Sunk)
}

impl Clash {
    /// The fight of a Tithe ship and the friendly ship it met, each where it lay and under its sails, under the swell
    /// and the wind of `weather`: the Tithe ship's seed draws the fight's chances. The friendly ship fights in its own
    /// hull under the players' flag, at the Tithe ship's level.
    #[must_use]
    pub(crate) fn begin(
        (tithe, friend): (Hostile, Friendly),
        (swell, wind): (Swell, [f64; 2]),
        coasts: &[Coast],
        time: f64,
    ) -> Clash {
        let waters = CoastWaters { coasts, swell: &swell };
        let mut fight = Fight::new(tithe.seed);
        let captain = ship_at(tithe.x, tithe.y, tithe.heading, SAILS_SET);
        fight.enlist(CAPTAIN, captain, tithe.commission, tithe.seed, &waters, time);
        fight.raise(CAPTAIN, tithe.strength());
        let friend = Friendly { level: tithe.level, ..friend };
        let ship = ship_at(friend.x, friend.y, friend.heading, SAILS_SET);
        fight.enlist_in(CAPTAIN + 1, ship, (friendly_commission(), friend.hull), friend.seed, &waters, time);
        fight.raise(CAPTAIN + 1, friend.strength());
        Clash { fight, crews: vec![(CAPTAIN, tithe)], friends: vec![(CAPTAIN + 1, friend)], swell, wind }
    }

    /// Each of its Tithe ships by its number in the fight, as it sailed at sea.
    #[must_use]
    pub fn crews(&self) -> &[(ShipId, Hostile)] {
        &self.crews
    }

    /// Each of its friendly ships by its number in the fight, as it sailed at sea.
    #[must_use]
    pub fn friends(&self) -> &[(ShipId, Friendly)] {
        &self.friends
    }

    /// Each of its Tithe ships still in the fight as a ship at sea, where the fight has it.
    pub fn ships(&self) -> impl Iterator<Item = Hostile> + '_ {
        let fought = self.crews.iter().filter_map(|crew| sailing(&self.fight, crew, Vessel::in_fight));
        fought.map(|(ship, hostile)| Hostile { x: ship.x, y: ship.y, heading: ship.heading, ..hostile })
    }

    /// Each of its friendly ships still in the fight as a ship at sea, where the fight has it, dark while it runs.
    pub fn friendlies(&self) -> impl Iterator<Item = Friendly> + '_ {
        self.friends.iter().filter_map(|(id, friend)| {
            let vessel = self.fight.vessel(*id).filter(|vessel| vessel.in_fight())?;
            let runs = vessel.command().is_some_and(|command| command.mind.mode == Mode::Flee);
            let dark = runs_dark(PLAYERS, runs);
            let ship = vessel.ship;
            Some(Friendly { x: ship.x, y: ship.y, heading: ship.heading, dark, ..*friend })
        })
    }

    /// Whether it is over: none of its captains fights on.
    #[must_use]
    pub fn settled(&self) -> bool {
        let mut captains = self.fight.ships.values().filter(|vessel| vessel.in_fight()).filter_map(Vessel::command);
        !captains.any(|command| command.mind.mode == Mode::Engage)
    }

    /// The ships that sail on once it is over, where the fight left them: each Tithe ship afloat, unstruck and not
    /// running, and each friendly ship afloat (`afloat`).
    #[must_use]
    pub fn sail_on(&self) -> (Vec<Hostile>, Vec<Friendly>) {
        let sails_on = |vessel: &Vessel| {
            vessel.damage.fighting() && vessel.command().is_some_and(|command| command.mind.mode != Mode::Flee)
        };
        let tithe = self.crews.iter().filter_map(|crew| sailing(&self.fight, crew, sails_on));
        let tithe = tithe.map(|(ship, hostile)| Hostile { x: ship.x, y: ship.y, heading: ship.heading, ..hostile });
        let friends = self.friends.iter().filter_map(|crew| sailing(&self.fight, crew, afloat));
        let friends = friends.map(|(ship, friend)| Friendly { x: ship.x, y: ship.y, heading: ship.heading, ..friend });
        (tithe.collect(), friends.collect())
    }
}

/// One tick of the clashes at sea, each player's ship at `players`: each steps, with no orders, under its own weather
/// on the waters of `coasts`; one with no ship a player keeps at sea (within 1.1 times its sight) leaves the sea, as a
/// ship at sea does; and one that is over sends the ships that sail on back to sea, parted.
pub(crate) fn step_clashes(
    clashes: &mut Vec<Clash>,
    (hostiles, friendlies): (&mut Hostiles, &mut Friendlies),
    players: &[[f64; 2]],
    (coasts, time): (&[Coast], f64),
) {
    let near = |clash: &Clash| {
        clash.ships().any(|ship| players.iter().any(|&at| ship.kept_by(at)))
            || clash.friendlies().any(|ship| players.iter().any(|&at| ship.kept_by(at)))
    };
    clashes.retain(near);
    for clash in clashes.iter_mut() {
        let waters = CoastWaters { coasts, swell: &clash.swell };
        let wind = clash.wind;
        clash.fight.step(&[], &waters, &|_| wind, time);
        // A friendly ship that struck sails off at once, parted from the Tithe ships it fought.
        let (off, kept) =
            std::mem::take(&mut clash.friends).into_iter().partition(|&pair| sailed_off(&clash.fight, pair).is_some());
        clash.friends = kept;
        let off: Vec<Friendly> =
            off.into_iter().filter_map(|pair: (ShipId, Friendly)| sailed_off(&clash.fight, pair)).collect();
        let tithe: Vec<u32> = clash.crews.iter().map(|(_, hostile)| hostile.id).collect();
        friendlies.back_from_clash(&tithe, off);
    }
    for clash in clashes.iter().filter(|clash| clash.settled()) {
        let (tithe, friends) = clash.sail_on();
        let parted: Vec<u32> = tithe.iter().map(|hostile| hostile.id).collect();
        hostiles.back_from_clash(tithe);
        friendlies.back_from_clash(&parted, friends);
    }
    clashes.retain(|clash| !clash.settled());
}

/// The clash a player at `at` comes within sight of, the first of any, taken from the sea for their fight.
pub fn sighted(clashes: &mut Vec<Clash>, at: [f64; 2]) -> Option<Clash> {
    let within = |[x, y]: [f64; 2]| apart(at, [x, y]) <= ENGAGE_RANGE;
    let index = clashes.iter().position(|clash| {
        clash.ships().any(|ship| within([ship.x, ship.y])) || clash.friendlies().any(|ship| within([ship.x, ship.y]))
    })?;
    Some(clashes.remove(index))
}

#[cfg(test)]
#[path = "clash_tests.rs"]
pub(crate) mod tests;
