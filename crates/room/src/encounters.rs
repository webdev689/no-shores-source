//! An Elite Dungeon's encounters as the room keeps them: its seals, each waiting until a living player stands in its
//! room, running, then broken; its Boss held back off its post until every seal is broken, then woken; and its Court
//! (`court.rs`). Each seal's rules are in `seals.rs`. A wipe at Abyss keeps the broken seals and starts the Court over;
//! leaving and coming back keeps everything, since it is the room's. Where pieces stand is `encounter_plan.rs`'s.

use crate::encounter_plan::EncounterPlan;
use crate::garrison::{DUNGEON, Post, draws_of, gird_of, index};
use crate::{EventKind, PlayerId, Room};
use ::foes::Rank;
use combat::fighter::FighterId;

/// How many foes a wave stands: one for each living player it is stood against, two at the fewest and four at the most;
/// and how many of a seal's or the Court's waves' foes stand at once: two for each of those players, four at the fewest
/// and eight at the most, so waves left alone never crowd a company or fill the dungeon.
pub const WAVE_FOES: (usize, usize) = (2, 4);
pub const WAVE_LIVING_EACH: usize = 2;
pub const WAVE_LIVING: (usize, usize) = (4, 8);
/// A wave due but refused while its waves stand as many as they may is tried again this long on, not given up.
pub const WAVE_RETRY_TICKS: u64 = 60;
/// The waves' draws are made on a stream of their own, so drawing them moves no garrison draw.
const WAVE_STREAM: u64 = 0x7365_616c;

/// How many of a seal's or the Court's waves' foes may stand at once against `living` players (WAVE_LIVING).
#[must_use]
pub const fn wave_living_most(living: usize) -> usize {
    let most = WAVE_LIVING_EACH * living;
    if most < WAVE_LIVING.0 {
        WAVE_LIVING.0
    } else if most > WAVE_LIVING.1 {
        WAVE_LIVING.1
    } else {
        most
    }
}

/// Whose waves a wave's foes count among: a seal's, by its number, the Court's, or, in a test, none (a group stood
/// alone).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum WaveOf {
    Seal(usize),
    Court,
    #[cfg(test)]
    Alone,
}

/// How a seal stands, by its number on the wire.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SealState {
    Waiting = 0,
    Running = 1,
    Broken = 2,
}

/// A seal as it stands: how long it has been held (a Litany: how many runes stepped in order), when its Litany's show
/// begins again, which of its pieces were stood on last tick (an Ascent: whether each living player in its room stands
/// on its stone) and the tick each was last stood on, its relic's strength (1 whole), when its next wave comes, its
/// waves' foes and how many waves it has stood; and a Litany's last right step and its last wrong rune with its tick.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Seal {
    pub state: SealState,
    pub held: u64,
    pub shown_from: u64,
    pub on: Vec<bool>,
    pub pressed: Vec<Option<u64>>,
    pub relic: f64,
    pub next_wave: u64,
    pub waves: Vec<FighterId>,
    pub stood: u64,
    pub last_step: u64,
    pub wrong: Option<(usize, u64)>,
}

impl Seal {
    fn waiting(pieces: usize) -> Self {
        Self {
            state: SealState::Waiting,
            held: 0,
            shown_from: 0,
            on: vec![false; pieces],
            pressed: vec![None; pieces],
            relic: 1.0,
            next_wave: 0,
            waves: Vec::new(),
            stood: 0,
            last_step: 0,
            wrong: None,
        }
    }
}

/// The Court as it stands: when its Boss woke, how many wards it has broken, whether one is up now and was told, when
/// it rose and how many waves it has stood, when a wave it was refused is tried again, its waves' foes, how long each
/// anchor has been stood on and when each last was, when the Reckonings began, when Fury's clock began (a living player
/// first in the end room), and whether the Boss's health was made a match for the company.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Court {
    pub woke_at: Option<u64>,
    pub wards_broken: usize,
    pub ward_up: bool,
    pub ward_told: bool,
    pub ward_at: u64,
    pub ward_waves: usize,
    pub ward_retry: u64,
    pub waves: Vec<FighterId>,
    pub anchors: Vec<u64>,
    pub anchors_left: Vec<u64>,
    pub reckoning_from: Option<u64>,
    pub fury_from: Option<u64>,
    pub matched: bool,
}

/// An Elite Dungeon's encounters: its plan, each seal's state, the Court's, and the levels its waves stand at.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Encounters {
    pub plan: EncounterPlan,
    pub seals: Vec<Seal>,
    pub court: Court,
    pub levels: Option<(u8, u8)>,
    /// The end room's cells, where the Court is fought and Fury's clock starts; and the cells the Reckoning reaches,
    /// those and the rooms and corridors sharing a doorway with it (`court::reckoning_reach`).
    pub court_cells: Vec<usize>,
    pub reckoning_cells: Vec<usize>,
}

