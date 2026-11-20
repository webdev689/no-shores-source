//! Every patrol zone on every continent given a run of each of four kinds (a ledge and an undercroft in its rock, a
//! gorge and a rampart past its edge), as the other zones' briefs will one day name them: each run is walked to its
//! door and no further, none raises another node's floor, and none stands on water.

use land::ground::WaterAt;
use land::sculpts::Sculpts;
use layout::brief::{RunBrief, RunKind, RunPlace};
use layout::field::distance;
use movement::{Block, Blocks, Controls, Mode, TICK_SECONDS, step_body};
use room::{Floor, standing_on};
use std::path::Path;

/// How near its door a walked body must end, metres.
const AT_DOOR_M: f64 = 3.0;

fn walked(floor: &Floor, blocks: &Blocks, from: [f64; 2], waypoints: &[[f64; 2]], seconds: f64) -> [f64; 2] {
    let mut body = standing_on(floor, blocks, from[0], from[1]);
    let mut next = 0;
    for _ in 0..(seconds / TICK_SECONDS) as usize {
        let Some(target) = waypoints.get(next) else { break };
        let (east, south) = (target[0] - body.x, target[1] - body.y);
        if (east * east + south * south).sqrt() < 1.5 {
            next += 1;
            continue;
        }
        let controls = Controls { forward: 1.0, yaw: libm::atan2(east, -south), ..Controls::default() };
        body = step_body(&body, &controls, blocks, floor, TICK_SECONDS);
        // A body that climbs a face, or hangs or mantles, has not walked there: it stops short.
        if matches!(body.mode, Mode::Climb | Mode::Hang | Mode::Mantle) {
            break;
        }
    }
    [body.x, body.y]
}

