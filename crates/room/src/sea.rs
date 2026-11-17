//! The sea room's law: each player's ship sails the course they set, a line of world points, at one of a ship's pace
//! steps, and no course crosses a continent's coast. It moves ships by + - * / and square root, finds a heading with
//! the pure-Rust arctangent, and judges a course against the coasts in whole metres, so every machine agrees. Pirates
//! sail among the ships (`pirates`); a bold one that meets a player fights them, at true scale, by the naval crate's
//! law, on waters made from the coasts, until she sinks or is gone, while the player's orders steer and fire.

use crate::PlayerId;
use crate::pirates::{Pirate, Pirates};
use land::sea::{FULL_DEPTH_M, Swell};
use movement::TICK_SECONDS;
use naval::fight::{Event, Fight, Orders};
use naval::wire::view_numbers;
use sailing::ship::{Helm, SAILS_SET};
use sailing::waters::{Spot, Waters, steady_wind};
use std::collections::{BTreeMap, VecDeque};
use world::check::{FRAME_HEIGHT_M, FRAME_WIDTH_M};
use world::geometry::{Point, edges, ring_contains, segments_meet};
use world::layout::Layout;

/// A ship's speed at a pace of 1, metres a second.
pub const SHIP_SPEED_M_S: f64 = 12.0;
/// The paces a player may set a ship to, as multiples of its speed: DFO's steps.
pub const PACES: [u16; 7] = [5, 10, 20, 30, 40, 60, 100];
/// The most points one course may hold.
pub const COURSE_LIMIT: usize = 64;

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
    /// A second course in one tick: a player sets at most one a tick, so no one can flood the room with work.
    TooSoon,
    /// A course, or orders, out of turn: a ship in a fight takes orders and no course, and one out of a fight the
    /// reverse.
    Fighting,
}

/// A ship as the sea room last moved it: where it is, its heading in radians clockwise from north, and its pace, 0
/// once it has come to the end of its course.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ship {
    pub x: f64,
    pub y: f64,
    pub heading: f64,
    pub pace: u16,
}

/// A continent's coast, with its bounds to pass over it quickly.
#[derive(Debug)]
struct Coast {
    ring: Vec<Point>,
    west: i64,
    north: i64,
    east: i64,
    south: i64,
}

#[derive(Debug)]
struct Sailing {
    ship: Ship,
    course: VecDeque<[f64; 2]>,
}

/// A player's place at sea: their ship once it has put to sea, and the tick of their last course.
#[derive(Debug, Default)]
struct Berth {
    sailing: Option<Sailing>,
    set_at: Option<u64>,
}

/// A player's fight: the fight, the orders it is stepped by, and what happened in its last tick.
#[derive(Debug)]
pub struct SeaFight {
    pub fight: Fight,
    pub orders: Orders,
    pub events: Vec<Event>,
}

/// The bed under the open sea in a fight, metres below its level: the swell's full depth, and more.
const SEA_BED_M: f64 = FULL_DEPTH_M * 2.0;
/// The ground over the sea on a continent, metres: dry.
const DRY_M: f64 = 5.0;

/// The waters a fight is fought on, made from the continents' coasts alone: open sea off them with the swell on it,
/// dry ground on them.
struct CoastWaters<'sea> {
    coasts: &'sea [Coast],
    swell: &'sea Swell,
}

impl Waters for CoastWaters<'_> {
    fn at(&self, x: f64, y: f64, time: f64) -> Spot {
        let point = Point::new(x.round() as i64, y.round() as i64);
        if on_land(self.coasts, point) {
            Spot { bed: DRY_M, surface: None }
        } else {
            Spot { bed: -SEA_BED_M, surface: Some(self.swell.height_at(x, y, time, SEA_BED_M)) }
        }
    }
}

/// The sea: the continents' coasts, its clock in ticks, each player's ship once it has put to sea, the pirates, and
/// each player's fight.
#[derive(Debug)]
pub struct Sea {
    coasts: Vec<Coast>,
    swell: Swell,
    clock: u64,
    next_player: PlayerId,
    berths: BTreeMap<PlayerId, Berth>,
    pirates: Pirates,
    fights: BTreeMap<PlayerId, SeaFight>,
}

/// A point to the nearest whole metre, or None for one that is not a number or lies outside the world's frame.
fn whole(&[x, y]: &[f64; 2]) -> Option<Point> {
    let within = |value: f64, limit: i64| value.is_finite() && value >= 0.0 && value <= limit as f64;
    (within(x, FRAME_WIDTH_M) && within(y, FRAME_HEIGHT_M)).then(|| Point::new(x.round() as i64, y.round() as i64))
}

