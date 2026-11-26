//! A passage zone's deal, run by its room each tick once a player is in it: a skirmish, a vault and a lamp are done as
//! their guard is down, a reliquary once opened and a vein once its nodes are gathered; a mission as the design gives it (Kindle's three dead lamps lit while
//! waves come, Hold's ring held 90 s against waves, Hunt's marked band down, Reckoning's three collectors down, who
//! run once found, Gauntlet's farthest mouth reached, in time or late, Ambush's three waves beaten, Sever's three tally
//! posts broken). Done, it pays its cache to each player in the zone who took part, once a dive, and opens their
//! mouths; in a public room it begins again 60 s on, and a player who came after it was done goes on once its next
//! round is done.

use super::Round;
use crate::{PlayerId, Room};
use ::foes::Rank::Major;
use ::foes::roster::{COLLECTOR, ENFORCER};
use combat::sight::apart;
use gear::dive::Route;
use gear::lamps::Cache;
use gear::objectives::{Deed, Feat};
use passage::{Deal, Mission, PieceKind};

/// A public room's deal begins again this long after it is done: 60 s.
pub(crate) const AGAIN_TICKS: u64 = 60 * 60;
/// Hold's ring held, and Gauntlet's time to reach the far mouth: 90 s each.
pub(crate) const HOLD_TICKS: u64 = 90 * 60;
pub(crate) const GAUNTLET_TICKS: u64 = 90 * 60;
/// A wave comes every 30 s while a Kindle or a Hold runs, once the last is down; an Ambush's comes as the last is
/// down, three in all.
pub(super) const WAVE_EVERY_TICKS: u64 = 30 * 60;
pub(crate) const AMBUSH_WAVES: u8 = 3;
/// How far a collector sees a player from, and a mouth counts as reached from (m).
const FOUND_M: f64 = 12.0;
pub(crate) const REACHED_M: f64 = 3.0;
/// How near the arrival a Gauntlet's runner stands in a round for their reaching the far mouth to count (m).
const SET_OUT_M: f64 = 6.0;
/// How fast a found collector runs, metres a second.
const FLEE_PACE: f64 = 5.5;
/// The foes a vein's gather calls, each node.
const GATHER_WAVE: usize = 2;
/// The names over a Hunt's marked Elite, a Reckoning's collectors and a Sever's tally posts.
const MARKED: &str = "The Marked";
const COLLECTOR_NAME: &str = "Collector";
pub(crate) const TALLY_POST: &str = "Tally Post";

impl Room {
    /// Lays what the deal stands beside its bands as the room opens: Kindle's dead lamps, Reckoning's collectors on
    /// the farthest spots, Sever's tally posts at their pieces, the room moving each itself.
    pub(crate) fn lay_deal(&mut self) {
        let Some(zone) = self.zone() else { return };
        let deal = zone.zone.deal;
        let pieces = zone.pieces.clone();
        let spots = zone.sites.spots.clone();
        let mut round = Round { guards: zone.round.guards.clone(), number: zone.round.number, ..Round::default() };
        match deal {
            Deal::Mission(Mission::Kindle) => round.lit = vec![false; passage::plan::KINDLES],
            Deal::Mission(Mission::Reckoning) => {
                for (nth, at) in (0..).zip(spots.iter().take(passage::plan::COLLECTORS)) {
                    let target = self.stand_deal_foe((COLLECTOR, Major), *at, 0.0, 100 + nth);
                    if let Some(id) = target {
                        self.names.insert(id, COLLECTOR_NAME);
                        round.targets.push(id);
                    }
                }
                round.found = vec![false; round.targets.len()];
            }
            Deal::Mission(Mission::Sever) => {
                let posts = pieces.iter().filter(|piece| matches!(piece.kind, PieceKind::Post(_)));
                for (nth, piece) in (0..).zip(posts) {
                    let target =
                        self.stand_deal_foe((ENFORCER, Major), [piece.at[0], piece.at[1]], piece.facing, 200 + nth);
                    if let Some(id) = target {
                        self.names.insert(id, TALLY_POST);
                        round.targets.push(id);
                    }
                }
            }
            Deal::Mission(Mission::Hunt) => {
                let marked = round.guards.first().and_then(|&post| self.garrison.get(post)?.standing.first().copied());
                if let Some(id) = marked {
                    self.names.insert(id, MARKED);
                }
            }
            _ => {}
        }
        for id in &round.targets {
            self.inert.insert(*id);
        }
        if let Some(zone) = self.zone_mut() {
            zone.round = round;
        }
    }

