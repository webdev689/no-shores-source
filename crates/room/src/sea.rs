//! The sea room's law: each player's ship sails the course they set, a line of world points, at one of a ship's pace
//! steps, and no course crosses a continent's coast. It moves ships by + - * / and square root, finds a heading with
//! the pure-Rust arctangent, and judges a course against the coasts in whole metres, so every machine agrees. Pirates
//! sail among the ships (`pirates`); a bold one that meets a player fights them, at true scale, by the naval crate's
//! law, on waters made from the coasts, until she sinks or is gone, while the player's orders steer and fire. One that
//! meets a rival fights her there with no player (`clash`), and a player who comes near that fight joins it. A player
//! may leave the helm and walk their ship's deck (`deck`), her helmsman keeping her course, and take it again at the
//! wheel.

use crate::PlayerId;
use crate::battle::Fights;
pub use crate::battle::{QUIET, SeaFight};
use crate::chart::{Charted, SeaChart};
use crate::clash::{Clash, ship_at, step_clashes};
use crate::deck::{Aboard, Deck, WalkRefused};
use crate::pirates::{Pirate, Pirates, Voyager};
use crate::sea_weather::SeaWeather;
use crate::threat::{held_pace, holds};
use core::f64::consts::{PI, TAU};
use movement::{Controls, TICK_SECONDS};
use naval::fight::Orders;
use std::collections::{BTreeMap, VecDeque};
use world::check::{FRAME_HEIGHT_M, FRAME_WIDTH_M};
use world::geometry::{Point, edges, ring_contains, segments_meet};
use world::layout::Layout;
use world::traffic::Port;

/// A ship's speed at a pace of 1, metres a second.
pub const SHIP_SPEED_M_S: f64 = 12.0;
/// The paces a player may set a ship to, as multiples of its speed: DFO's steps.
pub const PACES: [u16; 7] = [5, 10, 20, 30, 40, 60, 100];
/// The world's own time, a pace of 1: the page sails its ship at it while the view is close on her, so she is seen
/// at her true speed.
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
    /// Too many points, a point that is not a number or lies outside the world's frame, or no point at all for a ship
    /// not yet at sea.
    BadCourse,
    /// A point on a continent, or a leg that meets a coast.
    CrossesLand,
    /// A course within `COURSE_EVERY_TICKS` of the player's last: judging one against the coasts takes up to a few
    /// milliseconds, so no one may ask it often enough to hold the sea's ticks back.
    TooSoon,
    /// A course, or orders, out of turn: a ship in a fight takes orders and no course, and one out of a fight the
    /// reverse.
    Fighting,
    /// A course while the player is off the helm: her helmsman keeps the one she has.
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
/// has come to the end of its course, and the pace it sailed at in its last tick, held down near a pirate (`threat`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ship {
    pub x: f64,
    pub y: f64,
    pub heading: f64,
    pub pace: u16,
    pub rate: u16,
}

/// A continent's coast, with its bounds to pass over it quickly.
#[derive(Debug)]
pub(crate) struct Coast {
    ring: Vec<Point>,
    west: i64,
    north: i64,
    east: i64,
    south: i64,
}

impl Coast {
    /// A coast round a ring of points, with its bounds.
    pub(crate) fn ring(ring: Vec<Point>) -> Coast {
        let (xs, ys) = (ring.iter().map(|point| point.x), ring.iter().map(|point| point.y));
        let (west, east) = (xs.clone().min().unwrap_or(0), xs.max().unwrap_or(0));
        let (north, south) = (ys.clone().min().unwrap_or(0), ys.max().unwrap_or(0));
        Coast { ring, west, north, east, south }
    }

    /// Each continent's coast of a layout that has three corners or more.
    pub(crate) fn of(layout: &Layout) -> Vec<Coast> {
        layout
            .continents
            .iter()
            .filter(|continent| continent.outline.len() >= 3)
            .map(|continent| Coast::ring(continent.outline.clone()))
            .collect()
    }
}

#[derive(Debug)]
struct Sailing {
    ship: Ship,
    course: VecDeque<[f64; 2]>,
}

/// A player's place at sea: their ship once it has put to sea, the tick of their last course, and the shares of hull,
/// canvas and men her hurts leave her.
#[derive(Debug)]
struct Berth {
    sailing: Option<Sailing>,
    set_at: Option<u64>,
    kept: [f64; 3],
}

impl Default for Berth {
    fn default() -> Self {
        Berth { sailing: None, set_at: None, kept: [1.0; 3] }
    }
}

