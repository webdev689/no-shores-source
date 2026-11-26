//! The Waking: a Breach's opening, fought at its gate in the patrol zone, in view of everyone there.
//! The host tells the room which players
//! came launched for which run, at which tier: their company. One company at a time holds the gate: the first whose
//! living player steps onto a mooring stone while it is free. Its moorings held at once fill the Spire; fewer let it
//! ebb; a Bulwark claims one left empty. Woken, the gate opens to that company alone; anyone else in the zone may fight
//! beside them, and the foes drop nothing. The gate shows the zone the companies inside the run.

use super::plan::turned;
use crate::players::Player;
use crate::{EventKind, PlayerId, Room};
use ::foes::Rank;
use ::foes::roster::{BULWARK, FLICKER, HUSK, RAVAGER};
use combat::fighter::FighterId;
use combat::sight::apart;
use gear::breach::Tier;
use std::collections::{BTreeMap, BTreeSet};

/// The Spire's fill, ticks of all three moorings held: two and a half minutes.
pub const SPIRE_TICKS: u64 = 150 * 60;
/// How fast it ebbs while fewer are held: one tick of fill lost every this many ticks, Normal, Hard.
pub const EBB_EVERY: (u64, u64) = (4, 2);
/// How near a mooring a body holds it, metres.
pub const MOORING_REACH_M: f64 = 1.7;
/// How often a wave comes, ticks; how long the company that woke the gate holds it before the next may take it, ticks;
/// how long the gate stays open to that company unless it clears the Breach first, minutes of the world's clock: a
/// day, so its company can always come back in, counted while the zone stands empty too; how long a word from a
/// company inside lasts, ticks: a minute, as its host tells the gate every ten seconds and forgets a run silent for a
/// minute.
pub const WAVE_EVERY: u64 = 14 * 60;
pub const OPEN_TICKS: u64 = 3 * 60 * 60;
pub const OPENED_MINUTES: u64 = 24 * 60;
pub const INSIDE_LASTS: u64 = 60 * 60;
/// The moorings by their sockets.
pub const MOORINGS: [&str; 3] = ["mooring-west", "mooring-south", "mooring-east"];
/// The gate's answer to a player at it whose company has not opened it.
pub const GATE_SHUT: u8 = 112;
/// Why the gate's company shuts a player out, as it tells them: full, under the tier's level, or Hard before Normal.
pub const SHUT_FULL: f64 = 1.0;
pub const SHUT_LEVEL: f64 = 2.0;
pub const SHUT_HARD: f64 = 3.0;
/// How far the gate's hollow reaches from its middle, metres, and how long the holding company may leave it empty of
/// its living players before the gate is let go, ticks.
pub const HOLLOW_M: f64 = 45.0;
pub const LEFT_TICKS: u64 = 30 * 60;
/// How long the Spire may stand empty before the Waking is lost, ticks: a minute, so one who cannot fill it never holds
/// the gate from the rest.
pub const EMPTY_TICKS: u64 = 60 * 60;

/// A company launched for a run: its tier and its players in this room.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Company {
    pub tier: Option<Tier>,
    pub players: Vec<PlayerId>,
}

/// A company inside a run, as its run's host tells the gate: the name of its first player in, its tier, the encounter
/// it is on, and when the gate last heard.
#[derive(Clone, Debug, PartialEq)]
pub struct Inside {
    pub name: String,
    pub tier: Tier,
    pub encounter: u8,
    pub heard: u64,
}

