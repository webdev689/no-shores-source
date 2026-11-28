//! The Atheric weapons' perks the room alone plays, as it plays the verbs (Gear, "Atherics"): what an intrinsic adds
//! to a blow as it is struck, what a blow that lands or kills sets off, and what each counts.
//!
//! A leap, a burst or a bite rides `BlowKind::Spell(CHAIN)`, a number no spell has, rather than a kind of its own:
//! a spell's blow is already never parried or guarded, passed by a dodge, taken by a shield by its element, and sets
//! off no weapon's perk (`perk_on`, `settle`), so nothing chains from a chain and the soft lock is left alone. Its kill
//! still charges the Anima, as any kill does, and pays the loadout the weapon is worn in.

use crate::judging::How;
use crate::perks::LONG_SHOT_M;
use crate::power::PLAYER_HARM;
use crate::spells::SPELL_HEIGHT;
use crate::{PlayerId, Room};
use combat::fighter::FighterId;
use combat::judge::{Blow, BlowKind};
use combat::{Fighter, Status, Verdict, ticks};
use gear::{Element, Slot};

/// The spell number an Atheric's leap, burst or bite rides as: none of the Arts' (1 to 10).
pub(crate) const CHAIN: u8 = 0;

/// Storm Gull leaps to this many more foes, each within this of the last (metres), for this share of the shot.
const LEAPS: usize = 3;
const LEAP_M: f64 = 8.0;
const LEAP_SHARE: f64 = 0.5;
/// Each burst's reach (metres) and the share of its blow each foe in it takes.
const PULLED_UNDER: (f64, f64) = (4.0, 1.0 / 3.0);
const LANTERNS_WAKE: (f64, f64) = (4.0, 0.5);
const KNELL: (f64, f64) = (5.0, 0.25);
const THE_NINTH: (f64, f64) = (4.0, 0.5);
/// The Ninth bursts on this many swings landed.
const NINTH_SWINGS: u32 = 9;
/// Coral Guard's bite: this share of the blow it blocked.
const BITE_SHARE: f64 = 0.2;
/// Thousand Cuts: each swing in a row this much harder than the last, to this much in all.
const CUTS_STEP: f64 = 0.1;
const CUTS_MOST: f64 = 0.5;
/// Call and Answer's answering shot strikes this many times as hard.
const ANSWER_TIMES: f64 = 1.4;
/// Conduit takes this share off the Tenets' cooldowns for each blow that lands.
const CONDUIT_SHARE: f64 = 0.02;
/// Swell: each kill this much harder, to this many kills, for this long (seconds).
const SWELL_STEP: f64 = 0.1;
const SWELL_MOST: u32 = 5;
const SWELL_S: f64 = 10.0;
/// The statuses a kill gives its striker, and for how long (seconds).
const KILL_STATUSES: [(&str, Status, f64); 3] =
    [("bleed_the_tide", Status::Haste, 4.0), ("long_wait", Status::Veiled, 3.0), ("undercurrent", Status::Linked, 3.0)];
/// Encore gives back this many shots for a kill.
const ENCORE_SHOTS: u16 = 2;

/// What a player's Atheric perks count, kept by the room beside `PerkCounts`: whether a shot of Call and Answer has
/// landed that the next answers; Swell's kills and the tick they last until; and The Ninth's swings landed, with the
/// tick of the last counted, so a sweep striking several foes counts once.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AthericCounts {
    called: bool,
    swell: u32,
    swell_until: u64,
    ninth: u32,
    ninth_tick: u64,
}

impl Room {
    /// What an Atheric's intrinsic adds to a player's blow as it is struck: Thousand Cuts by a swing's place in its
    /// foe's row, Call and Answer on the shot that answers, and Swell by its kills while they last. 1 for none.
    pub(crate) fn struck_harder(&self, blow: &Blow, defender: FighterId) -> f64 {
        let Some(found) = self.players.get(&blow.striker) else { return 1.0 };
        let counts = &found.atheric;
        let mut times = match blow.kind {
            BlowKind::Swing(_) if self.perk_on(blow, "thousand_cuts") => {
                let row = found.counts.row_after(defender, self.clock);
                1.0 + (CUTS_STEP * f64::from(row.saturating_sub(1))).min(CUTS_MOST)
            }
            BlowKind::Shot(_) if counts.called && self.perk_on(blow, "call_and_answer") => ANSWER_TIMES,
            _ => 1.0,
        };
        if counts.swell_until > self.clock && self.perk_on(blow, "swell") {
            times *= 1.0 + SWELL_STEP * f64::from(counts.swell);
        }
        times
    }

