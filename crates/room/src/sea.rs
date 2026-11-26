//! The sea room's law: each player's ship sails the course they set, a line of world points, at one of a ship's pace
//! steps, and no course crosses a continent's coast. It moves ships by + - * / and square root, finds a heading with
//! the pure-Rust arctangent, and judges a course against the coasts in whole metres, so every machine agrees. Hostile
//! ships sail among them (`hostiles`); a bold one that meets a player fights them at true scale by the naval crate's
//! law, on waters made from the coasts, while the player's orders steer and fire. One that meets a friendly ship of
//! the traffic attacks it with no player (`clash`, `friendlies`), and a player who comes near joins beside the friendly
//! ship. A player may leave the helm and walk their ship's deck (`deck`), its helmsman keeping its course.

use crate::PlayerId;
use crate::battle::Fights;
pub use crate::battle::{QUIET, SeaFight};
use crate::chart::{Charted, SeaChart};
use crate::clash::{Clash, light_fight, ship_at, step_clashes};
pub(crate) use crate::coast::{Coast, leg_meets_land, on_land};
use crate::deck::{Aboard, Deck, WalkRefused};
use crate::friendlies::{Friendlies, Friendly};
use crate::hostiles::{Hostile, Hostiles, Voyager};
use crate::sea_weather::SeaWeather;
use crate::threat::{held_pace, holds};
use core::f64::consts::{PI, TAU};
use movement::{Controls, TICK_SECONDS};
use naval::fight::Orders;
use std::collections::{BTreeMap, VecDeque};
use world::check::{FRAME_HEIGHT_M, FRAME_WIDTH_M};
use world::geometry::Point;
use world::layout::Layout;
use world::traffic::Port;

/// A ship's speed at a pace of 1, metres a second.
pub const SHIP_SPEED_M_S: f64 = 12.0;
/// The paces a player may set a ship to, as multiples of its speed: DFO's steps.
pub const PACES: [u16; 7] = [5, 10, 20, 30, 40, 60, 100];
/// The world's own time, a pace of 1: the page sails its ship at it while the view is close on it, so it is seen
/// at its true speed.
pub const WORLD_PACE: u16 = 1;
/// The most points one course may hold.
pub const COURSE_LIMIT: usize = 64;
/// The fewest ticks between a player's courses: half a second, so even a full sea of sockets asking for the costliest
/// courses holds a third of the room's time at most. A browser sends its latest course once the wait is over.
pub const COURSE_EVERY_TICKS: u64 = 30;

/// How far off a ship's heading a course may lead and still hold it, radians: past what rounding its point to the
/// metre turns it, 200 m out.
const HOLD_RAD: f64 = 0.01;

/// Why a course was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CourseRefused {
    NoSuchPlayer,
    /// A pace that is not one of the steps.
    BadPace,
    /// Too many points, a point that is not a number or lies outside the world's frame, or for a ship not yet at sea no
    /// point at all or a first point off every port city's roadstead.
    BadCourse,
    /// A point on a continent, or a leg that meets a coast.
    CrossesLand,
    /// A course within `COURSE_EVERY_TICKS` of the player's last: judging one against the coasts takes up to a few
    /// milliseconds, so no one may ask it often enough to hold the sea's ticks back.
    TooSoon,
    /// A course, or orders, out of turn: a ship in a fight takes orders and no course, and one out of a fight the
    /// reverse.
    Fighting,
    /// A course while the player is off the helm: the ship's helmsman keeps the one it has.
    OffTheHelm,
}

/// Why leaving or taking the helm was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HelmRefused {
    NoSuchPlayer,
    /// The player's ship is not at sea yet.
    NotAtSea,
    /// In a fight the player keeps the helm.
    Fighting,
    /// Leaving a helm already left, or taking one already held.
    AlreadyThere,
    /// Taking the helm from anywhere but the wheel.
    NotAtTheWheel,
}

