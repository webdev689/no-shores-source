//! Stage A, World 2.0's footprint: rays out from the landmark until the sea, a lake, ground too steep to build, or
//! the city's radius. The city is the ground the rays reach, so a port city's wall bends round its harbour and its
//! hills instead of standing as a circle in the sea.

use crate::grid::RADIUS_M;
use land::exact::sin_cos;
use land::ground::{Ground, WaterAt};
use serde::Serialize;

/// How many rays, and how far each steps, metres.
pub const RAYS: usize = 48;
pub const RAY_STEP_M: f64 = 25.0;
/// Ground steeper than this, rise over run, stops a ray.
pub const STEEPEST: f64 = 0.45;
/// The lowest ground a city builds on, metres: below it is the shore.
pub const SHORE_M: f64 = 1.5;
/// The least reach a ray keeps, metres, so a ray that meets the sea at once still leaves the landmark its ground.
const LEAST_REACH_M: f64 = 300.0;

/// Why a ray stopped.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Stop {
    Reach,
    Shore,
    Lake,
    Steep,
}

/// One ray: its direction (east, south), how far the city reaches along it, and why it stopped.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Ray {
    pub direction: [f64; 2],
    pub reach: f64,
    pub stop: Stop,
}

/// The city's footprint: its rays round the landmark.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Footprint {
    pub centre: [f64; 2],
    pub rays: Vec<Ray>,
}

/// The ray directions, clockwise from north.
#[must_use]
pub fn directions() -> [[f64; 2]; RAYS] {
    std::array::from_fn(|ray| {
        let (sine, cosine) = sin_cos(std::f64::consts::TAU * ray as f64 / RAYS as f64);
        [sine, -cosine]
    })
}

/// The rise over run of the ground at a point, measured across 25 m.
#[must_use]
pub fn slope_at(ground: &Ground, x: f64, y: f64) -> f64 {
    let east = (ground.height_at(x + 12.5, y) - ground.height_at(x - 12.5, y)) / 25.0;
    let south = (ground.height_at(x, y + 12.5) - ground.height_at(x, y - 12.5)) / 25.0;
    (east * east + south * south).sqrt()
}

/// What stops a ray at a point, if anything.
fn stop_at(ground: &Ground, x: f64, y: f64) -> Option<Stop> {
    match ground.water_at(x, y) {
        WaterAt::Sea => return Some(Stop::Shore),
        WaterAt::Lake { .. } => return Some(Stop::Lake),
        WaterAt::Dry | WaterAt::River { .. } => {}
    }
    if ground.height_at(x, y) < SHORE_M {
        Some(Stop::Shore)
    } else if slope_at(ground, x, y) > STEEPEST {
        Some(Stop::Steep)
    } else {
        None
    }
}

impl Footprint {
    /// Casts the rays round the landmark at `centre` and smooths their reaches, one quarter each side.
    #[must_use]
    pub fn cast(ground: &Ground, centre: [f64; 2]) -> Self {
        let raw: Vec<Ray> = directions()
            .into_iter()
            .map(|direction| {
                let mut reach = 0.0;
                let mut stop = Stop::Reach;
                let mut distance = RAY_STEP_M;
                while distance <= RADIUS_M {
                    let (x, y) = (centre[0] + direction[0] * distance, centre[1] + direction[1] * distance);
                    if let Some(found) = stop_at(ground, x, y).filter(|_| distance > LEAST_REACH_M) {
                        stop = found;
                        break;
                    }
                    reach = distance;
                    distance += RAY_STEP_M;
                }
                Ray { direction, reach, stop }
            })
            .collect();
        let rays = (0..RAYS)
            .map(|ray| {
                let (before, after) = (raw[(ray + RAYS - 1) % RAYS].reach, raw[(ray + 1) % RAYS].reach);
                Ray { reach: (before + 2.0 * raw[ray].reach + after) / 4.0, ..raw[ray] }
            })
            .collect();
        Self { centre, rays }
    }

    /// The ray pointing nearest a direction from the centre: the largest dot product, so no angle is taken.
    #[must_use]
    pub fn ray_toward(&self, east: f64, south: f64) -> usize {
        let mut best = (f64::MIN, 0);
        for (index, ray) in self.rays.iter().enumerate() {
            let dot = ray.direction[0] * east + ray.direction[1] * south;
            if dot > best.0 {
                best = (dot, index);
            }
        }
        best.1
    }

    /// Whether a world point lies within the footprint, `margin` metres past its reach counting as inside.
    #[must_use]
    pub fn holds(&self, x: f64, y: f64, margin: f64) -> bool {
        let (east, south) = (x - self.centre[0], y - self.centre[1]);
        let distance = (east * east + south * south).sqrt();
        distance <= self.rays[self.ray_toward(east, south)].reach + margin
    }

    /// The footprint's edge as a ring of world points, one a ray.
    #[must_use]
    pub fn ring(&self) -> Vec<[f64; 2]> {
        self.rays
            .iter()
            .map(|ray| [self.centre[0] + ray.direction[0] * ray.reach, self.centre[1] + ray.direction[1] * ray.reach])
            .collect()
    }

    /// The direction from the landmark toward the sea: the mean of the rays the shore stopped, or none.
    #[must_use]
    pub fn seaward(&self) -> Option<[f64; 2]> {
        let shore: Vec<&Ray> = self.rays.iter().filter(|ray| ray.stop == Stop::Shore).collect();
        let (east, south) = shore.iter().fold((0.0, 0.0), |sum, ray| {
            // A nearer shore pulls harder, so the harbour's own bay wins over a far one.
            let weight = 1.0 / ray.reach.max(RAY_STEP_M);
            (sum.0 + ray.direction[0] * weight, sum.1 + ray.direction[1] * weight)
        });
        let length = (east * east + south * south).sqrt();
        (length > 0.0).then(|| [east / length, south / length])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_rays_go_round_clockwise_from_north() {
        let rays = directions();
        assert!((rays[0][1] + 1.0).abs() < 1e-12, "north is up the page: south negative");
        assert!((rays[RAYS / 4][0] - 1.0).abs() < 1e-12, "a quarter round is east");
        for ray in rays {
            assert!((ray[0] * ray[0] + ray[1] * ray[1] - 1.0).abs() < 1e-12);
        }
    }

    fn round_footprint(reach: f64) -> Footprint {
        let rays = directions().into_iter().map(|direction| Ray { direction, reach, stop: Stop::Reach }).collect();
        Footprint { centre: [10_000.0, 10_000.0], rays }
    }

    #[test]
    fn a_point_inside_the_reach_is_held_and_one_past_it_is_not() {
        let footprint = round_footprint(1_000.0);
        assert!(footprint.holds(10_900.0, 10_000.0, 0.0));
        assert!(!footprint.holds(11_100.0, 10_000.0, 0.0));
        assert!(footprint.holds(11_100.0, 10_000.0, 150.0));
    }

    #[test]
    fn the_seaward_way_follows_the_shore_rays() {
        let mut footprint = round_footprint(1_000.0);
        for ray in &mut footprint.rays[RAYS / 4 - 2..=RAYS / 4 + 2] {
            ray.stop = Stop::Shore;
        }
        let seaward = footprint.seaward().unwrap();
        assert!(seaward[0] > 0.99, "east: {seaward:?}");
        assert!(round_footprint(1_000.0).seaward().is_none());
    }
}
