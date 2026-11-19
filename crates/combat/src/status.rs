//! A fighter's statuses: the verbs Crit, Expose and Charge, and the buffs Haste, Linked and Veiled. Each is kept in whole
//! ticks with the fighter who gave it, runs down a tick each time its fighter steps (so a browser predicting its own
//! player runs it down alike), and weighs the blows its fighter strikes and takes.

use crate::fighter::{Action, Cause, Fighter, FighterId};
use crate::judge::{Blow, BlowKind};
use crate::sight::{bearing, off};

const DEGREES: f64 = core::f64::consts::PI / 180.0;

/// A crit hit deals this much; Crit lasts this long unless its giver says.
pub const CRIT_TIMES: f64 = 1.5;
pub const CRIT_TICKS: u32 = 300;
/// An Exposed fighter takes this much from everyone, for this long unless its giver says.
pub const EXPOSE_TIMES: f64 = 1.15;
pub const EXPOSE_TICKS: u32 = 360;
/// After a Charge ends, none can begin for this long.
pub const CHARGE_IMMUNE: u32 = 180;
/// A Hasted fighter moves this much faster, for this long.
pub const HASTE_TIMES: f64 = 1.3;
pub const HASTE_TICKS: u32 = 360;
/// A Linked fighter heals this much each second and deals this much; Linked lingers this long once its source stops
/// giving it.
pub const LINKED_HEAL: f64 = 5.0;
pub const LINKED_TIMES: f64 = 1.2;
pub const LINKED_TICKS: u32 = 180;
/// The veil lasts this long; a blow landing within this of its target's back while its striker is Veiled crits.
pub const VEILED_TICKS: u32 = 240;
pub const BACKSTAB: f64 = 60.0 * DEGREES;

/// The statuses, by their number in a fighter's numbers and on the wire.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Status {
    Crit = 0,
    Expose = 1,
    Charge = 2,
    Haste = 3,
    Linked = 4,
    Veiled = 5,
}

/// How many statuses there are.
pub const KINDS: usize = 6;

impl Status {
    pub const ALL: [Status; KINDS] =
        [Status::Crit, Status::Expose, Status::Charge, Status::Haste, Status::Linked, Status::Veiled];

    /// The status a number names (0 to 5), or none.
    #[must_use]
    pub fn from_number(number: u8) -> Option<Status> {
        Self::ALL.get(usize::from(number)).copied()
    }

    /// How long it lasts unless its giver says: a Charge a Minor's (`charge_ticks` by rank).
    #[must_use]
    pub fn ticks(self) -> u32 {
        match self {
            Status::Crit => CRIT_TICKS,
            Status::Expose => EXPOSE_TICKS,
            Status::Charge => charge_ticks(1),
            Status::Haste => HASTE_TICKS,
            Status::Linked => LINKED_TICKS,
            Status::Veiled => VEILED_TICKS,
        }
    }
}

/// A Charge's length on a foe of a rank by its number as the wire carries it (1 Minor to 5 Boss): the higher, the
/// shorter. A player's, and any other, is a Minor's.
#[must_use]
pub fn charge_ticks(rank: u8) -> u32 {
    match rank {
        2 => 90,
        3 => 60,
        4 => 36,
        5 => 24,
        _ => 120,
    }
}

/// One status held: the ticks left, and who gave it (none for the room itself).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Given {
    pub ticks: u32,
    pub from: Option<FighterId>,
}

/// Every status a fighter holds, by number, and the ticks left after a Charge in which no new one can begin.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Statuses {
    pub held: [Given; KINDS],
    pub charge_immune: u32,
}

/// How many numbers the statuses cross as: each one's ticks, the Charge's immunity, then each one's giver (id + 1, 0
/// none).
pub const STATUS_FLOATS: usize = 2 * KINDS + 1;

impl Statuses {
    pub const NONE: Statuses = Statuses { held: [Given { ticks: 0, from: None }; KINDS], charge_immune: 0 };

    /// The ticks a status has left, 0 for none.
    #[must_use]
    pub fn left(&self, status: Status) -> u32 {
        self.held[status as usize].ticks
    }

    #[must_use]
    pub fn has(&self, status: Status) -> bool {
        self.left(status) > 0
    }

    /// Who gave a status it holds.
    #[must_use]
    pub fn giver(&self, status: Status) -> Option<FighterId> {
        self.held[status as usize].from.filter(|_| self.has(status))
    }

    /// A tick on of a fighter in `action`: each runs down, but a Charge waiting out an action it does not cut
    /// (`outlasts_charge`); and a Charge that ends begins its immunity.
    #[must_use]
    pub fn ticked(&self, action: &Action) -> Statuses {
        let mut next = *self;
        next.charge_immune = next.charge_immune.saturating_sub(1);
        for given in &mut next.held {
            given.ticks = given.ticks.saturating_sub(1);
        }
        if outlasts_charge(action) {
            next.held[Status::Charge as usize].ticks = self.left(Status::Charge);
        }
        if self.has(Status::Charge) && !next.has(Status::Charge) {
            next.charge_immune = CHARGE_IMMUNE;
        }
        next
    }

