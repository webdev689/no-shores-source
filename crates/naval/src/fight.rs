//! A fight at sea: players' Sloops and captains' Sloops of each faction, the balls between them, and the harm they
//! do, stepped together a tick at a time. Each player orders her own helm, a lay (the look's bearing off her bow and
//! its range), the fire, the brace and the load; each captain decides for herself whom she fights, a player or a
//! captain of another faction. A ball strikes only a ship under another flag. One seeded stream decides every chance,
//! in a fixed order, so a fight is the same on every machine.

use crate::arms::{LARGE_BOAT, SLOOP_ARMS, Side, posed};
use crate::ballistics::Ball;
use crate::captain::odds::Power;
use crate::captain::{Captain, Her, Sighting};
use crate::damage::{Damage, SINK_CLEAR_M, SINK_LIST_DEG, SINK_PITCH_DEG, State, WRECKED_OARS, way_share_of};
use crate::gunnery::Guns;
use crate::guns::Shot;
use crate::random::Mulberry32;
use crate::ranks::Commission;
use crate::shots::{Flag, ShipId, ShotEvent};
use sailing::pose::{Pose, pose_of, shallower};
use sailing::ship::{Helm, Pull, SAILS_SET, Ship, step_pulled};
use sailing::waters::Waters;
use sailing::{SLOOP, TICK_SECONDS};
use std::collections::BTreeMap;
use std::f64::consts::TAU;

/// The numbers a one-captain fight gives its two ships (`Fight::begin`).
pub const PLAYER: ShipId = 0;
pub const CAPTAIN: ShipId = 1;
/// A captain is put to sea this far from the ship she is called to (metres), and leaves the fight once every player's
/// ship is past this, unless fighting.
pub const SPAWN_RING: [f64; 2] = [650.0, 1000.0];
pub const SPAWN_TRIES: u32 = 10;
pub const DESPAWN_BEYOND: f64 = 1900.0;
/// No mending with a hostile ship nearer than this (metres).
pub const HOSTILE_NEAR_M: f64 = 700.0;
/// The rest of the volley that made a ship strike, this long after (seconds), cannot sink her.
pub const STRUCK_GRACE_S: f64 = 2.0;
/// How much faster every ship sails and rows in a sea fight than at sea: half again, the owner's call.
pub const FIGHT_PACE: f64 = 1.5;

/// A ship in the fight: her helm's numbers, how she lies, her hurts and her guns, and who sails her.
#[derive(Debug, Clone, PartialEq)]
pub struct Vessel {
    pub ship: Ship,
    pub pose: Pose,
    pub damage: Damage,
    pub guns: Guns,
    pub sailor: Sailor,
}

/// Who sails a ship: a player, by her orders; or a captain, by her own lights.
#[derive(Debug, Clone, PartialEq)]
pub enum Sailor {
    Player,
    Captain(Box<Command>),
}

/// A captain in command: her mind, how deep she settles going down, when she struck, and how she left the fight.
#[derive(Debug, Clone, PartialEq)]
pub struct Command {
    pub her: Captain,
    pub under: f64,
    pub struck_at: Option<f64>,
    pub gone: Option<End>,
}

impl Vessel {
    #[must_use]
    pub fn flag(&self) -> Flag {
        match &self.sailor {
            Sailor::Player => Flag::Player,
            Sailor::Captain(command) => Flag::Faction(command.her.commission.faction),
        }
    }

    /// Her command, if a captain sails her.
    #[must_use]
    pub fn command(&self) -> Option<&Command> {
        match &self.sailor {
            Sailor::Player => None,
            Sailor::Captain(command) => Some(command),
        }
    }

    /// Whether she is still in the fight: a captain who has sunk or sailed off is not.
    #[must_use]
    pub fn in_fight(&self) -> bool {
        self.command().is_none_or(|command| command.gone.is_none())
    }
}

/// The player's lay: the look's bearing off her bow (degrees, to starboard), how far out it meets the water, and
/// its ray (the aim eye, then the way it looks; any length), if given.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Aim {
    pub bearing_deg: f64,
    pub range_m: f64,
    pub ray: Option<[[f64; 3]; 2]>,
}

/// What a player orders for a tick: her helm, the lay she holds, whether she fires it (a release: one tick), her
/// brace held, and a load to take (a press).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Orders {
    pub helm: Helm,
    pub aim: Option<Aim>,
    pub fire: bool,
    pub brace: bool,
    pub load: Option<Shot>,
}

