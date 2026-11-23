//! The Lattice's red crystal grown through a ruined city, the ruined port's people turned to it where they stood: a
//! great formation crowning the broken landmark, its tallest spire reaching back toward the height the landmark had,
//! and small shards crusting every heap of rubble. Each spire is a six-sided column tapering to a point, leaned out
//! from what it grows from; all of it seeded by the city, the same on every machine. The page grows the crystal on
//! the buildings it stands (client/src/city/overtaken.ts), by the same spire.

use crate::solids::{Material, Shape, Solid};
use land::exact::{rand01, sin_cos};

/// The faces round a spire.
pub const SPIRE_SIDES: u32 = 6;
/// A spire's body: this share of its height, its top this share of its width; the tip tapers to a point over it.
pub const BODY_SHARE: f64 = 0.75;
pub const BODY_TOP: f64 = 0.8;
/// How far back toward the height the landmark lost its crown's tallest spire reaches.
pub const CROWN_REACH: f64 = 0.85;
/// The crown's great spires round the tallest, and the small ones round its rim: least and most.
const CROWN_GREAT: [f64; 2] = [5.0, 8.0];
const CROWN_SMALL: [f64; 2] = [14.0, 20.0];
/// The small spires round a lesser crown's rim (on another kept top at the break): least and most.
const LESSER_SMALL: [f64; 2] = [2.0, 4.0];
/// The shards on a heap of rubble: least and most, and more on a breach's fall (a heap at least this high, metres).
const HEAP_SHARDS: [f64; 2] = [2.0, 5.0];
const BREACH_HIGH_M: f64 = 4.0;
/// A shard's height on a heap, metres: on the ways' rubble, and on a breach's.
const SHARD_M: [f64; 2] = [0.5, 1.6];
const BREACH_SHARD_M: [f64; 2] = [1.0, 2.8];

/// A spire of crystal standing on `foot`: a six-sided body tapering into a pointed tip, turned, leaned toward its
/// own +y and rolled about its own y, both radians.
#[must_use]
pub fn spire(foot: [f64; 3], height: f64, width: f64, turns: [f64; 3]) -> [Solid; 2] {
    let [turn, lean, roll] = turns;
    let body = Solid {
        shape: Shape::Column { sides: SPIRE_SIDES, top: BODY_TOP },
        at: foot,
        size: [width, width, height * BODY_SHARE],
        turn,
        lean,
        roll,
        material: Material::Crystal,
    };
    let tip = Solid {
        shape: Shape::Column { sides: SPIRE_SIDES, top: 0.0 },
        at: body.place([0.0, 0.0, height * BODY_SHARE]),
        size: [width * BODY_TOP, width * BODY_TOP, height * (1.0 - BODY_SHARE)],
        ..body
    };
    [body, tip]
}

/// A shard: one six-sided point, as `spire` stands it.
#[must_use]
pub fn shard(foot: [f64; 3], height: f64, width: f64, turns: [f64; 3]) -> Solid {
    let [turn, lean, roll] = turns;
    Solid {
        shape: Shape::Column { sides: SPIRE_SIDES, top: 0.0 },
        at: foot,
        size: [width, width, height],
        turn,
        lean,
        roll,
        material: Material::Crystal,
    }
}

/// The turn that leans a solid's own +y along a bearing (radians clockwise from north).
fn leaning_toward(bearing: f64) -> f64 {
    let (sine, cosine) = sin_cos(bearing);
    libm::atan2(-sine, -cosine)
}

/// A point on a solid's top, `reach` metres from its middle along a bearing in its own frame (radians clockwise
/// from its own north), where the solid stands, leaning or turned.
fn on_top(solid: &Solid, bearing: f64, reach: f64) -> [f64; 3] {
    let (sine, cosine) = sin_cos(bearing);
    solid.place([reach * sine, -reach * cosine, solid.size[2]])
}

/// A count between a least and a most from a draw.
fn count(range: [f64; 2], draw: f64) -> usize {
    (range[0] + (range[1] - range[0] + 1.0) * draw).floor().min(range[1]) as usize
}

