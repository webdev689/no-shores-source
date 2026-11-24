//! The Steward, the Drowned Vale's last encounter, after the Vault of Glass's Atheon, on the round court over the
//! dark. On a fixed measure it takes four living players of the company (half, fewer when fewer stand) into a shore,
//! what was and what is in turn, and Rewrites them, losing first any still away from its last taking; it tolls on a
//! shorter measure from each taking, unwriting the Rewritten. In the shore five bells wake, their order shown only in
//! the court over that rift's mooring; broken in order, the way back opens while the court holds the mooring (two at
//! Hard if two are there; with none there, the bells alone open it). Grounded at its feet once a taking, the Lodestone
//! lays it bare: blows on it weigh five times, and Arts recharge three times as fast. After its fourth taking, when the
//! next would come it unwrites the whole company, and on each toll's measure after. Its fall brings back any away.

use super::{Breach, STEWARD};
use crate::{EventKind, PlayerId, Room};
use ::foes::Rank;
use ::foes::roster::{BELL, FLICKER, HUSK, RAVAGER, STEWARD as STEWARD_TYPE};
use combat::fighter::FighterId;
use combat::sight::apart;

/// How long after it wakes it first takes, and how often after: Normal, Hard, ticks.
pub const FIRST_TAKING: u64 = 25 * 60;
pub const TAKING_EVERY: (u64, u64) = (70 * 60, 60 * 60);
/// How many it takes at most, how often it tolls, and how many takings before its last toll.
pub const TAKES: usize = 4;
pub const TOLL_EVERY: u64 = 20 * 60;
pub const TAKINGS_MOST: u8 = 4;
/// How long it lies bare, ticks, and what a blow on it and an Art's recharge weigh meanwhile.
pub const BARE_TICKS: u64 = 25 * 60;
pub const BARE_BLOW: f64 = 5.0;
pub const BARE_RECHARGE: f64 = 3.0;
/// What its health is times past the company's match: more than a company of eight takes off it before its last toll
/// unless they lay it bare, and enough that, laying it bare once between takings, they see its third taking come.
pub const HEALTH_TIMES: f64 = 8.0;
/// How near the Steward the Lodestone is grounded to lay it bare, metres.
pub const BARE_REACH_M: f64 = 8.0;
/// How often a wave comes, ticks.
pub const WAVE_EVERY: u64 = 18 * 60;
const DRAWS: u64 = 0x0073_7465_7761_7264;

/// Those taken: into which shore (0 what was, 1 what is), who, the bells' order by place, the bells standing, how many
/// broken in order, and whether their way back is open.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Away {
    pub shore: usize,
    pub taken: Vec<PlayerId>,
    pub order: Vec<usize>,
    pub bells: Vec<(usize, FighterId)>,
    pub broken: usize,
    pub done: bool,
}

/// The Steward's court as it stands, and whether it has lain bare since its last taking.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Steward {
    pub boss: Option<FighterId>,
    pub woke_at: u64,
    pub takings: u8,
    pub next_taking: u64,
    pub away: Option<Away>,
    pub bared: bool,
    pub bare_until: u64,
    pub next_toll: u64,
    pub next_wave: u64,
    pub waves: usize,
}

impl Room {
    pub(crate) fn keep_steward(&mut self, breach: &mut Breach) {
        let clock = self.clock;
        let mut fight = std::mem::take(&mut breach.fights.steward);
        if fight.boss.is_none() {
            let stood = breach
                .plan
                .socket("court", "steward")
                .and_then(|(at, _)| self.stand_breach_foe(breach, (STEWARD_TYPE, Rank::Boss), at, Some("The Steward")));
            // Not stood, it is tried again next tick, its waking told only once it stands.
            let Some(boss) = stood else {
                breach.fights.steward = fight;
                return;
            };
            self.match_company(breach, boss, false, HEALTH_TIMES);
            fight.boss = Some(boss);
            (fight.woke_at, fight.next_taking) = (clock, clock + FIRST_TAKING);
            (fight.next_toll, fight.next_wave) = (clock + TOLL_EVERY, clock + 5 * 60);
            self.tell_all(EventKind::BossWoke, 1.0);
        }
        if clock >= fight.next_taking {
            if let Some(away) = fight.away.take() {
                self.lose_away(breach, &away);
            }
            if fight.takings >= TAKINGS_MOST {
                self.unwrite_all(breach);
                fight.next_taking = clock + TOLL_EVERY;
            } else {
                self.take(breach, &mut fight);
            }
        }
        if clock >= fight.next_toll {
            fight.next_toll = clock + TOLL_EVERY;
            self.tell_all(EventKind::Tolled, 1.0);
            self.write(breach, fight.boss.unwrap_or(0));
        }
        self.keep_away(breach, &mut fight);
        if clock >= fight.next_wave {
            fight.next_wave = clock + WAVE_EVERY;
            let mouths: Vec<[f64; 3]> = breach.plan.numbered("court", "mouth").iter().map(|(at, _)| *at).collect();
            let kinds = [(HUSK, Rank::Major), (FLICKER, Rank::Major), (RAVAGER, Rank::Elite)];
            self.breach_wave(breach, "court", &kinds, &mouths, fight.waves);
            fight.waves += 1;
        }
        let won = fight.boss.is_some_and(|id| !self.standing_foe(id));
        if won && let Some(away) = fight.away.take() {
            self.bring_back(breach, &away);
        }
        breach.fights.steward = fight;
        if won {
            self.win_encounter(breach, STEWARD);
        }
    }

