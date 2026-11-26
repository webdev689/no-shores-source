//! The foes a Breach's encounters stand: each at the tier's level, dropping nothing (the encounter's win is the
//! reward), hunting the nearest living player; waves sized to the living players they are stood against; and the
//! walkers an encounter moves itself, which make for a point and do something there.

use super::Breach;
use crate::{PlayerId, Room};
use ::foes::Rank;
use combat::fighter::FighterId;

/// How many foes a wave stands: two, and one more for every two living players, six at the most.
pub const WAVE_MOST: usize = 6;
/// The most of an encounter's foes that stand alive at once for another of its waves' foes to stand: its great foes,
/// Watchers, bells and walkers stand whatever else stands, or a crowd left standing would keep its rules from coming
/// round.
pub const STANDING_MOST: usize = 18;
/// What a great foe's health is times for each player of the company beyond the first.
pub const HEALTH_PER_PLAYER: f64 = 0.45;

/// A great foe's health times for a company of `players`.
fn company_times(players: usize) -> f64 {
    1.0 + HEALTH_PER_PLAYER * (players.max(1) - 1) as f64
}

/// A great foe matched to the company: its number, whether it is matched to half of it (a Keeper), and the company it
/// was last matched to.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Matched {
    pub id: FighterId,
    pub half: bool,
    pub to: usize,
}

impl Matched {
    /// The company it is matched to for a roster of `everyone`: everyone, or half of them, at least one and at most
    /// the Breach's eight.
    fn of(self, everyone: usize) -> usize {
        let company = everyone.clamp(1, gear::breach::COMPANY_MOST);
        if self.half { company.div_ceil(2) } else { company }
    }
}

impl Room {
    /// Whether the room has room for another of an encounter's walkers, whatever its waves stand.
    pub(crate) fn room_for_walker(&self) -> bool {
        self.living_foes() < self.foes_most
    }

    /// Whether the room and the encounter have room for another of its waves' foes (`STANDING_MOST`).
    pub(crate) fn room_for_lesser(&self, breach: &Breach) -> bool {
        let living = breach.foes.iter().filter(|id| self.standing_foe(**id)).count();
        self.living_foes() < self.foes_most && living < STANDING_MOST
    }

    /// Stands one of an encounter's foes of a type and rank at a point, at the tier's level, dropping nothing and
    /// hunting the nearest living player; named where it has a name of its own. Its waves' foes ask
    /// `room_for_lesser` first, its walkers `room_for_walker`.
    pub(crate) fn stand_breach_foe(
        &mut self,
        breach: &mut Breach,
        (number, rank): (u8, Rank),
        at: [f64; 3],
        name: Option<&'static str>,
    ) -> Option<FighterId> {
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

    /// The players the run counts as its company: every one the room keeps, or every one in a room that keeps none (a
    /// test's).
    pub(crate) fn counted_players(&self) -> Vec<PlayerId> {
        let keeps = self.players.values().any(|found| found.owner.is_some());
        self.players.iter().filter(|(_, found)| !keeps || found.owner.is_some()).map(|(id, _)| *id).collect()
    }

    /// The run's roster kept: every player it counts joins it, by account (by number in a room that keeps none, a
    /// test's). Grown, every great foe standing is matched again to the larger company, keeping its share of health,
    /// so a company that comes in after a great foe stands fights it as one that stood with it.
    pub(crate) fn keep_roster(&mut self, breach: &mut Breach) {
        let before = breach.company();
        for id in self.counted_players() {
            let key = self.players.get(&id).and_then(|found| found.owner.clone()).unwrap_or_else(|| format!("#{id}"));
            breach.roster.insert(key);
        }
        if breach.company() == before {
            return;
        }
        breach.matched.retain(|matched| self.foes.get(&matched.id).is_some_and(|foe| !foe.fighter.dead()));
        for matched in &mut breach.matched {
            let to = matched.of(breach.roster.len());
            if to > matched.to {
                if let Some(foe) = self.foes.get_mut(&matched.id) {
                    let grown = company_times(to) / company_times(matched.to);
                    foe.fighter.health *= grown;
                    foe.fighter.health_max *= grown;
                }
                matched.to = to;
            }
        }
    }

    /// A great foe made a match for the company (half of it for a Keeper's `half`), more health for each player beyond
    /// the first, and then `times` its own; kept, so the company growing grows it too (`keep_roster`).
    pub(crate) fn match_company(&mut self, breach: &mut Breach, id: FighterId, half: bool, times: f64) {
        let Some(foe) = self.foes.get_mut(&id) else { return };
        let matched = Matched { id, half, to: 0 };
        let to = matched.of(breach.roster.len());
        let times = company_times(to) * times;
        foe.fighter.health *= times;
        foe.fighter.health_max *= times;
        breach.matched.push(Matched { to, ..matched });
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
        let mut stood: Vec<(usize, FighterId)> = Vec::new();
        for at in 0..count {
            let kind = kinds[(nth + at) % kinds.len()];
            let mouth = (nth + at) % mouths.len();
            let [x, y, z] = mouths[mouth];
            let spread = [x + (at % 3) as f64 - 1.0, y + (at / 3) as f64 - 0.5, z];
            if !self.room_for_lesser(breach) {
                break;
            }
            stood.extend(self.stand_breach_foe(breach, kind, spread, None).map(|id| (mouth, id)));
        }
        // Each mouth's foes form under a crown of crystal over it (`arrivals.rs`).
        for mouth in 0..mouths.len() {
            let at_mouth: Vec<FighterId> = stood.iter().filter(|(of, _)| *of == mouth).map(|(_, id)| *id).collect();
            self.under_crown(&at_mouth);
        }
        stood.into_iter().map(|(_, id)| id).collect()
    }

    /// Whether an encounter's foe still stands.
    pub(crate) fn standing_foe(&self, id: FighterId) -> bool {
        self.foes.get(&id).is_some_and(|foe| !foe.fighter.dead())
    }

    /// Whether the Arts pass a foe by in a Breach's run: its bells, which break in an order only a hand that means it
    /// keeps, and the Unlit Ways' Watchers, which nothing harms. No spell seeks one or strikes one.
    pub(crate) fn arts_pass_by(&self, id: FighterId) -> bool {
        let Some(breach) = self.breach.as_ref() else { return false };
        let bell = self.foes.get(&id).is_some_and(|foe| foe.brain.foe_type.number == ::foes::roster::BELL);
        bell || breach.fights.ways.watchers.iter().any(|(watcher, _, _)| *watcher == id)
    }

    /// A walker: a foe of the encounter the room moves itself toward a point (`walk_inert`), neither thinking nor
    /// striking; struck down, it falls as any foe.
    pub(crate) fn make_walker(&mut self, id: FighterId) {
        self.inert.insert(id);
    }
}
