//! The prologue's wreck, played in a page's own room laid over the sea (`Room::over_sea`): the player has no Art yet,
//! wakes hurt from the ram with no weapon, and takes the story's sword and shield from the deck into their pack to
//! equip; every boarder fights on one side against them and the Brig's crew, none but Thule harder to bring down than
//! a Major.

use crate::{PlayerId, Room};
use ::foes::factions::GREY_TITHE;
use ::foes::{Rank, faction};
use combat::fighter::{FighterId, Side};
use gear::{At, Item, Kind, Rarity, Slot};

/// How much of their health a player wakes on the wreck with, the ram's harm: short enough for a drink to heal.
pub const WOKE_HEALTH: f64 = 0.55;

impl Room {
    /// Plays the prologue's wreck from now on: no Art (`forbid_arts`), every player waking with no weapon and hurt
    /// (`wake_for_story`), and every foe the page stands (`stand_foe_at`) a boarder (`as_boarder`).
    pub fn story_wreck(&mut self) {
        if self.story {
            return;
        }
        self.forbid_arts();
        self.story = true;
        for player in self.players.values_mut() {
            wake_for_story(player);
        }
    }

    /// The story's sword and shield taken from the deck into `player`'s pack, unworn, for them to equip; answers
    /// whether it was given: not while one is carried or worn, nor to a player with no room in their pack for a Melee
    /// piece. One dismantled lies on the deck to be taken again.
    pub fn story_take_arms(&mut self, player: PlayerId) -> bool {
        let Some(found) = self.players.get_mut(&player).filter(|_| self.story) else { return false };
        let character = &mut found.character;
        let held = character.items.values().any(|(item, at)| item.kind == Kind::SwordAndShield && *at != At::Vault);
        if held || character.carried_in(Slot::Melee) >= gear::character::CARRIED_MOST {
            return false;
        }
        let id = character.take_id();
        character.items.insert(id, (Item::new(id, Kind::SwordAndShield, Rarity::Normal, 1, Slot::Melee), At::Carried));
        found.gear_changed = true;
        true
    }

    /// On the wreck, sends the foe `foe` at `player`, as a foe called to a fight is sent: alert, it comes for them
    /// where they stand and takes them on once it sees them. False outside the story, for no such foe or player, for
    /// either dead, or for a foe on the players' side.
    pub fn story_hunt(&mut self, foe: FighterId, player: PlayerId) -> bool {
        let standing = |fighter: &combat::Fighter| !fighter.dead();
        let at = self.players.get(&player).filter(|found| self.story && standing(&found.fighter));
        let at = at.map(|found| found.fighter.body);
        let clock = self.clock;
        let hostile =
            self.foes.get_mut(&foe).filter(|found| standing(&found.fighter) && !found.fighter.side.is_players());
        match (at, hostile) {
            (Some(body), Some(found)) => {
                found.brain.hunt(player, [body.x, body.y, body.z], clock);
                true
            }
            _ => false,
        }
    }

    /// On the wreck, moves the post of one of the Brig's crew, `crew`, to (`x`, `y`), facing `facing`: with nothing to
    /// fight he walks there by the room's routes and keeps to it. False outside the story, for none standing, or for a
    /// boarder.
    pub fn story_post(&mut self, crew: FighterId, (x, y): (f64, f64), facing: f64) -> bool {
        if !self.story {
            return false;
        }
        let top = self.on_top(x, y);
        let found = self.foes.get_mut(&crew).filter(|found| !found.fighter.dead() && found.fighter.side.is_players());
        found.map(|found| found.brain.keep_to([x, y, top.z], facing, false)).is_some()
    }

    /// A foe the page stood in the story's wreck: on the boarders' one side, the Grey Tithe's, whatever its crew, and
    /// below a Boss held to a Major's health, poise and defence, its own rank's look and blows kept. The Brig's crew,
    /// on the players' side, are left as they are.
    pub(crate) fn as_boarder(&mut self, id: FighterId) {
        let story = self.story;
        let Some(foe) = self.foes.get_mut(&id).filter(|foe| story && !foe.fighter.side.is_players()) else { return };
        let side = faction(GREY_TITHE).map_or(Side::from_number(GREY_TITHE), |tithe| tithe.side());
        foe.fighter.side = side;
        foe.brain.fights_for(side);
        if foe.brain.rank < Rank::Boss {
            foe.brain.held_to(Rank::Major);
        }
        let numbers = foe.brain.numbers();
        foe.fighter.health = numbers.health;
        foe.fighter.health_max = numbers.health;
        foe.fighter.poise_max = numbers.poise;
    }
}

/// A player as the wreck wakes them: no weapon (the sword a new player starts with gone; the story's lies on the deck)
/// and `WOKE_HEALTH` of their health, the ram's harm.
pub(crate) fn wake_for_story(player: &mut crate::players::Player) {
    let melee: Vec<u32> = player
        .character
        .items
        .iter()
        .filter(|(_, (item, at))| item.bucket == Slot::Melee && *at != At::Vault)
        .map(|(id, _)| *id)
        .collect();
    for id in melee {
        player.character.items.remove(&id);
    }
    let fighter = &mut player.fighter;
    fighter.health = fighter.health.min(fighter.health_max * WOKE_HEALTH);
    player.gear_changed = true;
}

#[cfg(test)]
#[path = "story_tests.rs"]
mod story_tests;
