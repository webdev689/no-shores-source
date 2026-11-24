//! The Unlit Ways, the Drowned Vale's fourth encounter, after the Vault of Glass's Gorgons: the old town's streets,
//! dark, and at their crossings the Watchers, Idols whose lenses turn in slow sweeps on a measure and cast a red light
//! down the street. A living player in a Watcher's light with nothing between them a moment is seen; one sprinting
//! near it is heard. At Normal the one seen is unwritten and the Lattice comes for the rest; at Hard the whole company
//! is unwritten a few seconds on. No blow harms a Watcher. The house at the heart of the streets opens to those who
//! reach it unseen, and the Ways are won when every living player of the company stands on the Broken Stair.

use super::{Breach, WAYS};
use crate::{EventKind, PlayerId, Room};
use ::foes::Rank;
use ::foes::roster::{FLICKER, IDOL};
use combat::fighter::FighterId;
use combat::sight::{apart, bearing, clear_line, off};
use movement::{Mode, Near};

/// A Watcher's light: how far it reaches, metres, and half its width, radians (20 degrees).
pub const SIGHT_M: f64 = 14.0;
pub const HALF_WIDE: f64 = 0.349_065_850_398_865_9;
/// How far either way of its post's facing a Watcher sweeps, radians (55 degrees), and the ticks of one sweep there
/// and back.
pub const SWEEP: f64 = 0.959_931_088_596_881_2;
pub const SWEEP_TICKS: f64 = 9.0 * 60.0;
/// How long a player stands in a light before being seen, ticks; how near a Watcher sprinting is heard, metres; and
/// how long after a sighting at Hard the company is unwritten, ticks.
pub const SEEN_TICKS: u32 = 45;
pub const HEARD_M: f64 = 8.0;
pub const SEEN_TO_WIPE: u64 = 3 * 60;
/// A Watcher's eye over its feet, and a player's chest, metres.
const EYE_M: f64 = 2.2;
const CHEST_M: f64 = 1.2;

/// The Ways as they stand: each Watcher, its post's facing and how far its sweep has come, in sweeps (below 0 until it
/// begins); how long each player has stood in a light; whether anyone was seen this attempt, and at Hard when the
/// company is unwritten.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Ways {
    pub begun: bool,
    pub watchers: Vec<(FighterId, f64, f64)>,
    pub lit: Vec<(PlayerId, u32)>,
    pub seen: bool,
    pub wipe_at: Option<u64>,
    pub waves: usize,
}

impl Room {
    pub(crate) fn keep_ways(&mut self, breach: &mut Breach) {
        let mut fight = std::mem::take(&mut breach.fights.ways);
        if !fight.begun {
            self.post_watchers(breach, &mut fight);
        }
        self.turn_watchers(&mut fight);
        self.watch(breach, &mut fight);
        if fight.wipe_at.is_some_and(|at| self.clock >= at) {
            fight.wipe_at = None;
            self.unwrite_all(breach);
        }
        if !fight.seen
            && let Some((heart, _)) = breach.plan.socket("ways", "heart")
        {
            let at_heart = self.players.values().any(|found| {
                found.living() && apart([found.fighter.body.x, found.fighter.body.y], [heart[0], heart[1]]) <= 3.0
            });
            if at_heart {
                breach.chests.insert(2);
            }
        }
        let on_stair = self.in_space(breach, "stair");
        let living: Vec<PlayerId> = self.counted_players().into_iter().filter(|id| self.players[id].living()).collect();
        let won = !living.is_empty() && living.iter().all(|id| on_stair.contains(id));
        breach.fights.ways = fight;
        if won {
            self.win_encounter(breach, WAYS);
        }
    }

    /// The Watchers stand at their posts, Idols that never walk or strike, each to its post's facing.
    fn post_watchers(&mut self, breach: &mut Breach, fight: &mut Ways) {
        for (nth, (at, facing)) in breach.plan.numbered("ways", "watcher").into_iter().enumerate() {
            let Some(id) = self.stand_breach_foe(breach, (IDOL, Rank::Elite), at, Some("Watcher")) else { continue };
            self.make_walker(id);
            let post = bearing([0.0, 0.0], facing);
            if let Some(foe) = self.foes.get_mut(&id) {
                (foe.fighter.body.facing, foe.fighter.aim) = (post, post);
            }
            fight.watchers.push((id, post, -(nth as f64) * 50.0 / SWEEP_TICKS));
        }
        fight.begun = true;
    }