    /// Vigil: a player's shot that covered past 20 m to its foe is a crit.
    pub(crate) fn vigil(&self, blow: Blow, covered: f64) -> Blow {
        let far = matches!(blow.kind, BlowKind::Shot(_)) && covered >= LONG_SHOT_M;
        Blow { crit: blow.crit || (far && self.perk_on(&blow, "vigil")), ..blow }
    }

    /// Storm Gull: an aimed shot that landed on a foe leaps as lightning to up to three more, each the nearest within
    /// 8 m of the foe struck before it that none has struck, each for half the shot in Volt; with Squall Line, each a
    /// leap strikes is Charged. A dodged leap still leaps on from its foe.
    pub(crate) fn storm_gull(&mut self, blow: &Blow, defender: FighterId, verdict: &Verdict) {
        if !landed(verdict) || !self.foes.contains_key(&defender) || !self.perk_on(blow, "storm_gull") {
            return;
        }
        let Some(raw) = self.raw_of(blow, defender, Slot::Ranged) else { return };
        let squall = self.perk_on(blow, "squall_line");
        let mut struck = vec![defender];
        for _ in 0..LEAPS {
            let Some(last) = struck.last().copied() else { break };
            let Some(at) = self.fighter(last).map(feet) else { break };
            let near = self.foes_near(at, LEAP_M, SPELL_HEIGHT).into_iter().filter(|foe| !struck.contains(foe));
            let nearest = near.min_by(|first, second| self.apart(at, *first).total_cmp(&self.apart(at, *second)));
            let Some(next) = nearest else { break };
            struck.push(next);
            let element = Element::Volt as u8;
            let leapt = self.chain(blow.striker, Slot::Ranged, (last, next), raw * LEAP_SHARE, element, How::Leap);
            if squall && leapt.is_some_and(|verdict| landed(&verdict)) {
                self.give(next, Status::Charge, None, Some(blow.striker));
            }
        }
    }

    /// What a judged blow sets off of an Atheric's perks, after it is told: a foe's blow a player blocks with Coral
    /// Guard bites back; a player's on a foe counts and bursts as its perks say. A spell's blow, a chain's among them,
    /// sets off nothing.
    pub(crate) fn atheric_after(
        &mut self,
        blow: &Blow,
        defender: FighterId,
        before: &Fighter,
        verdict: &Verdict,
        after: &Fighter,
    ) {
        if matches!(blow.kind, BlowKind::Spell(_)) {
            return;
        }
        if matches!(verdict, Verdict::Blocked { .. }) && self.foes.contains_key(&blow.striker) {
            if !after.dead() {
                self.bite(blow, defender);
            }
            return;
        }
        if !self.players.contains_key(&blow.striker) || !self.foes.contains_key(&defender) {
            return;
        }
        let (player, clock) = (blow.striker, self.clock);
        let hand = if matches!(blow.kind, BlowKind::Shot(_)) { Slot::Ranged } else { self.striking(player) };
        // A punch with a ranged weapon drawn is no blow of its Atheric's.
        if hand == Slot::Ranged && !matches!(blow.kind, BlowKind::Shot(_)) {
            return;
        }
        let [called, conduit, riptide, ninth] =
            ["call_and_answer", "conduit", "riptide", "the_ninth"].map(|id| self.perk_on(blow, id));
        let swing = matches!(blow.kind, BlowKind::Swing(_));
        let mut ninth_burst = false;
        if landed(verdict) {
            let arts = self.arts;
            let Some(found) = self.players.get_mut(&player) else { return };
            if called && matches!(blow.kind, BlowKind::Shot(_)) {
                found.atheric.called = !found.atheric.called;
            }
            if conduit && arts {
                let ready = found.casting.tenets.map(|share| share >= 1.0);
                found.casting.cut(CONDUIT_SHARE);
                // The page is told as a Tenet comes ready, not at every blow: the gear message carries every item.
                found.gear_changed |= found.casting.tenets.map(|share| share >= 1.0) != ready;
            }
            let counts = &mut found.atheric;
            if ninth && swing && counts.ninth_tick != clock {
                counts.ninth_tick = clock;
                counts.ninth += 1;
                ninth_burst = counts.ninth >= NINTH_SWINGS;
                if ninth_burst {
                    counts.ninth = 0;
                }
            }
        }
        if riptide && landed(verdict) && swing && blow.riposte() && !after.dead() {
            self.give(defender, Status::Expose, None, Some(player));
        }
        let staggered = matches!(verdict, Verdict::Hit { .. }) && after.staggered() && !before.staggered();
        if staggered && !after.dead() && self.perk_on(blow, "knell") {
            self.burst(blow, defender, hand, KNELL, Element::Volt);
        }
        if ninth_burst {
            self.burst(blow, defender, hand, THE_NINTH, Element::Volt);
        }
        if after.dead() {
            self.atheric_kill(blow, defender, hand);
        }
    }

