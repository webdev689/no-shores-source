//! What a fighter holds, read from the forge's layer names, and how each weapon fights: its reach, damage, weight
//! against poise and guard, stamina, and DFO's swing law for how long a swing takes and when its blow lands.

use crate::ticks;

/// The melee weapons, by the forge's weapon files.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WeaponClass {
    Fists = 0,
    Dagger = 1,
    Sword = 2,
    Mace = 3,
    Flail = 4,
    Axe = 5,
    Warhammer = 6,
    Staff = 7,
}

/// The weapons that shoot.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ranged {
    Bow = 1,
    Crossbow = 2,
    Pistolet = 3,
    Thunderlock = 4,
}

/// What the left hand holds, as far as fighting goes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OffHand {
    Empty = 0,
    Shield = 1,
    /// A second blade or mace: the pair's blows take turns between the hands.
    Weapon = 2,
    Torch = 3,
}

/// What a fighter fights with: the melee weapon in its hands (fists when none is drawn), a shooting weapon if that is
/// what it holds, and its left hand.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Arms {
    pub melee: WeaponClass,
    pub ranged: Option<Ranged>,
    pub off_hand: OffHand,
}

pub const BARE_HANDS: Arms = Arms { melee: WeaponClass::Fists, ranged: None, off_hand: OffHand::Empty };

/// A melee weapon's numbers: reach in metres, damage, weight against poise and a guard (a long blade is 1), the
/// stamina a swing costs, how quickly it comes round (a sword is 1), and whether it takes both hands.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Weapon {
    pub reach: f64,
    pub damage: f64,
    pub weight: f64,
    pub stamina: f64,
    pub handling: f64,
    pub two_handed: bool,
}

/// Each class's numbers. Weights are DFO's poise weights by class, two-handed ones a further 1.15.
#[must_use]
pub const fn weapon(class: WeaponClass) -> Weapon {
    let (reach, damage, weight, stamina, handling, two_handed) = match class {
        WeaponClass::Fists => (1.0, 6.0, 0.6, 6.0, 0.9, false),
        WeaponClass::Dagger => (1.3, 9.0, 0.7, 8.0, 0.9, false),
        WeaponClass::Sword => (1.8, 14.0, 1.0, 12.0, 1.0, false),
        WeaponClass::Mace => (1.6, 15.0, 1.5, 14.0, 1.03, false),
        WeaponClass::Flail => (1.8, 16.0, 1.5, 15.0, 1.05, false),
        WeaponClass::Axe => (2.0, 22.0, 1.25 * 1.15, 20.0, 1.05, true),
        WeaponClass::Warhammer => (2.0, 24.0, 1.5 * 1.15, 22.0, 1.06, true),
        WeaponClass::Staff => (2.2, 13.0, 1.15, 14.0, 0.97, true),
    };
    Weapon { reach, damage, weight, stamina, handling, two_handed }
}

/// DFO's swing law at an average speed: one strike frame lasts 3 x (115 - 50) / 980 seconds, times the weapon's
/// handling and a further 1.06 for a two-handed one, held between 0.09 and 0.4. A swing is five frames; its blow
/// lands as the third begins.
const SWING_FRAME: f64 = 3.0 * (115.0 - 50.0) / 980.0;
const STRIKE_FRAMES: f64 = 5.0;
const HIT_FRAME: f64 = 2.0;

/// The ticks from a swing's start to its blow landing, and to its end.
#[must_use]
pub fn swing_ticks(class: WeaponClass) -> (u32, u32) {
    let weapon = weapon(class);
    let frame = (SWING_FRAME * weapon.handling * if weapon.two_handed { 1.06 } else { 1.0 }).clamp(0.09, 0.4);
    (ticks(frame * HIT_FRAME), ticks(frame * STRIKE_FRAMES))
}

/// The six ways a blow comes, as DFO's first person draws them: the mouse's drag picks one.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Stroke {
    Down = 1,
    DownLeft = 2,
    Left = 3,
    Right = 4,
    DownRight = 5,
    Up = 6,
}

const STROKES: [Stroke; 6] =
    [Stroke::Down, Stroke::DownLeft, Stroke::Left, Stroke::Right, Stroke::DownRight, Stroke::Up];

impl Stroke {
    /// The stroke a number names (1 to 6), or none.
    #[must_use]
    pub fn from_number(number: u8) -> Option<Self> {
        STROKES.iter().copied().find(|stroke| *stroke as u8 == number)
    }
}

/// How a stroke changes its weapon's blow: reach added, the half-width of its arc in radians, and its damage, poise
/// and guard shares; and how many it may strike. A thrust reaches furthest at one; a chop breaks poise and guards; a
/// sweep crosses three.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StrokeShape {
    pub reach: f64,
    pub half_arc: f64,
    pub damage: f64,
    pub poise: f64,
    pub guard: f64,
    pub targets: usize,
}

