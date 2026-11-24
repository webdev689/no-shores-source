//! An item's fight numbers as its page shows them, by the rules the room fights by: what its weapon does under the
//! traits it gives (a blow's or a shot's damage, how often it comes, how far a blow reaches, the poise it fills, what a
//! swing costs, the shots it carries), what a body wearing it keeps (its stamina's return, a dodge's cost, its poise,
//! a healing charge), and what those traits trim of the fight's own numbers.

use crate::perks::trim_by;
use crate::power::loadout_arms;
use combat::Trim;
use combat::arms::{OffHand, PAIR_DAMAGE, Ranged, Stroke, WeaponClass, pair_swing_ticks, swing_ticks, weapon};
use combat::shots::{BRACE_GAP, DRAW_FULL, aimed_power, player_power, shot_numbers};
use combat::step::AIM_PACE;
use combat::strike::stroke_reach;
use combat::tuning::{DODGE_STAMINA, DRINK_HEALS, PLAYER_POISE, POISE_PER_WEIGHT, STAMINA_PER_TICK};
use gear::Kind;
use movement::TICK_SECONDS;

/// Which loadout an item fights as: none (armour, the cloak, a horse, a ship's module), Melee or Ranged.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Loadout {
    None = 0,
    Melee = 1,
    Ranged = 2,
}

/// How a loadout is held: a hand left free for a torch, a shield that blocks, a pair whose blows take turns between
/// the hands, one weapon in both hands, or neither of those.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Hands {
    Free = 0,
    Shield = 1,
    Pair = 2,
    Both = 3,
    Held = 4,
}

/// An item's fight numbers, each 0 where its loadout has none. Damage is the weapon's own, before its Attack and the
/// levels weigh it: a blow by the diagonal stroke, a shot at its full draw. The body's are a player's own, as they
/// stand with only this item's traits.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Stats {
    pub loadout: Loadout,
    /// A blow's damage, or a quick shot's.
    pub impact: f64,
    /// An aimed shot's damage.
    pub aimed: f64,
    /// Blows or shots a second, swung or fired as fast as the weapon comes round.
    pub rate: f64,
    /// How far a diagonal blow reaches in a player's hands, from their feet to a body's middle, in metres.
    pub reach: f64,
    /// The poise a blow or a shot fills.
    pub poise: f64,
    /// The stamina a swing costs.
    pub stamina: f64,
    /// The shots it carries.
    pub ammo: f64,
    /// Seconds before it shoots again, its firing and its reload.
    pub reload: f64,
    /// Seconds a bow takes to draw to its full power.
    pub draw: f64,
    /// How fast an arrow or a bolt flies, in metres a second; a ball reaches its mark at once (0).
    pub flight: f64,
    /// The share of their pace a player keeps while aiming it.
    pub aim_pace: f64,
    pub hands: Hands,
    /// The stamina that comes back each second, resting.
    pub stamina_back: f64,
    /// The stamina a dodge costs, no weapon drawn.
    pub dodge_cost: f64,
    /// The poise a body holds before a stagger: the blows it can take, as their poise is filled less.
    pub poise_held: f64,
    /// The share of the most health a healing charge restores.
    pub healing: f64,
}

/// How many numbers `Stats` crosses as.
pub const STATS_FLOATS: usize = 17;

impl Stats {
    /// Its numbers, in order, for a browser's door.
    #[must_use]
    pub fn to_floats(&self) -> [f64; STATS_FLOATS] {
        [
            f64::from(self.loadout as u8),
            self.impact,
            self.aimed,
            self.rate,
            self.reach,
            self.poise,
            self.stamina,
            self.ammo,
            self.reload,
            self.draw,
            self.flight,
            self.aim_pace,
            f64::from(self.hands as u8),
            self.stamina_back,
            self.dodge_cost,
            self.poise_held,
            self.healing,
        ]
    }
}