    /// What a player's kill with an Atheric sets off: Swell's count, the statuses and shots it gives back, and Pulled
    /// Under's and Lantern's Wake's bursts round the slain.
    fn atheric_kill(&mut self, blow: &Blow, slain: FighterId, hand: Slot) {
        let player = blow.striker;
        let [swell, encore, pulled, wake] =
            ["swell", "encore", "pulled_under", "lanterns_wake"].map(|id| self.perk_on(blow, id));
        let given: Vec<(Status, f64)> = KILL_STATUSES
            .iter()
            .filter(|(id, ..)| self.perk_on(blow, id))
            .map(|&(_, status, seconds)| (status, seconds))
            .collect();
        let clock = self.clock;
        if let Some(found) = self.players.get_mut(&player) {
            let counts = &mut found.atheric;
            if swell {
                // A Swell run out begins again.
                let kept = if counts.swell_until > clock { counts.swell } else { 0 };
                counts.swell = (kept + 1).min(SWELL_MOST);
                counts.swell_until = clock + u64::from(ticks(SWELL_S));
            }
            if encore && let Some(most) = found.character.ammo_most() {
                let character = &mut found.character;
                character.ammo =
                    (character.ammo + ENCORE_SHOTS * (gear::ammo::AMMO_FULL / most)).min(gear::ammo::AMMO_FULL);
                found.fighter = found.armed(found.fighter);
                found.gear_changed = true;
            }
        }
        for (status, seconds) in given {
            self.give(player, status, Some(ticks(seconds)), Some(player));
        }
        if pulled {
            for foe in self.burst(blow, slain, hand, PULLED_UNDER, Element::Cosmic) {
                self.give(foe, Status::Expose, None, Some(player));
            }
        }
        if wake {
            self.burst(blow, slain, hand, LANTERNS_WAKE, Element::Blaze);
        }
    }

    /// A burst round `centre` for `share` of a player's blow on it, in `element`, on every other living foe within
    /// `reach` but those the swing settling now strikes (`Room::sweep`), so one blow strikes a foe once; answers those
    /// it landed on.
    fn burst(
        &mut self,
        blow: &Blow,
        centre: FighterId,
        hand: Slot,
        (reach, share): (f64, f64),
        element: Element,
    ) -> Vec<FighterId> {
        let Some(at) = self.fighter(centre).map(feet) else { return Vec::new() };
        let Some(raw) = self.raw_of(blow, centre, hand) else { return Vec::new() };
        let caught = self
            .foes_near(at, reach, SPELL_HEIGHT)
            .into_iter()
            .filter(|foe| *foe != centre && !self.sweep.contains(foe));
        let caught: Vec<FighterId> = caught.collect();
        // Within a sweep, a foe one of its bursts caught is caught by no other of them.
        if !self.sweep.is_empty() {
            self.sweep.extend(&caught);
        }
        caught
            .into_iter()
            .filter(|foe| {
                let verdict = self.chain(blow.striker, hand, (centre, *foe), raw * share, element as u8, How::Burst);
                verdict.is_some_and(|verdict| landed(&verdict))
            })
            .collect()
    }

