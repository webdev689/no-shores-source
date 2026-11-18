//! Blows judged in a room, as each defender saw them. A blow on a foe is judged at once against the foe as its striker
//! saw it. A blow on a player waits until that player's inputs show they had seen it land, or a little longer at most,
//! and is judged against the player as they stood then: their guard, their parry, their dodge, where their feet were.
//! What the verdict does is done to everyone as they are now.

use crate::Room;
use combat::fighter::{Action, Attack, FighterId};
use combat::judge::{answered, overreached, suffer};
use combat::shapes::{LATE, Telegraph};
use combat::shots::{Flight, fly, line_of};
use combat::strike::reaches;
use combat::{Blow, BlowKind, Fighter, Stroke, Verdict, judge, ticks};
use gear::Slot;

/// What a client is told of the fight: a blow and what it came to, a stagger, a death, a player standing again, a
/// foe's feint, a foe arriving.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EventKind {
    Hit = 1,
    Blocked = 2,
    Parried = 3,
    GuardBroken = 4,
    Dodged = 5,
    PerfectDodge = 6,
    Staggered = 7,
    Killed = 8,
    Respawned = 9,
    Feinted = 10,
    Spawned = 11,
    /// A foe's shield took a blow, the amount what it took; and broke under one.
    Shielded = 12,
    ShieldBroken = 13,
}

/// How a blow was struck, for the words a client shows.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum How {
    Swing = 1,
    Riposte = 2,
    Counter = 3,
    Telegraph = 4,
    Iron = 5,
    Shot = 6,
}

/// One thing that happened in the fight, at a tick.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Event {
    pub tick: u64,
    pub kind: EventKind,
    pub how: Option<How>,
    pub striker: FighterId,
    pub defender: FighterId,
    pub amount: f64,
    /// The stroke a swing came by, so a screen throws its blood the way the blade went; none for anything else.
    pub stroke: Option<Stroke>,
}

/// What a waiting blow must still ask of its defender when it is judged: a swing whether it reaches them, a
/// telegraphed blow whether their feet stand in its shape, a shot nothing more.
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Check {
    Swing { striker: Box<Fighter>, attack: Attack },
    Shape { telegraph: Telegraph, group: u32 },
    Shot,
}

/// A blow on a player, waiting for the player's view to reach the tick it landed.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Pending {
    pub blow: Blow,
    pub how: How,
    pub defender: FighterId,
    pub tick: u64,
    pub check: Check,
}

/// A telegraphed blow's landing, waiting for every player in its reach to be judged: whether any was struck or
/// guarded, and whether any dodged it perfectly. Found by no one, its foe is overreached.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Group {
    pub foe: FighterId,
    pub telegraph: Telegraph,
    pub waiting: u32,
    pub found: bool,
    pub perfect: bool,
}

/// How a swing was struck.
#[must_use]
pub fn how_of_swing(attack: &Attack, defender: FighterId) -> How {
    match attack.swing {
        combat::fighter::Swing::Riposte(foe) if foe == defender => How::Riposte,
        combat::fighter::Swing::Counter => How::Counter,
        _ => How::Swing,
    }
}

impl Room {
    /// Judges a blow against `then`, the defender as its striker saw it, and settles it now. `hand` is the striking
    /// player's hand, if a player struck.
    pub(crate) fn judge_now(&mut self, blow: &Blow, how: How, defender: FighterId, then: &Fighter, hand: Option<Slot>) {
        let verdict = judge(blow, then);
        self.settle(blow, how, defender, verdict, hand);
    }

    /// Does what a verdict does to the defender and its striker as they are now, and tells it. A player's blow that
    /// lands on a foe shares its kill, which pays everyone who shares it.
    pub(crate) fn settle(&mut self, blow: &Blow, how: How, defender: FighterId, verdict: Verdict, hand: Option<Slot>) {
        let Some(before) = self.fighter(defender).copied() else { return };
        if before.dead() {
            return;
        }
        let (verdict, shielded) = self.shielded(defender, blow, verdict);
        let after = suffer(&before, blow, &verdict);
        self.set_fighter(defender, after);
        // A blow too far below its foe's level to harm it shares nothing of its kill.
        if let Some(hand) = hand
            && blow.damage > 0.0
            && matches!(verdict, Verdict::Hit { .. } | Verdict::Blocked { .. } | Verdict::GuardBroken { .. })
        {
            self.mark_struck(blow.striker, defender, hand);
        }
        self.perks_after(blow.striker, defender, &verdict, after.dead());
        if after.dead() && self.foes.contains_key(&defender) {
            self.pay_kill(defender);
        }
        if let Some(striker) = self.fighter(blow.striker).copied().filter(|striker| !striker.dead()) {
            self.set_fighter(blow.striker, answered(&striker, defender, &verdict));
        }
        let (kind, amount) = match verdict {
            Verdict::Parried => (EventKind::Parried, 0.0),
            Verdict::Blocked { damage, .. } => (EventKind::Blocked, damage),
            Verdict::GuardBroken { damage } => (EventKind::GuardBroken, damage),
            Verdict::Dodged { perfect: true } => (EventKind::PerfectDodge, 0.0),
            Verdict::Dodged { perfect: false } => (EventKind::Dodged, 0.0),
            Verdict::Hit { damage, .. } => (EventKind::Hit, damage),
        };
        let stroke = match blow.kind {
            BlowKind::Swing(stroke) => Some(stroke),
            _ => None,
        };
        let mut tell = |kind, amount| {
            self.events.push(Event {
                tick: self.clock,
                kind,
                how: Some(how),
                striker: blow.striker,
                defender,
                amount,
                stroke,
            });
        };
        if let Some((took, broke)) = shielded {
            tell(EventKind::Shielded, took);
            if broke {
                tell(EventKind::ShieldBroken, 0.0);
            }
        }
        tell(kind, amount);
        if after.dead() {
            tell(EventKind::Killed, 0.0);
        } else if matches!(after.action, Action::Staggered { .. }) && !before.staggered() {
            tell(EventKind::Staggered, 0.0);
        }
        self.verdicts.push((blow.striker, defender, verdict));
    }

