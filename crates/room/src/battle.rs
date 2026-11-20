//! The sea's fights with players in them. A fight begins when a ship meets a player (`Fight::meet`) or a player comes
//! on a fight among captains (`clash`); then any player not fighting who comes within `ENGAGE_RANGE` of one of its
//! ships joins it, and so does any hostile ship at sea, on her own side. Every player in it fights every captain, and
//! players never harm each other (a ball passes through a ship of its own flag). The room steps each fight by its
//! players' orders; a player whose ship goes down leaves it, and when its last captain has left it its players sail on
//! from where it left them, each ship keeping her hurts.

use crate::PlayerId;
use crate::clash::{Clash, ship_at, sighted};
use crate::pirates::{Pirate, Pirates, Voyager};
use crate::sea::Coast;
use crate::sea_weather::{CoastWaters, SeaWeather};
use land::sea::Swell;
use naval::captain::ENGAGE_RANGE;
use naval::damage::{Damage, State};
use naval::fight::{End, Event, Fight, Orders, PLAYER, Vessel};
use naval::ranks::Commission;
use naval::shots::ShipId;
use naval::wire::view_numbers;
use sailing::ship::{Helm, SAILS_SET, Ship};
use std::collections::BTreeMap;

/// Players who join a fight under way sail under numbers from this one on, past every captain's.
pub const PLAYERS_FROM: ShipId = 1_000;

/// A player boards a captain who struck with their ship within this of hers (metres), both making less way than this
/// (metres a second).
pub const BOARD_REACH_M: f64 = 30.0;
pub const BOARD_WAY_M_S: f64 = 2.0;

/// Why a boarding was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BoardRefused {
    /// The player is in no fight, or their ship is going down.
    NotFighting,
    /// No captain who struck lies within reach, or one of them makes too much way.
    NoneAlongside,
}

/// Orders for a fight just begun: the helm amidships, no lay, nothing fired, braced or loaded.
pub const QUIET: Orders =
    Orders { helm: Helm { steer: 0.0, crab: false, climb: 0 }, aim: None, fire: false, brace: false, load: None };

/// Who joined a fight under way: a player, or a hostile ship of a commission.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Joined {
    Player(PlayerId),
    Hostile(Commission),
}

/// A player's place in a fight: their ship's number in it and the orders it is stepped by.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Crew {
    pub ship: ShipId,
    pub orders: Orders,
}

/// A fight with players in it: the fight, each player's place in it, what happened in its last tick, each captain's
/// ship as she sailed at sea (by her number, for her level when she sinks), and every player who has fought in it.
#[derive(Debug)]
pub struct SeaFight {
    pub fight: Fight,
    pub crews: BTreeMap<PlayerId, Crew>,
    pub events: Vec<Event>,
    pub hostiles: BTreeMap<ShipId, Pirate>,
    pub fought: Vec<PlayerId>,
    /// The captains whose holds were opened, who lay nothing more when they go down.
    pub opened: Vec<ShipId>,
    /// What happened between its ticks (a boarding, a scuttling asked for), told with its next tick's.
    pub pending: Vec<Event>,
    /// The swell and the wind where it began, kept while it lasts.
    pub swell: Swell,
    pub wind: [f64; 2],
}

/// What became of a player in a fight this tick: still in it, where their ship lies; out of it afloat, where it left
/// them, with the shares of hull, canvas and men she keeps; or gone down there.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Outcome {
    Fighting { player: PlayerId, ship: Ship },
    Released { player: PlayerId, ship: Ship, kept: [f64; 3] },
    Sunk { player: PlayerId, at: [f64; 2] },
}

/// A captain's ship that went down this tick: hers as she sailed at sea, where she sank, and the players who fought
/// her.
#[derive(Debug, Clone, PartialEq)]
pub struct Sank {
    pub pirate: Pirate,
    pub at: [f64; 2],
    pub players: Vec<PlayerId>,
    /// The wind of her fight, which what floats drifts down.
    pub wind: [f64; 2],
}

/// The shares of hull, canvas and men a ship's hurts leave her.
#[must_use]
pub fn kept_of(damage: &Damage) -> [f64; 3] {
    let share = |have: f64, whole: f64| if whole > 0.0 { (have / whole).clamp(0.0, 1.0) } else { 1.0 };
    [share(damage.hull, damage.max_hull), share(damage.sail, damage.max_sail), share(damage.crew, damage.max_crew)]
}

