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

/// What a run may fail by.
const FLOOR_RAISED: &str = "its floor raised by another's sculpt";
const BEAT_IN_WATER: &str = "a beat stands in water";
const WING_ON_WATER: &str = "its wing stands on water";
const STOPS_SHORT: &str = "stops short of its door";
const PAST_ITS_DOOR: &str = "a body gets past its door";

/// Where a body walks round the door across its face: the runs there wait on a choice of design, and only Saltmere's
/// zones have runs of their own yet.
const WALKS_ROUND: &str = "a body walks round the door across its face";
/// The failures known, each run with what it fails by and why, so a new one fails the test and one mended must be
/// taken off this list (`cargo test --release -p room --test runs_everywhere -- --nocapture` names them).
const KNOWN: [(&str, &str, &str); 2] = [
    ("continent-2: highwater-glen Test Ledge", STOPS_SHORT, "its way meets a face a body would climb"),
    ("continent-5: lion-grasslands Test Rampart", PAST_ITS_DOOR, WALKS_ROUND),
];

/// Every patrol zone of one continent given every run, and what fails: each run by name, what it fails by, and how far.
fn fails_on(only: &str) -> Vec<(String, &'static str, String)> {
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
    for continent in world.continents.into_iter().filter(|continent| continent.id == only) {
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
                failed.push((format!("{}: {}", continent.id, layout.id), FLOOR_RAISED, format!("{worst:.1} m")));
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
                        failed.push((name.clone(), BEAT_IN_WATER, String::new()));
                    }
                }
                // Its wing, the rock carried past the claim round it as the plan builds it from the claim, on dry land
                // too.
                if let Some([x1, y1, x2, y2, half]) = layout::runs::wing(run, &layout.sculpt.claim) {
                    let length = distance([x1, y1], [x2, y2]).max(1e-9);
                    let across = [-(y2 - y1) / length * half, (x2 - x1) / length * half];
                    let wet = (0..=40).flat_map(|along| (-8..=8).map(move |out| (along, out))).any(|(along, out)| {
                        let (share, side) = (f64::from(along) / 40.0, f64::from(out) / 8.0);
                        let at = [x1 + (x2 - x1) * share + across[0] * side, y1 + (y2 - y1) * share + across[1] * side];
                        ground.water_at(at[0], at[1]) != WaterAt::Dry
                    });
                    if wet {
                        failed.push((name.clone(), WING_ON_WATER, String::new()));
                    }
                }
                let way: Vec<[f64; 2]> = run.way().into_iter().skip(1).collect();
                let end = walked(&floor, &blocks, run.mouth, &way, 600.0);
                if distance(end, run.door) > AT_DOOR_M {
                    failed.push((name.clone(), STOPS_SHORT, format!("{:.1} m from its door", distance(end, run.door))));
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
                    failed.push((name.clone(), PAST_ITS_DOOR, format!("{worst:.0} m")));
                }
            }
        }
    }
    failed
}

/// One continent's runs fail by nothing but what `KNOWN` holds for it, and all of that still.
fn holds(continent: &str) {
    let failed = fails_on(continent);
    let unknown: Vec<_> = failed
        .iter()
        .filter(|(name, what, _)| !KNOWN.iter().any(|known| (known.0, known.1) == (name.as_str(), *what)))
        .collect();
    assert!(unknown.is_empty(), "{} failures not known: {unknown:#?}", unknown.len());
    let mended: Vec<_> = KNOWN
        .iter()
        .filter(|(name, _, _)| name.starts_with(&format!("{continent}: ")))
        .filter(|(name, what, _)| !failed.iter().any(|(each, its, _)| (each.as_str(), *its) == (*name, *what)))
        .collect();
    assert!(mended.is_empty(), "known failures mended, to be taken off KNOWN: {mended:#?}");
}

macro_rules! every_run_on {
    ($($test:ident: $continent:literal),* $(,)?) => {$(
        /// Every patrol zone of the continent given every run walks each to its door on dry land, raising no other
        /// floor, but for the failures `KNOWN` holds.
        #[test]
        fn $test() {
            holds($continent);
        }
    )*};
}

every_run_on!(
    runs_on_continent_1: "continent-1",
    runs_on_continent_2: "continent-2",
    runs_on_continent_3: "continent-3",
    runs_on_continent_4: "continent-4",
    runs_on_continent_5: "continent-5",
    runs_on_continent_6: "continent-6",
    runs_on_continent_7: "continent-7",
    runs_on_continent_8: "continent-8",
    runs_on_continent_9: "continent-9",
);
