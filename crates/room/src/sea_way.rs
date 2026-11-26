//! A ship's way along its course: the bearings of the legs it sails through within a reach, and its sailing them.

use super::Sailing;

/// The bearing of each leg a ship sails through within `reach` metres along its course, from where it is.
pub(super) fn ways_ahead(sailing: &Sailing, reach: f64) -> Vec<f64> {
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
pub(super) fn sail(sailing: &mut Sailing, distance: f64) {
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
