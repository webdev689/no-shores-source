//! The Court, an Elite Dungeon's Boss once its seals are broken. At two thirds and one third of its health the Boss is
//! warded, its health held there, until each of its three anchors has been stood on ANCHOR_TICKS, with two of the
//! dungeon's foes at each ward. From the second ward on, every RECKONING_EVERY ticks a Reckoning is shown for
//! RECKONING_WARNING ticks, a ring of light at one anchor, then takes RECKONING_SHARE of their health from every
//! living player outside it. Fury: from FURY_FROM after the Boss wakes, its company's blows weigh a tenth more every
//! FURY_EVERY, to FURY_MOST.

use crate::encounters::Encounters;
use crate::{EventKind, Room};
use combat::Action;
use combat::Fighter;
use combat::fighter::FighterId;

/// The shares of its health the Boss's wards hold it at, in turn.
pub const WARDS: [f64; 2] = [2.0 / 3.0, 1.0 / 3.0];
/// How long each anchor is stood on to break a ward, and how near its middle a player stands on it.
pub const ANCHOR_TICKS: u64 = 3 * 60;
pub const ANCHOR_REACH_M: f64 = 1.0;
/// The foes that come at each ward.
pub const WARD_FOES: usize = 2;
/// The Reckoning: how often, its warning, the share of their health it takes, and its ring of light's reach round its
/// anchor (a ring 2.5 m wide).
pub const RECKONING_EVERY: u64 = 50 * 60;
pub const RECKONING_WARNING: u64 = 12 * 60;
pub const RECKONING_SHARE: f64 = 0.7;
pub const LIGHT_REACH_M: f64 = 1.25;
/// Fury: from how long after the Boss wakes, how often it grows, by how much, and the most it weighs.
pub const FURY_FROM: u64 = 8 * 60 * 60;
pub const FURY_EVERY: u64 = 30 * 60;
pub const FURY_STEP: f64 = 0.1;
pub const FURY_MOST: f64 = 3.0;

impl Room {
    /// The Boss's health as a blow leaves it, held at its next ward's share while that ward stands: the ward goes up
    /// as the blow would take it past, and the Boss stays standing.
    pub(crate) fn warded(&mut self, id: FighterId, after: Fighter) -> Fighter {
        if self.boss() != Some(id) {
            return after;
        }
        let Some(court) = self.encounters.as_mut().map(|encounters| &mut encounters.court) else { return after };
        let Some(share) = WARDS.get(court.wards_broken) else { return after };
        let held = after.health_max * share;
        if after.health > held {
            return after;
        }
        court.ward_up = true;
        let action = if after.dead() { Action::Idle } else { after.action };
        Fighter { health: held, action, ..after }
    }

    /// The Court's tick: a ward newly up is told and brings its foes; its anchors fill while stood on and, all full,
    /// break it; the Reckonings from the second ward on.
    pub(crate) fn keep_court(&mut self) {
        let boss = self.boss();
        let Some(mut encounters) = self.encounters.take() else { return };
        if boss.is_some() {
            self.keep_ward(&mut encounters);
        }
        self.encounters = Some(encounters);
        if boss.is_some() {
            self.keep_reckoning();
        }
    }