/// A ship as the sea room last moved it: where it is, its heading in radians clockwise from north, its pace, 0 once it
/// has come to the end of its course, and the pace it sailed at in its last tick, held down near a hostile (`threat`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ship {
    pub x: f64,
    pub y: f64,
    pub heading: f64,
    pub pace: u16,
    pub rate: u16,
}

#[derive(Debug)]
struct Sailing {
    ship: Ship,
    course: VecDeque<[f64; 2]>,
}

/// A player's place at sea: their ship once it has put to sea, the tick of their last course and of their last
/// travel judged, and the shares of hull, canvas and men its hurts leave it.
#[derive(Debug)]
struct Berth {
    sailing: Option<Sailing>,
    set_at: Option<u64>,
    travel_at: Option<u64>,
    kept: [f64; 3],
}

impl Default for Berth {
    fn default() -> Self {
        Berth { sailing: None, set_at: None, travel_at: None, kept: [1.0; 3] }
    }
}

/// The sea: the continents' coasts, its clock in ticks, each player's ship once it has put to sea, the hostiles, each
/// player's fight and each fight among captains alone, the deck every ship has, each player off the helm walking
/// it, the chart its hostile ships read, and the Unix minute the host keeps (`set_minute`).
#[derive(Debug)]
pub struct Sea {
    coasts: Vec<Coast>,
    chart: Charted,
    deck: Deck,
    aboard: BTreeMap<PlayerId, Aboard>,
    weather: SeaWeather,
    clock: u64,
    next_player: PlayerId,
    berths: BTreeMap<PlayerId, Berth>,
    hostiles: Hostiles,
    friendlies: Friendlies,
    fights: Fights,
    clashes: Vec<Clash>,
    harbour: crate::harbour::Harbour,
    decks: decks::Decks,
    islands: islands::Islands,
    lessons: lessons::Lessons,
    /// The minute it is, counted from the Unix epoch, as the host sets it.
    pub minute: u64,
}

/// A point to the nearest whole metre, or None for one that is not a number or lies outside the world's frame.
pub(crate) fn whole(&[x, y]: &[f64; 2]) -> Option<Point> {
    let within = |value: f64, limit: i64| value.is_finite() && value >= 0.0 && value <= limit as f64;
    (within(x, FRAME_WIDTH_M) && within(y, FRAME_HEIGHT_M)).then(|| Point::new(x.round() as i64, y.round() as i64))
}

impl Sea {
    /// An empty sea round the layout's continents, every ship with `deck`, its hostile ships' chances drawn from `seed`, the
    /// Grey Tithe patrolling the lanes between those of `ports` that are port cities.
    #[must_use]
    pub fn new(layout: &Layout, deck: Deck, seed: u32, ports: &[Port]) -> Self {
        let harbours = crate::harbour::Harbours::new(layout, ports);
        Sea {
            coasts: Coast::of(layout),
            chart: Charted::new(layout, ports),
            deck,
            aboard: BTreeMap::new(),
            weather: SeaWeather::new(layout, &harbours),
            clock: 0,
            next_player: 1,
            berths: BTreeMap::new(),
            hostiles: Hostiles::new(seed),
            friendlies: Friendlies::default(),
            fights: Fights::default(),
            clashes: Vec::new(),
            harbour: crate::harbour::Harbour {
                harbours,
                flotsam: crate::flotsam::Flotsam::new(seed),
                ..Default::default()
            },
            decks: decks::Decks::default(),
            islands: islands::Islands::new(seed, layout.continents.iter().map(islands::climate_and_resource).collect()),
            lessons: lessons::Lessons::default(),
            minute: 0,
        }
    }

    /// A new player, whose ship is not at sea until their first course.
    pub fn join(&mut self) -> PlayerId {
        let player = self.next_player;
        self.next_player += 1;
        self.berths.insert(player, Berth::default());
        self.await_keeper(player);
        player
    }

