//! What a Breach keeps past its room's life, for its host to hold in its Durable Object's storage (`server/breach.ts`):
//! in a run, its checkpoint, the furthest stage its company reached (the start of an encounter, or of a traversal) and
//! the hidden chests its attempt earned; at a gate, the runs it opened and those it shut again, each by the world's
//! minute it opened. A room evicted, restarted or deployed afresh is given it back as it opens, so a company launched
//! again comes back through its gate, still open to it, to its last checkpoint.

use super::{Breach, Phase, STAGES};
use crate::Room;
use gear::breach::DROWNED_VALE;
use std::collections::{BTreeMap, BTreeSet};

/// What a Breach keeps.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Kept {
    /// A run's checkpoint: the furthest stage reached, and the hidden chests this attempt earned.
    Run { stage: usize, chests: BTreeSet<usize> },
    /// A gate's runs opened and shut again, each by the minute it opened.
    Gate { opened: BTreeMap<String, u64>, spent: BTreeMap<String, u64> },
}

impl Room {
    /// What this room's Breach keeps: its run's checkpoint, or its gate's runs; none in a room with neither.
    #[must_use]
    pub fn breach_kept(&self) -> Option<Kept> {
        if let Some(breach) = &self.breach {
            return Some(Kept::Run { stage: breach.reached, chests: breach.chests.clone() });
        }
        let gate = self.breach_gate.as_ref()?;
        Some(Kept::Gate { opened: gate.opened.clone(), spent: gate.spent.clone() })
    }

    /// Takes back what this room's Breach kept: a run stood at its checkpoint, each encounter won before it won again
    /// and its seal open, whoever joins standing there; a gate's runs as they were. Whether it is this room's kind.
    pub fn restore_breach(&mut self, kept: Kept) -> bool {
        match kept {
            Kept::Run { stage, chests } => {
                let Some(mut breach) = self.breach.take() else { return false };
                let stage = stage.min(STAGES.len() - 1);
                for (space, _, won_by) in &STAGES[..=stage] {
                    if let Some(encounter) = won_by {
                        breach.won(*encounter);
                    }
                    self.bake_space(&mut breach, space);
                }
                (breach.reached, breach.chests) = (stage, chests);
                let (at, _) = self.stage_at(&breach);
                self.spawn_points = vec![(at[0], at[1])];
                self.breach = Some(breach);
                self.breach_blocks();
                true
            }
            Kept::Gate { opened, spent } => {
                let Some(gate) = self.breach_gate.as_mut() else { return false };
                (gate.opened, gate.spent) = (opened, spent);
                true
            }
        }
    }
}

impl Breach {
    /// An encounter won: its phase, and the seals its win opens.
    pub(crate) fn won(&mut self, encounter: usize) {
        self.phases[encounter] = Phase::Won;
        let key = DROWNED_VALE.encounters[encounter].key;
        for (number, seal) in self.plan.seals.iter().enumerate() {
            if seal.opens == key {
                self.open_seals.insert(number);
            }
        }
    }
}

#[cfg(test)]
#[path = "kept_tests.rs"]
mod tests;