    /// Those still in a taking's shore as the Steward falls, carried back to the court as its way back carries them.
    fn bring_back(&mut self, breach: &Breach, away: &Away) {
        let plan = breach.plan;
        let space = plan.shores.get("steward").and_then(|shores| shores.get(away.shore));
        let (Some(space), Some((out, _))) = (space, way_out(breach, away.shore)) else { return };
        for id in self.in_space(breach, space) {
            self.carry(id, out);
        }
    }

    /// Those still in a shore as the next taking comes are lost, as a shut shore loses them, and its bells go.
    fn lose_away(&mut self, breach: &Breach, away: &Away) {
        let plan = breach.plan;
        if let Some(space) = plan.shores.get("steward").and_then(|shores| shores.get(away.shore)) {
            let lost = self.in_space(breach, space);
            for id in &lost {
                self.harm_share(*id, 4.0, 0);
            }
            if !lost.is_empty() {
                self.tell_all(EventKind::Unwritten, lost.len() as f64);
            }
        }
        for (_, id) in &away.bells {
            self.gone(*id);
        }
    }

    /// The Steward takes up to four of the company's living players (those the run counts, never a socket no
    /// character is kept for), wherever they stand, into a shore, Rewriting them; the Lodestone and five bells wait
    /// there, the bells' order drawn; and its next toll comes on its measure.
    fn take(&mut self, breach: &mut Breach, fight: &mut Steward) {
        let clock = self.clock;
        let shore = usize::from(fight.takings % 2);
        let plan = breach.plan;
        let Some(space) = plan.shores.get("steward").and_then(|shores| shores.get(shore)) else { return };
        let mut court: Vec<PlayerId> =
            self.counted_players().into_iter().filter(|id| self.players[id].living()).collect();
        let count = TAKES.min(court.len().div_ceil(2));
        // No one living to take: the taking waits, and the company's wipe comes first.
        if count == 0 {
            return;
        }
        let mut draws = self.steward_draws(clock);
        let mut taken = Vec::new();
        for _ in 0..count {
            let pick = ((draws.draw() * court.len() as f64) as usize).min(court.len() - 1);
            taken.push(court.swap_remove(pick));
        }
        let Some((arrival, _)) = breach.plan.socket(space, "arrival") else { return };
        // The Lodestone goes to the shore's plinth from whoever bears it, taken or not.
        if let Some(bearer) = breach.lodestone.bearer() {
            self.tell(EventKind::LodestoneDropped, None, bearer, bearer, 0.0);
        }
        for (nth, id) in taken.iter().enumerate() {
            let spread = [arrival[0] + (nth % 2) as f64 * 1.6 - 0.8, arrival[1] + (nth / 2) as f64 * 1.2, arrival[2]];
            self.carry(*id, spread);
            self.rewrite(breach, *id);
        }
        self.set_on_plinth(breach, space, true);
        let places = breach.plan.numbered(space, "bell");
        let mut order: Vec<usize> = (0..places.len()).collect();
        for at in (1..order.len()).rev() {
            order.swap(at, ((draws.draw() * (at + 1) as f64) as usize).min(at));
        }
        let mut bells = Vec::new();
        for &place in &order {
            if let Some(id) = self.stand_breach_foe(breach, (BELL, Rank::Minor), places[place].0, None) {
                self.make_walker(id);
                bells.push((place, id));
            }
        }
        fight.away = Some(Away { shore, taken, order, bells, broken: 0, done: false });
        (fight.takings, fight.bared) = (fight.takings + 1, false);
        let every = if breach.tier == gear::breach::Tier::Hard { TAKING_EVERY.1 } else { TAKING_EVERY.0 };
        (fight.next_taking, fight.next_toll) = (clock + every, clock + TOLL_EVERY);
        self.tell_all(EventKind::Taken, shore as f64);
    }

