//! The Lodestone and the marks it cleanses. The Lodestone stands on its plinth where an encounter needs it; a living
//! player takes it up with Use within reach, and sets it down with Use again. Its bearer holds no weapon and casts no
//! Art: their swing is its Strike, a heavy blow; their guard raises Hold True, a light round them that cleanses every
//! Rewritten player inside it, held a few seconds and then resting; and their Art's key Grounds it, once charged,
//! breaking every ward and crystal shield near. Fallen with it, or set down, it lies where it dropped, and left lying
//! too long while an encounter needs it, the company is unwritten. Rewritten is a mark: harmless until the next
//! writing (the Scrivener's, the Steward's toll, the Seam's, a Choir's round's end), which unwrites everyone it marks.

use super::Breach;
use crate::{EventKind, PlayerId, Room};
use combat::fighter::FighterId;
use combat::sight::apart;

/// How near the plinth or the lying stone a body takes it up, metres.
pub const TAKE_REACH_M: f64 = 2.5;
/// Hold True's reach round its bearer, metres; the most it is held at once and how long it rests after, ticks.
pub const HOLD_REACH_M: f64 = 4.0;
pub const HOLD_MOST: u64 = 6 * 60;
pub const HOLD_REST: u64 = 10 * 60;
/// How long the Lodestone charges between groundings, ticks, and how far a grounding reaches, metres.
pub const GROUND_CHARGE: u64 = 20 * 60;
pub const GROUND_REACH_M: f64 = 8.0;
/// What the bearer's Strike weighs against a plain swing.
pub const STRIKE_TIMES: f64 = 3.0;
/// How long the Lodestone may lie while an encounter needs it before the company is unwritten, ticks: Normal, Hard.
pub const LYING_MOST: (u64, u64) = (6 * 60, 4 * 60);
/// What a player inside Hold True takes of a foe's blow, Rewritten or not.
pub const HELD_TIMES: f64 = 0.5;

/// Where the Lodestone is.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub enum Stone {
    /// Not in play.
    #[default]
    Away,
    /// On a plinth, at its top.
    Plinth([f64; 3]),
    /// Carried.
    Borne(PlayerId),
    /// Lying where it dropped, since a tick.
    Lying([f64; 3], u64),
}

/// The Lodestone: where it is, when its grounding is charged, when Hold True was raised and how long it rests, and
/// whether an encounter needs it now (left lying, it unwrites the company).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Lodestone {
    pub stone: Stone,
    /// When it was last grounded: it charges GROUND_CHARGE from then, and stands charged where never grounded.
    pub grounded_at: Option<u64>,
    pub held_from: Option<u64>,
    pub rests_until: u64,
    pub needed: bool,
    /// The last bearer to cross a rift with it, at Hard, who may not cross with it again until another has.
    pub crossed_by: Option<PlayerId>,
    /// Where it was last carried, where it falls if its bearer leaves the run.
    pub carried_at: [f64; 3],
    /// The plinth it was last stood on, where it goes back if it falls into the dark with its bearer.
    pub home: [f64; 3],
}

impl Lodestone {
    /// Its bearer, if carried.
    #[must_use]
    pub fn bearer(&self) -> Option<PlayerId> {
        match self.stone {
            Stone::Borne(id) => Some(id),
            _ => None,
        }
    }

    /// Where it stands on the ground or a plinth, if not carried or away.
    #[must_use]
    pub fn lying_at(&self) -> Option<[f64; 3]> {
        match self.stone {
            Stone::Plinth(at) | Stone::Lying(at, _) => Some(at),
            _ => None,
        }
    }

    /// Hold True ends, however it ends (its guard let go, its most held, the stone set down or its bearer fallen),
    /// and rests HOLD_REST from then: the rest is the stone's, so no set-down or pass skips it.
    fn end_hold(&mut self, clock: u64) {
        if self.held_from.take().is_some() {
            self.rests_until = clock + HOLD_REST;
        }
    }
}

impl Room {
    /// Whether a player bears the Lodestone in a Breach's run.
    pub(crate) fn bears_lodestone(&self, id: FighterId) -> bool {
        self.breach.as_ref().is_some_and(|breach| breach.lodestone.bearer() == Some(id))
    }