    pub fn leave(&mut self, player: PlayerId) {
        self.remember_left(player);
        self.stop_repair(player);
        self.leave_decks(player);
        self.harbour.forget(player);
        self.islands.forget(player);
        self.berths.remove(&player);
        self.fights.leave(player);
        self.aboard.remove(&player);
    }

    /// The player chases the hostile ship numbered `ship`, or none: within 750 m of it the ship is met, whatever its
    /// temper.
    pub fn chase(&mut self, player: PlayerId, ship: Option<u32>) {
        self.hostiles.chase(player, ship);
    }

    /// The player leaves the helm and stands behind the wheel on their ship's deck. Its helmsman keeps its course:
    /// under way it sails on, at rest it stays.
    pub fn leave_helm(&mut self, player: PlayerId) -> Result<(), HelmRefused> {
        let berth = self.berths.get(&player).ok_or(HelmRefused::NoSuchPlayer)?;
        if berth.sailing.is_none() {
            return Err(HelmRefused::NotAtSea);
        }
        if self.fights.fighting(player) {
            return Err(HelmRefused::Fighting);
        }
        if self.aboard.contains_key(&player) {
            return Err(HelmRefused::AlreadyThere);
        }
        let left = Aboard::left_helm(self.deck_of(player), self.clock);
        self.aboard.insert(player, left);
        Ok(())
    }

    /// The player takes the helm again, standing at the wheel.
    pub fn take_helm(&mut self, player: PlayerId) -> Result<(), HelmRefused> {
        if !self.berths.contains_key(&player) {
            return Err(HelmRefused::NoSuchPlayer);
        }
        let walking = self.aboard.get(&player).ok_or(HelmRefused::AlreadyThere)?;
        if !walking.at_wheel(self.deck_of(player), self.clock) {
            return Err(HelmRefused::NotAtTheWheel);
        }
        self.aboard.remove(&player);
        Ok(())
    }

    /// A step of the player's walk on deck, numbered, for the ticks to come.
    pub fn walk(&mut self, player: PlayerId, sequence: u32, controls: Controls) -> Result<(), WalkRefused> {
        self.aboard.get_mut(&player).ok_or(WalkRefused::NotAboard)?.walk(sequence, controls)
    }

