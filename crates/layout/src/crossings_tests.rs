use super::*;
use crate::brief::{RunKind, RunPlace};
use crate::runs::Beat;

/// A run out from the zone's middle toward `way` (a unit vector): its mouth 50 m out, a beat at 150 m, its end
/// arena (24 m across) at 300 m, and its door 4 m past the arena's rim.
fn run(name: &str, way: [f64; 2]) -> Run {
    let out = |metres: f64| [way[0] * metres, way[1] * metres];
    let beats =
        vec![Beat { at: out(150.0), radius: 14.0, level: 0.0 }, Beat { at: out(300.0), radius: 24.0, level: 0.0 }];
    Run {
        name: name.into(),
        kind: RunKind::Gorge,
        place: RunPlace::Rock,
        area: 0,
        mouth: out(50.0),
        line: vec![out(50.0), out(150.0), out(300.0)],
        levels: vec![0.0; 3],
        beats,
        door: out(328.0),
        facing: way,
        ramp: None,
    }
}

fn link(id: &str, towards: [f64; 2]) -> Link {
    Link { id: id.into(), towards, patrol: true }
}

#[test]
fn each_zone_takes_the_run_whose_end_lies_most_nearly_toward_it_and_no_two_take_one() {
    let runs = [run("east", [1.0, 0.0]), run("south", [0.0, 1.0]), run("west", [-1.0, 0.0])];
    let mill = Link { id: "mill".into(), towards: [0.0, 500.0], patrol: false };
    let links = [mill.clone(), link("vale", [1000.0, 50.0]), link("moors", [-1000.0, 900.0])];
    assert_eq!(runs_of([0.0, 0.0], &links, &runs), [(1, 0), (2, 2)], "the Vale east, the Moors west");
    // Both nearest the east run: the nearer takes it, the other its next nearest.
    let links = [mill, link("vale", [1000.0, 200.0]), link("moors", [1000.0, 10.0])];
    assert_eq!(runs_of([0.0, 0.0], &links, &runs), [(1, 1), (2, 0)]);
    assert!(runs_of([0.0, 0.0], &links, &runs[..1]).len() == 1, "one run, one way across");
}

#[test]
fn where_the_runs_door_is_no_passages_mouth_the_door_is_the_way_across_a_step_inside_its_end_arena() {
    let runs = [run("The Weir Gorge", [1.0, 0.0]), run("The Hollow Undercroft", [-1.0, 0.0])];
    let across = plan("gullwing-vale", [0.0, 0.0], &[link("saltgrass-downs", [9000.0, 0.0])], &runs);
    assert_eq!(across.len(), 1);
    assert_eq!(across[0].leads_to, "saltgrass-downs");
    assert_eq!(across[0].run, 0);
    assert!(across[0].arches.is_empty());
    assert!((distance(across[0].at, runs[0].door) - STEP_M).abs() < 1e-9, "a step in from the door");
    assert!(distance(across[0].at, runs[0].beats[1].at) < distance(runs[0].door, runs[0].beats[1].at));
}

#[test]
fn where_the_runs_door_is_a_passages_mouth_a_second_arch_stands_in_its_end_arena_clear_of_its_way_and_door() {
    // The Downs' runs are named as its passages' mouths (content/passages/saltmere.json).
    let runs = [run("The Chalk Adit", [0.6, 0.8]), run("The Beacon Stair", [-1.0, 0.0])];
    let across = plan("saltgrass-downs", [0.0, 0.0], &[link("gullwing-vale", [600.0, 800.0])], &runs);
    let [way] = &across[..] else { panic!("one way across: {across:?}") };
    let (run, end) = (&runs[0], &runs[0].beats[1]);
    let Some(&Arch { door, facing: out, spot }) = way.arches.first() else { panic!("a second arch") };
    assert_eq!(way.at, spot);
    assert!(distance(door, end.at) + ARCH_IN_M - end.radius < 1e-9, "on the arena's floor");
    let toward_middle = [end.at[0] - door[0], end.at[1] - door[1]];
    assert!(out[0] * toward_middle[0] + out[1] * toward_middle[1] < 0.0, "facing into the arena");
    let offs: Vec<f64> = way.arches.iter().map(|arch| off_way(run, arch.spot)).collect();
    assert!(offs.windows(2).all(|pair| pair[0] >= pair[1]), "the furthest from the run's way first");
    assert!(off_way(run, way.at) > WAY_CLEAR_M && off_way(run, door) > WAY_CLEAR_M + FRAME_DEPTH_M / 2.0);
    assert!(distance(way.at, run.door) > 2.0 * REACH_M, "its reach and the mouth's never meet");
    assert!(distance(way.at, end.at) > REACH_M, "clear of the objective's spot");
    assert!(is_mouth("saltgrass-downs", "The Chalk Adit") && !is_mouth("gullwing-vale", "The Chalk Adit"));
}

#[test]
fn a_way_across_is_a_crossing_gate_and_a_gate_site_holding_its_zone_and_nothing_on_the_landing() {
    let landing = Area {
        kind: AreaKind::Landing,
        name: "Shingle".into(),
        at: [0.0, 0.0],
        radius: 48.0,
        leads_to: None,
        crosses: false,
    };
    let (mut areas, mut basins, mut sites) =
        (vec![landing], vec![Basin { floors: Vec::new(), terraces: Vec::new() }], Vec::new());
    let across = [Across { leads_to: "vale".into(), run: 0, at: [326.0, 0.0], arches: Vec::new() }];
    add(&across, (&mut areas, &mut basins), &mut sites);
    assert_eq!(basins.len(), areas.len());
    assert!(is_crossing(&areas[1]) && !is_crossing(&areas[0]));
    assert_eq!((areas[1].at, areas[1].radius, areas[1].leads_to.as_deref()), ([326.0, 0.0], REACH_M, Some("vale")));
    assert_eq!(sites.len(), 1);
    assert!(sites[0].kind == SiteKind::Gate && sites[0].holds.as_deref() == Some("vale"));
    assert!(basins[1].floors.is_empty() && basins[1].terraces.is_empty(), "no basin of its own");
    let other = Area { crosses: false, ..areas[1].clone() };
    assert!(!is_crossing(&other), "a gate unmarked is no way across");
}
