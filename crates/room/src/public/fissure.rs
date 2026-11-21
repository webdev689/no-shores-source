//! The Fissure: the ground splits open and the Lattice pour out of it in waves. Each Lattice foe of the event that
//! falls drops a crystal shard where it fell (an Elite or greater two); a player walks over one to take it, carries one
//! at a time to the fissure's lip and sets it, and the seal grows. A shard on the ground fades after SHARD_TICKS; a
//! carrier who falls drops theirs. Sealed, the fissure closes with a burst that shatters every Lattice foe of it.
//! Heroic: at HEROIC_AT_PERCENT of the seal a crystal growth rises near it for GROWTH_TICKS; broken in time, more
//! shards are needed, every wave holds an Elite, and the last push brings out the Warden, who must fall to win.

use super::{Heroic, Play, Public, Running};
use crate::{EventKind, PlayerId, Room};
use ::foes::Rank;
use ::foes::Rank::{Elite, Major, Miniboss, Minor};
use ::foes::roster::{BULWARK, FLICKER, HUSK, IDOL, RAVAGER};
use combat::fighter::{Action, FighterId};
use combat::sight::apart;
use core::f64::consts::TAU;
use std::collections::BTreeMap;

/// A shard lies this long; a player takes one within this reach, across and up; sets it within this of the middle.
pub const SHARD_TICKS: u64 = 30 * 60;
pub const SHARD_REACH: f64 = 1.5;
const SHARD_HEIGHT: f64 = 2.0;
pub const LIP_REACH: f64 = 6.0;
/// Shards needed: this many, this many more for each player at the event beyond the first, at most this many.
pub const SHARDS_FIRST: u16 = 8;
pub const SHARDS_PER_PLAYER: u16 = 3;
pub const SHARDS_MOST: u16 = 30;
/// The growth rises at this share of the seal, stands this long, and takes this long to rise and to sink.
pub const HEROIC_AT_PERCENT: u32 = 40;
pub const GROWTH_TICKS: u64 = 45 * 60;
pub const GROWTH_EASE: u64 = 2 * 60;
/// A wave comes when the event's living foes fall to WAVE_LOW, or WAVE_EVERY after the last, while fewer than
/// LIVING_MOST stand; it holds WAVE_SIZE foes and one more for each player on the ground beyond the first, to
/// WAVE_MOST. Its foes pour out this far round the middle.
const WAVE_LOW: usize = 2;
const WAVE_EVERY: u64 = 30 * 60;
const LIVING_MOST: usize = 10;
const WAVE_SIZE: usize = 3;
const WAVE_MOST: usize = 6;
const POUR_OUT: f64 = 4.0;
const WAVE: [(u8, Rank); 6] =
    [(HUSK, Minor), (HUSK, Major), (FLICKER, Minor), (FLICKER, Major), (IDOL, Major), (RAVAGER, Major)];
/// The heroic task's growth, the Warden and their names over their bars.
const GROWTH: (u8, Rank) = (IDOL, Elite);
pub const GROWTH_NAME: &str = "Crystal Growth";
pub const WARDEN_NAME: &str = "The Warden of the Fissure";

/// A shard on the ground: its number, where it lies, the tick it fades.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Shard {
    pub id: u32,
    pub at: [f64; 3],
    pub until: u64,
}

/// A Fissure as it plays: its middle and its growth's spot, the shards set and the most players seen at it at once,
/// the shards added by its heroic turn, those lying and those carried (by whom, and where they last stood), its
/// growth and the tick it rose, its Warden, and its waves so far and the tick of the last.
#[derive(Debug)]
pub(crate) struct Fissure {
    pub at: [f64; 3],
    pub growth_spot: [f64; 3],
    pub set: u16,
    pub players_most: u16,
    pub heroic_more: u16,
    pub shards: Vec<Shard>,
    pub next_shard: u32,
    pub carried: BTreeMap<PlayerId, [f64; 3]>,
    pub growth: Option<FighterId>,
    pub growth_at: u64,
    pub warden: Option<FighterId>,
    pub waves: u32,
    pub last_wave: u64,
}

impl Fissure {
    /// The shards needed to seal it.
    #[must_use]
    pub fn needed(&self) -> u16 {
        let more = SHARDS_PER_PLAYER * self.players_most.saturating_sub(1);
        (SHARDS_FIRST + more).min(SHARDS_MOST) + self.heroic_more
    }
}

impl Room {
    pub(crate) fn fissure_of(&self, ground: &super::FissureGround) -> Fissure {
        Fissure {
            at: self.on_ground(ground.at),
            growth_spot: self.on_ground(ground.growth),
            set: 0,
            players_most: 1,
            heroic_more: 0,
            shards: Vec::new(),
            next_shard: 1,
            carried: BTreeMap::new(),
            growth: None,
            growth_at: 0,
            warden: None,
            waves: 0,
            last_wave: 0,
        }
    }

