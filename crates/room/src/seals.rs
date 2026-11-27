//! Each seal's rules, by its kind, each tick it runs: a seal waits until a living player stands in its room and no
//! living foe of the garrison does, then runs until it is broken. A puzzle never hurts by itself: a wrong rune wakes
//! foes, and only the Ascent's drowned floor harms, while its seal runs, through the same path a foe's blow takes, so
//! shields, deaths and revives treat it as any harm. Everything is counted by the living players in the seal's room.

use crate::encounter_plan::{EncounterPlan, SealKind, SealPlan};
use crate::encounters::{Encounters, Seal, SealState};
use crate::{EventKind, PlayerId, Room};
use combat::judge::{Blow, BlowKind};
use combat::shapes::Shape;
use combat::{Verdict, fighter::FighterId};

/// A Litany: each rune shows this long in turn, the show waits this long before it starts again, a step on a rune
/// counts within this reach of its middle, a wrong one wakes this many of the dungeon's foes and is shown wrong this
/// long, and after the first rune each next is stepped within this long or the Litany starts over.
pub const RUNE_SHOWN_TICKS: u64 = 60;
pub const LITANY_PAUSE_TICKS: u64 = 120;
pub const RUNE_REACH_M: f64 = 0.9;
pub const WRONG_FOES: usize = 2;
pub const WRONG_SHOWN_TICKS: u64 = 60;
pub const RUNE_STEP_TICKS: u64 = 3 * 60;
/// A Weighing: its plates held together this long in all, a plate stood on within this reach and held this long after
/// its last player steps off (so one player can hold two), its first wave this long after it starts and the next
/// every so often, and two plates in play while fewer than this many living players stand in its room.
pub const WEIGHING_TICKS: u64 = 20 * 60;
pub const PLATE_LINGER_TICKS: u64 = 3 * 60;
pub const PLATE_REACH_M: f64 = 1.0;
pub const WEIGHING_FIRST_WAVE_TICKS: u64 = 3 * 60;
pub const WEIGHING_WAVE_TICKS: u64 = 12 * 60;
pub const ALL_PLATES_FROM: usize = 3;
/// An Ascent: the share of their health its drowned floor takes from a player standing on it, once a second; how low
/// feet stand to be on the floor; and how long every living player in its room holds the seal stone together.
pub const DROWNED_SHARE: f64 = 0.12;
pub const DROWNED_EVERY: u64 = 60;
pub const WET_M: f64 = 0.05;
pub const STONE_TICKS: u64 = 2 * 60;
/// A Holdfast: its ring held this long in all, its first wave this long after it starts and the next every so often,
/// how much of its relic one foe in its ring drains a tick (a whole relic in 20 s), and how much it regains a tick
/// while no foe stands in its ring (a whole relic in 40 s).
pub const HOLDFAST_TICKS: u64 = 45 * 60;
pub const HOLDFAST_FIRST_WAVE_TICKS: u64 = 2 * 60;
pub const HOLDFAST_WAVE_TICKS: u64 = 12 * 60;
pub const RELIC_DRAIN: f64 = 1.0 / (20.0 * 60.0);
pub const RELIC_REGAIN: f64 = 1.0 / (40.0 * 60.0);

/// How long a plate stays held after its last player steps off: PLATE_LINGER_TICKS, and for a lone player the walk
/// between its two plates besides, so one player walking, not only sprinting, can hold both.
pub(crate) fn plate_linger(players: usize, plates: &[[f64; 3]]) -> u64 {
    let walk = match plates {
        [first, second, ..] if players < 2 => near(*first, *second) / movement::TUNING.walk,
        _ => 0.0,
    };
    PLATE_LINGER_TICKS + libm::ceil(walk * 60.0) as u64
}

/// The plates in play: three, or two while fewer than ALL_PLATES_FROM living players stand in the Weighing's room.
pub(crate) const fn plates_for(living: usize) -> usize {
    if living >= ALL_PLATES_FROM { 3 } else { 2 }
}

/// How near two points stand on the floor, metres; never near on different storeys, as rock stands between them.
pub(crate) fn near(a: [f64; 3], b: [f64; 3]) -> f64 {
    if ::foes::storeys_apart(a, b) {
        return f64::INFINITY;
    }
    libm::hypot(a[0] - b[0], a[1] - b[1])
}

