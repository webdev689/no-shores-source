//! What the foes of a room share: for each target, who holds the turns to fight it hand to hand and to shoot at it,
//! and since when each of the rest has waited. The longest waiter goes in next; past its patience, a foe goes in
//! whatever the count.

use combat::FighterId;
use std::collections::BTreeMap;

/// One target's fight: the holders of its melee and ranged tokens (since when), and the waiting (since when, and
/// whether for a ranged token).
#[derive(Clone, Debug, Default, PartialEq)]
struct Fight {
    melee: BTreeMap<FighterId, u64>,
    ranged: BTreeMap<FighterId, u64>,
    waiting: BTreeMap<FighterId, (u64, bool)>,
}

impl Fight {
    fn empty(&self) -> bool {
        self.melee.is_empty() && self.ranged.is_empty() && self.waiting.is_empty()
    }

    fn tokens(&mut self, ranged: bool) -> &mut BTreeMap<FighterId, u64> {
        if ranged { &mut self.ranged } else { &mut self.melee }
    }
}

/// What the foes of a room share: who holds the turns to fight each target, and since when each waits.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Board {
    fights: BTreeMap<FighterId, Fight>,
}

impl Board {
    /// A foe that died or left gives up any turn it held and stops waiting.
    pub fn forget(&mut self, foe: FighterId) {
        for fight in self.fights.values_mut() {
            fight.melee.remove(&foe);
            fight.ranged.remove(&foe);
            fight.waiting.remove(&foe);
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

    /// Takes a token of its kind for a waiting foe if one is free and nobody of its kind has waited longer, or, past
    /// `patience` ticks of waiting, whatever the count. Answers whether it holds one.
    pub fn take(&mut self, target: FighterId, foe: FighterId, ranged: bool, tick: u64, patience: u64) -> bool {
        let cap = if ranged { crate::tuning::RANGED_TOKENS } else { crate::tuning::MELEE_TOKENS };
        let fight = self.fights.entry(target).or_default();
        if fight.tokens(ranged).contains_key(&foe) {
            return true;
        }
        let since = fight.waiting.get(&foe).map_or(tick, |&(since, _)| since);
        let free = fight.tokens(ranged).len() < cap;
        let first = !fight.waiting.iter().any(|(other, &(other_since, other_ranged))| {
            *other != foe && other_ranged == ranged && other_since < since
        });
        if !((free && first) || tick.saturating_sub(since) >= patience) {
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

    /// How many melee and ranged tokens `target` has out.
    #[must_use]
    pub fn tokens_out(&self, target: FighterId) -> (usize, usize) {
        self.fights.get(&target).map_or((0, 0), |fight| (fight.melee.len(), fight.ranged.len()))
    }
}
