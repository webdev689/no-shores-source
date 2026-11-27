//! The sea's fights with players in them. A fight begins when a ship meets a player (`Fight::meet`) or a player comes
//! on a Tithe ship's attack on a friendly ship (`clash`); then any player not fighting who comes within `ENGAGE_RANGE`
//! of one of its ships joins it, and so does any hostile ship at sea, on its own side. Every player in it fights every
//! Tithe captain, a friendly ship fighting beside them under their flag, and no ball harms a ship of its own flag. The
//! room steps each fight by its players' orders; a player whose ship goes down leaves it, and when its last captain
//! has left it its players sail on from where it left them, each ship keeping its hurts, and a friendly ship still
//! afloat sails on for its port.

use crate::PlayerId;
use crate::clash::{Clash, sailed_off, ship_at, sighted};
use crate::friendlies::Friendly;
use crate::hostiles::{Hostile, Hostiles, Voyager};
use crate::sea::Coast;
use crate::sea_weather::{CoastWaters, SeaWeather};
use combat::sight::apart;
use land::sea::Swell;
use naval::captain::ENGAGE_RANGE;
use naval::damage::{Damage, State};
use naval::fight::{End, Event, Fight, Orders, PLAYER, Vessel};
use naval::ranks::Commission;
use naval::shots::ShipId;
use sailing::HullKind;
use sailing::ship::{Helm, SAILS_SET, Ship};
use std::collections::BTreeMap;

/// Players who join a fight under way sail under numbers from this one on, past every captain's.
pub const PLAYERS_FROM: ShipId = 1_000;

/// A player boards a captain who struck with their ship within this of the captain's (metres), both making less way
/// than this (metres a second).
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

/// Orders for a fight just begun, and a fleet's player standing for a tick: the helm amidships, no lay, nothing fired,
/// braced or loaded, and no burst.
pub const QUIET: Orders =
    Orders { helm: Helm { steer: 0.0, climb: 0 }, aim: None, fire: false, brace: false, load: None, boost: false };

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
    /// The rung its sails stood at as its player boarded a struck deck, set again as they come back aboard.
    pub furled_from: Option<i8>,
}

/// A fight with players in it: the fight, each player's place in it, what happened in its last tick, each captain's
/// ship as it sailed at sea (by its number, for its level when it sinks), and every player who has fought in it.
#[derive(Debug)]
pub struct SeaFight {
    pub fight: Fight,
    pub crews: BTreeMap<PlayerId, Crew>,
    pub events: Vec<Event>,
    pub hostiles: BTreeMap<ShipId, Hostile>,
    /// Each friendly ship fighting beside its players, by its number: nothing is paid or lost for it.
    pub friends: BTreeMap<ShipId, Friendly>,
    pub fought: Vec<PlayerId>,
    /// What happened between its ticks (a boarding, a scuttling asked for), told with its next tick's.
    pub pending: Vec<Event>,
    /// The swell and the wind where it began, kept while it lasts.
    pub swell: Swell,
    pub wind: [f64; 2],
    /// The last ship number it gave a player: none is given twice, so a ball still flying from a ship that left is
    /// never laid at another's door.
    pub given: Option<ShipId>,
    /// The players whose last stand this fight is spent (Hard to Kill), kept should they leave and come back.
    pub stood: Vec<PlayerId>,
    /// Whether a snapshot has carried it ended: if none has by the tick it lets its players go, its last view is kept.
    pub over_sent: bool,
}

/// What became of a player in a fight this tick: still in it, where their ship lies; out of it afloat, where it left
/// them, with the shares of hull, canvas and men it keeps; or gone down there.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Outcome {
    Fighting { player: PlayerId, ship: Ship },
    Released { player: PlayerId, ship: Ship, kept: [f64; 3] },
    Sunk { player: PlayerId, at: [f64; 2] },
}

/// A captain's ship that went down this tick: the ship as it sailed at sea, where it sank, and the players who fought
/// it.
#[derive(Debug, Clone, PartialEq)]
pub struct Sank {
    pub hostile: Hostile,
    pub at: [f64; 2],
    pub players: Vec<PlayerId>,
    /// The wind of its fight, which what floats drifts down.
    pub wind: [f64; 2],
    /// Whether its captain struck before it went down, or it was sunk fighting.
    pub struck: bool,
}

/// Whether a captain's ship struck its colours, whatever became of it after.
fn struck(vessel: &naval::fight::Vessel) -> bool {
    vessel.damage.state == State::Struck || vessel.command().is_some_and(|command| command.struck_at.is_some())
}

