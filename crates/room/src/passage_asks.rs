//! What a player asks of the passages, answered in turn as every ask is (`asks.rs`): in a passage zone to go on through
//! an onward mouth, to kindle a dead lamp, open a reliquary or light the zone's lamp (E held at it, `passage_holds.rs`),
//! and to go home from a lit lamp; in a patrol zone with passages to begin a dive at one of its mouths, by its route,
//! or at a lamp lit this week. Each is answered done or with why not, the dive's zone told with the gear. And what the
//! room does for the dive as a player comes and goes: a player joining a zone of their dive finds into its haul from
//! now; joining any other room ends their dive; a respawn empties the haul; a kill counts toward the passages'
//! bounties and the Atheric bounties.

use super::{Held, Passage};
use crate::asks::answer_code;
use crate::{PlayerId, Room, Standing};
use combat::sight::apart;
use gear::Refusal;
use gear::dive::{Route, Start};
use gear::objectives::{Deed, Feat};
use passage::{Deal, Mission};

/// How near a mouth's middle a player stands to use it (m).
pub const MOUTH_REACH_M: f64 = 4.0;

/// An ask of the passages.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PassageAsk {
    /// Goes on through the zone's onward mouth by its place.
    GoOn { mouth: u8 },
    /// Begins to kindle a Kindle's dead lamp by its number, E held.
    Kindle { lamp: u8 },
    /// Begins to light the zone's lamp, E held.
    LightLamp,
    /// Begins to open a reliquary, E held.
    Open,
    /// Goes home from the zone's lamp, lit.
    GoHome,
    /// Begins a dive at a patrol zone's mouth, by its place, on a route, at a lamp lit this week if one is named.
    Begin { mouth: u8, route: Route, lamp: Option<u8> },
}

/// What a page shows of a passage zone for a player: the deal's key, whether it is done, the dead lamps lit (a bit
/// each), the targets broken or down (a bit each), the share of Hold's ring held, the seconds left (Hold's, Gauntlet's,
/// or until a public deal begins again), the waves called, whether the zone's mouths are open for them and its lamp lit
/// for them, and their hold under way (its target, 255 for the lamp, and its share).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PassageSeen {
    pub deal: &'static str,
    pub done: bool,
    pub lit: u8,
    pub broken: u8,
    pub held: f64,
    pub left: f64,
    pub wave: u8,
    pub open: bool,
    pub lamp_lit: bool,
    pub holding: Option<(u8, f64)>,
}

/// A hold's target as the page reads it, the lamp's and a reliquary's beside the dead lamps' numbers.
const LAMP_TARGET: u8 = 255;
const RELIQUARY_TARGET: u8 = 253;

fn refused(refusal: Refusal) -> u8 {
    answer_code(Err(refusal))
}

impl Room {
    /// Answers an ask of the passages: 0 done, else why not. None is answered while the player is fallen, and in a
    /// zone whose week's web has turned only Home at a lamp already lit is.
    pub(crate) fn ask_passage(&mut self, player: PlayerId, ask: PassageAsk) -> u8 {
        let Some(fighter) = self.fighter(player).copied() else { return refused(Refusal::NoDive) };
        let fallen = self.players.get(&player).is_some_and(|found| matches!(found.standing, Standing::Dead { .. }));
        if fighter.dead() || fallen {
            return refused(Refusal::Fallen);
        }
        if self.shifted() && ask != PassageAsk::GoHome {
            return refused(Refusal::Shifted);
        }
        let body = [fighter.body.x, fighter.body.y];
        match (ask, self.passage.as_ref()) {
            (PassageAsk::Begin { mouth, route, lamp }, Some(Passage::Mouths { island, doors, .. })) => {
                let (island, door) = (*island, doors.get(usize::from(mouth)).copied());
                let Some(door) = door else { return refused(Refusal::NoSuchMouth) };
                if apart(body, door) > MOUTH_REACH_M {
                    return refused(Refusal::NotAtMouth);
                }
                self.begin_dive(player, island, (mouth, route, lamp))
            }
            (PassageAsk::Begin { .. }, _) | (_, None | Some(Passage::Mouths { .. })) => refused(Refusal::NotInPassage),
            (PassageAsk::GoOn { mouth }, Some(Passage::Zone(_))) => self.go_on(player, body, mouth),
            (PassageAsk::Kindle { lamp }, Some(Passage::Zone(_))) => self.begin_hold(player, body, Held::Kindle(lamp)),
            (PassageAsk::Open, Some(Passage::Zone(_))) => self.begin_hold(player, body, Held::Reliquary),
            (PassageAsk::LightLamp, Some(Passage::Zone(zone))) => {
                if zone.zone.deal != Deal::Lamp {
                    refused(Refusal::NoLamp)
                } else if zone.round.done_at.is_none() {
                    refused(Refusal::LampGuarded)
                } else {
                    self.begin_hold(player, body, Held::Lamp)
                }
            }
            (PassageAsk::GoHome, Some(Passage::Zone(zone))) => {
                let (number, lamp) = (zone.zone.number, passage::lamp_number(zone.zone.depth));
                let Some(found) = self.players.get_mut(&player) else { return refused(Refusal::NoDive) };
                found.gear_changed = true;
                answer_code(found.character.go_home(number, lamp))
            }
        }
    }

