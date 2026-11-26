//! A hold of E at one of a zone's pieces: a Kindle's dead lamp (3 s), a reliquary (5 s, its keepers called as it is
//! first begun) and the zone's lamp (2 s, once its guard is down, each player for themselves). A hold under way ends
//! as its body stirs, is hurt or falls; a dead lamp kindles and a reliquary opens only while no foe stands within
//! CONTEST_M of it. The lamp is lit for a player while their dive in the zone has lit it, kept with the dive.

use super::{Held, Hold};
use crate::asks::answer_code;
use crate::{PlayerId, Room};
use combat::sight::apart;
use gear::Refusal;
use passage::{Deal, Mission, PieceKind};

/// How near a dead lamp's, a reliquary's or the lamp's middle a player stands to hold E at it (m).
pub const HOLD_REACH_M: f64 = 3.0;
/// How long E is held at a dead lamp, at a reliquary and at the lamp, ticks (3 s, 5 s and 2 s), and how far the body
/// may stir meanwhile.
pub const KINDLE_TICKS: u64 = 180;
pub const OPEN_TICKS: u64 = 300;
pub const LAMP_TICKS: u64 = 120;
const HOLD_STIR_M: f64 = 0.3;
/// No dead lamp kindles, reliquary opens, or ring is held while a foe stands this near it (m).
pub const CONTEST_M: f64 = 8.0;

fn refused(refusal: Refusal) -> u8 {
    answer_code(Err(refusal))
}

impl Room {
    /// Begins a hold of E at a dead lamp, the reliquary or the lamp, within reach of it and with no foe near; the
    /// first begun at a reliquary calls its keepers, a wave.
    pub(crate) fn begin_hold(&mut self, player: PlayerId, body: [f64; 2], target: Held) -> u8 {
        let Some(zone) = self.zone() else { return refused(Refusal::NotInPassage) };
        let Some(at) = self.held_at(target) else { return refused(Refusal::NoLamp) };
        if apart(body, at) > HOLD_REACH_M {
            return refused(Refusal::NotAtMouth);
        }
        if !self.may_hold(player, target) {
            return refused(Refusal::AlreadyLit);
        }
        let first_wave = target == Held::Reliquary && zone.round.waves == 0;
        if self.contested(at) {
            return refused(Refusal::FoesNear);
        }
        if first_wave {
            self.call_wave(None);
        }
        let (clock, health) = (self.clock, self.fighter(player).map_or(0.0, |fighter| fighter.health));
        if let Some(zone) = self.zone_mut() {
            zone.holds.insert(player, Hold { target, since: clock, at: body, health });
        }
        0
    }

    /// Where a hold's piece stands: the dead lamp of its number, the reliquary or the lamp.
    pub(crate) fn held_at(&self, target: Held) -> Option<[f64; 2]> {
        let piece = self.zone()?.pieces.iter().find(|piece| match (piece.kind, target) {
            (PieceKind::Kindle(nth), Held::Kindle(wanted)) => nth == wanted,
            (PieceKind::Reliquary, Held::Reliquary) | (PieceKind::Lamp, Held::Lamp) => true,
            _ => false,
        })?;
        Some([piece.at[0], piece.at[1]])
    }

    /// Whether a living foe stands within CONTEST_M of a point.
    pub(crate) fn contested(&self, at: [f64; 2]) -> bool {
        let near = |foe: &crate::foes::Foe| apart([foe.fighter.body.x, foe.fighter.body.y], at) <= CONTEST_M;
        self.foes.iter().any(|(id, foe)| !foe.fighter.dead() && !self.is_companion(*id) && near(foe))
    }

    /// E let go of: the player's hold ends unfinished.
    pub(crate) fn let_go_hold(&mut self, player: PlayerId) {
        if let Some(zone) = self.zone_mut() {
            zone.holds.remove(&player);
        }
    }