/// The great formation crowning a broken landmark, standing on what it kept: on the broadest top of its highest kept
/// solids (those broken off at the break, or else its highest), a tallest spire from the middle of that top reaching
/// back toward `lost_to` (the height the whole landmark had), great spires round it and small ones leaning out round
/// the top's rim, every foot on that top; and a lesser crown on every other kept top at the same height.
#[must_use]
pub fn crown(kept: &[Solid], lost_to: f64, seed: u32) -> Vec<Solid> {
    let top_of = |solid: &Solid| solid.at[2] + solid.size[2];
    let highest = kept.iter().map(top_of).fold(f64::NEG_INFINITY, f64::max);
    // How much of its base a solid's top keeps across: a tapered one its taper, a shape with no flat top none.
    let top_share = |solid: &Solid| match solid.shape {
        Shape::Block => 1.0,
        Shape::Column { top, .. } | Shape::Pyramid { top } => top,
        _ => 0.0,
    };
    let breadth = |solid: &Solid| 0.5 * solid.size[0].min(solid.size[1]) * top_share(solid);
    let Some(seat) = kept
        .iter()
        .filter(|solid| top_of(solid) > highest - 1e-6 && breadth(solid) > 0.0)
        .max_by(|a, b| breadth(a).total_cmp(&breadth(b)))
    else {
        return Vec::new();
    };
    let heart = on_top(seat, 0.0, 0.0);
    // the feet keep within the top, a little in from its rim
    let radius = 0.9 * breadth(seat);
    let tallest = CROWN_REACH * (lost_to - heart[2]);
    let draw = |at: i64, salt: i64| rand01(seed, &[41, at, salt]);
    let mut crystal = Vec::new();
    let tallest_lean = 0.06 + 0.06 * draw(0, 0);
    let tallest_width = (tallest / 7.0).min(radius);
    crystal.extend(spire(
        heart,
        tallest / sin_cos(tallest_lean).1,
        tallest_width,
        [draw(0, 1) * core::f64::consts::TAU, tallest_lean, 0.0],
    ));
    let great = count(CROWN_GREAT, draw(0, 2));
    for at in 0..great {
        let at = at as i64 + 1;
        let bearing = (at as f64 + 0.6 * draw(at, 0)) * core::f64::consts::TAU / great as f64;
        let foot = on_top(seat, bearing, radius * (0.3 + 0.45 * draw(at, 1)));
        let height = tallest * (0.25 + 0.4 * draw(at, 2));
        let turns = [leaning_toward(bearing + seat.turn), 0.2 + 0.4 * draw(at, 3), 0.3 * (draw(at, 4) - 0.5)];
        crystal.extend(spire(foot, height, (height / 6.0).min(radius * 0.4), turns));
    }
    let small = count(CROWN_SMALL, draw(0, 3));
    for at in 0..small {
        let at = at as i64 + 100;
        let bearing = draw(at, 0) * core::f64::consts::TAU;
        let foot = on_top(seat, bearing, radius * (0.7 + 0.3 * draw(at, 1)));
        let height = tallest * (0.05 + 0.12 * draw(at, 2));
        let turns = [leaning_toward(bearing + seat.turn), 0.5 + 0.6 * draw(at, 3), 0.4 * (draw(at, 4) - 0.5)];
        crystal.extend(spire(foot, height, height / 4.5, turns));
    }
    // Every other kept top at the break (a span's piers, a ring of columns) bears a lesser crown: a spire from its
    // middle and a few round its rim, as tall as its top is broad allows.
    let others = kept
        .iter()
        .filter(|solid| !core::ptr::eq(*solid, seat) && top_of(solid) > highest - 1e-6 && breadth(solid) > 0.0);
    for (number, other) in others.enumerate() {
        let draw = |at: i64, salt: i64| rand01(seed, &[47, number as i64, at, salt]);
        let reach = 0.9 * breadth(other);
        let main = (tallest * (0.2 + 0.15 * draw(0, 0))).min(12.0 * reach);
        let turns = [draw(0, 1) * core::f64::consts::TAU, 0.08 + 0.1 * draw(0, 2), 0.0];
        crystal.extend(spire(on_top(other, 0.0, 0.0), main, (main / 7.0).min(reach), turns));
        for at in 1..=count(LESSER_SMALL, draw(0, 3)) as i64 {
            let bearing = draw(at, 0) * core::f64::consts::TAU;
            let foot = on_top(other, bearing, reach * (0.6 + 0.4 * draw(at, 1)));
            let height = main * (0.2 + 0.3 * draw(at, 2));
            let lean = [leaning_toward(bearing + other.turn), 0.4 + 0.5 * draw(at, 3), 0.3 * (draw(at, 4) - 0.5)];
            crystal.extend(spire(foot, height, (height / 4.5).min(reach * 0.5), lean));
        }
    }
    crystal
}

