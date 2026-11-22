//! Officers ashore as companions, as DFO's crewCompanions.js and crewAshore.js had them: each officer a player sends
//! ashore (two at most) stands beside them in a land room, a fighter on the players' side thinking with a foe's own
//! brain, its post moved each tick to their place behind their leader. They fight by gear's power as a player matched
//! to their level would, with their perks; a kill they had a hand in their leader shares, and its XP pays the officers
//! ashore. They are knocked out, never killed, and rest before coming ashore again. A boarded deck has none.

use crate::{Floor, PlayerId, Room, Standing};
use ::foes::{Rank, foe_type};
use combat::Fighter;
use combat::fighter::{Action, FighterId, Side};
use core::f64::consts::FRAC_PI_2;
use gear::crew::{ASHORE_MOST, Duty, Officer, Post};
use gear::power::{ATTACK_PER_LEVEL, DEFENSE_PER_LEVEL};
use movement::Mode;
use movement::blocks::ground_at;
use std::collections::BTreeMap;

/// How far behind their leader companions stand, and how far either side of that when two are ashore, metres.
const BEHIND: f64 = 1.8;
const ASIDE: f64 = 1.1;
/// How near their place the first and the second stop walking back to it, metres.
const HEELS: [f64; ASHORE_MOST] = [2.5, 3.7];
/// One this far from their leader, or this far below them while the leader stands on the ground, is put back at
/// their place: they have strayed or fallen where no walk brings them back.
const STRAYED: f64 = 40.0;
const FALLEN: f64 = 6.0;
/// How long one knocked out rests before coming ashore again: eight minutes of room time, in ticks, and of the clock,
/// kept with the officer so a return to any room keeps it.
pub(crate) const KNOCKED_OUT_TICKS: u64 = 8 * 60 * 60;
pub(crate) const KNOCKED_OUT_MINUTES: u64 = 8;
/// The deck roster's type a hand who boards fights as: a swordsman.
pub(crate) const HAND_TYPE: u8 = 14;
/// What their perks add: Weathered to their health, Brawler to their blows' harm, Steady Nerve to their poise.
const WEATHERED: f64 = 1.15;
const BRAWLER: f64 = 1.1;
const STEADY_NERVE: f64 = 1.2;
/// A matched player's Defense is armour of their level a little above it, so a foe of their level never reaches past
/// it; their Attack is a weapon of their level.
const DEFENSE_OVER: f64 = 1.15;

/// A companion standing in the room: their leader, their officer's number, post and names' places in
/// `content/gear/crew.json`, their level, whether Brawler is theirs, and whether they were knocked out this tick.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Companion {
    pub leader: PlayerId,
    pub officer: u32,
    pub post: Post,
    pub given: u8,
    pub family: u8,
    pub level: u8,
    pub brawler: bool,
    pub out: bool,
}

/// The companions standing, by fighter, and when each officer knocked out (by leader and number) may stand again.
#[derive(Clone, Debug, Default)]
pub(crate) struct Ashore {
    pub standing: BTreeMap<FighterId, Companion>,
    pub resting: BTreeMap<(PlayerId, u32), u64>,
    /// A boarded deck's hands who came over its rail with their player, by fighter (`boarding_hands.rs`).
    pub hands: BTreeMap<FighterId, crate::boarding_hands::Hand>,
    /// How many of each player's hands have fallen on this deck.
    pub fallen: BTreeMap<PlayerId, u8>,
}

/// The type in the pirates' deck roster each post fights as, in its clothes: the First Mate a swordsman, the Gunner
/// and the Lookout archers, the Bosun a brute, the Carpenter a skirmisher.
#[must_use]
pub fn type_of(post: Post) -> u8 {
    match post {
        Post::FirstMate => 14,
        Post::Gunner | Post::Lookout => 16,
        Post::Bosun => 15,
        Post::Carpenter => 13,
    }
}

/// Where the `place`th of `count` companions stands behind a leader: BEHIND back along the way they look (a body standing
/// still keeps the way it last walked), and with two, ASIDE to the left for the first and to the right for the second.
fn place_behind(leader: &Fighter, place: usize, count: usize) -> [f64; 3] {
    let body = &leader.body;
    let aside = if count < 2 {
        0.0
    } else if place == 0 {
        -ASIDE
    } else {
        ASIDE
    };
    let (sin, cos) = (libm::sin(leader.aim), libm::cos(leader.aim));
    let (right_sin, right_cos) = (libm::sin(leader.aim + FRAC_PI_2), libm::cos(leader.aim + FRAC_PI_2));
    let x = body.x - sin * BEHIND + right_sin * aside;
    let y = body.y + cos * BEHIND - right_cos * aside;
    [x, y, body.z]
}