#[must_use]
pub fn stroke_shape(stroke: Stroke) -> StrokeShape {
    let degrees = core::f64::consts::PI / 180.0;
    match stroke {
        Stroke::Up => {
            StrokeShape { reach: 0.5, half_arc: 20.0 * degrees, damage: 1.0, poise: 0.8, guard: 1.0, targets: 1 }
        }
        Stroke::Down => {
            StrokeShape { reach: 0.0, half_arc: 35.0 * degrees, damage: 1.15, poise: 1.4, guard: 1.5, targets: 1 }
        }
        Stroke::Left | Stroke::Right => {
            StrokeShape { reach: -0.1, half_arc: 70.0 * degrees, damage: 0.85, poise: 0.9, guard: 1.0, targets: 3 }
        }
        Stroke::DownLeft | Stroke::DownRight => {
            StrokeShape { reach: 0.0, half_arc: 50.0 * degrees, damage: 1.0, poise: 1.0, guard: 1.0, targets: 2 }
        }
    }
}

/// The class a forge layer's name holds (`sword_iron`, `warhammer_daedric`), if it is a melee weapon.
fn melee_of(layer: &str) -> Option<WeaponClass> {
    let kind = layer.split('_').next().unwrap_or_default();
    Some(match kind {
        "dagger" => WeaponClass::Dagger,
        "sword" => WeaponClass::Sword,
        "mace" => WeaponClass::Mace,
        "flail" => WeaponClass::Flail,
        "axe" => WeaponClass::Axe,
        "warhammer" => WeaponClass::Warhammer,
        "staff" => WeaponClass::Staff,
        _ => return None,
    })
}

fn ranged_of(layer: &str) -> Option<Ranged> {
    let kind = layer.split('_').next().unwrap_or_default();
    Some(match kind {
        "bow" => Ranged::Bow,
        "crossbow" => Ranged::Crossbow,
        "pistolet" => Ranged::Pistolet,
        "thunderlock" => Ranged::Thunderlock,
        _ => return None,
    })
}

/// What a fighter fights with, from the forge layers in its right and left hands ("" for none) and whether they are
/// drawn. Put away, it fights with its fists. A shooting weapon in the right hand fights hand to hand with fists.
#[must_use]
pub fn arms_of(right: &str, left: &str, drawn: bool) -> Arms {
    if !drawn {
        return BARE_HANDS;
    }
    let off_hand = if left.starts_with("shield_") {
        OffHand::Shield
    } else if left.starts_with("torch") {
        OffHand::Torch
    } else if left.ends_with("_l") && melee_of(left).is_some() {
        OffHand::Weapon
    } else {
        OffHand::Empty
    };
    let melee = melee_of(right).unwrap_or(WeaponClass::Fists);
    // A two-handed weapon leaves nothing for the left hand to fight with.
    let off_hand = if weapon(melee).two_handed { OffHand::Empty } else { off_hand };
    Arms { melee, ranged: ranged_of(right), off_hand }
}

impl Arms {
    /// The arms as one number, for a message: melee class, shooting weapon and left hand in its bytes.
    #[must_use]
    pub fn code(self) -> u32 {
        u32::from(self.melee as u8)
            | u32::from(self.ranged.map_or(0, |ranged| ranged as u8)) << 8
            | u32::from(self.off_hand as u8) << 16
    }

    /// The arms a number names; anything it does not name is bare hands.
    #[must_use]
    pub fn from_code(code: u32) -> Self {
        let byte = |shift: u32| u8::try_from((code >> shift) & 0xff).unwrap_or_default();
        let melee = [
            WeaponClass::Fists,
            WeaponClass::Dagger,
            WeaponClass::Sword,
            WeaponClass::Mace,
            WeaponClass::Flail,
            WeaponClass::Axe,
            WeaponClass::Warhammer,
            WeaponClass::Staff,
        ]
        .into_iter()
        .find(|class| *class as u8 == byte(0));
        let ranged = [Ranged::Bow, Ranged::Crossbow, Ranged::Pistolet, Ranged::Thunderlock]
            .into_iter()
            .find(|ranged| *ranged as u8 == byte(8));
        let off_hand = [OffHand::Empty, OffHand::Shield, OffHand::Weapon, OffHand::Torch]
            .into_iter()
            .find(|hand| *hand as u8 == byte(16));
        match (melee, off_hand) {
            (Some(melee), Some(off_hand)) if code >> 24 == 0 && (byte(8) == 0 || ranged.is_some()) => {
                Arms { melee, ranged, off_hand }
            }
            _ => BARE_HANDS,
        }
    }
}
