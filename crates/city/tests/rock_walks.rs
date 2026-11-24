//! Bodies against natural rock, by the movement rules on the rock's own boxes: under a cave roof and through an arch
//! and a tunnel mouth, stopped by an overhang's face, a climber held down by its lip, and one standing on the lip
//! held up.

use city::rock::boxes;
use city::solids::{Material, Shape, Solid};
use movement::{Block, Body, Controls, Flat, Mode, TICK_SECONDS, TUNING, standing, step_body};

const NORTH: Controls = Controls {
    forward: 1.0,
    sideways: 0.0,
    yaw: 0.0,
    run: false,
    jump: false,
    crouch: false,
    mounted: false,
    boost: false,
};
const STILL: Controls = Controls { forward: 0.0, ..NORTH };

fn blocks_of(solid: &Solid) -> Vec<Block> {
    boxes(solid)
        .into_iter()
        .map(|[min_x, min_y, max_x, max_y, top, bottom]| Block { min_x, min_y, max_x, max_y, top, bottom })
        .collect()
}

/// Every body of `ticks` ticks under `controls` from `body`.
fn run(body: Body, controls: Controls, ticks: usize, blocks: &[Block]) -> Vec<Body> {
    let mut bodies = vec![body];
    for _ in 0..ticks {
        let last = bodies[bodies.len() - 1];
        bodies.push(step_body(&last, &controls, blocks, &Flat, TICK_SECONDS));
    }
    bodies
}

fn rock(shape: Shape, at: [f64; 3], size: [f64; 3]) -> Vec<Block> {
    blocks_of(&Solid::upright(shape, at, size, Material::Rubble))
}

#[test]
fn a_body_walks_under_a_cave_roof_and_through_an_arch_and_a_tunnel_mouth() {
    let pieces = [
        rock(Shape::CaveRoof { seed: 11 }, [0.0, -10.0, 3.5], [14.0, 12.0, 2.5]),
        rock(Shape::RockArch { seed: 13 }, [0.0, -10.0, 0.0], [12.0, 5.0, 10.0]),
        rock(Shape::TunnelMouth { seed: 14 }, [0.0, -10.0, 0.0], [12.0, 8.0, 9.0]),
    ];
    for blocks in pieces {
        let bodies = run(standing(0.0, 0.0), NORTH, 400, &blocks);
        let end = bodies[bodies.len() - 1];
        assert!(end.y < -20.0, "it walked through to {end:?}");
        assert!(bodies.iter().all(|body| body.z == 0.0 && body.mode == Mode::Ground), "it never left the floor");
    }
}

#[test]
fn an_overhang_stops_a_body_at_its_face_under_the_lip_and_holds_one_standing_on_the_lip() {
    let overhang = rock(Shape::Overhang { seed: 12 }, [0.0, -10.0, 0.0], [10.0, 7.0, 6.0]);
    let face = overhang[0].max_y;
    let (lip_edge, lip_top, lip_bottom) = (overhang[1].max_y, overhang[1].top, overhang[1].bottom);
    assert!(lip_bottom > 3.0 && lip_edge > face + 3.0, "the lip juts over a body's head: {overhang:?}");

    let bodies = run(standing(0.0, 0.0), NORTH, 400, &overhang);
    let end = bodies[bodies.len() - 1];
    assert!(end.y < lip_edge && end.y > face && end.y < face + 1.0, "it walked under the lip to the face: {end:?}");
    // Walking on into the face it climbs, and its head meets the lip: it gets no higher, and never past the face.
    let highest = bodies.iter().fold(0.0_f64, |high, body| high.max(body.z));
    assert!((highest - (lip_bottom - TUNING.height)).abs() < 1e-9, "it climbed to {highest} under {lip_bottom}");
    assert!(bodies.iter().all(|body| body.y > face), "never through the face");

    // Standing on the lip out past the face, over nothing but the lip.
    let on_lip = Body { z: lip_top, ..standing(0.0, (face + lip_edge) / 2.0 + 0.5) };
    let held = run(on_lip, STILL, 120, &overhang);
    assert!(held.iter().all(|body| body.z == lip_top && body.mode == Mode::Ground), "{:?}", held[held.len() - 1]);
}