    /// Each player off the helm, in the order of their number.
    pub fn aboard(&self) -> impl Iterator<Item = (PlayerId, &Aboard)> + '_ {
        self.aboard.iter().map(|(player, aboard)| (*player, aboard))
    }

    /// Sets a player's course: the points their ship sails through in turn, to the nearest whole metre, at `pace`. A
    /// ship not yet at sea puts to sea at the first point, by a port city's roadstead alone; one at sea starts it from
    /// where it is, to the nearest metre, so the legs it sails are the legs judged. An empty course brings a ship at
    /// sea to rest. A course is refused whole when any point lies on a continent or any leg meets a coast. A player
    /// sets one course a tick. Off the helm, only one that keeps its way is taken: its helmsman sails on, at the pace
    /// the page eases it to. One asked before the keeper answered for the player's character waits for it
    /// (`hold_course`).
    pub fn course(&mut self, player: PlayerId, points: &[[f64; 2]], pace: u16) -> Result<(), CourseRefused> {
        let clock = self.clock;
        if self.hold_course(player, points, pace) {
            return Ok(());
        }
        if self.fights.fighting(player) || self.on_deck(player) {
            return Err(CourseRefused::Fighting);
        }
        if self.aboard.contains_key(&player) && !self.keeps_its_way(player, points) {
            return Err(CourseRefused::OffTheHelm);
        }
        let berth = self.berths.get_mut(&player).ok_or(CourseRefused::NoSuchPlayer)?;
        if berth.set_at.is_some_and(|at| clock < at + COURSE_EVERY_TICKS) {
            return Err(CourseRefused::TooSoon);
        }
        berth.set_at = Some(clock);
        let at_sea = berth.sailing.as_ref().map(|sailing| sailing.ship);
        let whole_points: Option<Vec<Point>> = points.iter().map(whole).collect();
        let whole_points = whole_points.filter(|found| found.len() <= COURSE_LIMIT).ok_or(CourseRefused::BadCourse)?;
        if whole_points.is_empty() {
            let Some(sailing) = berth.sailing.as_mut() else { return Err(CourseRefused::BadCourse) };
            sailing.course.clear();
            (sailing.ship.pace, sailing.ship.rate) = (0, 0);
            self.stop_repair(player);
            return Ok(());
        }
        if pace != WORLD_PACE && !PACES.contains(&pace) {
            return Err(CourseRefused::BadPace);
        }
        let start = match at_sea {
            Some(ship) => whole(&ports::in_frame([ship.x, ship.y])).ok_or(CourseRefused::BadCourse)?,
            None => self.puts_in(player, whole_points[0]).ok_or(CourseRefused::BadCourse)?,
        };
        let legs = std::iter::once(start).chain(whole_points.iter().copied());
        let path: Vec<Point> = legs.collect();
        if self.crosses_land(player, &path) {
            return Err(CourseRefused::CrossesLand);
        }
        self.stop_repair(player);
        let course: VecDeque<[f64; 2]> = whole_points.iter().map(|point| [point.x as f64, point.y as f64]).collect();
        let heading = at_sea.map_or_else(|| self.put_in(player, start, whole_points[0]), |ship| ship.heading);
        let ship = Ship { x: start.x as f64, y: start.y as f64, heading, pace, rate: 0 };
        if let Some(berth) = self.berths.get_mut(&player) {
            berth.sailing = Some(Sailing { ship, course });
        }
        Ok(())
    }

    /// Brings a player's ship to rest turned to `heading`, radians clockwise from north: the helm turned while it lies
    /// still. It takes a course's turn, so it is asked no more often than one.
    pub fn face(&mut self, player: PlayerId, heading: f64) -> Result<(), CourseRefused> {
        if !heading.is_finite() {
            return Err(CourseRefused::BadCourse);
        }
        self.course(player, &[], 0)?;
        let berth = self.berths.get_mut(&player).ok_or(CourseRefused::NoSuchPlayer)?;
        let sailing = berth.sailing.as_mut().ok_or(CourseRefused::BadCourse)?;
        let turned = heading.rem_euclid(TAU);
        // A hair under zero comes back as a whole turn: the same way, kept in one turn.
        sailing.ship.heading = if turned < TAU { turned } else { 0.0 };
        Ok(())
    }

    /// Whether a course keeps the player's ship on its way while it is under way: the course it sails, its points to
    /// the whole metre, or one point straight on along its heading. The course's pace may differ from the ship's: the
    /// page eases it to the world's own time while the player walks the deck in view, and back.
    fn keeps_its_way(&self, player: PlayerId, points: &[[f64; 2]]) -> bool {
        let Some(sailing) = self.berths.get(&player).and_then(|berth| berth.sailing.as_ref()) else {
            return false;
        };
        let ship = sailing.ship;
        if ship.pace == 0 {
            return false;
        }
        let as_held = |point: &[f64; 2], held: &[f64; 2]| {
            #[allow(clippy::cast_precision_loss)]
            whole(point).is_some_and(|at| [at.x as f64, at.y as f64] == *held)
        };
        if points.len() == sailing.course.len()
            && points.iter().zip(&sailing.course).all(|(at, held)| as_held(at, held))
        {
            return true;
        }
        let &[[x, y]] = points else { return false };
        let bearing = libm::atan2(x - ship.x, -(y - ship.y));
        ((bearing - ship.heading + PI).rem_euclid(TAU) - PI).abs() <= HOLD_RAD
    }

    /// A fighting player's orders for the ticks to come: their helm, their lay, the fire, the brace and a load. The
    /// climb, the fire and the load act on the next tick alone.
    pub fn orders(&mut self, player: PlayerId, orders: Orders) -> Result<(), CourseRefused> {
        // On a deck the boarder's own ship takes no orders: they fight on foot.
        if !self.on_deck(player) && self.fights.orders(player, orders) { Ok(()) } else { Err(CourseRefused::Fighting) }
    }

    /// One tick: each ship out of a fight sails on along its course by its pace's distance, turning onto each leg as
    /// it comes to it, and comes to rest at its course's end; each player off the helm takes the steps due; each fight
    /// steps, its player's ship where the fight has it, and each clash; the hostiles sail, come and go, a bold one that
    /// meets a player begins their fight, calling them to the helm, one that meets a friendly ship begins a clash, and a
    /// player who comes within sight of a clash joins it; the friendly ships off their routes sail on. A fight that ended lets its player go the next tick, at rest where it
    /// left them; its last view waits for the next snapshot (`fights_sent`).
    pub fn tick(&mut self) {
        self.clock += 1;
        for (player, aboard) in &mut self.aboard {
            let hull = ports::hull_sailed(&self.harbour.characters, *player);
            aboard.tick(self.decks.hulls.get(usize::from(hull.number())).unwrap_or(&self.deck), self.clock);
        }
        let time = self.clock as f64 * TICK_SECONDS;
        let (hostiles, sailing_count) = (self.hostiles(), self.hostiles.sailing.len());
        for (player, berth) in &mut self.berths {
            let Some(sailing) = berth.sailing.as_mut() else { continue };
            let ship = sailing.ship;
            // Overlook's home waters hold no hostile ship, so no hostile holds or slows a ship inside them.
            let home = self.chart.home([ship.x, ship.y]);
            // A ship in a clash is joined by a player who comes in sight of it, so it holds as a bold one does.
            let class = naval::class::class_of(ports::hull_sailed(&self.harbour.characters, *player));
            let (chased, hull) = (self.hostiles.chased(*player), (class.hull, berth.kept[0]));
            let hostiles: Vec<([f64; 2], bool)> = (hostiles.iter().enumerate())
                .filter(|_| !home)
                .map(|(at, hostile)| {
                    ([hostile.x, hostile.y], at >= sailing_count || holds(hostile, [ship.x, ship.y], chased, hull))
                })
                .collect();
            // Judged along every leg its pace would take it through this tick, so no turn of its course slips by.
            let reach = f64::from(ship.pace) * SHIP_SPEED_M_S * class.way.max(1.0) * TICK_SECONDS;
            let held = |way: f64| held_pace(ship.pace, [ship.x, ship.y], (way, class.way), hostiles.iter().copied());
            sailing.ship.rate = if self.fights.fighting(*player) {
                0
            } else {
                ways_ahead(sailing, reach).into_iter().map(held).min().unwrap_or_else(|| held(ship.heading))
            };
            // Its way is its pace's by the canvas it keeps, never under half, and its hull's class.
            let way = berth.kept[1].max(0.5) * class.way;
            sail(sailing, f64::from(sailing.ship.rate) * SHIP_SPEED_M_S * TICK_SECONDS * way);
        }
        self.tick_harbour();
        self.give_guilds();
        self.tick_islands();
        self.fights.fit(&self.harbour.characters);
        let world_s = self.weather.world_start_s + time;
        let fights = self.fights.list.iter_mut().map(|fought| &mut fought.fight);
        for fight in fights.chain(self.clashes.iter_mut().map(|clash| &mut clash.fight)) {
            light_fight(fight, world_s);
        }
        let (outcomes, sank) = self.fights.step(&self.coasts, time);
        self.friendlies.back_from_clash(&[], std::mem::take(&mut self.fights.freed));
        self.after_fights(outcomes, &sank);
        self.tick_decks();
        let players: Vec<[f64; 2]> = self.ships().map(|(_, ship)| [ship.x, ship.y]).collect();
        let at_sea = (&mut self.hostiles, &mut self.friendlies);
        step_clashes(&mut self.clashes, at_sea, &players, (&self.coasts, time));
        // Each player's waters run at the pace they sail, the world's own time at rest.
        let ships: Vec<Voyager> = self
            .ships()
            .map(|(player, ship)| Voyager {
                player,
                at: [ship.x, ship.y],
                heading: ship.heading,
                pace: ship.pace,
                fighting: self.fights.fighting(player),
                home: self.chart.home([ship.x, ship.y]),
                clock: f64::from(ship.rate.max(1)),
                hull: self.berths.get(&player).map_or(1.0, |berth| berth.kept[0]),
                hull_kind: ports::hull_sailed(&self.harbour.characters, player),
            })
            .collect();
        let islands: Vec<&Coast> = self.islands.coasts().collect();
        let chart = SeaChart { coasts: &self.coasts, charted: &self.chart, islands: &islands };
        let mut met = self.hostiles.tick(TICK_SECONDS, &ships, &chart);
        ports::wary_meet(&mut self.hostiles, &self.berths, &ships, &mut met);
        self.friendlies.sail(TICK_SECONDS, &players, (self.chart.traffic.as_ref(), &chart), world_s);
        let traffic = (self.chart.traffic.as_ref(), &chart);
        for (tithe, friend) in self.friendlies.meet(&mut self.hostiles, traffic, world_s) {
            let weather = self.weather.at([tithe.x, tithe.y], time);
            self.clashes.push(Clash::begin((tithe, friend), weather, &self.coasts, time));
        }
        let mut heave = |player| heave_to((&mut self.berths, &mut self.aboard, &mut self.harbour), player);
        let at_sea = (&mut self.clashes, &mut self.hostiles);
        let joined = self.fights.take_in(met, &ships, at_sea, &mut heave, (&self.coasts, &self.weather, time));
        self.tell_joined(&joined);
        self.keep_lessons();
    }

    /// Sets the world time the room's clock started at, seconds since the Unix epoch: its fights' weather is the world's
    /// then.
    pub fn set_world_start(&mut self, seconds: f64) {
        self.weather.world_start_s = seconds;
    }

    /// Every ship at sea, in the order of its player's number.
    pub fn ships(&self) -> impl Iterator<Item = (PlayerId, Ship)> + '_ {
        let at_sea =
            |(&player, berth): (&PlayerId, &Berth)| berth.sailing.as_ref().map(|sailing| (player, sailing.ship));
        self.berths.iter().filter_map(at_sea)
    }

    #[must_use]
    pub fn clock(&self) -> u64 {
        self.clock
    }

    /// The hostile ships at sea: each sailing, then each in a clash, where its fight has it. None in a player's fight.
    #[must_use]
    pub fn hostiles(&self) -> Vec<Hostile> {
        let clashing = self.clashes.iter().flat_map(Clash::ships);
        self.hostiles.sailing.iter().copied().chain(clashing).collect()
    }

    /// The friendly ships the room keeps at sea: each sailing on for its port, then each in a clash, where its fight
    /// has it. None in a player's fight.
    #[must_use]
    pub fn friendlies(&self) -> Vec<Friendly> {
        let clashing = self.clashes.iter().flat_map(Clash::friendlies);
        self.friendlies.sailing.iter().copied().chain(clashing).collect()
    }

    /// Each traffic id the room has taken off its route, which the page draws no more.
    #[must_use]
    pub fn taken(&self) -> Vec<u64> {
        self.friendlies.taken().collect()
    }

    /// Each fight among captains alone at sea, in the order they began.
    #[must_use]
    pub fn clashes(&self) -> &[Clash] {
        &self.clashes
    }

    /// Each player in a fight with their fight, in the order the fights began and then of their number.
    pub fn fights(&self) -> impl Iterator<Item = (PlayerId, &SeaFight)> + '_ {
        self.fights.each()
    }
}