impl Room {
    /// One seal's tick: waiting until a living player stands in its room and no living foe of the garrison does, then
    /// its kind's rules.
    pub(crate) fn keep_seal(&mut self, encounters: &mut Encounters, seal: usize) {
        let plan = encounters.plan.seals[seal].clone();
        let inside = self.players_in(&encounters.plan, &plan.cells);
        let clock = self.clock;
        let waiting = encounters.seals[seal].state == SealState::Waiting;
        if waiting && !inside.is_empty() && !self.guarded(&encounters.plan, &plan.cells) {
            let found = &mut encounters.seals[seal];
            (found.state, found.shown_from) = (SealState::Running, clock);
            found.next_wave = clock
                + match plan.kind {
                    SealKind::Weighing => WEIGHING_FIRST_WAVE_TICKS,
                    _ => HOLDFAST_FIRST_WAVE_TICKS,
                };
        }
        if encounters.seals[seal].state != SealState::Running {
            return;
        }
        let standing: Vec<[f64; 3]> = inside.iter().map(|&(_, at, _)| at).collect();
        let done = match plan.kind {
            SealKind::Litany => {
                // A step is a body on the ground: a dodge or a jump across a rune is none.
                let grounded: Vec<[f64; 3]> =
                    inside.iter().filter(|&&(_, _, grounded)| grounded).map(|&(_, at, _)| at).collect();
                self.keep_litany(encounters, seal, &plan, &grounded)
            }
            SealKind::Weighing => self.keep_weighing(encounters, seal, &plan, &standing),
            SealKind::Ascent => {
                self.drown(&encounters.plan, &plan);
                keep_ascent(&mut encounters.seals[seal], &plan, &inside)
            }
            SealKind::Holdfast => self.keep_holdfast(encounters, seal, &plan, &standing),
        };
        if done {
            self.break_seal(encounters, seal);
        }
    }

    /// Whether a living foe of the garrison (not a wave) stands in a room's cells: its seal waits until none does.
    fn guarded(&self, plan: &EncounterPlan, cells: &[usize]) -> bool {
        self.garrison
            .iter()
            .filter(|post| !post.arrival)
            .flat_map(|post| &post.standing)
            .filter_map(|id| self.foes.get(id))
            .filter(|foe| !foe.fighter.dead())
            .any(|foe| {
                plan.cell_at([foe.fighter.body.x, foe.fighter.body.y, foe.fighter.body.z])
                    .is_some_and(|cell| cells.contains(&cell))
            })
    }

    /// A Litany's tick: a rune newly stepped on is the next in order and stays lit, is one already lit and is ignored,
    /// or is wrong, when every rune goes dark, the show starts again after its pause, two of the dungeon's foes wake
    /// and no step counts until the show starts again. After the first rune each next is stepped within
    /// RUNE_STEP_TICKS, or every rune goes dark with no foes. Broken once every rune is lit.
    fn keep_litany(
        &mut self,
        encounters: &mut Encounters,
        seal: usize,
        plan: &SealPlan,
        standing: &[[f64; 3]],
    ) -> bool {
        let clock = self.clock;
        let on: Vec<bool> =
            plan.pieces.iter().map(|&rune| standing.iter().any(|&at| near(at, rune) <= RUNE_REACH_M)).collect();
        let found = &mut encounters.seals[seal];
        let newly: Vec<usize> = (0..on.len()).filter(|&rune| on[rune] && !found.on[rune]).collect();
        found.on = on;
        if clock < found.shown_from {
            return false;
        }
        if found.held > 0 && clock - found.last_step > RUNE_STEP_TICKS {
            found.held = 0;
        }
        let mut wrong = false;
        for rune in newly {
            let stepped = usize::try_from(found.held).unwrap_or(usize::MAX);
            if rune == stepped {
                (found.held, found.last_step) = (found.held + 1, clock);
            } else if rune > stepped {
                (found.held, found.shown_from, found.wrong) = (0, clock + LITANY_PAUSE_TICKS, Some((rune, clock)));
                wrong = true;
                break;
            }
        }
        let done = found.held >= plan.pieces.len() as u64;
        if wrong {
            self.tell_all(EventKind::RuneWrong, seal as f64);
            let doors = Self::doorways_of(plan);
            self.stand_foes(encounters, Some(seal), &doors, WRONG_FOES);
        }
        done
    }