    /// The verdict as a foe's shield leaves it: the shield takes the blow's damage first, weighed by the blow's element
    /// against its own, and only what it could not hold reaches health. With it, what the shield took and whether it
    /// broke.
    fn shielded(&mut self, defender: FighterId, blow: &Blow, verdict: Verdict) -> (Verdict, Option<(f64, bool)>) {
        let Some(shield) = self.foes.get_mut(&defender).and_then(|foe| foe.shield.as_mut()) else {
            return (verdict, None);
        };
        if shield.left <= 0.0 {
            return (verdict, None);
        }
        let (element, held) = (gear::Element::from_number(blow.element), shield.left);
        let verdict = match verdict {
            // A blow the shield holds whole does not reach the foe at all, so it fills no poise either.
            Verdict::Hit { damage, poise } => {
                let reached = shield.struck(damage, element);
                Verdict::Hit { damage: reached, poise: if reached > 0.0 { poise } else { 0.0 } }
            }
            Verdict::Blocked { damage, stamina } => {
                Verdict::Blocked { damage: shield.struck(damage, element), stamina }
            }
            Verdict::GuardBroken { damage } => Verdict::GuardBroken { damage: shield.struck(damage, element) },
            other => return (other, None),
        };
        let took = held - shield.left;
        (verdict, (took > 0.0).then_some((took, shield.left <= 0.0)))
    }

    pub(crate) fn tell(
        &mut self,
        kind: EventKind,
        how: Option<How>,
        striker: FighterId,
        defender: FighterId,
        amount: f64,
    ) {
        self.events.push(Event { tick: self.clock, kind, how, striker, defender, amount, stroke: None });
    }

    /// Judges every waiting blow whose defender's view has reached it, or that has waited as long as a blow may.
    pub(crate) fn judge_waiting(&mut self) {
        let waiting = std::mem::take(&mut self.pending);
        for pending in waiting {
            let Some(player) = self.players.get(&pending.defender) else {
                self.group_judged(&pending, None);
                continue;
            };
            let late = self.clock.saturating_sub(pending.tick) >= crate::players::VIEW_LAG;
            let then = match player.as_it_saw(pending.tick) {
                Some(then) => *then,
                None if late => player.fighter,
                None => {
                    self.pending.push(pending);
                    continue;
                }
            };
            let before = player.as_it_saw(pending.tick.saturating_sub(u64::from(ticks(LATE)))).copied();
            self.judge_waited(&pending, &then, before.as_ref());
        }
    }

    /// One waiting blow, judged against the player as they stood when they saw it land (`before`: a little earlier).
    fn judge_waited(&mut self, pending: &Pending, then: &Fighter, before: Option<&Fighter>) {
        let feet = |fighter: &Fighter| [fighter.body.x, fighter.body.y, fighter.body.z];
        let verdict = match &pending.check {
            Check::Swing { striker, attack } if !reaches(striker, attack, feet(then), &self.blocks) => None,
            Check::Shape { telegraph, .. } if !telegraph.strikes(feet(then), &self.blocks) => {
                // Inside its shape a moment before it landed and out of it as it did: dodged perfectly.
                let left_late = before.is_some_and(|before| telegraph.strikes(feet(before), &self.blocks));
                left_late.then_some(Verdict::Dodged { perfect: true })
            }
            _ => Some(judge(&pending.blow, then)),
        };
        if let Some(verdict) = verdict {
            self.settle(&pending.blow, pending.how, pending.defender, verdict, None);
        }
        self.group_judged(pending, verdict);
    }

    /// Counts a telegraphed blow's judged defender; the last judged, a blow that found no one overreaches its foe.
    pub(crate) fn group_judged(&mut self, pending: &Pending, verdict: Option<Verdict>) {
        let Check::Shape { group, .. } = &pending.check else { return };
        let group = *group;
        let Some(entry) = self.groups.get_mut(&group) else { return };
        entry.waiting = entry.waiting.saturating_sub(1);
        match verdict {
            Some(Verdict::Dodged { perfect }) => entry.perfect |= perfect,
            Some(_) => entry.found = true,
            None => {}
        }
        if entry.waiting > 0 {
            return;
        }
        let ended = *entry;
        self.groups.remove(&group);
        self.telegraph_ended(&ended);
    }