/// Why a player's guns did not fire.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Refusal {
    NoGuns,
    Silent,
    Braced,
    Reloading { side: Side, left: f64 },
}

/// What happened in a tick, for the browser to show; each names the ship it happened to.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Event {
    Shot(ShotEvent),
    RunOut {
        ship: ShipId,
        side: Side,
    },
    State {
        ship: ShipId,
        state: State,
    },
    Refused {
        ship: ShipId,
        refusal: Refusal,
    },
    /// A player's sails would not set: her rigging is shot away, or she is a wreck.
    NoSail {
        ship: ShipId,
        wrecked: bool,
    },
    Load {
        ship: ShipId,
        shot: Shot,
    },
    /// A captain left the fight.
    Gone {
        ship: ShipId,
        end: End,
    },
    /// A player's stem rammed a ship (`ship`, rammed `by`): where it struck, and the hull it took from her.
    Ram {
        ship: ShipId,
        by: ShipId,
        point: [f64; 3],
        dealt: f64,
    },
}

/// How a captain left the fight.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum End {
    Sunk,
    Gone,
}

/// The fight: its clock (seconds), its stream of chances, its ships by number, the balls aloft, each player's
/// stem as the ram's law keeps it, and whether it is an ambush (`Fight::ambush`), which keeps rules of its own.
#[derive(Debug, Clone, PartialEq)]
pub struct Fight {
    pub clock: f64,
    draws: Mulberry32,
    pub ships: BTreeMap<ShipId, Vessel>,
    pub balls: Vec<Ball>,
    stems: BTreeMap<ShipId, ram::Stem>,
    ambush: bool,
}

/// What a player's hurts leave her helm: whether she is a wreck, the canvas she has left, and the share of her way it
/// leaves her.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Hurts {
    pub wrecked: bool,
    pub sail: f64,
    pub way_share: f64,
}

impl Hurts {
    #[must_use]
    pub fn of(damage: &Damage) -> Self {
        Self { wrecked: damage.state == State::Wrecked, sail: damage.sail, way_share: damage.way_share() }
    }

    /// Her hurts from her numbers as a snapshot gives them.
    #[must_use]
    pub fn from_numbers(wrecked: bool, sail: f64, max_sail: f64) -> Self {
        Self { wrecked, sail, way_share: way_share_of(sail, max_sail) }
    }
}

/// A player's ship stepped a tick by her helm, as her hurts let her: no sail sets on a wreck or with her rigging shot
/// away, and her sails' and oars' pull is held back. Answers her and, when her helm climbed for sail it could not set,
/// whether that was for her being a wreck.
#[must_use]
pub fn sail_hurt(
    ship: &Ship,
    helm: Helm,
    hurts: Hurts,
    waters: &impl Waters,
    wind: [f64; 2],
    time: f64,
) -> (Ship, Option<bool>) {
    let mut helm = helm;
    let mut refused = None;
    if (hurts.wrecked || hurts.sail <= 0.0) && ship.rung.saturating_add(helm.climb) >= SAILS_SET {
        if helm.climb > 0 {
            refused = Some(hurts.wrecked);
        }
        helm.climb = if ship.rung >= SAILS_SET { -1 } else { 0 };
    }
    let pull = Pull {
        sail: if hurts.wrecked { 0.0 } else { hurts.way_share * FIGHT_PACE },
        oars: if hurts.wrecked { WRECKED_OARS } else { 1.0 } * FIGHT_PACE,
    };
    (step_pulled(ship, &helm, &SLOOP, wind, waters, time, TICK_SECONDS, pull), refused)
}

/// Whether water at a point is deep enough to float a Sloop.
fn floats(waters: &impl Waters, x: f64, y: f64, time: f64) -> bool {
    !shallower(&waters.at(x, y, time), SLOOP.draught_m)
}