/// The sea: the continents' coasts, its clock in ticks, each player's ship once it has put to sea, the pirates, each
/// player's fight and each fight among captains alone, the deck every ship has, each player off the helm walking
/// it, and the chart its hostile ships read.
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
    pirates: Pirates,
    fights: Fights,
    clashes: Vec<Clash>,
    harbour: crate::harbour::Harbour,
    decks: decks::Decks,
    islands: islands::Islands,
}

/// A point to the nearest whole metre, or None for one that is not a number or lies outside the world's frame.
pub(crate) fn whole(&[x, y]: &[f64; 2]) -> Option<Point> {
    let within = |value: f64, limit: i64| value.is_finite() && value >= 0.0 && value <= limit as f64;
    (within(x, FRAME_WIDTH_M) && within(y, FRAME_HEIGHT_M)).then(|| Point::new(x.round() as i64, y.round() as i64))
}

impl Sea {
    /// An empty sea round the layout's continents, every ship with `deck`, its pirates' chances drawn from `seed`, the
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
            pirates: Pirates::new(seed),
            fights: Fights::default(),
            clashes: Vec::new(),
            harbour: crate::harbour::Harbour {
                harbours,
                flotsam: crate::flotsam::Flotsam::new(seed),
                ..Default::default()
            },
            decks: decks::Decks::default(),
            islands: islands::Islands::new(
                seed,
                layout.continents.iter().map(|continent| continent.climate.clone().unwrap_or_default()).collect(),
            ),
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
        self.stop_repair(player);
        self.leave_decks(player);
        self.harbour.forget(player);
        self.islands.forget(player);
        self.berths.remove(&player);
        self.fights.leave(player);
        self.aboard.remove(&player);
    }

    /// The player chases the hostile ship numbered `ship`, or none: within 750 m of her she is met, whatever her temper.
    pub fn chase(&mut self, player: PlayerId, ship: Option<u32>) {
        self.pirates.chase(player, ship);
    }

    /// The player leaves the helm and stands behind the wheel on their ship's deck. Her helmsman keeps her course: under
    /// way she sails on, at rest she stays.
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
        self.aboard.insert(player, Aboard::left_helm(&self.deck, self.clock));
        Ok(())
    }

    /// The player takes the helm again, standing at the wheel.
    pub fn take_helm(&mut self, player: PlayerId) -> Result<(), HelmRefused> {
        if !self.berths.contains_key(&player) {
            return Err(HelmRefused::NoSuchPlayer);
        }
        let walking = self.aboard.get(&player).ok_or(HelmRefused::AlreadyThere)?;
        if !walking.at_wheel(&self.deck, self.clock) {
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
    /// ship not yet at sea puts to sea at the first point; one at sea starts it from where it is, to the nearest
    /// metre, so the legs it sails are the legs judged. An empty course brings a ship at sea to rest. A course is
    /// refused whole when any point lies on a continent or any leg meets a coast. A player sets one course a tick. Off
    /// the helm, only one that keeps her way is taken: her helmsman sails on, at the pace the page eases her to. One
    /// asked before the keeper answered for the player's character waits for it (`hold_course`).
    pub fn course(&mut self, player: PlayerId, points: &[[f64; 2]], pace: u16) -> Result<(), CourseRefused> {
        let clock = self.clock;
        if self.hold_course(player, points, pace) {
            return Ok(());
        }
        if self.fights.fighting(player) || self.on_deck(player) {
            return Err(CourseRefused::Fighting);
        }
        if self.aboard.contains_key(&player) && !self.keeps_her_way(player, points) {
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
            None => whole_points[0],
        };
        let legs = std::iter::once(start).chain(whole_points.iter().copied());
        let path: Vec<Point> = legs.collect();
        if self.crosses_land(&path) {
            return Err(CourseRefused::CrossesLand);
        }
        self.stop_repair(player);
        let course: VecDeque<[f64; 2]> = whole_points.iter().map(|point| [point.x as f64, point.y as f64]).collect();
        let heading = at_sea.map_or(0.0, |ship| ship.heading);
        let ship = Ship { x: start.x as f64, y: start.y as f64, heading, pace, rate: 0 };
        if let Some(berth) = self.berths.get_mut(&player) {
            berth.sailing = Some(Sailing { ship, course });
        }
        Ok(())
    }

    /// Brings a player's ship to rest turned to `heading`, radians clockwise from north: the helm turned while she lies
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

    /// Whether a course keeps the player's ship on her way while she is under way: the course she sails, its points to
    /// the whole metre, or one point straight on along her heading. Its pace may differ from hers: the page eases it to
    /// the world's own time while the player walks her deck in view, and back.
    fn keeps_her_way(&self, player: PlayerId, points: &[[f64; 2]]) -> bool {
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

    /// A fighting player's orders for the ticks to come: her helm, her lay, the fire, the brace and a load. The climb,
    /// the fire and the load act on the next tick alone.
    pub fn orders(&mut self, player: PlayerId, orders: Orders) -> Result<(), CourseRefused> {
        // On a deck her own ship takes no orders: the boarder fights on foot.
        if !self.on_deck(player) && self.fights.orders(player, orders) { Ok(()) } else { Err(CourseRefused::Fighting) }
    }

    /// One tick: each ship out of a fight sails on along its course by its pace's distance, turning onto each leg as
    /// it comes to it, and comes to rest at its course's end; each player off the helm takes the steps due; each fight
    /// steps, its player's ship where the fight has her, and each clash; the pirates sail, come and go, a bold one that
    /// meets a player begins their fight, calling them to the helm, one that meets a rival begins a clash, and a player
    /// who comes within sight of a clash joins it. A fight that ended is shown for one tick, then gone, its player at
    /// rest where it left them.
    pub fn tick(&mut self) {
        self.clock += 1;
        // The ships gone down are its last tick's: a host takes them after each, and none pile up untaken.
        self.harbour.downs.clear();
        for aboard in self.aboard.values_mut() {
            aboard.tick(&self.deck, self.clock);
        }
        let time = self.clock as f64 * TICK_SECONDS;
        let (pirates, sailing_count) = (self.pirates(), self.pirates.sailing.len());
        for (player, berth) in &mut self.berths {
            let Some(sailing) = berth.sailing.as_mut() else { continue };
            let ship = sailing.ship;
            // A ship in a clash is joined by a player who comes in sight of it, so she holds as a bold one does.
            let (chased, hull) = (self.pirates.chased(*player), berth.kept[0]);
            let pirates: Vec<([f64; 2], bool)> = (pirates.iter().enumerate())
                .map(|(at, hostile)| {
                    ([hostile.x, hostile.y], at >= sailing_count || holds(hostile, [ship.x, ship.y], chased, hull))
                })
                .collect();
            // Judged along every leg her pace would take her through this tick, so no turn of her course slips by.
            let reach = f64::from(ship.pace) * SHIP_SPEED_M_S * TICK_SECONDS;
            let held = |way: f64| held_pace(ship.pace, [ship.x, ship.y], way, pirates.iter().copied());
            sailing.ship.rate = if self.fights.fighting(*player) {
                0
            } else {
                ways_ahead(sailing, reach).into_iter().map(held).min().unwrap_or_else(|| held(ship.heading))
            };
            // Her way is her pace's by the canvas she keeps, never under half.
            sail(sailing, f64::from(sailing.ship.rate) * SHIP_SPEED_M_S * TICK_SECONDS * berth.kept[1].max(0.5));
        }
        self.tick_harbour();
        self.tick_islands();
        let (outcomes, sank) = self.fights.step(&self.coasts, time);
        self.after_fights(outcomes, &sank);
        self.tick_decks();
        let players: Vec<[f64; 2]> = self.ships().map(|(_, ship)| [ship.x, ship.y]).collect();
        step_clashes(&mut self.clashes, &mut self.pirates, &players, (&self.coasts, time));
        // Each player's waters run at the pace they sail, the world's own time at rest.
        let ships: Vec<Voyager> = self
            .ships()
            .map(|(player, ship)| Voyager {
                player,
                at: [ship.x, ship.y],
                heading: ship.heading,
                pace: ship.pace,
                fighting: self.fights.fighting(player),
                clock: f64::from(ship.rate.max(1)),
                hull: self.berths.get(&player).map_or(1.0, |berth| berth.kept[0]),
            })
            .collect();
        let islands: Vec<&Coast> = self.islands.coasts().collect();
        let chart = SeaChart { coasts: &self.coasts, charted: &self.chart, islands: &islands };
        let mut met = self.pirates.tick(TICK_SECONDS, &ships, &chart);
        ports::wary_meet(&mut self.pirates, &self.berths, &ships, &mut met);
        let mut heave = |player| heave_to((&mut self.berths, &mut self.aboard, &mut self.harbour), player);
        let at_sea = (&mut self.clashes, &mut self.pirates);
        let joined = self.fights.take_in(met, &ships, at_sea, &mut heave, (&self.coasts, &self.weather, time));
        self.tell_joined(&joined);
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

    /// The hostile ships at sea: each sailing, then each in a clash, where its fight has her. None in a player's fight.
    #[must_use]
    pub fn pirates(&self) -> Vec<Pirate> {
        let clashing = self.clashes.iter().flat_map(Clash::ships);
        self.pirates.sailing.iter().copied().chain(clashing).collect()
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

    /// Each fighting player's fight as their browser shows it (the naval crate's numbers), its lay over the fight's
    /// waters now, and its first captain's commission.
    pub fn fight_views(&self) -> Vec<crate::battle::FightSeen> {
        let time = self.clock as f64 * TICK_SECONDS;
        // One on a deck boards no other.
        let seen = self.fights.views(&self.coasts, time);
        seen.map(|seen| crate::battle::FightSeen { may_board: seen.may_board && !self.on_deck(seen.player), ..seen })
            .collect()
    }
}

/// Brings a player's ship to rest for a fight, calling them to the helm: the player, her Sloop hove to where she lies,
/// and the hurts she keeps.
fn heave_to(
    (berths, aboard, harbour): (
        &mut BTreeMap<PlayerId, Berth>,
        &mut BTreeMap<PlayerId, Aboard>,
        &mut crate::harbour::Harbour,
    ),
    player: PlayerId,
) -> Option<(PlayerId, sailing::ship::Ship, [f64; 3])> {
    let berth = berths.get_mut(&player)?;
    // A repair stops as she heaves to for a fight, keeping what it mended: the fight starts from that.
    if let Some(mended) = harbour.repairs.stop(player) {
        ports::keep(berth, &mut harbour.characters, player, mended);
    }
    let kept = berth.kept;
    let sailing = berth.sailing.as_mut()?;
    sailing.course.clear();
    (sailing.ship.pace, sailing.ship.rate) = (0, 0);
    aboard.remove(&player);
    Some((player, ship_at(sailing.ship.x, sailing.ship.y, sailing.ship.heading, 0), kept))
}

/// Whether a point lies on a continent.
pub(crate) fn on_land<'coast>(coasts: impl IntoIterator<Item = &'coast Coast>, point: Point) -> bool {
    coasts
        .into_iter()
        .filter(|coast| {
            coast.west <= point.x && coast.east >= point.x && coast.north <= point.y && coast.south >= point.y
        })
        .any(|coast| ring_contains(&coast.ring, point))
}

/// Whether a leg between two points meets a coast. A leg that never enters a coast's box, though its own box overlaps
/// it (a long leg passing a continent's corner), is told so by the box's four sides, not the coast's thousands.
pub(crate) fn leg_meets_land<'coast>(coasts: impl IntoIterator<Item = &'coast Coast>, from: Point, to: Point) -> bool {
    let (west, east) = (from.x.min(to.x), from.x.max(to.x));
    let (north, south) = (from.y.min(to.y), from.y.max(to.y));
    coasts
        .into_iter()
        .filter(|coast| coast.west <= east && coast.east >= west && coast.north <= south && coast.south >= north)
        .filter(|coast| leg_enters_box(coast, from, to))
        .any(|coast| edges(&coast.ring).any(|edge| segments_meet((from, to), edge)))
}

/// Whether a leg has an end inside a coast's box, or crosses one of its sides.
fn leg_enters_box(coast: &Coast, from: Point, to: Point) -> bool {
    let inside = |point: Point| {
        coast.west <= point.x && point.x <= coast.east && coast.north <= point.y && point.y <= coast.south
    };
    let corners = [
        Point::new(coast.west, coast.north),
        Point::new(coast.east, coast.north),
        Point::new(coast.east, coast.south),
        Point::new(coast.west, coast.south),
    ];
    inside(from) || inside(to) || edges(&corners).any(|side| segments_meet((from, to), side))
}

/// The bearing of each leg a ship sails through within `reach` metres along her course, from where she is.
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
#[path = "sea_islands.rs"]
pub mod islands;
#[path = "sea_ports.rs"]
mod ports;

#[cfg(test)]
#[path = "sea_tests.rs"]
mod sea_tests;

#[cfg(test)]
#[path = "fight_measure_tests.rs"]
mod fight_measure_tests;
