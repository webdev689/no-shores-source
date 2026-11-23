//! The prologue's wreck, played in a page's own room laid over the sea (`Room::over_sea`): the player has no Art until
//! the wisp gives them the Storm, wakes hurt from the ram in the story's steel with no weapon, takes the story's sword
//! and shield, and later its bow, from the deck into their pack to equip; every boarder is the Grey Tithe's, fighting
//! them and the Brig's crew. What the story lends is its own (`gear::story::story_item`), which its end takes back.

use crate::{PlayerId, Room};
use combat::fighter::FighterId;
use gear::arts::{ALL_EARNED, STORM};
use gear::story::story_item;
use gear::{At, Kind, Slot};

/// How much of their health a player wakes on the wreck with, the ram's harm: short enough for a drink to heal.
pub const WOKE_HEALTH: f64 = 0.55;
/// The story's steel the player wakes in: no helm, so the face shows.
const ARMOUR: [Kind; 3] = [Kind::Torso, Kind::Arms, Kind::Legs];
/// The slots the ram strips before the story dresses them: the Melee loadout and every armour piece.
const STRIPPED: [Slot; 5] = [Slot::Melee, Slot::Head, Slot::Torso, Slot::Arms, Slot::Legs];

impl Room {
    /// Plays the prologue's wreck from now on: no Art (`forbid_arts`) until the Storm is given (`story_storm`), and
    /// every player waking in the story's steel with no weapon and hurt (`wake_for_story`), once.
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

    /// The story's sword and shield, or its bow (`kind`), taken from the deck into `player`'s pack, unworn, for them
    /// to equip; answers whether it was given: not while one is carried or worn, nor to a player with no room in
    /// their pack for it. One dismantled lies on the deck to be taken again.
    pub fn story_take(&mut self, player: PlayerId, kind: Kind) -> bool {
        if !matches!(kind, Kind::SwordAndShield | Kind::Bow) {
            return false;
        }
        let Some(found) = self.players.get_mut(&player).filter(|_| self.story) else { return false };
        let character = &mut found.character;
        let held = character.items.values().any(|(item, at)| item.kind == kind && *at != At::Vault);
        if held || character.carried_in(kind.slot()) >= gear::character::CARRIED_MOST {
            return false;
        }
        let id = character.take_id();
        character.items.insert(id, (story_item(id, kind), At::Carried));
        found.gear_changed = true;
        true
    }

    /// On the wreck, the wisp gives `player` the Storm for the rest of the prologue: the room's Arts work again, and
    /// the Storm is worn, its Anima and both Tenets earned and charged full. False outside the story or for no such
    /// player.
    pub fn story_storm(&mut self, player: PlayerId) -> bool {
        let Some(found) = self.players.get_mut(&player).filter(|_| self.story) else { return false };
        let arts = &mut found.character.arts;
        let earned = arts.earned.get_or_insert_with(Vec::new);
        let at = usize::from(STORM) - 1;
        if earned.len() <= at {
            earned.resize(at + 1, 0);
        }
        earned[at] = ALL_EARNED;
        arts.worn = STORM;
        found.casting = crate::arts::Casting { anima: 1.0, tenets: [1.0, 1.0], ..found.casting };
        found.gear_changed = true;
        found.gear_urgent = true;
        self.arts = true;
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
}

/// A player as the wreck wakes them: no weapon (the story's sword and shield lie on the deck), dressed in the story's
/// steel in place of what they wore, and `WOKE_HEALTH` of their health, the ram's harm.
pub(crate) fn wake_for_story(player: &mut crate::players::Player) {
    let character = &mut player.character;
    character.items.retain(|_, (item, at)| *at == At::Vault || !STRIPPED.contains(&item.bucket));
    for kind in ARMOUR {
        let id = character.take_id();
        character.items.insert(id, (story_item(id, kind), At::Worn(kind.slot())));
    }
    let fighter = &mut player.fighter;
    fighter.health = fighter.health.min(fighter.health_max * WOKE_HEALTH);
    player.gear_changed = true;
}

#[cfg(test)]
#[path = "story_tests.rs"]
mod story_tests;