fn apart(from: [f64; 2], to: [f64; 2]) -> f64 {
    let (east, south) = (to[0] - from[0], to[1] - from[1]);
    (east * east + south * south).sqrt()
}

impl SeaFight {
    fn new(fight: Fight, hostiles: BTreeMap<ShipId, Pirate>, (swell, wind): (Swell, [f64; 2])) -> Self {
        SeaFight {
            swell,
            wind,
            fight,
            crews: BTreeMap::new(),
            events: Vec::new(),
            hostiles,
            fought: Vec::new(),
            opened: Vec::new(),
            pending: Vec::new(),
        }
    }

    /// Whether any of its ships still in it lies within `ENGAGE_RANGE` of `at`.
    #[must_use]
    pub fn near(&self, at: [f64; 2]) -> bool {
        let ships = self.fight.ships.values().filter(|vessel| vessel.in_fight());
        ships.into_iter().any(|vessel| apart(at, [vessel.ship.x, vessel.ship.y]) <= ENGAGE_RANGE)
    }

    /// A player's Sloop put into it hove to at `own`, with the hurts she keeps, under the next player's number.
    fn put_in(&mut self, player: PlayerId, own: Ship, kept: [f64; 3], coasts: &[Coast], time: f64) {
        let waters = CoastWaters { coasts, swell: &self.swell };
        let taken = self.crews.values().map(|crew| crew.ship);
        let ship = if self.crews.is_empty() { PLAYER } else { taken.max().unwrap_or(PLAYER).max(PLAYERS_FROM - 1) + 1 };
        self.fight.put_to_sea_kept(ship, own, kept, &waters, time);
        self.crews.insert(player, Crew { ship, orders: QUIET });
        if !self.fought.contains(&player) {
            self.fought.push(player);
        }
    }

    /// The commission of its first captain, as a view shows her.
    fn first_captain(&self) -> Commission {
        let captain = self.fight.ships.values().find_map(Vessel::command);
        captain.map_or_else(Commission::default, |command| command.her.commission)
    }
}

/// The sea's fights with players in them, in the order they began.
#[derive(Debug, Default)]
pub struct Fights {
    pub list: Vec<SeaFight>,
}

impl Fights {
    /// Whether a player is in a fight.
    #[must_use]
    pub fn fighting(&self, player: PlayerId) -> bool {
        self.list.iter().any(|fought| fought.crews.contains_key(&player))
    }

    /// The fight a player is in, and their place in it.
    pub fn of_mut(&mut self, player: PlayerId) -> Option<(&mut SeaFight, Crew)> {
        let fought = self.list.iter_mut().find(|fought| fought.crews.contains_key(&player))?;
        let crew = fought.crews.get(&player).copied()?;
        Some((fought, crew))
    }

    /// A fighting player's orders for the ticks to come; false for a player in no fight.
    pub fn orders(&mut self, player: PlayerId, orders: Orders) -> bool {
        let Some((fought, _)) = self.of_mut(player) else { return false };
        if let Some(crew) = fought.crews.get_mut(&player) {
            crew.orders = orders;
        }
        true
    }

    /// A player boards the nearest captain who struck within `BOARD_REACH_M` of their ship, both making less way than
    /// `BOARD_WAY_M_S`: she is no longer scuttled for want of boarders. Answers her number and her ship as she sailed at
    /// sea.
    pub fn board(&mut self, player: PlayerId) -> Result<(ShipId, Pirate), BoardRefused> {
        let (fought, crew) = self.of_mut(player).ok_or(BoardRefused::NotFighting)?;
        let own = fought.fight.vessel(crew.ship).filter(|vessel| vessel.damage.fighting());
        let own = own.ok_or(BoardRefused::NotFighting)?.ship;
        let way = |ship: &Ship| libm::hypot(ship.ahead, ship.abeam);
        let alongside = fought
            .fight
            .ships
            .iter()
            .filter(|(_, vessel)| vessel.damage.state == State::Struck && vessel.command().is_some())
            .map(|(id, vessel)| (*id, apart([own.x, own.y], [vessel.ship.x, vessel.ship.y]), way(&vessel.ship)))
            .filter(|(_, apart, her_way)| *apart <= BOARD_REACH_M && *her_way < BOARD_WAY_M_S)
            .min_by(|one, other| one.1.total_cmp(&other.1));
        let (id, _, _) = alongside.filter(|_| way(&own) < BOARD_WAY_M_S).ok_or(BoardRefused::NoneAlongside)?;
        let pirate = *fought.hostiles.get(&id).ok_or(BoardRefused::NoneAlongside)?;
        if let Some(boarding) = fought.fight.board(id) {
            fought.pending.push(boarding);
        }
        Ok((id, pirate))
    }

