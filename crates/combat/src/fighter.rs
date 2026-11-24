//! A fighter: its body, what it holds, its health, stamina and poise, what it is doing, and the windows a fight opens
//! for it. And what its player or its brain asks of it each tick.

use crate::arms::{Arms, Stroke};
use crate::shapes::{Telegraph, TelegraphOrder};
use crate::tuning::{PLAYER_HEALTH, PLAYER_POISE, STAMINA};
use movement::{Body, Controls};

/// A fighter's number in a room: players and foes share one count, never reused while the room lives.
pub type FighterId = u32;

/// Which side a fighter fights for: the players, or a faction of foes by its number (1 and up). Fighters on different
/// sides are foes to each other, so factions fight the players and each other alike.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Players,
    Faction(u8),
}

impl Side {
    #[must_use]
    pub fn is_players(self) -> bool {
        self == Side::Players
    }

    /// The side as one number, as floats and the wire carry it: 0 for the players, else the faction's number.
    #[must_use]
    pub fn number(self) -> u8 {
        match self {
            Side::Players => 0,
            Side::Faction(faction) => faction,
        }
    }

    /// The side a number names: 0 the players, any other a faction.
    #[must_use]
    pub fn from_number(number: u8) -> Side {
        if number == 0 { Side::Players } else { Side::Faction(number) }
    }
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
    Charged = 3,
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
    /// A bow, a crossbow or a gun raised to aim: ticks since it was raised, which a bow's draw charges by.
    Draw {
        elapsed: u32,
    },
    Reload {
        left: u32,
    },
    /// A healing charge drunk: ticks since it began. Its health comes as it ends; a blow cuts it short.
    Drink {
        elapsed: u32,
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
    pub heal: bool,
}

/// Presses not yet acted on, each kept PRESS_KEPT ticks, so one made while the fighter is busy is acted on as soon
/// as it can be: ticks left for the attack (and its stroke), the guard, the dodge, a trigger pulled in a swap, and a
/// drink asked.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Kept {
    pub attack: u8,
    pub stroke: Option<Stroke>,
    pub guard: u8,
    pub dodge: u8,
    pub shoot: u8,
    pub heal: u8,
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
    /// The foe its soft lock holds, and for how long the lock has lost sight of it.
    pub target: Option<FighterId>,
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
    pub kept: Kept,
    /// The swings struck so far, so a pair's blows take turns between the hands.
    pub blows: u32,
    /// Ticks left of a swap between loadouts, in which no blow or shot starts.
    pub swap: u32,
    /// Whether a double pistolet's right shot has gone, so its next is the left's, which it reloads after.
    pub fired_right: bool,
    /// What its blows' damage is multiplied by: 1 for a player, its kind's for a foe.
    pub might: f64,
    /// What its gear trims of the fight's numbers: nothing for a foe.
    pub trim: crate::trim::Trim,
    /// What it has been given: Crit, Expose, Charge, Haste, Linked and Veiled, each with its ticks left.
    pub statuses: crate::status::Statuses,
    /// The shots its Ranged weapon has left, which its player's gear keeps; none for a foe, whose never run dry.
    pub ammo: Option<u32>,
    /// Whether it is driven by the rules on the players' side, as the Brig's crew are: it fights by a foe's rules (its
    /// reach, parry window and telegraphed blows) while no player strikes it, nor it a player.
    pub ally: bool,
    /// The healing charges it holds (a player's, 0 to `CHARGES`; a foe never has one), and how far its blows have
    /// filled the next, 0 to 1.
    pub charges: u8,
    pub meter: f64,
}

/// What a player's controls or a foe's brain asks of a fighter in a tick: the movement's controls and the fight's.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Intent {
    pub controls: Controls,
    pub combat: CombatInput,
}