impl Sea {
    /// An empty sea round the layout's continents.
    #[must_use]
    pub fn new(layout: &Layout) -> Self {
        let coasts = layout
            .continents
            .iter()
            .filter(|continent| continent.outline.len() >= 3)
            .map(|continent| {
                let ring = continent.outline.clone();
                let (xs, ys) = (ring.iter().map(|point| point.x), ring.iter().map(|point| point.y));
                let (west, east) = (xs.clone().min().unwrap_or(0), xs.max().unwrap_or(0));
                let (north, south) = (ys.clone().min().unwrap_or(0), ys.max().unwrap_or(0));
                Coast { ring, west, north, east, south }
            })
            .collect();
        Sea {
            coasts,
            swell: Swell::default(),
            clock: 0,
            next_player: 1,
            berths: BTreeMap::new(),
            pirates: Pirates::default(),
            fights: BTreeMap::new(),
        }
    }

    /// A new player, whose ship is not at sea until their first course.
    pub fn join(&mut self) -> PlayerId {
        let player = self.next_player;
        self.next_player += 1;
        self.berths.insert(player, Berth::default());
        player
    }

    pub fn leave(&mut self, player: PlayerId) {
        self.berths.remove(&player);
        self.fights.remove(&player);
    }

    /// Sets a player's course: the points their ship sails through in turn, to the nearest whole metre, at `pace`. A
    /// ship not yet at sea puts to sea at the first point; one at sea starts it from where it is, to the nearest
    /// metre, so the legs it sails are the legs judged. An empty course brings a ship at sea to rest. A course is
    /// refused whole when any point lies on a continent or any leg meets a coast. A player sets one course a tick.
    pub fn course(&mut self, player: PlayerId, points: &[[f64; 2]], pace: u16) -> Result<(), CourseRefused> {
        let clock = self.clock;
        if self.fights.contains_key(&player) {
            return Err(CourseRefused::Fighting);
        }
        let berth = self.berths.get_mut(&player).ok_or(CourseRefused::NoSuchPlayer)?;
        if berth.set_at.replace(clock) == Some(clock) {
            return Err(CourseRefused::TooSoon);
        }
        let at_sea = berth.sailing.as_ref().map(|sailing| sailing.ship);
        let whole_points: Option<Vec<Point>> = points.iter().map(whole).collect();
        let whole_points = whole_points.filter(|found| found.len() <= COURSE_LIMIT).ok_or(CourseRefused::BadCourse)?;
        if whole_points.is_empty() {
            let Some(sailing) = berth.sailing.as_mut() else { return Err(CourseRefused::BadCourse) };
            sailing.course.clear();
            sailing.ship.pace = 0;
            return Ok(());
        }
        if !PACES.contains(&pace) {
            return Err(CourseRefused::BadPace);
        }
        let start = match at_sea {
            Some(ship) => whole(&[ship.x, ship.y]).ok_or(CourseRefused::BadCourse)?,
            None => whole_points[0],
        };
        let legs = std::iter::once(start).chain(whole_points.iter().copied());
        let path: Vec<Point> = legs.collect();
        if path.iter().any(|&point| on_land(&self.coasts, point))
            || path.windows(2).any(|leg| leg_meets_land(&self.coasts, leg[0], leg[1]))
        {
            return Err(CourseRefused::CrossesLand);
        }
        let course: VecDeque<[f64; 2]> = whole_points.iter().map(|point| [point.x as f64, point.y as f64]).collect();
        let heading = at_sea.map_or(0.0, |ship| ship.heading);
        let ship = Ship { x: start.x as f64, y: start.y as f64, heading, pace };
        if let Some(berth) = self.berths.get_mut(&player) {
            berth.sailing = Some(Sailing { ship, course });
        }
        Ok(())
    }

    /// A fighting player's orders for the ticks to come: her helm, her lay, the fire, the brace and a load. The climb,
    /// the fire and the load act on the next tick alone.
    pub fn orders(&mut self, player: PlayerId, orders: Orders) -> Result<(), CourseRefused> {
        let fought = self.fights.get_mut(&player).ok_or(CourseRefused::Fighting)?;
        fought.orders = orders;
        Ok(())
    }