    /// The taken in their shore: each bell broken judged against the order (one out of order stands them all again),
    /// the way back opened once all are broken while the court holds the rift's mooring, and those back in the court
    /// set free of the taking.
    fn keep_away(&mut self, breach: &mut Breach, fight: &mut Steward) {
        let Some(mut away) = fight.away.take() else { return };
        let plan = breach.plan;
        let Some(space) = plan.shores.get("steward").and_then(|shores| shores.get(away.shore)) else { return };
        let mut wrong = false;
        for (place, id) in away.bells.clone() {
            if self.standing_foe(id) {
                continue;
            }
            away.bells.retain(|(_, bell)| *bell != id);
            if away.order.get(away.broken) == Some(&place) {
                away.broken += 1;
                self.tell_all(EventKind::BellBroken, place as f64);
            } else {
                wrong = true;
            }
        }
        if wrong && !away.done {
            self.tell_all(EventKind::BellRang, 1.0);
            for (_, id) in std::mem::take(&mut away.bells) {
                self.gone(id);
            }
            away.broken = 0;
            let places = breach.plan.numbered(space, "bell");
            for &place in &away.order.clone() {
                if let Some(id) = self.stand_breach_foe(breach, (BELL, Rank::Minor), places[place].0, None) {
                    self.make_walker(id);
                    away.bells.push((place, id));
                }
            }
            for id in self.in_space(breach, space) {
                self.rewrite(breach, id);
            }
        }
        if away.broken == away.order.len() && !away.done {
            away.done = true;
            self.tell_all(EventKind::WayBack, away.shore as f64);
        }
        // Two hold the mooring at Hard, or as many as the taking left in the court: with none, the bells alone open it.
        let most = if breach.tier == gear::breach::Tier::Hard { 2 } else { 1 };
        let needed = most.min(self.in_space(breach, "court").len());
        let way = way_out(breach, away.shore);
        let held = way.is_some_and(|(_, at)| self.held_by_players(at, super::shores::MOORING_REACH_M) >= needed);
        if away.done
            && held
            && let (Some((back, _)), Some((out, _))) = (breach.plan.socket(space, "rift"), way)
        {
            let leaving: Vec<PlayerId> = self
                .in_space(breach, space)
                .into_iter()
                .filter(|id| {
                    self.players.get(id).is_some_and(|found| {
                        apart([found.fighter.body.x, found.fighter.body.y], [back[0], back[1]])
                            <= super::shores::RIFT_REACH_M
                    })
                })
                .collect();
            for id in leaving {
                self.carry(id, out);
            }
        }
        if self.someone_in(breach, space) {
            fight.away = Some(away);
        } else if away.done {
            self.tell_all(EventKind::Returned, away.shore as f64);
        } else {
            // Every one taken fell there: the taking ends with its bells, and the next takes others.
            for (_, id) in away.bells {
                self.gone(id);
            }
        }
    }

    /// The Lodestone grounded within reach of the Steward, with no one left away, lays it bare, once between takings.
    pub(crate) fn ground_steward(&mut self, breach: &mut Breach, at: [f64; 3]) -> bool {
        let fight = &mut breach.fights.steward;
        let Some(id) = fight.boss.filter(|_| fight.away.is_none() && !fight.bared) else { return false };
        let Some(foe) = self.foes.get(&id).filter(|foe| !foe.fighter.dead()) else { return false };
        if apart([foe.fighter.body.x, foe.fighter.body.y], [at[0], at[1]]) > BARE_REACH_M {
            return false;
        }
        (fight.bare_until, fight.bared) = (self.clock + BARE_TICKS, true);
        self.tell_all(EventKind::LaidBare, 0.0);
        true
    }

    /// What a blow on a foe weighs in a Breach's run: five times on the Steward while it lies bare, and nothing on a
    /// Watcher, which no blow harms.
    pub(crate) fn bare_times(&self, defender: FighterId) -> f64 {
        let Some(breach) = self.breach.as_ref() else { return 1.0 };
        if breach.fights.ways.watchers.iter().any(|(id, _, _)| *id == defender) {
            return 0.0;
        }
        let fight = &breach.fights.steward;
        if fight.boss == Some(defender) && self.clock < fight.bare_until { BARE_BLOW } else { 1.0 }
    }

    /// How much faster Arts recharge in a Breach's run: three times while the Steward lies bare.
    #[must_use]
    pub fn bare_recharge(&self) -> f64 {
        let Some(breach) = self.breach.as_ref() else { return 1.0 };
        if self.clock < breach.fights.steward.bare_until { BARE_RECHARGE } else { 1.0 }
    }

    fn steward_draws(&self, salt: u64) -> naval::random::Mulberry32 {
        let seed = self.world_seed ^ DRAWS ^ salt.rotate_left(13);
        naval::random::Mulberry32::new((seed ^ (seed >> 32)) as u32)
    }
}

/// Where a shore's way back comes out in the court, halfway from its rift to its mooring, and that mooring.
fn way_out(breach: &Breach, shore: usize) -> Option<([f64; 3], [f64; 3])> {
    let (rift, mooring) = if shore == 0 { ("rift-was", "mooring-was") } else { ("rift-is", "mooring-is") };
    let ((mouth, _), (at, _)) = (breach.plan.socket("court", rift)?, breach.plan.socket("court", mooring)?);
    Some(([mouth[0] + (at[0] - mouth[0]) * 0.5, mouth[1] + (at[1] - mouth[1]) * 0.5, at[2]], at))
}
