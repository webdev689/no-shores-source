//! A fight at sea: players' Sloops and captains of each faction in their ranks' hulls, the balls between them, and the
//! harm they do, stepped together a tick at a time. Each player orders her own helm, a lay (the look's bearing off her
//! bow and its range), the fire, the brace and the load; each captain decides for herself whom she fights, a player or
//! a captain of another faction. A ball strikes only a ship under another flag. One seeded stream decides every chance,
//! in a fixed order, so a fight is the same on every machine.

use crate::arms::{Arms, LARGE_BOAT, arms_of, posed};
use crate::ballistics::Ball;
use crate::captain::odds::Power;
use crate::captain::{Captain, Her, Sighting};
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
/// A captain is put to sea this far from the ship she is called to (metres), and leaves the fight once every player's
/// ship is past this, unless fighting.
pub const SPAWN_RING: [f64; 2] = [650.0, 1000.0];
pub const SPAWN_TRIES: u32 = 10;
pub const DESPAWN_BEYOND: f64 = 1900.0;
/// No mending with a hostile ship nearer than this (metres).
pub const HOSTILE_NEAR_M: f64 = 700.0;
/// The rest of the volley that made a ship strike, this long after (seconds), cannot sink her.
pub const STRUCK_GRACE_S: f64 = 2.0;
/// A captain who struck lies hove to this long (seconds) for a player to board her; with no one aboard by then she is
/// scuttled.
pub const STRUCK_HOLD_S: f64 = 90.0;

/// A ship in the fight: her hull, her helm's numbers, how she lies, her hurts and her guns, and who sails her.
#[derive(Debug, Clone, PartialEq)]
pub struct Vessel {
    pub hull: HullKind,
    pub ship: Ship,
    pub pose: Pose,
    pub damage: Damage,
    pub guns: Guns,
    pub rigging: Rigging,
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
    /// Whether players went aboard her after she struck: she is no longer scuttled at `STRUCK_HOLD_S`.
    pub boarded: bool,
    /// Since when (the fight's clock) she has been out of every foe's guns' reach, not engaging, engaged by no captain,
    /// and neither struck nor going down.
    pub out_of_reach_since: Option<f64>,
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

    /// Her arms: her hull's.
    #[must_use]
    pub fn arms(&self) -> &'static Arms {
        arms_of(self.hull)
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

/// The fight: its clock (seconds), its stream of chances, its ships by number, the balls aloft, and each player's
/// stem as the ram's law keeps it.
#[derive(Debug, Clone, PartialEq)]
pub struct Fight {
    pub clock: f64,
    draws: Mulberry32,
    pub ships: BTreeMap<ShipId, Vessel>,
    pub balls: Vec<Ball>,
    stems: BTreeMap<ShipId, ram::Stem>,
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

/// A player's ship of `hull` stepped a tick by her helm, as her hurts let her: no sail sets on a wreck or with her
/// rigging shot away, and her sails' and oars' pull is held back. Answers her and, when her helm climbed for sail it
/// could not set, whether that was for her being a wreck.
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
        sail: if hurts.wrecked { 0.0 } else { hurts.way_share },
        oars: if hurts.wrecked { WRECKED_OARS } else { 1.0 },
    };
    (step_pulled(ship, &helm, hull, wind, waters, time, TICK_SECONDS, pull), refused)
}

/// Whether water at a point is deep enough to float `hull`.
fn floats(waters: &impl Waters, hull: &Hull, x: f64, y: f64, time: f64) -> bool {
    !shallower(&waters.at(x, y, time), hull.draught_m)
}

/// How deep a ship of `arms` settles for her highest point to end `SINK_CLEAR_M` under at her last list and trim.
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
        Some(command) => command.her.power(damage),
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

/// A captain's ship of `hull` as she works it, in the wind, from its parts: her command is borrowed apart from them.
fn her_of<'vessel>(
    hull: HullKind,
    (ship, pose): (&'vessel Ship, &'vessel Pose),
    (damage, guns): (&'vessel Damage, &'vessel Guns),
    wind: [f64; 2],
) -> Her<'vessel> {
    Her { ship, pose, damage, guns, arms: arms_of(hull), hull: hull.hull(), wind }
}

