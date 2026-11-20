//! Saltmere's runs as the bake plans them: each zone's three runs are carved into its land, held in its section and
//! walked as its ways, and no other node's layout or land changes for them.

use land::sculpts::Sculpts;
use layout::brief::Briefs;
use layout::field::ring_holds;
use layout::paths::Tier;
use layout::sites::SiteKind;
use std::path::Path;

const ZONES: [&str; 3] = ["saltgrass-downs", "gullwing-vale", "driftwood-moors"];

/// Continent 1's layouts as the bake settles them with these briefs, its nodes' claims and its ground as laid.
fn continent_one(briefs: &Briefs) -> (Vec<layout::Layout>, Vec<Vec<[f64; 2]>>, land::ground::Ground) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let continent = world.continents.into_iter().find(|continent| continent.id == "continent-1").expect("continent-1");
    let edits = land::edits::parse(&read("content/world/land/continent-1.json")).expect("the edits parse");
    let claims =
        edits.nodes.iter().map(|node| node.ring.iter().map(|point| [point.x as f64, point.y as f64]).collect());
    let claims = claims.collect();
    let builders = bake::builders(&root).expect("the builders read");
    let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
    let mut landmass = land::landmass::generate(&continent, edits).expect("continent-1 generates");
    city::settle(&mut landmass, &city).expect("its city settles");
    let layouts = layout::settle::settle(&mut landmass, &builders.book, briefs);
    (layouts, claims, landmass.surface)
}