/// A fighting player's fight as their browser is sent it: the naval crate's numbers, its first captain's commission,
/// whether a boarding they asked now would be taken (`Fights::alongside`), and whether it is the Harbourmaster's
/// hulk's, whose fight the page shows as the sailing lesson's step.
#[derive(Debug, Clone, PartialEq)]
pub struct FightSeen {
    pub player: PlayerId,
    pub numbers: Vec<f64>,
    pub captain: Commission,
    pub may_board: bool,
    pub lesson: bool,
}

/// The shares of hull, canvas and men a ship's hurts leave it.
#[must_use]
pub fn kept_of(damage: &Damage) -> [f64; 3] {
    let share = |have: f64, whole: f64| if whole > 0.0 { (have / whole).clamp(0.0, 1.0) } else { 1.0 };
    [share(damage.hull, damage.max_hull), share(damage.sail, damage.max_sail), share(damage.crew, damage.max_crew)]
}

/// Whether a captain's deck holds a crew to fight: its faction has deck hands of its rank.
fn crewed(hostile: &Hostile) -> bool {
    let rank = crate::sea::decks::foe_rank(hostile.commission.rank);
    !::foes::crews::deck_crew(hostile.commission.faction, rank).is_empty()
}

/// Each friendly ship of a fight still afloat, where the fight left it.
fn friends_afloat(fought: &SeaFight) -> impl Iterator<Item = Friendly> + '_ {
    let afloat = |id: &ShipId| fought.fight.vessel(*id).filter(|vessel| crate::clash::afloat(vessel));
    let freed = fought.friends.iter().filter_map(move |(id, friend)| Some((afloat(id)?.ship, *friend)));
    freed.map(|(ship, friend)| Friendly { x: ship.x, y: ship.y, heading: ship.heading, ..friend })
}

impl SeaFight {
    fn new(fight: Fight, hostiles: BTreeMap<ShipId, Hostile>, (swell, wind): (Swell, [f64; 2])) -> Self {
        SeaFight {
            swell,
            wind,
            fight,
            crews: BTreeMap::new(),
            events: Vec::new(),
            hostiles,
            friends: BTreeMap::new(),
            fought: Vec::new(),
            pending: Vec::new(),
            given: None,
            stood: Vec::new(),
            over_sent: false,
        }
    }

    /// Whether any of its ships still in it lies within `ENGAGE_RANGE` of `at`.
    #[must_use]
    pub fn near(&self, at: [f64; 2]) -> bool {
        let ships = self.fight.ships.values().filter(|vessel| vessel.in_fight());
        ships.into_iter().any(|vessel| apart(at, [vessel.ship.x, vessel.ship.y]) <= ENGAGE_RANGE)
    }

    /// A player's ship of `hull` put into the fight hove to at `own`, with the hurts it keeps, under the next player's
    /// number: the first `PLAYER`, the rest from `PLAYERS_FROM` on, none given twice.
    fn put_in(&mut self, (player, own, kept, hull): (PlayerId, Ship, [f64; 3], HullKind), coasts: &[Coast], time: f64) {
        let waters = CoastWaters { coasts, swell: &self.swell };
        let ship = self.given.map_or(PLAYER, |given| given.max(PLAYERS_FROM - 1) + 1);
        self.given = Some(ship);
        self.fight.put_to_sea_kept(ship, (own, hull), kept, &waters, time);
        self.crews.insert(player, Crew { ship, orders: QUIET, furled_from: None });
        if !self.fought.contains(&player) {
            self.fought.push(player);
        }
    }

    /// A player's ship taken out of the fight, its spent last stand remembered should they come back.
    fn take_out(&mut self, player: PlayerId) {
        let Some(crew) = self.crews.remove(&player) else { return };
        if self.fight.fitting(crew.ship).is_some_and(|fitted| fitted.stood) && !self.stood.contains(&player) {
            self.stood.push(player);
        }
        self.fight.leave(crew.ship);
    }

    /// The commission of its first captain, as a view shows the captain.
    fn first_captain(&self) -> Commission {
        let captain = self.fight.ships.values().find_map(Vessel::command);
        captain.map_or_else(Commission::default, |command| command.mind.commission)
    }
}

