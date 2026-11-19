//! What a foe knows: itself and its room this tick, and whom it fights. Its target it sees with nothing between their
//! chests, and hunts where it last saw it for a while after losing sight. With no target, what it sees and hears stirs
//! its awareness; once alert, it takes the nearest it sees within its range and its arc.

use crate::World;
use crate::awareness::{latch, stir, strongest, woken};
use crate::brain::Brain;
use crate::dice::Dice;
use crate::noises::stir_of;
use crate::roles::Numbers;
use crate::tuning::{ENGAGE_RANGE, HUNT, OFF_FLOOR_NEAR, SHOOT_RANGE, SIGHT_ARC, SIGHT_GAIN};
use combat::lock::sees;
use combat::sight::{apart, bearing, off};
use combat::tuning::STRIKE_HEIGHT;
use combat::{Fighter, FighterId};

/// A foe in its room this tick: its id, its fighter, the room, its numbers and its dice.
#[derive(Clone, Copy, Debug)]
pub struct Here<'a, 'w> {
    pub me: FighterId,
    pub fighter: Fighter,
    pub world: &'a World<'w>,
    pub numbers: Numbers,
    pub dice: Dice,
}

impl Here<'_, '_> {
    #[must_use]
    pub fn tick(&self) -> u64 {
        self.world.tick
    }

    #[must_use]
    pub fn at(&self) -> [f64; 2] {
        [self.fighter.body.x, self.fighter.body.y]
    }

    #[must_use]
    pub fn feet(&self) -> [f64; 3] {
        [self.fighter.body.x, self.fighter.body.y, self.fighter.body.z]
    }

    /// A fighter of the room by id.
    #[must_use]
    pub fn find(&self, id: FighterId) -> Option<&Fighter> {
        self.world.fighters.iter().find(|(other, _)| *other == id).map(|(_, fighter)| fighter)
    }

    /// A living fighter of another side, by id.
    #[must_use]
    pub fn enemy(&self, id: FighterId) -> Option<&Fighter> {
        self.find(id).filter(|other| self.hostile(other))
    }

    /// Whether a fighter in hand is of another side and alive.
    #[must_use]
    pub fn hostile(&self, other: &Fighter) -> bool {
        other.side != self.fighter.side && !other.dead()
    }

    /// How far it fights from.
    #[must_use]
    pub fn range(&self) -> f64 {
        if self.numbers.shooter { SHOOT_RANGE } else { ENGAGE_RANGE }
    }

    /// Whole ticks in `seconds`.
    #[must_use]
    pub fn ticks(seconds: f64) -> u64 {
        u64::from(combat::ticks(seconds))
    }
}

/// Its target as it knows it: the fighter, whether it sees it now, and where it stands (or was last seen) from here.
#[derive(Clone, Copy, Debug)]
pub struct Sight {
    pub id: FighterId,
    pub fighter: Fighter,
    pub seen: bool,
    pub spot: [f64; 3],
    pub distance: f64,
    pub toward: f64,
}

/// Its target this tick, chosen or kept, with the brain's memory and awareness brought up to date: a target seen keeps
/// it fully aware; with none, the strongest sight or noise stirs it, and once alert it takes the nearest it sees.
pub fn sense(brain: &mut Brain, here: &Here<'_, '_>) -> Option<Sight> {
    let heard = core::mem::take(&mut brain.awareness.heard);
    let called = woken(brain, here, &heard);
    if let Some(sight) = kept(brain, here) {
        // Fighting or hunting its target it stays as aware as it was; seeing it, fully.
        if sight.seen {
            brain.awareness.level = 1.0;
        }
        latch(brain, here, called);
        return Some(sight);
    }
    let seen = in_sight(here);
    let glimpse = seen.iter().map(|(_, _, other, gain)| (*gain, feet(other))).fold(None, strongest);
    let glimpse = stirring(here).fold(glimpse, strongest);
    stir(brain, here, glimpse, &heard);
    latch(brain, here, called);
    if !brain.awareness.alert {
        return None;
    }
    let (_, id, other, _) =
        seen.into_iter().min_by(|first, second| first.0.total_cmp(&second.0).then(first.1.cmp(&second.1)))?;
    brain.target = Some(id);
    brain.last_seen = Some(feet(&other));
    brain.seen_at = here.tick();
    brain.awareness.look = None;
    Some(sight(here, id, &other, true, brain.last_seen))
}