    /// One tick: each ship out of a fight sails on along its course by its pace's distance, turning onto each leg as
    /// it comes to it, and comes to rest at its course's end; each fight steps, its player's ship where the fight has
    /// her; the pirates sail, come and go, and a bold one that meets a player begins their fight. A fight that ended
    /// is shown for one tick, then gone, its player at rest where it left them.
    pub fn tick(&mut self) {
        self.clock += 1;
        let time = self.clock as f64 * TICK_SECONDS;
        self.fights.retain(|_, fought| fought.fight.over.is_none());
        for (player, berth) in &mut self.berths {
            let Some(sailing) = berth.sailing.as_mut() else { continue };
            if !self.fights.contains_key(player) {
                sail(sailing, f64::from(sailing.ship.pace) * SHIP_SPEED_M_S * TICK_SECONDS);
            }
        }
        let waters = CoastWaters { coasts: &self.coasts, swell: &self.swell };
        let wind = steady_wind(&self.swell);
        for (player, fought) in &mut self.fights {
            fought.events = fought.fight.step(&fought.orders, &waters, wind, time);
            // The climb, the fire and the load are presses: they act once.
            let helm = Helm { climb: 0, ..fought.orders.helm };
            fought.orders = Orders { helm, fire: false, load: None, ..fought.orders };
            if let Some(sailing) = self.berths.get_mut(player).and_then(|berth| berth.sailing.as_mut()) {
                let ship = fought.fight.player.ship;
                sailing.ship = Ship { x: ship.x, y: ship.y, heading: ship.heading, pace: 0 };
                sailing.course.clear();
            }
        }
        let ships: Vec<(PlayerId, [f64; 2], bool)> =
            self.ships().map(|(player, ship)| (player, [ship.x, ship.y], self.fights.contains_key(&player))).collect();
        let coasts = &self.coasts;
        let met = self.pirates.tick(TICK_SECONDS, &ships, |from, to| {
            let ends = [from, to].map(|[x, y]| whole(&[x, y]));
            match ends {
                [Some(from), Some(to)] => !on_land(coasts, to) && !leg_meets_land(coasts, from, to),
                _ => false,
            }
        });
        for (player, pirate) in met {
            let Some(sailing) = self.berths.get_mut(&player).and_then(|berth| berth.sailing.as_mut()) else {
                continue;
            };
            sailing.course.clear();
            sailing.ship.pace = 0;
            let at = |x: f64, y: f64, heading: f64, rung: i8| sailing::ship::Ship {
                x,
                y,
                heading,
                ahead: 0.0,
                abeam: 0.0,
                turn: 0.0,
                sail_way: 0.0,
                rung,
            };
            // She has hove to: the player sets her sails; the pirate comes on under hers.
            let own = at(sailing.ship.x, sailing.ship.y, sailing.ship.heading, 0);
            let captain = at(pirate.x, pirate.y, pirate.heading, SAILS_SET);
            let fight = Fight::meet(own, captain, pirate.seed, &waters, time);
            self.fights.insert(player, SeaFight { fight, orders: QUIET, events: Vec::new() });
        }
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

    /// The pirates at sea, none of them in a fight.
    #[must_use]
    pub fn pirates(&self) -> &[Pirate] {
        &self.pirates.sailing
    }

    /// Each player's fight, in the order of their number.
    pub fn fights(&self) -> impl Iterator<Item = (PlayerId, &SeaFight)> + '_ {
        self.fights.iter().map(|(player, fought)| (*player, fought))
    }

    /// Each player's fight as their browser shows it (the naval crate's numbers), its lay over the fight's waters
    /// now, in the order of their number.
    pub fn fight_views(&self) -> impl Iterator<Item = (PlayerId, Vec<f64>)> + '_ {
        let waters = CoastWaters { coasts: &self.coasts, swell: &self.swell };
        let time = self.clock as f64 * TICK_SECONDS;
        self.fights.iter().map(move |(player, fought)| {
            (*player, view_numbers(&fought.fight, &fought.events, fought.orders.aim.as_ref(), &waters, time))
        })
    }
}

/// Orders for a fight just begun: the helm amidships, no lay, nothing fired, braced or loaded.
const QUIET: Orders =
    Orders { helm: Helm { steer: 0.0, crab: false, climb: 0 }, aim: None, fire: false, brace: false, load: None };

/// Whether a point lies on a continent.
fn on_land(coasts: &[Coast], point: Point) -> bool {
    coasts
        .iter()
        .filter(|coast| {
            coast.west <= point.x && coast.east >= point.x && coast.north <= point.y && coast.south >= point.y
        })
        .any(|coast| ring_contains(&coast.ring, point))
}

/// Whether a leg between two points meets a coast.
fn leg_meets_land(coasts: &[Coast], from: Point, to: Point) -> bool {
    let (west, east) = (from.x.min(to.x), from.x.max(to.x));
    let (north, south) = (from.y.min(to.y), from.y.max(to.y));
    coasts
        .iter()
        .filter(|coast| coast.west <= east && coast.east >= west && coast.north <= south && coast.south >= north)
        .any(|coast| edges(&coast.ring).any(|edge| segments_meet((from, to), edge)))
}

/// Moves a ship `distance` metres along its course.
fn sail(sailing: &mut Sailing, distance: f64) {
    let mut left = distance;
    while left > 0.0 {
        let Some(&[to_x, to_y]) = sailing.course.front() else {
            sailing.ship.pace = 0;
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
        sailing.ship.pace = 0;
    }
}

#[cfg(test)]
#[path = "sea_tests.rs"]
mod sea_tests;