    /// The Lodestone set on a space's plinth, charged, needed or not.
    pub(crate) fn set_on_plinth(&self, breach: &mut Breach, space: &str, needed: bool) {
        let at = breach.plan.socket(space, "plinth").map_or([0.0, 0.0, 0.0], |(at, _)| at);
        breach.lodestone =
            Lodestone { stone: super::lodestone::Stone::Plinth(at), needed, home: at, ..Lodestone::default() };
    }

    /// A player takes the Lodestone up, living and within reach of where it stands.
    pub(crate) fn take_lodestone(&mut self, id: PlayerId) -> bool {
        let Some(found) = self.players.get(&id).filter(|found| found.living()) else { return false };
        let body = found.fighter.body;
        let Some(breach) = self.breach.as_mut() else { return false };
        let Some(at) = breach.lodestone.lying_at() else { return false };
        if apart([body.x, body.y], [at[0], at[1]]) > TAKE_REACH_M || (body.z - at[2]).abs() > 2.0 {
            return false;
        }
        breach.lodestone.stone = Stone::Borne(id);
        self.tell(EventKind::LodestoneTaken, None, id, id, 0.0);
        true
    }

    /// The bearer sets the Lodestone down at their feet, standing: never in the air, where it would hang over the dark.
    pub(crate) fn drop_lodestone(&mut self, id: PlayerId) -> bool {
        let Some(found) = self.players.get(&id).filter(|found| found.fighter.body.mode == movement::Mode::Ground)
        else {
            return false;
        };
        let body = found.fighter.body;
        let clock = self.clock;
        let Some(breach) = self.breach.as_mut().filter(|breach| breach.lodestone.bearer() == Some(id)) else {
            return false;
        };
        breach.lodestone.stone = Stone::Lying([body.x, body.y, body.z], clock);
        breach.lodestone.end_hold(clock);
        self.tell(EventKind::LodestoneDropped, None, id, id, 0.0);
        true
    }

    /// The bearer's Art's key: the Lodestone is driven into the floor, once charged, breaking every ward in reach and
    /// stripping the crystal shields of the foes near. Answers whether it was grounded.
    pub(crate) fn ground_lodestone(&mut self, id: PlayerId) -> bool {
        let Some(found) = self.players.get(&id).filter(|found| found.living()) else { return false };
        let body = found.fighter.body;
        let clock = self.clock;
        let Some(mut breach) = self.breach.take() else { return false };
        let charged = breach.lodestone.grounded_at.is_none_or(|at| clock >= at + GROUND_CHARGE);
        let ready = breach.lodestone.bearer() == Some(id) && charged;
        if ready {
            breach.lodestone.grounded_at = Some(clock);
            let near: Vec<FighterId> = self
                .foes
                .iter()
                .filter(|(_, foe)| {
                    !foe.fighter.dead()
                        && apart([foe.fighter.body.x, foe.fighter.body.y], [body.x, body.y]) <= GROUND_REACH_M
                })
                .map(|(foe, _)| *foe)
                .collect();
            for foe in &near {
                if let Some(found) = self.foes.get_mut(foe) {
                    found.shield = None;
                }
            }
            let broke = self.grounded(&mut breach, [body.x, body.y, body.z], &near);
            self.tell(EventKind::Grounded, None, id, id, f64::from(u8::from(broke)));
        }
        self.breach = Some(breach);
        ready
    }

