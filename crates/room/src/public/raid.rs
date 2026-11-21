//! The Grey Tithe's raid on a hamlet: its banners are planted at the hamlet's edge and the Tithe come in waves from
//! the approach. Collectors make for the stores and plunder them, a store losing health while a Collector stands at
//! it; the rest fight the players. A wave is broken when its foes have all fallen, and the next comes WAVE_GAP later;
//! the last broken, the Tithe give up, so long as one store stands; every store plundered, the raid fails. Heroic: with
//! the second wave comes the tithe-taker, who walks to each store in turn, counts it and walks back out, fighting no
//! one; killed before he leaves, the third wave is stronger and a fourth comes, led by Reeve Ancel Marrow.

use super::{Heroic, Play, Public, Running};
use crate::{EventKind, Room};
use ::foes::Rank::{Elite, Major, Miniboss, Minor};
use ::foes::roster::{COLLECTOR, CROSSBOWMAN, ENFORCER, MARKSMAN, REEVE, RUNNER, TITHE_TAKER};
use ::foes::{Orders, Rank};
use combat::fighter::FighterId;
use combat::sight::{apart, bearing};
use core::f64::consts::TAU;
use std::collections::BTreeMap;

/// The next wave comes this long after the last is broken; a wave stands this far round the approach.
pub const WAVE_GAP: u64 = 30 * 60;
const COME_IN: f64 = 3.0;
/// A Collector plunders a store standing within this of its middle; alone, it plunders a whole store in this long.
pub const STORE_REACH: f64 = 2.5;
pub const PLUNDER_TICKS: f64 = 20.0 * 60.0;
/// A Collector stands this far from its store's middle, on the side the raiders come from.
const AT_STORE: f64 = 1.9;
/// The tithe-taker's round takes this long, counting each store for COUNT_TICKS; he walks no slower than WALK_LEAST
/// and no faster than WALK_MOST, metres a second, and is gone once his time is up wherever he stands.
pub const TITHE_TAKER_TICKS: u64 = 50 * 60;
pub const COUNT_TICKS: u64 = 10 * 60;
const WALK_LEAST: f64 = 1.2;
const WALK_MOST: f64 = 3.5;
pub const MARROW_NAME: &str = "Reeve Ancel Marrow, the Tithe's Hand";
/// One more Runner comes in each wave for each player on the ground beyond the first, to this many.
const MORE_MOST: usize = 3;
/// A party this small on the ground meets each wave a rank lower where a type comes lower: a Major Runner, Collector
/// or Crossbowman as a Minor, a Marksman (an Elite alone) as a Major Crossbowman.
const SMALL_PARTY: usize = 2;

fn eased(member: (u8, Rank)) -> (u8, Rank) {
    match member {
        (RUNNER | COLLECTOR | CROSSBOWMAN, Major) => (member.0, Minor),
        (MARKSMAN, Elite) => (CROSSBOWMAN, Major),
        _ => member,
    }
}

/// The waves: each foe's type and rank. Heroic's third wave holds HEROIC_MORE besides; its fourth is Marrow's.
const FIRST: &[(u8, Rank)] =
    &[(COLLECTOR, Major), (COLLECTOR, Major), (RUNNER, Minor), (RUNNER, Minor), (CROSSBOWMAN, Minor)];
const SECOND: &[(u8, Rank)] =
    &[(COLLECTOR, Major), (COLLECTOR, Major), (ENFORCER, Major), (CROSSBOWMAN, Major), (RUNNER, Major)];
const THIRD: &[(u8, Rank)] =
    &[(COLLECTOR, Major), (COLLECTOR, Major), (ENFORCER, Major), (MARKSMAN, Elite), (REEVE, Elite)];
const HEROIC_MORE: &[(u8, Rank)] = &[(ENFORCER, Elite), (MARKSMAN, Elite)];
const FOURTH: &[(u8, Rank)] = &[(REEVE, Miniboss), (COLLECTOR, Major), (COLLECTOR, Major), (ENFORCER, Elite)];

/// The tithe-taker on his round: where he goes in turn (each a store's place, or the approach last), whether each is
/// a store he counts, how far along he is, the tick his count ends, and his pace.
#[derive(Debug)]
pub(crate) struct Taker {
    pub foe: FighterId,
    pub round: Vec<([f64; 3], bool)>,
    pub leg: usize,
    pub counting: Option<u64>,
    pub pace: f64,
}