/// A Breach's gate in its patrol zone, and its Waking.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Gate {
    /// Where the gate's module stands and its quarter turns.
    pub at: [f64; 3],
    pub quarters: u8,
    /// The companies launched, by run.
    pub companies: BTreeMap<String, Company>,
    /// The run whose company holds the gate, and since when; the Spire's fill; whether woken.
    pub held_by: Option<String>,
    pub since: u64,
    pub fill: u64,
    pub woken: Option<u64>,
    pub claims: [Option<FighterId>; 3],
    pub claimers: Vec<(FighterId, usize)>,
    pub foes: Vec<FighterId>,
    pub next_wave: u64,
    pub waves: usize,
    pub bulwarks: u8,
    pub revives: Option<u8>,
    pub down_since: Option<u64>,
    /// The accounts of the holding company's fallen who left down, to come back down.
    pub left_down: BTreeSet<String>,
    /// The last tick a living player of the holding company stood in the hollow, and since when the Spire is empty.
    pub last_near: u64,
    pub empty_since: Option<u64>,
    /// The runs whose gate has opened, by the world's minute it opened; and the companies inside runs, by run.
    pub opened: BTreeMap<String, u64>,
    pub inside: BTreeMap<String, Inside>,
    /// The runs whose gate opened and has shut again, cleared or its day past: none of them takes the gate again.
    pub spent: BTreeSet<String>,
}

impl Gate {
    /// A socket of the gate's module in the room's frame.
    #[must_use]
    pub fn socket(&self, name: &str) -> Option<[f64; 3]> {
        let found = super::plan::module("breach-gate")?.sockets.iter().find(|socket| socket.name == name)?;
        let at = turned(found.at, self.quarters);
        Some([self.at[0] + at[0], self.at[1] + at[1], self.at[2] + at[2]])
    }

    /// The run a player came launched for, if any.
    #[must_use]
    pub fn run_of(&self, player: PlayerId) -> Option<&str> {
        self.companies.iter().find(|(_, company)| company.players.contains(&player)).map(|(run, _)| run.as_str())
    }

    /// Whether the gate's Waking runs for this player's company.
    #[must_use]
    pub fn fighting(&self, player: PlayerId) -> bool {
        self.woken.is_none() && self.holds(player)
    }

    /// Whether this player's company holds the gate, its Waking under way or woken.
    #[must_use]
    pub fn holds(&self, player: PlayerId) -> bool {
        self.held_by.as_deref().is_some_and(|run| self.run_of(player) == Some(run))
    }

    /// Whether a point lies in the gate's hollow.
    #[must_use]
    pub fn in_hollow(&self, [x, y]: [f64; 2]) -> bool {
        apart([x, y], [self.at[0], self.at[1]]) <= HOLLOW_M
    }
}

impl Room {
    /// The patrol room stands a Breach's gate: its module where the layout stood it.
    pub fn open_breach_gate(&mut self, at: [f64; 3], quarters: u8) {
        self.breach_gate = Some(Box::new(Gate { at, quarters, ..Gate::default() }));
    }

    /// The host's word: a player came launched for a run at a tier, and stands at the gate's arrival. Answers whether
    /// the gate holds them: not in a room with no gate, nor as a ninth of a company, nor a kept character the Breach
    /// shuts out at that tier (one no one keeps, a test's, is held); one shut out is told why.
    pub fn breach_company(&mut self, player: PlayerId, run: &str, tier: Tier) -> bool {
        let Some(gate) = self.breach_gate.as_ref() else { return false };
        let full = gate.companies.get(run).is_some_and(|company| {
            company.players.len() >= gear::breach::COMPANY_MOST && !company.players.contains(&player)
        });
        let shut = self.players.get(&player).filter(|found| found.owner.is_some()).and_then(|found| {
            gear::gate::shut(&found.character, gear::gate::Place::Breach(tier), gear::world::Difficulty::Normal)
        });
        let why = match (full, shut) {
            (true, _) => Some(SHUT_FULL),
            (false, Some(gear::gate::Shut::BreachHard)) => Some(SHUT_HARD),
            (false, Some(_)) => Some(SHUT_LEVEL),
            (false, None) => None,
        };
        if let Some(why) = why {
            self.tell(EventKind::ShutOut, None, 0, player, why);
            return false;
        }
        let owner = self.players.get(&player).and_then(|found| found.owner.clone());
        let Some(gate) = self.breach_gate.as_mut() else { return false };
        for company in gate.companies.values_mut() {
            company.players.retain(|each| *each != player);
        }
        let company = gate.companies.entry(run.to_owned()).or_default();
        company.tier = Some(tier);
        company.players.push(player);
        // One who left their company's Waking down comes back down, to be raised for a revive or lie.
        let down = gate.fighting(player) && owner.is_some_and(|owner| gate.left_down.remove(&owner));
        let at = gate.socket("arrival").unwrap_or(gate.at);
        let body = self.stand((at[0], at[1]));
        if let Some(found) = self.players.get_mut(&player) {
            let body = movement::Body { z: at[2].max(body.z), facing: found.fighter.body.facing, ..body };
            (found.fighter.body, found.stood) = (body, body.z);
            if down {
                (found.fighter.health, found.fighter.action) = (0.0, combat::Action::Dead { elapsed: 0 });
            }
        }
        true
    }