/// Brings a player's ship to rest for a fight, calling them to the helm: the player, their ship hove to where it lies,
/// the hurts it keeps and its hull.
fn heave_to(
    (berths, aboard, harbour): (
        &mut BTreeMap<PlayerId, Berth>,
        &mut BTreeMap<PlayerId, Aboard>,
        &mut crate::harbour::Harbour,
    ),
    player: PlayerId,
) -> Option<(PlayerId, sailing::ship::Ship, [f64; 3], sailing::HullKind)> {
    let berth = berths.get_mut(&player)?;
    // A repair stops as the ship heaves to for a fight, keeping what it mended: the fight starts from that.
    if let Some(mended) = harbour.repairs.stop(player) {
        ports::keep(berth, &mut harbour.characters, player, mended);
    }
    let kept = berth.kept;
    let sailing = berth.sailing.as_mut()?;
    sailing.course.clear();
    (sailing.ship.pace, sailing.ship.rate) = (0, 0);
    aboard.remove(&player);
    let hull = ports::hull_sailed(&harbour.characters, player);
    Some((player, ship_at(sailing.ship.x, sailing.ship.y, sailing.ship.heading, 0), kept, hull))
}

/// The bearing of each leg a ship sails through within `reach` metres along its course, from where it is.
fn ways_ahead(sailing: &Sailing, reach: f64) -> Vec<f64> {
    let (mut at, mut left, mut ways) = ([sailing.ship.x, sailing.ship.y], reach, Vec::new());
    for &[to_x, to_y] in &sailing.course {
        let (along_x, along_y) = (to_x - at[0], to_y - at[1]);
        let length = (along_x * along_x + along_y * along_y).sqrt();
        if length > 0.0 {
            ways.push(libm::atan2(along_x, -along_y));
        }
        left -= length;
        if left <= 0.0 {
            break;
        }
        at = [to_x, to_y];
    }
    ways
}