/// The sea's fights with players in them, in the order they began.
#[derive(Debug, Default)]
pub struct Fights {
    pub list: Vec<SeaFight>,
    /// Each captain going down in a fight its last player left, sunk all the same, told with the next tick's.
    pub(crate) lost: Vec<Sank>,
    /// The last view of each fight that ended unseen, a tick of catching up having run past it: sent with the next.
    pub(crate) ended: Vec<FightSeen>,
    /// Each friendly ship afloat as its fight ended, where it left it, for the sea to send on its way.
    pub(crate) freed: Vec<Friendly>,
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

    /// A fighting player's orders for the ticks to come, keeping the presses (fire, load, climb, boost) of earlier
    /// orders not yet stepped; false for a player in no fight.
    pub fn orders(&mut self, player: PlayerId, orders: Orders) -> bool {
        let Some((fought, _)) = self.of_mut(player) else { return false };
        if let Some(crew) = fought.crews.get_mut(&player) {
            // Presses wait for the step that uses them: a second message in the tick must not undo a broadside.
            let pending = crew.orders;
            let climb = if orders.helm.climb == 0 { pending.helm.climb } else { orders.helm.climb };
            crew.orders = Orders {
                helm: Helm { climb, ..orders.helm },
                fire: orders.fire || pending.fire,
                load: orders.load.or(pending.load),
                boost: orders.boost || pending.boost,
                ..orders
            };
        }
        true
    }

    /// A player boards the captain `alongside` them: the captain is no longer scuttled for want of boarders. Answers
    /// the captain's number and ship as it sailed at sea.
    pub fn board(&mut self, player: PlayerId) -> Result<(ShipId, Hostile), BoardRefused> {
        let (id, hostile) = self.alongside(player)?;
        let (fought, _) = self.of_mut(player).ok_or(BoardRefused::NotFighting)?;
        if let Some(boarding) = fought.fight.board(id) {
            fought.pending.push(boarding);
        }
        Ok((id, hostile))
    }

    /// A boarder's own ship as they stand on a struck deck: it takes no orders or course, its helm, brace and lay let
    /// go and its sails furled.
    pub fn stand_down(&mut self, player: PlayerId) {
        let Some((fought, crew)) = self.of_mut(player) else { return };
        let Some(own) = fought.fight.ships.get_mut(&crew.ship) else { return };
        let rung = core::mem::replace(&mut own.ship.rung, 0);
        if let Some(own) = fought.crews.get_mut(&player) {
            (own.orders, own.furled_from) = (QUIET, Some(rung));
        }
    }

    /// A boarder back aboard their own ship: its sails set again at the rung they stood at as they boarded.
    pub fn stand_up(&mut self, player: PlayerId) {
        let Some((fought, crew)) = self.of_mut(player) else { return };
        let Some(rung) = crew.furled_from else { return };
        if let Some(own) = fought.fight.ships.get_mut(&crew.ship) {
            own.ship.rung = rung;
        }
        if let Some(own) = fought.crews.get_mut(&player) {
            own.furled_from = None;
        }
    }

    /// The captain a player would board: the nearest who struck within `BOARD_REACH_M` of their ship, both making less
    /// way than `BOARD_WAY_M_S`, whose deck holds a crew. Answers its number and its ship as it sailed at sea.
    pub fn alongside(&self, player: PlayerId) -> Result<(ShipId, Hostile), BoardRefused> {
        let fought =
            self.list.iter().find(|fought| fought.crews.contains_key(&player)).ok_or(BoardRefused::NotFighting)?;
        let crew = fought.crews.get(&player).ok_or(BoardRefused::NotFighting)?;
        let own = fought.fight.vessel(crew.ship).filter(|vessel| vessel.damage.fighting());
        let own = own.ok_or(BoardRefused::NotFighting)?.ship;
        let way = |ship: &Ship| libm::hypot(ship.ahead, ship.abeam);
        let alongside = fought
            .fight
            .ships
            .iter()
            .filter(|(_, vessel)| vessel.damage.state == State::Struck && vessel.command().is_some())
            // A captain whose deck would hold no crew is not boarded, its hold opening at once; nor a lesson's hulk.
            .filter(|(id, _)| {
                fought
                    .hostiles
                    .get(id)
                    .is_some_and(|hostile| crewed(hostile) && crate::sea::lessons::hulks_captain(hostile.id).is_none())
            })
            .map(|(id, vessel)| (*id, apart([own.x, own.y], [vessel.ship.x, vessel.ship.y]), way(&vessel.ship)))
            .filter(|(_, apart, its_way)| *apart <= BOARD_REACH_M && *its_way < BOARD_WAY_M_S)
            .min_by(|one, other| one.1.total_cmp(&other.1));
        let (id, _, _) = alongside.filter(|_| way(&own) < BOARD_WAY_M_S).ok_or(BoardRefused::NoneAlongside)?;
        let hostile = *fought.hostiles.get(&id).ok_or(BoardRefused::NoneAlongside)?;
        Ok((id, hostile))
    }

