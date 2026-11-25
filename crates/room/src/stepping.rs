//! Each tick's stepping of the players: their inputs taken in order, their asks, casts and blows, the dead lying
//! still or standing again, and each judged against the section.

use crate::{CATCH_UP, Floor, PlayerId, Room, Standing, allowed_arms, chain, riding};
use combat::arms::{Arms, BARE_HANDS};
use combat::player_tick;
use movement::{Body, Mode};
use reach::Place;
use std::borrow::Cow;

impl Room {
    /// Each player's inputs step their fighter, as many as the clock allows and CATCH_UP at most; a player whose
    /// inputs have stopped coming is stepped standing still once they fall a view's lag behind, so nothing they were
    /// doing (a dodge's safe stretch, a guard's parry window) outlasts its time while they are away. A body the section
    /// killed falls under its own weight (`lying_still`): its inputs are taken without steering it, and one asking to
    /// respawn, once the section allows, stands it where a respawn stands a player (`stand_again`). Each input also
    /// says whether Use is held to revive and whether the player asks to respawn (`revive.rs`). Then each player is
    /// judged against the section, from the height their feet last stood at.
    pub(crate) fn step_players(&mut self) {
        // The kept views are lent to each input, not copied: they stand aside while the players step.
        let past = std::mem::take(&mut self.past);
        let ids: Vec<PlayerId> = self.players.keys().copied().collect();
        for id in ids {
            if let Some(found) = self.players.get_mut(&id) {
                found.dress_in_turn(self.clock);
            }
            self.answer_due(id);
            let mut taken = 0;
            while taken < CATCH_UP {
                let Some((mut input, seen)) = self.next_input(id) else { break };
                taken += 1;
                // The room says who rides and who shows a horse, whatever the page says (`riding.rs`).
                riding::ride(self.players.get_mut(&id), &mut input, matches!(self.floor, Floor::Deck(_)));
                if let Some(asked) = input.ask.take() {
                    self.take_ask(id, asked);
                }
                self.ask_cast(id, input.cast.filter(|_| !input.intent.controls.mounted));
                // Nothing is fought from the saddle, as the page never asks it: no swing, guard, shot or aim.
                if input.intent.controls.mounted {
                    let pitch = input.intent.combat.pitch;
                    input.intent.combat = combat::CombatInput { pitch, ..combat::CombatInput::default() };
                }
                // A cast under way holds off a drink, so neither is lost to the other: this press and one kept from a
                // moment before alike; the page holds its press too.
                if let Some(found) = self.players.get_mut(&id).filter(|found| found.casting.releasing.is_some()) {
                    input.intent.combat.heal = false;
                    found.fighter.kept.heal = 0;
                }
                let bearer = self.bears_lodestone(id);
                let kept = past.iter().find(|(kept, _)| *kept == seen).map(|(_, view)| view.as_slice());
                let view = kept.map_or_else(|| Cow::Owned(self.fighters()), Cow::Borrowed);
                let Some(found) = self.players.get_mut(&id) else { break };
                if let Standing::Dead { .. } = found.standing {
                    self.step_dead(id, input, seen, &view);
                    continue;
                }
                // The Lodestone's bearer holds no weapon: their swing is its Strike (`breach/lodestone.rs`).
                let asked_arms =
                    if bearer { BARE_HANDS } else { allowed_arms(Arms::from_code(input.arms), &found.character) };
                let held = found.fighter.holding(asked_arms);
                let fighter = found.armed(held);
                let asked = &mut input.intent.combat.attack;
                *asked = asked.map(|asked| chain::stroke(found.chain, asked, &fighter, &view));
                let (next, happening) = player_tick(id, &fighter, &input.intent, &view, &self.blocks, &self.floor);
                (found.fighter, found.chain) = (next, found.chain.after(&next));
                found.shown = input.shown;
                found.remember(seen);
                (found.reviving, found.respawn_asked) = (input.revive, found.respawn_asked || input.respawn);
                if let Some(ask) = input.spawn.filter(|_| self.takes_foe_asks) {
                    self.spawns.push((id, ask, input.spawn_level));
                }
                self.happened(id, &next, happening, &view);
            }
            if taken == 0 {
                self.stand_stalled(id);
            }
            if let (Some(section), Some(found)) = (&self.section, self.players.get_mut(&id)) {
                let Body { x, y, z, mode, .. } = found.fighter.body;
                let at = Place { x, y, z, aloft: mode == Mode::Air };
                found.standing = found.standing.tick(section, at, found.stood);
                found.stood = reach::stood(found.stood, at);
            }
        }
        self.past = past;
    }
}