    /// Each tick: the round begins as the first player is in, its holds are kept, its deal run until it is done; in
    /// a public room it begins again AGAIN_TICKS after; and a player who has gathered every node of a vein counts it.
    pub(crate) fn keep_passage(&mut self) {
        let Some(zone) = self.zone() else { return };
        if self.players.is_empty() {
            return;
        }
        let (done_at, route) = (zone.round.done_at, zone.route);
        if zone.round.began.is_none() {
            let clock = self.clock;
            if let Some(zone) = self.zone_mut() {
                zone.round.began = Some(clock);
            }
        }
        self.keep_zone_foes();
        self.keep_holds();
        match done_at {
            None => {
                self.run_deal();
                if self.deal_met() {
                    self.deal_done();
                }
            }
            Some(done) if route == Route::Public && self.clock >= done + AGAIN_TICKS => self.begin_again(),
            Some(_) => self.keep_cold_lamp(),
        }
    }

    fn guards_down(&self) -> bool {
        let Some(zone) = self.zone() else { return false };
        zone.round.guards.iter().all(|&post| self.garrison.get(post).is_none_or(|post| post.cleared_at.is_some()))
    }

    /// Whether the round's deal is met now.
    fn deal_met(&self) -> bool {
        let Some(zone) = self.zone() else { return false };
        let round = &zone.round;
        match zone.zone.deal {
            Deal::Mission(Mission::Kindle) => round.lit.iter().all(|lit| *lit),
            Deal::Mission(Mission::Hold) => round.held >= HOLD_TICKS,
            Deal::Mission(Mission::Hunt) => round
                .guards
                .first()
                .is_none_or(|&post| self.garrison.get(post).is_none_or(|post| post.cleared_at.is_some())),
            Deal::Mission(Mission::Reckoning | Mission::Sever) => {
                round.targets.iter().all(|&id| !self.standing_foe(id))
            }
            Deal::Mission(Mission::Gauntlet) => round.reached,
            Deal::Mission(Mission::Ambush) => {
                round.waves >= AMBUSH_WAVES && round.wave_foes.iter().all(|&id| !self.standing_foe(id))
            }
            Deal::Reliquary => round.opened,
            Deal::Vein => !self.resource_nodes.is_empty() && round.gathered.len() >= self.resource_nodes.len(),
            Deal::Skirmish | Deal::Vault | Deal::Lamp => self.guards_down(),
        }
    }

    /// Runs a mission's own rules for a tick: its waves, Hold's ring, Reckoning's collectors, Gauntlet's far mouth.
    fn run_deal(&mut self) {
        let Some(zone) = self.zone() else { return };
        let (deal, began) = (zone.zone.deal, zone.round.began.unwrap_or(self.clock));
        let since = self.clock.saturating_sub(began);
        match deal {
            Deal::Mission(Mission::Kindle | Mission::Hold) => {
                let last_down = zone.round.wave_foes.iter().all(|&id| !self.standing_foe(id));
                if since.is_multiple_of(WAVE_EVERY_TICKS) && last_down {
                    self.call_wave(None);
                }
                if deal == Deal::Mission(Mission::Hold)
                    && self.ring_held()
                    && let Some(zone) = self.zone_mut()
                {
                    zone.round.held += 1;
                }
            }
            Deal::Mission(Mission::Ambush) => {
                let round = &zone.round;
                if round.waves < AMBUSH_WAVES && round.wave_foes.iter().all(|&id| !self.standing_foe(id)) {
                    self.call_wave(None);
                }
            }
            Deal::Mission(Mission::Reckoning) => self.run_collectors(),
            Deal::Mission(Mission::Gauntlet) => {
                let Some(far) = self.far_mouth() else { return };
                let (arrive, number, clock) = (zone.sites.arrive, zone.zone.number, self.clock);
                let at = |player: &crate::players::Player| [player.fighter.body.x, player.fighter.body.y];
                // A run is set out on from the way in in this round, by one whose dive is here and not yet done.
                let running = |player: &crate::players::Player| {
                    !player.fighter.dead()
                        && player.character.passage.as_ref().is_some_and(|dive| dive.zone == number && !dive.done)
                };
                let setting_out: Vec<PlayerId> = self
                    .players
                    .iter()
                    .filter(|(_, player)| running(player) && apart(at(player), arrive) <= SET_OUT_M)
                    .map(|(id, _)| *id)
                    .collect();
                // Each player's 90 s run from their arrival or the round's start, the later; one past theirs is late,
                // whoever else reaches it with them.
                let reachers: Vec<(PlayerId, bool)> = self
                    .players
                    .iter()
                    .filter(|(id, player)| {
                        running(player)
                            && (zone.round.set_out.contains(id) || setting_out.contains(id))
                            && apart(at(player), far) <= REACHED_M
                    })
                    .map(|(id, _)| {
                        // A player who came in an earlier round runs from this one's start.
                        let came = zone.arrived.get(id).copied().unwrap_or(began).max(began);
                        (*id, clock.saturating_sub(came) > GAUNTLET_TICKS)
                    })
                    .collect();
                let Some(zone) = self.zone_mut() else { return };
                zone.round.set_out.extend(setting_out);
                if !reachers.is_empty() {
                    zone.round.reached = true;
                    zone.round.late.extend(reachers.iter().filter(|(_, late)| *late).map(|(id, _)| *id));
                    zone.round.took_part.extend(reachers.iter().map(|(id, _)| *id));
                }
            }
            _ => {}
        }
    }

