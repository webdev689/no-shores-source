//! What a room hands its host to send out: every fighter and player as it last stepped them, the shots in flight, the
//! lines and events since it was last asked, and its clock; and each fighter by its number, as the room's rules read
//! and set it.

use crate::{Event, PlayerId, Room, Seen};
use combat::Fighter;
use combat::Shot;
use combat::fighter::FighterId;
use combat::shots::Line;

impl Room {
    /// Every fighter now, players then foes, each in the order of their numbers.
    #[must_use]
    pub fn fighters(&self) -> Vec<(FighterId, Fighter)> {
        let players = self.players.iter().map(|(id, found)| (*id, found.fighter));
        // A foe arriving is in no one's sight, nor any blow's reach, until it lands.
        let landed = self.foes.iter().filter(|(id, _)| !self.arriving(**id));
        players.chain(landed.map(|(id, foe)| (*id, foe.fighter))).collect()
    }

    /// A foe a player's blow reached, as the player's screen showed it (`view`): where it stood then, but guarding,
    /// dodging and staggered as it is now, so a foe's answers count the same whatever the player's lag.
    pub(crate) fn as_seen(&self, foe: FighterId, view: &[(FighterId, Fighter)]) -> Option<Fighter> {
        let then = view.iter().find(|(other, _)| *other == foe).map(|(_, then)| then.body)?;
        self.fighter(foe).map(|now| Fighter { body: then, ..*now })
    }

    pub(crate) fn fighter(&self, id: FighterId) -> Option<&Fighter> {
        self.players.get(&id).map(|found| &found.fighter).or_else(|| self.foes.get(&id).map(|foe| &foe.fighter))
    }

    pub(crate) fn set_fighter(&mut self, id: FighterId, fighter: Fighter) {
        if let Some(found) = self.players.get_mut(&id) {
            found.fighter = fighter;
        } else if let Some(foe) = self.foes.get_mut(&id) {
            foe.fighter = fighter;
        }
    }

    /// The number of a player's last input received, the latest tick their screen said it showed, and the tick they
    /// joined at; none for no such player.
    #[must_use]
    pub fn heard(&self, player: PlayerId) -> Option<(u32, u64, u64)> {
        self.players.get(&player).map(|found| (found.received, found.shown_tick, found.joined))
    }

    /// Every player as the room last stepped them, in the order of their numbers.
    pub fn seen(&self) -> impl Iterator<Item = Seen> + '_ {
        self.players.iter().map(|(&player, found)| Seen {
            player,
            fighter: found.fighter,
            standing: found.standing,
            shown: found.shown.clone(),
            acknowledged: found.acknowledged,
        })
    }

    /// The shots in flight.
    pub fn shots(&self) -> impl Iterator<Item = &Shot> {
        self.shots.iter().map(|(shot, _)| shot)
    }

    /// The balls that stopped since this was last asked, each as its line, to send to everyone once so every screen
    /// ends its tracer where it stopped, however many ticks a snapshot follows.
    pub fn take_lines(&mut self) -> Vec<Line> {
        std::mem::take(&mut self.lines)
    }

    /// What happened in the fight since this was last asked, to send to everyone once.
    pub fn take_events(&mut self) -> Vec<Event> {
        std::mem::take(&mut self.events)
    }

    #[must_use]
    pub fn clock(&self) -> u64 {
        self.clock
    }
}
