use super::*;
use crate::brief::AreaKind;
use crate::field::{CELL_M, Water, chamfer, distance, ring_holds};
use land::sculpts::{CLIFF_RUN_M, FADE_M, Sculpt};

const CLAIM_M: f64 = 750.0;

fn disc(radius: f64, at: [f64; 2]) -> Vec<[f64; 2]> {
    (0..48)
        .map(|step| {
            let (sine, cosine) = land::exact::sin_cos(std::f64::consts::TAU * f64::from(step) / 48.0);
            [at[0] + radius * cosine, at[1] + radius * sine]
        })
        .collect()
}

fn made_field(margin: f64) -> Field {
    let claim = disc(CLAIM_M, [0.0, 0.0]);
    let (west, north) = (-CLAIM_M - margin, -CLAIM_M - margin);
    let columns = (2.0 * (CLAIM_M + margin) / CELL_M).ceil() as usize;
    let count = columns * columns;
    let centre =
        |at: usize| [west + ((at % columns) as f64 + 0.5) * CELL_M, north + ((at / columns) as f64 + 0.5) * CELL_M];
    let claimed: Vec<bool> = (0..count).map(|at| ring_holds(&claim, centre(at)[0], centre(at)[1])).collect();
    let inside = chamfer(columns, columns, |at| !claimed[at]);
    Field {
        west,
        north,
        columns,
        rows: columns,
        height: vec![5.0; count],
        water: vec![Water::Dry; count],
        slope: vec![0.0; count],
        claimed,
        to_sea: vec![1e6; count],
        to_fresh: vec![1e6; count],
        inside,
        seaward: [0.0, -1.0],
    }
}

fn basin() -> (Vec<[f64; 2]>, Vec<Area>, Sculpts) {
    let claim = disc(CLAIM_M, [0.0, 0.0]);
    // A basin in the middle and two near the edge, east and north, as a zone's places spread over its claim.
    let middles = [[0.0, 0.0], [600.0, 0.0], [0.0, -600.0]];
    let areas: Vec<Area> = middles
        .iter()
        .map(|&at| Area { kind: AreaKind::Wilds, name: "The Wilds".into(), at, radius: 48.0, leads_to: None })
        .collect();
    let sculpt = Sculpt {
        claim: claim.clone(),
        floors: middles.iter().map(|at| [at[0], at[1], at[0], at[1], 80.0]).collect(),
        outcrops: Vec::new(),
        rise: 28.0,
        seed: 5,
        climbs: Vec::new(),
        runs: Vec::new(),
        wings: Vec::new(),
        levels: Vec::new(),
        terraced: false,
        roofed: Vec::new(),
    };
    (claim, areas, Sculpts::from(vec![sculpt]))
}

fn brief(kind: RunKind, place: RunPlace) -> RunBrief {
    RunBrief { name: "A Run".into(), kind, place }
}

/// Points every 4 m along a run's line, each with how far along it lies.
fn samples(run: &Run) -> Vec<([f64; 2], f64)> {
    let mut out = Vec::new();
    let mut along = 0.0;
    for pair in run.line.windows(2) {
        let length = distance(pair[0], pair[1]);
        let steps = (length / 4.0).ceil().max(1.0);
        for step in 0..steps as usize {
            let share = step as f64 / steps;
            let at = [pair[0][0] + (pair[1][0] - pair[0][0]) * share, pair[0][1] + (pair[1][1] - pair[0][1]) * share];
            out.push((at, along + length * share));
        }
        along += length;
    }
    out
}

fn length(run: &Run) -> f64 {
    run.line.windows(2).map(|pair| distance(pair[0], pair[1])).sum()
}

fn off_capsule(at: [f64; 2], capsule: &[f64; 7]) -> f64 {
    let ([x1, y1], [x2, y2]) = ([capsule[0], capsule[1]], [capsule[2], capsule[3]]);
    crate::paths::off_line(at, [x1, y1], [x2, y2]) - capsule[4]
}

fn one(kind: RunKind, place: RunPlace, field: &Field, avoid: &[Vec<[f64; 2]>]) -> Run {
    let (claim, areas, bare) = basin();
    let setting = Setting { field, claim: &claim, areas: &areas, bare: &bare, taken: &[], avoid, rise: 28.0 };
    let mut runs = find(&setting, &[brief(kind, place)], 9);
    assert_eq!(runs.len(), 1, "one run found");
    runs.remove(0)
}

