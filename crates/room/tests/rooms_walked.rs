//! The Saltgrass Downs' walk-in buildings, as the bake lays them, walked by the movement rules: a body walks in through
//! every ground-floor door, and up to every upper floor.

use layout::book::Measure;
use layout::seat::Seated;
use movement::{Block, Blocks, Controls, Mode, TICK_SECONDS, step_body};
use room::{Floor, standing_on};
use std::path::Path;

/// A storey floor to floor, and the least room over a floor: a wing whose eaves leave both has an upper floor.
const STOREY_M: f64 = 3.2;
const LEAST_ROOM_M: f64 = 2.4;

struct Downs {
    floor: Floor,
    blocks: Blocks,
    buildings: Vec<(Seated, Measure)>,
}

fn downs() -> Downs {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let layout = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let continent = layout.continents.into_iter().find(|continent| continent.id == "continent-1").expect("continent-1");
    let edits = land::edits::parse(&read("content/world/land/continent-1.json")).expect("the edits parse");
    let builders = bake::builders(&root).expect("the builders read");
    let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
    let mut landmass = land::landmass::generate(&continent, edits.clone()).expect("continent-1 generates");
    city::settle(&mut landmass, &city).expect("its city settles");
    let layouts = layout::settle::settle(&mut landmass, &builders.book, &builders.briefs);
    let laid = layouts.into_iter().find(|layout| layout.id == "saltgrass-downs").expect("the Saltgrass Downs lay out");
    let nodes = bake::nodes_of(&continent, edits, &city, &builders).expect("continent-1 bakes");
    let node = nodes.into_iter().find(|node| node.id == "saltgrass-downs").expect("the Saltgrass Downs bake");
    let blocks = Blocks::new(node.boxes.iter().map(Block::from_floats).collect());
    let buildings = laid.seating.buildings.into_iter().filter(|building| building.open);
    let buildings = buildings.map(|building| {
        let measure = builders.book.buildings[&building.model].clone();
        (building, measure)
    });
    Downs { floor: Floor::Land(Box::new(node.ground)), blocks, buildings: buildings.collect() }
}

/// A point of a building's plan (x right, z forward) in the world, and a way in its plan as a way in the world, as
/// the layout turns them: by its yaw snapped to a quarter turn.
fn turned(building: &Seated) -> impl Fn([f64; 2]) -> [f64; 2] {
    let quarter = ((building.yaw / 90.0).round() as i64).rem_euclid(4) as usize;
    let (cosine, sine) = [(1.0, 0.0), (0.0, 1.0), (-1.0, 0.0), (0.0, -1.0)][quarter];
    move |[x, z]| [x * cosine + z * sine, x * sine - z * cosine]
}

fn walk(downs: &Downs, from: [f64; 2], yaw: f64, ticks: usize) -> Vec<movement::Body> {
    let mut body = standing_on(&downs.floor, &downs.blocks, from[0], from[1]);
    let controls = Controls { forward: 1.0, yaw, ..Controls::default() };
    (0..ticks)
        .map(|_| {
            body = step_body(&body, &controls, &downs.blocks, &downs.floor, TICK_SECONDS);
            body
        })
        .collect()
}

#[test]
fn a_body_walks_in_at_every_door_and_up_to_every_upper_floor() {
    let downs = downs();
    assert!(downs.buildings.len() > 10, "the Saltgrass Downs walk into {} buildings", downs.buildings.len());
    let mut blocked = Vec::new();
    let mut upper = 0;
    for (building, measure) in &downs.buildings {
        let turn = turned(building);
        let at = |plan: [f64; 2]| {
            let [east, south] = turn(plan);
            [building.at[0] + east, building.at[1] + south]
        };
        // From 2.5 m outside each ground-floor door, straight in through it.
        for door in measure.doors.iter().filter(|door| door.sill[1] < measure.min[1] + 0.8) {
            let middle = at([(door.sill[0] + door.sill_end[0]) / 2.0, (door.sill[2] + door.sill_end[2]) / 2.0]);
            let out = turn([door.out[0], door.out[2]]);
            let from = [middle[0] + out[0] * 2.5, middle[1] + out[1] * 2.5];
            let last = *walk(&downs, from, libm::atan2(-out[0], out[1]), 240).last().expect("it walked");
            let inward = (last.x - middle[0]) * -out[0] + (last.y - middle[1]) * -out[1];
            if inward < 1.0 {
                blocked.push(format!(
                    "model {} at {:?}: the door at {middle:?} stops a body {inward:.2} m in",
                    building.model, building.at
                ));
            }
        }
        // An upper floor: some walk from the ground floor, on a metre's grid to half a metre inside the footprint and
        // each quarter, stands on it.
        let eaves = measure.plan.iter().map(|wing| wing.eaves).fold(0.0, f64::max);
        if eaves < measure.min[1] + STOREY_M + LEAST_ROOM_M {
            continue;
        }
        upper += 1;
        let [west, north, east, south] = building.footprint;
        let starts = (1..).map(|step| west + f64::from(step)).take_while(|&x| x < east - 0.5).flat_map(|x| {
            (1..).map(move |step| [x, north + f64::from(step)]).take_while(move |point| point[1] < south - 0.5)
        });
        let reached = starts.into_iter().any(|from| {
            (0..4).any(|quarter| {
                let bodies = walk(&downs, from, f64::from(quarter) * std::f64::consts::FRAC_PI_2, 240);
                bodies.first().is_some_and(|first| first.z < building.at[2] + 1.0)
                    && bodies.iter().any(|body| {
                        let up = body.z - building.at[2] - measure.min[1];
                        body.mode == Mode::Ground && up > STOREY_M - 0.1 && up < STOREY_M + 0.3
                    })
            })
        });
        if !reached {
            blocked.push(format!("model {} at {:?}: no walk reaches its upper floor", building.model, building.at));
        }
    }
    assert!(upper > 5, "only {upper} buildings have an upper floor");
    assert!(blocked.is_empty(), "{blocked:#?}");
}