/// What an item of `kind` giving `traits` fights with, and the trim those traits make; an item that is no weapon has
/// only the trim.
#[must_use]
pub fn stats<'a>(kind: Kind, traits: impl IntoIterator<Item = &'a str>) -> (Stats, Trim) {
    let trim = trim_by(traits);
    let arms = loadout_arms(kind);
    let fights = match arms.ranged {
        Some(ranged) => shooting(kind, ranged, &trim),
        None if kind.weapon() => swinging(arms.melee, arms.off_hand, kind, &trim),
        None => ZERO,
    };
    let body = Stats {
        stamina_back: STAMINA_PER_TICK / TICK_SECONDS * trim.regen,
        dodge_cost: DODGE_STAMINA * trim.dodge_stamina,
        poise_held: PLAYER_POISE / trim.poise_taken,
        healing: DRINK_HEALS * trim.drink_heal,
        ..fights
    };
    (body, trim)
}

const ZERO: Stats = Stats {
    loadout: Loadout::None,
    impact: 0.0,
    aimed: 0.0,
    rate: 0.0,
    reach: 0.0,
    poise: 0.0,
    stamina: 0.0,
    ammo: 0.0,
    reload: 0.0,
    draw: 0.0,
    flight: 0.0,
    aim_pace: 0.0,
    hands: Hands::Held,
    stamina_back: 0.0,
    dodge_cost: 0.0,
    poise_held: 0.0,
    healing: 0.0,
};

/// A Melee loadout's numbers, as `judge::swing_blow` and the step weigh and pace a player's swing.
fn swinging(class: WeaponClass, off_hand: OffHand, kind: Kind, trim: &Trim) -> Stats {
    let held = weapon(class);
    let pair = off_hand == OffHand::Weapon;
    let (_, ends) = if pair { pair_swing_ticks(class) } else { swing_ticks(class) };
    let hands = match off_hand {
        OffHand::Shield => Hands::Shield,
        OffHand::Weapon => Hands::Pair,
        _ if held.two_handed => Hands::Both,
        _ if kind.left_hand_free() => Hands::Free,
        _ => Hands::Held,
    };
    Stats {
        loadout: Loadout::Melee,
        impact: held.damage * if pair { PAIR_DAMAGE } else { 1.0 } * trim.damage,
        rate: 1.0 / (f64::from(ends.max(1)) * TICK_SECONDS),
        reach: stroke_reach(class, Stroke::DownLeft, true),
        poise: held.weight * POISE_PER_WEIGHT * trim.poise_given,
        stamina: held.stamina * trim.swing_stamina,
        hands,
        ..ZERO
    }
}

/// A Ranged loadout's numbers, as the step looses a player's shot and reloads after it: a pair of pistolets fires the
/// right, the left a brace's gap later, then reloads both.
fn shooting(kind: Kind, ranged: Ranged, trim: &Trim) -> Stats {
    let (speed, damage, weight, reload) = shot_numbers(ranged);
    let reload = (f64::from(reload) * trim.reload).round().max(1.0);
    let pair = ranged == Ranged::DoublePistolet;
    let cycle = if pair { f64::from(BRACE_GAP) + reload } else { reload };
    let shots = if pair { 2.0 } else { 1.0 };
    let bow = ranged == Ranged::Bow;
    Stats {
        loadout: Loadout::Ranged,
        impact: damage * player_power(ranged) * trim.damage,
        aimed: damage * aimed_power(ranged, DRAW_FULL) * trim.aimed * trim.damage,
        rate: shots / (cycle * TICK_SECONDS),
        // A shot's poise is its weight's alone (`judge::shot_blow`): no trait trims it.
        poise: weight * POISE_PER_WEIGHT,
        ammo: gear::ammo::capacity(kind).map_or(0.0, f64::from),
        reload: cycle * TICK_SECONDS,
        draw: if bow { f64::from(DRAW_FULL) * trim.draw * TICK_SECONDS } else { 0.0 },
        flight: speed,
        aim_pace: (AIM_PACE * trim.aim_pace).min(1.0),
        hands: if kind.left_hand_free() {
            Hands::Free
        } else if pair {
            Hands::Pair
        } else {
            Hands::Held
        },
        ..ZERO
    }
}

#[cfg(test)]
#[path = "stats_tests.rs"]
mod stats_tests;