/// A raid as it plays: each store's middle and health (0 to 1), where a Collector stands at each, the approach and
/// the banners, the wave and how many come, the foes of the wave standing, the tick the next comes, each Collector's
/// store, and the tithe-taker.
#[derive(Debug)]
pub(crate) struct Raid {
    pub stores: Vec<([f64; 3], f64)>,
    pub posts: Vec<[f64; 3]>,
    pub approach: [f64; 3],
    pub banners: Vec<[f64; 3]>,
    pub wave: u8,
    pub waves: u8,
    pub wave_foes: Vec<FighterId>,
    pub next_wave: Option<u64>,
    pub collectors: BTreeMap<FighterId, usize>,
    pub taker: Option<Taker>,
}

impl Raid {
    /// The stores' health left, per mille of all of them whole.
    #[must_use]
    pub fn left(&self) -> u16 {
        let whole = self.stores.iter().map(|(_, health)| health).sum::<f64>() / self.stores.len().max(1) as f64;
        (whole * 1000.0).round().clamp(0.0, 1000.0) as u16
    }
}

impl Room {
    pub(crate) fn raid_of(&self, ground: &super::RaidGround) -> Raid {
        let approach = self.on_ground(ground.approach);
        let stores: Vec<([f64; 3], f64)> = ground.stores.iter().map(|&at| (self.on_ground(at), 1.0)).collect();
        let posts = stores
            .iter()
            .map(|&(at, _)| {
                let toward = bearing([at[0], at[1]], [approach[0], approach[1]]);
                let place = [at[0] + libm::sin(toward) * AT_STORE, at[1] - libm::cos(toward) * AT_STORE];
                self.nav.nearest_point(self.on_ground(place)).unwrap_or(at)
            })
            .collect();
        Raid {
            stores,
            posts,
            approach,
            banners: ground.banners.iter().map(|&at| self.on_ground(at)).collect(),
            wave: 0,
            waves: 3,
            wave_foes: Vec::new(),
            next_wave: None,
            collectors: BTreeMap::new(),
            taker: None,
        }
    }

    /// The banners are planted and the first wave comes in.
    pub(crate) fn begin_raid(&mut self, public: &Public, running: &mut Running) {
        let Play::Raid(mut raid) = core::mem::replace(&mut running.play, Play::Aside) else { return };
        running.stages = raid.waves;
        self.raid_wave(public, running, &mut raid);
        running.play = Play::Raid(raid);
    }

    /// One tick of the raid.
    pub(crate) fn play_raid(&mut self, public: &Public, running: &mut Running) {
        let Play::Raid(mut raid) = core::mem::replace(&mut running.play, Play::Aside) else { return };
        for (killer, foe, _) in self.killed_now(running) {
            if raid.taker.as_ref().is_some_and(|taker| taker.foe == foe) && running.heroic == Heroic::Offered {
                raid.taker = None;
                self.inert.remove(&foe);
                (running.heroic, running.heroic_ticks) = (Heroic::Met, 0);
                (raid.waves, running.stages) = (4, 4);
                self.tell(EventKind::HeroicMet, None, killer, foe, f64::from(running.kind as u8));
                // Killed once the third wave has come: its heroic strength comes in now, beside it.
                if raid.wave == 3 {
                    self.raid_members(public, running, &mut raid, HEROIC_MORE.to_vec());
                }
            }
        }
        self.plunder(running, &mut raid);
        self.walk_round(running, &mut raid);
        let fallen = |id: &FighterId| self.foes.get(id).is_none_or(|foe| foe.fighter.dead());
        let broken = raid.wave_foes.iter().all(fallen);
        let standing = raid.stores.iter().any(|(_, health)| *health > 0.0);
        if !standing {
            running.play = Play::Raid(raid);
            self.fail(running);
            return;
        }
        if broken && raid.next_wave.is_none() && raid.wave >= raid.waves && raid.taker.is_none() {
            running.play = Play::Raid(raid);
            self.win(public, running);
            if let Play::Raid(raid) = &running.play {
                let to = raid.approach;
                self.withdraw(running, to);
            }
            return;
        }
        if broken && raid.next_wave.is_none() && raid.wave < raid.waves {
            raid.next_wave = Some(self.clock + WAVE_GAP);
        }
        if raid.next_wave.is_some_and(|tick| self.clock >= tick) {
            raid.next_wave = None;
            self.raid_wave(public, running, &mut raid);
        }
        running.play = Play::Raid(raid);
    }