/// Small shards crusting each heap of rubble among `works` (the ways' heaps and the breaches' falls), standing out of
/// its upper slopes, more and larger on a breach's; none whose box reaches into `clear` (west, north, east, south).
#[must_use]
pub fn crusted(works: &[Solid], clear: [f64; 4], seed: u32) -> Vec<Solid> {
    let mut crystal = Vec::new();
    let heaps =
        works.iter().filter(|solid| solid.material == Material::Rubble && matches!(solid.shape, Shape::Pyramid { .. }));
    for (number, heap) in heaps.enumerate() {
        let draw = |at: i64, salt: i64| rand01(seed, &[43, number as i64, at, salt]);
        let breach = heap.size[2] >= BREACH_HIGH_M;
        let shards = count(HEAP_SHARDS, draw(0, 0)) + if breach { 3 } else { 0 };
        let heights = if breach { BREACH_SHARD_M } else { SHARD_M };
        for at in 0..shards as i64 {
            let up = 0.35 + 0.35 * draw(at, 0);
            // On the slope at that height: the heap narrows from its base toward its top (0.3 of it).
            let narrowing = 1.0 - 0.7 * up;
            let own = [
                (draw(at, 1) - 0.5) * heap.size[0] * narrowing * 0.8,
                (draw(at, 2) - 0.5) * heap.size[1] * narrowing * 0.8,
                heap.size[2] * up,
            ];
            let foot = heap.place(own);
            let height = heights[0] + (heights[1] - heights[0]) * draw(at, 3);
            let turns = [draw(at, 4) * core::f64::consts::TAU, 0.2 + 0.6 * draw(at, 5), 0.3 * (draw(at, 6) - 0.5)];
            let laid = shard(foot, height, height / 3.5, turns);
            let [west, north, east, south, ..] = laid.bounds();
            let inside = east > clear[0] && west < clear[2] && south > clear[1] && north < clear[3];
            if !inside {
                crystal.push(laid);
            }
        }
    }
    crystal
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_spires_tip_stands_on_its_leaning_body() {
        let [body, tip] = spire([10.0, 20.0, 5.0], 8.0, 2.0, [0.3, 0.4, 0.1]);
        let top = body.place([0.0, 0.0, 6.0]);
        assert!((0..3).all(|axis| (tip.at[axis] - top[axis]).abs() < 1e-12), "{:?} {top:?}", tip.at);
        assert_eq!(tip.shape, Shape::Column { sides: 6, top: 0.0 });
        assert!((tip.size[0] - 1.6).abs() < 1e-12 && (tip.size[2] - 2.0).abs() < 1e-12);
        // The page lays the same spire: client/src/city/overtaken.test.ts holds this tip's place too.
        assert!((tip.at[0] - 9.885_211).abs() < 1e-5 && (tip.at[1] - 22.398_019).abs() < 1e-5, "{:?}", tip.at);
        assert!((tip.at[2] - 10.498_757).abs() < 1e-5, "{:?}", tip.at);
    }

    #[test]
    fn a_spire_leaning_toward_a_bearing_leans_its_top_that_way() {
        let east = core::f64::consts::FRAC_PI_2;
        let [body, _] = spire([0.0; 3], 10.0, 1.0, [leaning_toward(east), 0.5, 0.0]);
        let top = body.place([0.0, 0.0, 7.5]);
        assert!(top[0] > 3.0 && top[1].abs() < 1e-9, "{top:?}");
    }

    #[test]
    fn a_crown_rises_from_the_break_toward_the_height_the_landmark_had() {
        // a shaft 120 m tall broken off 40 m up, its top 0.8 of its base across there
        let shaft = Solid::upright(
            Shape::Column { sides: 24, top: 0.8 },
            [0.0, 0.0, 40.0],
            [20.0, 20.0, 40.0],
            Material::Stone,
        );
        let crown = crown(&[shaft], 160.0, 7);
        assert_eq!(crown, super::crown(&[shaft], 160.0, 7), "the same every time");
        let bodies = crown.iter().filter(|solid| matches!(solid.shape, Shape::Column { top, .. } if top > 0.0));
        assert!(
            bodies
                .clone()
                .all(|body| (body.at[2] - 80.0).abs() < 1e-9 && libm::hypot(body.at[0], body.at[1]) <= 8.0 + 1e-9)
        );
        let top = crown.iter().map(|solid| solid.bounds()[5]).fold(f64::MIN, f64::max);
        assert!((80.0 + 0.8 * 80.0..=160.0).contains(&top), "{top}");
        assert!(crown.iter().all(|solid| solid.material == Material::Crystal && solid.at[2] >= 80.0 - 1e-9));
        assert!((2 * 6 + 2 * 14..=2 * 9 + 2 * 20).contains(&crown.len()), "{}", crown.len());
    }

    #[test]
    fn each_heap_is_crusted_with_a_few_small_shards_and_a_breach_with_more() {
        let heap = Solid::upright(Shape::Pyramid { top: 0.3 }, [500.0, 0.0, 10.0], [5.0, 4.0, 1.5], Material::Rubble);
        let breach = Solid::upright(Shape::Pyramid { top: 0.3 }, [600.0, 0.0, 10.0], [8.0, 8.0, 4.5], Material::Rubble);
        let stone = Solid::upright(Shape::Block, [700.0, 0.0, 10.0], [8.0, 8.0, 4.5], Material::Stone);
        let crust = crusted(&[heap, breach, stone], [-100.0, -100.0, 100.0, 100.0], 3);
        let on = |x: f64| crust.iter().filter(|solid| (solid.at[0] - x).abs() < 5.0).collect::<Vec<_>>();
        assert!((2..=5).contains(&on(500.0).len()) && (5..=8).contains(&on(600.0).len()) && on(700.0).is_empty());
        assert!(on(500.0).iter().all(|solid| solid.size[2] <= 1.6 && solid.at[2] > 10.0 && solid.at[2] < 11.5));
        let window = crusted(&[heap], [400.0, -100.0, 600.0, 100.0], 3);
        assert!(window.is_empty(), "nothing in the plaza's window");
    }
}