impl Court {
    fn of(anchors: usize) -> Self {
        Self { anchors: vec![0; anchors], anchors_left: vec![0; anchors], ..Self::default() }
    }
}

impl Encounters {
    pub(crate) fn new(plan: EncounterPlan, levels: Option<(u8, u8)>) -> Self {
        let seals = plan.seals.iter().map(|seal| Seal::waiting(seal.pieces.len())).collect();
        let court = Court::of(plan.anchors.len());
        Self { plan, seals, court, levels, court_cells: Vec::new(), reckoning_cells: Vec::new() }
    }

    /// Whether every seal is broken.
    pub(crate) fn unsealed(&self) -> bool {
        self.seals.iter().all(|seal| seal.state == SealState::Broken)
    }
}

/// One seal as a snapshot carries it: its kind, its state, its progress per mille, its pieces' marks (a Litany's runes
/// 0 dark, 1 showing, 2 stepped in order, 3 stepped wrong a moment ago; a Weighing's plates in play and a Holdfast's
/// ring 0 or 1 stood on; an Ascent's players on its stone and living in its room) and its relic's strength per mille.
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
/// the ticks until a Reckoning lands (0 while none is coming) and at which anchor; Fury's step; the ticks until Fury
/// begins while its clock runs (0 before and after); and the ticks until the warded Boss's slam lands (0 while none
/// is shown).
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
    pub fury_ticks: u32,
    pub slam_ticks: u32,
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
        if sealed {
            self.hold_boss();
        } else if let Some(encounters) = self.encounters.as_mut() {
            // No seal holds it: the Boss its garrison stood is awake already, and no second one stands.
            encounters.court.woke_at = Some(self.clock);
        }
    }

    /// The Boss's post emptied: its foe sent away, never counted cleared while its seals hold (`held_back`).
    fn hold_boss(&mut self) {
        let Some(post) = self.garrison.first_mut() else { return };
        post.leader = None;
        let gone = std::mem::take(&mut post.standing);
        self.send_away(&gone);
    }

    /// The Boss stands on its post, and every player is told.
    pub(crate) fn wake_boss(&mut self) {
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

    /// Whether a fallen garrison post may stand again: never an Elite Dungeon's Boss, whose Court is fought once a run,
    /// nor a group holding the ground its fall won while anyone is in the room (`checkpoints.rs`).
    pub(crate) fn stands_again(&self, post: usize) -> bool {
        // A passage zone's guards stand again only as its deal begins again (`passage_deal.rs`).
        (post != 0 || self.encounters.is_none()) && !self.holds_ground(post) && self.zone().is_none()
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

    /// The living players in the run.
    pub(crate) fn living_players(&self) -> usize {
        self.players.values().filter(|found| found.living()).count()
    }

    /// The living players standing in a room's cells: each its id, where its feet are and whether it stands on the
    /// ground.
    pub(crate) fn players_in(&self, plan: &EncounterPlan, cells: &[usize]) -> Vec<(PlayerId, [f64; 3], bool)> {
        self.players
            .iter()
            .filter(|(_, found)| found.living())
            .filter_map(|(id, found)| {
                let body = found.fighter.body;
                let cell = plan.cell_at([body.x, body.y, body.z])?;
                cells.contains(&cell).then_some((*id, [body.x, body.y, body.z], body.mode == movement::Mode::Ground))
            })
            .collect()
    }

    /// A wave of the dungeon's own foes, one for each of `living` players (WAVE_FOES), at `spots` in turn, each hunting
    /// the living player nearest it; none while the room, or the seal's or the Court's waves, have no room for them.
    pub(crate) fn stand_seal_wave(
        &mut self,
        encounters: &mut Encounters,
        of: WaveOf,
        spots: &[[f64; 3]],
        living: usize,
    ) -> usize {
        let count = living.clamp(WAVE_FOES.0, WAVE_FOES.1);
        self.stand_foes(encounters, of, spots, count, living)
    }

    /// `count` of the dungeon's own Majors at `spots` in turn, hunting the nearest living player; their number. An
    /// encounter's foes are never its Elites, which stand only in the garrison, and a seal's or the Court's waves, or
    /// a group stood alone, are kept to `wave_living_most` of the `living` players they are stood against. They drop
    /// nothing, as a defence tried again stands foes that drop nothing: an encounter's foes come again, and its seal
    /// and cache are its reward.
    pub(crate) fn stand_foes(
        &mut self,
        encounters: &mut Encounters,
        of: WaveOf,
        spots: &[[f64; 3]],
        count: usize,
        living: usize,
    ) -> usize {
        let standing = |room: &Self, ids: &[FighterId]| {
            ids.iter().filter(|id| room.foes.get(id).is_some_and(|foe| !foe.fighter.dead())).count()
        };
        let kept = match of {
            WaveOf::Seal(seal) => standing(self, &encounters.seals[seal].waves),
            WaveOf::Court => standing(self, &encounters.court.waves),
            #[cfg(test)]
            WaveOf::Alone => 0,
        };
        let Some(&first) = spots.first() else { return 0 };
        // A group stood alone is held to the same most, its own foes the only ones counted.
        let crowded = kept + count > wave_living_most(living);
        if self.living_foes() + count > self.foes_most || crowded {
            return 0;
        }
        let (stood, stream) = match of {
            WaveOf::Seal(seal) => (encounters.seals[seal].stood, seal as u64),
            WaveOf::Court => (encounters.court.ward_waves as u64, 0xfe),
            #[cfg(test)]
            WaveOf::Alone => (0, 0xff),
        };
        let seed = self.world_seed ^ WAVE_STREAM ^ (stood << 8) ^ stream ^ self.clock << 20;
        let mut draws = draws_of(seed);
        let majors: Vec<(u8, Rank)> = DUNGEON.into_iter().filter(|&(_, rank)| rank == Rank::Major).collect();
        // On the mesh, and a body's radius clear of every rock and solid, which the mesh keeps less off.
        let on_mesh = |room: &Self, [x, y, z]: [f64; 3]| {
            let place = [x, y, movement::Terrain::height_under(&room.floor, x, y, z)];
            room.floor.standing_clear(room.nav.nearest_point(place).unwrap_or(place))
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
            let (number, rank) = majors[index(&mut draws, majors.len())];
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
        self.quests.spoilless.extend(&ids);
        self.hunt_nearest(&ids);
        match of {
            WaveOf::Seal(seal) => {
                if let Some(seal) = encounters.seals.get_mut(seal) {
                    seal.waves.extend(&ids);
                    seal.stood += 1;
                }
            }
            WaveOf::Court => encounters.court.waves.extend(&ids),
            #[cfg(test)]
            WaveOf::Alone => {}
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
            let near = |at: &[f64; 3]| seals::near(*at, [body.x, body.y, body.z]);
            let nearest = players.iter().min_by(|a, b| near(&a.1).total_cmp(&near(&b.1)));
            if let Some(&(player, at)) = nearest {
                foe.brain.hunt(player, at, clock);
            }
        }
    }

    /// An Abyss run starting over: every wave is gone before the posts stand again, since a wave never stands again.
    pub(crate) fn drop_waves(&mut self) {
        let waves: Vec<FighterId> =
            self.garrison.iter().filter(|post| post.arrival).flat_map(|post| post.standing.clone()).collect();
        self.send_away(&waves);
        self.garrison.retain(|post| !post.arrival);
    }

    /// An Abyss run started over: each seal not broken waits again, and the Court starts over, its Boss held back
    /// again while a seal holds.
    pub(crate) fn encounters_start_over(&mut self) {
        let Some(encounters) = self.encounters.as_mut() else { return };
        for (seal, plan) in encounters.seals.iter_mut().zip(&encounters.plan.seals) {
            if seal.state != SealState::Broken {
                *seal = Seal::waiting(plan.pieces.len());
            }
            seal.waves.clear();
        }
        let unsealed = encounters.unsealed();
        encounters.court = Court::of(encounters.plan.anchors.len());
        if unsealed {
            encounters.court.woke_at = Some(self.clock);
        } else {
            self.hold_boss();
        }
    }

    /// A company fallen together in the Court's darkness: its fight starts over, its waves gone, its ward, anchors and
    /// Fury as they first were, and its Boss stood again whole at its post, awake (`revive.rs`).
    pub(crate) fn court_start_over(&mut self) {
        self.drop_waves();
        let Some(encounters) = self.encounters.as_mut() else { return };
        encounters.court = Court::of(encounters.plan.anchors.len());
        self.hold_boss();
        self.wake_boss();
    }

    /// The encounters as a snapshot carries them; none in a room with no encounters.
    #[must_use]
    pub fn encounter_seen(&self) -> Option<EncounterSeen> {
        let encounters = self.encounters.as_ref()?;
        let living_in = |plan: &crate::encounter_plan::SealPlan| self.players_in(&encounters.plan, &plan.cells).len();
        let seals = encounters
            .plan
            .seals
            .iter()
            .zip(&encounters.seals)
            .map(|(plan, seal)| SealSeen {
                kind: plan.kind as u8,
                state: seal.state as u8,
                progress: per_mille(self.seal_progress(plan, seal)),
                marks: self.seal_marks(plan, seal, living_in(plan)),
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
            anchors: court.anchors.iter().map(|&held| per_mille(held as f64 / court::ANCHOR_TICKS as f64)).collect(),
            reckoning_ticks,
            reckoning_at,
            fury: self.fury_step(),
            fury_ticks: self.fury_ticks(),
            slam_ticks: self.slam_seen(),
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