    /// Each tick: the bearer fallen drops it where they lie; Hold True raised while their guard is up and rested, held
    /// at most HOLD_MOST, cleansing the Rewritten inside it; and the stone left lying too long while needed unwrites the
    /// company.
    pub(crate) fn keep_lodestone(&mut self, breach: &mut Breach) {
        let clock = self.clock;
        if let Some(bearer) = breach.lodestone.bearer() {
            let Some(found) = self.players.get(&bearer).filter(|found| found.living()) else {
                let fallen = self.players.get(&bearer);
                // Fallen into the dark with it, the stone goes back to its plinth: none could reach it where they fell.
                let dark =
                    fallen.is_some_and(|found| matches!(found.standing, crate::Standing::Dead { fell: true, .. }));
                let at = fallen.map_or(breach.lodestone.carried_at, |found| {
                    let body = found.fighter.body;
                    [body.x, body.y, body.z]
                });
                breach.lodestone.stone =
                    if dark { Stone::Plinth(breach.lodestone.home) } else { Stone::Lying(at, clock) };
                breach.lodestone.end_hold(clock);
                self.tell(EventKind::LodestoneDropped, None, bearer, bearer, 0.0);
                return;
            };
            let guarding = found.fighter.guarding().is_some();
            let body = found.fighter.body;
            breach.lodestone.carried_at = [body.x, body.y, body.z];
            match breach.lodestone.held_from {
                Some(from) if !guarding || clock >= from + HOLD_MOST => breach.lodestone.end_hold(clock),
                None if guarding && clock >= breach.lodestone.rests_until => {
                    breach.lodestone.held_from = Some(clock);
                    self.tell(EventKind::HeldTrue, None, bearer, bearer, 0.0);
                }
                _ => {}
            }
            if breach.lodestone.held_from.is_some() {
                let held: Vec<PlayerId> = breach
                    .marked
                    .keys()
                    .copied()
                    .filter(|id| {
                        self.players.get(id).is_some_and(|found| {
                            found.living()
                                && apart([found.fighter.body.x, found.fighter.body.y], [body.x, body.y]) <= HOLD_REACH_M
                        })
                    })
                    .collect();
                for id in held {
                    breach.marked.remove(&id);
                    self.tell(EventKind::Cleansed, None, bearer, id, 0.0);
                }
            }
        }
        if let Stone::Lying(_, since) = breach.lodestone.stone {
            let most = if breach.tier == gear::breach::Tier::Hard { LYING_MOST.1 } else { LYING_MOST.0 };
            if breach.lodestone.needed && clock >= since + most {
                self.unwrite_all(breach);
            }
        }
    }

    /// A player marked Rewritten, once: told to every player.
    pub(crate) fn rewrite(&mut self, breach: &mut Breach, id: PlayerId) {
        if self.players.get(&id).is_some_and(crate::players::Player::living) && !breach.marked.contains_key(&id) {
            breach.marked.insert(id, self.clock);
            self.tell_all(EventKind::Rewritten, f64::from(id));
        }
    }

    /// The writing: every player marked Rewritten is unwritten (falls, whatever their guard), and the marks are
    /// spent.
    pub(crate) fn write(&mut self, breach: &mut Breach, writer: FighterId) {
        let marked: Vec<PlayerId> = std::mem::take(&mut breach.marked).into_keys().collect();
        let count = marked.len();
        for id in marked {
            self.harm_share(id, 4.0, writer);
        }
        if count > 0 {
            self.tell_all(EventKind::Unwritten, count as f64);
        }
    }

    /// The whole company unwritten: every living player falls, and while an encounter runs its attempt is lost
    /// (`keep_wipe`), so no one standing again in the moments after it saves it.
    pub(crate) fn unwrite_all(&mut self, breach: &mut Breach) {
        let living: Vec<PlayerId> =
            self.players.iter().filter(|(_, found)| found.living()).map(|(id, _)| *id).collect();
        breach.lodestone.needed = false;
        if breach.phases.iter().any(|phase| matches!(phase, super::Phase::Running(_))) {
            breach.lost.get_or_insert(self.clock);
        }
        if living.is_empty() {
            return;
        }
        for id in &living {
            self.harm_share(*id, 4.0, 0);
        }
        self.tell_all(EventKind::Unwritten, living.len() as f64);
    }

    /// What a foe's blow on a player weighs in a Breach's run: halved inside the Lodestone's Hold True.
    pub(crate) fn held_times(&self, defender: FighterId) -> f64 {
        let Some(breach) = self.breach.as_ref() else { return 1.0 };
        let (Some(bearer), Some(_)) = (breach.lodestone.bearer(), breach.lodestone.held_from) else { return 1.0 };
        let (Some(held), Some(defended)) = (self.players.get(&bearer), self.players.get(&defender)) else { return 1.0 };
        let (one, two) = (held.fighter.body, defended.fighter.body);
        if apart([one.x, one.y], [two.x, two.y]) <= HOLD_REACH_M { HELD_TIMES } else { 1.0 }
    }
}