    /// The fight and number of the captain who sailed at sea as `hostile`, a ship of the sea's own numbering.
    fn holding(&mut self, hostile: u32) -> Option<(&mut SeaFight, ShipId)> {
        self.list.iter_mut().find_map(|fought| {
            let id = fought.hostiles.iter().find(|(_, held)| held.id == hostile).map(|(id, _)| *id)?;
            Some((fought, id))
        })
    }

    /// Where the captain who sailed at sea as `hostile` lies, and its fight's wind.
    pub fn position_of(&mut self, hostile: u32) -> Option<([f64; 2], [f64; 2])> {
        let (fought, id) = self.holding(hostile)?;
        let wind = fought.wind;
        fought.fight.vessel(id).map(|vessel| ([vessel.ship.x, vessel.ship.y], wind))
    }

    /// The captain who sailed at sea as `hostile` is scuttled, and its fight told.
    pub fn scuttle_by(&mut self, hostile: u32) {
        if let Some((fought, id)) = self.holding(hostile) {
            let told = fought.fight.scuttle(id);
            fought.pending.extend(told);
        }
    }

    /// A player leaves their fight afloat: their ship leaves the fight with the hurts it keeps.
    pub fn release(&mut self, player: PlayerId) -> Option<[f64; 3]> {
        let kept = self.hurts_of(player).map(|(kept, _)| kept);
        self.leave(player);
        kept
    }

    /// The hurts a fighting player's ship keeps as the fight has it now (a sunk ship's if it is going down), and
    /// where it lies.
    #[must_use]
    pub fn hurts_of(&self, player: PlayerId) -> Option<([f64; 3], [f64; 2])> {
        let fought = self.list.iter().find(|fought| fought.crews.contains_key(&player))?;
        let vessel = fought.fight.vessel(fought.crews.get(&player)?.ship)?;
        let going_down = matches!(vessel.damage.state, State::Sinking | State::Sunk);
        let kept = if going_down { crate::harbour::SUNK_KEPT } else { kept_of(&vessel.damage) };
        Some((kept, [vessel.ship.x, vessel.ship.y]))
    }

    /// A fighting player's ship loses `share` of its whole complement: hands who fell where the fight never saw them,
    /// on a boarded deck, so the fight's count is the one kept when it ends.
    pub fn lose_men(&mut self, player: PlayerId, share: f64) {
        let Some((fought, crew)) = self.of_mut(player) else { return };
        if let Some(vessel) = fought.fight.ships.get_mut(&crew.ship) {
            let damage = &mut vessel.damage;
            damage.crew = (damage.crew - share * damage.max_crew).max(0.0);
        }
    }

    /// A player leaves the sea: their ship leaves their fight, and a fight left with no player ends with them.
    pub fn leave(&mut self, player: PlayerId) {
        if let Some((fought, _)) = self.of_mut(player) {
            fought.take_out(player);
        }
        self.drop_empty();
    }

    /// What the fights owe the players `before` (an account's numbers before it rejoined) is owed to `player` now,
    /// once however many of them fought, and a last stand they spent stays spent.
    pub fn owe_to(&mut self, before: &[PlayerId], player: PlayerId) {
        let fought = self.list.iter_mut().flat_map(|fought| [&mut fought.fought, &mut fought.stood]);
        for players in fought.chain(self.lost.iter_mut().map(|sank| &mut sank.players)) {
            let mut seen = Vec::new();
            players.retain_mut(|each| {
                if before.contains(each) {
                    *each = player;
                }
                let first = !seen.contains(each);
                seen.push(*each);
                first
            });
        }
    }

