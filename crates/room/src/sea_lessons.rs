//! The Harbourmaster's sailing lesson at sea: each tick, a captain whose task asks a sailing act is watched as the sea
//! sails their ship (`gear::quests::SailAct`): aboard at sea, under way, turned off a heading, the pace dial moved under
//! way, and the held map raised (the page's word, `charted`); and for the gunnery, a Tithe hulk struck and moored off
//! Overlook's roadstead, which the sea puts into a fight of the captain's own as they come near: a ball of theirs that
//! strikes it is the act. It lays nothing and pays nothing as it goes down, and no one boards it.

use super::Sea;
use crate::PlayerId;
use crate::battle::SeaFight;
use crate::coast::{leg_meets_land, on_land};
use crate::hostiles::Hostile;
use core::f64::consts::{PI, TAU};
use gear::quests::{Event, Goal, Sail, SailAct};
use naval::damage::State;
use naval::fight::{CAPTAIN, End, Event as FightEvent, Sailor};
use naval::ranks::{Commission, GREY_TITHE, Rank};
use std::cell::OnceCell;
use std::collections::BTreeMap;

/// The first number the hulks take among the sea's ships: each captain's is this and their own player's number.
pub const HULK_FROM: u32 = 0xF000_0000;
/// How far out from Overlook's roadstead the hulk lies, metres, nearest first: the first clear water on a bearing
/// whose way from the roadstead meets no land.
const MOORED_OUT_M: [f64; 3] = [1_200.0, 800.0, 500.0];
/// The bearings the hulk's mooring is looked for on, degrees apart, clockwise from north.
const BEARING_STEP_DEG: f64 = 15.0;
/// How near the hulk a captain on its lesson sails before the sea puts it into a fight of theirs, metres.
pub const HULK_NEAR_M: f64 = 900.0;
/// How far from the hulk a captain sails before it leaves their fight, metres.
pub const HULK_LEFT_M: f64 = 1_500.0;
/// How far the captain turns off a heading under way before the step is done, radians.
pub const STEERED_RAD: f64 = PI / 6.0;
/// How near the mooring the tracker's mark is met, metres.
const MOORING_REACH_M: f64 = 60.0;

/// The hulk's number among the sea's ships for a captain, and the captain a number belongs to, if it is a hulk's.
#[must_use]
pub fn hulk_of(player: PlayerId) -> u32 {
    HULK_FROM | player
}

#[must_use]
pub fn hulks_captain(id: u32) -> Option<PlayerId> {
    (id & HULK_FROM == HULK_FROM).then_some(id & !HULK_FROM)
}

/// What the sea keeps for the lesson: each captain's heading and pace as last seen and how far they have turned since
/// the lesson began, and where the hulk lies, found once.
#[derive(Debug, Default)]
pub struct Lessons {
    helmed: BTreeMap<PlayerId, Helmed>,
    mooring: OnceCell<Option<[f64; 2]>>,
}

#[derive(Debug, Clone, Copy)]
struct Helmed {
    heading: f64,
    pace: u16,
    under_way: bool,
    turned: f64,
}

/// The acts of sailing a captain's task asks that are not yet done.
fn asked(character: &gear::Character) -> Vec<SailAct> {
    let sails = character.goals_unmet().filter_map(|(_, goal)| match &goal.goal {
        Goal::Sail(Sail { act }) => Some(*act),
        _ => None,
    });
    sails.collect()
}

/// The turn from one heading to another, the short way round, radians.
fn turn_between(from: f64, to: f64) -> f64 {
    let turn = (to - from).rem_euclid(TAU);
    if turn > PI { TAU - turn } else { turn }
}

impl Sea {
    /// Where the hulk lies: off Overlook's roadstead, on the first bearing from north whose clear water a way from the
    /// roadstead reaches, nearest of its distances first; none where the sea holds no Overlook or no such water.
    #[must_use]
    pub fn mooring(&self) -> Option<[f64; 2]> {
        *self.lessons.mooring.get_or_init(|| {
            let (_, [x, y]) = self.harbour.harbours.ports.iter().find(|(city, _)| city == "overlook")?;
            let from = super::whole(&[*x, *y])?;
            let bearings = (0..(360.0 / BEARING_STEP_DEG) as u32).map(|step| f64::from(step) * BEARING_STEP_DEG);
            MOORED_OUT_M.iter().find_map(|out| {
                bearings.clone().find_map(|bearing| {
                    let (east, north) = (libm::sin(bearing.to_radians()), libm::cos(bearing.to_radians()));
                    let at = [x + east * out, y - north * out];
                    let point = super::whole(&at)?;
                    let clear = !on_land(&self.coasts, point) && !leg_meets_land(&self.coasts, from, point);
                    clear.then_some(at)
                })
            })
        })
    }

    /// Where the tracker marks a captain's lesson: the hulk's mooring and its reach while their task asks a ball in
    /// it; none otherwise.
    #[must_use]
    pub fn lesson_mark(&self, player: PlayerId) -> Option<[f64; 3]> {
        let character = self.harbour.characters.get(&player)?;
        let [x, y] = self.mooring().filter(|_| asked(character).contains(&SailAct::Fire))?;
        Some([x, y, MOORING_REACH_M])
    }

    /// The page's word that the player raised the held map at the helm: told to their task if it asks it.
    pub fn charted(&mut self, player: PlayerId) {
        let asks =
            self.harbour.characters.get(&player).is_some_and(|character| asked(character).contains(&SailAct::Map));
        if asks {
            self.tell_sea(player, &Event::Sail(SailAct::Map));
        }
    }