    /// The host's word from a run: its company is inside, on an encounter; or, with `encounter` past the last, done,
    /// and the gate shut to it. Only a run the gate opened is heard, so no word makes a company the gate never knew.
    pub fn breach_inside(&mut self, run: &str, name: &str, tier: Tier, encounter: u8) {
        let clock = self.clock;
        let Some(gate) = self.breach_gate.as_mut().filter(|gate| gate.opened.contains_key(run)) else { return };
        if usize::from(encounter) >= gear::breach::DROWNED_VALE.encounters.len() {
            // Told once, as the company that was inside is done: its run says so again until it leaves.
            gate.opened.remove(run);
            gate.spent.insert(run.to_owned());
            if gate.inside.remove(run).is_some() {
                self.tell_all(EventKind::BreachCleared, f64::from(encounter));
            }
            return;
        }
        gate.inside.insert(run.to_owned(), Inside { name: name.to_owned(), tier, encounter, heard: clock });
    }

    /// Whether a run's gate stands open at the room's minute, for the host to let its company in. Its day is counted
    /// here too, as an empty zone's room is asked without the tick that would shut it.
    #[must_use]
    pub fn breach_opened(&self, run: &str) -> bool {
        let opened = self.breach_gate.as_ref().and_then(|gate| gate.opened.get(run));
        opened.is_some_and(|opened| self.minute < opened + OPENED_MINUTES)
    }

    /// Each tick in a room with a Breach's gate: the Waking, its foes, its fallen, and the word from runs gone stale.
    pub(crate) fn keep_breach_gate(&mut self) {
        let Some(mut gate) = self.breach_gate.take() else { return };
        let clock = self.clock;
        let past: Vec<String> = gate
            .opened
            .iter()
            .filter(|(_, opened)| self.minute >= **opened + OPENED_MINUTES)
            .map(|(run, _)| run.clone())
            .collect();
        for run in past {
            gate.opened.remove(&run);
            gate.spent.insert(run);
        }
        gate.inside.retain(|run, inside| clock < inside.heard + INSIDE_LASTS && gate.opened.contains_key(run));
        for company in gate.companies.values_mut() {
            company.players.retain(|player| self.players.contains_key(player));
        }
        gate.companies.retain(|run, company| !company.players.is_empty() || gate.opened.contains_key(run));
        if gate.woken.is_some_and(|at| clock >= at + OPEN_TICKS)
            || gate.held_by.as_ref().is_some_and(|run| !gate.companies.contains_key(run))
        {
            self.settle_gate(&mut gate);
        }
        if gate.held_by.is_none() {
            self.take_gate(&mut gate);
        }
        if gate.held_by.is_some() && gate.woken.is_none() {
            self.keep_waking(&mut gate);
        }
        self.breach_gate = Some(gate);
    }

    /// The first company whose living player stands on a mooring takes the gate, unless the gate already opened to it,
    /// now or before (`spent`).
    fn take_gate(&mut self, gate: &mut Gate) {
        let moorings: Vec<[f64; 3]> = MOORINGS.iter().filter_map(|name| gate.socket(name)).collect();
        let fresh = |run: &&String| !gate.opened.contains_key(*run) && !gate.spent.contains(*run);
        let taker = gate.companies.iter().filter(|(run, _)| fresh(run)).find(|(_, company)| {
            company.players.iter().any(|player| {
                self.players.get(player).is_some_and(|found| {
                    found.living()
                        && moorings.iter().any(|at| {
                            apart([found.fighter.body.x, found.fighter.body.y], [at[0], at[1]]) <= MOORING_REACH_M
                        })
                })
            })
        });
        let Some((run, company)) = taker.map(|(run, company)| (run.clone(), company.clone())) else { return };
        gate.held_by = Some(run);
        (gate.since, gate.fill, gate.next_wave, gate.bulwarks) = (self.clock, 0, self.clock + 3 * 60, 0);
        gate.last_near = self.clock;
        gate.revives = company.tier.and_then(Tier::revives);
        self.tell_all(EventKind::BreachBegun, 0.0);
    }

