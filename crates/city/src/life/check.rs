//! A social plan's ways and posts checked with the movement rules, for the tests of every social plan's ways: every
//! link walked by a body from end to end over the plan's ground and boxes, never stepping up or down more than a
//! body steps, inside the ring, and `CLEAR_M` clear of every box in a body's way either side of its line; every point
//! joined to the rest; every post walked to from its way point; no point or post inside a box.

use super::{Post, Ways};
use crate::collision::Box2;
use movement::blocks::{ground_at, room_at};
use movement::{Block, Blocks, Body, Controls, Mode, TICK_SECONDS, TUNING, Terrain, standing, step_body};

/// How far a way keeps from every box either side of its line, metres: room for a body (0.6 m) and the 0.7 m a walker
/// keeps right of the way's middle.
pub(crate) const CLEAR_M: f64 = 1.3;
/// How far a walked body may stray from its line before it counts as pushed off it, metres.
const STRAY_M: f64 = 0.05;

/// What is wrong with a plan's ways and posts, one line each; none for ways that hold.
pub(crate) fn faults(
    ways: &Ways,
    posts: &[Post],
    ring: &[[f64; 2]],
    boxes: &[Box2],
    terrain: &dyn Terrain,
) -> Vec<String> {
    let list: Vec<Block> = boxes
        .iter()
        .map(|&[min_x, min_y, max_x, max_y, top, bottom]| Block { min_x, min_y, max_x, max_y, top, bottom })
        .collect();
    let floor = Floor { ring, blocks: Blocks::new(list.clone()), list, terrain };
    let count = ways.points.len();
    let mut faults = Vec::new();
    let named = |index: u32| ways.points.get(index as usize).map(|point| (point.at, point.name.as_str()));
    for link in &ways.links {
        let (Some((from, _)), Some((to, _))) = (named(link[0]), named(link[1])) else {
            faults.push(format!("the link {link:?} names a point of {count}"));
            continue;
        };
        if let Err(fault) = floor.walk(from, to, true) {
            faults.push(format!("the link {link:?} from {from:?} to {to:?}: {fault}"));
        }
    }
    for (index, point) in ways.points.iter().enumerate() {
        if let Some(fault) = floor.stands(point.at) {
            faults.push(format!("the point {index} \"{}\" at {:?} {fault}", point.name, point.at));
        }
    }
    for unjoined in unjoined(ways) {
        faults.push(format!("the point {unjoined} is not joined to the point 0"));
    }
    for post in posts {
        let Some((from, name)) = named(post.reached_from) else {
            faults.push(format!("the post at {:?} is reached from a point of {count}", post.at));
            continue;
        };
        let walked = floor.walk(from, post.at, false).err();
        if let Some(fault) = walked.or_else(|| floor.stands(post.at)) {
            faults.push(format!("the {:?} post at {:?} from \"{name}\": {fault}", post.task, post.at));
        }
    }
    faults
}

/// The points no link joins to the first.
fn unjoined(ways: &Ways) -> Vec<usize> {
    let mut reached = vec![false; ways.points.len()];
    let mut ahead = vec![0_usize];
    while let Some(here) = ahead.pop() {
        if reached.get(here).copied() != Some(false) {
            continue;
        }
        reached[here] = true;
        for &[one, two] in &ways.links {
            let (one, two) = (one as usize, two as usize);
            if one == here {
                ahead.push(two);
            } else if two == here {
                ahead.push(one);
            }
        }
    }
    reached.iter().enumerate().filter(|(_, reached)| !**reached).map(|(index, _)| index).collect()
}

/// What a body walks on: the ring it keeps inside, the boxes (as listed, and gridded for the movement rules) and the
/// ground.
struct Floor<'plan> {
    ring: &'plan [[f64; 2]],
    list: Vec<Block>,
    blocks: Blocks,
    terrain: &'plan dyn Terrain,
}

impl Floor<'_> {
    /// What is wrong with a body standing at `at`, if anything.
    fn stands(&self, at: [f64; 2]) -> Option<String> {
        let z = self.floor_at(at);
        if !inside(self.ring, at) {
            Some("stands outside the ring".to_owned())
        } else if !room_at(&self.blocks, at[0], at[1], z, TUNING.height) {
            Some("stands in a box".to_owned())
        } else {
            None
        }
    }

    fn floor_at(&self, at: [f64; 2]) -> f64 {
        ground_at(&self.blocks, self.terrain, at[0], at[1], self.terrain.height_at(at[0], at[1]))
    }

    /// A body walked from `from` to `to` by the movement rules, kept aimed at `to`: it must get there, on its feet
    /// all the way, never stepping more than a step, inside the ring, and, along a way (`clear`), `CLEAR_M` from
    /// every box in its way.
    fn walk(&self, from: [f64; 2], to: [f64; 2], clear: bool) -> Result<(), String> {
        let length = libm::hypot(to[0] - from[0], to[1] - from[1]);
        let ticks = (length / (TUNING.walk * TICK_SECONDS) * 1.5) as usize + 120;
        let mut body = Body { z: self.floor_at(from), ..standing(from[0], from[1]) };
        for _ in 0..ticks {
            let left = [to[0] - body.x, to[1] - body.y];
            if libm::hypot(left[0], left[1]) <= TUNING.walk * TICK_SECONDS {
                return Ok(());
            }
            let yaw = libm::atan2(left[0], -left[1]);
            let controls =
                Controls { forward: 1.0, sideways: 0.0, yaw, run: false, jump: false, crouch: false, mounted: false };
            let next = step_body(&body, &controls, &self.blocks, self.terrain, TICK_SECONDS);
            let place = [next.x, next.y];
            if next.mode != Mode::Ground {
                return Err(format!("leaves its feet at {place:?}"));
            }
            if (next.z - body.z).abs() > TUNING.step + 1e-9 {
                return Err(format!("steps {:.2} m at {place:?}", next.z - body.z));
            }
            if !inside(self.ring, place) {
                return Err(format!("leaves the ring at {place:?}"));
            }
            if off_line(from, to, place) > STRAY_M {
                return Err(format!("is pushed off its line at {place:?}"));
            }
            if clear && let Some(near) = self.nearest_in_the_way(place, next.z) {
                return Err(format!("passes {near:.2} m from a box at {place:?}"));
            }
            body = next;
        }
        Err(format!("never gets there, stopping at {:?}", [body.x, body.y]))
    }

    /// How near a box in a body's way at feet height `z` comes to `place`, if one comes within `CLEAR_M`.
    fn nearest_in_the_way(&self, place: [f64; 2], z: f64) -> Option<f64> {
        self.list
            .iter()
            .filter(|block| block.top > z + TUNING.step && block.bottom < z + TUNING.height)
            .map(|block| {
                let out_x = (block.min_x - place[0]).max(place[0] - block.max_x).max(0.0);
                let out_y = (block.min_y - place[1]).max(place[1] - block.max_y).max(0.0);
                libm::hypot(out_x, out_y)
            })
            .filter(|&apart| apart < CLEAR_M)
            .reduce(f64::min)
    }
}