#[test]
fn a_run_in_the_rock_stays_in_the_rock() {
    let field = made_field(60.0);
    let run = one(RunKind::Gorge, RunPlace::Rock, &field, &[]);
    let (_, _, bare) = basin();
    let long = length(&run);
    assert!((200.0..=400.0).contains(&long), "{long}");
    assert!((3..=5).contains(&run.beats.len()));
    let end = run.beats.last().map_or(0.0, |beat| beat.radius);
    assert!((20.0..=30.0).contains(&end), "the end arena is 40 to 60 m across: {end}");
    for beat in &run.beats {
        assert!((12.5..=30.0).contains(&beat.radius));
        assert!(bare.floor_distance(beat.at[0], beat.at[1]) >= beat.radius + CLIFF_RUN_M, "{beat:?}");
    }
    for (at, along) in samples(&run).into_iter().filter(|(_, along)| *along > 40.0) {
        assert!(bare.floor_distance(at[0], at[1]) >= CLIFF_RUN_M + 4.0, "{at:?} at {along}");
        assert!(field.inside[field.nearest(at[0], at[1])] >= 30.0, "{at:?} well inside the claim");
    }
}

#[test]
fn a_run_past_the_edge_ends_out_of_the_claim() {
    let field = made_field(520.0);
    let run = one(RunKind::Gorge, RunPlace::Beyond, &field, &[]);
    let out = distance(run.door, [0.0, 0.0]) - CLAIM_M;
    assert!(out >= 80.0, "the door stands {out} m past the ring");
    assert!(wing(&run, &disc(CLAIM_M, [0.0, 0.0])).is_some(), "and a wing carries the claim out to it");
}

#[test]
fn a_run_keeps_off_another_claim() {
    let field = made_field(520.0);
    let other = [CLAIM_M + 200.0 + 300.0, 0.0];
    let run = one(RunKind::Gorge, RunPlace::Beyond, &field, &[disc(300.0, other)]);
    let widest = run.beats.iter().map(|beat| beat.radius).fold(0.0, f64::max);
    for (at, _) in samples(&run) {
        assert!(distance(at, other) - 300.0 > FADE_M + widest, "{at:?}");
    }
}

#[test]
fn no_beat_sees_the_next_whole() {
    let field = made_field(60.0);
    let run = one(RunKind::Gorge, RunPlace::Rock, &field, &[]);
    let walls = capsules(&run, 3.5);
    for pair in run.beats.windows(2) {
        let blind = (1..40).any(|step| {
            let share = f64::from(step) / 40.0;
            let at = [
                pair[0].at[0] + (pair[1].at[0] - pair[0].at[0]) * share,
                pair[0].at[1] + (pair[1].at[1] - pair[0].at[1]) * share,
            ];
            walls.iter().all(|capsule| off_capsule(at, capsule) > 0.5)
        });
        assert!(blind, "rock stands between {:?} and {:?}", pair[0].at, pair[1].at);
    }
}

#[test]
fn two_runs_never_cross() {
    let field = made_field(60.0);
    let (claim, areas, bare) = basin();
    let setting =
        Setting { field: &field, claim: &claim, areas: &areas, bare: &bare, taken: &[], avoid: &[], rise: 28.0 };
    let wanted = [
        brief(RunKind::Gorge, RunPlace::Rock),
        brief(RunKind::Keep, RunPlace::Rock),
        brief(RunKind::Ledge, RunPlace::Rock),
    ];
    let runs = find(&setting, &wanted, 9);
    assert_eq!(runs.len(), 3);
    for (first, run) in runs.iter().enumerate() {
        for other in &runs[first + 1..] {
            let theirs = capsules(other, 3.5);
            for mine in capsules(run, 3.5) {
                for step in 0..=10 {
                    let share = f64::from(step) / 10.0;
                    let at = [mine[0] + (mine[2] - mine[0]) * share, mine[1] + (mine[3] - mine[1]) * share];
                    let apart = theirs.iter().map(|capsule| off_capsule(at, capsule)).fold(f64::INFINITY, f64::min);
                    assert!(apart - mine[4] > 2.0 * CLIFF_RUN_M, "{apart} at {at:?}");
                }
            }
        }
    }
}

#[test]
fn the_same_seed_finds_the_same_runs() {
    let field = made_field(60.0);
    let first = one(RunKind::Mine, RunPlace::Rock, &field, &[]);
    assert_eq!(first, one(RunKind::Mine, RunPlace::Rock, &field, &[]));
}