    /// Ends each fight with no player left in it. A captain of one going down, or struck (scuttled with no boarder),
    /// goes down all the same, told with the next tick's; a friendly ship afloat sails on.
    fn drop_empty(&mut self) {
        for fought in self.list.iter().filter(|fought| fought.crews.is_empty()) {
            self.freed.extend(friends_afloat(fought));
            for (id, vessel) in &fought.fight.ships {
                let down = matches!(vessel.damage.state, State::Struck | State::Sinking);
                let going = down && vessel.command().is_some_and(|it| it.gone.is_none());
                let Some(hostile) = fought.hostiles.get(id).filter(|_| going) else { continue };
                let (at, players) = ([vessel.ship.x, vessel.ship.y], fought.fought.clone());
                self.lost.push(Sank { hostile: *hostile, at, players, wind: fought.wind, struck: struck(vessel) });
            }
        }
        self.list.retain(|fought| !fought.crews.is_empty());
    }

    /// A ship that met a player begins their fight under `weather`: the ship where it lay, under sail; their own ship
    /// hove to as `own` gives it.
    pub(crate) fn begin_met(
        &mut self,
        own: (PlayerId, Ship, [f64; 3], HullKind),
        hostile: &Hostile,
        (weather, coasts): ((Swell, [f64; 2]), &[Coast]),
        time: f64,
    ) {
        let captain = ship_at(hostile.x, hostile.y, hostile.heading, SAILS_SET);
        let waters = CoastWaters { coasts, swell: &weather.0 };
        let mut fight = Fight::meet(own.1, captain, hostile.commission, hostile.seed, &waters, time);
        fight.raise(naval::fight::CAPTAIN, hostile.strength());
        let mut fought = SeaFight::new(fight, BTreeMap::from([(naval::fight::CAPTAIN, *hostile)]), weather);
        fought.put_in(own, coasts, time);
        self.list.push(fought);
    }

    /// A fight among captains a player came on becomes theirs, under its own weather, their ship hove to as `own` gives
    /// it.
    pub(crate) fn begin_from_clash(
        &mut self,
        clash: Clash,
        own: (PlayerId, Ship, [f64; 3], HullKind),
        coasts: &[Coast],
        time: f64,
    ) {
        let hostiles = clash.crews().iter().copied().collect();
        let friends = clash.friends().iter().copied().collect();
        let mut fought = SeaFight { friends, ..SeaFight::new(clash.fight, hostiles, (clash.swell, clash.wind)) };
        fought.put_in(own, coasts, time);
        self.list.push(fought);
    }

    /// The first fight a player's ship (`own`) comes within `ENGAGE_RANGE` of; whether they joined one, their ship hove
    /// to.
    pub(crate) fn join(&mut self, own: (PlayerId, Ship, [f64; 3], HullKind), coasts: &[Coast], time: f64) -> bool {
        let Some(fought) = self.list.iter_mut().find(|fought| fought.near([own.1.x, own.1.y])) else { return false };
        fought.put_in(own, coasts, time);
        true
    }

    /// The first fight a hostile ship at sea comes within `ENGAGE_RANGE` of; whether the ship joined it, on its own
    /// side, where it lay and under sail, its temper and its chances drawn from its seed.
    pub(crate) fn join_hostile(&mut self, hostile: &Hostile, coasts: &[Coast], time: f64) -> bool {
        let Some(fought) = self.list.iter_mut().find(|fought| fought.near([hostile.x, hostile.y])) else {
            return false;
        };
        let captains = fought.fight.ships.keys().copied().filter(|id| *id < PLAYERS_FROM);
        let id = captains.max().unwrap_or(PLAYER) + 1;
        let ship = ship_at(hostile.x, hostile.y, hostile.heading, SAILS_SET);
        let waters = CoastWaters { coasts, swell: &fought.swell };
        fought.fight.enlist(id, ship, hostile.commission, hostile.seed, &waters, time);
        fought.fight.raise(id, hostile.strength());
        fought.hostiles.insert(id, *hostile);
        true
    }