    /// The fight and number of the captain who sailed at sea as `pirate`, a ship of the sea's own numbering.
    fn holding(&mut self, pirate: u32) -> Option<(&mut SeaFight, ShipId)> {
        self.list.iter_mut().find_map(|fought| {
            let id = fought.hostiles.iter().find(|(_, held)| held.id == pirate).map(|(id, _)| *id)?;
            Some((fought, id))
        })
    }

    /// Where the captain who sailed at sea as `pirate` lies, and her fight's wind.
    pub fn position_of(&mut self, pirate: u32) -> Option<([f64; 2], [f64; 2])> {
        let (fought, id) = self.holding(pirate)?;
        let wind = fought.wind;
        fought.fight.vessel(id).map(|vessel| ([vessel.ship.x, vessel.ship.y], wind))
    }

    /// The captain who sailed at sea as `pirate` is scuttled, and her fight told.
    pub fn scuttle_by(&mut self, pirate: u32) {
        if let Some((fought, id)) = self.holding(pirate) {
            let told = fought.fight.scuttle(id);
            fought.pending.extend(told);
        }
    }

    /// Her hold opened, she lays nothing more when she goes down.
    pub fn forget_hold(&mut self, pirate: u32) {
        if let Some((fought, id)) = self.holding(pirate) {
            fought.opened.push(id);
        }
    }

    /// A player leaves their fight afloat: their ship leaves it, with the hurts she keeps.
    pub fn release(&mut self, player: PlayerId) -> Option<[f64; 3]> {
        let kept = self.hurts_of(player).map(|(kept, _)| kept);
        self.leave(player);
        kept
    }

    /// The hurts a fighting player's ship keeps as the fight has her now (a sunk ship's if she is going down), and
    /// where she lies.
    #[must_use]
    pub fn hurts_of(&self, player: PlayerId) -> Option<([f64; 3], [f64; 2])> {
        let fought = self.list.iter().find(|fought| fought.crews.contains_key(&player))?;
        let vessel = fought.fight.vessel(fought.crews.get(&player)?.ship)?;
        let going_down = matches!(vessel.damage.state, State::Sinking | State::Sunk);
        let kept = if going_down { crate::harbour::SUNK_KEPT } else { kept_of(&vessel.damage) };
        Some((kept, [vessel.ship.x, vessel.ship.y]))
    }

    /// A player leaves the sea: their ship leaves their fight, and a fight left with no player ends with them.
    pub fn leave(&mut self, player: PlayerId) {
        if let Some((fought, crew)) = self.of_mut(player) {
            fought.fight.leave(crew.ship);
            fought.crews.remove(&player);
        }
        self.list.retain(|fought| !fought.crews.is_empty());
    }

    /// A ship that met a player begins their fight under `weather`: she where she lay, under sail; their Sloop hove
    /// to at `own`.
    pub(crate) fn begin_met(
        &mut self,
        (player, own, kept): (PlayerId, Ship, [f64; 3]),
        pirate: &Pirate,
        (weather, coasts): ((Swell, [f64; 2]), &[Coast]),
        time: f64,
    ) {
        let captain = ship_at(pirate.x, pirate.y, pirate.heading, SAILS_SET);
        let waters = CoastWaters { coasts, swell: &weather.0 };
        let fight = Fight::meet(own, captain, pirate.commission, pirate.seed, &waters, time);
        let mut fought = SeaFight::new(fight, BTreeMap::from([(naval::fight::CAPTAIN, *pirate)]), weather);
        fought.put_in(player, own, kept, coasts, time);
        self.list.push(fought);
    }

