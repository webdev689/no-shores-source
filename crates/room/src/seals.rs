//! Each seal's rules, by its kind, each tick it runs: a seal waits until a living player stands in its room, then runs
//! until it is broken. A puzzle never hurts by itself: a wrong rune wakes foes, and only the Ascent's drowned floor
//! harms, through the same path a foe's blow takes, so shields, deaths and revives treat it as any harm.

use crate::encounter_plan::{SealKind, SealPlan};
use crate::encounters::{Encounters, Seal, SealState};
use crate::{EventKind, PlayerId, Room};
use combat::judge::{Blow, BlowKind};
use combat::shapes::Shape;
use combat::{Verdict, fighter::FighterId};

/// A Litany: each rune shows this long in turn, the show waits this long before it starts again, a step on a rune
/// counts within this reach of its middle, and a wrong one wakes this many of the dungeon's foes.
pub const RUNE_SHOWN_TICKS: u64 = 60;
pub const LITANY_PAUSE_TICKS: u64 = 120;
pub const RUNE_REACH_M: f64 = 0.9;
pub const WRONG_FOES: usize = 2;
/// A Weighing: its plates held together this long in all, a plate stood on within this reach and held this long after
/// its last player steps off (so one player can hold two), a wave every so often, and two plates in play in a run of
/// fewer than this many players.
pub const WEIGHING_TICKS: u64 = 6 * 60;
pub const PLATE_LINGER_TICKS: u64 = 3 * 60;
pub const PLATE_REACH_M: f64 = 1.0;
pub const WEIGHING_WAVE_TICKS: u64 = 15 * 60;
pub const ALL_PLATES_FROM: usize = 3;
/// An Ascent: the share of their health its drowned floor takes from a player standing on it, once a second; how low
/// feet stand to be on the floor; and how long the seal stone is held.
pub const DROWNED_SHARE: f64 = 0.08;
pub const DROWNED_EVERY: u64 = 60;
pub const WET_M: f64 = 0.05;
pub const STONE_TICKS: u64 = 2 * 60;
/// A Holdfast: its ring held this long in all, a wave every so often, and how much of its relic one foe in its ring
/// drains a tick (a whole relic in 20 s).
pub const HOLDFAST_TICKS: u64 = 45 * 60;
pub const HOLDFAST_WAVE_TICKS: u64 = 12 * 60;
pub const RELIC_DRAIN: f64 = 1.0 / (20.0 * 60.0);

/// How long a plate stays held after its last player steps off: PLATE_LINGER_TICKS, and for a lone player the walk
/// between its two plates besides, so one player walking, not only sprinting, can hold both.
pub(crate) fn plate_linger(players: usize, plates: &[[f64; 3]]) -> u64 {
    let walk = match plates {
        [first, second, ..] if players < 2 => near(*first, *second) / movement::TUNING.walk,
        _ => 0.0,
    };
    PLATE_LINGER_TICKS + libm::ceil(walk * 60.0) as u64
}

/// The plates in play: three, or two in a run of fewer than ALL_PLATES_FROM players.
pub(crate) const fn plates_for(players: usize) -> usize {
    if players >= ALL_PLATES_FROM { 3 } else { 2 }
}

/// How near two points stand on the floor, metres.
fn near(a: [f64; 3], b: [f64; 3]) -> f64 {
    libm::hypot(a[0] - b[0], a[1] - b[1])
}

impl Room {
    /// One seal's tick: waiting until a living player stands in its room, then its kind's rules.
    pub(crate) fn keep_seal(&mut self, encounters: &mut Encounters, seal: usize) {
        let plan = encounters.plan.seals[seal].clone();
        let inside = self.players_in(&encounters.plan, &plan.cells);
        let clock = self.clock;
        let found = &mut encounters.seals[seal];
        if found.state == SealState::Waiting && !inside.is_empty() {
            found.state = SealState::Running;
            found.shown_from = clock;
            found.next_wave = clock
                + match plan.kind {
                    SealKind::Weighing => WEIGHING_WAVE_TICKS,
                    _ => HOLDFAST_WAVE_TICKS,
                };
        }
        if found.state == SealState::Broken {
            return;
        }
        // The drowned floor harms while the seal holds, whether or not it has begun.
        if plan.kind == SealKind::Ascent {
            self.drown(&encounters.plan, &plan);
        }
        if encounters.seals[seal].state != SealState::Running {
            return;
        }
        let standing: Vec<[f64; 3]> = inside.iter().map(|&(_, at, _)| at).collect();
        let done = match plan.kind {
            SealKind::Litany => self.keep_litany(encounters, seal, &plan, &standing),
            SealKind::Weighing => self.keep_weighing(encounters, seal, &plan, &standing),
            SealKind::Ascent => keep_ascent(&mut encounters.seals[seal], &plan, &inside),
            SealKind::Holdfast => self.keep_holdfast(encounters, seal, &plan, &standing),
        };
        if done {
            self.break_seal(encounters, seal);
        }
    }

