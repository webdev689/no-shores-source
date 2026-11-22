//! An Elite Dungeon's encounters as the room keeps them: its seals, each waiting until a living player stands in its
//! room, running, then broken; its Boss held back off its post until every seal is broken, then woken; and its Court
//! (`court.rs`). Each seal's rules are in `seals.rs`. A wipe at Abyss keeps the broken seals and starts the Court over;
//! leaving and coming back keeps everything, since it is the room's. Where pieces stand is `encounter_plan.rs`'s.

use crate::encounter_plan::EncounterPlan;
use crate::garrison::{DUNGEON, Post, draws_of, gird_of, index};
use crate::{EventKind, PlayerId, Room};
use ::foes::Rank;
use combat::fighter::FighterId;

/// How many foes a wave stands: one for each player in the run, two at the fewest and four at the most; and the most
/// of a seal's foes that stand at once, so a wave left alone never fills the dungeon.
pub const WAVE_FOES: (usize, usize) = (2, 4);
pub const WAVE_LIVING_MOST: usize = 8;
/// The waves' draws are made on a stream of their own, so drawing them moves no garrison draw.
const WAVE_STREAM: u64 = 0x7365_616c;

/// How a seal stands, by its number on the wire.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SealState {
    Waiting = 0,
    Running = 1,
    Broken = 2,
}

/// A seal as it stands: how long it has been held (a Litany: how many runes stepped in order), when its Litany's show
/// begins again, which of its pieces were stood on last tick, its relic's strength (1 whole), when its next wave
/// comes, and its waves' foes.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Seal {
    pub state: SealState,
    pub held: u64,
    pub shown_from: u64,
    pub on: Vec<bool>,
    pub relic: f64,
    pub next_wave: u64,
    pub waves: Vec<FighterId>,
    pub stood: u64,
}

impl Seal {
    fn waiting(pieces: usize) -> Self {
        Self {
            state: SealState::Waiting,
            held: 0,
            shown_from: 0,
            on: vec![false; pieces],
            relic: 1.0,
            next_wave: 0,
            waves: Vec::new(),
            stood: 0,
        }
    }
}

/// The Court as it stands: when its Boss woke, how many wards it has broken, whether one is up now and was told, how
/// long each anchor has been stood on, when the Reckonings began, and when Fury was last weighed from.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Court {
    pub woke_at: Option<u64>,
    pub wards_broken: usize,
    pub ward_up: bool,
    pub ward_told: bool,
    pub anchors: Vec<u64>,
    pub reckoning_from: Option<u64>,
}

/// An Elite Dungeon's encounters: its plan, each seal's state, the Court's, and the levels its waves stand at.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Encounters {
    pub plan: EncounterPlan,
    pub seals: Vec<Seal>,
    pub court: Court,
    pub levels: Option<(u8, u8)>,
}

impl Encounters {
    pub(crate) fn new(plan: EncounterPlan, levels: Option<(u8, u8)>) -> Self {
        let seals = plan.seals.iter().map(|seal| Seal::waiting(seal.pieces.len())).collect();
        let court = Court { anchors: vec![0; plan.anchors.len()], ..Court::default() };
        Self { plan, seals, court, levels }
    }

    /// Whether every seal is broken.
    pub(crate) fn unsealed(&self) -> bool {
        self.seals.iter().all(|seal| seal.state == SealState::Broken)
    }
}

/// One seal as a snapshot carries it: its kind, its state, its progress per mille, its pieces' marks (a Litany's runes
/// 0 dark, 1 showing, 2 stepped in order; a Weighing's plates in play, an Ascent's stone and a Holdfast's ring 0 or 1
/// stood on) and its relic's strength per mille.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SealSeen {
    pub kind: u8,
    pub state: u8,
    pub progress: u16,
    pub marks: Vec<u8>,
    pub relic: u16,
}

/// An Elite Dungeon's encounters as a snapshot carries them: each seal; whether the Boss is awake and its number;
/// the ward up (0 none, 1 at two thirds, 2 at one third) and how many are broken; each anchor's progress per mille;
/// the ticks until a Reckoning lands (0 while none is coming) and at which anchor; and Fury's step.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EncounterSeen {
    pub seals: Vec<SealSeen>,
    pub woken: bool,
    pub boss: u32,
    pub ward: u8,
    pub wards_broken: u8,
    pub anchors: Vec<u16>,
    pub reckoning_ticks: u32,
    pub reckoning_at: u8,
    pub fury: u8,
}

/// A share of a whole as per mille.
pub(crate) fn per_mille(part: f64) -> u16 {
    (part.clamp(0.0, 1.0) * 1000.0) as u16
}

impl Room {
    /// Lays an Elite Dungeon's encounters in its room, its foes at `levels`, and holds its Boss back off its post
    /// until its seals are broken.
    pub(crate) fn lay_encounters(&mut self, plan: EncounterPlan, levels: Option<(u8, u8)>) {
        let sealed = !plan.seals.is_empty();
        self.encounters = Some(Box::new(Encounters::new(plan, levels)));
        if sealed { self.hold_boss() } else { self.wake_boss() }
    }

