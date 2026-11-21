//! A fight at sea: players' Sloops and captains of each faction in their ranks' hulls, the balls between them, and the
//! harm they do, stepped together a tick at a time. Each player orders their own helm, a lay (the look's bearing off
//! their bow and its range), the fire, the brace and the load; each captain decides for itself whom it fights, a player
//! or a captain of another faction. A ball strikes only a ship under another flag. One seeded stream decides every
//! chance, in a fixed order, so a fight is the same on every machine.

use crate::arms::{Arms, LARGE_BOAT, arms_of, posed};
use crate::ballistics::Ball;
use crate::boost::Boost;
use crate::captain::odds::Power;
use crate::captain::{Captain, Own, Sighting};
use crate::damage::{Damage, SINK_CLEAR_M, SINK_LIST_DEG, SINK_PITCH_DEG, State, WRECKED_OARS, way_share_of};
use crate::gunnery::Guns;
use crate::guns::Shot;
use crate::random::Mulberry32;
use crate::ranks::Commission;
use crate::rigging::Rigging;
use crate::shots::{Flag, ShipId};
use sailing::pose::{Pose, pose_of, shallower};
use sailing::ship::{Helm, Pull, SAILS_SET, Ship, step_pulled};
use sailing::waters::Waters;
use sailing::{Hull, HullKind, TICK_SECONDS};
use std::collections::BTreeMap;
use std::f64::consts::TAU;

/// The numbers a one-captain fight gives its two ships (`Fight::begin`).
pub const PLAYER: ShipId = 0;
pub const CAPTAIN: ShipId = 1;
/// A captain is put to sea this far from the ship it is called to (metres), and leaves the fight once every player's
/// ship is past this, unless fighting.
pub const SPAWN_RING: [f64; 2] = [650.0, 1000.0];
pub const SPAWN_TRIES: u32 = 10;
pub const DESPAWN_BEYOND: f64 = 1900.0;
/// No mending with a hostile ship nearer than this (metres).
pub const HOSTILE_NEAR_M: f64 = 700.0;
/// The rest of the volley that made a ship strike, this long after (seconds), cannot sink it.
pub const STRUCK_GRACE_S: f64 = 2.0;
/// A captain who struck lies hove to this long (seconds) for a player to board it; with no one aboard by then it is
/// scuttled.
pub const STRUCK_HOLD_S: f64 = 90.0;
/// How much faster every ship sails and rows in a sea fight than at sea (half again, and a fifth on that), and how much
/// faster it swings and answers its helm, at the owner's word.
pub const FIGHT_PACE: f64 = 1.8;
pub const FIGHT_TURN: f64 = 2.0;

/// A ship in the fight: its hull, its helm's numbers, how it lies, its hurts, its guns, its burst, and who sails it.
#[derive(Debug, Clone, PartialEq)]
pub struct Vessel {
    pub hull: HullKind,
    pub ship: Ship,
    pub pose: Pose,
    pub damage: Damage,
    pub guns: Guns,
    pub rigging: Rigging,
    pub boost: Boost,
    pub sailor: Sailor,
}

/// Who sails a ship: a player, by their orders; or a captain, by its own lights.
#[derive(Debug, Clone, PartialEq)]
pub enum Sailor {
    Player,
    Captain(Box<Command>),
}

/// A captain in command: its mind, how deep it settles going down, when it struck, and how it left the fight.
#[derive(Debug, Clone, PartialEq)]
pub struct Command {
    pub mind: Captain,
    pub under: f64,
    pub struck_at: Option<f64>,
    pub gone: Option<End>,
    /// Whether players went aboard it after it struck: it is no longer scuttled at `STRUCK_HOLD_S`.
    pub boarded: bool,
    /// Since when (the fight's clock) it has been out of every foe's guns' reach, not engaging, engaged by no captain,
    /// and neither struck nor going down.
    pub out_of_reach_since: Option<f64>,
}

impl Vessel {
    #[must_use]
    pub fn flag(&self) -> Flag {
        match &self.sailor {
            Sailor::Player => Flag::Player,
            Sailor::Captain(command) => Flag::Faction(command.mind.commission.faction),
        }
    }

    /// Its command, if a captain sails it.
    #[must_use]
    pub fn command(&self) -> Option<&Command> {
        match &self.sailor {
            Sailor::Player => None,
            Sailor::Captain(command) => Some(command),
        }
    }

    /// Its arms: its hull's.
    #[must_use]
    pub fn arms(&self) -> &'static Arms {
        arms_of(self.hull)
    }

    /// Whether it is still in the fight: a captain who has sunk or sailed off is not.
    #[must_use]
    pub fn in_fight(&self) -> bool {
        self.command().is_none_or(|command| command.gone.is_none())
    }
}