    /// The fissure opens and its first wave pours out.
    pub(crate) fn begin_fissure(&mut self, public: &Public, running: &mut Running) {
        let Play::Fissure(mut fissure) = core::mem::replace(&mut running.play, Play::Aside) else { return };
        self.fissure_wave(public, running, &mut fissure);
        running.play = Play::Fissure(fissure);
    }

    /// One tick of the Fissure.
    pub(crate) fn play_fissure(&mut self, public: &Public, running: &mut Running) {
        let Play::Fissure(mut fissure) = core::mem::replace(&mut running.play, Play::Aside) else { return };
        let (middle, radius) = self.ground_of(public, running.kind);
        let here = self.players.values().filter(|player| {
            !player.fighter.dead() && apart([player.fighter.body.x, player.fighter.body.y], middle) <= radius
        });
        fissure.players_most = fissure.players_most.max(u16::try_from(here.count()).unwrap_or(u16::MAX));
        self.fissure_kills(running, &mut fissure);
        self.carry_shards(running, &mut fissure);
        self.keep_growth(running, &mut fissure);
        let sealed = fissure.set >= fissure.needed();
        if sealed && running.heroic == Heroic::Met && fissure.warden.is_none() {
            self.raise_warden(public, running, &mut fissure);
        } else if fissure.warden.is_none() && !sealed {
            let living = running.foes.iter().filter(|id| self.foes.get(id).is_some_and(|foe| !foe.fighter.dead()));
            let living = living.count();
            let due = living <= WAVE_LOW || self.clock >= fissure.last_wave + WAVE_EVERY;
            if due && living < LIVING_MOST {
                self.fissure_wave(public, running, &mut fissure);
            }
        }
        let warden_fell = fissure.warden.is_some_and(|id| self.foes.get(&id).is_none_or(|foe| foe.fighter.dead()));
        if running.bonus && running.ticks_left * 2 < super::COUNTDOWN_TICKS {
            running.bonus = false;
        }
        let won = (sealed && running.heroic != Heroic::Met) || warden_fell;
        if won {
            self.win(public, running);
            self.shatter(running, &mut fissure);
        }
        running.play = Play::Fissure(fissure);
    }

    /// Each of the event's Lattice foes killed this tick drops its shards where it fell; the growth broken turns the
    /// event heroic.
    fn fissure_kills(&mut self, running: &mut Running, fissure: &mut Fissure) {
        for (killer, foe, at) in self.killed_now(running) {
            if Some(foe) == fissure.growth {
                self.inert.remove(&foe);
                if running.heroic == Heroic::Offered {
                    running.heroic = Heroic::Met;
                    running.heroic_ticks = 0;
                    running.stages = 2;
                    fissure.heroic_more = fissure.needed().saturating_sub(fissure.set) / 2;
                    self.tell(EventKind::HeroicMet, None, killer, foe, f64::from(running.kind as u8));
                }
                continue;
            }
            let rank = self.foes.get(&foe).map_or(Minor, |found| found.brain.rank);
            for nth in 0..if rank >= Elite { 2 } else { 1 } {
                let place = [at[0] + f64::from(nth), at[1], at[2]];
                let place = self.nav.nearest_point(place).unwrap_or(at);
                fissure.shards.push(Shard { id: fissure.next_shard, at: place, until: self.clock + SHARD_TICKS });
                fissure.next_shard += 1;
            }
        }
    }

    /// Shards fade, a fallen or departed carrier's drops where they last stood, a player takes one they walk over and
    /// sets one they carry to the lip.
    fn carry_shards(&mut self, running: &mut Running, fissure: &mut Fissure) {
        let clock = self.clock;
        fissure.shards.retain(|shard| shard.until > clock);
        for (player, last) in core::mem::take(&mut fissure.carried) {
            let standing = self.players.get(&player).filter(|found| !found.fighter.dead());
            if let Some(found) = standing {
                let body = found.fighter.body;
                fissure.carried.insert(player, [body.x, body.y, body.z]);
            } else {
                let at = self.nav.nearest_point(last).unwrap_or(last);
                fissure.shards.push(Shard { id: fissure.next_shard, at, until: clock + SHARD_TICKS });
                fissure.next_shard += 1;
            }
        }
        let walkers: Vec<(PlayerId, [f64; 3])> = self
            .players
            .iter()
            .filter(|(_, found)| !found.fighter.dead())
            .map(|(id, found)| (*id, [found.fighter.body.x, found.fighter.body.y, found.fighter.body.z]))
            .collect();
        for (player, at) in walkers {
            if fissure.carried.contains_key(&player) {
                if apart([at[0], at[1]], [fissure.at[0], fissure.at[1]]) <= LIP_REACH {
                    fissure.carried.remove(&player);
                    fissure.set += 1;
                    running.parts.entry(player).or_default().did = true;
                    self.tell(EventKind::ShardSet, None, player, 0, f64::from(fissure.set));
                }
                continue;
            }
            let near = |shard: &Shard| {
                apart([at[0], at[1]], [shard.at[0], shard.at[1]]) <= SHARD_REACH
                    && (at[2] - shard.at[2]).abs() <= SHARD_HEIGHT
            };
            if let Some(taken) = fissure.shards.iter().position(near) {
                let shard = fissure.shards.remove(taken);
                fissure.carried.insert(player, at);
                self.tell(EventKind::ShardTaken, None, player, 0, f64::from(shard.id));
            }
        }
    }