    /// Hold's ring: round its first spot, held while a player stands in it, alive, and no foe within CONTEST_M of it;
    /// those in it take part.
    fn ring_held(&mut self) -> bool {
        let Some(ring) = self.zone().and_then(|zone| zone.sites.spots.first().copied()) else { return false };
        let holding: Vec<PlayerId> = self
            .players
            .iter()
            .filter(|(_, player)| {
                let at = [player.fighter.body.x, player.fighter.body.y];
                !player.fighter.dead() && apart(at, ring) <= passage::plan::RING_M
            })
            .map(|(id, _)| *id)
            .collect();
        if let Some(zone) = self.zone_mut() {
            zone.round.took_part.extend(&holding);
        }
        !holding.is_empty() && !self.contested(ring)
    }

    /// The onward mouth farthest from the way in, Gauntlet's goal.
    pub(crate) fn far_mouth(&self) -> Option<[f64; 2]> {
        let sites = &self.zone()?.sites;
        sites.far_mouth().and_then(|far| sites.onward.get(far)).map(|door| door.at)
    }

    /// Each collector found (a player within FOUND_M) runs from the nearest player to the spot farthest from them.
    fn run_collectors(&mut self) {
        let Some(zone) = self.zone() else { return };
        let (targets, mut found, spots) =
            (zone.round.targets.clone(), zone.round.found.clone(), zone.sites.spots.clone());
        let players: Vec<[f64; 2]> = self
            .players
            .values()
            .filter(|player| !player.fighter.dead())
            .map(|player| [player.fighter.body.x, player.fighter.body.y])
            .collect();
        for (nth, id) in targets.iter().enumerate() {
            let Some(body) = self.foes.get(id).filter(|foe| !foe.fighter.dead()).map(|foe| foe.fighter.body) else {
                continue;
            };
            let nearest = |at: [f64; 2]| players.iter().map(|player| apart(*player, at)).fold(f64::INFINITY, f64::min);
            if nearest([body.x, body.y]) <= FOUND_M {
                found[nth] = true;
            }
            if !found[nth] {
                continue;
            }
            let away = spots.iter().copied().max_by(|one, two| nearest(*one).total_cmp(&nearest(*two)));
            if let Some(away) = away {
                let to = [away[0], away[1], self.floor_height(away)];
                self.walk_inert(*id, to, FLEE_PACE);
            }
        }
        if let Some(zone) = self.zone_mut() {
            zone.round.found = found;
        }
    }

    fn floor_height(&self, at: [f64; 2]) -> f64 {
        movement::Terrain::height_at(&self.floor, at[0], at[1])
    }