    /// A fight among captains a player came on becomes theirs, under its own weather, their Sloop hove to at `own`.
    pub(crate) fn begin_from_clash(
        &mut self,
        clash: Clash,
        (player, own, kept): (PlayerId, Ship, [f64; 3]),
        coasts: &[Coast],
        time: f64,
    ) {
        let hostiles = clash.crews().iter().copied().collect();
        let mut fought = SeaFight::new(clash.fight, hostiles, (clash.swell, clash.wind));
        fought.put_in(player, own, kept, coasts, time);
        self.list.push(fought);
    }

    /// The first fight a player at `own` comes within `ENGAGE_RANGE` of; whether they joined one, their Sloop hove to.
    pub(crate) fn join(
        &mut self,
        (player, own, kept): (PlayerId, Ship, [f64; 3]),
        coasts: &[Coast],
        time: f64,
    ) -> bool {
        let Some(fought) = self.list.iter_mut().find(|fought| fought.near([own.x, own.y])) else { return false };
        fought.put_in(player, own, kept, coasts, time);
        true
    }

    /// The first fight a hostile ship at sea comes within `ENGAGE_RANGE` of; whether she joined it, on her own side,
    /// where she lay and under sail, her temper and her chances drawn from her seed.
    pub(crate) fn join_hostile(&mut self, pirate: &Pirate, coasts: &[Coast], time: f64) -> bool {
        let Some(fought) = self.list.iter_mut().find(|fought| fought.near([pirate.x, pirate.y])) else { return false };
        let captains = fought.fight.ships.keys().copied().filter(|id| *id < PLAYERS_FROM);
        let id = captains.max().unwrap_or(PLAYER) + 1;
        let ship = ship_at(pirate.x, pirate.y, pirate.heading, SAILS_SET);
        let waters = CoastWaters { coasts, swell: &fought.swell };
        fought.fight.enlist(id, ship, pirate.commission, pirate.seed, &waters, time);
        fought.hostiles.insert(id, *pirate);
        true
    }

    /// After the sea's ships sailed: each ship that met a player (`met`) begins their fight; rivals that met begin
    /// a clash; each player at sea not fighting (`ships`) who comes within `ENGAGE_RANGE` of a fight joins it, or of a
    /// clash takes it for their fight; and each hostile ship within `ENGAGE_RANGE` of a fight joins it. `heave` brings
    /// a player's ship to rest for it and answers her with the hurts she keeps. Answers who joined a fight under way
    /// (a player, or a hostile ship's commission) and the players already in it.
    pub(crate) fn take_in(
        &mut self,
        met: Vec<(PlayerId, Pirate)>,
        ships: &[Voyager],
        (clashes, pirates): (&mut Vec<Clash>, &mut Pirates),
        heave: &mut impl FnMut(PlayerId) -> Option<(PlayerId, Ship, [f64; 3])>,
        (coasts, weather, time): (&[Coast], &SeaWeather, f64),
    ) -> Vec<(Joined, Vec<PlayerId>)> {
        let mut joined = Vec::new();
        for (player, pirate) in met {
            let Some(own) = heave(player) else { continue };
            self.begin_met(own, &pirate, (weather.at([own.1.x, own.1.y], time), coasts), time);
        }
        for met in pirates.meet_rivals() {
            clashes.push(Clash::begin(met, weather.at([met[0].x, met[0].y], time), coasts, time));
        }
        for &Voyager { player, at, .. } in ships {
            if self.fighting(player) {
                continue;
            }
            let near = self.list.iter().any(|fought| fought.near(at));
            let clash = if near { None } else { sighted(clashes, at) };
            if !near && clash.is_none() {
                continue;
            }
            let Some(own) = heave(player) else { continue };
            match clash {
                Some(clash) => self.begin_from_clash(clash, own, coasts, time),
                None => {
                    let before = self
                        .list
                        .iter()
                        .find(|fought| fought.near(at))
                        .map(|fought| fought.crews.keys().copied().collect());
                    if self.join(own, coasts, time) {
                        joined.push((Joined::Player(player), before.unwrap_or_default()));
                    }
                }
            }
        }
        let joining: Vec<usize> = (0..pirates.sailing.len())
            .filter(|at| {
                let pirate = &pirates.sailing[*at];
                self.list.iter().any(|fought| fought.near([pirate.x, pirate.y]))
            })
            .collect();
        for at in joining.into_iter().rev() {
            let pirate = pirates.sailing.remove(at);
            let before = self.list.iter().find(|fought| fought.near([pirate.x, pirate.y]));
            let before = before.map(|fought| fought.crews.keys().copied().collect()).unwrap_or_default();
            if self.join_hostile(&pirate, coasts, time) {
                joined.push((Joined::Hostile(pirate.commission), before));
            }
        }
        joined
    }

