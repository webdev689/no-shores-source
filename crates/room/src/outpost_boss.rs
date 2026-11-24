//! The War Horn's foe at a guild's outpost: sounded, the horn calls a Boss of the roster with four Majors about it to
//! the site's muster ground, never onto the plot, at the level of the highest member there raised by the horn's tier
//! (1 Normal, 2 Elite, 3 Abyss). Felled, each player who fought it is paid as a world boss's clear pays, and each
//! member of the guild among them takes a guild package, once a week. One stands at a time.

use crate::garrison::SPREAD;
use crate::{PlayerId, Room};
use ::foes::Rank::{Boss, Major};
use ::foes::roster::{COLLECTOR, CROSSBOWMAN, ENFORCER, HIGH_ASSESSOR, RUNNER};
use combat::fighter::FighterId;
use gear::Difficulty;
use gear::rewards::Clear;
use std::collections::BTreeSet;

/// How far round the muster ground's middle the foe and its guard may stand, metres.
const MUSTER_REACH: f64 = 12.0;
/// The stream the horn's foes are drawn from, apart from the room's other draws.
const HORN_STREAM: u64 = 0x686f_726e;

/// The horn's foe: the tier it was sounded at until it stands, then its foes, their level and tier, and the players who
/// fought it.
#[derive(Debug, Default)]
pub(crate) struct HornFoe {
    due: Option<u8>,
    standing: Vec<FighterId>,
    level: u8,
    tier: u8,
    fought: BTreeSet<PlayerId>,
}

/// The difficulty a horn's tier calls its foe at.
fn difficulty_of(tier: u8) -> Difficulty {
    Difficulty::ALL[usize::from(tier.clamp(1, 3) - 1)]
}

impl Room {
    /// Whether the horn's foe is called or stands.
    pub(crate) fn horn_foe_up(&self) -> bool {
        self.outpost.as_ref().is_some_and(|outpost| outpost.boss.due.is_some() || !outpost.boss.standing.is_empty())
    }

    /// The horn sounded at `tier`: its foe stands at the next tick that can stand it.
    pub(crate) fn horn_sounded(&mut self, tier: u32) {
        if let Some(outpost) = self.outpost.as_mut() {
            outpost.boss.due = Some(u8::try_from(tier).unwrap_or(3));
        }
    }

    /// Each tick: stands the horn's foe once it is called, and pays its felling once all of it has fallen.
    pub(crate) fn keep_outpost(&mut self) {
        let Some(outpost) = self.outpost.as_ref() else { return };
        if let Some(tier) = outpost.boss.due {
            self.stand_horn_foe(tier);
            return;
        }
        // Whoever struck one of the horn's foes fought it.
        let standing = &outpost.boss.standing;
        let struck: Vec<PlayerId> =
            standing.iter().filter_map(|id| self.foes.get(id)).flat_map(|foe| foe.struck_by.keys().copied()).collect();
        let fallen = |id: &FighterId| self.foes.get(id).is_none_or(|foe| foe.fighter.dead());
        let down = !standing.is_empty() && standing.iter().all(fallen);
        if let Some(outpost) = self.outpost.as_mut() {
            outpost.boss.fought.extend(struck);
        }
        if down {
            self.pay_horn_foe();
        }
    }

    /// Stands the horn's foe on the muster ground at the level of the highest member here, raised by its tier.
    fn stand_horn_foe(&mut self, tier: u8) {
        let Some(outpost) = self.outpost.as_ref() else { return };
        let (muster, key) = (outpost.muster, outpost.key.clone());
        let place = gear::quests::Place { name: "muster".to_owned(), at: muster, radius: MUSTER_REACH };
        // None until the mesh round the muster ground is baked, a slice a tick: tried again the next.
        let Some(ground) = self.ground_of(&place, MUSTER_REACH) else { return };
        let member =
            |player: &PlayerId| self.guilds.of(*player).is_some_and(|seen| crate::outpost::guild_key(&seen.id) == key);
        let highest = self.players.iter().filter(|(id, _)| member(id)).map(|(_, found)| found.character.level()).max();
        let difficulty = difficulty_of(tier);
        let level = difficulty.raise(highest.unwrap_or(1));
        let seed = self.world_seed ^ HORN_STREAM ^ self.clock;
        let guard = [RUNNER, COLLECTOR, CROSSBOWMAN, ENFORCER].map(|number| (number, Major));
        let members: Vec<_> = core::iter::once((HIGH_ASSESSOR, Boss)).chain(guard).collect();
        let Some(stood) = self.stand_arriving(ground, muster, MUSTER_REACH, &members, SPREAD, seed) else { return };
        for id in &stood {
            let Some(foe) = self.foes.get_mut(id) else { continue };
            let times = gear::power::foe_health_times(level) / gear::power::foe_health_times(foe.level);
            foe.level = level;
            foe.grow(times);
            if let Some(shield) = foe.shield.as_mut() {
                shield.left *= times;
                shield.most *= times;
            }
        }
        if let Some(outpost) = self.outpost.as_mut() {
            outpost.boss = HornFoe { due: None, standing: stood, level, tier, fought: BTreeSet::new() };
        }
    }

    /// Pays each player still here who fought the horn's foe as a world boss's clear pays, and each member of the
    /// guild among them from before the week turned a guild package, once a week.
    fn pay_horn_foe(&mut self) {
        let Some(outpost) = self.outpost.as_mut() else { return };
        let HornFoe { level, tier, fought, .. } = std::mem::take(&mut outpost.boss);
        let key = outpost.key.clone();
        let week = gear::clock::week_of(self.minute);
        for player in fought {
            let dice = self.dice(player);
            let seen = self.guilds.of(player).filter(|seen| crate::outpost::guild_key(&seen.id) == key);
            let standing = seen.map(|seen| seen.standing);
            let Some(found) = self.players.get_mut(&player) else { continue };
            let character = &mut found.character;
            character.reward_clear(Clear::WorldBoss, level, difficulty_of(tier), self.source, &dice);
            if let Some(standing) = standing {
                // Refused once taken this week, or to one who joined since it turned; kept past ten Vestiges carried.
                let _ = character.claim_horn_package(week, standing, &dice);
            }
            found.gear_changed = true;
        }
    }
}

#[cfg(test)]
#[path = "outpost_boss_tests.rs"]
mod tests;
