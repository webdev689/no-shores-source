//! A dungeon's run and the modifiers it carries. Each modifier is one hook in the rules, read here: a blow's weight (`modded_blow`, in
//! `empower_as`), a spell's (`spell_times`), a recharge (`recharge_times`, in `step_arts`), a heal (`heal_times`), the
//! share of foes shielded (`shield_chance`, as the garrison girds) and the drops (`modded`, in `drop_spoils`). A room
//! with no run weighs everything as it always has.

use crate::Room;
use combat::fighter::FighterId;
use combat::judge::{Blow, BlowKind};
use gear::activities::{
    BRAWLER_TIMES, BURN_TIMES, EXPOSURE_TIMES, IRONCLAD_SHIELDS, LIGHTSWITCH_TIMES, MARKSMAN_TIMES, Modifier,
    TRICKLE_TIMES,
};

/// A dungeon's run: the modifiers it carries.
#[derive(Clone, Debug, PartialEq)]
pub struct Run {
    pub modifiers: Vec<Modifier>,
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
