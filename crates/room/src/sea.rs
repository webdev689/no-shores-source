//! The sea room's law: each player's ship sails the course they set, a line of world points, at one of a ship's pace
//! steps, and no course crosses a continent's coast. It moves ships by + - * / and square root, finds a heading with
//! the pure-Rust arctangent, and judges a course against the coasts in whole metres, so every machine agrees.

use crate::PlayerId;
use movement::TICK_SECONDS;
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

/// The sea: the continents' coasts, its clock in ticks, and each player's ship once it has put to sea.
#[derive(Debug)]
pub struct Sea {
    coasts: Vec<Coast>,
    clock: u64,
    next_player: PlayerId,
    berths: BTreeMap<PlayerId, Berth>,
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
        Sea { coasts, clock: 0, next_player: 1, berths: BTreeMap::new() }
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
    }

    /// Whether a point lies on a continent, or a leg between two meets a coast.
    fn on_land(&self, point: Point) -> bool {
        self.coasts.iter().any(|coast| ring_contains(&coast.ring, point))
    }

    fn leg_meets_land(&self, from: Point, to: Point) -> bool {
        let (west, east) = (from.x.min(to.x), from.x.max(to.x));
        let (north, south) = (from.y.min(to.y), from.y.max(to.y));
        self.coasts
            .iter()
            .filter(|coast| coast.west <= east && coast.east >= west && coast.north <= south && coast.south >= north)
            .any(|coast| edges(&coast.ring).any(|edge| segments_meet((from, to), edge)))
    }

    /// Sets a player's course: the points their ship sails through in turn, to the nearest whole metre, at `pace`. A
    /// ship not yet at sea puts to sea at the first point; one at sea starts it from where it is, to the nearest
    /// metre, so the legs it sails are the legs judged. An empty course brings a ship at sea to rest. A course is
    /// refused whole when any point lies on a continent or any leg meets a coast. A player sets one course a tick.
    pub fn course(&mut self, player: PlayerId, points: &[[f64; 2]], pace: u16) -> Result<(), CourseRefused> {
        let clock = self.clock;
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
        if path.iter().any(|&point| self.on_land(point))
            || path.windows(2).any(|leg| self.leg_meets_land(leg[0], leg[1]))
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

    /// One tick: each ship sails on along its course by its pace's distance, turning onto each leg as it comes to it,
    /// and comes to rest at its course's end.
    pub fn tick(&mut self) {
        self.clock += 1;
        for sailing in self.berths.values_mut().filter_map(|berth| berth.sailing.as_mut()) {
            sail(sailing, f64::from(sailing.ship.pace) * SHIP_SPEED_M_S * TICK_SECONDS);
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
