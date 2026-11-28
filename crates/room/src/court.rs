//! The Court, an Elite Dungeon's Boss once its seals are broken. As it wakes its health is made a match for the living
//! players, as a public event's great foes are. At two thirds and one third of its health the Boss is warded, its
//! health held there, until each of its three anchors has been stood on ANCHOR_TICKS: a wave at each ward and another
//! WARD_WAVE_AGAIN on, and the Boss stands at its post and slams round it every SLAM_EVERY. From the first ward broken,
//! every RECKONING_EVERY ticks a Reckoning is shown for RECKONING_WARNING ticks, a ring of light at one anchor, then
//! takes RECKONING_SHARE of their health from every living player it reaches outside it. Fury: from FURY_FROM after a
//! living player first stands in the end room, its company's blows weigh a tenth more every FURY_EVERY, to FURY_MOST.

use crate::encounters::{Encounters, WaveOf};
use crate::{EventKind, Room};
use combat::Action;
use combat::Fighter;
use combat::fighter::FighterId;
use dungeon::{Cell, Dungeon};

/// The shares of its health the Boss's wards hold it at, in turn.
pub const WARDS: [f64; 2] = [2.0 / 3.0, 1.0 / 3.0];
/// How long each anchor is stood on to break a ward, how near its middle a player stands on it, and, with at least
/// ANCHORS_EMPTY_FROM living players, how long after its last player leaves it empties unless all are filled.
pub const ANCHOR_TICKS: u64 = 3 * 60;
pub const ANCHOR_REACH_M: f64 = 1.0;
pub const ANCHORS_EMPTY_FROM: usize = 3;
pub const ANCHOR_EMPTIES_TICKS: u64 = 6 * 60;
/// A ward's second wave, this long after it rose while it still stands.
pub const WARD_WAVE_AGAIN: u64 = 15 * 60;
/// The warded Boss's slam: how often, how long it is shown first, how far round the Boss it reaches, and the share of
/// their health it takes; and how near its post the Boss stands while warded (m).
pub const SLAM_EVERY: u64 = 8 * 60;
pub const SLAM_WARNING: u64 = 2 * 60;
pub const SLAM_M: f64 = 4.0;
pub const SLAM_SHARE: f64 = 0.3;
pub const AT_POST_M: f64 = 1.0;
/// The Reckoning: how often, its warning, the share of their health it takes, and its ring of light's reach round its
/// anchor (a ring 2.5 m wide).
pub const RECKONING_EVERY: u64 = 40 * 60;
pub const RECKONING_WARNING: u64 = 10 * 60;
pub const RECKONING_SHARE: f64 = 0.7;
pub const LIGHT_REACH_M: f64 = 1.25;
/// Fury: from how long after a living player first stands in the end room, how often it grows, by how much, and the
/// most it weighs.
pub const FURY_FROM: u64 = 8 * 60 * 60;
pub const FURY_EVERY: u64 = 30 * 60;
pub const FURY_STEP: f64 = 0.1;
pub const FURY_MOST: f64 = 3.0;