/// How deep she settles for her highest point to end `SINK_CLEAR_M` under at her last list and trim.
fn sink_depth(seed: u32) -> f64 {
    let arms = &SLOOP_ARMS;
    let ship = Ship { x: 0.0, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
    let side = if seed & 1 == 1 { 1.0 } else { -1.0 };
    let end = if seed & 2 == 2 { -1.0 } else { 1.0 };
    let last = Pose {
        heave: 0.0,
        pitch: (end * SINK_PITCH_DEG).to_radians(),
        roll: (side * SINK_LIST_DEG).to_radians(),
        aground: false,
    };
    let boxes = std::iter::once(&arms.hull).chain(arms.sails.iter());
    let corners = boxes.flat_map(|[low, high]| {
        (0..8).map(move |at| {
            [
                if at & 1 == 0 { low[0] } else { high[0] },
                if at & 2 == 0 { low[1] } else { high[1] },
                if at & 4 == 0 { low[2] } else { high[2] },
            ]
        })
    });
    corners.map(|corner| posed(&ship, &last, corner)[2]).fold(0.0, f64::max) + SINK_CLEAR_M
}

pub(crate) fn carry_of(ship: &Ship) -> [f64; 3] {
    let way = crate::captain::course::velocity_of(ship);
    [way[0], way[1], 0.0]
}

fn sighting_of(id: ShipId, vessel: &Vessel) -> Sighting {
    let damage = &vessel.damage;
    let power = match vessel.command() {
        None => Power::player(&LARGE_BOAT, damage.hull_share()),
        Some(command) => command.her.power(damage),
    };
    Sighting {
        id,
        ship: vessel.ship,
        level: vessel.pose.heave,
        hull_share: damage.hull_share(),
        wrecked: damage.state == State::Wrecked,
        power,
    }
}

/// A captain's ship as she works it, in the wind, from its parts: her command is borrowed apart from them.
fn her_of<'vessel>(
    (ship, pose): (&'vessel Ship, &'vessel Pose),
    (damage, guns): (&'vessel Damage, &'vessel Guns),
    wind: [f64; 2],
) -> Her<'vessel> {
    Her { ship, pose, damage, guns, arms: &SLOOP_ARMS, hull: &SLOOP, wind }
}

impl Fight {
    /// An empty fight whose every chance is drawn from `seed`.
    #[must_use]
    pub fn new(seed: u32) -> Self {
        let ships = BTreeMap::new();
        let stems = BTreeMap::new();
        Self { clock: 0.0, draws: Mulberry32::new(seed), ships, balls: Vec::new(), stems, ambush: false }
    }

    /// A player's Sloop and one captain's, a Major of the pirates, put to sea on the ring round her, where the water
    /// floats her, heading across the player's waters on a slant: `PLAYER` and `CAPTAIN`.
    pub fn begin(ship: Ship, seed: u32, waters: &impl Waters, time: f64) -> Result<Fight, String> {
        let mut fight = Fight::new(seed);
        fight.put_to_sea(PLAYER, ship, waters, time);
        fight.call_captain(CAPTAIN, &ship, Commission::default(), waters, time)?;
        Ok(fight)
    }

    /// A player's Sloop, sound, put to sea as `ship` under number `id`.
    pub fn put_to_sea(&mut self, id: ShipId, ship: Ship, waters: &impl Waters, time: f64) {
        let pose = pose_of(&ship, &SLOOP, waters, time);
        let damage = Damage::new(&LARGE_BOAT, true);
        self.ships.insert(id, Vessel { ship, pose, damage, guns: Guns::new(), sailor: Sailor::Player });
    }