    /// Begins a dive at a mouth: at the zone behind it, or at a lamp's zone of the depth, the mouth's own lane or the
    /// nearest there is.
    fn begin_dive(&mut self, player: PlayerId, island: &str, (mouth, route, lamp): (u8, Route, Option<u8>)) -> u8 {
        let Some(passages) = passage::island(island) else { return refused(Refusal::NotInPassage) };
        let week = gear::clock::week_of(self.minute);
        let web = passage::Web::of(passages, week);
        let zone = match lamp {
            Some(number) => {
                let at_depth: Vec<&passage::Zone> =
                    web.zones.iter().filter(|zone| passage::lamp_number(zone.depth) == Some(number)).collect();
                at_depth.get(usize::from(mouth).min(at_depth.len().saturating_sub(1))).copied()
            }
            None => web.mouths.get(usize::from(mouth)).and_then(|number| web.zone_of(*number)),
        };
        let Some(zone) = zone else { return refused(Refusal::NoSuchMouth) };
        let (depth, seas) = (zone.depth, self.difficulty);
        let start = Start { island, week, route, mouth, zone: zone.number, depth, lamp, seas };
        let Some(found) = self.players.get_mut(&player) else { return refused(Refusal::NoDive) };
        found.gear_changed = true;
        answer_code(found.character.begin_dive(&start))
    }

    /// Goes on through an onward mouth the player stands at.
    fn go_on(&mut self, player: PlayerId, body: [f64; 2], mouth: u8) -> u8 {
        let Some(zone) = self.zone() else { return refused(Refusal::NotInPassage) };
        let Some(door) = zone.sites.onward.get(usize::from(mouth)) else { return refused(Refusal::NoSuchMouth) };
        if apart(body, door.at) > MOUTH_REACH_M {
            return refused(Refusal::NotAtMouth);
        }
        let to = zone.zone.onward.get(usize::from(mouth)).map(|&to| (to, zone.zone.depth + 1));
        let here = (zone.island, zone.week, zone.zone.number);
        let open = zone.zone.deal == Deal::Mission(Mission::Gauntlet);
        let Some(found) = self.players.get_mut(&player) else { return refused(Refusal::NoDive) };
        found.gear_changed = true;
        let gone = found.character.go_on(here, to, open).map(|_| ());
        // The depth counts only for a zone gone on into, and as deep as the dive has gone from where it began.
        let deep = found.character.passage.as_ref().map(gear::dive::Dive::zones_deep).filter(|_| gone.is_ok());
        if let Some(deep) = deep {
            self.saw(player, &Feat::Passage(Deed::Deep(deep)));
        }
        answer_code(gone)
    }