    /// The gate let go: its foes gone, its claims and fill cleared, free for the next company.
    fn settle_gate(&mut self, gate: &mut Gate) {
        for id in std::mem::take(&mut gate.foes) {
            if self.foes.get(&id).is_some_and(|foe| !foe.fighter.dead()) {
                self.inert.remove(&id);
                self.gone(id);
            }
        }
        (gate.held_by, gate.fill, gate.woken, gate.claims) = (None, 0, None, [None; 3]);
        (gate.claimers, gate.down_since, gate.empty_since) = (Vec::new(), None, None);
        gate.left_down.clear();
    }

    /// The Waking under way: the moorings judged, the Spire filled or ebbing, the Bulwarks sent to claim, the waves,
    /// the company's fallen raised, and its loss or its win.
    fn keep_waking(&mut self, gate: &mut Gate) {
        let clock = self.clock;
        let Some(run) = gate.held_by.clone() else { return };
        let company = gate.companies.get(&run).cloned().unwrap_or_default();
        let tier = company.tier.unwrap_or(Tier::Normal);
        let moorings: Vec<[f64; 3]> = MOORINGS.iter().filter_map(|name| gate.socket(name)).collect();
        for claim in &mut gate.claims {
            if claim.is_some_and(|id| !self.standing_foe(id)) {
                *claim = None;
            }
        }
        let held_at = |(nth, at): (usize, &[f64; 3])| {
            gate.claims[nth].is_none()
                && company.players.iter().any(|player| {
                    self.players.get(player).is_some_and(|found| {
                        found.living()
                            && apart([found.fighter.body.x, found.fighter.body.y], [at[0], at[1]]) <= MOORING_REACH_M
                    })
                })
        };
        // In a test room one player is the whole company: any one mooring held fills the Spire as all three do.
        let held =
            if self.test { moorings.iter().enumerate().any(held_at) } else { moorings.iter().enumerate().all(held_at) };
        // A company gone from the hollow lets the gate go to the next.
        let near = company.players.iter().any(|player| {
            self.players
                .get(player)
                .is_some_and(|found| found.living() && gate.in_hollow([found.fighter.body.x, found.fighter.body.y]))
        });
        if near {
            gate.last_near = clock;
        } else if clock >= gate.last_near + LEFT_TICKS {
            self.settle_gate(gate);
            return;
        }
        let ebb = if tier == Tier::Hard { EBB_EVERY.1 } else { EBB_EVERY.0 };
        if held {
            gate.fill += 1;
        } else if clock.is_multiple_of(ebb) {
            gate.fill = gate.fill.saturating_sub(1);
        }
        if gate.fill > 0 {
            gate.empty_since = None;
        } else if clock >= *gate.empty_since.get_or_insert(clock) + EMPTY_TICKS {
            self.lose_waking(gate, &company);
            return;
        }
        let third = SPIRE_TICKS / 3;
        // Counted once one stands, so a room too full to stand it sends it again next tick.
        if gate.fill >= third * u64::from(gate.bulwarks)
            && gate.bulwarks < 3
            && self.send_claimers(gate, &moorings, if tier == Tier::Hard { 2 } else { 1 }) > 0
        {
            gate.bulwarks += 1;
        }
        self.keep_claimers(gate, &moorings);
        if clock >= gate.next_wave {
            gate.next_wave = clock + WAVE_EVERY;
            self.gate_wave(gate);
        }
        let all_down = !company.players.is_empty()
            && company.players.iter().all(|player| self.players.get(player).is_none_or(|found| !found.living()));
        if all_down {
            let since = *gate.down_since.get_or_insert(clock);
            if clock >= since + super::WIPE_TICKS {
                self.lose_waking(gate, &company);
            }
            return;
        }
        gate.down_since = None;
        if gate.fill >= SPIRE_TICKS {
            gate.woken = Some(clock);
            gate.opened.insert(run, self.minute);
            gate.left_down.clear();
            for id in std::mem::take(&mut gate.foes) {
                if self.foes.get(&id).is_some_and(|foe| !foe.fighter.dead()) {
                    self.inert.remove(&id);
                    self.gone(id);
                }
            }
            self.tell_all(EventKind::BreachWon, 0.0);
            for player in &company.players {
                self.pay_gate(*player, tier);
            }
        }
    }