    /// Coral Guard: a foe's blow a player blocked with it drawn bites its striker for a fifth of it, by the weapon's
    /// Attack, in the weapon's element.
    fn bite(&mut self, blow: &Blow, player: PlayerId) {
        let hand = self.striking(player);
        let Some(found) = self.players.get(&player) else { return };
        if !found.character.has_drawn_trait("coral_guard", hand) {
            return;
        }
        let Some(foe) = self.foes.get(&blow.striker) else { return };
        let character = &found.character;
        let times = gear::power::on_player(character.defense(), character.level(), foe.level) * crate::power::FOE_HARM;
        if times <= 0.0 {
            return;
        }
        let element = character.worn(hand).and_then(|item| item.element).map_or(0, |element| element as u8);
        self.chain(player, hand, (player, blow.striker), blow.damage / times * BITE_SHARE, element, How::Bite);
    }

    /// One leap, burst or bite: `raw` of combat's own damage made the player's blow on `foe` by the Attack of the
    /// loadout `hand` against its level, in `element`, judged as a spell's blow is and settled as theirs from that
    /// loadout, its events telling the fighter it came from. Answers its verdict; none for a foe dead or gone.
    fn chain(
        &mut self,
        player: PlayerId,
        hand: Slot,
        (from, foe): (FighterId, FighterId),
        raw: f64,
        element: u8,
        how: How,
    ) -> Option<Verdict> {
        let then = self.foes.get(&foe).map(|found| found.fighter).filter(|then| !then.dead())?;
        let at = self.fighter(from).map_or([then.body.x, then.body.y], |source| [source.body.x, source.body.y]);
        let blow = Blow {
            striker: player,
            kind: BlowKind::Spell(CHAIN),
            from: at,
            damage: raw * self.power_on(player, hand, foe),
            poise: 0.0,
            guard: 0.0,
            parryable: false,
            blockable: false,
            knocks_down: false,
            through: 1.0,
            stagger: 1.0,
            element,
            crit: false,
        };
        self.chain_from = Some(from);
        let verdict = self.judge_now(&blow, how, foe, &then, Some(hand));
        self.chain_from = None;
        Some(verdict)
    }

    /// A player's blow on a foe back in combat's own damage: what it struck with less the power its loadout's Attack
    /// gave it against the foe's level. None where that power is none.
    fn raw_of(&self, blow: &Blow, foe: FighterId, hand: Slot) -> Option<f64> {
        let times = self.power_on(blow.striker, hand, foe);
        (times > 0.0).then(|| blow.damage / times)
    }

    /// What a player's blow from a loadout strikes times on a foe by the loadout's Attack and their levels, as
    /// `empower` makes it.
    fn power_on(&self, player: PlayerId, hand: Slot, foe: FighterId) -> f64 {
        let (Some(found), Some(foe)) = (self.players.get(&player), self.foes.get(&foe)) else { return 0.0 };
        let character = &found.character;
        // A shot's by the Attack and the item it was loosed with, as its own blow was.
        let loosed = self.shot_loosed.filter(|_| hand == Slot::Ranged);
        let attack = loosed.map(|loosed| loosed.attack).or_else(|| character.attack(hand)).unwrap_or(0);
        let item = loosed.map_or_else(|| character.worn(hand), |loosed| loosed.item.and_then(|id| character.item(id)));
        let forged = item.is_some_and(gear::Item::forged_weapon);
        gear::power::by_weapon(attack, forged, character.level(), foe.level) * PLAYER_HARM
    }

    /// How far a foe's feet stand from a point across the ground.
    fn apart(&self, at: [f64; 3], foe: FighterId) -> f64 {
        self.fighter(foe).map_or(f64::INFINITY, |found| libm::hypot(found.body.x - at[0], found.body.y - at[1]))
    }
}

/// Whether a verdict met its defender's body or guard.
fn landed(verdict: &Verdict) -> bool {
    matches!(verdict, Verdict::Hit { .. } | Verdict::Blocked { .. } | Verdict::GuardBroken { .. })
}

fn feet(fighter: &Fighter) -> [f64; 3] {
    [fighter.body.x, fighter.body.y, fighter.body.z]
}

#[cfg(test)]
#[path = "atheric_tests.rs"]
mod atheric_tests;