    /// As a player comes into the room with their character: in a zone of their dive, what they find goes into its
    /// haul from now, and in a company's zone whose deal is done it is done for them; at a lamp they began at (or lit),
    /// the lamp is lit for them, and a company's guard there stands down; in any other room their dive ends, its haul
    /// kept if they went home from a lamp, else lost.
    pub(crate) fn passage_arrived(&mut self, player: PlayerId) {
        let here = self.zone().map(|zone| {
            let done = zone.route == Route::Company && zone.round.done_at.is_some();
            let lamp = (zone.zone.deal == Deal::Lamp).then(|| passage::lamp_number(zone.zone.depth)).flatten();
            (zone.island, zone.week, zone.zone.number, zone.zone.depth, (done, lamp))
        });
        let Some(found) = self.players.get_mut(&player) else { return };
        let Some(dive) = found.character.passage.as_mut() else { return };
        match here {
            Some((island, week, number, depth, (done, lamp)))
                if dive.island == island && dive.week == week && dive.zone == number =>
            {
                (dive.here, dive.depth) = (true, depth);
                // Its deal done for the dive before it came is a lamp begun at, or lit before a reload.
                let lit = dive.done && lamp.is_some_and(|lamp| dive.lamp == lamp);
                dive.done |= done;
                let clock = self.clock;
                if let Some(zone) = self.zone_mut() {
                    zone.arrived.insert(player, clock);
                }
                self.first_arrival(player);
                // Lit for them with the dive (`lamp_lit_for`), a company's guard there stands down.
                if lit {
                    self.stand_down_guard();
                }
            }
            _ => {
                let island = dive.island.clone();
                // One who left fallen keeps nothing home: a fall costs the haul, as a respawn does.
                if found.character.left.is_some_and(|left| left.health == 0) {
                    found.character.lose_haul();
                }
                let mouths_of = match self.passage.as_ref() {
                    Some(super::Passage::Mouths { island, .. }) => Some(*island),
                    _ => None,
                };
                let home = found.character.leave_passages(mouths_of);
                found.gear_changed = true;
                if let Some(mouth) = home {
                    self.stand_before_mouth(player, &island, mouth);
                }
            }
        }
    }

    /// Holds an account's first arrival in the zone for the player it keeps now, as they come in or are owned, in
    /// either order: a reload never begins a Gauntlet's 90 s again.
    pub(crate) fn first_arrival(&mut self, player: PlayerId) {
        let Some(owner) = self.players.get(&player).and_then(|found| found.owner.clone()) else { return };
        let Some(zone) = self.zone_mut() else { return };
        let Some(&now) = zone.arrived.get(&player) else { return };
        let first = *zone.came.entry(owner).or_insert(now);
        zone.arrived.insert(player, first);
    }

    /// A company's lamp begun at stands no guard: its guards go and its deal is done for every member there, paying
    /// no one, as the dive that lit it was paid. A public room's guard stands for those who come the long way.
    fn stand_down_guard(&mut self) {
        let Some(zone) = self.zone().filter(|zone| zone.route == Route::Company && zone.round.done_at.is_none()) else {
            return;
        };
        let (guards, number) = (zone.round.guards.clone(), zone.zone.number);
        for found in self.players.values_mut() {
            found.character.dive_deal_done(number);
            found.gear_changed = true;
        }
        let clock = self.clock;
        for post in guards {
            let Some(found) = self.garrison.get_mut(post) else { continue };
            let standing = std::mem::take(&mut found.standing);
            found.cleared_at = Some(clock);
            for id in standing {
                self.gone(id);
            }
        }
        if let Some(zone) = self.zone_mut() {
            zone.round.done_at = Some(clock);
        }
    }

    /// A cold lamp is kindled under waves: once its guard is down, while a player it stands cold for is in the zone
    /// and has not lit it, a wave of the Tithe comes at once and every 30 s from the guard's fall, once the last is
    /// down, as a Kindle's do.
    pub(super) fn keep_cold_lamp(&mut self) {
        let Some(zone) = self.zone() else { return };
        let Some(done) = zone.round.done_at else { return };
        let waiting = self.players.keys().any(|id| !self.lamp_lit_for(*id) && self.lamp_cold_for(*id));
        let last_down = zone.round.wave_foes.iter().all(|id| self.foes.get(id).is_none_or(|foe| foe.fighter.dead()));
        let due = zone.round.waves == 0
            || self.clock.saturating_sub(done).is_multiple_of(super::passage_deal::WAVE_EVERY_TICKS);
        if waiting && last_down && due {
            self.call_wave(None);
        }
    }

