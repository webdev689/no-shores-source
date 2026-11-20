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
        // Overload: a foe the player Charges is Exposed too.
        let overloads =
            from.and_then(|from| self.players.get(&from)).is_some_and(|by| by.character.fragment("overload").is_some());
        if status == Status::Charge && overloads {
            self.give(fighter, Status::Expose, None, from);
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

    /// Each second of the room's clock, every living Linked fighter heals, as much as its giver's Sunwell gives at
    /// the level of the Art it is cast from.
    pub(crate) fn heal_linked(&mut self) {
        if !self.clock.is_multiple_of(HEAL_EVERY) {
            return;
        }
        let sunwell = gear::arts::arts().arts.iter().find(|art| art.anima.key == "sunwell").map(|art| art.id);
        let share_of = |giver: Option<crate::FighterId>| {
            let giver = giver.and_then(|id| self.players.get(&id));
            giver.zip(sunwell).map_or(1.0, |(found, art)| found.character.art_shares(art).0)
        };
        let shares: Vec<f64> =
            self.players.values().map(|found| share_of(found.fighter.statuses.giver(Status::Linked))).collect();
        let foes: Vec<f64> =
            self.foes.values().map(|foe| share_of(foe.fighter.statuses.giver(Status::Linked))).collect();
        let heal = |fighter: &mut Fighter, share: f64| {
            if fighter.statuses.has(Status::Linked) && !fighter.dead() {
                fighter.health = (fighter.health + LINKED_HEAL * share).min(fighter.health_max);
            }
        };
        self.players.values_mut().zip(shares).for_each(|(found, share)| heal(&mut found.fighter, share));
        self.foes.values_mut().zip(foes).for_each(|(foe, share)| heal(&mut foe.fighter, share));
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
