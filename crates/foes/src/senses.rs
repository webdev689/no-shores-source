//! What a foe knows: itself and its room this tick, and whom it fights. It sees a fighter of another side within its
//! range with nothing between their chests; it keeps hunting its target where it last saw it for a while after losing
//! sight; with no target it takes the nearest it sees.

use crate::World;
use crate::brain::Brain;
use crate::dice::Dice;
use crate::kinds::KindNumbers;
use crate::tuning::{ENGAGE_RANGE, HUNT, SHOOT_RANGE};
use combat::lock::sees;
use combat::sight::{apart, bearing};
use combat::{Fighter, FighterId};

/// A foe in its room this tick: its id, its fighter, the room, its kind's numbers and its dice.
#[derive(Clone, Copy, Debug)]
pub struct Here<'a, 'w> {
    pub me: FighterId,
    pub fighter: Fighter,
    pub world: &'a World<'w>,
    pub numbers: KindNumbers,
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
        self.find(id).filter(|other| other.side != self.fighter.side && !other.dead())
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

/// Its target this tick, chosen or kept, with the brain's memory of it brought up to date.
pub fn sense(brain: &mut Brain, here: &Here<'_, '_>) -> Option<Sight> {
    let tick = here.tick();
    if let Some(target) = brain.target {
        match here.enemy(target) {
            Some(other) if sees(here.world.blocks, &here.fighter, other) => {
                brain.last_seen = Some([other.body.x, other.body.y, other.body.z]);
                brain.seen_at = tick;
                return Some(sight(here, target, other, true, brain.last_seen));
            }
            Some(other) if tick <= brain.seen_at + Here::ticks(HUNT) => {
                return Some(sight(here, target, other, false, brain.last_seen));
            }
            _ => brain.target = None,
        }
    }
    let at = here.at();
    let (_, id, other) = here
        .world
        .fighters
        .iter()
        .filter(|(id, _)| here.enemy(*id).is_some())
        .map(|(id, other)| (apart(at, [other.body.x, other.body.y]), *id, *other))
        .filter(|(distance, _, other)| *distance <= here.range() && sees(here.world.blocks, &here.fighter, other))
        .min_by(|first, second| first.0.total_cmp(&second.0).then(first.1.cmp(&second.1)))?;
    brain.target = Some(id);
    brain.last_seen = Some([other.body.x, other.body.y, other.body.z]);
    brain.seen_at = tick;
    Some(sight(here, id, &other, true, brain.last_seen))
}

fn sight(here: &Here<'_, '_>, id: FighterId, other: &Fighter, seen: bool, last: Option<[f64; 3]>) -> Sight {
    let spot = last.unwrap_or_else(|| here.feet());
    let at = here.at();
    Sight {
        id,
        fighter: *other,
        seen,
        spot,
        distance: apart(at, [spot[0], spot[1]]),
        toward: bearing(at, [spot[0], spot[1]]),
    }
}
