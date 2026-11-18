//! What gear's power does in the room: a player's blow on a foe rises with the Attack of the weapon that struck it up
//! to the foe's level and falls away below it, and a foe's blow on a player falls short of their Defense. A foe of
//! level 0 fights by combat's own numbers. A player holds only what their gear puts in their hands. A foe's kill pays
//! everyone who struck it in its last seconds, each their own XP, Aurem and maybe a Vestige, laid where it fell for
//! them alone; walked over, it is picked up.

use crate::{Foe, PlayerId, Room};
use combat::arms::{Arms, BARE_HANDS, OffHand, Ranged, WeaponClass};
use combat::fighter::FighterId;
use combat::judge::Blow;
use gear::rewards::{Foe as Worth, SHARE_TICKS};
use gear::{Character, Kind, Slot, Vestige};

/// How long a Vestige lies for its player, in the room's ticks of 1/60 s: two minutes.
pub const DROP_TICKS: u64 = 7_200;
/// How near a player walks to a Vestige to pick it up, across and up, in metres.
pub const PICK_UP_REACH: f64 = 1.5;
const PICK_UP_HEIGHT: f64 = 2.0;

/// What a player's blow carries of its striker: the Attack and element of the hand it came from, and their trim. An
/// arrow or a bolt keeps those it was loosed with, so a weapon changed while it flies changes nothing of it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Loosed {
    pub attack: u32,
    pub element: Option<gear::Element>,
    pub trim: combat::Trim,
}

/// A Vestige lying for one player.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Drop {
    pub player: PlayerId,
    pub vestige: Vestige,
    pub at: [f64; 3],
    pub until: u64,
}

/// What a player's gear puts in their hands, drawn: the main hand's weapon, and the off hand's shield or blade.
#[must_use]
pub fn gear_arms(character: &Character) -> Arms {
    let main = character.worn(Slot::MainHand).map(|item| item.kind);
    let melee = match main {
        Some(Kind::Dagger) => WeaponClass::Dagger,
        Some(Kind::Sword) => WeaponClass::Sword,
        Some(Kind::Mace) => WeaponClass::Mace,
        Some(Kind::Flail) => WeaponClass::Flail,
        Some(Kind::Axe) => WeaponClass::Axe,
        Some(Kind::Warhammer) => WeaponClass::Warhammer,
        Some(Kind::Staff) => WeaponClass::Staff,
        _ => WeaponClass::Fists,
    };
    let ranged = match main {
        Some(Kind::Bow) => Some(Ranged::Bow),
        Some(Kind::Crossbow) => Some(Ranged::Crossbow),
        Some(Kind::Pistolet) => Some(Ranged::Pistolet),
        Some(Kind::Thunderlock) => Some(Ranged::Thunderlock),
        _ => None,
    };
    let off_hand = match character.worn(Slot::OffHand).map(|item| item.kind) {
        _ if main.is_some_and(Kind::two_handed) => OffHand::Empty,
        Some(Kind::Shield) => OffHand::Shield,
        Some(Kind::Dagger | Kind::Sword | Kind::Mace | Kind::Flail) => OffHand::Weapon,
        _ => OffHand::Empty,
    };
    Arms { melee, ranged, off_hand }
}

/// The arms a player may take up: their gear's, and with a torch in an off hand the main hand leaves free.
#[must_use]
pub fn arms_allowed(character: &Character) -> Vec<Arms> {
    let worn = gear_arms(character);
    let free_left = !character.worn(Slot::MainHand).is_some_and(|item| item.kind.two_handed());
    let torch = Arms { off_hand: OffHand::Torch, ..worn };
    if free_left { vec![worn, torch] } else { vec![worn] }
}

/// The arms a player takes up of those they ask for: one allowed, or else bare hands, as with nothing drawn.
#[must_use]
pub fn allowed_arms(asked: Arms, character: &Character) -> Arms {
    if arms_allowed(character).contains(&asked) { asked } else { BARE_HANDS }
}

/// The foe kinds as the gear's rewards know them, by the foes crate's numbers.
fn worth_of(kind: u8) -> Option<Worth> {
    Some(match kind {
        1 => Worth::Skirmisher,
        2 => Worth::Swordsman,
        3 => Worth::Brute,
        4 => Worth::Archer,
        5 => Worth::Captain,
        _ => return None,
    })
}

impl Room {
    /// A blow as gear's power makes it against its defender: a player's on a foe by the Attack of the hand that struck
    /// (`left_hand` for the off hand's blade; a shot is the main hand's), a foe's on a player by their Defense; both
    /// by their levels. Its poise and the stamina it costs a guard are the weapon's own.
    pub(crate) fn empower(&self, blow: Blow, defender: FighterId, left_hand: bool) -> Blow {
        let hand = if left_hand { Slot::OffHand } else { Slot::MainHand };
        self.empower_as(blow, defender, self.held(blow.striker, hand))
    }