    /// Keeps each hold under way: one stirred, hurt, fallen, contested or no longer allowed ends; one held its time
    /// lights its dead lamp, opens its reliquary, or lights the lamp for its player, keeping their haul.
    pub(crate) fn keep_holds(&mut self) {
        let Some(zone) = self.zone() else { return };
        let holds: Vec<(PlayerId, Hold)> = zone.holds.iter().map(|(id, hold)| (*id, *hold)).collect();
        let (island, week, number, depth, level) =
            (zone.island, zone.week, zone.zone.number, zone.zone.depth, zone.levels.1);
        for (player, hold) in holds {
            let fighter = self.fighter(player).copied();
            let contested = hold.target != Held::Lamp && self.held_at(hold.target).is_some_and(|at| self.contested(at));
            let broken = fighter.is_none_or(|fighter| {
                fighter.dead()
                    || fighter.health < hold.health
                    || apart([fighter.body.x, fighter.body.y], hold.at) > HOLD_STIR_M
            }) || contested
                || !self.may_hold(player, hold.target);
            let done = self.clock >= hold.since + self.hold_ticks(player, hold.target);
            if !(broken || done) {
                continue;
            }
            self.let_go_hold(player);
            if broken {
                continue;
            }
            match hold.target {
                Held::Kindle(nth) => {
                    if let Some(zone) = self.zone_mut() {
                        if let Some(lit) = zone.round.lit.get_mut(usize::from(nth)) {
                            *lit = true;
                        }
                        zone.round.took_part.insert(player);
                    }
                }
                Held::Reliquary => {
                    if let Some(zone) = self.zone_mut() {
                        zone.round.opened = true;
                        zone.round.took_part.insert(player);
                    }
                }
                Held::Lamp => {
                    let (Some(lamp), dice, when) = (
                        passage::lamp_number(depth),
                        self.dice(player),
                        (self.day(), gear::clock::week_of(self.minute)),
                    ) else {
                        continue;
                    };
                    let at = gear::lamps::Zone { island, week, zone: number, depth, level };
                    let Some(found) = self.players.get_mut(&player) else { continue };
                    if found.character.light_lamp(at, lamp, when, &dice).is_ok() {
                        found.gear_changed = true;
                    }
                }
            }
        }
    }

    /// Whether a hold's target may be held now: a dead lamp not yet lit or the reliquary not yet opened while the deal
    /// runs, or the lamp once its guard is down and not yet lit for the player; none once the zone's web has turned.
    pub(crate) fn may_hold(&self, player: PlayerId, target: Held) -> bool {
        let Some(zone) = self.zone() else { return false };
        if self.shifted() {
            return false;
        }
        let running = zone.round.done_at.is_none();
        match target {
            Held::Kindle(nth) => {
                zone.zone.deal == Deal::Mission(Mission::Kindle)
                    && running
                    && zone.round.lit.get(usize::from(nth)) == Some(&false)
            }
            Held::Reliquary => zone.zone.deal == Deal::Reliquary && running && !zone.round.opened,
            Held::Lamp => zone.zone.deal == Deal::Lamp && !running && !self.lamp_lit_for(player),
        }
    }

    /// Whether the zone's lamp is lit for a player: their dive is in this zone and has lit its lamp, kept with the
    /// dive so a round begun again, a reconnect or a dive begun at the lamp all find it lit.
    pub(crate) fn lamp_lit_for(&self, player: PlayerId) -> bool {
        let Some(zone) = self.zone() else { return false };
        let Some(lamp) = passage::lamp_number(zone.zone.depth) else { return false };
        let dive = self.players.get(&player).and_then(|found| found.character.passage.as_ref());
        dive.is_some_and(|dive| {
            dive.island == zone.island && dive.week == zone.week && dive.zone == zone.zone.number && dive.lamp >= lamp
        })
    }

    /// How long E is held at a target for a player: at a lamp standing cold for them (`gear::Character::lamp_cold`),
    /// as long as at a dead lamp.
    pub(crate) fn hold_ticks(&self, player: PlayerId, target: Held) -> u64 {
        match target {
            Held::Lamp if !self.lamp_cold_for(player) => LAMP_TICKS,
            Held::Lamp | Held::Kindle(_) => KINDLE_TICKS,
            Held::Reliquary => OPEN_TICKS,
        }
    }

    /// Whether the zone's lamp stands cold for a player: the lamp a bounty they hold lights last.
    pub(crate) fn lamp_cold_for(&self, player: PlayerId) -> bool {
        let Some(zone) = self.zone().filter(|zone| zone.zone.deal == Deal::Lamp) else { return false };
        let Some(lamp) = passage::lamp_number(zone.zone.depth) else { return false };
        self.players.get(&player).is_some_and(|found| found.character.lamp_cold(zone.island, lamp))
    }
}
