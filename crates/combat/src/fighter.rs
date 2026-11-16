//! A fighter: its body, what it holds, its health, stamina and poise, what it is doing, and the windows a fight opens
//! for it. And what its player or its brain asks of it each tick.

use crate::arms::{Arms, Stroke};
use crate::shapes::{Telegraph, TelegraphOrder};
use crate::tuning::{PLAYER_HEALTH, PLAYER_POISE, STAMINA};
use movement::{Body, Controls};

/// A fighter's number in a room: players and foes share one count, never reused while the room lives.
pub type FighterId = u32;

/// Which side a fighter fights for: fighters on different sides are foes to each other.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Players = 0,
    Foes = 1,
}

/// How heavy a fighter is: how long a broken poise staggers it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Weight {
    Light = 0,
    Medium = 1,
    Heavy = 2,
    Massive = 3,
}

impl Weight {
    /// How long a broken poise staggers a fighter this heavy: the light longest.
    #[must_use]
    pub fn stagger_ticks(self) -> u32 {
        match self {
            Weight::Light => 84,
            Weight::Medium => 72,
            Weight::Heavy => 60,
            Weight::Massive => 48,
        }
    }
}

/// What kind of swing is struck: a plain one, a riposte at a fighter its striker parried, or the counter a perfect
/// dodge earned.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Swing {
    Plain,
    Riposte(FighterId),
    Counter,
}

/// A swing under way: its stroke, ticks since it began, when its blow lands and when it ends, its kind, and whether
/// the left hand strikes it (a pair's every other blow).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Attack {
    pub stroke: Stroke,
    pub elapsed: u32,
    pub strike: u32,
    pub end: u32,
    pub swing: Swing,
    pub left_hand: bool,
}

/// Why a fighter is staggered.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cause {
    Poise = 0,
    Parried = 1,
    GuardBroken = 2,
}

/// What a fighter is doing. Every timer counts ticks.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Action {
    Idle,
    Attack(Attack),
    /// A guard held: ticks since it was raised, and how long the parry window its press opened lasts.
    Guard {
        elapsed: u32,
        window: u32,
    },
    /// The deflect a parry plays.
    Parry {
        elapsed: u32,
    },
    /// A dodge's hop: ticks since it began, and the way it goes.
    Dodge {
        elapsed: u32,
        toward: [f64; 2],
    },
    Flinch {
        left: u32,
    },
    Staggered {
        left: u32,
        cause: Cause,
    },
    Down {
        left: u32,
    },
    /// A foe's telegraphed blow, winding up.
    Telegraph(Telegraph),
    /// A foe whose telegraphed blow found no one, open to punishment.
    Overreach {
        left: u32,
    },
    /// A bow drawn: ticks since the draw began.
    Draw {
        elapsed: u32,
    },
    Reload {
        left: u32,
    },
    Dead {
        elapsed: u32,
    },
}

/// The buttons held at the last tick, so a press is told from a hold.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Held {
    pub attack: bool,
    pub guard: bool,
    pub dodge: bool,
    pub shoot: bool,
}

/// A fighter and everything a fight keeps for it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Fighter {
    pub side: Side,
    pub body: Body,
    pub arms: Arms,
    pub weight: Weight,
    pub health: f64,
    pub health_max: f64,
    pub stamina: f64,
    /// Ticks since stamina was last spent.
    pub stamina_rest: u32,
    pub poise: f64,
    pub poise_max: f64,
    /// Ticks since a blow last filled the poise, and ticks left when no poise stagger can begin.
    pub poise_rest: u32,
    pub poise_immune: u32,
    pub action: Action,
    /// The bearing its arms point: where it swings and guards. Its body faces it while it fights.
    pub aim: f64,
    /// The foe its soft lock holds, and for how long the lock has been turned away from it or lost sight of it.
    pub target: Option<FighterId>,
    pub lock_away: u32,
    pub lock_unseen: u32,
    /// A staggered foe open to this fighter's riposte, and the ticks left to strike it.
    pub riposte: Option<(FighterId, u32)>,
    /// Ticks left for the counter a perfect dodge earned.
    pub counter: u32,
    /// Ticks left overreached: it takes more, and the first blow landed staggers it.
    pub punished: u32,
    /// Ticks since a parry window passed unused, while that still rushes the next press; 0 for none.
    pub missed_parry: u32,
    pub held: Held,
    /// The swings struck so far, so a pair's blows take turns between the hands.
    pub blows: u32,
    /// What its blows' damage is multiplied by: 1 for a player, its kind's for a foe.
    pub might: f64,
}

/// What a player's controls or a foe's brain asks of a fighter in a tick: the movement's controls and the fight's.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Intent {
    pub controls: Controls,
    pub combat: CombatInput,
}

/// The fight's buttons: the stroke a swing would take while the attack button is held (DFO picks it from the mouse's
/// drag), the guard held, the dodge held, a shot held, the look's pitch for a shot, and for a foe a telegraphed blow
/// its brain begins.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct CombatInput {
    pub attack: Option<Stroke>,
    pub guard: bool,
    pub dodge: bool,
    pub shoot: bool,
    pub pitch: f64,
    pub telegraph: Option<TelegraphOrder>,
}

/// A fresh fighter for a side, standing in `body`, with what it holds, its weight, health and poise; its stamina full
/// and its aim where it faces.
#[must_use]
pub fn fighter(side: Side, body: Body, arms: Arms, weight: Weight, health: f64, poise: f64) -> Fighter {
    Fighter {
        side,
        body,
        arms,
        weight,
        health,
        health_max: health,
        stamina: STAMINA,
        stamina_rest: 0,
        poise: 0.0,
        poise_max: poise,
        poise_rest: 0,
        poise_immune: 0,
        action: Action::Idle,
        aim: body.facing,
        target: None,
        lock_away: 0,
        lock_unseen: 0,
        riposte: None,
        counter: 0,
        punished: 0,
        missed_parry: 0,
        held: Held::default(),
        blows: 0,
        might: 1.0,
    }
}

/// A player's fighter, as one joins a room or stands again.
#[must_use]
pub fn player(body: Body, arms: Arms) -> Fighter {
    fighter(Side::Players, body, arms, Weight::Medium, PLAYER_HEALTH, PLAYER_POISE)
}

impl Fighter {
    #[must_use]
    pub fn dead(&self) -> bool {
        matches!(self.action, Action::Dead { .. })
    }

    /// Whether blows pass through it now: in its dodge's safe stretch. And whether this is the perfect stretch.
    #[must_use]
    pub fn dodging(&self) -> Option<bool> {
        use crate::tuning::{DODGE_PERFECT, DODGE_SAFE};
        match self.action {
            Action::Dodge { elapsed, .. } if (DODGE_SAFE.0..=DODGE_SAFE.1).contains(&elapsed) => {
                Some(elapsed <= DODGE_PERFECT)
            }
            _ => None,
        }
    }

    /// Whether its guard is up, and whether its parry window is open.
    #[must_use]
    pub fn guarding(&self) -> Option<bool> {
        match self.action {
            Action::Guard { elapsed, window } => Some(elapsed < window),
            Action::Parry { .. } => Some(false),
            _ => None,
        }
    }

    /// Whether it is staggered by anything: it takes more from every blow.
    #[must_use]
    pub fn staggered(&self) -> bool {
        matches!(self.action, Action::Staggered { .. } | Action::Down { .. })
    }

    /// Its chest, where blows and shots aim and a lock's mark stands.
    #[must_use]
    pub fn chest(&self) -> [f64; 3] {
        [self.body.x, self.body.y, self.body.z + 1.1]
    }
}
