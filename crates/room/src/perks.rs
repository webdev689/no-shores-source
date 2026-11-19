//! Perks in the room: the trim a player's worn traits make of combat's numbers, which their fighter carries so their
//! browser predicts it too; the perks a blow takes on as it is struck, which the room alone knows the moment of (Honed,
//! Executioner, Undertow, Exploit, Attuned, Point Blank, Long Shot); those a parry, a block or a kill sets off; and the
//! verbs, the perks that give a status as a blow lands or a foe falls, with what they count from blow to blow.

use crate::{PlayerId, Room};
use combat::fighter::{Action, FighterId};
use combat::judge::Blow;
use combat::tuning::STAMINA;
use combat::{BlowKind, Status, Trim, Verdict, ticks};
use gear::{Character, Slot};

/// A shot within this of its target is point blank; past this, a long shot (metres).
const POINT_BLANK_M: f64 = 5.0;
const LONG_SHOT_M: f64 = 20.0;
/// Attuned's blows deal this much; Keen Eye's Crit lasts this long (seconds).
const ATTUNED_TIMES: f64 = 1.1;
const KEEN_EYE_S: f64 = 4.0;
/// Exposing Strikes Exposes a foe at this many swings in a row landed on it; Shocking Rounds Charges at this many
/// shots landed.
const ROW_EXPOSES: u32 = 3;
const SHOTS_CHARGE: u32 = 5;

/// What a player's verbs count from blow to blow, kept by the room alone: the ticks of their last two swings that
/// landed, and each foe struck in a row with how many and the tick of the last (Exposing Strikes); the living foes
/// their shots have marked (Marked Shot); and their shots landed since Shocking Rounds last Charged.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PerkCounts {
    swung: [u64; 2],
    rows: Vec<(FighterId, u32, u64)>,
    marked: Vec<FighterId>,
    shots: u32,
}

impl PerkCounts {
    /// Counts a swing's blow on a foe at a tick, answering whether it is the third of a row, which then begins again.
    /// Landed, it carries on the foe's row if the player's last swing before this one landed on the foe too, so a
    /// sweep that strikes it beside others keeps it; else it begins one. Parried or dodged, it ends the foe's row. A
    /// swing that lands on no one leaves the other foes' rows as they were.
    fn in_row(&mut self, foe: FighterId, landed: bool, tick: u64) -> bool {
        let held = self.rows.iter().find(|row| row.0 == foe).copied();
        self.rows.retain(|row| row.0 != foe);
        if !landed {
            return false;
        }
        if self.swung[1] != tick {
            self.swung = [self.swung[1], tick];
        }
        let before = self.swung[0];
        self.rows.retain(|row| row.2 >= before);
        let count = held.filter(|row| row.2 == before).map_or(1, |row| row.1 + 1);
        if count >= ROW_EXPOSES {
            return true;
        }
        self.rows.push((foe, count, tick));
        false
    }

    /// Marks a foe a shot landed on, answering whether it is the first to: a foe is marked once. A foe dead or gone
    /// from the room (`living` false) is forgotten.
    fn marks(&mut self, foe: FighterId, living: impl Fn(FighterId) -> bool) -> bool {
        self.marked.retain(|marked| living(*marked));
        let first = !self.marked.contains(&foe);
        if first {
            self.marked.push(foe);
        }
        first
    }

    /// Counts a shot landed, answering whether it is the fifth, after which the count begins again.
    fn shot_landed(&mut self) -> bool {
        self.shots += 1;
        let charges = self.shots >= SHOTS_CHARGE;
        if charges {
            self.shots = 0;
        }
        charges
    }
}