fn briefs() -> Briefs {
    bake::builders(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")).expect("the builders read").briefs
}

#[test]
fn saltmeres_runs_are_planned_and_open() {
    let (layouts, _, _) = continent_one(&briefs());
    for id in ZONES {
        let laid = layouts.iter().find(|layout| layout.id == id).expect("the zone lays out");
        assert_eq!(laid.runs.len(), 3, "{id} has its three runs");
        for run in &laid.runs {
            let held = |at: [f64; 2]| ring_holds(&laid.ring, at[0], at[1]);
            for beat in &run.beats {
                assert!(held(beat.at), "{id}: {}'s beat at {:?} is in the section", run.name, beat.at);
            }
            // The door stands 4 m past the end arena's floor, and the section is traced on 8 m cells.
            let before = [run.door[0] - run.facing[0] * 12.0, run.door[1] - run.facing[1] * 12.0];
            let past = [run.door[0] + run.facing[0] * 25.0, run.door[1] + run.facing[1] * 25.0];
            assert!(held(before), "{id}: {}'s door stands at the section's edge", run.name);
            assert!(!held(past), "{id}: {}'s section ends at its door", run.name);
            let walked = laid.paths.iter().any(|path| path.tier == Tier::Footpath && path.points == run.line);
            assert!(walked, "{id}: {} is walked as a footpath", run.name);
            let marked = |kind: SiteKind| {
                laid.sites.iter().any(|site| site.kind == kind && site.holds.as_deref() == Some(run.name.as_str()))
            };
            assert!(marked(SiteKind::Objective) && marked(SiteKind::Door), "{id}: {}'s end and door", run.name);
        }
    }
}

#[test]
fn the_other_nodes_are_planned_as_before_and_no_run_raises_their_land() {
    let briefs = briefs();
    let mut bare = briefs.clone();
    for id in ZONES {
        if let Some(brief) = bare.0.get_mut(id) {
            brief.runs.clear();
        }
    }
    let (with, claims, _) = continent_one(&briefs);
    let (without, _, _) = continent_one(&bare);
    for (now, was) in with.iter().zip(&without) {
        if !ZONES.contains(&now.id.as_str()) {
            let [now_text, was_text] = [now, was].map(|laid| serde_json::to_string(laid).unwrap_or_default());
            assert!(now_text == was_text, "{} is planned as before", now.id);
        }
    }
    let carved = |layouts: &[layout::Layout]| {
        let ours = layouts.iter().filter(|laid| ZONES.contains(&laid.id.as_str()));
        Sculpts::from(ours.map(|laid| laid.sculpt.clone()).collect::<Vec<_>>())
    };
    let (raised, plain) = (carved(&with), carved(&without));
    for (claim, laid) in claims.iter().zip(&with) {
        if ZONES.contains(&laid.id.as_str()) {
            continue;
        }
        for &[x, y] in claim {
            let (now, was) = (raised.raise(x, y, 1000.0), plain.raise(x, y, 1000.0));
            assert!(now <= was + 1e-9, "{}'s claim at {x},{y} is raised {now} by a run (was {was})", laid.id);
        }
    }
}

/// A check of one run: its layout, the run, and the ground's height under a point.
type RunCheck<'a> = &'a dyn Fn(&layout::Layout, &layout::runs::Run, &dyn Fn([f64; 2]) -> f64);

/// Each run of Saltmere's zones with its layout, its boxes and the ground's height under a point.
fn each_run(check: RunCheck) {
    let (layouts, _, ground) = continent_one(&briefs());
    let floor = |at: [f64; 2]| ground.height_at(at[0], at[1]);
    for laid in layouts.iter().filter(|laid| ZONES.contains(&laid.id.as_str())) {
        for run in &laid.runs {
            check(laid, run, &floor);
        }
    }
}

/// How far a point lies from a box's footprint, metres (0 inside it).
fn off_box(at: [f64; 2], b: &[f64; 6]) -> f64 {
    let across = (b[0] - at[0]).max(0.0).max(at[0] - b[2]);
    let down = (b[1] - at[1]).max(0.0).max(at[1] - b[3]);
    (across * across + down * down).sqrt()
}

/// Points of a beat's floor every 3 m, kept 2 m inside its edge.
fn floor_of(beat: &layout::runs::Beat) -> Vec<[f64; 2]> {
    let reach = (beat.radius - 2.0).max(0.0);
    let steps = (reach / 3.0).floor() as i32;
    let mut points = Vec::new();
    for column in -steps..=steps {
        for row in -steps..=steps {
            let (x, y) = (f64::from(column) * 3.0, f64::from(row) * 3.0);
            if (x * x + y * y).sqrt() <= reach {
                points.push([beat.at[0] + x, beat.at[1] + y]);
            }
        }
    }
    points
}

#[test]
fn cover_stands_within_ten_metres_on_every_beat() {
    each_run(&|laid, run, floor| {
        for beat in &run.beats {
            // Cover is a box standing on its own ground and at least 0.9 m over it, near enough the beat to count.
            let cover: Vec<&[f64; 6]> = laid
                .boxes
                .iter()
                .filter(|b| off_box(beat.at, b) <= beat.radius + 10.0)
                .filter(|b| {
                    let under = floor([(b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0]);
                    b[5] <= under + 0.6 && b[4] >= under + 0.9
                })
                .collect();
            for at in floor_of(beat) {
                let nearest = cover.iter().map(|b| off_box(at, b)).fold(f64::INFINITY, f64::min);
                assert!(nearest <= 10.0, "{}: {} has no cover within 10 m of {at:?} ({nearest})", laid.id, run.name);
            }
        }
    });
}

#[test]
fn a_ledges_and_a_ramparts_cover_is_broken_masonry_of_more_than_one_form() {
    each_run(&|laid, run, floor| {
        if !matches!(run.kind, layout::brief::RunKind::Ledge | layout::brief::RunKind::Rampart) {
            return;
        }
        // Each piece of cover on the run's beats by its form: its shape, its stone and its length to the metre.
        let mut forms: std::collections::BTreeMap<String, usize> = std::collections::BTreeMap::new();
        for solid in &laid.seating.solids {
            let [west, north, east, south, bottom, top] = solid.bounds();
            let middle = [(west + east) / 2.0, (north + south) / 2.0];
            let on = run.beats.iter().any(|beat| layout::field::distance(middle, beat.at) < beat.radius - 1.0);
            let under = floor(middle);
            if !on || bottom > under || !(under + 0.9..under + 2.6).contains(&top) {
                continue;
            }
            let long = solid.size[0].max(solid.size[1]).round();
            *forms.entry(format!("{:?} {:?} {long}", solid.shape, solid.material)).or_default() += 1;
        }
        let pieces: usize = forms.values().sum();
        let most = forms.values().copied().max().unwrap_or(0);
        assert!(
            pieces >= 6 && most * 2 <= pieces,
            "{}: {}'s cover is one form over half its {pieces} pieces: {forms:?}",
            laid.id,
            run.name
        );
    });
}

#[test]
fn every_beat_has_a_raised_place() {
    each_run(&|laid, run, floor| {
        for beat in &run.beats {
            let ground = floor(beat.at);
            let within = |b: &&[f64; 6]| off_box(beat.at, b) <= beat.radius;
            let platforms: Vec<&[f64; 6]> = laid
                .boxes
                .iter()
                .filter(within)
                .filter(|b| (ground + 1.2..=ground + 4.0).contains(&b[4]) && b[2] - b[0] >= 2.0 && b[3] - b[1] >= 2.0)
                .collect();
            let stepped = platforms.iter().any(|platform| {
                let steps = laid.boxes.iter().filter(|b| {
                    let middle = [(b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0];
                    off_box(middle, platform) <= 4.0 && b[4] > ground + 0.2 && b[4] < platform[4] - 0.2
                });
                steps.count() >= 2
            });
            assert!(stepped, "{}: {}'s beat at {:?} has a raised place with steps up", laid.id, run.name, beat.at);
        }
    });
}

#[test]
fn nothing_stands_on_a_runs_line() {
    each_run(&|laid, run, floor| {
        // What a body climbs on its way (an undercroft's chapel floor and stairs) is walked in runs_walked.rs.
        let climbed = layout::run_climbs::climb(run).map(|climb| climb.print);
        // Its line, and on from its end beat's middle to its door.
        for pair in run.way().windows(2) {
            let length = layout::field::distance(pair[0], pair[1]);
            let steps = (length / 2.0).ceil().max(1.0) as usize;
            for step in 0..=steps {
                let share = step as f64 / steps as f64;
                let at =
                    [pair[0][0] + (pair[1][0] - pair[0][0]) * share, pair[0][1] + (pair[1][1] - pair[0][1]) * share];
                if climbed.is_some_and(|print| layout::run_climbs::off_print(print, at) < 1.2) {
                    continue;
                }
                let ground = floor(at);
                let blocking =
                    laid.boxes.iter().find(|b| b[5] < ground + 2.0 && b[4] > ground + 0.4 && off_box(at, b) < 1.2);
                assert!(blocking.is_none(), "{}: {} is blocked at {at:?} by {blocking:?}", laid.id, run.name);
            }
        }
    });
}

#[test]
fn a_ledge_climbs_most_of_the_massif() {
    each_run(&|laid, run, floor| {
        if run.kind == layout::brief::RunKind::Ledge {
            let (mouth, end) = (floor(run.mouth), run.beats.last().map_or(0.0, |beat| floor(beat.at)));
            assert!(end - mouth >= 0.35 * laid.sculpt.rise, "{}: {} climbs {} m", laid.id, run.name, end - mouth);
        }
    });
}

/// Points every 2 m along a run's line.
fn along(run: &layout::runs::Run) -> Vec<[f64; 2]> {
    let mut points = Vec::new();
    for pair in run.line.windows(2) {
        let steps = (layout::field::distance(pair[0], pair[1]) / 2.0).ceil().max(1.0) as usize;
        for step in 0..steps {
            let share = step as f64 / steps as f64;
            points
                .push([pair[0][0] + (pair[1][0] - pair[0][0]) * share, pair[0][1] + (pair[1][1] - pair[0][1]) * share]);
        }
    }
    points
}

#[test]
fn a_building_runs_ceilings_stand_clear_and_its_passages_are_roofed() {
    each_run(&|laid, run, floor| {
        if !run.kind.building() {
            return;
        }
        let mut roofed = 0;
        let points = along(run);
        for &at in &points {
            let ground = floor(at);
            let over: Vec<&[f64; 6]> = laid
                .boxes
                .iter()
                .filter(|b| off_box(at, b) < 0.4 && b[5] > ground + 0.4 && b[5] < ground + 12.0)
                .collect();
            for b in &over {
                assert!(
                    b[5] >= ground + 2.6,
                    "{}: {}'s ceiling at {at:?} is {} m up",
                    laid.id,
                    run.name,
                    b[5] - ground
                );
            }
            roofed += usize::from(!over.is_empty());
        }
        assert!(
            roofed * 2 >= points.len(),
            "{}: {} is roofed over {roofed} of {} points",
            laid.id,
            run.name,
            points.len()
        );
    });
}

#[test]
fn a_halls_rooms_and_pillars_stand_on_their_beats_floor() {
    each_run(&|laid, run, floor| {
        if !run.kind.building() {
            return;
        }
        // How far a point lies past a beat's rim.
        let past = |at: [f64; 2], beat: &layout::runs::Beat| layout::field::distance(at, beat.at) - beat.radius;
        for beat in &run.beats {
            let ground = floor(beat.at);
            // A piece is a beat's when its middle stands within half the face's run past the beat's rim, nearer it than
            // another beat's or the door (set in the face).
            let ours = |at: [f64; 2]| {
                let off = past(at, beat);
                off < land::sculpts::CLIFF_RUN_M / 2.0
                    && off <= layout::field::distance(at, run.door)
                    && run.beats.iter().all(|other| past(at, other) >= off)
            };
            // A room's walls and a pillar stand from 0.4 m under their beat's floor.
            let standing = laid.seating.solids.iter().filter(|solid| {
                let [west, north, east, south, bottom, top] = solid.bounds();
                matches!(solid.shape, city::solids::Shape::Block | city::solids::Shape::Column { .. })
                    && (bottom - (ground - 0.4)).abs() < 0.15
                    && top > bottom + 3.0
                    && ours([(west + east) / 2.0, (north + south) / 2.0])
            });
            // Each stands on the beat's flat floor, short of the face, and a room's pillars stand inside its walls.
            for solid in standing {
                let [west, north, east, south, ..] = solid.bounds();
                let room = beat.radius * layout::run_halls::ROOM_SHARE;
                let out = (west - beat.at[0])
                    .abs()
                    .max((east - beat.at[0]).abs())
                    .max((north - beat.at[1]).abs())
                    .max((south - beat.at[1]).abs());
                let pillar = matches!(solid.shape, city::solids::Shape::Column { .. });
                assert!(
                    !(pillar && layout::run_halls::roomed(run.kind)) || out < room,
                    "{}: {}'s pillar at {:?} stands outside its room on its beat at {:?}",
                    laid.id,
                    run.name,
                    solid.at,
                    beat.at
                );
                for corner in [[west, north], [east, north], [east, south], [west, south]] {
                    let up = floor(corner) - ground;
                    assert!(
                        up <= 0.5,
                        "{}: {}'s {:?} at {:?} on its beat at {:?} stands {up:.2} m up the face at {corner:?}",
                        laid.id,
                        run.name,
                        solid.shape,
                        solid.at,
                        beat.at
                    );
                }
            }
        }
    });
}

/// The point of a run's line nearest a point.
fn nearest_on(line: &[[f64; 2]], at: [f64; 2]) -> [f64; 2] {
    let on = |pair: &[[f64; 2]]| {
        let span = [pair[1][0] - pair[0][0], pair[1][1] - pair[0][1]];
        let length = (span[0] * span[0] + span[1] * span[1]).max(1e-12);
        let share = (((at[0] - pair[0][0]) * span[0] + (at[1] - pair[0][1]) * span[1]) / length).clamp(0.0, 1.0);
        [pair[0][0] + span[0] * share, pair[0][1] + span[1] * share]
    };
    line.windows(2).map(on).fold(line[0], |best, point| {
        if layout::field::distance(point, at) < layout::field::distance(best, at) { point } else { best }
    })
}

#[test]
fn a_building_runs_walls_beside_its_way_stand_on_its_floor() {
    each_run(&|laid, run, floor| {
        if !run.kind.building() {
            return;
        }
        // A wall beside the way stands from under the floor beside it (a passage's from under its lower end) and
        // rises past head height; each of its corners stands on that floor, not up the face past it.
        for solid in &laid.seating.solids {
            let [west, north, east, south, bottom, top] = solid.bounds();
            let middle = [(west + east) / 2.0, (north + south) / 2.0];
            let on = nearest_on(&run.line, middle);
            let local = floor(on);
            let beside = layout::field::distance(middle, on) <= 8.0;
            let standing = bottom <= local - 0.25 && bottom >= local - 3.5 && top > local + 3.0;
            if !matches!(solid.shape, city::solids::Shape::Block) || !beside || !standing {
                continue;
            }
            for corner in [[west, north], [east, north], [east, south], [west, south]] {
                let up = floor(corner) - floor(nearest_on(&run.line, corner));
                assert!(
                    up <= 0.5,
                    "{}: {}'s wall at {:?} stands {up:.2} m up the face at {corner:?}",
                    laid.id,
                    run.name,
                    solid.at
                );
            }
        }
    });
}

/// Each solid of a layout as a box (west, north, east, south, top, bottom), whether or not the section reaches it.
fn solids_of(laid: &layout::Layout) -> Vec<[f64; 6]> {
    let boxed = |solid: &city::solids::Solid| {
        let [west, north, east, south, bottom, top] = solid.bounds();
        [west, north, east, south, top, bottom]
    };
    laid.seating.solids.iter().map(boxed).collect()
}

/// Whether two footprints (west, north, east, south first) overlap.
fn overlapping(first: &[f64], second: &[f64]) -> bool {
    first[0] < second[2] && second[0] < first[2] && first[1] < second[3] && second[1] < first[3]
}

#[test]
fn a_gorges_fallen_bridge_stands_out_of_both_its_walls() {
    each_run(&|laid, run, floor| {
        if run.kind != layout::brief::RunKind::Gorge {
            return;
        }
        let beat = &run.beats[run.beats.len() / 2];
        let bottom = floor(beat.at) + 7.5;
        // The bridge's two ends: its deck's stone, 1.2 m thick, standing at the deck's height over the beat.
        let ends: Vec<[f64; 6]> = solids_of(laid)
            .into_iter()
            .filter(|b| (b[5] - bottom).abs() < 0.01 && (b[4] - b[5] - 1.2).abs() < 0.01)
            .filter(|b| off_box(beat.at, b) < beat.radius + 40.0)
            .collect();
        let bridge = format!("{}: {}'s bridge at {:?}", laid.id, run.name, beat.at);
        assert_eq!(ends.len(), 2, "{bridge} keeps both its ends: {ends:?}");
        for end in ends {
            // Rock as high as its top somewhere under it, every half metre over its footprint.
            let steps =
                |low: f64, high: f64| (0..=((high - low) / 0.5) as i32).map(move |step| low + f64::from(step) * 0.5);
            let set = steps(end[0], end[2]).any(|x| steps(end[1], end[3]).any(|y| floor([x, y]) >= end[4]));
            assert!(set, "{bridge}: the end {end:?} is set into no rock");
        }
    });
}

#[test]
fn every_cavern_slab_is_carried() {
    each_run(&|laid, run, floor| {
        if run.kind != layout::brief::RunKind::Mine {
            return;
        }
        for beat in &run.beats {
            let underside = floor(beat.at) + layout::run_halls::ROOF_UP_M;
            let solids = solids_of(laid);
            let near: Vec<&[f64; 6]> = solids.iter().filter(|b| off_box(beat.at, b) <= beat.radius + 8.0).collect();
            let slabs: Vec<&[f64; 6]> = near
                .iter()
                .copied()
                .filter(|b| (b[5] - underside).abs() < 0.2 && b[2] - b[0] >= 4.0 && b[3] - b[1] >= 4.0)
                .collect();
            let cavern = format!("{}: {}'s cavern at {:?}", laid.id, run.name, beat.at);
            assert!(!slabs.is_empty(), "{cavern} is roofed");
            // Points 0.25 m inside a box's footprint along its edges, every half metre.
            let edges = |b: &[f64; 6]| {
                let ([west, north], [east, south]) = ([b[0] + 0.25, b[1] + 0.25], [b[2] - 0.25, b[3] - 0.25]);
                let mut points = Vec::new();
                let (across, down) = (((east - west) / 0.5).ceil() as i32, ((south - north) / 0.5).ceil() as i32);
                for step in 0..=across {
                    let x = west + (east - west) * f64::from(step) / f64::from(across);
                    points.extend([[x, north], [x, south]]);
                }
                for step in 0..=down {
                    let y = north + (south - north) * f64::from(step) / f64::from(down);
                    points.extend([[west, y], [east, y]]);
                }
                points
            };
            for slab in slabs {
                // A rib's or a pillar's top at the slab's underside, under its edge: in its footprint, not wholly
                // half a metre inside its edge.
                let inner = [slab[0] + 0.5, slab[1] + 0.5, slab[2] - 0.5, slab[3] - 0.5];
                let carried = near.iter().any(|b| {
                    (b[4] - slab[5]).abs() <= 0.5
                        && b[5] < slab[5] - 0.3
                        && overlapping(&b[..], &slab[..])
                        && !(b[0] >= inner[0] && b[1] >= inner[1] && b[2] <= inner[2] && b[3] <= inner[3])
                });
                let on_rock = edges(slab).into_iter().any(|at| floor(at) >= slab[5] - 0.5);
                assert!(
                    carried || on_rock,
                    "{cavern}: the roof slab {slab:?} has no rib, pillar or rock under its edge"
                );
            }
            // A rib (a beam under the roof, not a pillar from the floor) springs at either end from the rock or a
            // pillar.
            for rib in near.iter().filter(|b| (b[4] - underside).abs() < 0.2 && b[5] > underside - 3.0) {
                let (long, wide) = ((rib[2] - rib[0]).max(rib[3] - rib[1]), (rib[2] - rib[0]).min(rib[3] - rib[1]));
                if long < 3.0 || wide > 2.0 {
                    continue;
                }
                let middle = [(rib[0] + rib[2]) / 2.0, (rib[1] + rib[3]) / 2.0];
                let ends = if rib[2] - rib[0] > rib[3] - rib[1] {
                    [[rib[0] + 0.25, middle[1]], [rib[2] - 0.25, middle[1]]]
                } else {
                    [[middle[0], rib[1] + 0.25], [middle[0], rib[3] - 0.25]]
                };
                for end in ends {
                    let on_rock = floor(end) >= rib[5] - 0.5;
                    let on_pillar = near.iter().any(|b| b[5] < rib[5] - 3.0 && b[4] >= rib[5] && off_box(end, b) < 0.5);
                    assert!(on_rock || on_pillar, "{cavern}: the rib {rib:?} springs from nothing at {end:?}");
                }
            }
        }
    });
}

#[test]
fn no_loose_rock_lies_in_a_runs_stone_or_on_its_climb() {
    let (layouts, _, _) = continent_one(&briefs());
    let mut found = Vec::new();
    for laid in &layouts {
        // Loose rock is rubble tipped as it fell; what a run built stands upright.
        let loose = |solid: &&city::solids::Solid| {
            solid.material == city::solids::Material::Rubble && (solid.lean != 0.0 || solid.roll != 0.0)
        };
        let rocks: Vec<[f64; 6]> = laid.seating.solids.iter().filter(loose).map(|solid| solid.bounds()).collect();
        let built: Vec<[f64; 6]> =
            laid.seating.solids.iter().filter(|solid| !loose(solid)).map(|solid| solid.bounds()).collect();
        for run in &laid.runs {
            let reach = land::sculpts::CLIFF_RUN_M;
            let half = layout::runs::half_of(run.kind);
            let ours = |b: &[f64; 6]| {
                let middle = [(b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0];
                run.beats.iter().any(|beat| layout::field::distance(middle, beat.at) <= beat.radius + reach)
                    || run
                        .way()
                        .windows(2)
                        .any(|pair| layout::paths::off_line(middle, pair[0], pair[1]) <= half + reach)
            };
            let stone: Vec<&[f64; 6]> = built.iter().filter(|b| ours(b)).collect();
            let climb = layout::run_climbs::climb(run).map(|climb| climb.print);
            for rock in &rocks {
                // Boxes as `Solid::bounds` gives them: west, north, east, south, bottom, top.
                let meets = |b: &[f64; 6]| overlapping(&rock[..], &b[..]) && rock[4] < b[5] && b[4] < rock[5];
                if stone.iter().any(|b| meets(b)) || climb.is_some_and(|print| overlapping(&rock[..], &print[..])) {
                    found.push(format!("{}: {} at {:?}", laid.id, run.name, [rock[0], rock[1], rock[4]]));
                }
            }
        }
    }
    assert!(
        found.is_empty(),
        "{} loose rocks lie in a run's stone or on its climb: {:#?}",
        found.len(),
        &found[..found.len().min(10)]
    );
}

#[test]
fn a_ramparts_way_along_the_top_is_walled_on_both_sides() {
    each_run(&|laid, run, floor| {
        if run.kind != layout::brief::RunKind::Rampart {
            return;
        }
        let in_beat =
            |at: [f64; 2]| run.beats.iter().any(|beat| layout::field::distance(at, beat.at) <= beat.radius + 0.1);
        let (mut walled, mut checked) = (0, 0);
        for (pair, levels) in run.line.windows(2).zip(run.levels.windows(2)) {
            if levels[0] < 0.95 || levels[1] < 0.95 || (in_beat(pair[0]) && in_beat(pair[1])) {
                continue;
            }
            let length = layout::field::distance(pair[0], pair[1]);
            let (way, across) = (
                [(pair[1][0] - pair[0][0]) / length, (pair[1][1] - pair[0][1]) / length],
                [-(pair[1][1] - pair[0][1]) / length, (pair[1][0] - pair[0][0]) / length],
            );
            let mut along = 4.0;
            while along <= length - 4.0 {
                let at = [pair[0][0] + way[0] * along, pair[0][1] + way[1] * along];
                let ground = floor(at);
                let side_walled = |side: f64| {
                    (2..=6).any(|out| {
                        let spot =
                            [at[0] + across[0] * side * f64::from(out), at[1] + across[1] * side * f64::from(out)];
                        laid.boxes
                            .iter()
                            .any(|b| off_box(spot, b) < 1.0 && b[4] >= ground + 2.0 && b[5] <= ground + 0.6)
                    })
                };
                walled += usize::from(side_walled(1.0) && side_walled(-1.0));
                checked += 1;
                along += 2.0;
            }
        }
        assert!(checked > 0, "{}: {} runs along the top somewhere", laid.id, run.name);
        assert!(
            walled * 10 >= checked * 6,
            "{}: {} is walled both sides at {walled} of {checked} points",
            laid.id,
            run.name
        );
    });
}

#[test]
fn a_keeps_walls_are_battlemented_and_windowed() {
    each_run(&|laid, run, floor| {
        if run.kind != layout::brief::RunKind::Keep {
            return;
        }
        let climbed = layout::run_climbs::climb(run).and_then(|climb| climb.side);
        for (number, beat) in run.beats.iter().enumerate() {
            let ward = number + 1 == run.beats.len();
            let ground = floor(beat.at);
            // The middle of the room's walls, as far from the beat's middle along either axis.
            let wall = beat.radius * layout::run_halls::ROOM_SHARE + 0.4;
            let out = |at: [f64; 2]| (at[0] - beat.at[0]).abs().max((at[1] - beat.at[1]).abs());
            let merlons: Vec<f64> = laid
                .boxes
                .iter()
                .filter(|b| (b[4] - b[5] - 1.2).abs() < 0.05 && b[5] > ground + 5.0 && b[5] < ground + 10.0)
                .map(|b| out([(b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0]))
                .filter(|off| (off - wall).abs() < 0.5)
                .collect();
            let room = format!("{}: {}'s room at {:?}", laid.id, run.name, beat.at);
            assert!(merlons.len() as f64 >= 8.0 * wall / 2.0 * 0.8, "{room} has {} merlons", merlons.len());
            assert!(merlons.iter().all(|off| *off > wall), "{room}: merlons stand on the walls' outer halves");
            // A window: open at 2 m over the floor, walled under its sill, where the wall's middle runs.
            let solid = |at: [f64; 2], z: f64| {
                laid.boxes
                    .iter()
                    .any(|b| b[0] <= at[0] && at[0] <= b[2] && b[1] <= at[1] && at[1] <= b[3] && b[5] <= z && z <= b[4])
            };
            for (side, [x, y]) in [[0.0, -1.0], [1.0, 0.0], [0.0, 1.0], [-1.0, 0.0]].into_iter().enumerate() {
                let windows = (-40..=40)
                    .map(|step| f64::from(step) / 40.0 * (wall - 1.0))
                    .map(|along| [beat.at[0] + x * wall - y * along, beat.at[1] + y * wall + x * along])
                    .filter(|&at| solid(at, ground + 0.6) && !solid(at, ground + 2.0))
                    .count();
                let blind = ward && climbed == Some(side);
                assert!(blind || windows > 0, "{room} has no window in its wall {side}");
            }
            if ward {
                for corner in [[-1.0, -1.0], [1.0, -1.0], [1.0, 1.0], [-1.0, 1.0]] {
                    let at = [beat.at[0] + corner[0] * wall, beat.at[1] + corner[1] * wall];
                    let turret = laid.seating.solids.iter().any(|solid| {
                        matches!(solid.shape, city::solids::Shape::Column { .. })
                            && layout::field::distance([solid.at[0], solid.at[1]], at) < 0.5
                            && solid.at[2] + solid.size[2] > ground + 9.6 + 1.0
                    });
                    assert!(turret, "{room}: a turret taller than the wall stands at its corner {corner:?}");
                }
            }
        }
    });
}