/// The player's lay: the look's bearing off their bow (degrees, to starboard), how far out it meets the water, and
/// its ray (the aim eye, then the way it looks; any length), if given.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Aim {
    pub bearing_deg: f64,
    pub range_m: f64,
    pub ray: Option<[[f64; 3]; 2]>,
}

/// What a player orders for a tick: their helm, the lay they hold, whether they fire it (a release: one tick),
/// their brace held, a load to take (a press), and whether they tap for a burst (a press: `Boost`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Orders {
    pub helm: Helm,
    pub aim: Option<Aim>,
    pub fire: bool,
    pub brace: bool,
    pub load: Option<Shot>,
    pub boost: bool,
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
    /// Each player's ship as its own gear fits it (`fitting.rs`).
    fittings: BTreeMap<ShipId, fitting::Fitting>,
    ambush: bool,
}

/// What a player's ship's hurts leave its helm: whether it is a wreck, the canvas it has left, and the share of its
/// way that canvas leaves it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Hurts {
    pub wrecked: bool,
    pub sail: f64,
    pub way_share: f64,
    /// The share of the turn its helm asks that its trim gives it.
    pub turn: f64,
    /// The share of its sails' and oars' pull its burst gives it (`Boost::drive`).
    pub drive: f64,
}

impl Hurts {
    #[must_use]
    pub fn of(damage: &Damage) -> Self {
        let (wrecked, way_share) = (damage.state == State::Wrecked, damage.way_share());
        Self { wrecked, sail: damage.sail, way_share, turn: 1.0, drive: 1.0 }
    }

    /// Its hurts from its numbers as a snapshot gives them.
    #[must_use]
    pub fn from_numbers(wrecked: bool, sail: f64, max_sail: f64) -> Self {
        Self { wrecked, sail, way_share: way_share_of(sail, max_sail), turn: 1.0, drive: 1.0 }
    }

    /// Its hurts as its fitting trims them: the way its canvas leaves it, and its turn.
    #[must_use]
    pub fn fitted(self, fitting: Option<&fitting::Fitting>) -> Self {
        let Some(fitting) = fitting else { return self };
        Self { way_share: fitting.way_share(self.way_share), turn: fitting.trim.turn, ..self }
    }
}

/// A player's ship of `hull` stepped a tick by its helm, as its hurts let it, at a fight's pace and swing: no sail sets
/// on a wreck or with its rigging shot away, its sails' and oars' pull is held back, and a burst drives a ship that is
/// no wreck. Answers the ship and, when its helm climbed for sail it could not set, whether that was for its being a
/// wreck.
#[must_use]
pub fn sail_hurt(
    ship: &Ship,
    hull: &Hull,
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
        sail: if hurts.wrecked { 0.0 } else { hurts.way_share * hurts.drive * FIGHT_PACE },
        oars: if hurts.wrecked { WRECKED_OARS } else { hurts.drive } * FIGHT_PACE,
        turn: hurts.turn * FIGHT_TURN,
    };
    (step_pulled(ship, &helm, hull, wind, waters, time, TICK_SECONDS, pull), refused)
}

/// Whether water at a point is deep enough to float `hull`.
fn floats(waters: &impl Waters, hull: &Hull, x: f64, y: f64, time: f64) -> bool {
    !shallower(&waters.at(x, y, time), hull.draught_m)
}

/// How deep a ship of `arms` settles for its highest point to end `SINK_CLEAR_M` under at its last list and trim.
fn sink_depth(seed: u32, arms: &Arms) -> f64 {
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
        Some(command) => command.mind.power(damage),
    };
    Sighting {
        id,
        hull: vessel.hull,
        ship: vessel.ship,
        level: vessel.pose.heave,
        hull_share: damage.hull_share(),
        wrecked: damage.state == State::Wrecked,
        power,
    }
}

/// A captain's ship of `hull` as it works it, in the wind, from its parts: its command is borrowed apart from them.
fn own_of<'vessel>(
    hull: HullKind,
    (ship, pose): (&'vessel Ship, &'vessel Pose),
    (damage, guns): (&'vessel Damage, &'vessel Guns),
    wind: [f64; 2],
) -> Own<'vessel> {
    Own { ship, pose, damage, guns, arms: arms_of(hull), hull: hull.hull(), wind }
}

impl Fight {
    /// An empty fight whose every chance is drawn from `seed`.
    #[must_use]
    pub fn new(seed: u32) -> Self {
        let ships = BTreeMap::new();
        let (balls, stems, fittings) = (Vec::new(), BTreeMap::new(), BTreeMap::new());
        Self { clock: 0.0, draws: Mulberry32::new(seed), ships, balls, stems, fittings, ambush: false }
    }

