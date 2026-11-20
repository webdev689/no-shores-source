//! The hub's section: one ring round everything walked, along the parapets' and walls' middles: the seaward walk and
//! the three courts, the Beacon Walk and the East and West Walks to the sealed gates, and the Hall through its door.

use super::courts::{HALF_DEPTH_M, HALF_LENGTH_M, PLATFORM_FROM_M};
use super::hall::hall_span;
use super::walks::{BASE_FACE_M, PLATFORM_EDGE_M, SEALED_M};
use crate::courtyard::Frame;
use crate::landmarks::BEACON_DOOR_M;

/// The ring, as points in the world, going round clockwise seen from above with seaward up.
#[must_use]
pub fn ring(frame: &Frame) -> Vec<[f64; 2]> {
    let (near, far, half) = hall_span();
    let door = BEACON_DOOR_M[0] / 2.0;
    let [sealed, corner, _, _] = SEALED_M;
    // (across, toward the sea)
    let east: [(f64, f64); 9] = [
        (HALF_LENGTH_M, HALF_DEPTH_M),
        (HALF_LENGTH_M, PLATFORM_FROM_M),
        (PLATFORM_EDGE_M, PLATFORM_FROM_M),
        (PLATFORM_EDGE_M, sealed),
        (corner, sealed),
        (corner, BASE_FACE_M),
        (door, BASE_FACE_M),
        (door, near),
        (half, near),
    ];
    let mut points: Vec<(f64, f64)> = east.to_vec();
    points.extend([(half, far), (-half, far)]);
    points.extend(east.iter().rev().map(|&(across, toward)| (-across, toward)));
    points.into_iter().map(|(across, toward)| frame.at(toward, across)).collect()
}
