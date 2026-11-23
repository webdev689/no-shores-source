//! What gear's power does in the room: a player's blow on a foe rises with the Attack of the weapon that struck it up
//! to the foe's level and falls away below it, and a foe's blow on a player falls short of their Defense. Every
//! player's blow on a foe strikes `PLAYER_HARM` times that, and every foe's on a player `FOE_HARM` times; a foe of
//! level 0 fights by combat's own numbers and those two alone. A player holds only what a loadout they wear puts in
//! their hands. A foe's kill pays everyone who struck it in its last seconds, each their own XP, Aurem and what it
//! drops for them alone (`drops.rs`), and counts toward their bounties (`bounties.rs`).

use crate::{Foe, PlayerId, Room};
use combat::Shot;
use combat::arms::{Arms, BARE_HANDS, OffHand, Ranged, WeaponClass};
use combat::fighter::{Fighter, FighterId};
use combat::judge::{Blow, BlowKind};
use gear::objectives::Feat;
use gear::rewards::{Foe as Worth, SHARE_TICKS};
use gear::{Character, Kind, Slot};

/// What a player's blow on a foe strikes times, at every level: half again, so a new player fells any Major one on
/// one with health to spare, while an Elite still asks for guarding and dodging.
pub const PLAYER_HARM: f64 = 1.5;
/// What a foe's blow on a player strikes times, at every level: three quarters, so a Major Brute takes about 13 s to
/// fell a new player who never guards (`measure_blows`), time to learn the keys.
pub const FOE_HARM: f64 = 0.75;

/// What a player's blow carries of its striker: the Attack and element of the loadout it came from, and their trim. An
/// arrow or a bolt keeps those it was loosed with, so a weapon changed while it flies changes nothing of it, whether it
/// was aimed (loosed from the draw, striking harder than a quick shot), for Storm Gull, and the item it was loosed
/// from, whose perks it takes wherever that item is when it lands.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Loosed {
    pub attack: u32,
    pub element: Option<gear::Element>,
    pub trim: combat::Trim,
    pub aimed: bool,
    pub item: Option<u32>,
}

/// What a loadout puts in a player's hands, drawn: a pair's second blade or mace and an "& Shield"'s shield in the
/// left hand, a greatsword on its hilt, the great axe as the axe, a shooting weapon with the fists to fight with.
#[must_use]
pub fn loadout_arms(kind: Kind) -> Arms {
    use WeaponClass::{Axe, Dagger, Fists, Flail, Greatsword, Mace, Staff, Sword, Warhammer};
    let (melee, ranged, off_hand) = match kind {
        Kind::SwordAndShield => (Sword, None, OffHand::Shield),
        Kind::DaggerAndShield => (Dagger, None, OffHand::Shield),
        Kind::MaceAndShield => (Mace, None, OffHand::Shield),
        Kind::DoubleDaggers => (Dagger, None, OffHand::Weapon),
        Kind::DoubleSwords => (Sword, None, OffHand::Weapon),
        Kind::DoubleMace => (Mace, None, OffHand::Weapon),
        Kind::Sword => (Sword, None, OffHand::Empty),
        Kind::Mace => (Mace, None, OffHand::Empty),
        Kind::Flail => (Flail, None, OffHand::Empty),
        Kind::Staff => (Staff, None, OffHand::Empty),
        Kind::GreatAxe => (Axe, None, OffHand::Empty),
        Kind::Greatsword => (Greatsword, None, OffHand::Empty),
        Kind::Warhammer => (Warhammer, None, OffHand::Empty),
        Kind::Bow => (Fists, Some(Ranged::Bow), OffHand::Empty),
        Kind::Crossbow => (Fists, Some(Ranged::Crossbow), OffHand::Empty),
        Kind::Pistolet => (Fists, Some(Ranged::Pistolet), OffHand::Empty),
        Kind::DoublePistolet => (Fists, Some(Ranged::DoublePistolet), OffHand::Empty),
        Kind::Thunderlock => (Fists, Some(Ranged::Thunderlock), OffHand::Empty),
        Kind::Head | Kind::Torso | Kind::Arms | Kind::Legs | Kind::Cloak | Kind::Horse => return BARE_HANDS,
        Kind::Guns | Kind::Hull | Kind::Sails | Kind::Rigging => return BARE_HANDS,
    };
    Arms { melee, ranged, off_hand }
}