impl Room {
    /// Each tick before the foes think: companions whose leader left, whose officer is no longer ashore or who were
    /// knocked out go (the last to rest); each officer ashore with a player standing in a land room who is not resting
    /// stands at their place; and every companion's post moves to their place, one strayed put back there.
    pub(crate) fn keep_companions(&mut self) {
        let clock = self.clock;
        let deck = matches!(self.floor, Floor::Deck(_));
        let gone: Vec<(FighterId, Companion)> = self
            .ashore
            .standing
            .iter()
            .filter(|(_, companion)| deck || companion.out || !self.still_ashore(companion))
            .map(|(id, companion)| (*id, *companion))
            .collect();
        for (id, companion) in gone {
            self.ashore.standing.remove(&id);
            if companion.out {
                self.ashore.resting.insert((companion.leader, companion.officer), clock + KNOCKED_OUT_TICKS);
                let until = self.minute + KNOCKED_OUT_MINUTES;
                if let Some(found) = self.players.get_mut(&companion.leader)
                    && let Some(officer) = found.character.crew.officers.get_mut(&companion.officer)
                {
                    officer.resting_until = until;
                    found.gear_changed = true;
                }
            }
            self.foes.remove(&id);
            self.board.forget(id);
            self.ways.remove(&id);
        }
        self.ashore.resting.retain(|_, until| *until > clock);
        if deck {
            self.keep_hands();
            return;
        }
        let leaders: Vec<PlayerId> = self.players.keys().copied().collect();
        for leader in leaders {
            let Some(found) = self.players.get(&leader) else { continue };
            let standing = !found.fighter.dead() && !matches!(found.standing, Standing::Dead { .. });
            let officers: Vec<Officer> = found.character.crew.ashore().take(ASHORE_MOST).cloned().collect();
            let count = officers.len();
            for (place, officer) in officers.iter().enumerate() {
                let id = self.companion_of(leader, officer.id);
                let rested = officer.resting_until <= self.minute;
                if id.is_none() && standing && rested && !self.ashore.resting.contains_key(&(leader, officer.id)) {
                    self.stand_companion(leader, place, count, officer);
                } else if let Some(id) = id {
                    self.heel(id, leader, place, count, officer.level());
                }
            }
        }
    }

    /// Whether a companion's leader is still in the room with their officer ashore.
    fn still_ashore(&self, companion: &Companion) -> bool {
        let officer =
            self.players.get(&companion.leader).and_then(|found| found.character.crew.officers.get(&companion.officer));
        officer.is_some_and(|officer| officer.duty == Duty::Ashore)
    }

    fn companion_of(&self, leader: PlayerId, officer: u32) -> Option<FighterId> {
        let mut standing = self.ashore.standing.iter();
        standing.find(|(_, companion)| companion.leader == leader && companion.officer == officer).map(|(id, _)| *id)
    }

    /// An officer stands as a companion at their place behind their leader, facing the way the leader looks: their post's
    /// type at Major, at the officer's level, with their perks.
    fn stand_companion(&mut self, leader: PlayerId, place: usize, count: usize, officer: &Officer) {
        let (Some(at), Some(foe_type)) = (self.fighter(leader).copied(), foe_type(type_of(officer.post))) else {
            return;
        };
        let wanted = place_behind(&at, place, count);
        let spot = self.mesh_at(wanted).nearest_point(wanted).unwrap_or(wanted);
        let id = self.stand_foe(foe_type, Rank::Major, spot, at.aim, Some(leader));
        let has = |id: &str| officer.active_traits().any(|own| own == id);
        let (weathered, brawler, steady) = (has("weathered"), has("brawler"), has("steady_nerve"));
        let level = officer.level();
        let Some(foe) = self.foes.get_mut(&id) else { return };
        let fighter = &mut foe.fighter;
        fighter.side = Side::Players;
        if weathered {
            fighter.health *= WEATHERED;
            fighter.health_max *= WEATHERED;
        }
        if steady {
            fighter.poise_max *= STEADY_NERVE;
        }
        foe.level = level;
        foe.brain.heels(HEELS[place.min(ASHORE_MOST - 1)]);
        foe.brain.posted_at(spot, at.aim);
        let (given, family) = (officer.given, officer.family);
        let companion =
            Companion { leader, officer: officer.id, post: officer.post, given, family, level, brawler, out: false };
        self.ashore.standing.insert(id, companion);
    }