    /// A Weighing's tick: held while every plate in play is stood on by a living player, or was within its linger
    /// (`plate_linger`); a wave at its doorways WEIGHING_FIRST_WAVE_TICKS after it starts, then every
    /// WEIGHING_WAVE_TICKS. Broken once held WEIGHING_TICKS in all.
    fn keep_weighing(
        &mut self,
        encounters: &mut Encounters,
        seal: usize,
        plan: &SealPlan,
        standing: &[[f64; 3]],
    ) -> bool {
        let (in_play, clock) = (plates_for(standing.len()), self.clock);
        let linger = plate_linger(standing.len(), &plan.pieces);
        let found = &mut encounters.seals[seal];
        for (plate, pressed) in plan.pieces[..in_play].iter().zip(&mut found.pressed) {
            if standing.iter().any(|&at| near(at, *plate) <= PLATE_REACH_M) {
                *pressed = Some(clock);
            }
        }
        let held = |pressed: &Option<u64>| pressed.is_some_and(|at| clock - at <= linger);
        let on: Vec<bool> = found.pressed[..in_play].iter().map(held).collect();
        if on.iter().all(|held| *held) {
            found.held += 1;
        }
        found.on = on;
        self.wave_when_due(encounters, seal, plan, WEIGHING_WAVE_TICKS, standing.len());
        encounters.seals[seal].held >= WEIGHING_TICKS
    }

    /// A Holdfast's tick: held while a living player stands in the relic's ring; each living foe in it drains the
    /// relic, a ring with no foe in it lets the relic regain RELIC_REGAIN, and a drained relic halves what was held and
    /// stands whole again; a wave HOLDFAST_FIRST_WAVE_TICKS after it starts, then every HOLDFAST_WAVE_TICKS. Broken
    /// once held HOLDFAST_TICKS in all.
    fn keep_holdfast(
        &mut self,
        encounters: &mut Encounters,
        seal: usize,
        plan: &SealPlan,
        standing: &[[f64; 3]],
    ) -> bool {
        let relic = plan.pieces[0];
        let ring = crate::encounter_plan::RELIC_RING_M;
        let held = standing.iter().any(|&at| near(at, relic) <= ring);
        let draining = self
            .foes
            .values()
            .filter(|foe| !foe.fighter.dead() && !foe.fighter.side.is_players())
            .filter(|foe| near([foe.fighter.body.x, foe.fighter.body.y, foe.fighter.body.z], relic) <= ring)
            .count();
        let found = &mut encounters.seals[seal];
        found.on = vec![held];
        if held {
            found.held += 1;
        }
        found.relic = if draining == 0 {
            (found.relic + RELIC_REGAIN).min(1.0)
        } else {
            found.relic - draining as f64 * RELIC_DRAIN
        };
        let drained = found.relic <= 0.0;
        if drained {
            (found.held, found.relic) = (found.held / 2, 1.0);
            self.tell_all(EventKind::RelicDrained, seal as f64);
        }
        self.wave_when_due(encounters, seal, plan, HOLDFAST_WAVE_TICKS, standing.len());
        encounters.seals[seal].held >= HOLDFAST_TICKS
    }

    /// A wave at the seal room's doorways once it is due, one foe for each of the `living` players in its room, the
    /// next `every` ticks on.
    fn wave_when_due(&mut self, encounters: &mut Encounters, seal: usize, plan: &SealPlan, every: u64, living: usize) {
        if self.clock < encounters.seals[seal].next_wave {
            return;
        }
        encounters.seals[seal].next_wave = self.clock + every;
        let doors = Self::doorways_of(plan);
        self.stand_seal_wave(encounters, Some(seal), &doors, living);
    }

    /// Where a seal's foes come in: its room's doorways, or its pieces where it has none.
    fn doorways_of(plan: &SealPlan) -> Vec<[f64; 3]> {
        if plan.doors.is_empty() { plan.pieces.clone() } else { plan.doors.clone() }
    }

    /// Once a second, the drowned floor takes DROWNED_SHARE of their health from every living player standing on it,
    /// and tells each so.
    fn drown(&mut self, plan_of: &EncounterPlan, plan: &SealPlan) {
        if !self.clock.is_multiple_of(DROWNED_EVERY) {
            return;
        }
        // The drowned floor is the room's, the one its pads stand on.
        let floor = plan.pads.first().map_or(dungeon::FLOOR_M, |pad| pad.bottom);
        let wet: Vec<PlayerId> = self
            .players_in(plan_of, &plan.drowned)
            .into_iter()
            .filter(|&(_, at, grounded)| grounded && at[2] < floor + WET_M)
            .map(|(id, _, _)| id)
            .collect();
        for player in wet {
            self.harm_share(player, DROWNED_SHARE, 0);
            self.tell(EventKind::Drowned, None, 0, player, DROWNED_SHARE);
        }
    }

