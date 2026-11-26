//! A test room: a developer's test run, or the zone copy whose Breach's gate opens one (the host's `testRuns.ts`).
//! Every player joining it plays the test character (`gear::Character::max_test`), and in it alone the tester deals
//! TEST_HARM times the harm and never falls, the gate lets them in whatever it would ask, one player counts as the
//! whole company, and what one player cannot do alone in the Breach is let be.

use crate::{PlayerId, Room};
use combat::fighter::{Action, Fighter};

/// What a player's blow on a foe strikes times in a test room, beyond every other room's weighing.
pub const TEST_HARM: f64 = 10.0;

impl Room {
    /// Makes this room a test room, before anyone joins it.
    pub fn make_test(&mut self) {
        self.test = true;
    }

    /// Whether this is a test room.
    #[must_use]
    pub fn is_test(&self) -> bool {
        self.test
    }

    /// A player's blows' weight beyond every other room's: TEST_HARM in a test room, else 1.
    pub(crate) fn test_harm(&self) -> f64 {
        if self.test { TEST_HARM } else { 1.0 }
    }

    /// A fighter as a blow left it, its health never below 1 for a player in a test room, so they never fall.
    pub(crate) fn floored(&self, id: PlayerId, mut after: Fighter) -> Fighter {
        if self.test && self.players.contains_key(&id) {
            after.health = after.health.max(1.0);
            if after.dead() {
                after.action = Action::Idle;
            }
        }
        after
    }
}
