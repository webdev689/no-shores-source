//! The prologue's wreck, played in a page's own room laid over the sea (`Room::over_sea`): the player has no Art yet
//! and carries the story's sword and shield, and every boarder fights on one side against them and the Brig's crew,
//! none but Thule harder to bring down than a Major.

use crate::Room;
use ::foes::factions::GREY_TITHE;
use ::foes::{Rank, faction};
use combat::fighter::{FighterId, Side};
use gear::{At, Character, Item, Kind, Rarity, Slot};

impl Room {
    /// Plays the prologue's wreck from now on: no Art (`forbid_arts`), every player armed with the story's sword and
    /// shield, and every foe the page stands (`stand_foe_at`) a boarder (`as_boarder`).
    pub fn story_wreck(&mut self) {
        self.forbid_arts();
        self.story = true;
        for player in self.players.values_mut() {
            arm_for_story(&mut player.character);
        }
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

/// The player's Melee the story's, as the prologue dresses them: a level 1 Normal sword and shield in place of what it
/// wore, so the arms the page draws (`power::arms_allowed`) are the room's too.
pub(crate) fn arm_for_story(character: &mut Character) {
    let worn = character.items.iter().find(|(_, (_, at))| *at == At::Worn(Slot::Melee)).map(|(id, _)| *id);
    let id = worn.unwrap_or_else(|| character.take_id());
    let sword = Item::new(id, Kind::SwordAndShield, Rarity::Normal, 1, Slot::Melee);
    character.items.insert(id, (sword, At::Worn(Slot::Melee)));
}

#[cfg(test)]
#[path = "story_tests.rs"]
mod story_tests;