/// The cells a Reckoning reaches: the end room's, and every corridor, flight and room its doorways open onto, as far
/// as the next room's doorway; another storey only down or up a flight.
#[must_use]
pub fn reckoning_reach(dungeon: &Dungeon) -> Vec<usize> {
    let end = dungeon.end();
    let Some(court) = dungeon.rooms.get(end) else { return Vec::new() };
    let mut reached: Vec<usize> = court.cells.clone();
    let mut todo: Vec<usize> = court.cells.clone();
    while let Some(cell) = todo.pop() {
        let from_court = dungeon.room_at(cell) == Some(end);
        for next in dungeon.walk_from(cell) {
            if reached.contains(&next) {
                continue;
            }
            match dungeon.room_at(next) {
                // A room beside a corridor of the end room's, or beside the end room itself, is reached whole.
                Some(room) if room != end => {
                    let whole: Vec<usize> =
                        dungeon.rooms[room].cells.iter().copied().filter(|cell| !reached.contains(cell)).collect();
                    reached.extend(whole);
                }
                Some(_) => {}
                None if from_court || matches!(dungeon.cells[cell], Cell::Corridor | Cell::Stair(_)) => {
                    reached.push(next);
                    todo.push(next);
                }
                None => {}
            }
        }
    }
    reached.sort_unstable();
    reached
}

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

    /// The Court's tick: the Boss's health made a match for the company once it stands; Fury's clock started once a
    /// living player stands in the end room; a ward newly up is told and brings its waves, its anchors fill while stood
    /// on and, all full, break it, and the Boss slams; the Reckonings from the first ward broken.
    pub(crate) fn keep_court(&mut self) {
        let Some(boss) = self.boss() else { return };
        let living = self.living_players();
        let Some(mut encounters) = self.encounters.take() else { return };
        if !encounters.court.matched {
            encounters.court.matched = true;
            self.toughen(boss, living);
        }
        if encounters.court.fury_from.is_none()
            && !self.players_in(&encounters.plan, &encounters.court_cells).is_empty()
        {
            encounters.court.fury_from = Some(self.clock);
        }
        self.keep_ward(&mut encounters, boss, living);
        self.encounters = Some(encounters);
        self.keep_reckoning();
    }

    fn keep_ward(&mut self, encounters: &mut Encounters, boss: FighterId, living: usize) {
        if !encounters.court.ward_up {
            return;
        }
        let clock = self.clock;
        let anchors = encounters.plan.anchors.clone();
        // Its waves come in at the end room's doorways clear of the anchors, never on a player holding one.
        let doors = crate::encounters::seals::off_pieces(&encounters.plan.court_doors, &anchors);
        let court = &mut encounters.court;
        if !court.ward_told {
            (court.ward_told, court.ward_at, court.ward_waves, court.ward_retry) = (true, clock, 0, clock);
            let ward = court.wards_broken + 1;
            self.tell_all(EventKind::WardRaised, ward as f64);
        }
        let court = &encounters.court;
        let due = court.ward_waves == 0 || (court.ward_waves == 1 && clock - court.ward_at >= WARD_WAVE_AGAIN);
        if due && clock >= court.ward_retry {
            // A wave refused while the Court's waves stand as many as they may comes as soon as there is room.
            if self.stand_seal_wave(encounters, WaveOf::Court, &doors, living) > 0 {
                encounters.court.ward_waves += 1;
            } else {
                encounters.court.ward_retry = clock + crate::encounters::WAVE_RETRY_TICKS;
            }
        }
        self.slam(encounters.court.ward_at, boss);
        let standing: Vec<[f64; 3]> = self
            .players
            .values()
            .filter(|found| found.living())
            .map(|found| [found.fighter.body.x, found.fighter.body.y, found.fighter.body.z])
            .collect();
        let court = &mut encounters.court;
        // All three filled break the ward this tick, so an anchor never empties while the other two are filled.
        for ((held, left), anchor) in court.anchors.iter_mut().zip(&mut court.anchors_left).zip(&anchors) {
            let stood = standing.iter().any(|&at| super::seals::near(at, *anchor) <= ANCHOR_REACH_M);
            if stood {
                (*held, *left) = ((*held + 1).min(ANCHOR_TICKS), clock);
            } else if living >= ANCHORS_EMPTY_FROM && *held > 0 && clock - *left > ANCHOR_EMPTIES_TICKS {
                *held = 0;
            }
        }
        if court.anchors.iter().all(|held| *held >= ANCHOR_TICKS) {
            court.wards_broken += 1;
            (court.ward_up, court.ward_told) = (false, false);
            court.anchors.iter_mut().for_each(|held| *held = 0);
            if court.wards_broken == 1 {
                court.reckoning_from = Some(clock);
            }
            let broken = court.wards_broken;
            self.tell_all(EventKind::WardBroken, broken as f64);
        }
    }

    /// The warded Boss's slam, every SLAM_EVERY from its ward rising at `from`: SLAM_SHARE of their health from every
    /// living player within SLAM_M of it, a blow from the Boss.
    fn slam(&mut self, from: u64, boss: FighterId) {
        let since = self.clock - from;
        if since == 0 || !since.is_multiple_of(SLAM_EVERY) {
            return;
        }
        let Some(at) = self.foes.get(&boss).map(|foe| [foe.fighter.body.x, foe.fighter.body.y, foe.fighter.body.z])
        else {
            return;
        };
        let struck: Vec<crate::PlayerId> = self
            .players
            .iter()
            .filter(|(_, found)| found.living())
            .filter(|(_, found)| {
                let body = found.fighter.body;
                super::seals::near([body.x, body.y, body.z], at) <= SLAM_M
            })
            .map(|(id, _)| *id)
            .collect();
        for &player in &struck {
            self.harm_share(player, SLAM_SHARE, boss);
        }
        self.tell_all(EventKind::BossSlammed, struck.len() as f64);
    }

    /// The ticks until the warded Boss's slam lands while it is shown; none while no ward stands or none is shown.
    pub(crate) fn slam_seen(&self) -> u32 {
        let Some(court) = self.encounters.as_ref().map(|encounters| &encounters.court) else { return 0 };
        if !court.ward_up || !court.ward_told || self.boss().is_none() {
            return 0;
        }
        let left = SLAM_EVERY - (self.clock - court.ward_at) % SLAM_EVERY;
        if left <= SLAM_WARNING { u32::try_from(left).unwrap_or(u32::MAX) } else { 0 }
    }

    /// While warded, the Boss stands at its post: farther from it than AT_POST_M it runs back to it, along the navmesh
    /// from off its post's floor, and there it turns and strikes where it stands. Its own blows it chooses as ever.
    pub(crate) fn hold_ward(&self, id: FighterId, intent: &mut combat::Intent, routes: &impl ::foes::Routes) {
        let warded = self.encounters.as_ref().is_some_and(|encounters| encounters.court.ward_up);
        if !warded || self.boss() != Some(id) {
            return;
        }
        let (Some(post), Some(foe)) = (self.garrison.first(), self.foes.get(&id)) else { return };
        let body = foe.fighter.body;
        let feet = [body.x, body.y, body.z];
        // Off its post's floor, on a flight or another storey, a straight line would run it into the rock.
        let toward = if (feet[2] - post.at[2]).abs() > movement::TUNING.step {
            routes.next_point(feet, post.at).unwrap_or(post.at)
        } else {
            post.at
        };
        let (east, south) = (toward[0] - body.x, toward[1] - body.y);
        let controls = &mut intent.controls;
        if super::seals::near(feet, post.at) > AT_POST_M {
            (controls.yaw, controls.forward, controls.sideways, controls.run) =
                (libm::atan2(east, -south), 1.0, 0.0, true);
        } else {
            (controls.forward, controls.sideways) = (0.0, 0.0);
        }
    }

    /// How far into its round the Reckoning is, in ticks, and the anchor this round's stands at; none before the
    /// first ward is broken or once the Boss has fallen.
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

    /// As a Reckoning's warning runs out it lands: every living player it reaches (`reckoning_reach`) outside its ring
    /// of light loses RECKONING_SHARE of their health, a blow from the Boss; one elsewhere in the dungeon is not.
    fn keep_reckoning(&mut self) {
        let Some((RECKONING_WARNING, at)) = self.reckoning_round() else { return };
        let Some(boss) = self.boss() else { return };
        let Some(encounters) = self.encounters.as_ref() else { return };
        let Some(light) = encounters.plan.anchors.get(usize::from(at)).copied() else { return };
        let in_court =
            |at: [f64; 3]| encounters.plan.cell_at(at).is_some_and(|cell| encounters.reckoning_cells.contains(&cell));
        let outside: Vec<crate::PlayerId> = self
            .players
            .iter()
            .filter(|(_, found)| {
                found.living() && in_court([found.fighter.body.x, found.fighter.body.y, found.fighter.body.z])
            })
            .filter(|(_, found)| {
                let body = found.fighter.body;
                super::seals::near([body.x, body.y, body.z], light) > LIGHT_REACH_M
            })
            .map(|(id, _)| *id)
            .collect();
        for &player in &outside {
            self.harm_share(player, RECKONING_SHARE, boss);
        }
        self.tell_all(EventKind::ReckoningLanded, outside.len() as f64);
    }

    /// Fury's step now: 0 before FURY_FROM after a living player first stood in the end room, then one more every
    /// FURY_EVERY, to the step that weighs FURY_MOST; 0 once the Boss has fallen.
    pub(crate) fn fury_step(&self) -> u8 {
        let Some(from) = self.encounters.as_ref().and_then(|encounters| encounters.court.fury_from) else { return 0 };
        if self.boss().is_none() {
            return 0;
        }
        let Some(since) = self.clock.checked_sub(from + FURY_FROM) else { return 0 };
        let most = ((FURY_MOST - 1.0) / FURY_STEP).round() as u64;
        u8::try_from((since / FURY_EVERY + 1).min(most)).unwrap_or(u8::MAX)
    }

    /// The ticks until Fury begins while its clock runs and the Boss stands; 0 before its clock starts and once Fury
    /// has begun.
    pub(crate) fn fury_ticks(&self) -> u32 {
        let Some(from) = self.encounters.as_ref().and_then(|encounters| encounters.court.fury_from) else { return 0 };
        if self.boss().is_none() {
            return 0;
        }
        (from + FURY_FROM).checked_sub(self.clock).map_or(0, |left| u32::try_from(left).unwrap_or(u32::MAX))
    }

    /// What Fury weighs a foe's blow on a player by: a tenth more for each step.
    pub(crate) fn fury_times(&self) -> f64 {
        1.0 + f64::from(self.fury_step()) * FURY_STEP
    }
}

#[cfg(test)]
#[path = "court_tests.rs"]
mod court_tests;