    /// The growth rises once the seal reaches HEROIC_AT_PERCENT, and sinks back unbroken once its time is up.
    fn keep_growth(&mut self, running: &mut Running, fissure: &mut Fissure) {
        let reached = u32::from(fissure.set) * 100 >= HEROIC_AT_PERCENT * u32::from(fissure.needed());
        if running.heroic == Heroic::NotYet && reached {
            let facing = combat::sight::bearing(
                [fissure.growth_spot[0], fissure.growth_spot[1]],
                [fissure.at[0], fissure.at[1]],
            );
            let home = (fissure.growth_spot, 0);
            if let Some(id) = self.stand_event_foe(running, GROWTH, (fissure.growth_spot, facing), home) {
                self.inert.insert(id);
                self.names.insert(id, GROWTH_NAME);
                (fissure.growth, fissure.growth_at) = (Some(id), self.clock);
                (running.heroic, running.heroic_ticks) = (Heroic::Offered, GROWTH_TICKS);
                if let Some(foe) = self.foes.get_mut(&id) {
                    foe.fighter.action = Action::Idle;
                }
            }
            return;
        }
        if running.heroic != Heroic::Offered {
            return;
        }
        running.heroic_ticks = running.heroic_ticks.saturating_sub(1);
        if running.heroic_ticks == 0 {
            if let Some(id) = fissure.growth.take() {
                self.gone(id);
            }
            running.heroic = Heroic::Missed;
            self.tell(EventKind::HeroicMissed, None, 0, 0, f64::from(running.kind as u8));
        }
    }

    /// A wave pours out of the fissure: drawn from the Lattice's lesser foes, one an Elite once the event is heroic,
    /// each round the middle facing out, at home there and hunting the nearest player.
    fn fissure_wave(&mut self, public: &Public, running: &mut Running, fissure: &mut Fissure) {
        fissure.waves += 1;
        fissure.last_wave = self.clock;
        let (nth, at, players) = (fissure.waves, fissure.at, usize::from(fissure.players_most));
        let mut draws = self.wave_draws(running, nth);
        let size = (WAVE_SIZE + players.saturating_sub(1)).min(WAVE_MOST);
        let mut members: Vec<(u8, Rank)> =
            (0..size).map(|_| WAVE[((draws.draw() * WAVE.len() as f64) as usize).min(WAVE.len() - 1)]).collect();
        if running.heroic == Heroic::Met {
            members[0] = if nth % 2 == 0 { (BULWARK, Elite) } else { (RAVAGER, Elite) };
        }
        let start = draws.draw() * TAU;
        for (turn, member) in members.into_iter().enumerate() {
            let facing = start + TAU * turn as f64 / size as f64;
            let place = [at[0] + libm::sin(facing) * POUR_OUT, at[1] - libm::cos(facing) * POUR_OUT, at[2]];
            self.stand_event_foe(running, member, (place, facing), (at, public.level));
        }
    }

    /// The seal complete on a heroic Fissure: its last push brings out the Warden.
    fn raise_warden(&mut self, public: &Public, running: &mut Running, fissure: &mut Fissure) {
        let at = fissure.at;
        let place = [at[0], at[1] - POUR_OUT, at[2]];
        if let Some(id) = self.stand_event_foe(running, (BULWARK, Miniboss), (place, 0.0), (at, public.level)) {
            self.names.insert(id, WARDEN_NAME);
            fissure.warden = Some(id);
            running.stage = 2;
            self.tell(EventKind::PublicStage, None, 0, id, 2.0);
        }
    }

    /// The fissure closes with a burst: every Lattice foe of it still standing shatters, sharing no kill.
    fn shatter(&mut self, running: &mut Running, fissure: &mut Fissure) {
        let standing: Vec<FighterId> = running
            .foes
            .iter()
            .copied()
            .filter(|id| self.foes.get(id).is_some_and(|foe| !foe.fighter.dead()))
            .collect();
        for id in standing {
            self.inert.remove(&id);
            running.fallen.insert(id);
            if let Some(foe) = self.foes.get_mut(&id) {
                foe.fighter.health = 0.0;
                foe.fighter.action = Action::Dead { elapsed: 0 };
            }
            self.board.forget(id);
            self.tell(EventKind::Killed, None, 0, id, 0.0);
        }
        fissure.shards.clear();
        fissure.carried.clear();
    }
}