    /// Takes `share` of a player's health as a blow from `striker` (0 for the room itself) that no guard, parry or
    /// dodge stops, settled as any blow is.
    pub(crate) fn harm_share(&mut self, player: PlayerId, share: f64, striker: FighterId) {
        let Some(found) = self.players.get(&player) else { return };
        let damage = found.fighter.health_max * share;
        let from = [found.fighter.body.x, found.fighter.body.y];
        let blow = Blow {
            striker,
            kind: BlowKind::Telegraph(Shape::Ring),
            from,
            damage,
            poise: 0.0,
            guard: 0.0,
            parryable: false,
            blockable: false,
            knocks_down: false,
            through: 1.0,
            stagger: 1.0,
            element: 0,
            crit: false,
        };
        self.settle(&blow, crate::How::Telegraph, player, Verdict::Hit { damage, poise: 0.0 }, None);
    }

    /// How far a seal has come, 0 to 1.
    pub(crate) fn seal_progress(&self, plan: &SealPlan, seal: &Seal) -> f64 {
        if seal.state == SealState::Broken {
            return 1.0;
        }
        let needed = match plan.kind {
            SealKind::Litany => plan.pieces.len() as u64,
            SealKind::Weighing => WEIGHING_TICKS,
            SealKind::Ascent => STONE_TICKS,
            SealKind::Holdfast => HOLDFAST_TICKS,
        };
        seal.held as f64 / needed.max(1) as f64
    }

    /// A seal's pieces' marks: a Litany's runes 3 stepped wrong within WRONG_SHOWN_TICKS, 2 stepped in order, 1
    /// showing (its show looping while it runs), 0 dark; a Weighing's plates in play for the `living` players in its
    /// room and a Holdfast's ring 1 stood on or 0; an Ascent's players on its stone and the `living` in its room.
    pub(crate) fn seal_marks(&self, plan: &SealPlan, seal: &Seal, living: usize) -> Vec<u8> {
        let count = |many: usize| u8::try_from(many).unwrap_or(u8::MAX);
        match plan.kind {
            SealKind::Litany => {
                let running = seal.state == SealState::Running;
                let showing = running.then(|| showing(self.clock, seal.shown_from, plan.pieces.len())).flatten();
                let wrong =
                    seal.wrong.filter(|&(_, at)| running && self.clock - at < WRONG_SHOWN_TICKS).map(|(rune, _)| rune);
                (0..plan.pieces.len())
                    .map(|rune| match () {
                        () if wrong == Some(rune) => 3,
                        () if (rune as u64) < seal.held || seal.state == SealState::Broken => 2,
                        () if showing == Some(rune) => 1,
                        () => 0,
                    })
                    .collect()
            }
            SealKind::Weighing => {
                let in_play = plates_for(living);
                (0..in_play).map(|plate| u8::from(seal.on.get(plate).copied().unwrap_or(false))).collect()
            }
            SealKind::Ascent => vec![count(seal.on.iter().filter(|on| **on).count()), count(living)],
            SealKind::Holdfast => vec![u8::from(seal.on.first().copied().unwrap_or(false))],
        }
    }
}

/// The rune a Litany's show lights at `clock`, each RUNE_SHOWN_TICKS in turn from `from`, then dark for its pause.
pub(crate) fn showing(clock: u64, from: u64, runes: usize) -> Option<usize> {
    let since = clock.checked_sub(from)?;
    let cycle = runes as u64 * RUNE_SHOWN_TICKS + LITANY_PAUSE_TICKS;
    let rune = usize::try_from(since % cycle / RUNE_SHOWN_TICKS).ok()?;
    (rune < runes).then_some(rune)
}

/// An Ascent's tick: its stone held while every living player in its room stands on the top pad. Broken once held
/// STONE_TICKS in all.
fn keep_ascent(seal: &mut Seal, plan: &SealPlan, inside: &[(PlayerId, [f64; 3], bool)]) -> bool {
    let Some(top) = plan.pads.last() else { return true };
    seal.on = inside
        .iter()
        .map(|&(_, [x, y, z], grounded)| {
            grounded
                && (z - top.top).abs() < WET_M
                && x >= top.min_x
                && x <= top.max_x
                && y >= top.min_y
                && y <= top.max_y
        })
        .collect();
    if !seal.on.is_empty() && seal.on.iter().all(|on| *on) {
        seal.held += 1;
    }
    seal.held >= STONE_TICKS
}

#[cfg(test)]
#[path = "seals_tests.rs"]
pub(crate) mod seals_tests;
