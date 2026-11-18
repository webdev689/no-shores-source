//! The noises a fighter makes: a shot loosed (a gun's bang carries far, a bow's twang barely), a swing begun or a blow
//! landing, and a runner's feet. Sound passes through blocks. The room tells every foe of every noise; a foe heeds
//! only those of another side, each adding to its awareness less the farther off it was made.

use crate::tuning::{
    BLOW_LOUDNESS, BLOW_REACH, BOW_LOUDNESS, BOW_REACH, GUN_LOUDNESS, GUN_REACH, RUN_EVERY, RUN_LOUDNESS, RUN_REACH,
};
use combat::fighter::Side;
use combat::sight::apart;
use combat::{Fighter, Ranged};

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

    /// The awareness it adds to a foe standing at `at`: its loudness, falling away evenly to nothing at its reach.
    #[must_use]
    pub fn heard_at(&self, at: [f64; 2]) -> f64 {
        let distance = apart(at, [self.at[0], self.at[1]]);
        if distance >= self.reach { 0.0 } else { self.loudness * (1.0 - distance / self.reach) }
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

/// A runner's feet, once each half second of the room's clock, faster than a walk on the ground.
#[must_use]
pub fn running(fighter: &Fighter, tick: u64) -> Option<Noise> {
    let body = &fighter.body;
    let speed = (body.vx * body.vx + body.vy * body.vy).sqrt();
    let runs = !fighter.dead() && body.mode == movement::Mode::Ground && speed > movement::TUNING.walk + 0.1;
    let beat = tick.is_multiple_of(u64::from(combat::ticks(RUN_EVERY)));
    (runs && beat).then(|| Noise::by(fighter, RUN_LOUDNESS, RUN_REACH))
}