    /// The Boss's post emptied: its foe sent away, never counted cleared while its seals hold (`held_back`).
    fn hold_boss(&mut self) {
        let Some(post) = self.garrison.first_mut() else { return };
        let gone = std::mem::take(&mut post.standing);
        self.send_away(&gone);
    }

    /// The Boss stands on its post, and every player is told.
    fn wake_boss(&mut self) {
        if self.garrison.is_empty() {
            return;
        }
        self.stand_post(0);
        let clock = self.clock;
        if let Some(encounters) = self.encounters.as_mut() {
            encounters.court.woke_at = Some(clock);
        }
        self.tell_all(EventKind::BossWoke, 0.0);
    }

    /// Whether a garrison post is held back: an Elite Dungeon's Boss's while a seal holds.
    pub(crate) fn held_back(&self, post: usize) -> bool {
        post == 0 && self.encounters.as_ref().is_some_and(|encounters| encounters.court.woke_at.is_none())
    }

    /// The Boss standing now, if it is up.
    pub(crate) fn boss(&self) -> Option<FighterId> {
        self.encounters.as_ref()?.court.woke_at?;
        let id = self.garrison.first()?.standing.first().copied()?;
        self.foes.get(&id).filter(|foe| !foe.fighter.dead()).map(|_| id)
    }

    /// Tells every player of a moment, each as its defender.
    pub(crate) fn tell_all(&mut self, kind: EventKind, amount: f64) {
        let players: Vec<PlayerId> = self.players.keys().copied().collect();
        for player in players {
            self.tell(kind, None, 0, player, amount);
        }
    }

    /// Each tick: every seal by its kind's rules, the Boss woken once every seal is broken, and the Court.
    pub(crate) fn keep_encounters(&mut self) {
        let Some(mut encounters) = self.encounters.take() else { return };
        for seal in 0..encounters.seals.len() {
            self.keep_seal(&mut encounters, seal);
        }
        let wakes = encounters.unsealed() && encounters.court.woke_at.is_none();
        self.encounters = Some(encounters);
        if wakes {
            self.wake_boss();
        }
        self.keep_court();
    }

    /// A seal broken: every player is told how many are broken now.
    pub(crate) fn break_seal(&mut self, encounters: &mut Encounters, seal: usize) {
        encounters.seals[seal].state = SealState::Broken;
        let broken = encounters.seals.iter().filter(|seal| seal.state == SealState::Broken).count();
        self.tell_all(EventKind::SealBroken, broken as f64);
    }

    /// The living players standing in a room's cells: each its id, where its feet are and whether it stands on the
    /// ground.
    pub(crate) fn players_in(&self, plan: &EncounterPlan, cells: &[usize]) -> Vec<(PlayerId, [f64; 3], bool)> {
        self.players
            .iter()
            .filter(|(_, found)| found.living())
            .filter_map(|(id, found)| {
                let body = found.fighter.body;
                let cell = plan.cell_at([body.x, body.y])?;
                cells.contains(&cell).then_some((*id, [body.x, body.y, body.z], body.mode == movement::Mode::Ground))
            })
            .collect()
    }

    /// A wave of the dungeon's own foes, one for each player in the run (WAVE_FOES), at `spots` in turn, each hunting
    /// the living player nearest it; none while the room or the seal has no room for them.
    pub(crate) fn stand_seal_wave(
        &mut self,
        encounters: &mut Encounters,
        seal: Option<usize>,
        spots: &[[f64; 2]],
    ) -> usize {
        let count = self.players.len().clamp(WAVE_FOES.0, WAVE_FOES.1);
        self.stand_foes(encounters, seal, spots, count)
    }

