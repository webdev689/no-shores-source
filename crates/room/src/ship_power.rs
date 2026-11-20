//! The ship's own power in the sea's fights: each fighting player's ship fitted by its character before each tick,
//! its level, Attack and Defense against each captain's level by the gear crate's law (`gear::ship`), its modules' and
//! officers' trim; and what a captain it fought going down or striking pays it and its officers.

use crate::PlayerId;
use crate::battle::{Fights, Sank};
use crate::pirates::Pirate;
use gear::Character;
use gear::crew::Post;
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
    }
}

/// A player's ship fitted against each captain in its fight: its balls' harm on it by its Attack and level against
/// its level, a captain's on it by its Defense, in place of what the captain's level makes of its guns.
#[must_use]
pub fn fitting(character: &Character, hostiles: &BTreeMap<ShipId, Pirate>) -> Fitting {
    let power = character.ship_power();
    let dealt = hostiles.iter().map(|(id, other_ship)| (*id, power.harm_dealt(other_ship.level))).collect();
    let taken = hostiles
        .iter()
        .map(|(id, other_ship)| (*id, power.harm_taken(other_ship.level) / other_ship.strength()))
        .collect();
    Fitting { dealt, taken, trim: trim_of(&character.ship_trim()), patching: 0.0 }
}

impl Fights {
    /// Fits every fighting player's ship whose character the sea holds, for the tick to come.
    pub(crate) fn fit(&mut self, characters: &BTreeMap<PlayerId, Character>) {
        for fought in &mut self.list {
            for (player, crew) in &fought.crews {
                if let Some(character) = characters.get(player) {
                    fought.fight.fit(crew.ship, fitting(character, &fought.hostiles));
                }
            }
        }
    }
}

/// What a captain who went down pays each player who fought it, whose character the sea holds: its rank's foe's XP
/// at its level to their ship and to their officers aboard. Answers who was paid.
pub fn pay_sinking(sank: &Sank, characters: &mut BTreeMap<PlayerId, Character>) -> Vec<PlayerId> {
    let foe = crate::flotsam::foe_of(sank.pirate.commission.rank);
    let mut paid = Vec::new();
    for player in &sank.players {
        let Some(character) = characters.get_mut(player) else { continue };
        let xp = character.reward_sinking(foe, sank.pirate.level, gear::Difficulty::Normal);
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