/// The arms a player may take up: either worn loadout's, the fists when no Melee is worn, and each with a torch where
/// it leaves the left hand free.
#[must_use]
pub fn arms_allowed(character: &Character) -> Vec<Arms> {
    let melee = character.worn(Slot::Melee).map(|item| item.kind);
    let loadouts = [melee, character.worn(Slot::Ranged).map(|item| item.kind)];
    let mut allowed = Vec::new();
    for (arms, free) in loadouts.into_iter().flatten().map(|kind| (loadout_arms(kind), kind.left_hand_free())) {
        allowed.push(arms);
        if free {
            allowed.push(Arms { off_hand: OffHand::Torch, ..arms });
        }
    }
    if melee.is_none() {
        allowed.extend([BARE_HANDS, Arms { off_hand: OffHand::Torch, ..BARE_HANDS }]);
    }
    allowed
}

/// The arms a player takes up of those they ask for: one allowed, or else bare hands, as with nothing drawn.
#[must_use]
pub fn allowed_arms(asked: Arms, character: &Character) -> Arms {
    if arms_allowed(character).contains(&asked) { asked } else { BARE_HANDS }
}

/// The loadout a player has drawn, which strikes their blows and whose perks are theirs with the armour's: the Ranged
/// one while it is held, or while no Melee is worn; else Melee.
#[must_use]
pub(crate) fn drawn(character: &Character, fighter: &Fighter) -> Slot {
    if fighter.arms.ranged.is_some() || character.worn(Slot::Melee).is_none() { Slot::Ranged } else { Slot::Melee }
}

