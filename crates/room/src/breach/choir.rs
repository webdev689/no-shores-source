//! The Choir, the Drowned Vale's third encounter, after the Vault of Glass's Oracles and Templar, in the chapel of a
//! vale that never had one. First the Choir: rounds of three, four, five, six and seven bells of its seven, each
//! waking in turn with its own note, then ringing together a while after the last; broken in the order they woke they
//! fall silent, and one broken out of order rings at once. A ring Rewrites every living player of the company, and the
//! Rewritten are unwritten a while later unless they stand in the font's light, which rests a while after it cleanses,
//! or in the Lodestone's. Then the Scrivener: warded at its desk until the Lodestone is grounded beside it; every so
//! often it marks another desk and writes itself there, unless a player stands on that desk's step and blots it; every
//! so often it writes, unwriting every Rewritten player; and a bell wakes between, ringing as the Choir's do.

use super::{Breach, CHOIR};
use crate::{EventKind, PlayerId, Room};
use ::foes::Rank;
use ::foes::roster::{BELL, BULWARK, FLICKER, HUSK, SCRIVENER};
use combat::fighter::FighterId;
use combat::sight::apart;

/// The bells of each of the Choir's rounds.
pub const ROUNDS: [usize; 5] = [3, 4, 5, 6, 7];
/// How long apart the bells of a round wake, and how long after the last they ring, ticks: Normal, Hard.
pub const WAKE_APART: (u64, u64) = (60, 42);
pub const RING_AFTER: (u64, u64) = (8 * 60, 6 * 60);
/// How long between rounds, and before a round failed is tried again, ticks.
pub const BETWEEN: u64 = 4 * 60;
/// How long a mark made in the Choir lasts before it unwrites, ticks.
pub const MARK_LASTS: u64 = 20 * 60;
/// The font: how near it a body is cleansed, metres, and how long it rests after, ticks: longer than a mark lasts, so a
/// second ring before it is lit again unwrites.
pub const FONT_REACH_M: f64 = 2.5;
pub const FONT_REST: u64 = 25 * 60;
/// Once it first cleanses, the font stays lit this long for the rest of the Rewritten to reach it, then rests.
pub const FONT_LIT: u64 = 3 * 60;
/// A bell's health against a Brute Minor's: three blows of a sword, so a round is won by its order, not its harm.
pub const BELL_HEALTH: f64 = 0.5;
/// The Scrivener: how often it marks a desk, how long the mark shows, how often it writes, how often a bell wakes, and
/// when its Fury begins, ticks; and how near a desk's middle a body blots it, metres.
pub const MARK_EVERY: u64 = 25 * 60;
pub const MARK_SHOWS: u64 = 4 * 60;
pub const WRITE_EVERY: u64 = 30 * 60;
pub const BELL_EVERY: u64 = 20 * 60;
pub const FURY_AFTER: u64 = 8 * 60 * 60;
pub const BLOT_REACH_M: f64 = 1.8;
/// What the Scrivener's health is times past the company's match: a company of eight fights it a minute and a half,
/// so its bells, marks and writings come round.
pub const SCRIVENER_TIMES: f64 = 6.0;
const DRAWS: u64 = 0x0063_686f_6972;

/// The Choir as it stands.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Choir {
    /// 0 before it begins, 1 the Choir's rounds, 2 the Scrivener.
    pub phase: u8,
    pub round: usize,
    /// The round's bells by their places, in waking order; when each woke (none yet); its bells standing by place.
    pub order: Vec<usize>,
    pub woke: Vec<Option<u64>>,
    pub bells: Vec<(usize, FighterId)>,
    pub broken: usize,
    pub round_from: u64,
    pub ring_at: Option<u64>,
    pub font_rests_until: u64,
    /// While the font stays lit after its first cleanse.
    pub font_lit_until: u64,
    pub scrivener: Option<FighterId>,
    /// The Scrivener's health held while warded, and its desk.
    pub warded: Option<f64>,
    pub desk: usize,
    /// The desk it means to write itself to and when it marked it.
    pub marked_desk: Option<(usize, u64)>,
    pub moved: bool,
    pub phase_from: u64,
    pub next_mark: u64,
    pub next_write: u64,
    pub next_bell: u64,
    pub waves: usize,
}

impl Room {
    pub(crate) fn keep_choir(&mut self, breach: &mut Breach) {
        let clock = self.clock;
        let mut fight = std::mem::take(&mut breach.fights.choir);
        if fight.phase == 0 {
            fight = Choir { phase: 1, round_from: clock + 2 * 60, ..Choir::default() };
        }
        self.keep_font(breach, &mut fight);
        self.keep_marks_in_choir(breach, &fight);
        if fight.phase == 1 {
            self.keep_rounds(breach, &mut fight);
        } else {
            self.keep_scrivener(breach, &mut fight);
        }
        let won = fight.phase == 2 && fight.scrivener.is_some_and(|id| !self.standing_foe(id));
        let page = !fight.moved;
        breach.fights.choir = fight;
        if won {
            if page {
                breach.chests.insert(1);
            }
            self.win_encounter(breach, CHOIR);
        }
    }

