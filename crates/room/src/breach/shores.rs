//! The Two Shores, the Drowned Vale's fifth encounter, after the Vault of Glass's Gatekeepers, in the drowned keep's
//! hall. Its Warden stands at the Seam first; when it falls the Lodestone stands on the hall's plinth and the two rifts
//! wake, one to the hall as it was and one to the hall as it is. A rift opens while a living player holds its mooring,
//! and closes once it is left (or a Bulwark stands on it); a body walking into an open rift is carried through, and
//! back out through the shore's own. In each shore its Keeper waits; its fall Rewrites everyone there while they stay.
//! The Seam tolls, unwriting the Rewritten, and the Lattice fuses at it; those left in a shut shore are unwritten. Both
//! Keepers fallen and no one in a shore, the Steward's door opens. At Hard the Lodestone's last bearer through a rift
//! may not carry it through again until another has ([[Breaches]]).

use super::{Breach, SHORES};
use crate::{EventKind, PlayerId, Room};
use ::foes::Rank;
use ::foes::roster::{BULWARK, FLICKER, HUSK, RAVAGER};
use combat::fighter::FighterId;
use combat::sight::apart;

/// How long a mooring is held to open its rift, and left to close it, ticks.
pub const OPENS_TICKS: u64 = 3 * 60;
pub const CLOSES_TICKS: u64 = 2 * 60;
/// How near a mooring a body holds it, and a rift's mouth carries it, metres.
pub const MOORING_REACH_M: f64 = 1.7;
pub const RIFT_REACH_M: f64 = 1.6;
/// How long those left in a closed shore last, how often a Keeper's mark clings again, how often the Seam tolls, and
/// how often a walker and a wave come, ticks.
pub const STRANDED_TICKS: u64 = 8 * 60;
pub const CLINGS_EVERY: u64 = 4 * 60;
pub const TOLL_EVERY: u64 = 30 * 60;
pub const WALK_EVERY: u64 = 7 * 60;
pub const WAVE_EVERY: u64 = 20 * 60;
/// The fusions into the Seam that close the hall: Normal, Hard.
pub const FUSIONS_MOST: (u8, u8) = (4, 3);
/// The rifts' sockets in the hall, and their shores, what was first.
pub const RIFTS: [(&str, &str); 2] = [("rift-was", "mooring-was"), ("rift-is", "mooring-is")];

/// One rift: how long its mooring has been held toward opening, whether it is open, when it was last held, and when it
/// closed with a body still in its shore.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Rift {
    pub held: u64,
    pub open: bool,
    pub last_held: u64,
    pub stranded_from: Option<u64>,
}

/// The Two Shores as they stand.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Shores {
    pub begun: bool,
    pub warden: Option<FighterId>,
    pub rifts: [Rift; 2],
    pub keepers: [Option<FighterId>; 2],
    pub kept: [bool; 2],
    pub fused: u8,
    pub walkers: Vec<FighterId>,
    pub next_toll: u64,
    pub next_walker: u64,
    pub next_wave: u64,
    pub next_cling: u64,
    pub waves: usize,
}

impl Room {
    pub(crate) fn keep_shores(&mut self, breach: &mut Breach) {
        let clock = self.clock;
        let mut fight = std::mem::take(&mut breach.fights.shores);
        if !fight.begun {
            fight.begun = true;
            if let Some((at, _)) = breach.plan.socket("hall", "warden") {
                fight.warden = self.stand_breach_foe(breach, (BULWARK, Rank::Miniboss), at, Some("The Warden"));
                fight.warden.iter().for_each(|id| self.match_company(*id));
            }
            (fight.next_wave, fight.next_walker) = (clock + 2 * 60, u64::MAX);
        }
        let woke = breach.lodestone.lying_at().is_some() || breach.lodestone.bearer().is_some();
        if !woke && fight.warden.is_some_and(|id| !self.standing_foe(id)) {
            self.set_on_plinth(breach, "hall", true);
            (fight.next_toll, fight.next_walker) = (clock + TOLL_EVERY, clock + WALK_EVERY);
            self.tell_all(EventKind::BreachStage, 1.0);
        }
        let plan = breach.plan;
        let shores = plan.shores.get("shores").map(Vec::as_slice).unwrap_or_default();
        if woke {
            for rift in 0..RIFTS.len() {
                self.keep_rift(breach, &mut fight, rift, shores);
            }
            self.keep_seam(breach, &mut fight);
        }
        if clock >= fight.next_wave {
            fight.next_wave = clock + WAVE_EVERY;
            let mouths: Vec<[f64; 3]> = breach.plan.numbered("hall", "mouth").iter().map(|(at, _)| *at).collect();
            let kinds = [(HUSK, Rank::Major), (FLICKER, Rank::Major), (RAVAGER, Rank::Elite), (BULWARK, Rank::Elite)];
            self.breach_wave(breach, "hall", &kinds, &mouths, fight.waves);
            fight.waves += 1;
        }
        let anyone_away = shores.iter().any(|shore| self.someone_in(breach, shore));
        let won = fight.kept == [true, true] && !anyone_away;
        breach.fights.shores = fight;
        if won {
            self.win_encounter(breach, SHORES);
        }
    }