    /// A respawn asked for in a passage zone empties the haul, and loses with it the Vestiges still lying for the
    /// player, which would go into it.
    pub(crate) fn lose_haul(&mut self, player: PlayerId) {
        if self.zone().is_none() {
            return;
        }
        self.drops.retain(|drop| drop.player != player || !matches!(drop.what, crate::drops::Dropped::Vestige(_)));
        if let Some(found) = self.players.get_mut(&player) {
            found.character.lose_haul();
            found.gear_changed = true;
        }
    }

    /// A kill in a passage zone by a player, the weapon of `hand` its last blow's: it counts toward the passages'
    /// bounties and the Atheric bounties' steps.
    pub(crate) fn passage_kill(&mut self, player: PlayerId, hand: gear::Slot) {
        let Some(island) = self.zone().map(|zone| zone.island) else { return };
        self.saw(player, &Feat::Passage(Deed::Felled));
        if let Some(zone) = self.zone_mut() {
            zone.round.took_part.insert(player);
        }
        let Some(found) = self.players.get_mut(&player) else { return };
        let weapon = found.character.worn(hand).map(|item| item.kind);
        if found.character.toward_bounties(gear::atheric_bounty::Toward::Felled { island, weapon }) {
            found.gear_changed = true;
        }
    }

    /// What a page shows of the zone for a player; none outside a passage zone.
    #[must_use]
    pub fn passage_seen(&self, player: PlayerId) -> Option<PassageSeen> {
        let zone = self.zone()?;
        let round = &zone.round;
        let bits = |flags: &mut dyn Iterator<Item = bool>| {
            flags.zip(0..8).fold(0_u8, |bits, (on, at)| bits | (u8::from(on) << at))
        };
        let broken = bits(&mut round.targets.iter().map(|id| self.foes.get(id).is_none_or(|foe| foe.fighter.dead())));
        let seconds = |ticks: u64| ticks as f64 / 60.0;
        // A Gauntlet's time runs from the player's arrival or the round's start, the later, as the deal times it.
        let came = round.began.map(|began| zone.arrived.get(&player).copied().unwrap_or(began).max(began));
        let since = came.map_or(0, |came| self.clock.saturating_sub(came));
        let left = match (round.done_at, zone.zone.deal) {
            (Some(done), _) if zone.route == Route::Public => {
                seconds((done + super::passage_deal::AGAIN_TICKS).saturating_sub(self.clock))
            }
            (Some(_), _) => 0.0,
            (None, Deal::Mission(Mission::Hold)) => seconds(super::passage_deal::HOLD_TICKS.saturating_sub(round.held)),
            (None, Deal::Mission(Mission::Gauntlet)) => {
                seconds(super::passage_deal::GAUNTLET_TICKS.saturating_sub(since))
            }
            (None, _) => 0.0,
        };
        let holding = zone.holds.get(&player).map(|hold| {
            let ticks = self.hold_ticks(player, hold.target);
            let target = match hold.target {
                Held::Kindle(nth) => nth,
                Held::Reliquary => RELIQUARY_TARGET,
                Held::Lamp => LAMP_TARGET,
            };
            (target, (self.clock.saturating_sub(hold.since) as f64 / ticks as f64).min(1.0))
        });
        Some(PassageSeen {
            deal: zone.zone.deal.key(),
            done: round.done_at.is_some(),
            lit: bits(&mut round.lit.iter().copied()),
            broken,
            held: (round.held as f64 / super::passage_deal::HOLD_TICKS as f64).min(1.0),
            left,
            wave: round.waves,
            open: self.mouths_open(player),
            lamp_lit: self.lamp_lit_for(player),
            holding,
        })
    }
}

#[cfg(test)]
#[path = "passage_dive_tests.rs"]
mod passage_dive_tests;