    /// Bulwarks sent from the mouths to claim the moorings left empty, each mouth's formed under a crown over it, as
    /// the Waking's are; answers how many stood.
    fn send_claimers(&mut self, gate: &mut Gate, moorings: &[[f64; 3]], count: usize) -> usize {
        let mouths: Vec<[f64; 3]> = (1..=4).filter_map(|number| gate.socket(&format!("mouth-{number}"))).collect();
        let mut at_mouth: BTreeMap<usize, Vec<FighterId>> = BTreeMap::new();
        let mut stood = count;
        for nth in 0..count {
            let mouth_number = (gate.waves + nth) % mouths.len().max(1);
            let Some(mouth) = mouths.get(mouth_number) else {
                stood = nth;
                break;
            };
            let Some(id) = self.stand_gate_foe(gate, (BULWARK, Rank::Elite), *mouth) else {
                stood = nth;
                break;
            };
            self.inert.insert(id);
            gate.claimers.push((id, (gate.waves + nth) % moorings.len().max(1)));
            at_mouth.entry(mouth_number).or_default().push(id);
        }
        for formed in at_mouth.values() {
            self.under_crown(formed);
        }
        stood
    }

    /// Each claimer walks to its mooring and, finding it empty of the company, claims it and fights there; one that
    /// finds it held fights whoever holds it.
    fn keep_claimers(&mut self, gate: &mut Gate, moorings: &[[f64; 3]]) {
        for (id, mooring) in std::mem::take(&mut gate.claimers) {
            if !self.standing_foe(id) {
                self.inert.remove(&id);
                continue;
            }
            let Some(&at) = moorings.get(mooring) else { continue };
            if !self.walk_inert(id, at, 2.6) {
                gate.claimers.push((id, mooring));
                continue;
            }
            self.inert.remove(&id);
            let held = self.held_by_players(at, MOORING_REACH_M) > 0;
            if !held && gate.claims[mooring].is_none() {
                gate.claims[mooring] = Some(id);
                self.tell_all(EventKind::Claimed, mooring as f64);
            }
            if let Some(foe) = self.foes.get_mut(&id) {
                foe.brain.posted_at(at, foe.fighter.body.facing);
            }
        }
    }

    /// A wave at the gate: Husks and Flickers at its mouths, two and one more for every two of the holding company's
    /// living players (WAVE_MOST at most), and every other wave a Ravager on its perches.
    fn gate_wave(&mut self, gate: &mut Gate) {
        let mouths: Vec<[f64; 3]> = (1..=4).filter_map(|number| gate.socket(&format!("mouth-{number}"))).collect();
        let perches: Vec<[f64; 3]> = (1..=2).filter_map(|number| gate.socket(&format!("perch-{number}"))).collect();
        let holders = gate.held_by.as_ref().and_then(|run| gate.companies.get(run)).map_or(0, |company| {
            company.players.iter().filter(|player| self.players.get(player).is_some_and(Player::living)).count()
        });
        // Each mouth's and each perch's foes form under a crown of crystal over it (`arrivals.rs`).
        let mut at_mouths: Vec<Vec<FighterId>> = vec![Vec::new(); mouths.len()];
        for nth in 0..(2 + holders / 2).min(super::waves::WAVE_MOST) {
            let kind = if nth % 2 == 0 { (HUSK, Rank::Major) } else { (FLICKER, Rank::Major) };
            let mouth = (gate.waves + nth) % mouths.len().max(1);
            if let Some(&at) = mouths.get(mouth) {
                at_mouths[mouth].extend(self.stand_gate_foe(gate, kind, at));
            }
        }
        if gate.waves % 2 == 1
            && let Some(perch) = perches.get(gate.waves / 2 % perches.len().max(1))
        {
            at_mouths.push(self.stand_gate_foe(gate, (RAVAGER, Rank::Elite), *perch).into_iter().collect());
        }
        for foes in at_mouths {
            self.under_crown(&foes);
        }
        gate.waves += 1;
    }

