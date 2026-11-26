//! A house's horde, a tick at a time: its waves standing round its place as the player comes within its reach, each
//! coming at the player, the next standing once the foes before it are down to `HORDE_NEXT_AT`, and the last fallen
//! meeting the goal; the player fallen, its waves leaving and it waiting `RETRY_TICKS` to start again. While it runs
//! the house's Art is the player's unbounded (`unbounded`): `arts.rs` keeps its Anima and Tenets full and casts them
//! earned or not. Its foes drop nothing, so the horde pays as the task's clear and their kills do.

use super::kinds::Stood;
use super::{Horde, RETRY_TICKS, Step, Stepping, ahead};
use crate::garrison::SPREAD;
use crate::quests::{foes_of, held_near, reached_near};
use crate::{PlayerId, Room, Standing};
use combat::fighter::FighterId;
use core::f64::consts::TAU;
use gear::quests::{Defend, GoalDef, Place};

/// How many of a horde's foes left standing bring its next wave: it keeps coming, a crowd at once, never a lull.
pub const HORDE_NEXT_AT: usize = 2;
/// How far from its place's middle a horde's wave stands, metres, give or take its reach to the mesh; nearer than a
/// defence's, so it is on the player at once; and the bearings tried for it.
const HORDE_OUT: f64 = 18.0;
const HORDE_REACH: f64 = 2.5;
const HORDE_BEARINGS: u32 = 12;
/// The stream a horde's draws come from.
const HORDE_STREAM: u64 = 0x686f_7264;

/// What a player is sent of their horde while it runs, as `Room::unbounded` holds it: its foes left and all of them;
/// nothing while it waits, the page reading the power from it.
pub(super) fn seen(defend: &Defend, horde: &Horde) -> Vec<u16> {
    if horde.at.is_none() || horde.wave == 0 {
        return Vec::new();
    }
    let all = defend.waves.iter().map(Vec::len).sum::<usize>();
    let left = all.saturating_sub(horde.fallen);
    [left, all].map(|count| u16::try_from(count).unwrap_or(u16::MAX)).to_vec()
}

impl Room {
    /// Whether a player's house's Art is theirs unbounded now: their horde runs here and a wave of it has stood, so a
    /// horde whose first wave waits on the room's cap on foes lends nothing meanwhile.
    #[must_use]
    pub fn unbounded(&self, player: PlayerId) -> bool {
        let running = self.quests.steps.get(&player);
        matches!(running, Some(Step { kind: Stepping::Horde(Horde { at: Some(_), wave: 1.., .. }), .. }))
    }

    /// A horde's tick: with none running, it starts as the player comes within its place's reach (alive, its wait
    /// past), with its first wave; the player fallen, its waves leave, a failure counts and it waits; else its fallen
    /// foes are counted, and with `HORDE_NEXT_AT` or fewer standing the next wave stands, or after the last the goal is
    /// met.
    pub(super) fn keep_horde(
        &mut self,
        player: PlayerId,
        goal: &'static GoalDef,
        defend: &'static Defend,
        at: [f64; 2],
    ) {
        let Some(place) = self.place_named(&defend.place) else { return };
        let clock = self.clock;
        let fallen = self
            .players
            .get(&player)
            .is_none_or(|found| found.fighter.dead() || matches!(found.standing, Standing::Dead { .. }));
        let Some(Step { kind: Stepping::Horde(horde), .. }) = self.quests.steps.get(&player) else { return };
        let (running, retry, standing) = (horde.at.is_some(), horde.retry, horde.standing.clone());
        if !running {
            if fallen || retry.is_some_and(|tick| clock < tick) || !place.holds(at, 0.0) {
                return;
            }
            let Some(ground) = self.ground_of(&place, HORDE_OUT + HORDE_REACH) else { return };
            let Some(spot) = held_near(self.mesh_by(ground), &self.floor, place.at, place.radius) else { return };
            self.set_horde(player, |horde| *horde = Horde { at: Some(spot), ..Horde::default() });
            self.next_horde_wave(player, goal, defend, &place);
        } else if fallen {
            self.send_away(&standing);
            self.set_horde(player, |horde| *horde = Horde { retry: Some(clock + RETRY_TICKS), ..Horde::default() });
            self.failed(player);
        } else {
            let (living, gone): (Vec<FighterId>, Vec<FighterId>) =
                standing.into_iter().partition(|id| self.foes.get(id).is_some_and(|foe| !foe.fighter.dead()));
            let more = living.len() <= HORDE_NEXT_AT;
            self.keep_hunting(player, &living);
            self.set_horde(player, |horde| (horde.standing, horde.fallen) = (living, horde.fallen + gone.len()));
            if more {
                self.next_horde_wave(player, goal, defend, &place);
            }
            if gone.is_empty() {
                return;
            }
        }
        if let Some(found) = self.players.get_mut(&player) {
            found.gear_changed = true;
        }
    }