    /// A companion's post moves to their place behind their leader, and their level keeps the officer's as kills raise
    /// it; one who strayed STRAYED from the leader, or fell FALLEN below a leader on the ground, is stood there at once.
    fn heel(&mut self, id: FighterId, leader: PlayerId, place: usize, count: usize, level: u8) {
        if let Some(companion) = self.ashore.standing.get_mut(&id) {
            companion.level = level;
        }
        let Some(at) = self.fighter(leader).copied() else { return };
        let wanted = place_behind(&at, place, count);
        let spot = self.mesh_at(wanted).nearest_point(wanted).unwrap_or(wanted);
        let (blocks, floor) = (&self.blocks, &self.floor);
        let Some(foe) = self.foes.get_mut(&id) else { return };
        foe.level = level;
        foe.brain.posted_at(spot, at.aim);
        let body = foe.fighter.body;
        let strayed = combat::sight::apart([body.x, body.y], [at.body.x, at.body.y]) > STRAYED;
        let fallen = at.body.mode == Mode::Ground && body.z < at.body.z - FALLEN;
        if strayed || fallen {
            let mut stood = movement::standing(spot[0], spot[1]);
            stood.facing = at.aim;
            stood.z = ground_at(blocks, floor, spot[0], spot[1], spot[2]);
            foe.fighter.body = stood;
            self.ways.remove(&id);
        }
    }

    /// A companion is knocked out, never killed: a blow that would leave them at 1 health or less holds them at 1, and
    /// they leave the fight at the next tick.
    pub(crate) fn held_up(&mut self, id: FighterId, after: Fighter) -> Fighter {
        let Some(companion) = self.ashore.standing.get_mut(&id) else { return after };
        if after.health > 1.0 {
            return after;
        }
        companion.out = true;
        let action = if after.dead() { Action::Idle } else { after.action };
        Fighter { health: 1.0, action, ..after }
    }

    /// What a blow between a companion and a foe is times, by gear's power as a player matched to the companion's
    /// level would strike and be struck: a weapon of their level's Attack, Brawler's harm on top, and armour a little
    /// above their level's Defense. None for any other blow.
    pub(crate) fn companion_times(&self, striker: FighterId, defender: FighterId) -> Option<f64> {
        let level_of = |id: FighterId| self.foes.get(&id).map(|foe| foe.level);
        if let Some(hand) = self.ashore.hands.get(&striker) {
            let attack = (ATTACK_PER_LEVEL * f64::from(hand.level)) as u32;
            return Some(gear::power::by_player(attack, hand.level, level_of(defender)?));
        }
        if let Some(hand) = self.ashore.hands.get(&defender) {
            let defense = (DEFENSE_PER_LEVEL * DEFENSE_OVER * f64::from(hand.level)) as u32;
            return Some(gear::power::on_player(defense, hand.level, level_of(striker)?));
        }
        if let Some(companion) = self.ashore.standing.get(&striker) {
            let attack = (ATTACK_PER_LEVEL * f64::from(companion.level)) as u32;
            let brawler = if companion.brawler { BRAWLER } else { 1.0 };
            return Some(gear::power::by_player(attack, companion.level, level_of(defender)?) * brawler);
        }
        let companion = self.ashore.standing.get(&defender)?;
        let defense = (DEFENSE_PER_LEVEL * DEFENSE_OVER * f64::from(companion.level)) as u32;
        Some(gear::power::on_player(defense, companion.level, level_of(striker)?))
    }

    /// Whom a blow's kill is shared by, and by which of their loadouts: a player's own blow by the loadout it came
    /// from, a companion's by their leader as the leader strikes now.
    pub(crate) fn credited(&self, striker: FighterId, hand: Option<gear::Slot>) -> Option<(PlayerId, gear::Slot)> {
        let leader = self.ashore.standing.get(&striker).map(|companion| companion.leader);
        match leader.or_else(|| self.ashore.hands.get(&striker).map(|boarded| boarded.leader)) {
            Some(leader) => Some((leader, self.striking(leader))),
            None => hand.map(|hand| (striker, hand)),
        }
    }

    /// Whether a fighter is on the players' side by a player's leave: a companion, or a hand who boarded with them.
    pub(crate) fn is_companion(&self, id: FighterId) -> bool {
        self.ashore.standing.contains_key(&id) || self.ashore.hands.contains_key(&id)
    }

    /// Whether a fighter fights for the players: a player, or one at a player's leave.
    pub(crate) fn on_players_side(&self, id: FighterId) -> bool {
        self.players.contains_key(&id) || self.is_companion(id)
    }

    /// The companion a fighter is, if one.
    pub(crate) fn companion(&self, id: FighterId) -> Option<Companion> {
        self.ashore.standing.get(&id).copied()
    }
}

#[cfg(test)]
#[path = "companion_tests.rs"]
mod tests;
