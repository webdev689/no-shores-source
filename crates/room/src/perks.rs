//! Perks in the room: the trim a player's worn traits make of combat's numbers, which their fighter carries so their
//! browser predicts it too; the perks a blow takes on as it is struck, which the room alone knows the moment of (Honed,
//! Executioner, Undertow, Point Blank, Long Shot); and those a parry, a block or a kill sets off.

use crate::{PlayerId, Room};
use combat::fighter::{Action, FighterId};
use combat::judge::Blow;
use combat::tuning::STAMINA;
use combat::{BlowKind, Trim, Verdict};
use gear::Character;

/// A shot within this of its target is point blank; past this, a long shot (metres).
const POINT_BLANK_M: f64 = 5.0;
const LONG_SHOT_M: f64 = 20.0;

/// The trim the traits a player's worn gear gives make: each trait's own, every one counted once however many pieces
/// give it. Forager and Scholar trim nothing in a fight: the gear's own rules give their more.
#[must_use]
pub fn trim_of(character: &Character) -> Trim {
    let mut trim = Trim::PLAIN;
    for id in character.traits() {
        match id {
            "light_grip" => trim.swing_stamina *= 0.85,
            "weighted" => trim.poise_given *= 1.2,
            "keen_edge" => trim.guard_through *= 1.5,
            "quick_hands" => trim.reload *= 0.85,
            "steady_draw" => trim.aimed *= 1.1,
            // Two thirds of the pace aiming, not half.
            "light_stock" => trim.aim_pace *= 4.0 / 3.0,
            "balanced" => trim.drawn_dodge_stamina *= 0.9,
            "steady" => trim.drawn_poise_taken *= 0.9,
            "honed" => trim.damage *= 1.05,
            "bloodletter" => trim.kill_stamina += 20.0,
            "executioner" => trim.on_staggered *= 1.15,
            "riposte_master" => trim.riposte *= 1.25,
            "opportunist" => trim.counter *= 1.25,
            "guardbreaker" => trim.guard_wear *= 1.3,
            "point_blank" => trim.point_blank *= 1.2,
            "long_shot" => trim.long_shot *= 1.15,
            "second_wind" => trim.regen *= 1.15,
            "sure_footing" => trim.dodge_stamina *= 0.85,
            "bulwark" => trim.guard_stamina *= 0.85,
            // Poise holding 15% more: each blow fills it as much less.
            "unshaken" => trim.poise_taken /= 1.15,
            "hardy" => trim.telegraph_taken *= 0.9,
            "undertow" => trim.on_low *= 1.3,
            "last_light" => {
                trim.kill_reload = true;
                trim.kill_stamina += 25.0;
            }
            "tolling" => trim.stagger_given *= 1.5,
            "updraft" => trim.draw *= 0.5,
            "coral_guard" => trim.block_stamina += 10.0,
            "deep_breath" => trim.regen_low *= 1.5,
            "barnacle" => trim.behind_taken *= 2.0 / 3.0,
            "ebb" => trim.parry_stamina += 30.0,
            "slipstream" => trim.counter *= 1.5,
            _ => {}
        }
    }
    trim
}

impl Room {
    /// Sets a player's trim from their worn gear, after an ask that may have changed it.
    pub(crate) fn retrim(&mut self, player: PlayerId) {
        if let Some(found) = self.players.get_mut(&player) {
            found.trim = trim_of(&found.character);
            found.fighter.trim = found.trim;
        }
    }

    /// The perks a player's blow on a foe takes on as it is struck: Honed on every blow, Executioner on a staggered
    /// foe, Undertow on one below half its health.
    pub(crate) fn sharpened(&self, blow: Blow, defender: FighterId) -> Blow {
        let (Some(striker), Some(foe)) = (self.players.get(&blow.striker), self.fighter(defender)) else { return blow };
        if !self.foes.contains_key(&defender) {
            return blow;
        }
        let trim = &striker.fighter.trim;
        let staggered = if foe.staggered() { trim.on_staggered } else { 1.0 };
        let low = if foe.health < foe.health_max / 2.0 { trim.on_low } else { 1.0 };
        Blow { damage: blow.damage * trim.damage * staggered * low, ..blow }
    }

    /// A player's shot by the ground it covered to its mark: Point Blank within 5 m, Long Shot past 20.
    pub(crate) fn at_range(&self, blow: Blow, covered: f64) -> Blow {
        let Some(striker) = self.players.get(&blow.striker) else { return blow };
        if !matches!(blow.kind, BlowKind::Shot(_)) {
            return blow;
        }
        let trim = &striker.fighter.trim;
        let range = if covered <= POINT_BLANK_M {
            trim.point_blank
        } else if covered >= LONG_SHOT_M {
            trim.long_shot
        } else {
            1.0
        };
        Blow { damage: blow.damage * range, ..blow }
    }

    /// What a verdict sets off of a player's perks: a parry or a block gives the defender back stamina, and a kill
    /// gives its striker stamina and may reload their weapon at once.
    pub(crate) fn perks_after(&mut self, striker: FighterId, defender: FighterId, verdict: &Verdict, killed: bool) {
        let back = |fighter: &mut combat::Fighter, stamina: f64| {
            fighter.stamina = (fighter.stamina + stamina).min(STAMINA);
        };
        if let Some(found) = self.players.get_mut(&defender) {
            let trim = found.fighter.trim;
            match verdict {
                Verdict::Parried => back(&mut found.fighter, trim.parry_stamina),
                Verdict::Blocked { .. } => back(&mut found.fighter, trim.block_stamina),
                _ => {}
            }
        }
        if !killed {
            return;
        }
        if let Some(found) = self.players.get_mut(&striker) {
            let trim = found.fighter.trim;
            back(&mut found.fighter, trim.kill_stamina);
            if trim.kill_reload && matches!(found.fighter.action, Action::Reload { .. }) {
                found.fighter.action = Action::Idle;
            }
        }
    }
}