    /// One tick: each fight over last tick lets its players go; each other steps by its players' orders (the climb,
    /// the fire and the load acting once); a player whose ship went down leaves it; and a fight with no player left
    /// ends. Answers what became of each player, and each captain's ship that sank.
    pub(crate) fn step(&mut self, coasts: &[Coast], time: f64) -> (Vec<Outcome>, Vec<Sank>) {
        let mut outcomes = Vec::new();
        for fought in self.list.iter().filter(|fought| fought.fight.over().is_some()) {
            for (player, crew) in &fought.crews {
                let Some(vessel) = fought.fight.vessel(crew.ship) else { continue };
                let (ship, damage) = (vessel.ship, &vessel.damage);
                // One going down as the fight ends goes down all the same.
                outcomes.push(if matches!(damage.state, State::Sinking | State::Sunk) {
                    Outcome::Sunk { player: *player, at: [ship.x, ship.y] }
                } else {
                    Outcome::Released { player: *player, ship, kept: kept_of(damage) }
                });
            }
        }
        self.list.retain(|fought| fought.fight.over().is_none());
        let mut sank = Vec::new();
        for fought in &mut self.list {
            let orders: Vec<(ShipId, Orders)> = fought.crews.values().map(|crew| (crew.ship, crew.orders)).collect();
            let waters = CoastWaters { coasts, swell: &fought.swell };
            let stepped = fought.fight.step(&orders, &waters, fought.wind, time);
            fought.events = std::mem::take(&mut fought.pending);
            fought.events.extend(stepped);
            for crew in fought.crews.values_mut() {
                // The climb, the fire and the load are presses: they act once.
                let helm = Helm { climb: 0, ..crew.orders.helm };
                crew.orders = Orders { helm, fire: false, load: None, ..crew.orders };
            }
            for event in &fought.events {
                let Event::Gone { ship, end: End::Sunk } = *event else { continue };
                if fought.opened.contains(&ship) {
                    continue;
                }
                let (Some(pirate), Some(vessel)) = (fought.hostiles.get(&ship), fought.fight.vessel(ship)) else {
                    continue;
                };
                let (at, players) = ([vessel.ship.x, vessel.ship.y], fought.fought.clone());
                sank.push(Sank { pirate: *pirate, at, players, wind: fought.wind });
            }
            let mut gone = Vec::new();
            for (player, crew) in &fought.crews {
                let Some(vessel) = fought.fight.vessel(crew.ship) else { continue };
                if vessel.damage.state == State::Sunk {
                    outcomes.push(Outcome::Sunk { player: *player, at: [vessel.ship.x, vessel.ship.y] });
                    gone.push((*player, crew.ship));
                } else {
                    outcomes.push(Outcome::Fighting { player: *player, ship: vessel.ship });
                }
            }
            for (player, ship) in gone {
                fought.fight.leave(ship);
                fought.crews.remove(&player);
            }
        }
        self.list.retain(|fought| !fought.crews.is_empty());
        (outcomes, sank)
    }

    /// Each player in a fight with their fight, in the order the fights began and then of their number.
    pub fn each(&self) -> impl Iterator<Item = (PlayerId, &SeaFight)> + '_ {
        self.list.iter().flat_map(|fought| fought.crews.keys().map(move |player| (*player, fought)))
    }

    /// Each fighting player's view of their fight (the naval crate's numbers, their ship as its player's), its lay
    /// over the fight's waters now, and its first captain's commission.
    pub(crate) fn views<'fights>(
        &'fights self,
        coasts: &'fights [Coast],
        time: f64,
    ) -> impl Iterator<Item = (PlayerId, Vec<f64>, Commission)> + 'fights {
        self.list.iter().flat_map(move |fought| {
            fought.crews.iter().map(move |(player, crew)| {
                let aim = crew.orders.aim;
                let waters = CoastWaters { coasts, swell: &fought.swell };
                let view = view_numbers(&fought.fight, crew.ship, &fought.events, aim.as_ref(), &waters, time);
                (*player, view, fought.first_captain())
            })
        })
    }
}

#[cfg(test)]
#[path = "battle_tests.rs"]
mod tests;