/// The trim the traits a player's worn gear gives make while a loadout is drawn: each trait's own, of the armour and
/// that loadout, every one counted once however many pieces give it. Forager and Scholar trim nothing in a fight: the
/// gear's own rules give their more.
#[must_use]
pub fn trim_of(character: &Character, drawn: Slot) -> Trim {
    let mut trim = Trim::PLAIN;
    for id in character.traits(drawn) {
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
    /// Sets a player's trims from their worn gear, after an ask that may have changed it, their fighter taking the one
    /// of the loadout it has drawn (`Player::armed`).
    pub(crate) fn retrim(&mut self, player: PlayerId) {
        if let Some(found) = self.players.get_mut(&player) {
            found.trims = [Slot::Melee, Slot::Ranged].map(|drawn| trim_of(&found.character, drawn));
            found.fighter = found.armed(found.fighter);
        }
    }

    /// The perks a player's blow on a foe takes on as it is struck: Honed on every blow, Executioner on a staggered
    /// foe (a riposte, the stagger's own answer, aside, as combat counts it), Undertow on one below half its health,
    /// Exploit marking a swing on an Exposed foe a crit, and Attuned on a blow in the worn Art's element (`perk_on`:
    /// of the loadout the blow came from, never a spell's).
    pub(crate) fn sharpened(&self, blow: Blow, defender: FighterId, trim: &Trim) -> Blow {
        let Some(foe) = self.fighter(defender) else { return blow };
        let Some(player) = self.players.get(&blow.striker).filter(|_| self.foes.contains_key(&defender)) else {
            return blow;
        };
        let staggered = if foe.staggered() && !blow.riposte() { trim.on_staggered } else { 1.0 };
        let low = if foe.health < foe.health_max / 2.0 { trim.on_low } else { 1.0 };
        let swing = matches!(blow.kind, BlowKind::Swing(_));
        let exploits = swing && foe.statuses.has(Status::Expose) && self.perk_on(&blow, "exploit");
        let in_element = blow.element != 0 && blow.element == player.character.art().element;
        let attuned = if in_element && self.perk_on(&blow, "attuned") { ATTUNED_TIMES } else { 1.0 };
        Blow { damage: blow.damage * trim.damage * staggered * low * attuned, crit: blow.crit || exploits, ..blow }
    }

    /// A player's shot by the ground it covered to its mark and the trim it was loosed with: Point Blank within 5 m,
    /// Long Shot past 20.
    pub(crate) fn at_range(blow: Blow, covered: f64, trim: &Trim) -> Blow {
        if !matches!(blow.kind, BlowKind::Shot(_)) {
            return blow;
        }
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

    /// What a player's blow on a foe sets off of their verbs, through the room's one door for statuses, so no browser
    /// predicts them: Exposing Strikes on the third swing in a row landed on one foe, Thunderclap on a guard a swing
    /// breaks, Marked Shot on the player's first shot to land on a foe, Shocking Rounds on every fifth shot landed, and
    /// Keen Eye's Crit on a kill; each the loadout's the blow came from (`perk_on`), none a spell's.
    pub(crate) fn verbs_after(&mut self, blow: &Blow, defender: FighterId, verdict: &Verdict, killed: bool) {
        if !self.foes.contains_key(&defender) {
            return;
        }
        let clock = self.clock;
        let [rows, clap, marked, shocking, keen] =
            ["exposing_strikes", "thunderclap", "marked_shot", "shocking_rounds", "keen_eye"]
                .map(|id| self.perk_on(blow, id));
        let foes = &self.foes;
        let living = |foe: FighterId| foes.get(&foe).is_some_and(|found| !found.fighter.dead());
        let Some(found) = self.players.get_mut(&blow.striker) else { return };
        let landed = matches!(verdict, Verdict::Hit { .. } | Verdict::Blocked { .. } | Verdict::GuardBroken { .. });
        let mut given = Vec::new();
        match blow.kind {
            BlowKind::Swing(_) => {
                if rows && found.counts.in_row(defender, landed, clock) {
                    given.push(Status::Expose);
                }
                if clap && matches!(verdict, Verdict::GuardBroken { .. }) {
                    given.push(Status::Charge);
                }
            }
            BlowKind::Shot(_) if landed => {
                if marked && found.counts.marks(defender, living) {
                    given.push(Status::Expose);
                }
                if shocking && found.counts.shot_landed() {
                    given.push(Status::Charge);
                }
            }
            _ => {}
        }
        if killed && keen {
            self.give(blow.striker, Status::Crit, Some(ticks(KEEN_EYE_S)), Some(blow.striker));
        }
        for status in given {
            self.give(defender, status, None, Some(blow.striker));
        }
    }
}

#[cfg(test)]
#[path = "verbs_tests.rs"]
mod verbs_tests;
