//! What the foes of a room share: for each target, who holds the turns to fight it hand to hand and to shoot at it,
//! and since when each of the rest has waited. The longest waiter goes in next; past its patience, a foe goes in one
//! over the count, never more, so a crowd's patience cannot pile it onto its target. And the posts shooters hold, so no
//! two take one place, and the tick one last picked a post, so only one picks a tick.

use crate::director::Caps;
use combat::FighterId;
use std::collections::BTreeMap;

/// One target's fight: the holders of its melee and ranged tokens (since when), and the waiting (since when, and
/// whether for a ranged token).
#[derive(Clone, Debug, Default, PartialEq)]
struct Fight {
    melee: BTreeMap<FighterId, u64>,
    ranged: BTreeMap<FighterId, u64>,
    waiting: BTreeMap<FighterId, (u64, bool)>,
    /// The one foe striking it on an opening, without a turn: a back turned to it, or a walk in on it.
    opportunist: Option<FighterId>,
}

impl Fight {
    fn empty(&self) -> bool {
        self.melee.is_empty() && self.ranged.is_empty() && self.waiting.is_empty() && self.opportunist.is_none()
    }

    fn tokens(&mut self, ranged: bool) -> &mut BTreeMap<FighterId, u64> {
        if ranged { &mut self.ranged } else { &mut self.melee }
    }
}

/// What the foes of a room share: who holds the turns to fight each target, and since when each waits; and the spot
/// each shooter holds as its post.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Board {
    fights: BTreeMap<FighterId, Fight>,
    posts: BTreeMap<FighterId, [f64; 3]>,
    picked: Option<u64>,
}

impl Board {
    /// A foe that died or left gives up any turn it held and stops waiting.
    pub fn forget(&mut self, foe: FighterId) {
        self.posts.remove(&foe);
        for fight in self.fights.values_mut() {
            fight.melee.remove(&foe);
            fight.ranged.remove(&foe);
            fight.waiting.remove(&foe);
            if fight.opportunist == Some(foe) {
                fight.opportunist = None;
            }
        }
        self.fights.retain(|_, fight| !fight.empty());
    }

    /// A foe fighting `target`, hand to hand or by shooting, joins its waiting unless it holds a token of that kind; a
    /// token of the other kind it gives back.
    pub fn join(&mut self, target: FighterId, foe: FighterId, ranged: bool, tick: u64) {
        let fight = self.fights.entry(target).or_default();
        if fight.tokens(!ranged).remove(&foe).is_some() {
            fight.waiting.insert(foe, (tick, ranged));
        }
        if fight.tokens(ranged).contains_key(&foe) {
            return;
        }
        let since = fight.waiting.get(&foe).map_or(tick, |&(since, _)| since);
        fight.waiting.insert(foe, (since, ranged));
    }

    /// Takes a token of its kind for a waiting foe if one is free under `caps` and nobody of its kind has waited
    /// longer, or, past `patience` ticks of waiting, one over the cap at most. Answers whether it holds one. A holder
    /// keeps its token when the caps drop, until it hands it on.
    pub fn take(
        &mut self,
        target: FighterId,
        foe: FighterId,
        ranged: bool,
        tick: u64,
        patience: u64,
        caps: Caps,
    ) -> bool {
        let cap = if ranged { caps.ranged } else { caps.melee };
        let fight = self.fights.entry(target).or_default();
        if fight.tokens(ranged).contains_key(&foe) {
            return true;
        }
        let since = fight.waiting.get(&foe).map_or(tick, |&(since, _)| since);
        let out = fight.tokens(ranged).len();
        let free = out < cap;
        let first = !fight.waiting.iter().any(|(other, &(other_since, other_ranged))| {
            *other != foe && other_ranged == ranged && other_since < since
        });
        if !((free && first) || (tick.saturating_sub(since) >= patience && out <= cap)) {
            return false;
        }
        fight.tokens(ranged).insert(foe, tick);
        fight.waiting.remove(&foe);
        true
    }

    /// A holder hands its token on: it waits again, from now, behind everyone who waited longer.
    pub fn hand_on(&mut self, target: FighterId, foe: FighterId, tick: u64) {
        let Some(fight) = self.fights.get_mut(&target) else { return };
        let melee = fight.melee.remove(&foe).is_some();
        let ranged = fight.ranged.remove(&foe).is_some();
        let kind = fight.waiting.get(&foe).map_or(ranged && !melee, |&(_, kind)| kind);
        fight.waiting.insert(foe, (tick, kind));
    }

    /// Whether a foe holds a token on `target`, hand to hand or ranged.
    #[must_use]
    pub fn holds(&self, target: FighterId, foe: FighterId, ranged: bool) -> bool {
        self.fights
            .get(&target)
            .is_some_and(|fight| if ranged { fight.ranged.contains_key(&foe) } else { fight.melee.contains_key(&foe) })
    }

    /// Since when a ranged holder has held its token, for its lease.
    #[must_use]
    pub fn held_since(&self, target: FighterId, foe: FighterId) -> Option<u64> {
        self.fights.get(&target).and_then(|fight| fight.ranged.get(&foe).copied())
    }

    /// An opening on `target` that a foe without a turn would strike: only one foe at a time may, so a crowd cannot
    /// pile in past its turns on a back turned. Answers whether this foe has it; letting it go (`wants` false) frees it.
    pub fn opening(&mut self, target: FighterId, foe: FighterId, wants: bool) -> bool {
        let fight = self.fights.entry(target).or_default();
        if !wants {
            if fight.opportunist == Some(foe) {
                fight.opportunist = None;
            }
            return false;
        }
        if fight.opportunist.is_none_or(|holder| holder == foe) {
            fight.opportunist = Some(foe);
            return true;
        }
        false
    }

    /// How many of the foes waiting for a melee turn at `target` have waited longer than this one (the lower number
    /// first on a tie): its place in the line, 0 for the next to go in.
    #[must_use]
    pub fn in_line(&self, target: FighterId, foe: FighterId) -> usize {
        let Some(fight) = self.fights.get(&target) else { return 0 };
        let Some(&(since, _)) = fight.waiting.get(&foe) else { return 0 };
        let before = |(other, &(other_since, ranged)): (&FighterId, &(u64, bool))| {
            !ranged && (other_since, *other) < (since, foe)
        };
        fight.waiting.iter().filter(|&entry| before(entry)).count()
    }

    /// How many melee and ranged tokens `target` has out.
    #[must_use]
    pub fn tokens_out(&self, target: FighterId) -> (usize, usize) {
        self.fights.get(&target).map_or((0, 0), |fight| (fight.melee.len(), fight.ranged.len()))
    }

    /// A shooter holds the spot at `point` as its post.
    pub fn claim(&mut self, foe: FighterId, point: [f64; 3]) {
        self.posts.insert(foe, point);
    }

    /// Whether a shooter may pick a post this tick: one a tick in a room, so the work of picking spreads over ticks.
    pub fn may_pick(&mut self, tick: u64) -> bool {
        let may = self.picked != Some(tick);
        self.picked = Some(tick);
        may
    }

    /// A shooter gives its post up.
    pub fn release(&mut self, foe: FighterId) {
        self.posts.remove(&foe);
    }

    /// The posts every other shooter holds, in the order of their numbers.
    pub fn posts_but(&self, foe: FighterId) -> impl Iterator<Item = [f64; 3]> + '_ {
        self.posts.iter().filter(move |(other, _)| **other != foe).map(|(_, point)| *point)
    }
}