    /// A horde's foes that lost the player (out of sight past their hunt) are set on them again: a horde always knows
    /// where its player is, so none stands idle at its post while the player waits it out.
    fn keep_hunting(&mut self, player: PlayerId, living: &[FighterId]) {
        let Some(target) = self.fighter(player).map(|fighter| [fighter.body.x, fighter.body.y, fighter.body.z]) else {
            return;
        };
        let clock = self.clock;
        for id in living {
            if let Some(found) = self.foes.get_mut(id).filter(|found| found.brain.target().is_none()) {
                found.brain.hunt(player, target, clock);
            }
        }
    }

    fn set_horde(&mut self, player: PlayerId, change: impl FnOnce(&mut Horde)) {
        if let Some(Step { kind: Stepping::Horde(horde), .. }) = self.quests.steps.get_mut(&player) {
            change(horde);
        }
    }

    /// The horde's next wave stood, if there is one; one that stands nobody counts as fallen at once, and one waiting
    /// room stands a tick on. With every wave stood and none standing, the goal is met.
    fn next_horde_wave(&mut self, player: PlayerId, goal: &'static GoalDef, defend: &'static Defend, place: &Place) {
        loop {
            let Some(Step { kind: Stepping::Horde(horde), .. }) = self.quests.steps.get(&player) else { return };
            let (wave, cleared) = (horde.wave, horde.standing.is_empty());
            let Some(list) = defend.waves.get(wave) else {
                if cleared {
                    // Bound again on this tick, not the next as the step ends, so this tick's word shows no power.
                    self.set_horde(player, |horde| horde.at = None);
                    self.stepped(player, goal);
                }
                return;
            };
            match self.stand_horde_wave(player, list, wave, place) {
                Stood::Foes(stood) => {
                    self.set_horde(player, |horde| {
                        horde.standing.extend(stood);
                        horde.wave += 1;
                    });
                    return;
                }
                Stood::Waits => return,
                Stood::Nobody => {
                    self.set_horde(player, |horde| (horde.wave, horde.fallen) = (wave + 1, horde.fallen + list.len()))
                }
            }
        }
    }

    /// A horde's wave, standing `HORDE_OUT` from its place's middle, or nearer where a walk from the middle reaches no
    /// further, on the place's mesh and coming at the player, dropping nothing.
    fn stand_horde_wave(&mut self, player: PlayerId, list: &[(String, String)], wave: usize, place: &Place) -> Stood {
        let Some(Step { key, kind: Stepping::Horde(Horde { at: Some(spot), .. }), .. }) =
            self.quests.steps.get(&player)
        else {
            return Stood::Nobody;
        };
        let (key, spot) = (*key, *spot);
        let members = foes_of(list.iter());
        if members.is_empty() {
            return Stood::Nobody;
        }
        if self.living_foes() + members.len() > self.others_most() {
            return Stood::Waits;
        }
        let Some(ground) = self.ground_of(place, HORDE_OUT + HORDE_REACH) else { return Stood::Waits };
        let mix = (key[0] << 16 | key[1] << 8 | key[2] | wave << 24) as u64 ^ u64::from(player) << 32;
        let seed = self.world_seed ^ HORDE_STREAM ^ mix;
        let start = crate::garrison::draws_of(seed).draw() * TAU;
        let mut stood = Vec::new();
        for turn in 0..HORDE_BEARINGS {
            let bearing = start + TAU * f64::from(turn) / f64::from(HORDE_BEARINGS);
            let out = ahead([spot[0], spot[1]], bearing, HORDE_OUT);
            // Ground a walk reaches from the middle, so none stands up a bank or a cliff it cannot come down.
            let Some(centre) = reached_near(self.mesh_by(ground), &self.floor, spot, out, HORDE_OUT) else { continue };
            if let Some(ids) = self.stand_arriving(ground, [centre[0], centre[1]], HORDE_REACH, &members, SPREAD, seed)
            {
                stood = ids;
                break;
            }
        }
        if stood.is_empty() {
            return Stood::Nobody;
        }
        let target = self.fighter(player).map(|fighter| [fighter.body.x, fighter.body.y, fighter.body.z]);
        let clock = self.clock;
        for id in &stood {
            if let (Some(found), Some(target)) = (self.foes.get_mut(id), target) {
                found.brain.hunt(player, target, clock);
            }
            self.quests.spoilless.insert(*id);
        }
        Stood::Foes(stood)
    }
}