    /// A telegraphed blow every defender has been judged against: found by no one, its foe overreaches.
    pub(crate) fn telegraph_ended(&mut self, ended: &Group) {
        if !ended.found
            && let Some(foe) = self.fighter(ended.foe).copied().filter(|foe| !foe.dead() && !foe.staggered())
        {
            self.set_fighter(ended.foe, overreached(&foe, &ended.telegraph, ended.perfect));
        }
        self.ended_telegraphs.push((ended.foe, !ended.found, ended.perfect));
    }

    /// Every shot flies a tick: one that strikes a foe is judged at once, one that strikes a player waits for their
    /// view; a shot strikes only the other side.
    pub(crate) fn fly_shots(&mut self) {
        let shots = std::mem::take(&mut self.shots);
        let everyone = self.fighters();
        for (shot, loosed) in shots {
            let Some(side) = self.fighter(shot.owner).map(|owner| owner.side) else { continue };
            let bodies: Vec<(FighterId, [f64; 3])> = everyone
                .iter()
                .filter(|(_, fighter)| fighter.side != side && !fighter.dead())
                .map(|(id, fighter)| (*id, [fighter.body.x, fighter.body.y, fighter.body.z]))
                .collect();
            let flight = fly(&shot, &self.blocks, &bodies);
            if let Flight::Stopped { at, .. } = flight
                && combat::shots::shot_numbers(shot.ranged).0 <= 0.0
            {
                self.lines.push(line_of(&shot, at));
            }
            match flight {
                Flight::Flying(next) => self.shots.push((next, loosed)),
                Flight::Stopped { struck: Some(defender), at } => {
                    let blow = combat::judge::shot_blow(&shot, [shot.at[0], shot.at[1]]);
                    let blow = self.empower_as(blow, defender, loosed);
                    // An arrow or a bolt covered its speed for each whole tick it flew, and in its last only as far as
                    // it went before it struck.
                    let [east, south, up] = [at[0] - shot.at[0], at[1] - shot.at[1], at[2] - shot.at[2]];
                    let last = libm::sqrt(east * east + south * south + up * up);
                    let covered =
                        combat::shots::shot_numbers(shot.ranged).0 * f64::from(shot.age) * movement::TICK_SECONDS
                            + last;
                    let blow = loosed.map_or(blow, |loosed| Self::at_range(blow, covered, &loosed.trim));
                    self.blow_lands(&blow, How::Shot, defender, Check::Shot);
                }
                Flight::Stopped { struck: None, .. } => {}
            }
        }
    }

    /// A player's ball, flown at once among the foes as the player's screen showed them (`view`), and judged against
    /// the foe it struck as `as_seen` has it. Answers where it stopped.
    pub(crate) fn shoot_seen(&mut self, shot: &combat::Shot, view: &[(FighterId, Fighter)]) -> [f64; 3] {
        let bodies: Vec<(FighterId, [f64; 3])> = view
            .iter()
            .filter(|(id, fighter)| self.foes.contains_key(id) && !fighter.dead())
            .map(|(id, fighter)| (*id, [fighter.body.x, fighter.body.y, fighter.body.z]))
            .collect();
        let (stop, struck) = match fly(shot, &self.blocks, &bodies) {
            Flight::Stopped { at, struck } => (at, struck),
            Flight::Flying(next) => (next.at, None),
        };
        if let Some(defender) = struck
            && let Some(then) = self.as_seen(defender, view)
        {
            let held = self.held(shot.owner, Slot::MainHand);
            let blow = self.empower_as(combat::judge::shot_blow(shot, [shot.at[0], shot.at[1]]), defender, held);
            // A ball's range is measured as an arrow's: the line it flew to where it struck.
            let [east, south, up] = [stop[0] - shot.at[0], stop[1] - shot.at[1], stop[2] - shot.at[2]];
            let covered = libm::sqrt(east * east + south * south + up * up);
            let blow = held.map_or(blow, |held| Self::at_range(blow, covered, &held.trim));
            self.judge_now(&blow, How::Shot, defender, &then, Some(Slot::MainHand));
        }
        stop
    }

    /// A blow reaching a defender: a foe is judged at once as it stands, a player waits for their view.
    pub(crate) fn blow_lands(&mut self, blow: &Blow, how: How, defender: FighterId, check: Check) {
        if self.players.contains_key(&defender) {
            self.pending.push(Pending { blow: *blow, how, defender, tick: self.clock, check });
        } else if let Some(then) = self.fighter(defender).copied() {
            self.judge_now(blow, how, defender, &then, Some(Slot::MainHand));
        }
    }
}

/// How a blow's kind reads.
#[must_use]
pub fn how_of(blow: &Blow, iron: bool) -> How {
    match blow.kind {
        BlowKind::Swing(_) => How::Swing,
        BlowKind::Telegraph(_) if iron => How::Iron,
        BlowKind::Telegraph(_) => How::Telegraph,
        BlowKind::Shot(_) => How::Shot,
    }
}