impl Fight {
    /// An empty fight whose every chance is drawn from `seed`.
    #[must_use]
    pub fn new(seed: u32) -> Self {
        let ships = BTreeMap::new();
        Self { clock: 0.0, draws: Mulberry32::new(seed), ships, balls: Vec::new(), stems: BTreeMap::new() }
    }

    /// A player's Sloop and one captain of `commission` in her rank's hull, put to sea on the ring round her, where the
    /// water floats her, heading across the player's waters on a slant: `PLAYER` and `CAPTAIN`.
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

    /// A player's Sloop put to sea as `ship` under number `id` with the hurts she keeps: the shares of her hull,
    /// canvas and men she has left (each to the whole point or man, never under one point of hull).
    pub fn put_to_sea_kept(&mut self, id: ShipId, ship: Ship, kept: [f64; 3], waters: &impl Waters, time: f64) {
        let hull = HullKind::Sloop;
        let pose = pose_of(&ship, hull.hull(), waters, time);
        let mut damage = Damage::new(&LARGE_BOAT, true);
        let [hull_share, sail_share, crew_share] =
            kept.map(|share| if share.is_finite() { share.clamp(0.0, 1.0) } else { 1.0 });
        damage.hull = (damage.max_hull * hull_share).round().max(1.0);
        damage.sail = (damage.max_sail * sail_share).round();
        damage.crew = (damage.max_crew * crew_share).round();
        let (guns, rigging) = (Guns::new(), Rigging::new(hull));
        self.ships.insert(id, Vessel { hull, ship, pose, damage, guns, rigging, sailor: Sailor::Player });
    }

    /// A captain of `commission` in her rank's hull under number `id` put to sea on the ring round `near`, where the
    /// water floats her, heading across its waters on a slant; or why none comes.
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

    /// A fight among captains already at sea, with no player in it: each of `captains` (her ship cruising on its
    /// heading, her commission and her seed) under a number from `CAPTAIN` on, in turn, and every chance of the fight
    /// drawn from the first one's seed.
    pub fn among(captains: &[(Ship, Commission, u32)], waters: &impl Waters, time: f64) -> Fight {
        let mut fight = Fight::new(captains.first().map_or(0, |&(_, _, seed)| seed));
        for (&(ship, commission, seed), id) in captains.iter().zip(CAPTAIN..) {
            fight.enlist(id, ship, commission, seed, waters, time);
        }
        fight
    }

    /// A captain of `commission` under number `id` in her rank's hull at `ship`, cruising on its heading, her temper
    /// drawn from `seed`, her hull as strong as her rank makes it and striking where her rank strikes.
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
        let her = Captain::new(commission, seed, ship.heading, arms_of(hull));
        let damage = commission.damage();
        let under = sink_depth(seed, arms_of(hull));
        let command = Command { her, under, struck_at: None, gone: None, boarded: false, out_of_reach_since: None };
        let vessel = Vessel {
            hull,
            pose: pose_of(&ship, hull.hull(), waters, time),
            ship,
            damage,
            guns: Guns::new(),
            rigging: Rigging::new(hull),
            sailor: Sailor::Captain(Box::new(command)),
        };
        self.ships.insert(id, vessel);
    }

    /// The captain numbered `id`, just enlisted, raised to `strength` (`Captain::raised`): her hull and men, sound, and
    /// her guns' harm, that many times her rank's.
    pub fn raise(&mut self, id: ShipId, strength: f64) {
        let Some(vessel) = self.ships.get_mut(&id) else { return };
        let Sailor::Captain(command) = &mut vessel.sailor else { return };
        command.her = command.her.clone().raised(strength);
        vessel.damage = command.her.commission.damage_at(strength);
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

    /// Players go aboard a captain who struck: she is no longer scuttled at `STRUCK_HOLD_S`. Answers whether she lies
    /// struck for them.
    pub fn board(&mut self, id: ShipId) -> Option<Event> {
        let vessel = self.ships.get_mut(&id).filter(|vessel| vessel.damage.state == State::Struck)?;
        let Sailor::Captain(command) = &mut vessel.sailor else { return None };
        let first = !command.boarded;
        command.boarded = true;
        first.then_some(Event::Boarding { ship: id })
    }

    /// A captain's ship scuttled: she goes down where she lies. Answers what that brought.
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

    /// Every ship the captain `of` may fight, by number, as she sees her: each player's and each captain's of another
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
#[path = "fight_ending_tests.rs"]
mod ending_tests;