    /// `count` of the dungeon's own Major and Elite foes at `spots` in turn, hunting the nearest living player; their
    /// number. A seal's waves are kept to WAVE_LIVING_MOST living at once.
    pub(crate) fn stand_foes(
        &mut self,
        encounters: &mut Encounters,
        seal: Option<usize>,
        spots: &[[f64; 2]],
        count: usize,
    ) -> usize {
        let living = |room: &Self, ids: &[FighterId]| {
            ids.iter().filter(|id| room.foes.get(id).is_some_and(|foe| !foe.fighter.dead())).count()
        };
        let kept = seal.map_or(0, |seal| living(self, &encounters.seals[seal].waves));
        let Some(&first) = spots.first() else { return 0 };
        if self.living_foes() + count > self.foes_most || kept + count > WAVE_LIVING_MOST {
            return 0;
        }
        let stood = seal.map_or(0, |seal| encounters.seals[seal].stood);
        let seed =
            self.world_seed ^ WAVE_STREAM ^ (stood << 8) ^ seal.map_or(0xff, |seal| seal as u64) ^ self.clock << 20;
        let mut draws = draws_of(seed);
        let on_mesh = |room: &Self, [x, y]: [f64; 2]| {
            let place = [x, y, movement::Terrain::height_at(&room.floor, x, y)];
            room.nav.nearest_point(place).unwrap_or(place)
        };
        let at = on_mesh(self, first);
        let mut post = Post {
            at,
            members: Vec::new(),
            girds: Vec::new(),
            beat: None,
            standing: Vec::new(),
            cleared_at: None,
            leader: None,
            broken: false,
            defending: false,
            fallback: at,
            anchor: None,
            arrival: true,
        };
        for nth in 0..count {
            let (number, rank) = DUNGEON[index(&mut draws, DUNGEON.len())];
            let spot = on_mesh(self, spots[nth % spots.len()]);
            let (level, shield) =
                gird_of(seed, u32::try_from(nth).unwrap_or(0), encounters.levels, self.shield_chance());
            post.members.push((number, rank, spot, 0.0));
            post.girds.push((level, shield.filter(|_| rank < Rank::Miniboss)));
        }
        self.garrison.push(post);
        let posted = self.garrison.len() - 1;
        self.stand_post(posted);
        let ids = self.garrison[posted].standing.clone();
        self.hunt_nearest(&ids);
        if let Some(seal) = seal.and_then(|seal| encounters.seals.get_mut(seal)) {
            seal.waves.extend(&ids);
            seal.stood += 1;
        }
        ids.len()
    }

    /// Sets each foe hunting the living player nearest it.
    fn hunt_nearest(&mut self, ids: &[FighterId]) {
        let players: Vec<(PlayerId, [f64; 3])> = self
            .players
            .iter()
            .filter(|(_, found)| found.living())
            .map(|(id, found)| (*id, [found.fighter.body.x, found.fighter.body.y, found.fighter.body.z]))
            .collect();
        let clock = self.clock;
        for id in ids {
            let Some(foe) = self.foes.get_mut(id) else { continue };
            let body = foe.fighter.body;
            let near = |at: &[f64; 3]| libm::hypot(at[0] - body.x, at[1] - body.y);
            let nearest = players.iter().min_by(|a, b| near(&a.1).total_cmp(&near(&b.1)));
            if let Some(&(player, at)) = nearest {
                foe.brain.hunt(player, at, clock);
            }
        }
    }

    /// An Abyss run started over: its waves are gone, each seal not broken waits again, and the Court starts over,
    /// its Boss held back again while a seal holds.
    pub(crate) fn encounters_start_over(&mut self) {
        let waves: Vec<FighterId> =
            self.garrison.iter().filter(|post| post.arrival).flat_map(|post| post.standing.clone()).collect();
        self.send_away(&waves);
        self.garrison.retain(|post| !post.arrival);
        let Some(encounters) = self.encounters.as_mut() else { return };
        for (seal, plan) in encounters.seals.iter_mut().zip(&encounters.plan.seals) {
            if seal.state != SealState::Broken {
                *seal = Seal::waiting(plan.pieces.len());
            }
            seal.waves.clear();
        }
        let unsealed = encounters.unsealed();
        encounters.court = Court { anchors: vec![0; encounters.plan.anchors.len()], ..Court::default() };
        if unsealed {
            encounters.court.woke_at = Some(self.clock);
        } else {
            self.hold_boss();
        }
    }

    /// The encounters as a snapshot carries them; none in a room with no encounters.
    #[must_use]
    pub fn encounter_seen(&self) -> Option<EncounterSeen> {
        let encounters = self.encounters.as_ref()?;
        let seals = encounters
            .plan
            .seals
            .iter()
            .zip(&encounters.seals)
            .map(|(plan, seal)| SealSeen {
                kind: plan.kind as u8,
                state: seal.state as u8,
                progress: per_mille(self.seal_progress(plan, seal)),
                marks: self.seal_marks(plan, seal),
                relic: per_mille(seal.relic),
            })
            .collect();
        let court = &encounters.court;
        let (reckoning_ticks, reckoning_at) = self.reckoning_seen().unwrap_or((0, 0));
        Some(EncounterSeen {
            seals,
            woken: court.woke_at.is_some(),
            boss: self.boss().unwrap_or(0),
            ward: if court.ward_up { u8::try_from(court.wards_broken + 1).unwrap_or(u8::MAX) } else { 0 },
            wards_broken: u8::try_from(court.wards_broken).unwrap_or(u8::MAX),
            anchors: court
                .anchors
                .iter()
                .map(|&held| per_mille(held as f64 / court::ANCHOR_TICKS as f64))
                .collect(),
            reckoning_ticks,
            reckoning_at,
            fury: self.fury_step(),
        })
    }
}

#[cfg(test)]
#[path = "encounters_tests.rs"]
pub(crate) mod encounters_tests;

#[path = "court.rs"]
pub mod court;
#[path = "seals.rs"]
pub mod seals;
