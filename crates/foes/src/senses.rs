//! What a foe knows: itself and its room this tick, and whom it fights. Its target it sees with nothing between their
//! chests, and hunts where it last saw it for a while after losing sight. With no target, what it sees and hears stirs
//! its awareness; once alert, it takes one it sees within its range and its arc: the nearest, unless the foes already
//! at it make another sooner to strike (share).

use crate::World;
use crate::awareness::{latch, stir, strongest, woken};
use crate::board::Board;
use crate::brain::Brain;
use crate::dice::Dice;
use crate::leash::within;
use crate::noises::stir_of;
use crate::roles::Numbers;
use crate::share::sooner;
use crate::tuning::{ENGAGE_RANGE, FOE_PACE, HUNT, OFF_FLOOR_NEAR, SHOOT_RANGE, SIGHT_ARC, SIGHT_GAIN};
use combat::lock::sees;
use combat::sight::{apart, bearing, off};
use combat::tuning::STRIKE_HEIGHT;
use combat::{Fighter, FighterId, Status};
use movement::TUNING;

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

    /// The most of a player's walk or run it asks of itself: a foe's share (`FOE_PACE`), an ally's whole.
    #[must_use]
    pub fn pace(&self) -> f64 {
        if self.fighter.side.is_players() { 1.0 } else { FOE_PACE }
    }

    /// How fast it walks, and runs, in metres a second, at its own pace: Hasted, faster.
    #[must_use]
    pub fn walk(&self) -> f64 {
        TUNING.walk * self.pace() * combat::status::pace(&self.fighter)
    }

    #[must_use]
    pub fn run(&self) -> f64 {
        TUNING.run * self.pace() * combat::status::pace(&self.fighter)
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

    /// Whether a fighter in hand is of another side, alive, and not Veiled: a Veiled fighter is never seen, taken as a
    /// target nor aimed at, and a foe holding one as its target lets it go.
    #[must_use]
    pub fn hostile(&self, other: &Fighter) -> bool {
        other.side != self.fighter.side && !other.dead() && !other.statuses.has(Status::Veiled)
    }

    /// Whether a fighter of the room, by its id, is another of this foe's side, alive.
    #[must_use]
    pub fn ally(&self, id: FighterId, other: &Fighter) -> bool {
        id != self.me && other.side == self.fighter.side && !other.dead()
    }

    /// The way round something by the sign of `turn` (1 clockwise, -1 not); dead on, the way its number picks, the
    /// same on every machine.
    #[must_use]
    pub fn way_round(&self, turn: f64) -> f64 {
        if turn > 0.0 || (turn == 0.0 && self.me.is_multiple_of(2)) { 1.0 } else { -1.0 }
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
/// it fully aware; with none, the strongest sight or noise stirs it, and once alert it takes the nearest it sees, or
/// one the foes at the nearest make sooner to strike.
pub fn sense(brain: &mut Brain, here: &Here<'_, '_>, board: &Board) -> Option<Sight> {
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
    let mut seen = in_sight(here);
    let glimpse = seen.iter().map(|(_, _, other, gain)| (*gain, feet(other))).fold(None, strongest);
    let glimpse = stirring(here).fold(glimpse, strongest);
    stir(brain, here, glimpse, &heard);
    latch(brain, here, called);
    if !brain.awareness.alert {
        return None;
    }
    // It takes only one its leash lets it fight; any it sees still stirs it.
    seen.retain(|(_, _, other, _)| within(brain, here, other));
    let nearest = *seen.iter().min_by(|first, second| first.0.total_cmp(&second.0).then(first.1.cmp(&second.1)))?;
    let (_, id, other, _) = *sooner(brain, here, board, (nearest.1, nearest.0), &seen).unwrap_or(&nearest);
    brain.target = Some(id);
    brain.last_seen = Some(feet(&other));
    brain.seen_at = here.tick();
    brain.awareness.look = None;
    Some(sight(here, id, &other, true, brain.last_seen))
}

/// The stir of every foe of another side it hears, each with what it adds and where.
fn stirring<'here>(here: &'here Here<'_, '_>) -> impl Iterator<Item = (f64, [f64; 3])> + 'here {
    let heard = |other: &Fighter| {
        stir_of(other).map(|noise| (noise.heard_at(here.feet(), here.world.blocks, here.world.terrain), noise.at))
    };
    here.world.fighters.iter().filter(|(_, other)| here.hostile(other)).filter_map(move |(_, other)| heard(other))
}

pub(crate) fn feet(fighter: &Fighter) -> [f64; 3] {
    [fighter.body.x, fighter.body.y, fighter.body.z]
}

/// Its target kept: seen, its place noted; or hunted where it was last seen for a while (a blow from out of sight shows
/// where it came from). Past that, or once it falls, let go, its last place kept to search.
fn kept(brain: &mut Brain, here: &Here<'_, '_>) -> Option<Sight> {
    let tick = here.tick();
    let target = brain.target?;
    match here.enemy(target) {
        Some(other) if sees(here.world.blocks, here.world.terrain, &here.fighter, other) => {
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
pub(crate) fn in_sight(here: &Here<'_, '_>) -> Vec<(f64, FighterId, Fighter, f64)> {
    let at = here.at();
    let edge = libm::cos(SIGHT_ARC);
    here.world
        .fighters
        .iter()
        .filter(|(_, other)| here.hostile(other))
        .filter_map(|(id, other)| {
            let distance = apart(at, [other.body.x, other.body.y]);
            let turn = off(here.fighter.aim, bearing(at, [other.body.x, other.body.y]));
            let seen = distance <= here.range()
                && turn <= SIGHT_ARC
                && sees(here.world.blocks, here.world.terrain, &here.fighter, other);
            let ahead = (libm::cos(turn) - edge) / (1.0 - edge);
            let gain = SIGHT_GAIN * (1.0 - distance / here.range()) * ahead / 60.0;
            seen.then_some((distance, *id, *other, gain))
        })
        .collect()
}

pub(crate) fn sight(here: &Here<'_, '_>, id: FighterId, other: &Fighter, seen: bool, last: Option<[f64; 3]>) -> Sight {
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