    /// The deal done: each player in the zone, who took part, has it done for their dive, opening their mouths, and is
    /// paid its cache once a dive (a Gauntlet's none who reached its far mouth late), the passages' bounties counted.
    /// One who came after an earlier round was done is in this one.
    fn deal_done(&mut self) {
        let Some(zone) = self.zone() else { return };
        let (deal, number, depth, levels, island, week) =
            (zone.zone.deal, zone.zone.number, zone.zone.depth, zone.levels, zone.island, zone.week);
        let late = zone.round.late.clone();
        let (clock, difficulty, source) = (self.clock, self.difficulty, self.source);
        let cache = match deal {
            Deal::Skirmish => Some(Cache::Skirmish),
            Deal::Mission(_) => Some(Cache::Mission),
            Deal::Vault => Some(Cache::Vault),
            Deal::Vein => Some(Cache::Vein),
            Deal::Reliquary => Some(Cache::Reliquary),
            Deal::Lamp => passage::lamp_number(depth).map(Cache::Lamp),
        };
        let players: Vec<PlayerId> = self.players.keys().copied().collect();
        let took_part = zone.round.took_part.clone();
        let at = gear::lamps::Zone { island, week, zone: number, depth, level: levels.1 };
        for player in players {
            let dice = self.dice(player);
            let Some(found) = self.players.get_mut(&player) else { continue };
            found.character.dive_deal_done(number);
            let cache = cache.filter(|_| took_part.contains(&player) && !late.contains(&player));
            let paid = cache.is_some_and(|cache| found.character.pay_cache(at, cache, difficulty, source, &dice));
            found.gear_changed = true;
            // The bounties count only those its cache paid, once a dive, so a round camped counts nothing more.
            if !paid {
                continue;
            }
            let deed = match deal {
                Deal::Mission(_) => Some(Deed::Mission),
                Deal::Reliquary => Some(Deed::Reliquary),
                Deal::Vein => Some(Deed::Vein),
                _ => None,
            };
            if let Some(deed) = deed {
                self.saw(player, &Feat::Passage(deed));
            }
            if deal == Deal::Mission(Mission::Kindle)
                && let Some(found) = self.players.get_mut(&player)
            {
                found.character.toward_bounties(gear::atheric_bounty::Toward::Kindled { island });
            }
        }
        if let Some(zone) = self.zone_mut() {
            zone.round.done_at = Some(clock);
        }
    }

    /// A public room's deal begins again: its guards cleared stand again (a band still standing keeps its own) while
    /// the players there now make room for them, the rest kept to stand as more come; its targets with them, its
    /// progress from nothing.
    fn begin_again(&mut self) {
        let Some(zone) = self.zone() else { return };
        let (guards, targets, waves) =
            (zone.round.guards.clone(), zone.round.targets.clone(), zone.round.wave_foes.clone());
        for id in targets.into_iter().chain(waves) {
            self.gone(id);
        }
        let cleared = |post: &usize| self.garrison.get(*post).is_some_and(|post| post.cleared_at.is_some());
        let (cleared, still): (Vec<usize>, Vec<usize>) = guards.into_iter().partition(cleared);
        let mut standing: usize = still.iter().map(|&post| self.band_counted(post)).sum();
        let (mut again, mut spare) = (Vec::new(), Vec::new());
        for post in cleared {
            let size = self.band_counted(post);
            // As the bands first stood: the first always, then each the most foes make room for.
            if (standing == 0 && again.is_empty()) || standing + size <= self.counted_most() {
                standing += size;
                again.push(post);
            } else {
                spare.push(post);
            }
        }
        for &post in &again {
            self.stand_post(post);
        }
        self.harden(&again);
        self.toughen_posts(&again);
        if let Some(zone) = self.zone_mut() {
            zone.round.guards.retain(|post| !spare.contains(post));
            zone.spare.extend(spare);
        }
        let clock = self.clock;
        if let Some(zone) = self.zone_mut() {
            zone.round.number += 1;
        }
        self.lay_deal();
        if let Some(zone) = self.zone_mut() {
            zone.round.began = Some(clock);
        }
    }

    /// A vein's node gathered by a player: counted gathered this round, the player taking part, and a wave of two
    /// called.
    pub(crate) fn vein_gathered(&mut self, player: PlayerId, node: u8) {
        let Some(zone) = self.zone_mut().filter(|zone| zone.zone.deal == Deal::Vein && zone.round.done_at.is_none())
        else {
            return;
        };
        zone.round.gathered.insert(node);
        zone.round.took_part.insert(player);
        self.call_wave(Some(GATHER_WAVE));
    }

    /// Whether the zone's mouths are open for a player: once its deal was done for their dive, or at once in a
    /// gauntlet.
    pub(crate) fn mouths_open(&self, player: PlayerId) -> bool {
        let Some(zone) = self.zone() else { return false };
        let gauntlet = zone.zone.deal == Deal::Mission(Mission::Gauntlet);
        let done = self
            .players
            .get(&player)
            .and_then(|found| found.character.passage.as_ref())
            .is_some_and(|dive| dive.zone == zone.zone.number && dive.done);
        gauntlet || done
    }

    /// Whether the clock's week is past the zone's web's: its ways lead elsewhere now.
    pub fn shifted(&self) -> bool {
        self.zone().is_some_and(|zone| gear::clock::week_of(self.minute) > zone.week)
    }
}
