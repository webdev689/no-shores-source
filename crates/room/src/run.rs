//! A dungeon's run: what its first clear pays in its period, the modifiers it carries, the revives its company shares
//! at Abyss and, in the week's two, the level every foe stands at. Each modifier is one hook in the rules, read here:
//! a blow's weight (`modded_blow`, in `empower_as`), a spell's (`spell_times`), a recharge (`recharge_times`, in
//! `step_arts`), a heal (`heal_times`), the share of foes shielded (`shield_chance`, as the garrison girds) and the
//! drops (`modded`, in `drop_spoils`). A room with no run weighs everything as it always has.

use crate::Room;
use combat::fighter::FighterId;
use combat::judge::{Blow, BlowKind};
use gear::activities::{
    BRAWLER_TIMES, BURN_TIMES, EXPOSURE_TIMES, IRONCLAD_SHIELDS, LIGHTSWITCH_TIMES, MARKSMAN_TIMES, Modifier,
    TRICKLE_TIMES, Weekly,
};

/// The revives an Abyss run's company shares.
pub const REVIVES: u8 = 5;

/// What a run's first clear in its period pays beside its kills and its cache.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Pays {
    Nothing,
    /// The shared patrol room's: the dungeon of the day's at Normal alone, while this patrol's dungeon is its island's
    /// as the cache opens. It carries no day's modifier, so it pays no harder tier.
    Today {
        patrol: String,
        number: usize,
    },
    /// A run's opened as its island's dungeon of the day, with that day's modifier: the day's, in that day alone.
    Day {
        day: u64,
    },
    /// The week's Elite or Abyss Dungeon's, in the week the run was opened for.
    Week {
        weekly: Weekly,
        week: u64,
    },
}

/// A dungeon's run: what it pays, its modifiers, the revives left at Abyss, and the level every foe stands at in the
/// week's two.
#[derive(Clone, Debug, PartialEq)]
pub struct Run {
    pub pays: Pays,
    pub modifiers: Vec<Modifier>,
    pub revives: Option<u8>,
    pub foes_at: Option<u8>,
}

impl Run {
    /// A patrol's shared dungeon's: the day's clear at Normal while it is its island's dungeon of the day, and nothing
    /// more.
    #[must_use]
    pub fn today(patrol: &str, number: usize) -> Self {
        Run {
            pays: Pays::Today { patrol: patrol.to_owned(), number },
            modifiers: Vec::new(),
            revives: None,
            foes_at: None,
        }
    }
}

impl Room {
    /// Whether the room's run carries a modifier; never for a room with no run.
    pub(crate) fn modded(&self, modifier: Modifier) -> bool {
        self.run.as_ref().is_some_and(|run| run.modifiers.contains(&modifier))
    }

    /// The Art a Burn the run carries names.
    pub(crate) fn burning(&self) -> Option<u8> {
        let modifiers = self.run.as_ref().map(|run| run.modifiers.as_slice()).unwrap_or_default();
        modifiers.iter().find_map(|modifier| match modifier {
            Modifier::Burn(art) => Some(*art),
            _ => None,
        })
    }

    /// What the run's modifiers weigh a blow by: Brawler a player's swing, Marksman a player's shot, Lightswitch a
    /// foe's swing or telegraphed blow on a player, and Burn a foe's blow on a player wearing its Art; their product,
    /// 1 for none.
    pub(crate) fn modded_blow(&self, blow: &Blow, defender: FighterId) -> f64 {
        let by_player = self.players.contains_key(&blow.striker);
        let on_player = self.players.get(&defender).filter(|_| self.foes.contains_key(&blow.striker));
        let melee = matches!(blow.kind, BlowKind::Swing(_));
        let mut times = 1.0;
        if by_player && melee && self.modded(Modifier::Brawler) {
            times *= BRAWLER_TIMES;
        }
        if by_player && matches!(blow.kind, BlowKind::Shot(_)) && self.modded(Modifier::Marksman) {
            times *= MARKSMAN_TIMES;
        }
        if let Some(player) = on_player {
            if (melee || matches!(blow.kind, BlowKind::Telegraph(_))) && self.modded(Modifier::Lightswitch) {
                times *= LIGHTSWITCH_TIMES;
            }
            if self.burning() == Some(player.character.arts.worn) {
                times *= BURN_TIMES;
            }
        }
        times
    }

    /// What a spell of an Art deals, times: twice for the Art a Burn names.
    pub(crate) fn spell_times(&self, art: u8) -> f64 {
        if self.burning() == Some(art) { BURN_TIMES } else { 1.0 }
    }

    /// How much longer an Art's recharge takes: half again under Trickle.
    pub(crate) fn recharge_times(&self) -> f64 {
        if self.modded(Modifier::Trickle) { TRICKLE_TIMES } else { 1.0 }
    }

    /// What a heal on a player gives, times: half under Exposure.
    pub(crate) fn heal_times(&self) -> f64 {
        if self.modded(Modifier::Exposure) { EXPOSURE_TIMES } else { 1.0 }
    }

    /// The share of the garrison's foes that stand with a shield: half under Ironclad, else any foe's.
    pub(crate) fn shield_chance(&self) -> f64 {
        if self.modded(Modifier::Ironclad) { IRONCLAD_SHIELDS } else { gear::element::SHIELD_CHANCE }
    }
}

#[cfg(test)]
#[path = "run_tests.rs"]
mod run_tests;

#[path = "run_room.rs"]
mod run_room;
pub use run_room::{RunOf, elite_laid};

#[path = "abyss.rs"]
mod abyss;