    /// Each Collector standing at its store plunders it; a store plundered sends its Collectors to the next standing,
    /// and loses the bonus.
    fn plunder(&mut self, running: &mut Running, raid: &mut Raid) {
        let collectors: Vec<(FighterId, usize)> = raid.collectors.iter().map(|(id, store)| (*id, *store)).collect();
        for (id, store) in collectors {
            let Some(foe) = self.foes.get(&id).filter(|foe| !foe.fighter.dead()) else {
                raid.collectors.remove(&id);
                continue;
            };
            let (at, health) = raid.stores[store];
            let body = foe.fighter.body;
            if health <= 0.0 || apart([body.x, body.y], [at[0], at[1]]) > STORE_REACH {
                continue;
            }
            let left = (health - 1.0 / PLUNDER_TICKS).max(0.0);
            raid.stores[store].1 = left;
            if left <= 0.0 {
                running.bonus = false;
                self.tell(EventKind::StorePlundered, None, id, store as u32 + 1, 0.0);
                let moving: Vec<FighterId> =
                    raid.collectors.iter().filter(|(_, at)| **at == store).map(|(id, _)| *id).collect();
                for collector in moving {
                    self.post_collector(raid, collector);
                }
            }
        }
    }

    /// Sends a Collector to the standing store nearest it, to defend its ground there; to none when none stands.
    fn post_collector(&mut self, raid: &mut Raid, id: FighterId) {
        let Some(body) = self.foes.get(&id).map(|foe| foe.fighter.body) else { return };
        let standing = (0..raid.stores.len()).filter(|at| raid.stores[*at].1 > 0.0);
        let nearest = standing.min_by(|one, two| {
            let far = |at: &usize| apart([body.x, body.y], [raid.posts[*at][0], raid.posts[*at][1]]);
            far(one).total_cmp(&far(two))
        });
        let Some(store) = nearest else { return };
        raid.collectors.insert(id, store);
        let (post, at) = (raid.posts[store], raid.stores[store].0);
        if let Some(foe) = self.foes.get_mut(&id) {
            foe.brain.posted_at(post, bearing([post[0], post[1]], [at[0], at[1]]));
            foe.brain.order(Orders { defend: true, ..Orders::default() });
        }
    }

    /// The next wave comes in round the approach: its Collectors for the stores, the rest for the players; with the
    /// second comes the tithe-taker, while the heroic task is not yet offered. A wave the room has no room for comes
    /// once the gap has passed again.
    fn raid_wave(&mut self, public: &Public, running: &mut Running, raid: &mut Raid) {
        raid.wave += 1;
        let heroic = running.heroic == Heroic::Met;
        let mut members: Vec<(u8, Rank)> = match raid.wave {
            1 => FIRST.to_vec(),
            2 => SECOND.to_vec(),
            3 if heroic => [THIRD, HEROIC_MORE].concat(),
            3 => THIRD.to_vec(),
            _ => FOURTH.to_vec(),
        };
        let (middle, radius) = self.ground_of(public, running.kind);
        let here = self.players.values().filter(|player| {
            !player.fighter.dead() && apart([player.fighter.body.x, player.fighter.body.y], middle) <= radius
        });
        let here = here.count();
        members.extend(core::iter::repeat_n((RUNNER, Major), here.saturating_sub(1).min(MORE_MOST)));
        if here <= SMALL_PARTY {
            members = members.into_iter().map(eased).collect();
        }
        raid.wave_foes.clear();
        self.raid_members(public, running, raid, members);
        if raid.wave_foes.is_empty() {
            raid.wave -= 1;
            raid.next_wave = Some(self.clock + WAVE_GAP);
            return;
        }
        running.stage = raid.wave;
        if raid.wave > 1 {
            self.tell(EventKind::PublicStage, None, 0, 0, f64::from(raid.wave));
        }
        if raid.wave == 2 && running.heroic == Heroic::NotYet {
            self.send_taker(public, running, raid);
        }
    }