    /// The font cleanses every Rewritten player standing in its light while it is lit: from its first cleanse it
    /// stays lit FONT_LIT for the rest of the company to reach it, then rests, FONT_REST from that first cleanse.
    fn keep_font(&mut self, breach: &mut Breach, fight: &mut Choir) {
        let Some((font, _)) = breach.plan.socket("choir", "font") else { return };
        let lit = self.clock < fight.font_lit_until;
        if self.clock < fight.font_rests_until && !lit {
            return;
        }
        let cleansed: Vec<PlayerId> = breach
            .marked
            .keys()
            .copied()
            .filter(|id| {
                self.players.get(id).is_some_and(|found| {
                    found.living()
                        && apart([found.fighter.body.x, found.fighter.body.y], [font[0], font[1]]) <= FONT_REACH_M
                })
            })
            .collect();
        if cleansed.is_empty() {
            return;
        }
        if !lit {
            (fight.font_lit_until, fight.font_rests_until) = (self.clock + FONT_LIT, self.clock + FONT_REST);
        }
        for id in cleansed {
            breach.marked.remove(&id);
            self.tell(EventKind::Cleansed, None, 0, id, 1.0);
        }
    }

    /// In the Choir's rounds a mark unwrites its player once it has lasted MARK_LASTS.
    fn keep_marks_in_choir(&mut self, breach: &mut Breach, fight: &Choir) {
        if fight.phase != 1 {
            return;
        }
        let clock = self.clock;
        let due: Vec<PlayerId> =
            breach.marked.iter().filter(|(_, at)| clock >= **at + MARK_LASTS).map(|(id, _)| *id).collect();
        for id in due {
            breach.marked.remove(&id);
            self.harm_share(id, 4.0, 0);
            self.tell_all(EventKind::Unwritten, 1.0);
        }
    }

    /// A round's bells wake in turn, then ring; each broken is judged against the order; a round rung or broken out of
    /// order Rewrites the chapel and is tried again; the fifth won wakes the Scrivener.
    fn keep_rounds(&mut self, breach: &mut Breach, fight: &mut Choir) {
        let clock = self.clock;
        let hard = breach.tier == gear::breach::Tier::Hard;
        let (apart_ticks, ring_after) = if hard { (WAKE_APART.1, RING_AFTER.1) } else { (WAKE_APART.0, RING_AFTER.0) };
        if fight.order.is_empty() {
            if clock < fight.round_from {
                return;
            }
            fight.order = self.drawn_bells(breach, ROUNDS[fight.round], fight.round as u64 + fight.round_from);
            fight.woke = vec![None; fight.order.len()];
            fight.broken = 0;
            // A wave comes from the chapel's mouths as the round wakes, so the whole company has work.
            let mouths: Vec<[f64; 3]> = breach.plan.numbered("choir", "mouth").iter().map(|(at, _)| *at).collect();
            self.breach_wave(breach, "choir", &[(HUSK, Rank::Major), (FLICKER, Rank::Minor)], &mouths, fight.waves);
            fight.waves += 1;
        }
        let places = breach.plan.numbered("choir", "bell");
        for nth in 0..fight.order.len() {
            if fight.woke[nth].is_none() && clock >= fight.round_from + apart_ticks * nth as u64 {
                fight.woke[nth] = Some(clock);
                let place = fight.order[nth];
                if let Some(id) = places.get(place).and_then(|(at, _)| self.stand_bell(breach, *at)) {
                    fight.bells.push((place, id));
                }
                self.tell_all(EventKind::BellWoke, place as f64);
            }
        }
        if fight.woke.iter().all(Option::is_some) && fight.ring_at.is_none() {
            fight.ring_at = Some(clock + ring_after);
        }
        let mut wrong = false;
        for (place, id) in fight.bells.clone() {
            if self.standing_foe(id) {
                continue;
            }
            fight.bells.retain(|(_, bell)| *bell != id);
            let next = fight.order.get(fight.broken).copied();
            if next == Some(place) && fight.woke.get(fight.broken).is_some_and(Option::is_some) {
                fight.broken += 1;
                self.tell_all(EventKind::BellBroken, place as f64);
            } else {
                wrong = true;
            }
        }
        if fight.broken == fight.order.len() {
            fight.round += 1;
            (fight.order, fight.ring_at, fight.round_from) = (Vec::new(), None, clock + BETWEEN);
            self.tell_all(EventKind::BreachStage, fight.round as f64);
            if fight.round == ROUNDS.len() {
                self.wake_scrivener(breach, fight);
            }
        } else if wrong || fight.ring_at.is_some_and(|at| clock >= at) {
            self.ring(breach, fight);
            (fight.order, fight.ring_at, fight.round_from) = (Vec::new(), None, clock + BETWEEN);
        }
    }