    fn keep_ward(&mut self, encounters: &mut Encounters) {
        let court = &mut encounters.court;
        if !court.ward_up {
            return;
        }
        let anchors: Vec<[f64; 2]> = encounters.plan.anchors.iter().map(|at| [at[0], at[1]]).collect();
        if !encounters.court.ward_told {
            encounters.court.ward_told = true;
            let ward = encounters.court.wards_broken + 1;
            if ward == WARDS.len() {
                encounters.court.reckoning_from = Some(self.clock);
            }
            self.tell_all(EventKind::WardRaised, ward as f64);
            self.stand_foes(encounters, None, &anchors, WARD_FOES);
        }
        let standing: Vec<[f64; 2]> = self
            .players
            .values()
            .filter(|found| found.living())
            .map(|found| [found.fighter.body.x, found.fighter.body.y])
            .collect();
        let court = &mut encounters.court;
        for (held, anchor) in court.anchors.iter_mut().zip(&anchors) {
            let stood = standing.iter().any(|at| libm::hypot(at[0] - anchor[0], at[1] - anchor[1]) <= ANCHOR_REACH_M);
            if stood && *held < ANCHOR_TICKS {
                *held += 1;
            }
        }
        if court.anchors.iter().all(|held| *held >= ANCHOR_TICKS) {
            court.wards_broken += 1;
            (court.ward_up, court.ward_told) = (false, false);
            court.anchors.iter_mut().for_each(|held| *held = 0);
            let broken = court.wards_broken;
            self.tell_all(EventKind::WardBroken, broken as f64);
        }
    }

    /// How far into its round the Reckoning is, in ticks, and the anchor this round's stands at; none before the
    /// second ward or once the Boss has fallen.
    fn reckoning_round(&self) -> Option<(u64, u8)> {
        let encounters = self.encounters.as_ref()?;
        let since = self.clock.checked_sub(encounters.court.reckoning_from?)?;
        self.boss()?;
        let anchors = encounters.plan.anchors.len().max(1) as u64;
        Some((since % RECKONING_EVERY, u8::try_from(since / RECKONING_EVERY % anchors).ok()?))
    }

    /// The ticks until the Reckoning lands while one is shown, and the anchor it is shown at; none while none is.
    pub(crate) fn reckoning_seen(&self) -> Option<(u32, u8)> {
        let (into, at) = self.reckoning_round()?;
        (into < RECKONING_WARNING).then(|| (u32::try_from(RECKONING_WARNING - into).unwrap_or(u32::MAX), at))
    }

    /// As a Reckoning's warning runs out it lands: every living player outside its ring of light loses
    /// RECKONING_SHARE of their health, a blow from the Boss.
    fn keep_reckoning(&mut self) {
        let Some((RECKONING_WARNING, at)) = self.reckoning_round() else { return };
        let Some(boss) = self.boss() else { return };
        let anchors = self.encounters.as_ref().map(|encounters| encounters.plan.anchors.clone()).unwrap_or_default();
        let Some(light) = anchors.get(usize::from(at)).copied() else { return };
        let outside: Vec<crate::PlayerId> = self
            .players
            .iter()
            .filter(|(_, found)| found.living())
            .filter(|(_, found)| {
                let body = found.fighter.body;
                libm::hypot(body.x - light[0], body.y - light[1]) > LIGHT_REACH_M
            })
            .map(|(id, _)| *id)
            .collect();
        for &player in &outside {
            self.harm_share(player, RECKONING_SHARE, boss);
        }
        self.tell_all(EventKind::ReckoningLanded, outside.len() as f64);
    }

    /// Fury's step now: 0 before FURY_FROM after the Boss woke, then one more every FURY_EVERY, to the step that
    /// weighs FURY_MOST; 0 once the Boss has fallen.
    pub(crate) fn fury_step(&self) -> u8 {
        let Some(woke) = self.encounters.as_ref().and_then(|encounters| encounters.court.woke_at) else { return 0 };
        if self.boss().is_none() {
            return 0;
        }
        let Some(since) = self.clock.checked_sub(woke + FURY_FROM) else { return 0 };
        let most = ((FURY_MOST - 1.0) / FURY_STEP).round() as u64;
        u8::try_from((since / FURY_EVERY + 1).min(most)).unwrap_or(u8::MAX)
    }

    /// What Fury weighs a foe's blow on a player by: a tenth more for each step.
    pub(crate) fn fury_times(&self) -> f64 {
        1.0 + f64::from(self.fury_step()) * FURY_STEP
    }
}

#[cfg(test)]
#[path = "court_tests.rs"]
mod court_tests;
