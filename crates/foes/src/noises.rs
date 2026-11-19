//! The noises a fighter makes: a shot loosed (a gun's bang carries far, a bow's twang barely), a swing begun or a blow
//! landing, a runner's feet, and a foe's own stir. One heard through a block carries half as loud and half as far. The
//! room tells every foe of every noise; a foe heeds only those of another side, each adding to its awareness less the
//! farther off it was made.

use crate::tuning::{
    BLOW_LOUDNESS, BLOW_REACH, BOW_LOUDNESS, BOW_REACH, GUN_LOUDNESS, GUN_REACH, MUFFLED, PRESENCE_LOUDNESS,
    PRESENCE_REACH, RUN_EVERY, RUN_LOUDNESS, RUN_REACH,
};
use combat::fighter::Side;
use combat::sight::{apart, clear_line};
use combat::tuning::CHEST;
use combat::{Fighter, Ranged};
use movement::Block;

/// A noise: where it was made and by which side, the awareness it adds there, and how far it carries.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Noise {
    pub at: [f64; 3],
    pub side: Side,
    pub loudness: f64,
    pub reach: f64,
}

impl Noise {
    /// A noise of `loudness` and `reach` made where `fighter` stands.
    #[must_use]
    pub fn by(fighter: &Fighter, loudness: f64, reach: f64) -> Self {
        Noise { at: [fighter.body.x, fighter.body.y, fighter.body.z], side: fighter.side, loudness, reach }
    }

    /// The awareness it adds to a foe whose feet stand at `at`: its loudness, falling away evenly to nothing at its
    /// reach; through a block between their chests, half as loud and reaching half as far.
    #[must_use]
    pub fn heard_at(&self, at: [f64; 3], blocks: &[Block]) -> f64 {
        let distance = apart([at[0], at[1]], [self.at[0], self.at[1]]);
        if distance >= self.reach {
            return 0.0;
        }
        let chest = |point: [f64; 3]| [point[0], point[1], point[2] + CHEST];
        let share = if clear_line(blocks, chest(self.at), chest(at)) { 1.0 } else { MUFFLED };
        let reach = self.reach * share;
        if distance >= reach { 0.0 } else { self.loudness * share * (1.0 - distance / reach) }
    }
}

/// A shot loosed by `fighter` with its ranged weapon: a gun's bang, or a bow's or a crossbow's twang.
#[must_use]
pub fn shot(fighter: &Fighter, ranged: Ranged) -> Noise {
    match ranged {
        Ranged::Pistolet | Ranged::Thunderlock => Noise::by(fighter, GUN_LOUDNESS, GUN_REACH),
        Ranged::Bow | Ranged::Crossbow => Noise::by(fighter, BOW_LOUDNESS, BOW_REACH),
    }
}

/// A swing begun by `fighter`: steel through the air.
#[must_use]
pub fn swing(fighter: &Fighter) -> Noise {
    Noise::by(fighter, BLOW_LOUDNESS, BLOW_REACH)
}

/// A blow `striker` landed on `defender`, heard where it landed: on flesh, on steel or on a guard.
#[must_use]
pub fn landed(striker: &Fighter, defender: &Fighter) -> Noise {
    Noise { at: [defender.body.x, defender.body.y, defender.body.z], ..swing(striker) }
}

/// A foe's own stir (its gear, its breath), heard by foes of other factions about it each tick it stands alive:
/// so foes of two factions find each other across a room, where a player is never heard so.
#[must_use]
pub fn stir_of(fighter: &Fighter) -> Option<Noise> {
    let foe = !fighter.side.is_players() && !fighter.dead();
    foe.then(|| Noise::by(fighter, PRESENCE_LOUDNESS / 60.0, PRESENCE_REACH))
}

/// A runner's feet, once each half second of the room's clock, faster than a walk on the ground.
#[must_use]
pub fn running(fighter: &Fighter, tick: u64) -> Option<Noise> {
    let body = &fighter.body;
    let speed = libm::sqrt(body.vx * body.vx + body.vy * body.vy);
    let runs = !fighter.dead() && body.mode == movement::Mode::Ground && speed > movement::TUNING.walk + 0.1;
    let beat = tick.is_multiple_of(u64::from(combat::ticks(RUN_EVERY)));
    (runs && beat).then(|| Noise::by(fighter, RUN_LOUDNESS, RUN_REACH))
}