    /// Stands a wave's foes round the approach and adds them to it: its Collectors for the stores, the rest for the
    /// players.
    fn raid_members(&mut self, public: &Public, running: &mut Running, raid: &mut Raid, members: Vec<(u8, Rank)>) {
        let (middle, _) = self.ground_of(public, running.kind);
        let mut draws = self.wave_draws(running, u32::from(raid.wave) * 8 + raid.wave_foes.len() as u32);
        let start = draws.draw() * TAU;
        let (approach, home) = (raid.approach, self.on_ground(middle));
        let count = members.len();
        for (turn, member) in members.into_iter().enumerate() {
            let facing = start + TAU * turn as f64 / count as f64;
            let place =
                [approach[0] + libm::sin(facing) * COME_IN, approach[1] - libm::cos(facing) * COME_IN, approach[2]];
            let toward = bearing([approach[0], approach[1]], middle);
            let Some(id) = self.stand_event_foe(running, member, (place, toward), (home, public.level)) else {
                continue;
            };
            raid.wave_foes.push(id);
            if member == (REEVE, Miniboss) {
                self.names.insert(id, MARROW_NAME);
            }
            if member.0 == COLLECTOR {
                self.post_collector(raid, id);
            }
        }
    }

    /// The tithe-taker comes in at the approach to walk his round of the standing stores, nearest first, and back.
    fn send_taker(&mut self, public: &Public, running: &mut Running, raid: &mut Raid) {
        let from = raid.approach;
        let mut left: Vec<usize> = (0..raid.stores.len()).filter(|at| raid.stores[*at].1 > 0.0).collect();
        let mut round = Vec::new();
        let mut at = from;
        while let Some(next) = (0..left.len()).min_by(|one, two| {
            let far = |place: &usize| apart([at[0], at[1]], [raid.posts[left[*place]][0], raid.posts[left[*place]][1]]);
            far(one).total_cmp(&far(two))
        }) {
            at = raid.posts[left.remove(next)];
            round.push((at, true));
        }
        round.push((from, false));
        let mut length = 0.0;
        let mut last = from;
        for (point, _) in &round {
            length += apart([last[0], last[1]], [point[0], point[1]]);
            last = *point;
        }
        let counted = COUNT_TICKS * (round.len() as u64 - 1);
        let walking = TITHE_TAKER_TICKS.saturating_sub(counted).max(60) as f64 / 60.0;
        let pace = (length / walking).clamp(WALK_LEAST, WALK_MOST);
        let facing = bearing([from[0], from[1]], [round[0].0[0], round[0].0[1]]);
        let home = (self.on_ground(self.ground_of(public, running.kind).0), 0);
        let Some(foe) = self.stand_event_foe(running, (TITHE_TAKER, Elite), (from, facing), home) else { return };
        self.inert.insert(foe);
        raid.taker = Some(Taker { foe, round, leg: 0, counting: None, pace });
        (running.heroic, running.heroic_ticks) = (Heroic::Offered, TITHE_TAKER_TICKS);
    }

    /// The tithe-taker walks his round and counts each store; back at the approach, or his time up, he is gone and the
    /// heroic task missed.
    fn walk_round(&mut self, running: &mut Running, raid: &mut Raid) {
        let Some(mut taker) = raid.taker.take() else { return };
        running.heroic_ticks = running.heroic_ticks.saturating_sub(1);
        let clock = self.clock;
        let done = match taker.counting {
            Some(until) if clock < until => false,
            Some(_) => {
                taker.counting = None;
                taker.leg += 1;
                false
            }
            None => match taker.round.get(taker.leg).copied() {
                Some((to, store)) if self.walk_inert(taker.foe, to, taker.pace) => {
                    if store {
                        taker.counting = Some(clock + COUNT_TICKS);
                        false
                    } else {
                        true
                    }
                }
                Some(_) => false,
                None => true,
            },
        };
        if done || running.heroic_ticks == 0 {
            self.gone(taker.foe);
            running.foes.retain(|id| *id != taker.foe);
            (running.heroic, running.heroic_ticks) = (Heroic::Missed, 0);
            self.tell(EventKind::HeroicMissed, None, 0, 0, f64::from(running.kind as u8));
            return;
        }
        raid.taker = Some(taker);
    }
}