/// How far `place` stands from the line from `from` to `to`, metres.
fn off_line(from: [f64; 2], to: [f64; 2], place: [f64; 2]) -> f64 {
    let along = [to[0] - from[0], to[1] - from[1]];
    let length = libm::hypot(along[0], along[1]).max(1e-9);
    ((place[0] - from[0]) * along[1] - (place[1] - from[1]) * along[0]).abs() / length
}

/// Whether a point stands inside a ring, its edges included.
fn inside(ring: &[[f64; 2]], [x, y]: [f64; 2]) -> bool {
    let mut within = false;
    for (index, &[x1, y1]) in ring.iter().enumerate() {
        let [x2, y2] = ring[(index + 1) % ring.len()];
        let on_edge = ((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)).abs() < 1e-9
            && x >= x1.min(x2) - 1e-9
            && x <= x1.max(x2) + 1e-9
            && y >= y1.min(y2) - 1e-9
            && y <= y1.max(y2) + 1e-9;
        if on_edge {
            return true;
        }
        if (y1 > y) != (y2 > y) && x < x1 + (y - y1) * (x2 - x1) / (y2 - y1) {
            within = !within;
        }
    }
    within
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::life::{Keep, Task};
    use movement::Flat;

    const RING: [[f64; 2]; 4] = [[-50.0, -50.0], [50.0, -50.0], [50.0, 50.0], [-50.0, 50.0]];

    /// A way 20 m east from the middle, and a post a metre north of its far end.
    fn east_way() -> (Ways, Vec<Post>) {
        let mut ways = Ways::default();
        let points = [ways.point([0.0, 0.0], ""), ways.point([20.0, 0.0], "end")];
        ways.line(&points);
        let post = Post { task: Task::Idle, at: [20.0, -1.0], facing: 0.0, keep: Keep::Visited, reached_from: 1 };
        (ways, vec![post])
    }

    fn faults_with(boxes: &[Box2]) -> Vec<String> {
        let (ways, posts) = east_way();
        faults(&ways, &posts, &RING, boxes, &Flat)
    }

    #[test]
    fn an_open_way_holds() {
        assert_eq!(faults_with(&[]), Vec::<String>::new());
        assert_eq!(faults_with(&[[8.0, 1.4, 9.0, 2.0, 1.0, 0.0]]), Vec::<String>::new(), "1.4 m off its line");
        assert_eq!(faults_with(&[[8.0, -2.0, 9.0, 0.5, 0.3, 0.0]]), Vec::<String>::new(), "a kerb is stepped");
        assert_eq!(faults_with(&[[8.0, -2.0, 9.0, 2.0, 4.0, 2.2]]), Vec::<String>::new(), "a lintel is walked under");
    }

    #[test]
    fn a_box_beside_a_way_too_near_its_line_or_across_it_is_found() {
        let beside = faults_with(&[[8.0, 1.0, 9.0, 2.0, 1.0, 0.0]]);
        assert!(beside.len() == 1 && beside[0].contains("from a box"), "{beside:?}");
        let across = faults_with(&[[8.0, -2.0, 9.0, 2.0, 1.0, 0.0]]);
        assert!(across.iter().any(|fault| fault.contains("[0, 1]")), "{across:?}");
    }

    #[test]
    fn a_step_too_high_a_point_off_the_ways_and_a_post_in_a_box_are_found() {
        let (mut ways, mut posts) = east_way();
        // A rise of 0.6 m part way along, under a box low enough to walk into but over a step.
        let boxes = [[10.0, -5.0, 30.0, 5.0, 0.6, 0.0]];
        let found = faults(&ways, &posts, &RING, &boxes, &Flat);
        assert!(found.iter().any(|fault| fault.contains("[0, 1]")), "{found:?}");
        ways.point([-10.0, 0.0], "alone");
        posts[0].at = [20.0, -60.0];
        let found = faults(&ways, &posts, &RING, &[], &Flat);
        assert!(found.iter().any(|fault| fault.contains("point 2 is not joined")), "{found:?}");
        assert!(found.iter().any(|fault| fault.contains("Idle") && fault.contains("ring")), "{found:?}");
    }
}