/// Moves a ship `distance` metres along its course.
fn sail(sailing: &mut Sailing, distance: f64) {
    let mut left = distance;
    while left > 0.0 {
        let Some(&[to_x, to_y]) = sailing.course.front() else {
            (sailing.ship.pace, sailing.ship.rate) = (0, 0);
            return;
        };
        let (along_x, along_y) = (to_x - sailing.ship.x, to_y - sailing.ship.y);
        let length = (along_x * along_x + along_y * along_y).sqrt();
        if length > 0.0 {
            sailing.ship.heading = libm::atan2(along_x, -along_y);
        }
        if length <= left {
            (sailing.ship.x, sailing.ship.y) = (to_x, to_y);
            sailing.course.pop_front();
            left -= length;
        } else {
            sailing.ship.x += along_x * (left / length);
            sailing.ship.y += along_y * (left / length);
            left = 0.0;
        }
    }
    if sailing.course.is_empty() {
        (sailing.ship.pace, sailing.ship.rate) = (0, 0);
    }
}

#[path = "sea_decks.rs"]
pub mod decks;
#[cfg(test)]
#[path = "fight_measure_tests.rs"]
pub(crate) mod fight_measure_tests;
#[path = "sea_guilds.rs"]
mod guilds;
#[path = "sea_islands.rs"]
pub mod islands;
#[path = "sea_lessons.rs"]
pub mod lessons;
#[path = "sea_plates.rs"]
mod plates;
pub use plates::ShipLook;
#[path = "sea_ports.rs"]
mod ports;
#[path = "sea_puts_in.rs"]
mod puts_in;
#[path = "sea_travel.rs"]
pub mod travel;

#[cfg(test)]
#[path = "sea_tests.rs"]
mod sea_tests;
#[path = "sea_waters.rs"]
mod waters;
