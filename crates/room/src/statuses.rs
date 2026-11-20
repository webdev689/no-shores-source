//! Statuses in the room: the one way every source gives a fighter one (a spell, a weapon's perk, the Test Ground), how
//! long each lasts on whom, Linked's heal each second, and what statuses make of a blow's damage as it is settled. A
//! fighter keeps its own and runs them down as it steps (combat's `status`), so a browser predicting its player runs
//! them down alike; the snapshot carries them to every browser.

use crate::{PlayerId, Room};
use combat::fighter::FighterId;
use combat::status::{LINKED_HEAL, charge_ticks, crits, times};
use combat::{Blow, Fighter, Status, Verdict, give};

/// Linked heals once a second of the room's clock.
const HEAL_EVERY: u64 = 60;

impl Room {
    /// Gives `fighter` a status from `from` (none for the room itself) for `ticks`, or for its own time with none
    /// (`lasts`). Every source gives a status through this. Answers whether it took: a Charge does not on a fighter
    /// already Charged or still immune, and the dead take nothing.
    pub fn give(&mut self, fighter: FighterId, status: Status, ticks: Option<u32>, from: Option<FighterId>) -> bool {
        let ticks = ticks.unwrap_or_else(|| self.lasts(fighter, status));
        let Some(next) = self.fighter(fighter).and_then(|now| give(now, status, ticks, from)) else { return false };
        self.set_fighter(fighter, next);
        // A Sunwell keeps its share as it gives Linked; any other giver's Linked heals as written.
        if status == Status::Linked {
            self.spells.linked.remove(&fighter);
        }
        // Overload: a foe the player Charges is Exposed too, as long as the Art that holds it lasts at its level.
        let by = from.and_then(|from| self.players.get(&from)).map(|by| &by.character);
        let overload = by.filter(|by| by.fragment("overload").is_some()).map(|by| by.art_shares(by.art().id).1);
        if status == Status::Charge
            && let Some(lasting) = overload
        {
            let lasts = combat::ticks(f64::from(Status::Expose.ticks()) / 60.0 * lasting);
            self.give(fighter, Status::Expose, Some(lasts), from);
        }
        true
    }

    /// How long a status lasts on a fighter unless its giver says: a Charge by a foe's rank, a player's as a Minor's;
    /// any other its own time.
    #[must_use]
    pub fn lasts(&self, fighter: FighterId, status: Status) -> u32 {
        match (status, self.foes.get(&fighter)) {
            (Status::Charge, Some(foe)) => charge_ticks(foe.brain.rank as u8),
            _ => status.ticks(),
        }
    }

    /// Each second of the room's clock, every living Linked fighter heals: by the share of the Sunwell that Linked it,
    /// kept from its cast, or as written for a Linked no Sunwell gave (the Test Ground's grant). A share is let go once
    /// its fighter is no longer Linked.
    pub(crate) fn heal_linked(&mut self) {
        if !self.clock.is_multiple_of(HEAL_EVERY) {
            return;
        }
        let shares = std::mem::take(&mut self.spells.linked);
        let players = self.players.iter_mut().map(|(id, found)| (*id, &mut found.fighter));
        let foes = self.foes.iter_mut().map(|(id, foe)| (*id, &mut foe.fighter));
        for (id, fighter) in players.chain(foes).filter(|(_, fighter)| fighter.statuses.has(Status::Linked)) {
            let share = shares.get(&id).copied();
            if !fighter.dead() {
                fighter.health = (fighter.health + LINKED_HEAL * share.unwrap_or(1.0)).min(fighter.health_max);
            }
            if let Some(share) = share {
                self.spells.linked.insert(id, share);
            }
        }
    }

    /// A verdict's damage as statuses weigh it: a crit, its striker's Linked (as the striker stands now) and its
    /// defender's Expose; and a player's crit on an Exposed foe 10% more with Cruelty.
    pub(crate) fn weighed(&self, blow: &Blow, defender: &Fighter, verdict: Verdict) -> Verdict {
        let striker = self.fighter(blow.striker);
        let cruelty = self.players.get(&blow.striker).and_then(|found| found.character.fragment("cruelty"));
        let cruel = cruelty.filter(|_| defender.statuses.has(Status::Expose) && crits(blow, striker, defender));
        let times = times(blow, striker, defender) * cruel.map_or(1.0, |cruelty| cruelty.crit_times);
        match verdict {
            Verdict::Hit { damage, poise } => Verdict::Hit { damage: damage * times, poise },
            Verdict::Blocked { damage, stamina } => Verdict::Blocked { damage: damage * times, stamina },
            Verdict::GuardBroken { damage } => Verdict::GuardBroken { damage: damage * times },
            other => other,
        }
    }

    /// The Test Ground's grant of a status from the player, on themselves or on every foe, for `ticks` or its own time.
    pub(crate) fn grant_status(&mut self, player: PlayerId, status: Status, on_foes: bool, ticks: Option<u32>) {
        let whom: Vec<FighterId> = if on_foes { self.foes.keys().copied().collect() } else { vec![player] };
        for fighter in whom {
            self.give(fighter, status, ticks, Some(player));
        }
    }
}

#[cfg(test)]
#[path = "statuses_tests.rs"]
mod statuses_tests;