    /// The round's bells ring: every living player of the company is Rewritten, wherever they stand, and the bells
    /// still standing are gone.
    fn ring(&mut self, breach: &mut Breach, fight: &mut Choir) {
        for (_, id) in std::mem::take(&mut fight.bells) {
            if self.foes.contains_key(&id) {
                self.gone(id);
            }
        }
        self.tell_all(EventKind::BellRang, 0.0);
        let company: Vec<PlayerId> = self.players.keys().copied().collect();
        for id in company {
            self.rewrite(breach, id);
        }
    }

    /// A bell at its frame, never moving or striking, at BELL_HEALTH.
    fn stand_bell(&mut self, breach: &mut Breach, at: [f64; 3]) -> Option<FighterId> {
        let id = self.stand_breach_foe(breach, (BELL, Rank::Minor), at, None)?;
        self.make_walker(id);
        if let Some(foe) = self.foes.get_mut(&id) {
            (foe.fighter.health, foe.fighter.health_max) =
                (foe.fighter.health * BELL_HEALTH, foe.fighter.health_max * BELL_HEALTH);
        }
        Some(id)
    }

    /// `count` different bell places of seven, drawn for this round and this attempt.
    fn drawn_bells(&self, breach: &Breach, count: usize, salt: u64) -> Vec<usize> {
        let places = breach.plan.numbered("choir", "bell").len().max(count);
        let seed = self.world_seed ^ DRAWS ^ salt.rotate_left(21);
        let mut draws = naval::random::Mulberry32::new((seed ^ (seed >> 32)) as u32);
        let mut pool: Vec<usize> = (0..places).collect();
        for at in (1..pool.len()).rev() {
            let pick = (draws.draw() * (at + 1) as f64) as usize;
            pool.swap(at, pick.min(at));
        }
        pool.truncate(count);
        pool
    }

    /// A blow on the Scrivener as it lands (`settle`): while warded it holds the health its ward holds and is never
    /// felled, however heavy the blow, as an Elite Dungeon's Boss holds its ward (`warded`).
    pub(crate) fn scrivener_warded(&self, id: FighterId, after: combat::Fighter) -> combat::Fighter {
        let Some(fight) = self.breach.as_ref().map(|breach| &breach.fights.choir) else { return after };
        match fight.warded.filter(|_| fight.scrivener == Some(id)) {
            Some(held) => {
                let action = if after.dead() { combat::Action::Idle } else { after.action };
                combat::Fighter { health: held, action, ..after }
            }
            None => after,
        }
    }

    /// The Scrivener stands at the altar's desk, warded; the Lodestone stands on its plinth, needed.
    pub(crate) fn wake_scrivener(&mut self, breach: &mut Breach, fight: &mut Choir) {
        let clock = self.clock;
        let Some((at, _)) = breach.plan.socket("choir", "lectern-1") else { return };
        let scrivener = self.stand_breach_foe(breach, (SCRIVENER, Rank::Boss), at, Some("The Scrivener"));
        if let Some(id) = scrivener {
            self.match_company(breach, id, false, SCRIVENER_TIMES);
            fight.warded = self.foes.get(&id).map(|foe| foe.fighter.health);
        }
        (fight.phase, fight.scrivener, fight.desk, fight.phase_from) = (2, scrivener, 0, clock);
        (fight.next_mark, fight.next_write, fight.next_bell) =
            (clock + MARK_EVERY, clock + WRITE_EVERY, clock + BELL_EVERY);
        self.set_on_plinth(breach, "choir", true);
        self.tell_all(EventKind::BossWoke, 0.0);
    }