/// The stir of every foe of another side it hears, each with what it adds and where.
fn stirring<'here>(here: &'here Here<'_, '_>) -> impl Iterator<Item = (f64, [f64; 3])> + 'here {
    let heard =
        |other: &Fighter| stir_of(other).map(|noise| (noise.heard_at(here.feet(), here.world.blocks), noise.at));
    here.world.fighters.iter().filter(|(_, other)| here.hostile(other)).filter_map(move |(_, other)| heard(other))
}

fn feet(fighter: &Fighter) -> [f64; 3] {
    [fighter.body.x, fighter.body.y, fighter.body.z]
}

/// Its target kept: seen, its place noted; or hunted where it was last seen for a while (a blow from out of sight shows
/// where it came from). Past that, or once it falls, let go, its last place kept to search.
fn kept(brain: &mut Brain, here: &Here<'_, '_>) -> Option<Sight> {
    let tick = here.tick();
    let target = brain.target?;
    match here.enemy(target) {
        Some(other) if sees(here.world.blocks, &here.fighter, other) => {
            brain.last_seen = Some(feet(other));
            brain.seen_at = tick;
            Some(sight(here, target, other, true, brain.last_seen))
        }
        Some(other) if tick <= brain.seen_at + Here::ticks(HUNT) => {
            let last = *brain.last_seen.get_or_insert_with(|| feet(other));
            Some(sight(here, target, other, false, Some(last)))
        }
        _ => {
            brain.target = None;
            brain.awareness.look = None;
            None
        }
    }
}

/// Every fighter of another side it sees: within its range, within its arc, nothing between their chests. Each with
/// its distance, its id and what seeing it adds to awareness this tick: most near and dead ahead, nothing at the edge
/// of its range or its arc.
fn in_sight(here: &Here<'_, '_>) -> Vec<(f64, FighterId, Fighter, f64)> {
    let at = here.at();
    let edge = libm::cos(SIGHT_ARC);
    here.world
        .fighters
        .iter()
        .filter(|(_, other)| here.hostile(other))
        .filter_map(|(id, other)| {
            let distance = apart(at, [other.body.x, other.body.y]);
            let turn = off(here.fighter.aim, bearing(at, [other.body.x, other.body.y]));
            let seen = distance <= here.range() && turn <= SIGHT_ARC && sees(here.world.blocks, &here.fighter, other);
            let ahead = (libm::cos(turn) - edge) / (1.0 - edge);
            let gain = SIGHT_GAIN * (1.0 - distance / here.range()) * ahead / 60.0;
            seen.then_some((distance, *id, *other, gain))
        })
        .collect()
}

fn sight(here: &Here<'_, '_>, id: FighterId, other: &Fighter, seen: bool, last: Option<[f64; 3]>) -> Sight {
    let spot = last.unwrap_or_else(|| here.feet());
    let at = here.at();
    let across = apart(at, [spot[0], spot[1]]);
    // Near across but on a ledge over it or under it, out of a blow's height, a target is as far as the way there: the
    // foe climbs or drops to it rather than swing at it in vain.
    let off_floor = across <= OFF_FLOOR_NEAR && (spot[2] - here.feet()[2]).abs() > STRIKE_HEIGHT;
    let walk = || here.world.routes.length(here.feet(), spot).map_or(across, |walk| walk.max(across));
    Sight {
        id,
        fighter: *other,
        seen,
        spot,
        distance: if off_floor { walk() } else { across },
        toward: bearing(at, [spot[0], spot[1]]),
    }
}