/// The foe kinds as the gear's rewards know them, by the foes crate's numbers.
pub(crate) fn worth_of(kind: u8) -> Option<Worth> {
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
    /// A blow as gear's power makes it against its defender: a player's swing on a foe by the Attack of the loadout
    /// it struck with (`striking`), a foe's on a player by their Defense; both by their levels. Its poise and the
    /// stamina it costs a guard are the weapon's own.
    pub(crate) fn empower(&self, blow: Blow, defender: FighterId) -> Blow {
        // A blow of the fists, bare or beside a bow or a gun, carries none of a weapon's element.
        let fists = |striker: &crate::Player| striker.fighter.arms.melee == WeaponClass::Fists;
        let held =
            self.held(blow.striker, self.striking(blow.striker)).map(|held| match self.players.get(&blow.striker) {
                Some(striker) if fists(striker) => Loosed { element: None, ..held },
                _ => held,
            });
        self.empower_as(blow, defender, held)
    }

    /// The loadout a player strikes with now (`drawn`).
    pub(crate) fn striking(&self, player: FighterId) -> Slot {
        self.players.get(&player).map_or(Slot::Melee, |found| drawn(&found.character, &found.fighter))
    }

    /// Whether a player's blow takes a perk: one the armour or the loadout it came from gives, a shot's the Ranged
    /// one, or the item it was loosed from while it is judged (`Room::shot_loosed`), a swing's the one drawn. A spell
    /// takes no weapon's perk.
    pub(crate) fn perk_on(&self, blow: &Blow, id: &str) -> bool {
        let loadout = match blow.kind {
            BlowKind::Shot(_) => Slot::Ranged,
            BlowKind::Spell(_) => return false,
            _ => self.striking(blow.striker),
        };
        let Some(found) = self.players.get(&blow.striker) else { return false };
        let character = &found.character;
        let loosed = self.shot_loosed.filter(|_| matches!(blow.kind, BlowKind::Shot(_)));
        match loosed.map(|loosed| loosed.item.and_then(|item| character.item(item))) {
            Some(from) => character.has_trait(id) || from.is_some_and(|item| item.active_traits().any(|own| own == id)),
            None => character.has_drawn_trait(id, loadout),
        }
    }

    /// What a player strikes with now from a loadout; nothing for a foe.
    pub(crate) fn held(&self, striker: FighterId, loadout: Slot) -> Option<Loosed> {
        let player = self.players.get(&striker)?;
        let character = &player.character;
        let element = character.worn(loadout).and_then(|item| item.element);
        let attack = character.attack(loadout).unwrap_or(0);
        let item = character.worn(loadout).map(|item| item.id);
        Some(Loosed { attack, element, trim: player.fighter.trim, aimed: false, item })
    }

    /// A blow as `empower` makes it, a player's by the Attack and trim `held` gives.
    pub(crate) fn empower_as(&self, blow: Blow, defender: FighterId, held: Option<Loosed>) -> Blow {
        let times = match (held, self.players.get(&blow.striker), self.foes.get(&defender)) {
            (Some(held), Some(striker), Some(foe)) => {
                gear::power::by_player(held.attack, striker.character.level(), foe.level) * PLAYER_HARM
            }
            _ => match (self.foes.get(&blow.striker), self.players.get(&defender)) {
                (Some(foe), Some(player)) => {
                    let character = &player.character;
                    gear::power::on_player(character.defense(), character.level(), foe.level) * FOE_HARM
                }
                _ => self.companion_times(blow.striker, defender).unwrap_or(1.0),
            },
        };
        let element = held.and_then(|held| held.element).map_or(0, |element| element as u8);
        let blow = Blow { damage: blow.damage * times * self.modded_blow(&blow, defender), element, ..blow };
        match held {
            Some(held) => self.sharpened(blow, defender, &held.trim),
            None => blow,
        }
    }

    /// Notes that a player's blow by a loadout landed on a foe, so they share its kill.
    pub(crate) fn mark_struck(&mut self, striker: PlayerId, defender: FighterId, loadout: Slot) {
        let clock = self.clock;
        if self.players.contains_key(&striker)
            && let Some(foe) = self.foes.get_mut(&defender)
        {
            foe.struck_by.insert(striker, (clock, loadout));
        }
    }

    /// Pays a foe's kill to every player who struck it within its last ten seconds, or whose companion did, throwing
    /// out what it drops for each, and tells each one's quest log; off a ship's deck its XP also pays their officers
    /// ashore and the Abyss boon's share, and the kill counts toward their bounties. On a boarded deck, or from a
    /// defence tried again, a kill drops no Vestige or item: the hold, or the first try, is the loot. Each player paid
    /// has fought the room's garrison, for its clear (`clears.rs`).
    pub(crate) fn pay_kill(&mut self, defender: FighterId) {
        let Some(Foe { fighter, brain, level, struck_by, .. }) = self.foes.get(&defender).cloned() else { return };
        let Some(worth) = worth_of(brain.role() as u8) else { return };
        let at = [fighter.body.x, fighter.body.y, fighter.body.z];
        let week = gear::clock::week_of(self.minute);
        let felled = Feat::Felled { faction: brain.foe_type.faction, rank: brain.rank as u8, island: self.island };
        let deck = matches!(self.floor, crate::Floor::Deck(_));
        // A defence tried again stands foes that drop nothing (`steps.rs`).
        let spoilless = self.quests.spoilless.contains(&defender);
        let rank = brain.rank as u8;
        for (player, (tick, hand)) in struck_by {
            if self.clock.saturating_sub(tick) > SHARE_TICKS {
                continue;
            }
            let dice = self.dice(player);
            let Some(found) = self.players.get_mut(&player) else { continue };
            let character = &mut found.character;
            let reward = character.reward_kill(worth, rank, level, Some(hand), self.difficulty);
            let looted = deck || spoilless;
            let vestiges = if looted { Vec::new() } else { character.loot_kill(rank, level, self.difficulty, &dice) };
            // A ship's deck is no island: what is felled there counts toward no land bounty and earns no boon.
            if !deck {
                character.boon_xp(week, reward.xp, Some(hand));
                character.earn_officer_xp(reward.xp, false);
            }
            found.gear_changed = true;
            self.fought_garrison(player);
            if !spoilless {
                self.drop_spoils(player, vestiges, rank, at, &dice);
            }
            self.tell_kill(player, brain.foe_type.name, rank, [at[0], at[1]]);
            if !deck {
                self.saw(player, &felled);
            }
        }
    }
}

/// Whether a player's shot was loosed from the draw: a quick one strikes at its weapon's own damage to the bit
/// (`combat::step`'s quick shot, power 1), and one loosed from the draw at its draw's power and the aimed trim, which
/// may be more or, with Hair Trigger, less.
pub(crate) fn aimed(shot: &Shot) -> bool {
    shot.damage != combat::shots::shot_numbers(shot.ranged).1
}

/// Wears a level 1 Normal loadout of this kind, as their gear would put it on.
#[cfg(test)]
pub(crate) fn hold(room: &mut Room, player: PlayerId, kind: Kind) {
    let character = &mut room.players.get_mut(&player).expect("a player in the room").character;
    let id = character.take_id();
    let item = gear::Item::new(id, kind, gear::Rarity::Normal, 1, kind.slot());
    character.items.insert(id, (item, gear::At::Carried));
    let dice = gear::dice::Dice { seed: 0, tick: 0, player };
    let worn = character.ask(gear::Ask::Wear { item: id, slot: kind.slot() }, gear::Here::default(), &dice);
    assert_eq!(worn, Ok(gear::Done::Done));
}