    /// Each tick: each captain whose task asks a sailing act is watched and told each act done; a hulk is put into a
    /// fight for a captain on its gunnery who comes near it, a ball that strikes it told, and it leaves a fight whose
    /// captain sails off; a captain whose task asks no sailing is forgotten.
    pub(super) fn keep_lessons(&mut self) {
        let mut told: Vec<(PlayerId, SailAct)> = Vec::new();
        let mut near_hulk = Vec::new();
        let mooring = self.mooring();
        for (player, berth) in &self.berths {
            let Some(character) = self.harbour.characters.get(player) else { continue };
            let acts = asked(character);
            if acts.is_empty() {
                self.lessons.helmed.remove(player);
                continue;
            }
            let fighting = self.fights.fighting(*player);
            let ship = berth.sailing.as_ref().map(|sailing| sailing.ship);
            let under_way = ship.is_some_and(|ship| ship.rate > 0) && !fighting;
            let helmed = ship.map(|ship| {
                let was = self.lessons.helmed.get(player).copied();
                let was = was.unwrap_or(Helmed { heading: ship.heading, pace: ship.pace, under_way, turned: 0.0 });
                // Only a turn made under way is steering: a ship putting to sea turns onto its course's first leg.
                let steered = was.under_way && under_way;
                let turned = was.turned + if steered { turn_between(was.heading, ship.heading) } else { 0.0 };
                (was, Helmed { heading: ship.heading, pace: ship.pace, under_way, turned })
            });
            for act in acts {
                let done = match act {
                    SailAct::Board => true,
                    SailAct::Sail => under_way,
                    SailAct::Steer => helmed.is_some_and(|(_, now)| now.turned >= STEERED_RAD),
                    SailAct::Trim => {
                        helmed.is_some_and(|(was, now)| was.under_way && under_way && now.pace != was.pace)
                    }
                    SailAct::Map => false,
                    SailAct::Fire => {
                        let near = ship
                            .zip(mooring)
                            .is_some_and(|(ship, [x, y])| libm::hypot(ship.x - x, ship.y - y) <= HULK_NEAR_M);
                        if near && !fighting {
                            near_hulk.push(*player);
                        }
                        false
                    }
                };
                if done {
                    told.push((*player, act));
                }
            }
            if let Some((_, now)) = helmed {
                self.lessons.helmed.insert(*player, now);
            }
        }
        self.lessons.helmed.retain(|player, _| self.berths.contains_key(player));
        told.extend(self.keep_hulks());
        for player in near_hulk {
            self.moor_hulk(player);
        }
        for (player, act) in told {
            self.tell_sea(player, &Event::Sail(act));
        }
    }

    /// The hulks' fights: each ball that struck a hulk this tick is its captain's act, and a hulk whose captain lies
    /// past `HULK_LEFT_M` of it leaves their fight.
    fn keep_hulks(&mut self) -> Vec<(PlayerId, SailAct)> {
        let mut struck = Vec::new();
        for fought in &mut self.fights.list {
            let Some(player) = hulk_in(fought) else { continue };
            if fought.events.iter().any(|event| matches!(event, FightEvent::Hit { ship, .. } if *ship == CAPTAIN)) {
                struck.push((player, SailAct::Fire));
            }
            let own = fought.crews.get(&player).and_then(|crew| fought.fight.vessel(crew.ship)).map(|it| it.ship);
            let Some(vessel) = fought.fight.ships.get_mut(&CAPTAIN) else { continue };
            let off = own.is_some_and(|own| libm::hypot(own.x - vessel.ship.x, own.y - vessel.ship.y) > HULK_LEFT_M);
            if let Sailor::Captain(command) = &mut vessel.sailor
                && off
                && command.gone.is_none()
            {
                command.gone = Some(End::Gone);
            }
        }
        struck
    }

    /// Puts the hulk into a fight of the captain's own where it is moored: a Grey Tithe Sloop of the lowest rank, its
    /// colours struck and its hull at the share it struck at, hove to, never scuttled; their own ship hove to.
    fn moor_hulk(&mut self, player: PlayerId) {
        let Some([x, y]) = self.mooring() else { return };
        let commission = Commission { faction: GREY_TITHE, rank: Rank::Minor };
        let hostile = Hostile::standing(hulk_of(player), player, commission, [x, y], PI / 2.0, false);
        let time = self.clock as f64 * movement::TICK_SECONDS;
        let Some(own) = super::heave_to((&mut self.berths, &mut self.aboard, &mut self.harbour), player) else {
            return;
        };
        let weather = self.weather.at([x, y], time);
        self.fights.begin_met(own, &hostile, (weather, &self.coasts), time);
        let Some(fought) = self.fights.list.last_mut() else { return };
        let clock = fought.fight.clock;
        let Some(vessel) = fought.fight.ships.get_mut(&CAPTAIN) else { return };
        (vessel.ship.rung, vessel.ship.ahead, vessel.ship.abeam, vessel.ship.sail_way) = (0, 0.0, 0.0, 0.0);
        vessel.damage.state = State::Struck;
        vessel.damage.hull = vessel.damage.max_hull * vessel.damage.struck_at;
        if let Sailor::Captain(command) = &mut vessel.sailor {
            (command.struck_at, command.boarded) = (Some(clock), true);
        }
    }
}

/// The captain a fight's hulk is moored for, if it holds one.
#[must_use]
pub fn hulk_in(fought: &SeaFight) -> Option<PlayerId> {
    fought.hostiles.get(&CAPTAIN).and_then(|hostile| hulks_captain(hostile.id))
}

#[cfg(test)]
#[path = "sea_lessons_tests.rs"]
mod tests;
