//! What a player asks of the passages, answered in turn as every ask is (`asks.rs`): in a passage zone to go on through
//! an onward mouth, to kindle a dead lamp or light the zone's lamp (E held at it), and to go home from a lit lamp; in
//! a patrol zone with passages to begin a dive at one of its mouths, by its route, or at a lamp lit this week. Each
//! is answered done or with why not, the dive's zone told with the gear. And what the room does for the dive as a
//! player comes and goes: a player joining a zone of their dive finds into its haul from now; joining any other room
//! ends their dive; a respawn empties the haul; a kill counts toward the passages' bounties and the Atheric bounties.

use super::{Held, Hold, Passage};
use crate::asks::answer_code;
use crate::{PlayerId, Room};
use combat::sight::apart;
use gear::Refusal;
use gear::dive::{Route, Start};
use gear::objectives::{Deed, Feat};
use passage::{Deal, Mission, PieceKind};

/// How near a mouth's middle, and a dead lamp's or the lamp's, a player stands to use it (m).
pub const MOUTH_REACH_M: f64 = 4.0;
pub const HOLD_REACH_M: f64 = 3.0;
/// How long E is held at a dead lamp and at the lamp, ticks (3 s and 2 s), and how far the body may stir meanwhile.
pub const KINDLE_TICKS: u64 = 180;
pub const LAMP_TICKS: u64 = 120;
const HOLD_STIR_M: f64 = 0.3;

/// An ask of the passages.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PassageAsk {
    /// Goes on through the zone's onward mouth by its place.
    GoOn { mouth: u8 },
    /// Begins to kindle a Kindle's dead lamp by its number, E held.
    Kindle { lamp: u8 },
    /// Begins to light the zone's lamp, E held.
    LightLamp,
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

/// A hold's target as the page reads it.
const LAMP_TARGET: u8 = 255;

fn refused(refusal: Refusal) -> u8 {
    answer_code(Err(refusal))
}

impl Room {
    /// Answers an ask of the passages: 0 done, else why not.
    pub(crate) fn ask_passage(&mut self, player: PlayerId, ask: PassageAsk) -> u8 {
        let Some(body) = self.fighter(player).map(|fighter| [fighter.body.x, fighter.body.y]) else {
            return refused(Refusal::NoDive);
        };
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
        let start = Start { island, week, route, mouth, zone: zone.number, depth: zone.depth, lamp };
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
        answer_code(found.character.go_on(here, to, open).map(|_| ()))
    }

    /// Begins a hold of E at a dead lamp or the lamp, within reach of it.
    fn begin_hold(&mut self, player: PlayerId, body: [f64; 2], target: Held) -> u8 {
        let Some(zone) = self.zone() else { return refused(Refusal::NotInPassage) };
        let piece = zone.pieces.iter().find(|piece| match (piece.kind, target) {
            (PieceKind::Kindle(nth), Held::Kindle(wanted)) => nth == wanted,
            (PieceKind::Lamp, Held::Lamp) => true,
            _ => false,
        });
        let Some(piece) = piece else { return refused(Refusal::NoLamp) };
        if apart(body, [piece.at[0], piece.at[1]]) > HOLD_REACH_M {
            return refused(Refusal::NotAtMouth);
        }
        if !self.may_hold(player, target) {
            return refused(Refusal::LampNotLit);
        }
        let (clock, health) = (self.clock, self.fighter(player).map_or(0.0, |fighter| fighter.health));
        if let Some(zone) = self.zone_mut() {
            zone.holds.insert(player, Hold { target, since: clock, at: body, health });
        }
        0
    }

    /// E let go of: the player's hold ends unfinished.
    pub(crate) fn let_go_hold(&mut self, player: PlayerId) {
        if let Some(zone) = self.zone_mut() {
            zone.holds.remove(&player);
        }
    }

    /// Keeps each hold under way: one stirred, hurt, fallen or no longer allowed ends; one held its time lights its
    /// dead lamp, or the lamp for its player, keeping their haul.
    pub(crate) fn keep_holds(&mut self) {
        let Some(zone) = self.zone() else { return };
        let holds: Vec<(PlayerId, Hold)> = zone.holds.iter().map(|(id, hold)| (*id, *hold)).collect();
        let (island, week, number, depth, level) =
            (zone.island, zone.week, zone.zone.number, zone.zone.depth, zone.levels.1);
        for (player, hold) in holds {
            let fighter = self.fighter(player).copied();
            let broken = fighter.is_none_or(|fighter| {
                fighter.dead()
                    || fighter.health < hold.health
                    || apart([fighter.body.x, fighter.body.y], hold.at) > HOLD_STIR_M
            }) || !self.may_hold(player, hold.target);
            let ticks = if hold.target == Held::Lamp { LAMP_TICKS } else { KINDLE_TICKS };
            let done = self.clock >= hold.since + ticks;
            if !(broken || done) {
                continue;
            }
            self.let_go_hold(player);
            if broken {
                continue;
            }
            match hold.target {
                Held::Kindle(nth) => {
                    if let Some(lit) = self.zone_mut().and_then(|zone| zone.round.lit.get_mut(usize::from(nth))) {
                        *lit = true;
                    }
                    if let Some(zone) = self.zone_mut() {
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
                        if let Some(zone) = self.zone_mut() {
                            zone.lit.insert(player);
                        }
                    }
                }
            }
        }
    }

    /// As a player comes into the room with their character: in a zone of their dive, what they find goes into its
    /// haul from now, the depth reached counts, and in a company's zone whose deal is done it is done for them; in any
    /// other room their dive ends, its haul kept if they went home from a lamp, else lost.
    pub(crate) fn passage_arrived(&mut self, player: PlayerId) {
        let here = self.zone().map(|zone| {
            let done = zone.route == Route::Company && zone.round.done_at.is_some();
            (zone.island, zone.week, zone.zone.number, zone.zone.depth, done)
        });
        let Some(found) = self.players.get_mut(&player) else { return };
        let Some(dive) = found.character.passage.as_mut() else { return };
        match here {
            Some((island, week, number, depth, done))
                if dive.island == island && dive.week == week && dive.zone == number =>
            {
                (dive.here, dive.depth) = (true, depth);
                dive.done |= done;
                let clock = self.clock;
                if let Some(zone) = self.zone_mut() {
                    zone.arrived.insert(player, clock);
                }
                self.saw(player, &Feat::Passage(Deed::Deep(depth)));
            }
            _ => {
                let island = dive.island.clone();
                let home = found.character.leave_passages();
                found.gear_changed = true;
                if let Some(mouth) = home {
                    self.stand_before_mouth(player, &island, mouth);
                }
            }
        }
    }

    /// A respawn asked for in a passage zone empties the haul.
    pub(crate) fn lose_haul(&mut self, player: PlayerId) {
        if self.zone().is_none() {
            return;
        }
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
        let since = round.began.map_or(0, |began| self.clock.saturating_sub(began));
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
            let (target, ticks) = match hold.target {
                Held::Kindle(nth) => (nth, KINDLE_TICKS),
                Held::Lamp => (LAMP_TARGET, LAMP_TICKS),
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
            lamp_lit: zone.lit.contains(&player),
            holding,
        })
    }
}