    /// Each Watcher's lens turned to where its sweep stands now, a smooth swing either way of its post's facing, its
    /// sweep brought on a tick, and its health held whole as the Scrivener's ward holds it.
    fn turn_watchers(&mut self, fight: &mut Ways) {
        for (id, post, along) in &mut fight.watchers {
            let Some(foe) = self.foes.get_mut(id).filter(|foe| !foe.fighter.dead()) else { continue };
            let facing = movement::wrap(*post + SWEEP * libm::sin(along.max(0.0) * std::f64::consts::TAU));
            (foe.fighter.body.facing, foe.fighter.aim) = (facing, facing);
            foe.fighter.health = foe.fighter.health_max;
            *along += 1.0 / SWEEP_TICKS;
        }
    }

    /// Who the Watchers see or hear this tick, and what follows.
    fn watch(&mut self, breach: &mut Breach, fight: &mut Ways) {
        let watchers: Vec<[f64; 4]> = fight
            .watchers
            .iter()
            .filter_map(|(id, _, _)| self.foes.get(id).filter(|foe| !foe.fighter.dead()))
            .map(|foe| [foe.fighter.body.x, foe.fighter.body.y, foe.fighter.body.z, foe.fighter.body.facing])
            .collect();
        let mut seen_now = Vec::new();
        let players: Vec<PlayerId> = self.in_space(breach, "ways");
        for id in players {
            let Some(found) = self.players.get(&id) else { continue };
            let body = found.fighter.body;
            let heard = body.mode == Mode::Ground
                && (body.vx * body.vx + body.vy * body.vy).sqrt() > movement::TUNING.walk + 0.5
                && watchers.iter().any(|watcher| apart([watcher[0], watcher[1]], [body.x, body.y]) <= HEARD_M);
            let lit = watchers.iter().any(|&[x, y, z, facing]| {
                let near = apart([x, y], [body.x, body.y]) <= SIGHT_M;
                near && off(bearing([x, y], [body.x, body.y]), facing) <= HALF_WIDE
                    && clear_line(self.blocks.all(), &self.floor, [x, y, z + EYE_M], [body.x, body.y, body.z + CHEST_M])
            });
            let held = fight.lit.iter().find(|(player, _)| *player == id).map_or(0, |(_, ticks)| *ticks);
            let held = if lit { held + 1 } else { 0 };
            fight.lit.retain(|(player, _)| *player != id);
            if held > 0 {
                fight.lit.push((id, held));
            }
            if heard || held >= SEEN_TICKS {
                seen_now.push(id);
            }
        }
        for id in seen_now {
            fight.lit.retain(|(player, _)| *player != id);
            self.watcher_saw(breach, fight, id);
        }
    }

    /// A player is seen: at Normal they are unwritten and the Lattice comes for the rest; at Hard the company is
    /// unwritten a few seconds on.
    fn watcher_saw(&mut self, breach: &mut Breach, fight: &mut Ways, id: PlayerId) {
        fight.seen = true;
        self.tell_all(EventKind::Seen, f64::from(id));
        if breach.tier == gear::breach::Tier::Hard {
            fight.wipe_at.get_or_insert(self.clock + SEEN_TO_WIPE);
            return;
        }
        self.harm_share(id, 4.0, 0);
        let near = self.players.get(&id).map_or([0.0, 0.0, 0.0], |found| {
            let body = found.fighter.body;
            [body.x, body.y, body.z]
        });
        let mouths: Vec<[f64; 3]> = breach.plan.numbered("ways", "mouth").iter().map(|(at, _)| *at).collect();
        let nearest = mouths.iter().copied().min_by(|one, two| {
            apart([one[0], one[1]], [near[0], near[1]]).total_cmp(&apart([two[0], two[1]], [near[0], near[1]]))
        });
        if let Some(mouth) = nearest {
            self.breach_wave(breach, "ways", &[(FLICKER, Rank::Major)], &[mouth], fight.waves);
            fight.waves += 1;
        }
    }
}