    /// A Litany's tick: a rune newly stepped on is the next in order and stays lit, or is wrong, when every rune goes
    /// dark, the show starts again after its pause and two of the dungeon's foes wake. Broken once every rune is lit.
    fn keep_litany(
        &mut self,
        encounters: &mut Encounters,
        seal: usize,
        plan: &SealPlan,
        standing: &[[f64; 3]],
    ) -> bool {
        let on: Vec<bool> =
            plan.pieces.iter().map(|&rune| standing.iter().any(|&at| near(at, rune) <= RUNE_REACH_M)).collect();
        let found = &mut encounters.seals[seal];
        let newly: Vec<usize> = (0..on.len()).filter(|&rune| on[rune] && !found.on[rune]).collect();
        found.on = on;
        let mut wrong = false;
        for rune in newly {
            let stepped = usize::try_from(found.held).unwrap_or(usize::MAX);
            if rune == stepped {
                found.held += 1;
            } else if rune > stepped {
                (found.held, found.shown_from, wrong) = (0, self.clock + LITANY_PAUSE_TICKS, true);
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
    /// (`plate_linger`); a wave at its doorways every WEIGHING_WAVE_TICKS. Broken once held WEIGHING_TICKS in all.
    fn keep_weighing(
        &mut self,
        encounters: &mut Encounters,
        seal: usize,
        plan: &SealPlan,
        standing: &[[f64; 3]],
    ) -> bool {
        let (in_play, clock) = (plates_for(self.players.len()), self.clock);
        let linger = plate_linger(self.players.len(), &plan.pieces);
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
        self.wave_when_due(encounters, seal, plan, WEIGHING_WAVE_TICKS);
        encounters.seals[seal].held >= WEIGHING_TICKS
    }

    /// A Holdfast's tick: held while a living player stands in the relic's ring; each living foe in it drains the
    /// relic, and a drained relic halves what was held and stands whole again; a wave every HOLDFAST_WAVE_TICKS.
    /// Broken once held HOLDFAST_TICKS in all.
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
            .filter(|foe| near([foe.fighter.body.x, foe.fighter.body.y, 0.0], relic) <= ring)
            .count();
        let found = &mut encounters.seals[seal];
        found.on = vec![held];
        if held {
            found.held += 1;
        }
        found.relic -= draining as f64 * RELIC_DRAIN;
        let drained = found.relic <= 0.0;
        if drained {
            (found.held, found.relic) = (found.held / 2, 1.0);
        }
        if drained {
            self.tell_all(EventKind::RelicDrained, seal as f64);
        }
        self.wave_when_due(encounters, seal, plan, HOLDFAST_WAVE_TICKS);
        encounters.seals[seal].held >= HOLDFAST_TICKS
    }

    /// A wave at the seal room's doorways once it is due, the next `every` ticks on.
    fn wave_when_due(&mut self, encounters: &mut Encounters, seal: usize, plan: &SealPlan, every: u64) {
        if self.clock < encounters.seals[seal].next_wave {
            return;
        }
        encounters.seals[seal].next_wave = self.clock + every;
        let doors = Self::doorways_of(plan);
        self.stand_seal_wave(encounters, Some(seal), &doors);
    }

    /// Where a seal's foes come in: its room's doorways, or its pieces where it has none.
    fn doorways_of(plan: &SealPlan) -> Vec<[f64; 2]> {
        if plan.doors.is_empty() {
            plan.pieces.iter().map(|piece| [piece[0], piece[1]]).collect()
        } else {
            plan.doors.clone()
        }
    }

    /// Once a second, the drowned floor takes DROWNED_SHARE of their health from every living player standing on it.
    fn drown(&mut self, plan_of: &crate::encounter_plan::EncounterPlan, plan: &SealPlan) {
        if !self.clock.is_multiple_of(DROWNED_EVERY) {
            return;
        }
        let wet: Vec<PlayerId> = self
            .players_in(plan_of, &plan.drowned)
            .into_iter()
            .filter(|&(_, at, grounded)| grounded && at[2] < WET_M)
            .map(|(id, _, _)| id)
            .collect();
        for player in wet {
            self.harm_share(player, DROWNED_SHARE, 0);
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

    /// A seal's pieces' marks: a Litany's runes 2 stepped in order, 1 showing, 0 dark; any other's pieces in play 1
    /// stood on or 0.
    pub(crate) fn seal_marks(&self, plan: &SealPlan, seal: &Seal) -> Vec<u8> {
        match plan.kind {
            SealKind::Litany => {
                let showing = (seal.state == SealState::Running && seal.held == 0)
                    .then(|| showing(self.clock, seal.shown_from, plan.pieces.len()))
                    .flatten();
                (0..plan.pieces.len())
                    .map(|rune| match () {
                        () if (rune as u64) < seal.held || seal.state == SealState::Broken => 2,
                        () if showing == Some(rune) => 1,
                        () => 0,
                    })
                    .collect()
            }
            SealKind::Weighing => {
                let in_play = plates_for(self.players.len());
                (0..in_play).map(|plate| u8::from(seal.on.get(plate).copied().unwrap_or(false))).collect()
            }
            SealKind::Ascent | SealKind::Holdfast => vec![u8::from(seal.on.first().copied().unwrap_or(false))],
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

/// An Ascent's tick: its stone held while a living player stands on the top pad. Broken once held STONE_TICKS in all.
fn keep_ascent(seal: &mut Seal, plan: &SealPlan, inside: &[(PlayerId, [f64; 3], bool)]) -> bool {
    let Some(top) = plan.pads.last() else { return true };
    let on = inside.iter().any(|&(_, [x, y, z], grounded)| {
        grounded && (z - top.top).abs() < WET_M && x >= top.min_x && x <= top.max_x && y >= top.min_y && y <= top.max_y
    });
    seal.on = vec![on];
    if on {
        seal.held += 1;
    }
    seal.held >= STONE_TICKS
}

#[cfg(test)]
#[path = "seals_tests.rs"]
pub(crate) mod seals_tests;
