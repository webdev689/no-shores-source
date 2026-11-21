//! The ship's own power in the sea's fights: each fighting player's ship fitted by its character before each tick,
//! its level, Attack and Defense against each captain's level by the gear crate's law (`gear::ship`), its modules' and
//! officers' trim; and what a captain it fought going down or striking pays it and its officers.

use crate::PlayerId;
use crate::battle::{Fights, Sank};
use crate::pirates::Pirate;
use gear::Character;
use gear::crew::Post;
use gear::ship::ShipPower;
use gear::ship::trim::ShipTrim;
#[cfg(test)]
use gear::{Ask, asks::Here};
use naval::fight::fitting::{Fitting, Trim};
use naval::shots::ShipId;
use std::collections::BTreeMap;

/// Its trim as the naval rules take it.
#[must_use]
pub fn trim_of(trim: &ShipTrim) -> Trim {
    Trim {
        reload: trim.reload,
        scatter: trim.scatter,
        harm_hull: trim.harm_hull,
        harm_sail: trim.harm_sail,
        harm_crew: trim.harm_crew,
        finisher: trim.finisher,
        way: trim.way,
        turn: trim.turn,
        hull_taken: trim.hull_taken,
        sail_taken: trim.sail_taken,
        crew_taken: trim.crew_taken,
        cornered: trim.cornered,
        holed_taken: trim.holed_taken,
        rally: trim.rally,
        ram: trim.ram,
        patch: trim.patch,
        gunner: trim.post(Post::Gunner),
        bosun: trim.post(Post::Bosun),
        carpenter: trim.post(Post::Carpenter),
        holing: trim.holing,
        mend: trim.mend,
        last_stand: trim.last_stand,
        feeding: trim.feeding,
        own_wind: trim.own_wind,
        squall: trim.squall,
        web: trim.web,
        snare: trim.snare,
    }
}

/// A player's ship fitted against each captain in its fight: its balls' harm on it by its Attack and level against
/// its level, a captain's on it by its Defense, in place of what the captain's level makes of its guns.
#[must_use]
pub fn fitting(character: &Character, hostiles: &BTreeMap<ShipId, Pirate>) -> Fitting {
    let levels = hostiles.iter().map(|(id, other_ship)| (*id, other_ship.level));
    fitted(character.ship_power(), trim_of(&character.ship_trim()), levels)
}

/// A ship of `power` and `trim` fitted against each captain by its level: what its balls do to one by its Attack, and
/// what one's do to it by its Defense, a captain's level having raised its own guns' harm already.
#[must_use]
pub fn fitted(power: ShipPower, trim: Trim, levels: impl Iterator<Item = (ShipId, u8)>) -> Fitting {
    let (mut dealt, mut taken) = (BTreeMap::new(), BTreeMap::new());
    for (id, level) in levels {
        dealt.insert(id, power.harm_dealt(level));
        taken.insert(id, power.harm_taken(level) / gear::power::foe_health_times(level));
    }
    Fitting { dealt, taken, trim, ..Fitting::default() }
}

impl Fights {
    /// Fits every fighting player's ship whose character the sea holds, for the tick to come.
    pub(crate) fn fit(&mut self, characters: &BTreeMap<PlayerId, Character>) {
        for fought in &mut self.list {
            for (player, crew) in &fought.crews {
                if let Some(character) = characters.get(player) {
                    // A player back in the fight whose last stand it spent has none again.
                    let stood = fought.stood.contains(player);
                    fought.fight.fit(crew.ship, Fitting { stood, ..fitting(character, &fought.hostiles) });
                }
            }
        }
    }
}

/// What a captain who went down pays each player who fought it, whose character the sea holds: its rank's foe's XP
/// at its level, raised by the sea's tier, to their ship and to their officers aboard. Answers who was paid.
pub fn pay_sinking(
    sank: &Sank,
    difficulty: gear::Difficulty,
    characters: &mut BTreeMap<PlayerId, Character>,
) -> Vec<PlayerId> {
    let rank = sank.pirate.commission.rank;
    let foe = crate::flotsam::foe_of(rank);
    let mut paid = Vec::new();
    for player in &sank.players {
        let Some(character) = characters.get_mut(player) else { continue };
        let xp = character.reward_sinking(foe, rank.number(), sank.pirate.level, difficulty);
        character.earn_officer_xp(xp, true);
        paid.push(*player);
    }
    paid
}

/// A won deck's captain's officer, now and then, joining a boarder who won it: each boarder rolls their own, at its
/// level, more often the higher its rank (`gear::crew::recruit::taken`). Answers who gained one.
pub fn officers_join(won: &Sank, tick: u64, characters: &mut BTreeMap<PlayerId, Character>) -> Vec<PlayerId> {
    let mut joined = Vec::new();
    for player in &won.players {
        let Some(character) = characters.get_mut(player) else { continue };
        let dice = gear::dice::Dice { seed: u64::from(won.pirate.seed), tick, player: *player };
        let rank = won.pirate.commission.rank.number();
        let officer = gear::crew::recruit::taken(rank, won.pirate.level, &dice);
        if officer.and_then(|officer| character.sign_on(officer)).is_some() {
            joined.push(*player);
        }
    }
    joined
}

#[cfg(test)]
#[path = "ship_power_tests.rs"]
mod tests;