    /// The Scrivener's rules: its ward held, its desks marked and blotted or written to, its writings, its bells, and
    /// its Fury.
    fn keep_scrivener(&mut self, breach: &mut Breach, fight: &mut Choir) {
        let clock = self.clock;
        let Some(id) = fight.scrivener.filter(|id| self.standing_foe(*id)) else { return };
        if let (Some(held), Some(foe)) = (fight.warded, self.foes.get_mut(&id)) {
            foe.fighter.health = held;
        }
        let fury = clock >= fight.phase_from + FURY_AFTER;
        let desks = breach.plan.numbered("choir", "lectern");
        if fight.marked_desk.is_none() && clock >= fight.next_mark && desks.len() > 1 {
            let other = (fight.desk + 1 + (clock / MARK_EVERY) as usize % (desks.len() - 1)) % desks.len();
            fight.marked_desk = Some((other, clock));
            self.tell_all(EventKind::DeskMarked, other as f64);
        }
        if let Some((desk, _)) = fight.marked_desk.filter(|(_, from)| clock >= from + MARK_SHOWS) {
            fight.marked_desk = None;
            fight.next_mark = clock + MARK_EVERY;
            let (at, _) = desks[desk];
            let blotted = self.in_space(breach, "choir").into_iter().any(|player| {
                self.players.get(&player).is_some_and(|found| {
                    apart([found.fighter.body.x, found.fighter.body.y], [at[0], at[1]]) <= BLOT_REACH_M
                })
            });
            if blotted {
                self.tell_all(EventKind::Blotted, desk as f64);
                let mouths: Vec<[f64; 3]> = breach.plan.numbered("choir", "mouth").iter().map(|(at, _)| *at).collect();
                let hard = breach.tier == gear::breach::Tier::Hard;
                let kinds: &[(u8, Rank)] =
                    if hard { &[(BULWARK, Rank::Elite), (HUSK, Rank::Major)] } else { &[(HUSK, Rank::Major)] };
                self.breach_wave(breach, "choir", kinds, &mouths, fight.waves);
                fight.waves += 1;
            } else {
                self.write_itself(id, at);
                fight.desk = desk;
                fight.moved = true;
                fight.warded = self.foes.get(&id).map(|foe| foe.fighter.health);
            }
        }
        if clock >= fight.next_write {
            fight.next_write = clock + WRITE_EVERY;
            self.write(breach, id);
        }
        let bell_every = if fury { BELL_EVERY / 2 } else { BELL_EVERY };
        if clock >= fight.next_bell {
            fight.next_bell = clock + bell_every;
            self.wake_lone_bells(breach, fight);
        }
        self.keep_lone_bells(breach, fight);
    }

    /// The Scrivener writes itself to a desk: it stands there, its ward back up.
    fn write_itself(&mut self, id: FighterId, at: [f64; 3]) {
        if let Some(foe) = self.foes.get_mut(&id) {
            (foe.fighter.body.x, foe.fighter.body.y, foe.fighter.body.z) = (at[0], at[1], at[2]);
            foe.brain.posted_at(at, foe.fighter.body.facing);
        }
        self.tell_all(EventKind::WroteItself, 0.0);
    }

    /// Between its writings a bell wakes (two at Hard), ringing as the Choir's do unless broken.
    fn wake_lone_bells(&mut self, breach: &mut Breach, fight: &mut Choir) {
        let count = if breach.tier == gear::breach::Tier::Hard { 2 } else { 1 };
        let places = breach.plan.numbered("choir", "bell");
        let taken: Vec<usize> = fight.bells.iter().map(|(place, _)| *place).collect();
        let free: Vec<usize> = self
            .drawn_bells(breach, places.len(), self.clock)
            .into_iter()
            .filter(|place| !taken.contains(place))
            .take(count)
            .collect();
        for place in free {
            if let Some(id) = places.get(place).and_then(|(at, _)| self.stand_bell(breach, *at)) {
                fight.bells.push((place, id));
                self.tell_all(EventKind::BellWoke, place as f64);
            }
        }
        let ring_after = if breach.tier == gear::breach::Tier::Hard { RING_AFTER.1 } else { RING_AFTER.0 };
        fight.ring_at = Some(self.clock + ring_after);
    }

    /// The Scrivener's bells: those broken are gone, and once their time is up the rest ring.
    fn keep_lone_bells(&mut self, breach: &mut Breach, fight: &mut Choir) {
        for (place, id) in fight.bells.clone() {
            if !self.standing_foe(id) {
                fight.bells.retain(|(_, bell)| *bell != id);
                self.tell_all(EventKind::BellBroken, place as f64);
            }
        }
        if fight.bells.is_empty() {
            fight.ring_at = None;
        } else if fight.ring_at.is_some_and(|at| self.clock >= at) {
            fight.ring_at = None;
            self.ring(breach, fight);
        }
    }

    /// The Lodestone grounded within reach of the Scrivener breaks its ward until it next writes itself elsewhere.
    pub(crate) fn ground_scrivener(&mut self, breach: &mut Breach, at: [f64; 3]) -> bool {
        let fight = &mut breach.fights.choir;
        let Some(id) = fight.scrivener.filter(|_| fight.warded.is_some()) else { return false };
        let Some(foe) = self.foes.get(&id) else { return false };
        let body = foe.fighter.body;
        if apart([body.x, body.y], [at[0], at[1]]) > super::lodestone::GROUND_REACH_M {
            return false;
        }
        fight.warded = None;
        self.tell_all(EventKind::WardBroken, 0.0);
        true
    }
}