    /// One of the Waking's foes: at the company's tier's level, dropping nothing, hunting the nearest living player;
    /// none while the room stands as many as it may beside a running public event's (`others_most`).
    fn stand_gate_foe(&mut self, gate: &mut Gate, (number, rank): (u8, Rank), at: [f64; 3]) -> Option<FighterId> {
        if self.living_foes() >= self.others_most() {
            return None;
        }
        let tier = gate.held_by.as_ref().and_then(|run| gate.companies.get(run)).and_then(|company| company.tier);
        let level = tier.unwrap_or(Tier::Normal).foes_at();
        let place = self.nav.nearest_point(at).unwrap_or(at);
        let id = self.stand_foe(::foes::foe_type(number)?, rank, place, 0.0, None);
        self.gird(id, level, None);
        self.quests.spoilless.insert(id);
        let hunted = self.nearest_player([at[0], at[1]]);
        let clock = self.clock;
        if let Some(foe) = self.foes.get_mut(&id) {
            foe.brain.posted_at(place, 0.0);
            if let Some((player, at)) = hunted {
                foe.brain.hunt(player, at, clock);
            }
        }
        gate.foes.push(id);
        Some(id)
    }

    /// The Waking lost: its foes gone, and the company standing whole at the gate's arrival.
    fn lose_waking(&mut self, gate: &mut Gate, company: &Company) {
        self.settle_gate(gate);
        self.tell_all(EventKind::BreachWiped, 0.0);
        let at = gate.socket("arrival").unwrap_or(gate.at);
        for player in &company.players {
            self.stand_whole(*player, at);
        }
    }

    /// The Waking's first clear of the week at the company's tier, paid to a player the room keeps.
    fn pay_gate(&mut self, player: PlayerId, tier: Tier) {
        let week = gear::clock::week_of(self.minute);
        let dice = self.dice(player);
        let Some(found) = self.players.get_mut(&player).filter(|found| found.owner.is_some()) else { return };
        // Only one the Breach's own gate would let in at this tier is paid for its opening.
        let place = gear::gate::Place::Breach(tier);
        if gear::gate::shut(&found.character, place, gear::world::Difficulty::Normal).is_some() {
            return;
        }
        let paid = found.character.breach_cleared(&gear::breach::DROWNED_VALE, tier, week, 0, &dice);
        for vestige in paid.vestiges {
            found.character.keep_paid(vestige);
        }
        found.gear_changed = true;
    }

    /// A player's ask at the gate: whether it is open to their company, for the page to go in; out of reach for one
    /// not at it.
    pub(crate) fn ask_enter_breach(&self, id: PlayerId) -> u8 {
        let Some(gate) = self.breach_gate.as_ref() else { return crate::asks::OUT_OF_REACH };
        let Some(found) = self.players.get(&id).filter(|found| found.living()) else {
            return crate::asks::OUT_OF_REACH;
        };
        let near = gate
            .socket("gate")
            .is_some_and(|at| apart([found.fighter.body.x, found.fighter.body.y], [at[0], at[1]]) <= 4.0);
        let open = gate.run_of(id).is_some_and(|run| gate.opened.contains_key(run));
        match (near, open) {
            (false, _) => crate::asks::OUT_OF_REACH,
            (true, true) => crate::asks::INTO_BREACH,
            (true, false) => GATE_SHUT,
        }
    }
}