    /// A player's Sloop and one captain of `commission` in its rank's hull, put to sea on the ring round the Sloop,
    /// where the water floats the captain, heading across the player's waters on a slant: `PLAYER` and `CAPTAIN`.
    pub fn begin(
        ship: Ship,
        commission: Commission,
        seed: u32,
        waters: &impl Waters,
        time: f64,
    ) -> Result<Fight, String> {
        let mut fight = Fight::new(seed);
        fight.put_to_sea(PLAYER, ship, waters, time);
        fight.call_captain(CAPTAIN, &ship, commission, waters, time)?;
        Ok(fight)
    }

    /// A player's Sloop, sound, put to sea as `ship` under number `id`.
    pub fn put_to_sea(&mut self, id: ShipId, ship: Ship, waters: &impl Waters, time: f64) {
        self.put_to_sea_kept(id, ship, [1.0; 3], waters, time);
    }

    /// A player's Sloop put to sea as `ship` under number `id` with the hurts it keeps: the shares of its hull,
    /// canvas and men it has left (each to the whole point or man, never under one point of hull).
    pub fn put_to_sea_kept(&mut self, id: ShipId, ship: Ship, kept: [f64; 3], waters: &impl Waters, time: f64) {
        let hull = HullKind::Sloop;
        let pose = pose_of(&ship, hull.hull(), waters, time);
        let mut damage = Damage::new(&LARGE_BOAT, true);
        let [hull_share, sail_share, crew_share] =
            kept.map(|share| if share.is_finite() { share.clamp(0.0, 1.0) } else { 1.0 });
        damage.hull = (damage.max_hull * hull_share).round().max(1.0);
        damage.sail = (damage.max_sail * sail_share).round();
        damage.crew = (damage.max_crew * crew_share).round();
        let (guns, rigging, boost) = (Guns::new(), Rigging::new(hull), Boost::default());
        self.ships.insert(id, Vessel { hull, ship, pose, damage, guns, rigging, boost, sailor: Sailor::Player });
    }

