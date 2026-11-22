//! What a fighter's tick sets off in its room: a swing heard, a blow landing on whoever it reaches, a shot leaving, a
//! feint, a drink's heal.

use super::*;

impl Room {
    /// What a fighter's tick set off, among `view`, everyone as it saw them: a blow landing on whoever it reaches, a
    /// shot leaving, a feint, a drink's heal.
    pub(crate) fn happened(
        &mut self,
        id: FighterId,
        fighter: &Fighter,
        happening: Option<Happening>,
        view: &[(FighterId, Fighter)],
    ) {
        if matches!(happening, Some(Happening::Swung(_) | Happening::Loosed(_)))
            && let Some(found) = self.players.get_mut(&id)
        {
            // Striking first ends the grace a player stood again with.
            found.graced = 0;
        }
        match happening {
            Some(Happening::Swung(attack)) => self.swings.push((id, attack)),
            Some(Happening::Struck(attack)) => {
                self.sweep = struck(id, fighter, &attack, view, &self.blocks, &self.floor);
                for defender in self.sweep.clone() {
                    let blow = self.empower(swing_blow(id, fighter, &attack, defender), defender);
                    let how = how_of_swing(&attack, defender);
                    if self.players.contains_key(&defender) {
                        let check = Check::Swing { striker: Box::new(*fighter), attack };
                        self.pending.push(Pending { blow, how, defender, tick: self.clock, check });
                    } else if let Some(then) = self.as_seen(defender, view) {
                        let loadout = self.striking(id);
                        self.judge_now(&blow, how, defender, &then, Some(loadout));
                    }
                }
                self.sweep.clear();
            }
            Some(Happening::Loosed(shot)) => {
                let shot = Shot { owner: id, ..shot };
                self.loosed.push(id);
                self.spent_shot(id);
                // A player's ball reaches its mark at once: judged among the foes as the player's screen showed them.
                if self.players.contains_key(&id) && combat::shots::shot_numbers(shot.ranged).0 <= 0.0 {
                    let stop = self.shoot_seen(&shot, view);
                    self.lines.push(combat::shots::stopped_line(&shot, stop));
                } else {
                    let loosed = self
                        .held(id, gear::Slot::Ranged)
                        .map(|held| power::Loosed { aimed: power::aimed(&shot), ..held });
                    self.shots.push((shot, loosed));
                }
            }
            Some(Happening::Feinted(_)) => self.tell(EventKind::Feinted, None, id, id, 0.0),
            Some(Happening::Drank(healed)) => self.tell(EventKind::Healed, None, id, id, healed),
            _ => {}
        }
    }
}