    /// One rift: its mooring held opens it (let go first, its opening falls back) and keeps it open; left, or stood on
    /// by a Bulwark, it closes; open, it
    /// carries bodies through either way; its Keeper stands as its shore is first entered, and Rewrites the shore as it
    /// falls; and those left in its shore once it closes are unwritten.
    fn keep_rift(&mut self, breach: &mut Breach, fight: &mut Shores, rift: usize, shores: &[String]) {
        let clock = self.clock;
        let (rift_socket, mooring_socket) = RIFTS[rift];
        let (Some((mouth, _)), Some((mooring, _)), Some(shore)) =
            (breach.plan.socket("hall", rift_socket), breach.plan.socket("hall", mooring_socket), shores.get(rift))
        else {
            return;
        };
        let held = self.held_by_players(mooring, MOORING_REACH_M) > 0;
        let claimed = self.held_by_bulwark(breach, mooring);
        let state = &mut fight.rifts[rift];
        if held && !claimed {
            state.last_held = clock;
            state.held = (state.held + 1).min(OPENS_TICKS);
        } else if !state.open {
            // Let go before it opens, its opening falls back as fast as it was held.
            state.held = state.held.saturating_sub(1);
        }
        if state.held >= OPENS_TICKS && !state.open {
            state.open = true;
            self.tell_all(EventKind::RiftOpened, rift as f64);
        }
        if state.open && (claimed || clock >= state.last_held + CLOSES_TICKS) {
            (state.open, state.held) = (false, 0);
            self.tell_all(EventKind::RiftClosed, rift as f64);
        }
        let open = state.open;
        if open {
            state.stranded_from = None;
            if let (Some((arrival, _)), Some((back, _))) =
                (breach.plan.socket(shore, "arrival"), breach.plan.socket(shore, "rift"))
            {
                let out =
                    [mouth[0] + (mooring[0] - mouth[0]) * 0.4, mouth[1] + (mooring[1] - mouth[1]) * 0.4, mouth[2]];
                self.carry_through(breach, mouth, arrival, Some(out));
                self.carry_through(breach, back, out, None);
            }
        } else if self.someone_in(breach, shore) {
            let from = *fight.rifts[rift].stranded_from.get_or_insert(clock);
            if clock >= from + STRANDED_TICKS {
                for id in self.in_space(breach, shore) {
                    self.harm_share(id, 4.0, 0);
                }
                self.tell_all(EventKind::Unwritten, 1.0);
            }
        }
        if fight.keepers[rift].is_none()
            && self.someone_in(breach, shore)
            && let Some((at, _)) = breach.plan.socket(shore, "keeper")
        {
            let name = if rift == 0 { "Keeper of What Was" } else { "Keeper of What Is" };
            fight.keepers[rift] = self.stand_breach_foe(breach, (BULWARK, Rank::Miniboss), at, Some(name));
            fight.keepers[rift].iter().for_each(|id| self.match_company(*id));
        }
        let fell = fight.keepers[rift].is_some_and(|id| !self.standing_foe(id));
        if fell && !fight.kept[rift] {
            fight.kept[rift] = true;
            fight.next_cling = clock;
            self.tell_all(EventKind::KeeperFell, rift as f64);
        }
        if fight.kept[rift] && clock >= fight.next_cling {
            for id in self.in_space(breach, shore) {
                self.rewrite(breach, id);
            }
        }
        if rift + 1 == RIFTS.len() && fight.kept.iter().any(|kept| *kept) && clock >= fight.next_cling {
            fight.next_cling = clock + CLINGS_EVERY;
        }
    }