    /// A captain of `commission` in its rank's hull under number `id` put to sea on the ring round `near`, where the
    /// water floats it, heading across its waters on a slant; or why none comes.
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
            if pose_of(&at, commission.hull().hull(), waters, time).aground {
                continue;
            }
            let to_near = crate::captain::course::heading_to([x, y], [near.x, near.y]);
            let slant = if draws.draw() < 0.5 { 1.0 } else { -1.0 } * (0.6 + draws.draw() * 0.9);
            let heading = (to_near + slant).rem_euclid(TAU);
            let heading = if heading < TAU { heading } else { 0.0 };
            let seed_drawn = draws.seed();
            self.enlist(id, Ship { heading, ..at }, commission, seed_drawn, waters, time);
            return Ok(());
        }
        Err("There is no open water for a captain near the Sloop.".into())
    }

    /// A fight between the player's Sloop and a captain of `commission` already at sea: the captain's at `captain`,
    /// cruising on its heading, its temper and every chance of the fight drawn from its `seed`.
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

    /// A fight among captains already at sea, with no player in it: each of `captains` (its ship cruising on its
    /// heading, its commission and its seed) under a number from `CAPTAIN` on, in turn, and every chance of the fight
    /// drawn from the first one's seed.
    pub fn among(captains: &[(Ship, Commission, u32)], waters: &impl Waters, time: f64) -> Fight {
        let mut fight = Fight::new(captains.first().map_or(0, |&(_, _, seed)| seed));
        for (&(ship, commission, seed), id) in captains.iter().zip(CAPTAIN..) {
            fight.enlist(id, ship, commission, seed, waters, time);
        }
        fight
    }

    /// The player's Sloop, as `put_to_sea` puts it, set upon by `captains` (each where and how it is given, under a
    /// number from `CAPTAIN` on, its temper drawn from its own seed), and every chance of the fight drawn from `seed`.
    /// Each comes to fight it at once: bold, whatever its temper, and cruising straight for it when out of sight.
    /// A captain set where the water does not float it is refused: aground, it could never close nor sink.
    /// An ambush is fought to the end: no captain sails off, the player's ship is never wrecked (a ball or a fire
    /// leaves it a point of hull), and it is over once every captain is beaten (`Fight::beaten`).
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
        for (&(captain, commission, its_seed), id) in captains.iter().zip(CAPTAIN..) {
            if pose_of(&captain, commission.hull().hull(), waters, time).aground {
                return Err(format!("Captain {id} is set where the water does not float it."));
            }
            fight.enlist(id, captain, commission, its_seed, waters, time);
            if let Some(Sailor::Captain(command)) = fight.ships.get_mut(&id).map(|vessel| &mut vessel.sailor) {
                command.mind.temper = crate::captain::Temper::Bold;
                let toward = crate::captain::course::heading_to([captain.x, captain.y], [ship.x, ship.y]);
                command.mind.cruise = toward.rem_euclid(TAU);
            }
        }
        Ok(fight)
    }

    /// A captain of `commission` under number `id` in its rank's hull at `ship`, cruising on its heading, its temper
    /// drawn from `seed`, its hull as strong as its rank makes it and striking where its rank strikes.
    pub fn enlist(
        &mut self,
        id: ShipId,
        ship: Ship,
        commission: Commission,
        seed: u32,
        waters: &impl Waters,
        time: f64,
    ) {
        let hull = commission.hull();
        let mind = Captain::new(commission, seed, ship.heading, arms_of(hull));
        let damage = commission.damage();
        let under = sink_depth(seed, arms_of(hull));
        let command = Command { mind, under, struck_at: None, gone: None, boarded: false, out_of_reach_since: None };
        let vessel = Vessel {
            hull,
            pose: pose_of(&ship, hull.hull(), waters, time),
            ship,
            damage,
            guns: Guns::new(),
            rigging: Rigging::new(hull),
            boost: Boost::default(),
            sailor: Sailor::Captain(Box::new(command)),
        };
        self.ships.insert(id, vessel);
    }

    /// The captain numbered `id`, just enlisted, raised to `strength` (`Captain::raised`): its hull and men, sound, and
    /// its guns' harm, that many times its rank's.
    pub fn raise(&mut self, id: ShipId, strength: f64) {
        let Some(vessel) = self.ships.get_mut(&id) else { return };
        let Sailor::Captain(command) = &mut vessel.sailor else { return };
        command.mind = command.mind.clone().raised(strength);
        vessel.damage = command.mind.commission.damage_at(strength);
    }

    /// A ship leaves the fight: the captains forget it; balls it fired fly on.
    pub fn leave(&mut self, id: ShipId) {
        self.ships.remove(&id);
        self.stems.remove(&id);
        self.fittings.remove(&id);
        for vessel in self.ships.values_mut() {
            if let Sailor::Captain(command) = &mut vessel.sailor {
                command.mind.forget(id);
            }
        }
    }

    /// Players go aboard a captain who struck: it is no longer scuttled at `STRUCK_HOLD_S`. Answers whether it lies
    /// struck for them.
    pub fn board(&mut self, id: ShipId) -> Option<Event> {
        let vessel = self.ships.get_mut(&id).filter(|vessel| vessel.damage.state == State::Struck)?;
        let Sailor::Captain(command) = &mut vessel.sailor else { return None };
        let first = !command.boarded;
        command.boarded = true;
        first.then_some(Event::Boarding { ship: id })
    }

    /// A captain's ship scuttled: it goes down where it lies. Answers what that brought.
    pub fn scuttle(&mut self, id: ShipId) -> Vec<Event> {
        let Some(vessel) = self.ships.get_mut(&id) else { return Vec::new() };
        if vessel.command().is_none() || !matches!(vessel.damage.state, State::Afloat | State::Struck) {
            return Vec::new();
        }
        vessel.damage.scuttle();
        vec![Event::State { ship: id, state: State::Sinking }, Event::Sinking { ship: id }]
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

    /// Whether an ambush is won: it had captains and every one is beaten, sunk, going down or struck (its crew have
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
            numbers.extend(vessel.rigging.numbers());
            numbers.extend(vessel.boost.numbers());
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
            numbers.push(flag(command.boarded));
            numbers.extend(command.mind.numbers());
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

    /// Every ship the captain `of` may fight, by number, as it sees them: each player's and each captain's of another
    /// faction still in the fight and afloat. A captain who has struck, or a ship going down, is no one's enemy.
    fn sightings(&self, of: ShipId) -> Vec<Sighting> {
        let Some(own) = self.ships.get(&of).map(Vessel::flag) else { return Vec::new() };
        let foe = |vessel: &Vessel| vessel.flag() != own && vessel.in_fight() && vessel.damage.fighting();
        let foes = self.ships.iter().filter(|(_, vessel)| foe(vessel));
        foes.map(|(id, vessel)| sighting_of(*id, vessel)).collect()
    }

    /// Every hull in the fight but `except`'s: where it is, its way and its pass reach, for a captain to keep clear of.
    fn traffic(&self, except: ShipId) -> Vec<crate::captain::course::Traffic> {
        use crate::captain::course::{pass_reach, velocity_of};
        let others = self.ships.iter().filter(|(id, vessel)| **id != except && vessel.in_fight());
        others
            .map(|(_, vessel)| ([vessel.ship.x, vessel.ship.y], velocity_of(&vessel.ship), pass_reach(vessel.arms())))
            .collect()
    }
}

#[path = "fight_events.rs"]
mod events;
pub use events::{End, Event, Part, Piece, Refusal};
#[path = "fitting.rs"]
pub mod fitting;
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
#[cfg(test)]
#[path = "fight_ending_tests.rs"]
mod ending_tests;
