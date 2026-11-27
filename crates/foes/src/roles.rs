//! The roles foes fight in, the game's own table: five templates of behaviour, each with its base numbers as a Major
//! of the role. How much it takes, how quickly and how it answers a blow, and which telegraphed blows it throws; an
//! enemy type (the roster) gives it its hands and its faction, and its rank scales it.

use combat::arms::SWING_PACE;
use combat::fighter::Weight;
use combat::shapes::Shape;
use core::ops::Deref;

/// The roles, numbered as the wire carries them.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Role {
    Skirmisher = 1,
    Swordsman = 2,
    Brute = 3,
    Archer = 4,
    Captain = 5,
}

impl Role {
    pub const ALL: [Role; 5] = [Role::Skirmisher, Role::Swordsman, Role::Brute, Role::Archer, Role::Captain];

    /// The role a number names (1 to 5), or none.
    #[must_use]
    pub fn from_number(number: u8) -> Option<Role> {
        Self::ALL.iter().copied().find(|role| *role as u8 == number)
    }

    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Role::Skirmisher => "skirmisher",
            Role::Swordsman => "swordsman",
            Role::Brute => "brute",
            Role::Archer => "archer",
            Role::Captain => "captain",
        }
    }
}

/// A short list of telegraphed shapes, in the order a foe picks among them, kept by value so a rank can build its own.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Shapes {
    list: [Shape; 7],
    count: usize,
}

impl Shapes {
    pub const NONE: Shapes = Shapes { list: [Shape::Lunge; 7], count: 0 };

    #[must_use]
    pub const fn of(shapes: &[Shape]) -> Shapes {
        let mut list = [Shape::Lunge; 7];
        let mut i = 0;
        while i < shapes.len() && i < list.len() {
            list[i] = shapes[i];
            i += 1;
        }
        Shapes { list, count: i }
    }

    /// These and `shape` after them, unless it is already among them.
    #[must_use]
    pub fn with(self, shape: Shape) -> Shapes {
        if self.contains(&shape) || self.count == self.list.len() {
            return self;
        }
        let mut list = self.list;
        list[self.count] = shape;
        Shapes { list, count: self.count + 1 }
    }
}

impl Deref for Shapes {
    type Target = [Shape];

    fn deref(&self) -> &[Shape] {
        &self.list[..self.count]
    }
}

/// A foe's numbers: the forge layers in its right and left hands, its health, poise, weight and might; the ticks from
/// seeing a swing begin to answering it, and the shares of swings it parries, blocks and dodges (the rest it takes);
/// the telegraphed blows it throws; whether it is elite (TELL's higher tier: quicker wind-ups and cooldowns, one blow
/// in three iron, chains), feints, runs when badly hurt, or shoots; how many phases it fights in; and how many times
/// a plain shooter's distance it stands off at.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Numbers {
    pub right: &'static str,
    pub left: &'static str,
    pub health: f64,
    pub poise: f64,
    pub weight: Weight,
    pub might: f64,
    pub reaction: u64,
    pub parry: f64,
    pub block: f64,
    pub dodge: f64,
    pub shapes: Shapes,
    pub elite: bool,
    pub feints: bool,
    pub coward: bool,
    pub shooter: bool,
    pub phases: u8,
    pub standoff: f64,
}

const PLAIN: Numbers = Numbers {
    right: "",
    left: "",
    health: 1.0,
    poise: 1.0,
    weight: Weight::Medium,
    might: 1.0,
    reaction: 16,
    parry: 0.0,
    block: 0.0,
    dodge: 0.0,
    shapes: Shapes::NONE,
    elite: false,
    feints: false,
    coward: false,
    shooter: false,
    phases: 1,
    standoff: 1.0,
};

/// Each role's numbers as a Major. A skirmisher lives by not being hit and runs when it is; a swordsman's shield takes
/// blows; a brute stands through them until its poise breaks; an archer keeps its distance; a captain does
/// everything, and its blade's whole set.
#[must_use]
pub fn numbers(role: Role) -> Numbers {
    match role {
        Role::Skirmisher => Numbers {
            health: 45.0,
            poise: 18.0,
            weight: Weight::Light,
            reaction: 15,
            parry: 0.05,
            dodge: 0.45,
            shapes: Shapes::of(&[Shape::Lunge]),
            coward: true,
            ..PLAIN
        },
        Role::Swordsman => Numbers {
            health: 70.0,
            poise: 35.0,
            parry: 0.15,
            block: 0.35,
            dodge: 0.1,
            shapes: Shapes::of(&[Shape::Sweep, Shape::Lunge]),
            ..PLAIN
        },
        Role::Brute => Numbers {
            health: 130.0,
            poise: 70.0,
            weight: Weight::Heavy,
            might: 1.1,
            reaction: 20,
            shapes: Shapes::of(&[Shape::Slam, Shape::Sweep]),
            ..PLAIN
        },
        Role::Archer => Numbers {
            health: 50.0,
            poise: 18.0,
            weight: Weight::Light,
            reaction: 18,
            dodge: 0.25,
            shapes: Shapes::of(&[Shape::Aimed]),
            shooter: true,
            ..PLAIN
        },
        // A captain fights only as an Elite, a Miniboss or a Boss: its defence sits far enough under the ranks' cap
        // (`ranks::DEFENCE_MOST`) that each of those ranks parries, blocks and dodges more than the one below.
        Role::Captain => Numbers {
            health: 160.0,
            poise: 60.0,
            weight: Weight::Heavy,
            might: 1.2,
            reaction: 14,
            parry: 0.2,
            block: 0.22,
            dodge: 0.13,
            shapes: Shapes::of(&[Shape::Sweep, Shape::Lunge, Shape::Charge, Shape::Leap]),
            ..PLAIN
        },
    }
}

impl Numbers {
    /// Whether it raises a guard at all: such a foe keeps stamina for it, and backs off before its poise breaks.
    #[must_use]
    pub fn guards(&self) -> bool {
        self.parry + self.block > 0.0
    }

    #[must_use]
    pub fn defends(&self) -> bool {
        self.guards() || self.dodge > 0.0
    }

    /// The ticks it takes to read a swing begun at it: its reaction at the fight's pace. Every swing takes this share
    /// of the swing law's time (`SWING_PACE`), and so does reading one, so it answers a swing in time as often as at
    /// the law's own pace; a shot is not sped up, and is read in its whole reaction.
    #[must_use]
    pub fn swing_reaction(&self) -> u64 {
        (self.reaction as f64 * SWING_PACE + 0.5) as u64
    }
}
