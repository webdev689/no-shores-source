//! The foes a Breach's encounters stand: each at the tier's level, dropping nothing (the encounter's win is the
//! reward), hunting the nearest living player; waves sized to the living players they are stood against; and the
//! walkers an encounter moves itself, which make for a point and do something there.

use super::Breach;
use crate::Room;
use ::foes::Rank;
use combat::fighter::FighterId;

/// How many foes a wave stands: two, and one more for every two living players, six at the most.
pub const WAVE_MOST: usize = 6;
/// The most of an encounter's foes that stand alive at once.
pub const STANDING_MOST: usize = 18;
/// What a great foe's health is times for each living player beyond the first.
pub const HEALTH_PER_PLAYER: f64 = 0.45;

impl Room {
    /// Stands one of an encounter's foes of a type and rank at a point, at the tier's level, dropping nothing and
    /// hunting the nearest living player; named where it has a name of its own. None while the room is full.
    pub(crate) fn stand_breach_foe(
        &mut self,
        breach: &mut Breach,
        (number, rank): (u8, Rank),
        at: [f64; 3],
        name: Option<&'static str>,
    ) -> Option<FighterId> {
        let living = breach.foes.iter().filter(|id| self.foes.get(id).is_some_and(|foe| !foe.fighter.dead())).count();
        if self.living_foes() >= self.foes_most || living >= STANDING_MOST {
            return None;
        }
        let place = self.nav.nearest_point(at).unwrap_or(at);
        let id = self.stand_foe(::foes::foe_type(number)?, rank, place, 0.0, None);
        self.gird(id, breach.tier.foes_at(), None);
        self.quests.spoilless.insert(id);
        if let Some(name) = name {
            self.names.insert(id, name);
        }
        let hunted = self.nearest_player([at[0], at[1]]);
        let clock = self.clock;
        if let Some(foe) = self.foes.get_mut(&id) {
            foe.brain.posted_at(place, 0.0);
            if let Some((player, at)) = hunted {
                foe.brain.hunt(player, at, clock);
            }
        }
        breach.foes.push(id);
        Some(id)
    }

    /// A great foe made a match for the living players: more health for each beyond the first.
    pub(crate) fn match_company(&mut self, id: FighterId) {
        let living = self.players.values().filter(|found| found.living()).count().max(1);
        let Some(foe) = self.foes.get_mut(&id) else { return };
        let times = 1.0 + HEALTH_PER_PLAYER * (living - 1) as f64;
        foe.fighter.health *= times;
        foe.fighter.health_max *= times;
    }

    /// A wave of an encounter: `kinds` taken in turn, as many as the living players in `space` call for, each at one of
    /// `mouths` in turn from the `nth` wave's own.
    pub(crate) fn breach_wave(
        &mut self,
        breach: &mut Breach,
        space: &str,
        kinds: &[(u8, Rank)],
        mouths: &[[f64; 3]],
        nth: usize,
    ) -> Vec<FighterId> {
        let living = self.in_space(breach, space).len();
        let count = (2 + living / 2).min(WAVE_MOST);
        if kinds.is_empty() || mouths.is_empty() {
            return Vec::new();
        }
        (0..count)
            .filter_map(|at| {
                let kind = kinds[(nth + at) % kinds.len()];
                let mouth = mouths[(nth + at) % mouths.len()];
                let spread = [mouth[0] + (at % 3) as f64 - 1.0, mouth[1] + (at / 3) as f64 - 0.5, mouth[2]];
                self.stand_breach_foe(breach, kind, spread, None)
            })
            .collect()
    }

    /// Whether an encounter's foe still stands.
    pub(crate) fn standing_foe(&self, id: FighterId) -> bool {
        self.foes.get(&id).is_some_and(|foe| !foe.fighter.dead())
    }

    /// A walker: a foe of the encounter the room moves itself toward a point (`walk_inert`), neither thinking nor
    /// striking; struck down, it falls as any foe.
    pub(crate) fn make_walker(&mut self, id: FighterId) {
        self.inert.insert(id);
    }
}