    /// A captain of `commission` under number `id` put to sea on the ring round `near`, where the water floats her,
    /// heading across its waters on a slant; or why none comes.
    pub fn call_captain(
        &mut self,
        id: ShipId,
        near: &Ship,
        commission: Commission,
        waters: &impl Waters,
        time: f64,
    ) -> Result<(), String> {
        let draws = &mut self.draws;
        for _ in 0..SPAWN_TRIES {
            let bearing = draws.draw() * TAU;
            let out = draws.between(SPAWN_RING[0], SPAWN_RING[1]);
            let (x, y) = (near.x + libm::sin(bearing) * out, near.y - libm::cos(bearing) * out);
            let at = Ship { x, y, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
            if pose_of(&at, &SLOOP, waters, time).aground {
                continue;
            }
            let to_near = crate::captain::course::heading_to([x, y], [near.x, near.y]);
            let slant = if draws.draw() < 0.5 { 1.0 } else { -1.0 } * (0.6 + draws.draw() * 0.9);
            let heading = (to_near + slant).rem_euclid(TAU);
            let heading = if heading < TAU { heading } else { 0.0 };
            let her_seed = draws.seed();
            self.enlist(id, Ship { heading, ..at }, commission, her_seed, waters, time);
            return Ok(());
        }
        Err("There is no open water for a captain near the Sloop.".into())
    }

    /// A fight between the player's Sloop and a captain of `commission` already at sea: hers at `captain`, cruising on
    /// its heading, her temper and every chance of the fight drawn from her `seed`.
    pub fn meet(
        ship: Ship,
        captain: Ship,
        commission: Commission,
        seed: u32,
        waters: &impl Waters,
        time: f64,
    ) -> Fight {
        let mut fight = Fight::new(seed);
        fight.put_to_sea(PLAYER, ship, waters, time);
        fight.enlist(CAPTAIN, captain, commission, seed, waters, time);
        fight
    }

    /// A fight among captains already at sea, with no player in it: each of `captains` (her Sloop cruising on its
    /// heading, her commission and her seed) under a number from `CAPTAIN` on, in turn, and every chance of the fight
    /// drawn from the first one's seed.
    pub fn among(captains: &[(Ship, Commission, u32)], waters: &impl Waters, time: f64) -> Fight {
        let mut fight = Fight::new(captains.first().map_or(0, |&(_, _, seed)| seed));
        for (&(ship, commission, seed), id) in captains.iter().zip(CAPTAIN..) {
            fight.enlist(id, ship, commission, seed, waters, time);
        }
        fight
    }

    /// The player's Sloop, as `put_to_sea` puts her, set upon by `captains` (each where and how she is given, under a
    /// number from `CAPTAIN` on, her temper drawn from her own seed), and every chance of the fight drawn from `seed`.
    /// Each comes to fight her at once: bold, whatever her temper, and cruising straight for her when out of sight.
    /// A captain set where the water does not float her is refused: aground, she could never close nor sink.
    /// An ambush is fought to the end: no captain sails off, the player's ship is never wrecked (a ball or a fire
    /// leaves her a point of hull), and it is over once every captain is beaten (`Fight::beaten`).
    pub fn ambush(
        ship: Ship,
        captains: &[(Ship, Commission, u32)],
        seed: u32,
        waters: &impl Waters,
        time: f64,
    ) -> Result<Fight, String> {
        let mut fight = Fight { ambush: true, ..Fight::new(seed) };
        fight.put_to_sea(PLAYER, ship, waters, time);
        if let Some(player) = fight.ships.get_mut(&PLAYER) {
            player.damage.least_hull = 1.0;
        }
        for (&(captain, commission, her_seed), id) in captains.iter().zip(CAPTAIN..) {
            if pose_of(&captain, &SLOOP, waters, time).aground {
                return Err(format!("Captain {id} is set where the water does not float her."));
            }
            fight.enlist(id, captain, commission, her_seed, waters, time);
            if let Some(Sailor::Captain(command)) = fight.ships.get_mut(&id).map(|vessel| &mut vessel.sailor) {
                command.her.temper = crate::captain::Temper::Bold;
                let toward = crate::captain::course::heading_to([captain.x, captain.y], [ship.x, ship.y]);
                command.her.cruise = toward.rem_euclid(TAU);
            }
        }
        Ok(fight)
    }

    /// A captain of `commission` under number `id` in her Sloop at `ship`, cruising on its heading, her temper drawn
    /// from `seed`, her hull as strong as her rank makes it and striking where her rank strikes.
    fn enlist(&mut self, id: ShipId, ship: Ship, commission: Commission, seed: u32, waters: &impl Waters, time: f64) {
        let her = Captain::new(commission, seed, ship.heading, &SLOOP_ARMS);
        let damage = commission.damage();
        let command = Command { her, under: sink_depth(seed), struck_at: None, gone: None };
        let vessel = Vessel {
            pose: pose_of(&ship, &SLOOP, waters, time),
            ship,
            damage,
            guns: Guns::new(),
            sailor: Sailor::Captain(Box::new(command)),
        };
        self.ships.insert(id, vessel);
    }

    /// A ship leaves the fight: the captains forget her; balls she fired fly on.
    pub fn leave(&mut self, id: ShipId) {
        self.ships.remove(&id);
        self.stems.remove(&id);
        for vessel in self.ships.values_mut() {
            if let Sailor::Captain(command) = &mut vessel.sailor {
                command.her.forget(id);
            }
        }
    }

    #[must_use]
    pub fn vessel(&self, id: ShipId) -> Option<&Vessel> {
        self.ships.get(&id)
    }

    /// How the fight ended, once it has had captains and every one has left it: the last one's way out.
    #[must_use]
    pub fn over(&self) -> Option<End> {
        let mut last = None;
        for command in self.ships.values().filter_map(Vessel::command) {
            last = Some(command.gone?);
        }
        last
    }

    /// Whether an ambush is won: it had captains and every one is beaten, sunk, going down or struck (her crew have
    /// given up the fight). Any other fight is never beaten: it is over only once its captains have left it.
    #[must_use]
    pub fn beaten(&self) -> bool {
        let beaten = |vessel: &Vessel| matches!(vessel.damage.state, State::Struck | State::Sinking | State::Sunk);
        let mut captains = self.ships.values().filter(|vessel| vessel.command().is_some()).peekable();
        self.ambush && captains.peek().is_some() && captains.all(beaten)
    }

    /// Every number the fight holds, in a fixed order: what its fingerprint is taken over.
    #[must_use]
    pub fn numbers(&self) -> Vec<f64> {
        let flag = |on: bool| f64::from(u8::from(on));
        let mut numbers = vec![self.clock, f64::from(self.draws.state())];
        for (id, vessel) in &self.ships {
            numbers.push(f64::from(*id));
            numbers.extend(vessel.ship.to_floats());
            numbers.extend(vessel.pose.to_floats());
            numbers.extend(vessel.damage.numbers());
            numbers.extend(vessel.guns.numbers());
            let Some(command) = vessel.command() else {
                numbers.push(-1.0);
                continue;
            };
            let gone = match command.gone {
                None => 0.0,
                Some(End::Sunk) => 1.0,
                Some(End::Gone) => 2.0,
            };
            numbers.extend([command.struck_at.unwrap_or(-1.0), vessel.damage.struck_at, command.under, gone]);
            numbers.extend(command.her.numbers());
        }
        for ball in &self.balls {
            numbers.extend(ball.start.into_iter().chain(ball.launch));
            numbers.extend([ball.born, f64::from(ball.shooter), ball.flown, flag(ball.fired)]);
            numbers.push(flag(ball.flag != Flag::Player));
            numbers.push(ball.rigged.len() as f64);
            numbers.extend(ball.rigged.iter().map(|ship| f64::from(*ship)));
        }
        for (id, stem) in &self.stems {
            numbers.push(f64::from(*id));
            numbers.extend(stem.numbers());
        }
        numbers
    }

    /// The ships of one kind still in the fight, by number: the captains', or the players'.
    fn ids(&self, captains: bool) -> Vec<ShipId> {
        let wanted = |vessel: &Vessel| vessel.in_fight() && vessel.command().is_some() == captains;
        self.ships.iter().filter(|(_, vessel)| wanted(vessel)).map(|(id, _)| *id).collect()
    }

    /// Every ship the captain `of` may fight, by number, as she sees her: each player's, and each captain's of another
    /// faction still in the fight and afloat. A captain who has struck is no one's enemy.
    fn sightings(&self, of: ShipId) -> Vec<Sighting> {
        let Some(own) = self.ships.get(&of).map(Vessel::flag) else { return Vec::new() };
        let foe = |vessel: &Vessel| {
            vessel.flag() != own && vessel.command().is_none_or(|_| vessel.in_fight() && vessel.damage.fighting())
        };
        let foes = self.ships.iter().filter(|(_, vessel)| foe(vessel));
        foes.map(|(id, vessel)| sighting_of(*id, vessel)).collect()
    }

    /// Every hull in the fight but `except`'s: where it is and its way, for a captain to keep clear of.
    fn traffic(&self, except: ShipId) -> Vec<crate::captain::course::Traffic> {
        let others = self.ships.iter().filter(|(id, vessel)| **id != except && vessel.in_fight());
        others
            .map(|(_, vessel)| ([vessel.ship.x, vessel.ship.y], crate::captain::course::velocity_of(&vessel.ship)))
            .collect()
    }
}

#[path = "fight_ram.rs"]
mod ram;
#[path = "fight_step.rs"]
mod step;

#[cfg(test)]
#[path = "fight_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "fight_fleet_tests.rs"]
mod fleet_tests;

#[cfg(test)]
#[path = "fight_ram_tests.rs"]
mod ram_tests;

#[cfg(test)]
#[path = "fight_factions_tests.rs"]
mod faction_tests;

#[cfg(test)]
#[path = "fight_ambush_tests.rs"]
mod ambush_tests;