    /// Every living body within reach of a rift's mouth carried through to `to`; going in (`turned_back` the hall's side
    /// of the mouth), the Lodestone's bearer is carried back there instead at Hard when they were its last to cross.
    fn carry_through(&mut self, breach: &mut Breach, from: [f64; 3], to: [f64; 3], turned_back: Option<[f64; 3]>) {
        let near: Vec<PlayerId> = self
            .players
            .iter()
            .filter(|(_, found)| {
                found.living()
                    && apart([found.fighter.body.x, found.fighter.body.y], [from[0], from[1]]) <= RIFT_REACH_M
                    && (found.fighter.body.z - from[2]).abs() < 2.0
            })
            .map(|(id, _)| *id)
            .collect();
        for id in near {
            let bearer = breach.lodestone.bearer() == Some(id);
            if let Some(back) = turned_back.filter(|_| bearer) {
                if breach.tier == gear::breach::Tier::Hard && breach.lodestone.crossed_by == Some(id) {
                    self.carry(id, back);
                    continue;
                }
                breach.lodestone.crossed_by = Some(id);
            }
            self.carry(id, to);
        }
    }

    /// The Seam: walkers come to it and fuse, too many fusions unwrite the company, and on its measure it tolls,
    /// unwriting the Rewritten.
    fn keep_seam(&mut self, breach: &mut Breach, fight: &mut Shores) {
        let clock = self.clock;
        let Some((seam, _)) = breach.plan.socket("hall", "seam") else { return };
        if clock >= fight.next_toll {
            fight.next_toll = clock + TOLL_EVERY;
            self.tell_all(EventKind::Tolled, 0.0);
            self.write(breach, 0);
        }
        if clock >= fight.next_walker {
            fight.next_walker = clock + WALK_EVERY;
            let mouths = breach.plan.numbered("hall", "mouth");
            if let Some((mouth, _)) = mouths.get((clock / WALK_EVERY) as usize % mouths.len().max(1))
                && self.room_for_lesser(breach)
                && let Some(id) = self.stand_breach_foe(breach, (HUSK, Rank::Minor), *mouth, Some("Penitent"))
            {
                self.make_walker(id);
                fight.walkers.push(id);
            }
        }
        for id in std::mem::take(&mut fight.walkers) {
            if !self.standing_foe(id) {
                self.inert.remove(&id);
            } else if self.walk_inert(id, seam, super::mending::WALK_PACE) {
                self.inert.remove(&id);
                self.gone(id);
                fight.fused += 1;
                self.tell_all(EventKind::Fused, f64::from(fight.fused));
            } else {
                fight.walkers.push(id);
            }
        }
        let most = if breach.tier == gear::breach::Tier::Hard { FUSIONS_MOST.1 } else { FUSIONS_MOST.0 };
        if fight.fused >= most {
            fight.next_walker = u64::MAX;
            self.unwrite_all(breach);
        }
    }

    /// The living players standing within `reach` of a point.
    pub(crate) fn held_by_players(&self, at: [f64; 3], reach: f64) -> usize {
        self.players
            .values()
            .filter(|found| {
                found.living()
                    && apart([found.fighter.body.x, found.fighter.body.y], [at[0], at[1]]) <= reach
                    && (found.fighter.body.z - at[2]).abs() < 1.5
            })
            .count()
    }

    /// Whether one of the encounter's Bulwarks stands on a mooring.
    pub(crate) fn held_by_bulwark(&self, breach: &Breach, at: [f64; 3]) -> bool {
        breach.foes.iter().any(|id| {
            self.foes.get(id).is_some_and(|foe| {
                !foe.fighter.dead()
                    && foe.brain.foe_type.number == BULWARK
                    && apart([foe.fighter.body.x, foe.fighter.body.y], [at[0], at[1]]) <= MOORING_REACH_M + 0.5
            })
        })
    }

    /// A player carried to a point, as a rift carries them: standing there, still, told to them.
    pub(crate) fn carry(&mut self, id: PlayerId, at: [f64; 3]) {
        let Some(found) = self.players.get_mut(&id) else { return };
        let body = &mut found.fighter.body;
        (body.x, body.y, body.z, body.vx, body.vy, body.vz) = (at[0], at[1], at[2], 0.0, 0.0, 0.0);
        (body.mode, body.over) = (movement::Mode::Ground, None);
        found.stood = at[2];
        self.tell(EventKind::Carried, None, id, id, 0.0);
    }
}