#[test]
#[ignore = "about two minutes in release; and on the savanna, steppe, tundra and woodland a body still walks round some ledges' and ramparts' doors across their faces, and at highwater-glen a ledge's way meets a face a body would climb, which wait on the owner's call on the runs there"]
fn every_zone_given_every_run_walks_each_to_its_door_on_dry_land_raising_no_other_floor() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
    let wanted = [
        ("Test Ledge", RunKind::Ledge, RunPlace::Rock),
        ("Test Gorge", RunKind::Gorge, RunPlace::Beyond),
        ("Test Undercroft", RunKind::Undercroft, RunPlace::Rock),
        ("Test Rampart", RunKind::Rampart, RunPlace::Beyond),
    ]
    .map(|(name, kind, place)| RunBrief { name: name.into(), kind, place });
    let mut failed = Vec::new();
    // RUNS_CONTINENT=<id> lays out only that continent, to look into one.
    let only = std::env::var("RUNS_CONTINENT").ok();
    for continent in world.continents.into_iter().filter(|continent| only.as_ref().is_none_or(|id| *id == continent.id))
    {
        let Ok(text) = std::fs::read_to_string(root.join(format!("content/world/land/{}.json", continent.id))) else {
            continue;
        };
        let edits = land::edits::parse(&text).expect("the edits parse");
        let mut builders = bake::builders(&root).expect("the builders read");
        for node in edits.nodes.iter().filter(|node| node.kind == land::sites::NodeKind::Patrol) {
            let mut brief = builders.briefs.of(&node.id, node.kind);
            brief.runs = wanted.to_vec();
            builders.briefs.0.insert(node.id.clone(), brief);
        }
        let mut landmass = land::landmass::generate(&continent, edits).expect("the continent generates");
        city::settle(&mut landmass, &city).expect("its city settles");
        let layouts = layout::settle::settle(&mut landmass, &builders.book, &builders.briefs);
        let ground = &landmass.surface;
        // No layout's floor is raised by another's sculpt, its wings and their fade too.
        for layout in &layouts {
            let own = Sculpts::from(vec![layout.sculpt.clone()]);
            let mut worst = 0.0_f64;
            for &[x1, y1, x2, y2, _] in &layout.sculpt.floors {
                let steps = (distance([x1, y1], [x2, y2]) / 8.0).ceil().max(1.0) as usize;
                for step in 0..=steps {
                    let share = step as f64 / steps as f64;
                    let at = [x1 + (x2 - x1) * share, y1 + (y2 - y1) * share];
                    let coast = ground.coast.at(at[0], at[1]);
                    worst = worst.max(ground.sculpts.raise(at[0], at[1], coast) - own.raise(at[0], at[1], coast));
                }
            }
            if worst > 0.05 {
                failed.push(format!("{}: {}'s floor raised {worst:.1} m by another's sculpt", continent.id, layout.id));
            }
        }
        let floor = Floor::Land(Box::new(ground.clone()));
        for layout in layouts.iter().filter(|layout| !layout.runs.is_empty()) {
            let blocks = Blocks::new(layout.boxes.iter().map(Block::from_floats).collect());
            for run in &layout.runs {
                let name = format!("{}: {} {}", continent.id, layout.id, run.name);
                // Its beats' floors and its door on dry land.
                for beat in &run.beats {
                    let reach = beat.radius as i32;
                    let wet = (-reach..=reach)
                        .step_by(2)
                        .flat_map(|east| (-reach..=reach).step_by(2).map(move |south| (east, south)));
                    let wet = wet
                        .filter(|&(east, south)| f64::from(east * east + south * south).sqrt() <= beat.radius)
                        .any(|(east, south)| {
                            ground.water_at(beat.at[0] + f64::from(east), beat.at[1] + f64::from(south)) != WaterAt::Dry
                        });
                    if wet {
                        failed.push(format!("{name}: a beat stands in water"));
                    }
                }
                // Its wing, the rock carried past the claim round it, on dry land too.
                if let Some([x1, y1, x2, y2, half]) = layout::runs::wing(run, &layout.ring) {
                    let length = distance([x1, y1], [x2, y2]).max(1e-9);
                    let across = [-(y2 - y1) / length * half, (x2 - x1) / length * half];
                    let wet = (0..=40).flat_map(|along| (-8..=8).map(move |out| (along, out))).any(|(along, out)| {
                        let (share, side) = (f64::from(along) / 40.0, f64::from(out) / 8.0);
                        let at = [x1 + (x2 - x1) * share + across[0] * side, y1 + (y2 - y1) * share + across[1] * side];
                        ground.water_at(at[0], at[1]) != WaterAt::Dry
                    });
                    if wet {
                        failed.push(format!("{name}: its wing stands on water"));
                    }
                }
                let way: Vec<[f64; 2]> = run.way().into_iter().skip(1).collect();
                let end = walked(&floor, &blocks, run.mouth, &way, 600.0);
                if distance(end, run.door) > AT_DOOR_M {
                    failed.push(format!("{name}: stops {:.1} m from its door", distance(end, run.door)));
                    continue;
                }
                let across = [-run.facing[1], run.facing[0]];
                let worst = (-3..=3)
                    .map(|lateral| {
                        let lateral = f64::from(lateral) * 10.0;
                        let target = [
                            run.door[0] + run.facing[0] * 120.0 + across[0] * lateral,
                            run.door[1] + run.facing[1] * 120.0 + across[1] * lateral,
                        ];
                        let pressed = walked(&floor, &blocks, end, &[target], 40.0);
                        (pressed[0] - run.door[0]) * run.facing[0] + (pressed[1] - run.door[1]) * run.facing[1]
                    })
                    .fold(f64::NEG_INFINITY, f64::max);
                // A body pressed at the door's face may slide a few metres along it.
                if worst > 6.0 {
                    failed.push(format!("{name}: a body gets {worst:.0} m past its door"));
                }
            }
        }
    }
    assert!(failed.is_empty(), "{} problems: {failed:#?}", failed.len());
}