    /// After the sea's ships sailed: each ship that met a player (`met`) begins their fight; each player at sea not fighting (`ships`) who comes within `ENGAGE_RANGE` of a fight joins it, or of a
    /// clash takes it for their fight; and each hostile ship within `ENGAGE_RANGE` of a fight joins it. `heave` brings
    /// a player's ship to rest for it and answers the ship with the hurts it keeps. Answers who joined a fight under
    /// way (a player, or a hostile ship's commission) and the players already in it.
    pub(crate) fn take_in(
        &mut self,
        met: Vec<(PlayerId, Hostile)>,
        ships: &[Voyager],
        (clashes, hostiles): (&mut Vec<Clash>, &mut Hostiles),
        heave: &mut impl FnMut(PlayerId) -> Option<(PlayerId, Ship, [f64; 3], HullKind)>,
        (coasts, weather, time): (&[Coast], &SeaWeather, f64),
    ) -> Vec<(Joined, Vec<PlayerId>)> {
        let mut joined = Vec::new();
        for (player, hostile) in met {
            let Some(own) = heave(player) else { continue };
            self.begin_met(own, &hostile, (weather.at([own.1.x, own.1.y], time), coasts), time);
        }
        for &Voyager { player, at, home, .. } in ships {
            if home || self.fighting(player) {
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
        let joining: Vec<usize> = (0..hostiles.sailing.len())
            .filter(|at| {
                let hostile = &hostiles.sailing[*at];
                self.list.iter().any(|fought| fought.near([hostile.x, hostile.y]))
            })
            .collect();
        for at in joining.into_iter().rev() {
            let hostile = hostiles.sailing.remove(at);
            let before = self.list.iter().find(|fought| fought.near([hostile.x, hostile.y]));
            let before = before.map(|fought| fought.crews.keys().copied().collect()).unwrap_or_default();
            if self.join_hostile(&hostile, coasts, time) {
                joined.push((Joined::Hostile(hostile.commission), before));
            }
        }
        joined
    }

    /// One tick: each fight over last tick lets its players go; each other steps by its players' orders (the climb,
    /// the fire, the load and the burst acting once); a player whose ship went down leaves it; and a fight with no
    /// player left ends. Answers what became of each player, and each captain's ship that sank.
    pub(crate) fn step(&mut self, coasts: &[Coast], time: f64) -> (Vec<Outcome>, Vec<Sank>) {
        let mut outcomes = Vec::new();
        let unseen = self.list.iter().filter(|fought| fought.fight.over().is_some() && !fought.over_sent);
        let unseen: Vec<FightSeen> = unseen.flat_map(|fought| self.seen(fought, coasts, time)).collect();
        self.ended.retain(|old| unseen.iter().all(|new| new.player != old.player));
        self.ended.extend(unseen.into_iter().map(|seen| FightSeen { may_board: false, ..seen }));
        for fought in self.list.iter().filter(|fought| fought.fight.over().is_some()) {
            self.freed.extend(friends_afloat(fought));
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
        let (mut sank, mut released) = (std::mem::take(&mut self.lost), Vec::new());
        for fought in &mut self.list {
            let orders: Vec<(ShipId, Orders)> = fought.crews.values().map(|crew| (crew.ship, crew.orders)).collect();
            let waters = CoastWaters { coasts, swell: &fought.swell };
            let wind = fought.wind;
            let stepped = fought.fight.step(&orders, &waters, &|_| wind, time);
            fought.events = std::mem::take(&mut fought.pending);
            fought.events.extend(stepped);
            for crew in fought.crews.values_mut() {
                // The climb, the fire, the load and the burst are presses: they act once.
                let helm = Helm { climb: 0, ..crew.orders.helm };
                crew.orders = Orders { helm, fire: false, load: None, boost: false, ..crew.orders };
            }
            for event in &fought.events {
                let Event::Gone { ship, end: End::Sunk } = *event else { continue };
                let (Some(hostile), Some(vessel)) = (fought.hostiles.get(&ship), fought.fight.vessel(ship)) else {
                    continue;
                };
                let (at, players) = ([vessel.ship.x, vessel.ship.y], fought.fought.clone());
                sank.push(Sank { hostile: *hostile, at, players, wind: fought.wind, struck: struck(vessel) });
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
            for (player, _) in gone {
                fought.take_out(player);
            }
            let friends = std::mem::take(&mut fought.friends).into_iter();
            let (off, kept) = friends.partition(|&pair| sailed_off(&fought.fight, pair).is_some());
            fought.friends = kept;
            released.extend(off.into_iter().filter_map(|pair: (ShipId, Friendly)| sailed_off(&fought.fight, pair)));
        }
        self.freed.extend(released);
        self.drop_empty();
        (outcomes, sank)
    }

    /// Each player in a fight with their fight, in the order the fights began and then of their number.
    pub fn each(&self) -> impl Iterator<Item = (PlayerId, &SeaFight)> + '_ {
        self.list.iter().flat_map(|fought| fought.crews.keys().map(move |player| (*player, fought)))
    }
}

#[path = "battle_at_sea.rs"]
mod at_sea;
#[path = "battle_views.rs"]
mod views;

#[cfg(test)]
#[path = "battle_tests.rs"]
mod tests;