    /// What a player strikes with now from `hand`; nothing for a foe.
    pub(crate) fn held(&self, striker: FighterId, hand: Slot) -> Option<Loosed> {
        let player = self.players.get(&striker)?;
        let character = &player.character;
        let element = character.worn(hand).and_then(|item| item.element);
        Some(Loosed { attack: character.attack(hand).unwrap_or(0), element, trim: player.fighter.trim })
    }

    /// A blow as `empower` makes it, a player's by the Attack and trim `held` gives.
    pub(crate) fn empower_as(&self, blow: Blow, defender: FighterId, held: Option<Loosed>) -> Blow {
        let times = match (held, self.players.get(&blow.striker), self.foes.get(&defender)) {
            (Some(held), Some(striker), Some(foe)) => {
                gear::power::by_player(held.attack, striker.character.level(), foe.level)
            }
            _ => match (self.foes.get(&blow.striker), self.players.get(&defender)) {
                (Some(foe), Some(player)) => {
                    let character = &player.character;
                    gear::power::on_player(character.defense(), character.level(), foe.level)
                }
                _ => 1.0,
            },
        };
        let element = held.and_then(|held| held.element).map_or(0, |element| element as u8);
        let blow = Blow { damage: blow.damage * times, element, ..blow };
        match held {
            Some(held) => self.sharpened(blow, defender, &held.trim),
            None => blow,
        }
    }

    /// Notes that a player's blow by `hand` landed on a foe, so they share its kill.
    pub(crate) fn mark_struck(&mut self, striker: PlayerId, defender: FighterId, hand: Slot) {
        let clock = self.clock;
        if self.players.contains_key(&striker)
            && let Some(foe) = self.foes.get_mut(&defender)
        {
            foe.struck_by.insert(striker, (clock, hand));
        }
    }

    /// Pays a foe's kill to every player who struck it within its last ten seconds, laying each one's Vestige where
    /// it fell.
    pub(crate) fn pay_kill(&mut self, defender: FighterId) {
        let Some(Foe { fighter, kind, level, struck_by, .. }) = self.foes.get(&defender).cloned() else { return };
        let Some(worth) = worth_of(kind) else { return };
        let at = [fighter.body.x, fighter.body.y, fighter.body.z];
        for (player, (tick, hand)) in struck_by {
            if self.clock.saturating_sub(tick) > SHARE_TICKS {
                continue;
            }
            let dice = self.dice(player);
            let Some(found) = self.players.get_mut(&player) else { continue };
            let reward = found.character.reward_kill(worth, level, Some(hand), self.difficulty, &dice);
            found.gear_changed = true;
            if let Some(vestige) = reward.vestige {
                self.lay_drop(player, vestige, at);
            }
        }
    }

    /// Picks up every Vestige a player has walked over, and lets go of those that have lain their time.
    pub(crate) fn pick_up_drops(&mut self) {
        let clock = self.clock;
        let mut kept = Vec::with_capacity(self.drops.len());
        for drop in std::mem::take(&mut self.drops) {
            if clock >= drop.until {
                continue;
            }
            let Some(found) = self.players.get_mut(&drop.player) else { continue };
            let body = found.fighter.body;
            let near = libm::hypot(body.x - drop.at[0], body.y - drop.at[1]) <= PICK_UP_REACH
                && (body.z - drop.at[2]).abs() <= PICK_UP_HEIGHT;
            if near && found.character.pick_up(drop.vestige) {
                found.gear_changed = true;
            } else {
                kept.push(drop);
            }
        }
        self.drops = kept;
    }

    /// The Vestiges lying for a player.
    pub fn drops_for(&self, player: PlayerId) -> impl Iterator<Item = &Drop> {
        self.drops.iter().filter(move |drop| drop.player == player)
    }
}

/// Wears a level 1 Normal weapon of this kind in a player's main hand, as their gear would put it there.
#[cfg(test)]
pub(crate) fn hold(room: &mut Room, player: PlayerId, kind: Kind) {
    let character = &mut room.players.get_mut(&player).expect("a player in the room").character;
    let id = character.take_id();
    let item = gear::Item::new(id, kind, gear::Rarity::Normal, 1, Slot::MainHand);
    character.items.insert(id, (item, gear::At::Carried));
    let dice = gear::dice::Dice { seed: 0, tick: 0, player };
    let worn = character.ask(gear::Ask::Wear { item: id, slot: Slot::MainHand }, gear::Here::default(), &dice);
    assert_eq!(worn, Ok(gear::Done::Done));
}

impl Room {
    /// Lays a Vestige for a player where it fell, for its time.
    pub fn lay_drop(&mut self, player: PlayerId, vestige: Vestige, at: [f64; 3]) {
        self.drops.push(Drop { player, vestige, at, until: self.clock + DROP_TICKS });
    }
}