/// The fight's buttons: the stroke a swing would take while the attack button is held (the player's page rolls it, as
/// Daggerfall Unity's click to attack does), the guard held, the dodge held, the shot's trigger held, the look's pitch
/// for a shot, a ranged weapon held up to aim, the point an aimed shot is laid on (the crosshair's; along the look if
/// none), a healing charge asked for, and for a foe a telegraphed blow its brain begins.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct CombatInput {
    pub attack: Option<Stroke>,
    pub guard: bool,
    pub dodge: bool,
    pub shoot: bool,
    pub pitch: f64,
    pub aim: bool,
    pub mark: Option<[f64; 3]>,
    pub heal: bool,
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
        lock_unseen: 0,
        riposte: None,
        counter: 0,
        punished: 0,
        missed_parry: 0,
        held: Held::default(),
        kept: Kept::default(),
        blows: 0,
        swap: 0,
        fired_right: false,
        might: 1.0,
        trim: crate::trim::Trim::PLAIN,
        statuses: crate::status::Statuses::NONE,
        ammo: None,
        ally: false,
        charges: 0,
        meter: 0.0,
    }
}

/// A player's fighter, as one joins a room or stands again: every healing charge full.
#[must_use]
pub fn player(body: Body, arms: Arms) -> Fighter {
    let fresh = fighter(Side::Players, body, arms, Weight::Medium, PLAYER_HEALTH, PLAYER_POISE);
    Fighter { charges: crate::tuning::CHARGES, ..fresh }
}

impl Fighter {
    /// Whether a player fights as it: on the players' side, and no ally the rules drive.
    #[must_use]
    pub fn is_player(&self) -> bool {
        self.side.is_players() && !self.ally
    }

    /// Whether it swings a player's pair (`arms::PAIR_PACE`): a foe's pair swings as its lone weapon.
    #[must_use]
    pub fn swings_a_pair(&self) -> bool {
        self.is_player() && self.arms.off_hand == crate::arms::OffHand::Weapon
    }

    /// The ticks from its swing's start to its blow landing, and to its end: a player's pair's at `arms::PAIR_PACE`, a
    /// foe's at `arms::FOE_SWING_PACE`; a player's companions swing as players do.
    #[must_use]
    pub fn swing_ticks(&self) -> (u32, u32) {
        let melee = self.arms.melee;
        if !self.side.is_players() {
            crate::arms::foe_swing_ticks(melee)
        } else if self.swings_a_pair() {
            crate::arms::pair_swing_ticks(melee)
        } else {
            crate::arms::swing_ticks(melee)
        }
    }

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

    /// The fighter holding `arms`, taken up only at rest (or dead): a weapon is never changed in the middle of a swing,
    /// a guard, a draw or a reload. A weapon changed for another, as a loadout for the other, or put away starts a
    /// swap; one taken up from bare hands is drawn at once, though a swap begun as another was put away runs on. A swap
    /// begun is the newest press: a click or a pull kept for an earlier one's end is let go.
    #[must_use]
    pub fn holding(&self, arms: Arms) -> Self {
        if !matches!(self.action, Action::Idle | Action::Dead { .. }) {
            return *self;
        }
        let weapon = |arms: Arms| arms.melee != crate::arms::WeaponClass::Fists || arms.ranged.is_some();
        let changed = (arms.melee, arms.ranged) != (self.arms.melee, self.arms.ranged);
        if !(changed && weapon(self.arms)) {
            return Fighter { arms, ..*self };
        }
        let kept = Kept { attack: 0, stroke: None, shoot: 0, ..self.kept };
        Fighter { arms, swap: crate::tuning::SWAP_TICKS, kept, ..*self }
    }

    /// Whether it is staggered by anything: it takes more from every blow.
    #[must_use]
    pub fn staggered(&self) -> bool {
        matches!(self.action, Action::Staggered { .. } | Action::Down { .. })
    }

    /// Whether its Ranged weapon has a shot to fire.
    #[must_use]
    pub fn loaded(&self) -> bool {
        self.ammo.is_none_or(|left| left > 0)
    }

    /// Its chest, where blows and shots aim and a lock's mark stands.
    #[must_use]
    pub fn chest(&self) -> [f64; 3] {
        [self.body.x, self.body.y, self.body.z + crate::tuning::CHEST]
    }
}