    /// The veil ended by its fighter's own blow or shot: it holds through this tick, so the blow it ends is judged
    /// Veiled, and is gone by the next.
    pub(crate) fn unveil(&mut self) {
        let veil = &mut self.held[Status::Veiled as usize];
        veil.ticks = veil.ticks.min(1);
    }

    #[must_use]
    pub fn to_floats(&self) -> [f64; STATUS_FLOATS] {
        let mut floats = [0.0; STATUS_FLOATS];
        for (at, given) in self.held.iter().enumerate() {
            floats[at] = f64::from(given.ticks);
            floats[KINDS + 1 + at] = given.from.map_or(0.0, |from| f64::from(from) + 1.0);
        }
        floats[KINDS] = f64::from(self.charge_immune);
        floats
    }

    /// The statuses from their numbers; a number that is not a whole count reads as none.
    #[must_use]
    pub fn from_floats(floats: &[f64; STATUS_FLOATS]) -> Statuses {
        let count = |number: f64| {
            if number.is_finite() && number >= 0.0 && number <= f64::from(u32::MAX) { number as u32 } else { 0 }
        };
        let mut statuses = Statuses { charge_immune: count(floats[KINDS]), ..Statuses::NONE };
        for (at, given) in statuses.held.iter_mut().enumerate() {
            *given = Given { ticks: count(floats[at]), from: count(floats[KINDS + 1 + at]).checked_sub(1) };
        }
        statuses
    }
}

/// The fighter given `status` for `ticks` by `from`: refreshed to the longer of what it holds and this, never stacked.
/// A Charge takes only on a fighter neither Charged nor immune to it, and cuts what it was doing, as a stagger of its
/// own cause, unless it is doing what a Charge waits out (`outlasts_charge`). The dead take nothing. None when it does
/// not take.
#[must_use]
pub fn give(fighter: &Fighter, status: Status, ticks: u32, from: Option<FighterId>) -> Option<Fighter> {
    let statuses = &fighter.statuses;
    let charged = statuses.has(Status::Charge) || statuses.charge_immune > 0;
    if fighter.dead() || ticks == 0 || (status == Status::Charge && charged) {
        return None;
    }
    let mut next = *fighter;
    let given = &mut next.statuses.held[status as usize];
    *given = Given { ticks: given.ticks.max(ticks), from };
    if status == Status::Charge {
        held_still(&mut next);
    }
    Some(next)
}

/// Whether a Charge waits out an action rather than cut it: a stagger of another cause, a fall, an overreach or a
/// reload. Cut short, a foe would rise early from the opening it gave and a gun skip its reload; so the Charge runs
/// down only once the action ends, and then holds for its whole time.
#[must_use]
pub fn outlasts_charge(action: &Action) -> bool {
    match action {
        Action::Staggered { cause, .. } => *cause != Cause::Charged,
        Action::Down { .. } | Action::Overreach { .. } | Action::Reload { .. } => true,
        _ => false,
    }
}

/// A Charged fighter can do nothing: unless it is doing what the Charge waits out, it stands staggered by the Charge
/// for as long as the Charge has left.
pub(crate) fn held_still(fighter: &mut Fighter) {
    let left = fighter.statuses.left(Status::Charge);
    if left > 0 && !fighter.dead() && !fighter.staggered() && !outlasts_charge(&fighter.action) {
        fighter.action = Action::Staggered { left, cause: Cause::Charged };
    }
}

/// Whether a blow is a crit: marked one, struck while its striker has Crit, or a swing landing within `BACKSTAB` of its
/// defender's back while its striker is Veiled.
#[must_use]
pub fn crits(blow: &Blow, striker: Option<&Fighter>, defender: &Fighter) -> bool {
    let Some(striker) = striker else { return blow.crit };
    let behind = || {
        let toward = bearing([defender.body.x, defender.body.y], blow.from);
        off(defender.aim, toward) >= core::f64::consts::PI - BACKSTAB
    };
    let backstab = matches!(blow.kind, BlowKind::Swing(_)) && striker.statuses.has(Status::Veiled) && behind();
    blow.crit || striker.statuses.has(Status::Crit) || backstab
}

/// What the statuses multiply a blow's damage by: a crit's, its striker's Linked, its defender's Expose.
#[must_use]
pub fn times(blow: &Blow, striker: Option<&Fighter>, defender: &Fighter) -> f64 {
    let crit = if crits(blow, striker, defender) { CRIT_TIMES } else { 1.0 };
    let linked = if striker.is_some_and(|striker| striker.statuses.has(Status::Linked)) { LINKED_TIMES } else { 1.0 };
    let exposed = if defender.statuses.has(Status::Expose) { EXPOSE_TIMES } else { 1.0 };
    crit * linked * exposed
}

/// The share of its pace a fighter moves at: Hasted, faster.
#[must_use]
pub fn pace(fighter: &Fighter) -> f64 {
    if fighter.statuses.has(Status::Haste) { HASTE_TIMES } else { 1.0 }
}
